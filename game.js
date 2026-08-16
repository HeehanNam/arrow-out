'use strict';

const Engine = window.ArrowEngine;
const $ = (selector) => document.querySelector(selector);
const board = $('#board');
const savedLevel = Number(localStorage.getItem('arrowOutLevel')) || 1;
const state = {
  level: Math.max(1, Math.min(Engine.MAX_LEVEL, savedLevel)),
  highestUnlocked: Math.max(1, Math.min(Engine.MAX_LEVEL, Number(localStorage.getItem('arrowOutUnlocked')) || 1)),
  puzzle: null,
  pieces: [],
  moves: 0,
  hints: 3,
  sound: localStorage.getItem('arrowOutSound') !== 'off',
  seed: 0,
  locked: false,
  timerId: null,
  timerStarted: false,
  deadline: 0,
  timeRemaining: 0,
  runId: 0
};

const motifColors = {
  normal: '#aeb7ff', heart: '#ff8dce', diamond: '#77defa', spiral: '#c0a0ff',
  lightning: '#ffe178', crown: '#92efbb', target: '#ff52be'
};
const modeNames = { classic: '일반', moves: '횟수 제한', time: '타임어택' };
const motifNames = { heart: '하트', diamond: '다이아몬드', spiral: '나선', lightning: '번개', crown: '왕관' };

function pathData(points) {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.c + 0.5} ${point.r + 0.5}`).join(' ');
}

function marker(id, color) {
  return `<marker id="head-${id}" viewBox="0 0 8 8" refX="6.3" refY="4" markerWidth="2.4" markerHeight="2.4" orient="auto-start-reverse"><path d="M0 0L8 4L0 8L2.2 4Z" fill="${color}"/></marker>`;
}

function render() {
  const { size, config } = state.puzzle;
  board.setAttribute('viewBox', `0 0 ${size} ${size}`);
  board.style.backgroundSize = `${100 / size}% ${100 / size}%`;
  board.setAttribute('aria-label', `${size}×${size} 화살표 퍼즐`);
  board.innerHTML = `<defs>${Object.entries(motifColors).map(([id, color]) => marker(id, color)).join('')}</defs>`;
  state.pieces.forEach((piece) => {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.classList.add('piece');
    if (piece.target) group.classList.add('target-piece');
    if (piece.motif) group.classList.add('motif', `motif-${piece.motif}`);
    group.dataset.id = piece.id;
    group.setAttribute('role', 'button');
    group.setAttribute('tabindex', '0');
    const shape = piece.motif ? `${motifNames[piece.motif]}형 ` : '';
    group.setAttribute('aria-label', `${piece.target ? '분홍 목표 ' : ''}${shape}${directionLabel(piece.direction)} 화살표`);
    const visible = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    visible.classList.add('arrow-line');
    visible.setAttribute('d', pathData(piece.points));
    visible.setAttribute('marker-end', `url(#head-${piece.target ? 'target' : piece.motif || 'normal'})`);
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.classList.add('hit-line');
    hit.setAttribute('d', pathData(piece.points));
    group.append(visible, hit);
    group.addEventListener('click', () => attempt(piece, group));
    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') attempt(piece, group);
    });
    board.append(group);
  });
  $('#level').textContent = state.level;
  $('#progress-fill').style.width = `${state.level}%`;
  $('#tier').textContent = `${config.tier}단계`;
  $('#mode-badge').textContent = modeNames[state.puzzle.mode];
  $('#mode-badge').dataset.mode = state.puzzle.mode;
  $('#par').textContent = state.puzzle.par;
  $('#remaining').textContent = state.pieces.length;
  $('#hints').textContent = state.hints;
  $('#best').textContent = localStorage.getItem(`arrowOutBest-${state.level}`) || '—';
  updateChallenge();
}

function updateChallenge() {
  const mode = state.puzzle.mode;
  const label = $('#challenge-label');
  const value = $('#challenge');
  value.classList.remove('challenge-danger');
  if (mode === 'time') {
    label.firstChild.textContent = '남은 시간';
    value.textContent = `${Math.max(0, Math.ceil(state.timeRemaining))}초`;
    if (state.timeRemaining <= 10) value.classList.add('challenge-danger');
  } else if (mode === 'moves') {
    const left = Math.max(0, state.puzzle.moveLimit - state.moves);
    label.firstChild.textContent = '남은 횟수';
    value.textContent = left;
    if (left <= 2) value.classList.add('challenge-danger');
  } else {
    label.firstChild.textContent = '이동';
    value.textContent = state.moves;
  }
}

