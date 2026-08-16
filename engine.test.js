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
for (let seed = 1; seed <= 120; seed += 1) {
  const level = 1 + (seed % 12);
  const puzzle = Engine.createPuzzle({ level, seed: seed * 104729 });
  assert.equal(Engine.validateSolution(puzzle), true, `seed ${seed} must follow its certified solution`);
  const solved = Engine.solvePuzzle(puzzle, 60000);
  assert.ok(solved, `seed ${seed} must be solvable by the independent solver`);
  assert.equal(solved[solved.length - 1], puzzle.targetId, `seed ${seed} must end by freeing target`);
  assert.equal(Engine.canExit(puzzle.pieces.find((p) => p.target), puzzle.pieces, puzzle.size), false,
    `seed ${seed} target must start blocked`);
  const occupied = new Set();
  puzzle.pieces.forEach((p) => Engine.expandPath(p.points).forEach((cell) => {
    const cellKey = `${cell.r},${cell.c}`;
    assert.equal(occupied.has(cellKey), false, `seed ${seed} pieces must not overlap at ${cellKey}`);
    occupied.add(cellKey);
  }));
  totalPieces += puzzle.pieces.length;
  totalBent += puzzle.pieces.filter((p) => p.bends > 0).length;
  totalComplex += puzzle.pieces.filter((p) => p.bends >= 2).length;
}
assert.ok(totalBent / totalPieces >= 0.55, 'most generated arrows should be bent');
assert.ok(totalComplex / totalPieces >= 0.25, 'at least a quarter of arrows should bend multiple times');
console.log(`engine tests: 120 solvable boards, ${totalPieces} arrows, ${totalBent} bent, ${totalComplex} multi-bend`);
