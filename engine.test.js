'use strict';

const assert = require('node:assert/strict');
const Engine = require('./engine.js');

function piece(id, points) {
  return { id, points, direction: Engine.directionOf(points), bends: points.length - 2, target: false };
}

// The line must unspool along its own route. A rigid-body sweep area is irrelevant.
const bent = piece('bent', [{ r: 3, c: 1 }, { r: 1, c: 1 }, { r: 1, c: 3 }]);
const bodyBlocker = piece('blocker', [{ r: 2, c: 3 }, { r: 2, c: 4 }]);
assert.equal(Engine.canExit(bent, [bent], 6), true, 'unblocked bent arrow should exit');
assert.equal(Engine.canExit(bent, [bent, bodyBlocker], 6), true, 'rigid-body sweep area must not block a flowing line');

const headBlocker = piece('head-blocker', [{ r: 1, c: 4 }, { r: 2, c: 4 }]);
assert.equal(Engine.canExit(bent, [bent, headBlocker], 6), false, 'a line in front of the arrowhead must block exit');

const stepOne = Engine.flowCellsAtStep(bent, 6, 1);
assert.deepEqual(stepOne, [
  { r: 2, c: 1 }, { r: 1, c: 1 }, { r: 1, c: 2 }, { r: 1, c: 3 }, { r: 1, c: 4 }
], 'tail must follow the original bend while the head advances');
const flowPlan = Engine.flowGeometry(bent, 6, 0);
const finalFlow = Engine.flowGeometry(bent, 6, flowPlan.travel);
assert.ok(finalFlow.points.every((cell) => cell.c >= 6), 'the entire flowing line must finish outside the board');

const parallelSafe = piece('safe', [{ r: 5, c: 0 }, { r: 5, c: 2 }]);
assert.equal(Engine.canExit(bent, [bent, parallelSafe], 6), true, 'unrelated line must not block exit');

let totalPieces = 0;
let totalBent = 0;
let totalComplex = 0;
let totalMotifs = 0;
let firstPuzzle;
let finalPuzzle;
const modeCounts = { classic: 0, moves: 0, time: 0 };
for (let level = 1; level <= 100; level += 1) {
  let puzzle;
  for (let offset = 0; offset < 8 && !puzzle; offset += 1) {
    try {
      puzzle = Engine.createPuzzle({ level, seed: Math.imul(level + offset * 101, 2654435761) >>> 0 });
    } catch (error) { /* campaign generator retries deterministic fallback seeds */ }
  }
  assert.ok(puzzle, `level ${level} must generate from a campaign seed`);
  if (level === 1) firstPuzzle = puzzle;
  if (level === 100) finalPuzzle = puzzle;
  modeCounts[puzzle.mode] += 1;
  assert.equal(Engine.validateSolution(puzzle), true, `level ${level} must follow its certified solution`);
  const solved = Engine.solvePuzzle(puzzle, 80000);
  assert.ok(solved, `level ${level} must be solvable by the independent solver`);
  assert.equal(solved[solved.length - 1], puzzle.targetId, `level ${level} must end by freeing target`);
  assert.equal(Engine.canExit(puzzle.pieces.find((p) => p.target), puzzle.pieces, puzzle.size), false,
    `level ${level} target must start blocked`);
  assert.ok(puzzle.par >= 2 && puzzle.par <= puzzle.pieces.length, `level ${level} par must be valid`);
  assert.ok(puzzle.par >= puzzle.config.minPar, `level ${level} must meet its dependency-depth target`);
  if (puzzle.mode === 'moves') assert.ok(puzzle.moveLimit >= puzzle.par, `level ${level} needs a fair move limit`);
  if (puzzle.mode === 'time') assert.ok(puzzle.timeLimit >= 28, `level ${level} needs a fair timer`);
  const occupied = new Set();
  puzzle.pieces.forEach((p) => Engine.expandPath(p.points).forEach((cell) => {
    const cellKey = `${cell.r},${cell.c}`;
    assert.equal(occupied.has(cellKey), false, `level ${level} pieces must not overlap at ${cellKey}`);
    occupied.add(cellKey);
  }));
  totalPieces += puzzle.pieces.length;
  totalBent += puzzle.pieces.filter((p) => p.bends > 0).length;
  totalComplex += puzzle.pieces.filter((p) => p.bends >= 2).length;
  totalMotifs += puzzle.pieces.filter((p) => p.motif).length;
}
assert.ok(totalBent / totalPieces >= 0.55, 'most generated arrows should be bent');
assert.ok(totalComplex / totalPieces >= 0.25, 'at least a quarter of arrows should bend multiple times');
assert.ok(finalPuzzle.size > firstPuzzle.size, 'the board must grow across 100 levels');
assert.ok(finalPuzzle.pieces.length > firstPuzzle.pieces.length, 'later levels must contain more arrows');
assert.ok(totalMotifs >= 100, 'the campaign must include many motif arrows');
assert.deepEqual(modeCounts, { classic: 60, moves: 20, time: 20 }, '100 levels need a 60/20/20 mode mix');
console.log(`campaign tests: 100 levels, ${totalPieces} arrows, ${totalBent} bent, ${totalComplex} multi-bend, ${totalMotifs} motifs`);
