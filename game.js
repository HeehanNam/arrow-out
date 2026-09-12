'use strict';
const Engine = window.ArrowEngine;
const $ = selector => document.querySelector(selector);
const board = $('#board');
const storage = {
  get(key, fallback = null) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* Storage is optional. */ } },
  json(key, fallback) { try { return JSON.parse(this.get(key)) ?? fallback; } catch { return fallback; } }
};
const clampLevel = value => Math.max(1, Math.min(100, Math.floor(Number(value) || 1)));
const savedLevel = clampLevel(storage.get('arrowOutLevel', 1));
const state = {
  level: savedLevel, highestUnlocked: Math.max(savedLevel, clampLevel(storage.get('arrowOutUnlocked', 1))),
  records: storage.json('arrowOutRecords-v2', {}), phase: 'loading', locked: true,
  puzzle: null, pieces: [], moves: 0, mistakes: 0, hintsUsed: 0,
  hints: 3, timeRemaining: 0, runId: 0, zoom: 1,
  sound: storage.get('arrowOutSound') !== 'off'
};
let campaign;
const modeNames = { classic: '클래식', moves: '횟수 제한', time: '타임어택' };
const shapeNames = { square: '스퀘어', diamond: '다이아몬드', heart: '하트', hexagon: '헥사곤', circle: '오빗' };
const directionNames = { right: '오른쪽', left: '왼쪽', up: '위쪽', down: '아래쪽' };
const pathData = points => points.map((p, i) => `${i ? 'L' : 'M'}${p.c + .5} ${p.r + .5}`).join(' ');
const svg = (tag, attributes = {}) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
};

function saveRun() {
  if (!state.puzzle) return;
  storage.set('arrowOutRun-v2', JSON.stringify({
    version: campaign.version, level: state.level, seed: state.puzzle.seed,
    remaining: state.pieces.map(p => p.id), moves: state.moves, mistakes: state.mistakes,
    hints: state.hints, hintsUsed: state.hintsUsed, timeRemaining: state.timeRemaining, phase: state.phase
  }));
}

function render() {
  const { size, config } = state.puzzle;
  board.setAttribute('viewBox', `-.6 -.6 ${size + 1.2} ${size + 1.2}`);
  board.setAttribute('aria-label', `${state.level}레벨 ${shapeNames[config.shape]} 퍼즐. 분홍 목표를 탈출시키세요.`);
  board.innerHTML = '<defs><marker id="head" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="3.2" markerHeight="3.2" orient="auto"><path d="M0 0L8 4L0 8" fill="none" stroke="#b8c2f5" stroke-width="2" stroke-linejoin="round"/></marker><marker id="goal-head" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="3.2" markerHeight="3.2" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#ff67bc"/></marker></defs>';
  const grid = svg('g', { 'aria-hidden': 'true', class: 'grid' });
  let contour = '';
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (!Engine.shapeContains(config.shape, r, c, size)) continue;
    grid.append(svg('rect', { x: c, y: r, width: 1, height: 1, fill: '#192434' }));
    grid.append(svg('circle', { cx: c + .5, cy: r + .5, r: .045, fill: '#425167' }));
    if (!Engine.shapeContains(config.shape, r - 1, c, size)) contour += `M${c} ${r}h1`;
    if (!Engine.shapeContains(config.shape, r + 1, c, size)) contour += `M${c} ${r + 1}h1`;
    if (!Engine.shapeContains(config.shape, r, c - 1, size)) contour += `M${c} ${r}v1`;
    if (!Engine.shapeContains(config.shape, r, c + 1, size)) contour += `M${c + 1} ${r}v1`;
  }
  grid.append(svg('path', { d: contour, fill: 'none', stroke: '#4c6372', 'stroke-width': .04 }));
  board.append(grid);
  for (const piece of state.pieces) {
    const group = svg('g', {
      class: `piece${piece.target ? ' target-piece' : ''}`, 'data-id': piece.id,
      role: 'button', tabindex: state.phase === 'won' || state.phase === 'lost' ? -1 : 0,
      'aria-label': `${piece.target ? '분홍 목표' : '일반'} ${directionNames[piece.direction]} 화살표`
    });
    group.append(svg('path', { class: 'arrow-line', d: pathData(piece.points), 'marker-end': `url(#${piece.target ? 'goal-head' : 'head'})` }));
    group.append(svg('path', { class: 'hit-line', d: pathData(piece.points) }));
    group.addEventListener('click', () => attempt(piece, group));
    group.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); attempt(piece, group); }
    });
    board.append(group);
  }
  $('#level').textContent = String(state.level).padStart(2, '0');
  $('#chapter').textContent = `CHAPTER ${String(config.tier).padStart(2, '0')} · ${shapeNames[config.shape]}`;
  $('#progress-fill').style.width = `${state.highestUnlocked}%`;
  $('#tier').textContent = `${config.tier} / 10`;
  $('#mode-badge').textContent = modeNames[state.puzzle.mode];
  $('#mode-badge').dataset.mode = state.puzzle.mode;
  $('#par').textContent = state.puzzle.par;
  $('#remaining').textContent = state.pieces.length;
  $('#hints').textContent = state.hints;
  const record = state.records[state.level];
  $('#best').textContent = record ? `${record.moves}회 · ${'★'.repeat(record.stars)}` : '아직 없어요';
  $('#stage-note').textContent = {
    classic: '서두르지 말고, 분홍 화살표의 길을 열어주세요.',
    moves: `성공한 탈출만 횟수에 포함돼요. ${state.puzzle.moveLimit}회 안에 목표를 탈출시키세요.`,
    time: '첫 화살표를 누르면 시작해요. 이동 연출·메뉴에서는 시간이 멈춰요.'
  }[state.puzzle.mode];
  updateChallenge();
}

