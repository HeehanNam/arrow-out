'use strict';
const assert = require('node:assert/strict');
const E = require('./engine');
const campaign = require('./campaign.json');
assert.equal(campaign.version, 2);
assert.equal(campaign.levels.length, 100);

// Independent continuous geometry oracle: no call to canExit/exitAnalysis.
function segments(points) { return points.slice(1).map((p, i) => [points[i], p]); }
function intersects([a, b], [c, d]) {
  return Math.max(Math.min(a.r, b.r), Math.min(c.r, d.r)) <= Math.min(Math.max(a.r, b.r), Math.max(c.r, d.r)) + 1e-9 &&
    Math.max(Math.min(a.c, b.c), Math.min(c.c, d.c)) <= Math.min(Math.max(a.c, b.c), Math.max(c.c, d.c)) + 1e-9;
}
let frames = 0, arrows = 0;
for (const p of campaign.levels) {
  const ids = new Set(p.pieces.map(a => a.id));
  assert.equal(ids.size, p.pieces.length);
  assert.deepEqual(p.config, E.levelConfig(p.level));
  let remaining = p.pieces.slice();
  for (const id of p.solution) {
    const arrow = remaining.find(a => a.id === id);
    const points = arrow.points;
    const own = segments(points);
    for (let i = 0; i < own.length; i++) for (let j = i + 2; j < own.length; j++) {
      assert.ok(!intersects(own[i], own[j]), `self intersection ${p.level} ${id}`);
    }
    E.expandPath(points).forEach(cell => assert.ok(E.shapeContains(p.config.shape, cell.r, cell.c, p.size)));
    const head = points.at(-1), previous = points.at(-2);
    const dr = Math.sign(head.r - previous.r), dc = Math.sign(head.c - previous.c);
    const ray = [head, { r: head.r + dr * (p.size + 2), c: head.c + dc * (p.size + 2) }];
    own.slice(0, -1).forEach(segment => assert.ok(!intersects(ray, segment), `own exit ray ${p.level}`));
    const others = remaining.filter(a => a.id !== id).flatMap(a => segments(a.points));
    others.forEach(segment => assert.ok(!intersects(ray, segment), `blocked solution ${p.level}`));
    const plan = E.flowGeometry(arrow, p.size, 0);
    // Fractional samples cover corners and the interval between grid cells.
    for (let distance = 0; distance <= plan.travel; distance += .5) {
      const geometry = E.flowGeometry(arrow, p.size, distance);
      assert.ok(Math.abs(E.polylineLength(geometry.points) - plan.bodyLength) < 1e-7, 'body length must remain constant');
      const body = segments(geometry.points);
      body.forEach(segment => others.forEach(other => assert.ok(!intersects(segment, other), `body penetrates another arrow, level ${p.level}`)));
      for (let i = 0; i < body.length; i++) for (let j = i + 2; j < body.length; j++) {
        assert.ok(!intersects(body[i], body[j]), `moving self intersection, level ${p.level}`);
      }
      frames++;
    }
    remaining = remaining.filter(a => a.id !== id);
    arrows++;
  }
  assert.equal(remaining.length, 0);
  // Optimal hints remain legal after each step, with no unrelated decoys.
  remaining = p.pieces.slice();
  for (const id of p.optimal) {
    assert.equal(E.solvePuzzle({ ...p, pieces: remaining })[0], id);
    remaining = remaining.filter(a => a.id !== id);
  }
}
let previous = { arrows: 0, bends: 0, par: 0 };
for (let chapter = 0; chapter < 10; chapter++) {
  const levels = campaign.levels.slice(chapter * 10, chapter * 10 + 10);
  const mean = {
    arrows: levels.reduce((n, p) => n + p.metrics.arrows, 0) / 10,
    bends: levels.reduce((n, p) => n + p.metrics.bends, 0) / 10,
    par: levels.reduce((n, p) => n + p.par, 0) / 10
  };
  for (const metric of Object.keys(mean)) assert.ok(mean[metric] > previous[metric], `chapter ${chapter + 1}: ${metric} must increase`);
  previous = mean;
}
console.log(`Independent collision verification: ${arrows} arrows, ${frames} fractional animation frames; all 10 chapter curves increase.`);
