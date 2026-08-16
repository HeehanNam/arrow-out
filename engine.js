(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ArrowEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DIRECTIONS = {
    right: { dr: 0, dc: 1 },
    down: { dr: 1, dc: 0 },
    left: { dr: 0, dc: -1 },
    up: { dr: -1, dc: 0 }
  };
  const DIR_NAMES = Object.keys(DIRECTIONS);
  const key = (r, c) => `${r},${c}`;
  const inside = (cell, size) => cell.r >= 0 && cell.r < size && cell.c >= 0 && cell.c < size;

  function makeRng(seed) {
    let value = seed >>> 0 || 0x9e3779b9;
    return function () {
      value += 0x6d2b79f5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function expandPath(points) {
    const cells = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const dr = Math.sign(b.r - a.r);
      const dc = Math.sign(b.c - a.c);
      if (dr && dc) throw new Error('Arrow segments must be orthogonal');
      const distance = Math.abs(b.r - a.r) + Math.abs(b.c - a.c);
      for (let step = i === 0 ? 0 : 1; step <= distance; step += 1) {
        cells.push({ r: a.r + dr * step, c: a.c + dc * step });
      }
    }
    return cells;
  }

  function directionOf(points) {
    const a = points[points.length - 2];
    const b = points[points.length - 1];
    const dr = Math.sign(b.r - a.r);
    const dc = Math.sign(b.c - a.c);
    return DIR_NAMES.find((name) => DIRECTIONS[name].dr === dr && DIRECTIONS[name].dc === dc);
  }

  function occupiedBy(pieces, ignoreId) {
    const occupied = new Set();
    pieces.forEach((piece) => {
      if (piece.id === ignoreId) return;
      expandPath(piece.points).forEach((cell) => occupied.add(key(cell.r, cell.c)));
    });
    return occupied;
  }

  function exitAnalysis(piece, pieces, size) {
    const direction = DIRECTIONS[piece.direction || directionOf(piece.points)];
    const cells = expandPath(piece.points);
    const occupied = occupiedBy(pieces, piece.id);
    const maxSteps = size * 2 + Math.max(size, cells.length);
    for (let step = 1; step <= maxSteps; step += 1) {
      const moved = cells.map((cell) => ({
        r: cell.r + direction.dr * step,
        c: cell.c + direction.dc * step
      }));
      const collision = moved.find((cell) => inside(cell, size) && occupied.has(key(cell.r, cell.c)));
      if (collision) return { free: false, blocker: collision, steps: step };
      if (moved.every((cell) => !inside(cell, size))) return { free: true, steps: step };
    }
    return { free: false, blocker: null, steps: maxSteps };
  }

  function canExit(piece, pieces, size) {
    return exitAnalysis(piece, pieces, size).free;
  }

  function randomWalkPiece(rng, size, occupied, options) {
    const minCells = options.minCells || 3;
    const maxCells = options.maxCells || 8;
    const desired = minCells + Math.floor(rng() * (maxCells - minCells + 1));
    const maxBends = options.maxBends == null ? 4 : options.maxBends;
    const start = options.start || { r: Math.floor(rng() * size), c: Math.floor(rng() * size) };
    if (!inside(start, size) || occupied.has(key(start.r, start.c))) return null;
    const cells = [{ r: start.r, c: start.c }];
    const used = new Set([key(start.r, start.c)]);
    let previousDirection = null;
    let bends = 0;

    while (cells.length < desired) {
      const current = cells[cells.length - 1];
      let choices = DIR_NAMES.filter((name) => {
        const d = DIRECTIONS[name];
        const next = { r: current.r + d.dr, c: current.c + d.dc };
        if (!inside(next, size) || occupied.has(key(next.r, next.c)) || used.has(key(next.r, next.c))) return false;
        if (previousDirection) {
          const previous = DIRECTIONS[previousDirection];
          if (previous.dr === -d.dr && previous.dc === -d.dc) return false;
          if (name !== previousDirection && bends >= maxBends) return false;
        }
        return true;
      });
      if (!choices.length) break;
      if (previousDirection && choices.includes(previousDirection) && rng() < 0.36) {
        choices = [previousDirection];
      }
      const direction = choices[Math.floor(rng() * choices.length)];
      if (previousDirection && direction !== previousDirection) bends += 1;
      const d = DIRECTIONS[direction];
      cells.push({ r: current.r + d.dr, c: current.c + d.dc });
      used.add(key(cells[cells.length - 1].r, cells[cells.length - 1].c));
      previousDirection = direction;
    }

    if (cells.length < minCells) return null;
    const points = [cells[0]];
    let lastDirection = null;
    for (let i = 1; i < cells.length; i += 1) {
      const dr = cells[i].r - cells[i - 1].r;
      const dc = cells[i].c - cells[i - 1].c;
      const direction = DIR_NAMES.find((name) => DIRECTIONS[name].dr === dr && DIRECTIONS[name].dc === dc);
      if (lastDirection && direction !== lastDirection) points.push(cells[i - 1]);
      lastDirection = direction;
    }
    points.push(cells[cells.length - 1]);
    return { points, direction: lastDirection, bends };
  }

  function validateSolution(puzzle) {
    let remaining = puzzle.pieces.map((piece) => ({ ...piece, points: piece.points.map((p) => ({ ...p })) }));
    for (const id of puzzle.solution) {
      const piece = remaining.find((candidate) => candidate.id === id);
      if (!piece || !canExit(piece, remaining, puzzle.size)) return false;
      remaining = remaining.filter((candidate) => candidate.id !== id);
    }
    return remaining.length === 0 && puzzle.solution[puzzle.solution.length - 1] === puzzle.targetId;
  }

  function solvePuzzle(puzzle, maxNodes) {
    const pieces = puzzle.pieces;
    const memo = new Set();
    let nodes = 0;
    function visit(ids, order) {
      if (nodes++ > (maxNodes || 60000)) return null;
      const signature = ids.slice().sort().join('|');
      if (memo.has(signature)) return null;
      memo.add(signature);
      const remaining = pieces.filter((piece) => ids.includes(piece.id));
      const target = remaining.find((piece) => piece.id === puzzle.targetId);
      if (target && canExit(target, remaining, puzzle.size)) return [...order, target.id];
      const options = remaining.filter((piece) => piece.id !== puzzle.targetId && canExit(piece, remaining, puzzle.size));
      options.sort((a, b) => (b.bends || 0) - (a.bends || 0));
      for (const piece of options) {
        const result = visit(ids.filter((id) => id !== piece.id), [...order, piece.id]);
        if (result) return result;
      }
      return null;
    }
    return visit(pieces.map((piece) => piece.id), []);
  }

  function createPuzzle(options) {
    const level = options && options.level ? options.level : 1;
    const seed = options && options.seed != null ? options.seed : Date.now();
    const rng = makeRng(seed);
    const size = Math.min(14, 11 + Math.floor((level - 1) / 4));
    const desiredPieces = Math.min(22, 12 + Math.floor(level * 0.75));

    for (let boardAttempt = 0; boardAttempt < 120; boardAttempt += 1) {
      const center = Math.floor(size / 2);
      const targetWalk = randomWalkPiece(rng, size, new Set(), {
        start: { r: center + Math.floor(rng() * 3) - 1, c: center + Math.floor(rng() * 3) - 1 },
        minCells: 5,
        maxCells: 8,
        maxBends: 3
      });
      if (!targetWalk || targetWalk.bends < 1) continue;
      const target = {
        id: `target-${seed}-${boardAttempt}`,
        points: targetWalk.points,
        direction: targetWalk.direction,
        bends: targetWalk.bends,
        target: true
      };
      const pieces = [target];
      const solution = [target.id];

      for (let index = 1; index < desiredPieces; index += 1) {
        let accepted = null;
        for (let attempt = 0; attempt < 500; attempt += 1) {
          const occupied = occupiedBy(pieces);
          const walk = randomWalkPiece(rng, size, occupied, {
            minCells: 4,
            maxCells: Math.min(10, 7 + Math.floor(level / 3)),
            maxBends: Math.min(6, 3 + Math.floor(level / 3))
          });
          if (!walk) continue;
          const candidate = {
            id: `arrow-${seed}-${boardAttempt}-${index}`,
            points: walk.points,
            direction: walk.direction,
            bends: walk.bends,
            target: false
          };
          if (canExit(candidate, [...pieces, candidate], size)) {
            accepted = candidate;
            break;
          }
        }
        if (!accepted) break;
        pieces.push(accepted);
        solution.unshift(accepted.id);
      }

      const puzzle = { size, seed, level, pieces, targetId: target.id, solution };
      const bentCount = pieces.filter((piece) => piece.bends >= 1).length;
      const complexCount = pieces.filter((piece) => piece.bends >= 2).length;
      if (pieces.length >= Math.max(9, desiredPieces - 3) && bentCount >= Math.ceil(pieces.length * 0.55) &&
          complexCount >= Math.ceil(pieces.length * 0.25) &&
          !canExit(target, pieces, size) && validateSolution(puzzle) && solvePuzzle(puzzle, 25000)) {
        return puzzle;
      }
    }
    throw new Error('검증된 퍼즐을 생성하지 못했습니다. 새 시드를 사용해 주세요.');
  }

  return {
    DIRECTIONS,
    makeRng,
    expandPath,
    directionOf,
    exitAnalysis,
    canExit,
    validateSolution,
    solvePuzzle,
    createPuzzle
  };
});