function updateChallenge() {
  const mode = state.puzzle.mode;
  $('#challenge-title').textContent = mode === 'time' ? '남은 시간' : mode === 'moves' ? '남은 횟수' : '이동 횟수';
  const value = mode === 'time' ? Math.ceil(state.timeRemaining) : mode === 'moves' ? state.puzzle.moveLimit - state.moves : state.moves;
  $('#challenge').textContent = `${Math.max(0, value)}${mode === 'time' ? '초' : ''}`;
  $('#challenge').classList.toggle('challenge-danger', mode !== 'classic' && value <= (mode === 'time' ? 10 : 2));
  $('#hint').disabled = state.locked || !state.hints || !['ready', 'playing'].includes(state.phase);
  $('#status').textContent = state.phase === 'won' ? '탈출 성공! 다음 레벨에 도전하세요.' : state.phase === 'lost' ? '다시 시작하면 같은 퍼즐에 도전할 수 있어요.' : '분홍 화살표 하나를 탈출시키면 성공';
  $('#continue').hidden = state.phase !== 'won';
}

function startLevel(resume = false) {
  state.runId++;
  state.puzzle = campaign.levels[state.level - 1];
  state.pieces = state.puzzle.pieces.slice();
  Object.assign(state, { phase: 'ready', locked: false, moves: 0, mistakes: 0, hintsUsed: 0, hints: state.puzzle.config.hints, timeRemaining: state.puzzle.timeLimit || 0 });
  const saved = resume && storage.json('arrowOutRun-v2', null);
  if (saved && saved.version === campaign.version && saved.level === state.level && saved.seed === state.puzzle.seed && ['ready', 'playing'].includes(saved.phase) && Array.isArray(saved.remaining)) {
    const validIds = new Set(state.pieces.map(p => p.id));
    if (saved.remaining.includes(state.puzzle.targetId) && saved.remaining.every(id => validIds.has(id)) &&
        Number.isFinite(saved.moves) && saved.moves >= 0 && saved.moves === validIds.size - new Set(saved.remaining).size &&
        Number.isFinite(saved.timeRemaining) && saved.timeRemaining >= 0 && Number.isFinite(saved.hints)) {
      state.pieces = state.pieces.filter(p => saved.remaining.includes(p.id));
      Object.assign(state, { moves: saved.moves, mistakes: saved.mistakes || 0, hintsUsed: saved.hintsUsed || 0,
        hints: Math.max(0, Math.min(saved.hints, state.puzzle.config.hints)), timeRemaining: Math.min(saved.timeRemaining, state.puzzle.timeLimit || 0), phase: saved.phase });
    }
  }
  storage.set('arrowOutLevel', state.level);
  setZoom(1); render(); saveRun();
}