function directionLabel(direction) {
  return { right: '오른쪽', left: '왼쪽', up: '위쪽', down: '아래쪽' }[direction];
}

function attempt(piece, group) {
  if (state.locked) return;
  const analysis = Engine.exitAnalysis(piece, state.pieces, state.puzzle.size);
  if (!analysis.free) {
    group.classList.remove('blocked');
    void group.getBoundingClientRect();
    group.classList.add('blocked');
    showToast(analysis.selfCollision ? '자기 몸통과 겹치는 경로라 움직일 수 없어요' : `화살촉 ${analysis.steps}칸 앞이 막혀 있어요`);
    tone(130, 0.09);
    return;
  }
  startTimerIfNeeded();
  state.locked = true;
  state.moves += 1;
  updateChallenge();
  animateAlongPath(piece, group, state.runId);
  tone(piece.target ? 680 : 360, 0.12);
}

function animateAlongPath(piece, group, runId) {
  const visible = group.querySelector('.arrow-line');
  const hit = group.querySelector('.hit-line');
  const plan = Engine.flowGeometry(piece, state.puzzle.size, 0);
  const duration = Math.min(1250, Math.max(620, plan.travel * 72));
  const started = performance.now();
  function frame(now) {
    if (runId !== state.runId) return;
    const elapsed = Math.min(1, (now - started) / duration);
    const eased = elapsed < 0.5 ? 2 * elapsed * elapsed : 1 - Math.pow(-2 * elapsed + 2, 2) / 2;
    const geometry = Engine.flowGeometry(piece, state.puzzle.size, eased * plan.travel);
    const d = pathData(geometry.points);
    visible.setAttribute('d', d);
    hit.setAttribute('d', d);
    group.style.opacity = String(1 - Math.max(0, elapsed - 0.82) / 0.18);
    if (elapsed < 1) return requestAnimationFrame(frame);
    state.pieces = state.pieces.filter((candidate) => candidate.id !== piece.id);
    state.locked = false;
    if (piece.target) finishLevel();
    else if (state.puzzle.mode === 'moves' && state.moves >= state.puzzle.moveLimit) failStage('사용할 수 있는 이동 횟수를 모두 썼어요.');
    else render();
  }
  requestAnimationFrame(frame);
}

function campaignSeed(level, offset) {
  return (Math.imul(level + (offset || 0) * 101, 2654435761) >>> 0);
}

function startLevel() {
  clearTimer();
  state.runId += 1;
  state.seed = campaignSeed(state.level, 0);
  let lastError;
  for (let offset = 0; offset < 8; offset += 1) {
    try {
      state.seed = campaignSeed(state.level, offset);
      state.puzzle = Engine.createPuzzle({ level: state.level, seed: state.seed });
      lastError = null;
      break;
    } catch (error) { lastError = error; }
  }
  if (lastError) throw lastError;
  state.pieces = state.puzzle.pieces.map((piece) => ({ ...piece, points: piece.points.map((point) => ({ ...point })) }));
  state.moves = 0;
  state.hints = state.puzzle.config.hints;
  state.locked = false;
  state.timerStarted = false;
  state.timeRemaining = state.puzzle.timeLimit || 0;
  render();
}

function startTimerIfNeeded() {
  if (state.puzzle.mode !== 'time' || state.timerStarted) return;
  state.timerStarted = true;
  state.deadline = performance.now() + state.puzzle.timeLimit * 1000;
  state.timerId = setInterval(() => {
    state.timeRemaining = Math.max(0, (state.deadline - performance.now()) / 1000);
    updateChallenge();
    if (state.timeRemaining <= 0) failStage('제한 시간이 끝났어요.');
  }, 100);
}

function clearTimer() {
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = null;
}

