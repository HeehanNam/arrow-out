'use strict';
const fs = require('node:fs');
const path = require('node:path');
const E = require('../engine');
const file = path.join(__dirname, '../campaign.json');
const levels = [];
const checkpoint = path.join(__dirname, '../.test-results/campaign-draft.json');
fs.mkdirSync(path.dirname(checkpoint), { recursive: true });
const previous = fs.existsSync(checkpoint) ? JSON.parse(fs.readFileSync(checkpoint, 'utf8')) : [];
for (let level = 1; level <= 100; level++) {
  let puzzle = previous.find(p => p.level === level && JSON.stringify(p.config) === JSON.stringify(E.levelConfig(level)));
  for (let offset = 0; offset < 40 && !puzzle; offset++) {
    try { puzzle = E.createPuzzle({ level, seed: Math.imul(level + offset * 101, 2654435761) >>> 0 }); }
    catch { /* Deterministic retry; never publish an unverified fallback. */ }
  }
  if (!puzzle) throw new Error(`Cannot build level ${level}`);
  puzzle.optimal = E.solvePuzzle(puzzle);
  if (!E.validateSolution(puzzle) || puzzle.optimal.length !== puzzle.par) throw new Error(`Invalid level ${level}`);
  puzzle.metrics = {
    arrows: puzzle.pieces.length,
    cells: puzzle.pieces.reduce((n, p) => n + E.expandPath(p.points).length, 0),
    bends: puzzle.pieces.reduce((n, p) => n + p.bends, 0)
  };
  levels.push(puzzle);
  fs.writeFileSync(checkpoint, JSON.stringify(levels));
  console.log(`Level ${level}: ${puzzle.config.shape}, ${puzzle.metrics.arrows} arrows, ${puzzle.metrics.bends} bends, par ${puzzle.par}`);
}
fs.writeFileSync(file, JSON.stringify({ version: 2, levels }) + '\n');