function attempt(piece, group) {
  if (state.locked || !['ready', 'playing'].includes(state.phase) || document.querySelector('dialog[open]')) return;
  state.phase = 'playing';
  const analysis = Engine.exitAnalysis(piece, state.pieces, state.puzzle.size);
  if (!analysis.free) {
    state.mistakes++;
    group.classList.remove('blocked'); void group.getBoundingClientRect(); group.classList.add('blocked');
    const blocker = state.pieces.find(p => p.id !== piece.id && Engine.expandPath(p.points).some(c => c.r === analysis.blocker?.r && c.c === analysis.blocker?.c));
    board.querySelector(`[data-id="${blocker?.id}"]`)?.classList.add('blocking');
    setTimeout(() => board.querySelectorAll('.blocking').forEach(node => node.classList.remove('blocking')), 1000);
    showToast('앞의 화살표를 먼저 빼주세요. 횟수는 줄지 않아요.'); tone(130); saveRun(); return;
  }
  state.locked = true; state.moves++; updateChallenge(); tone(piece.target ? 680 : 380);
  const plan = Engine.flowGeometry(piece, state.puzzle.size, 0);
  const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 40 : Math.min(850, 260 + plan.travel * 16);
  const runId = state.runId, started = performance.now();
  function frame(now) {
    if (runId !== state.runId) return;
    const progress = Math.min(1, (now - started) / duration);
    const geometry = Engine.flowGeometry(piece, state.puzzle.size, progress * plan.travel);
    group.querySelectorAll('path').forEach(node => node.setAttribute('d', pathData(geometry.points)));
    if (progress < 1) { requestAnimationFrame(frame); return; }
    state.pieces = state.pieces.filter(p => p.id !== piece.id); state.locked = false;
    if (piece.target) finishLevel();
    else if (state.puzzle.mode === 'moves' && state.moves >= state.puzzle.moveLimit) failStage('이동 횟수를 모두 사용했어요. 힌트로 목표까지 꼭 필요한 길을 찾아보세요.');
    else { render(); saveRun(); }
  }
  requestAnimationFrame(frame);
}

function finishLevel() {
  state.phase = 'won';
  const stars = 1 + Number(state.moves === state.puzzle.par) + Number(state.moves === state.puzzle.par && !state.hintsUsed && !state.mistakes);
  const old = state.records[state.level];
  state.records[state.level] = { moves: Math.min(old?.moves ?? Infinity, state.moves), stars: Math.max(old?.stars || 0, stars) };
  state.highestUnlocked = Math.min(100, Math.max(state.highestUnlocked, state.level + 1));
  storage.set('arrowOutUnlocked', state.highestUnlocked);
  storage.set('arrowOutRecords-v2', JSON.stringify(state.records));
  $('#final').textContent = state.moves;
  $('#win-title').textContent = state.level === 100 ? '100레벨 완주!' : '길을 열었어요!';
  $('#stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  $('#win-detail').textContent = `최소 ${state.puzzle.par}회 · 힌트 ${state.hintsUsed}회 · 막힌 선택 ${state.mistakes}회`;
  $('#next').textContent = state.level === 100 ? '레벨 지도 보기' : '다음 레벨 →';
  render(); saveRun(); openDialog('win');
}
function failStage(reason) {
  if (state.phase === 'lost' || state.phase === 'won') return;
  state.phase = 'lost'; state.locked = false; state.runId++;
  $('#lose-reason').textContent = reason;
  render(); saveRun(); openDialog('lose');
}
function openDialog(id) {
  if (state.locked || !state.puzzle) return;
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  $(`#${id}`).showModal();
}

let previousTick = performance.now(), savedTick = 0;
setInterval(() => {
  const now = performance.now(), elapsed = (now - previousTick) / 1000;
  previousTick = now;
  if (state.phase !== 'playing' || state.locked || document.hidden || document.querySelector('dialog[open]') || state.puzzle.mode !== 'time') return;
  state.timeRemaining = Math.max(0, state.timeRemaining - elapsed); updateChallenge();
  if (now - savedTick > 1000) { saveRun(); savedTick = now; }
  if (!state.timeRemaining) failStage('제한 시간이 끝났어요. 같은 퍼즐로 다시 도전해보세요.');
}, 100);
document.addEventListener('visibilitychange', () => { previousTick = performance.now(); if (!state.locked) saveRun(); });
window.addEventListener('pagehide', () => { if (!state.locked) saveRun(); });
function showToast(message) {
  $('#toast').textContent = message; $('#toast').classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => $('#toast').classList.remove('show'), 2400);
}
function tone(frequency) {
  if (!state.sound) return;
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    const context = tone.context ||= new Context(); context.resume().catch(() => {});
    const osc = context.createOscillator(), gain = context.createGain();
    osc.frequency.value = frequency; gain.gain.setValueAtTime(.025, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .12);
    osc.connect(gain).connect(context.destination); osc.start(); osc.stop(context.currentTime + .12);
  } catch { /* Audio is optional. */ }
}