function finishLevel() {
  clearTimer();
  state.runId += 1;
  const bestKey = `arrowOutBest-${state.level}`;
  const oldBest = Number(localStorage.getItem(bestKey)) || Infinity;
  if (state.moves < oldBest) localStorage.setItem(bestKey, state.moves);
  if (state.level < Engine.MAX_LEVEL) {
    state.highestUnlocked = Math.max(state.highestUnlocked, state.level + 1);
    localStorage.setItem('arrowOutUnlocked', state.highestUnlocked);
  }
  $('#final').textContent = state.moves;
  $('#win-title').textContent = state.level === Engine.MAX_LEVEL ? '100레벨 완주!' : '분홍 화살표 탈출!';
  $('#next').textContent = state.level === Engine.MAX_LEVEL ? '레벨 지도 보기' : '다음 레벨 →';
  $('#win').showModal();
}

function failStage(reason) {
  if ($('#lose').open) return;
  clearTimer();
  state.runId += 1;
  state.locked = true;
  $('#lose-reason').textContent = reason;
  $('#lose').showModal();
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1500);
}

function tone(frequency, duration) {
  if (!state.sound) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = tone.context ||= new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.05, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
}

function buildLevelGrid() {
  const grid = $('#level-grid');
  grid.replaceChildren();
  for (let level = 1; level <= Engine.MAX_LEVEL; level += 1) {
    const config = Engine.levelConfig(level);
    const button = document.createElement('button');
    button.innerHTML = `${level}<i class="mode-dot ${config.mode}"></i>`;
    if (level === state.level) button.classList.add('current');
    if (level < state.highestUnlocked) button.classList.add('completed');
    if (level > state.highestUnlocked) {
      button.classList.add('locked');
      button.disabled = true;
      button.setAttribute('aria-label', `${level}레벨 잠김`);
    } else {
      button.addEventListener('click', () => {
        state.level = level;
        localStorage.setItem('arrowOutLevel', level);
        $('#level-dialog').close();
        startLevel();
      });
    }
    grid.append(button);
  }
}

$('#hint').addEventListener('click', () => {
  if (!state.hints) return showToast('이번 레벨의 힌트를 모두 사용했어요');
  const nextId = state.puzzle.solution.find((id) => state.pieces.some((piece) => piece.id === id));
  const next = state.pieces.find((piece) => piece.id === nextId && Engine.canExit(piece, state.pieces, state.puzzle.size)) ||
    state.pieces.find((piece) => !piece.target && Engine.canExit(piece, state.pieces, state.puzzle.size));
  if (!next) return showToast('다른 화살표를 먼저 빼보세요');
  state.hints -= 1;
  $('#hints').textContent = state.hints;
  const group = board.querySelector(`[data-id="${next.id}"]`);
  group.classList.remove('hinted');
  void group.getBoundingClientRect();
  group.classList.add('hinted');
  showToast('반짝이는 화살표는 지금 탈출할 수 있어요');
});

$('#restart').addEventListener('click', startLevel);
$('#retry').addEventListener('click', () => { $('#lose').close(); startLevel(); });
$('#levels').addEventListener('click', () => { buildLevelGrid(); $('#level-dialog').showModal(); });
$('#level-open').addEventListener('click', () => { buildLevelGrid(); $('#level-dialog').showModal(); });
$('.level-close').addEventListener('click', () => $('#level-dialog').close());
$('#next').addEventListener('click', () => {
  $('#win').close();
  if (state.level === Engine.MAX_LEVEL) { buildLevelGrid(); $('#level-dialog').showModal(); return; }
  state.level += 1;
  localStorage.setItem('arrowOutLevel', state.level);
  startLevel();
});
$('#help').addEventListener('click', () => $('#tutorial').showModal());
$('#tutorial .close').addEventListener('click', () => $('#tutorial').close());
$('.start').addEventListener('click', () => $('#tutorial').close());
$('#sound').addEventListener('click', (event) => {
  state.sound = !state.sound;
  localStorage.setItem('arrowOutSound', state.sound ? 'on' : 'off');
  event.currentTarget.textContent = state.sound ? '♪' : '×';
  event.currentTarget.setAttribute('aria-label', state.sound ? '소리 끄기' : '소리 켜기');
});

$('#sound').textContent = state.sound ? '♪' : '×';
startLevel();
if (!localStorage.getItem('arrowOut100Seen')) {
  $('#tutorial').showModal();
  localStorage.setItem('arrowOut100Seen', '1');
}
