'use strict';

const Engine = window.ArrowEngine;
const $ = (selector) => document.querySelector(selector);
const board = $('#board');
const state = {
  level: Number(localStorage.getItem('arrowOutLevel')) || 1,
  puzzle: null,
  pieces: [],
  moves: 0,
  hints: 3,
  sound: localStorage.getItem('arrowOutSound') !== 'off',
  seed: Date.now() & 0xffffffff,
  locked: false
};

function pathData(points) {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.c + 0.5} ${point.r + 0.5}`).join(' ');
}

function marker(id, color) {
  return `<marker id="${id}" viewBox="0 0 8 8" refX="6.3" refY="4" markerWidth="2.4" markerHeight="2.4" orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8 L 2.2 4 Z" fill="${color}"/></marker>`;
}

function render() {
  const { size } = state.puzzle;
  board.setAttribute('viewBox', `0 0 ${size} ${size}`);
  board.setAttribute('aria-label', `${size}×${size} 꺾인 화살표 퍼즐`);
  board.innerHTML = `<defs>${marker('head-normal', '#aeb7ff')}${marker('head-target', '#ff52be')}</defs>`;
  state.pieces.forEach((piece) => {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.classList.add('piece');
    if (piece.target) group.classList.add('target-piece');
    group.dataset.id = piece.id;
    group.setAttribute('role', 'button');
    group.setAttribute('tabindex', '0');
    group.setAttribute('aria-label', `${piece.target ? '분홍 목표 ' : ''}${piece.bends}번 꺾인 ${directionLabel(piece.direction)} 화살표`);

    const visible = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    visible.classList.add('arrow-line');
    visible.setAttribute('d', pathData(piece.points));
    visible.setAttribute('marker-end', `url(#head-${piece.target ? 'target' : 'normal'})`);
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
  $('#moves').textContent = state.moves;
  $('#hints').textContent = state.hints;
  $('#remaining').textContent = state.pieces.length;
  $('#best').textContent = localStorage.getItem(`arrowOutBest-${state.level}`) || '—';
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
    showToast(`전체 이동 경로가 막혀 있어요 (${analysis.steps}칸 앞)`);
    tone(130, 0.09);
    return;
  }

  state.locked = true;
  state.moves += 1;
  $('#moves').textContent = state.moves;
  animateAlongPath(piece, group);
  tone(piece.target ? 680 : 360, 0.12);
}

function animateAlongPath(piece, group) {
  const visible = group.querySelector('.arrow-line');
  const hit = group.querySelector('.hit-line');
  const plan = Engine.flowGeometry(piece, state.puzzle.size, 0);
  const duration = Math.min(1250, Math.max(620, plan.travel * 72));
  const started = performance.now();

  function frame(now) {
    const elapsed = Math.min(1, (now - started) / duration);
    const eased = elapsed < 0.5 ? 2 * elapsed * elapsed : 1 - Math.pow(-2 * elapsed + 2, 2) / 2;
    const geometry = Engine.flowGeometry(piece, state.puzzle.size, eased * plan.travel);
    const d = pathData(geometry.points);
    visible.setAttribute('d', d);
    hit.setAttribute('d', d);
    group.style.opacity = String(1 - Math.max(0, elapsed - 0.82) / 0.18);
    if (elapsed < 1) {
      requestAnimationFrame(frame);
      return;
    }
    state.pieces = state.pieces.filter((candidate) => candidate.id !== piece.id);
    state.locked = false;
    if (piece.target) finishLevel();
    else render();
  }
  requestAnimationFrame(frame);
}

function startLevel(newSeed) {
  state.seed = newSeed == null ? (Date.now() + state.level * 7919) & 0xffffffff : newSeed;
  try {
    state.puzzle = Engine.createPuzzle({ level: state.level, seed: state.seed });
  } catch (error) {
    state.puzzle = Engine.createPuzzle({ level: state.level, seed: state.seed + 104729 });
  }
  state.pieces = state.puzzle.pieces.map((piece) => ({ ...piece, points: piece.points.map((point) => ({ ...point })) }));
  state.moves = 0;
  state.hints = 3;
  state.locked = false;
  render();
}

function finishLevel() {
  const bestKey = `arrowOutBest-${state.level}`;
  const oldBest = Number(localStorage.getItem(bestKey)) || Infinity;
  if (state.moves < oldBest) localStorage.setItem(bestKey, state.moves);
  $('#final').textContent = state.moves;
  $('#win').showModal();
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

$('#hint').addEventListener('click', () => {
  if (!state.hints) return showToast('이번 레벨의 힌트를 모두 사용했어요');
  const nextId = state.puzzle.solution.find((id) => state.pieces.some((piece) => piece.id === id));
  const next = state.pieces.find((piece) => piece.id === nextId && Engine.canExit(piece, state.pieces, state.puzzle.size)) ||
    state.pieces.find((piece) => !piece.target && Engine.canExit(piece, state.pieces, state.puzzle.size));
  if (!next) return showToast('한 수 전의 다른 화살표를 먼저 빼보세요');
  state.hints -= 1;
  $('#hints').textContent = state.hints;
  const group = board.querySelector(`[data-id="${next.id}"]`);
  group.classList.remove('hinted');
  void group.getBoundingClientRect();
  group.classList.add('hinted');
  showToast('반짝이는 화살표는 지금 탈출할 수 있어요');
});

$('#restart').addEventListener('click', () => startLevel(state.seed));
$('#shuffle').addEventListener('click', () => startLevel());
$('#next').addEventListener('click', () => {
  $('#win').close();
  state.level += 1;
  localStorage.setItem('arrowOutLevel', state.level);
  startLevel();
});
$('#help').addEventListener('click', () => $('#tutorial').showModal());
$('.close').addEventListener('click', () => $('#tutorial').close());
$('.start').addEventListener('click', () => $('#tutorial').close());
$('#sound').addEventListener('click', (event) => {
  state.sound = !state.sound;
  localStorage.setItem('arrowOutSound', state.sound ? 'on' : 'off');
  event.currentTarget.textContent = state.sound ? '♪' : '×';
  event.currentTarget.setAttribute('aria-label', state.sound ? '소리 끄기' : '소리 켜기');
});

$('#sound').textContent = state.sound ? '♪' : '×';
startLevel();
if (!localStorage.getItem('arrowOutBentSeen')) {
  $('#tutorial').showModal();
  localStorage.setItem('arrowOutBentSeen', '1');
}