function buildLevelGrid() {
  $('#level-grid').replaceChildren();
  for (let level = 1; level <= 100; level++) {
    if ((level - 1) % 10 === 0) {
      const heading = document.createElement('h3');
      heading.textContent = `${String(Math.ceil(level / 10)).padStart(2, '0')} / ${shapeNames[campaign.levels[level - 1].config.shape]}`;
      $('#level-grid').append(heading);
    }
    const button = document.createElement('button'), record = state.records[level];
    button.innerHTML = `<span>${level}</span><small>${record ? '★'.repeat(record.stars) : modeNames[campaign.levels[level - 1].mode]}</small>`;
    button.classList.toggle('current', level === state.level); button.classList.toggle('completed', !!record);
    button.disabled = level > state.highestUnlocked;
    button.setAttribute('aria-label', `${level}레벨 ${modeNames[campaign.levels[level - 1].mode]}${button.disabled ? ' 잠김' : ''}`);
    button.addEventListener('click', () => {
      $('#level-dialog').close();
      if (state.level === level) return;
      state.level = level; startLevel();
    });
    $('#level-grid').append(button);
  }
}
function setZoom(value) {
  const viewport = $('#viewport');
  const oldZoom = state.zoom;
  const centerX = viewport.scrollLeft + viewport.clientWidth / 2;
  const centerY = viewport.scrollTop + viewport.clientHeight / 2;
  state.zoom = Math.min(3, Math.max(1, value)); board.style.width = `${state.zoom * 100}%`;
  viewport.scrollLeft = centerX * state.zoom / oldZoom - viewport.clientWidth / 2;
  viewport.scrollTop = centerY * state.zoom / oldZoom - viewport.clientHeight / 2;
  $('#zoom-value').textContent = `${Math.round(state.zoom * 100)}%`;
  $('#zoom-out').disabled = state.zoom === 1; $('#zoom-in').disabled = state.zoom === 3;
  if (state.zoom === 1) { $('#viewport').scrollTop = 0; $('#viewport').scrollLeft = 0; }
}
$('#zoom-in').onclick = () => setZoom(state.zoom + .5);
$('#zoom-out').onclick = () => setZoom(state.zoom - .5);
$('#zoom-reset').onclick = () => setZoom(1);
$('#hint').onclick = () => {
  if (state.locked || !state.hints || !['ready', 'playing'].includes(state.phase)) return;
  const order = Engine.solvePuzzle({ ...state.puzzle, pieces: state.pieces });
  if (!order?.length) return showToast('다시 시작해 주세요. 퍼즐 경로를 확인할 수 없어요.');
  state.hints--; state.hintsUsed++;
  const group = board.querySelector(`[data-id="${order[0]}"]`);
  group.classList.remove('hinted'); void group.getBoundingClientRect(); group.classList.add('hinted');
  group.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  $('#hints').textContent = state.hints;
  updateChallenge(); saveRun(); showToast(`목표까지 꼭 필요한 화살표예요. 최소 ${order.length}회 남았어요.`);
};
$('#restart').onclick = () => {
  if (state.locked) return;
  if (state.phase === 'playing' || state.hintsUsed) openDialog('restart-dialog'); else startLevel();
};
$('#confirm-restart').onclick = () => { $('#restart-dialog').close(); startLevel(); };
$('#retry').onclick = () => { $('#lose').close(); startLevel(); };
function showMap() { if (!state.locked && campaign) { buildLevelGrid(); openDialog('level-dialog'); } }
$('#levels').onclick = showMap; $('#level-open').onclick = showMap;
function nextLevel() {
  $('#win').close(); if (state.level === 100) { showMap(); return; }
  state.level++; startLevel();
}
$('#next').onclick = nextLevel; $('#continue').onclick = nextLevel;
$('#help').onclick = () => openDialog('tutorial'); $('#pause').onclick = () => openDialog('pause-dialog');
document.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => button.closest('dialog').close(); });
$('#sound').onclick = () => { state.sound = !state.sound; storage.set('arrowOutSound', state.sound ? 'on' : 'off'); updateSound(); };
function updateSound() { $('#sound').textContent = state.sound ? '♪' : '×'; $('#sound').setAttribute('aria-label', state.sound ? '소리 끄기' : '소리 켜기'); }
async function boot() {
  try {
    const response = await fetch('campaign.json'); if (!response.ok) throw new Error('Campaign unavailable');
    campaign = await response.json();
    if (campaign.version !== 2 || campaign.levels.length !== 100) throw new Error('Invalid campaign');
    $('#loading').hidden = true; updateSound(); startLevel(true);
    if (!storage.get('arrowOutSeen-v2')) { openDialog('tutorial'); storage.set('arrowOutSeen-v2', '1'); }
  } catch { $('#loading').textContent = '퍼즐을 불러오지 못했어요. 연결을 확인하고 새로고침해 주세요.'; }
}
boot();
