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
  const MAX_LEVEL = 100;
  const MOTIFS = {
    heart: [[2,0],[1,0],[1,1],[0,1],[0,2],[1,2],[0,3],[0,4],[1,4],[1,5],[2,5],[2,4],[3,4],[3,3],[4,3]],
    diamond: [[2,0],[1,0],[1,1],[0,1],[0,2],[1,2],[1,3],[2,3],[2,4],[3,4],[3,3],[4,3],[4,2],[3,2],[3,1]],
    spiral: [[0,0],[0,1],[0,2],[0,3],[1,3],[2,3],[3,3],[3,2],[3,1],[2,1],[1,1],[1,2],[2,2]],
    lightning: [[0,0],[0,1],[1,1],[1,2],[2,2],[2,3],[3,3],[3,4]],
    crown: [[2,0],[1,0],[1,1],[2,1],[2,2],[0,2],[0,3],[2,3],[2,4],[1,4],[1,5],[2,5]]
  };
  const key = (r, c) => `${r},${c}`;
  const inside = (cell, size) => cell.r >= 0 && cell.r < size && cell.c >= 0 && cell.c < size;

  function levelConfig(rawLevel) {
    const level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(rawLevel || 1)));
    const progress = (level - 1) / (MAX_LEVEL - 1);
    const slot = level % 10;
    const mode = [3, 7].includes(slot) ? 'moves' : [5, 9].includes(slot) ? 'time' : 'classic';
    return {
      level,
      progress,
      tier: Math.ceil(level / 10),
      mode,
      size: 11 + Math.floor(progress * 7),
      desiredPieces: 12 + Math.floor(progress * 21),
      minCells: 4 + Math.floor(progress * 3),
      maxCells: 7 + Math.floor(progress * 8),
      maxBends: 3 + Math.floor(progress * 6),
      motifChance: level < 6 ? 0 : 0.1 + progress * 0.38,
      minMotifs: level < 10 ? 0 : 1 + Math.floor(progress * 3),
      minPar: 2 + Math.floor(progress * 10),
      hints: progress < 0.34 ? 3 : progress < 0.67 ? 2 : 1
    };
  }

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
    const head = cells[cells.length - 1];
    for (let step = 1; step <= size + 1; step += 1) {
      const nextHead = { r: head.r + direction.dr * step, c: head.c + direction.dc * step };
      if (!inside(nextHead, size)) {
        return { free: true, headSteps: step, totalSteps: step + cells.length - 1 };
      }
      if (occupied.has(key(nextHead.r, nextHead.c))) {
        return { free: false, blocker: nextHead, steps: step };
      }
    }
    return { free: false, blocker: null, steps: size + 1 };
  }

  function canExit(piece, pieces, size) {
    return exitAnalysis(piece, pieces, size).free;
  }

  function flowCellsAtStep(piece, size, step) {
    const cells = expandPath(piece.points);
    const direction = DIRECTIONS[piece.direction || directionOf(piece.points)];
    const head = cells[cells.length - 1];
    const route = cells.slice();
    const required = Math.max(0, step) + cells.length;
    for (let index = 1; route.length < required; index += 1) {
      route.push({ r: head.r + direction.dr * index, c: head.c + direction.dc * index });
    }
    return route.slice(step, step + cells.length);
  }

  function polylineLength(points) {
    let length = 0;
    for (let index = 1; index < points.length; index += 1) {
      length += Math.hypot(points[index].r - points[index - 1].r, points[index].c - points[index - 1].c);
    }
    return length;
  }

  function pointAtDistance(points, distance) {
    let travelled = 0;
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1];
      const b = points[index];
      const segment = Math.hypot(b.r - a.r, b.c - a.c);
      if (travelled + segment >= distance) {
        const ratio = segment ? (distance - travelled) / segment : 0;
        return { r: a.r + (b.r - a.r) * ratio, c: a.c + (b.c - a.c) * ratio };
      }
      travelled += segment;
    }
    return { ...points[points.length - 1] };
  }

  function slicePolyline(points, start, end) {
    const sliced = [pointAtDistance(points, start)];
    let travelled = 0;
    for (let index = 1; index < points.length; index += 1) {
      travelled += Math.hypot(
        points[index].r - points[index - 1].r,
        points[index].c - points[index - 1].c
      );
      if (travelled > start && travelled < end) sliced.push({ ...points[index] });
    }
    sliced.push(pointAtDistance(points, end));
    return sliced.filter((point, index) => index === 0 || point.r !== sliced[index - 1].r || point.c !== sliced[index - 1].c);
  }

  function flowGeometry(piece, size, distance) {
    const bodyLength = polylineLength(piece.points);
    const direction = DIRECTIONS[piece.direction || directionOf(piece.points)];
    const head = piece.points[piece.points.length - 1];
    const analysis = exitAnalysis(piece, [piece], size);
    const travel = analysis.totalSteps + 1;
    const route = [
      ...piece.points.map((point) => ({ ...point })),
      { r: head.r + direction.dr * travel, c: head.c + direction.dc * travel }
    ];
    const clamped = Math.max(0, Math.min(distance, travel));
    return { points: slicePolyline(route, clamped, clamped + bodyLength), bodyLength, travel };
  }

  function cellsToWalk(cells, motif) {
    const points = [cells[0]];
    let lastDirection = null;
    let bends = 0;
    for (let index = 1; index < cells.length; index += 1) {
      const dr = cells[index].r - cells[index - 1].r;
      const dc = cells[index].c - cells[index - 1].c;
      const direction = DIR_NAMES.find((name) => DIRECTIONS[name].dr === dr && DIRECTIONS[name].dc === dc);
      if (!direction) return null;
      if (lastDirection && direction !== lastDirection) {
        points.push(cells[index - 1]);
        bends += 1;
      }
      lastDirection = direction;
    }
    points.push(cells[cells.length - 1]);
    return { points, direction: lastDirection, bends, motif: motif || null };
  }

  function motifWalkPiece(rng, size, occupied) {
    const names = Object.keys(MOTIFS);
    const name = names[Math.floor(rng() * names.length)];
    let cells = MOTIFS[name].map(([r, c]) => ({ r, c }));
    if (rng() < 0.5) cells = cells.map((cell) => ({ r: cell.r, c: -cell.c }));
    const rotations = Math.floor(rng() * 4);
    for (let turn = 0; turn < rotations; turn += 1) {
      cells = cells.map((cell) => ({ r: cell.c, c: -cell.r }));
    }
    const minR = Math.min(...cells.map((cell) => cell.r));
    const minC = Math.min(...cells.map((cell) => cell.c));
    cells = cells.map((cell) => ({ r: cell.r - minR, c: cell.c - minC }));
    const height = Math.max(...cells.map((cell) => cell.r)) + 1;
    const width = Math.max(...cells.map((cell) => cell.c)) + 1;
    if (height > size || width > size) return null;
    const offsetR = Math.floor(rng() * (size - height + 1));
    const offsetC = Math.floor(rng() * (size - width + 1));
    cells = cells.map((cell) => ({ r: cell.r + offsetR, c: cell.c + offsetC }));
    if (cells.some((cell) => occupied.has(key(cell.r, cell.c)))) return null;
    return cellsToWalk(cells, name);
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
    return cellsToWalk(cells);
  }

  function blockersFor(piece, pieces, size) {
    const direction = DIRECTIONS[piece.direction || directionOf(piece.points)];
    const cells = expandPath(piece.points);
    const head = cells[cells.length - 1];
    const owners = new Map();
    pieces.forEach((candidate) => {
      if (candidate.id === piece.id) return;
      expandPath(candidate.points).forEach((cell) => owners.set(key(cell.r, cell.c), candidate.id));
    });
    const blockers = new Set();
    for (let step = 1; step <= size; step += 1) {
      const cell = { r: head.r + direction.dr * step, c: head.c + direction.dc * step };
      if (!inside(cell, size)) break;
      const owner = owners.get(key(cell.r, cell.c));
      if (owner) blockers.add(owner);
    }
    return [...blockers];
  }

  function rayCells(piece, size) {
    const direction = DIRECTIONS[piece.direction || directionOf(piece.points)];
    const cells = expandPath(piece.points);
    const head = cells[cells.length - 1];
    const ray = [];
    for (let step = 1; step <= size; step += 1) {
      const cell = { r: head.r + direction.dr * step, c: head.c + direction.dc * step };
      if (!inside(cell, size)) break;
      ray.push(cell);
    }
    return ray;
  }

  function requiredMovesForTarget(puzzle) {
    const byId = new Map(puzzle.pieces.map((piece) => [piece.id, piece]));
    const required = new Set([puzzle.targetId]);
    function visit(id) {
      const piece = byId.get(id);
      if (!piece) return;
      blockersFor(piece, puzzle.pieces, puzzle.size).forEach((blockerId) => {
        if (required.has(blockerId)) return;
        required.add(blockerId);
        visit(blockerId);
      });
    }
    visit(puzzle.targetId);
    return required.size;
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
    const config = levelConfig(options && options.level ? options.level : 1);
    const level = config.level;
    const seed = options && options.seed != null ? options.seed : Date.now();
    const rng = makeRng(seed);
    const size = config.size;
    const desiredPieces = config.desiredPieces;

    boardAttempts: for (let boardAttempt = 0; boardAttempt < 180; boardAttempt += 1) {
      const center = Math.floor(size / 2);
      const targetWalk = randomWalkPiece(rng, size, new Set(), {
        start: { r: center + Math.floor(rng() * 3) - 1, c: center + Math.floor(rng() * 3) - 1 },
        minCells: config.minCells + 1,
        maxCells: Math.min(config.maxCells, config.minCells + 5),
        maxBends: Math.min(config.maxBends, 5)
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

      let chainTip = target;
      for (let depth = 1; depth < config.minPar; depth += 1) {
        let chainPiece = null;
        for (let attempt = 0; attempt < 900; attempt += 1) {
          const occupied = occupiedBy(pieces);
          const anchors = rayCells(chainTip, size).filter((cell) => !occupied.has(key(cell.r, cell.c)));
          if (!anchors.length) break;
          const anchor = anchors[Math.floor(rng() * anchors.length)];
          const walk = randomWalkPiece(rng, size, occupied, {
            start: anchor,
            minCells: config.minCells,
            maxCells: Math.min(config.maxCells, config.minCells + 5),
            maxBends: config.maxBends
          });
          if (!walk) continue;
          const candidate = {
            id: `chain-${seed}-${boardAttempt}-${depth}`,
            points: walk.points,
            direction: walk.direction,
            bends: walk.bends,
            motif: null,
            target: false
          };
          const hasNextAnchor = depth === config.minPar - 1 || rayCells(candidate, size)
            .some((cell) => !occupied.has(key(cell.r, cell.c)));
          if (hasNextAnchor && canExit(candidate, [...pieces, candidate], size)) chainPiece = candidate;
          if (chainPiece) break;
        }
        if (!chainPiece) continue boardAttempts;
        pieces.push(chainPiece);
        solution.unshift(chainPiece.id);
        chainTip = chainPiece;
      }

      for (let index = pieces.length; index < desiredPieces; index += 1) {
        let accepted = null;
        for (let attempt = 0; attempt < 750; attempt += 1) {
          const occupied = occupiedBy(pieces);
          const useMotif = rng() < config.motifChance;
          const walk = useMotif ? motifWalkPiece(rng, size, occupied) : randomWalkPiece(rng, size, occupied, {
            minCells: config.minCells,
            maxCells: config.maxCells,
            maxBends: config.maxBends
          });
          if (!walk) continue;
          const candidate = {
            id: `arrow-${seed}-${boardAttempt}-${index}`,
            points: walk.points,
            direction: walk.direction,
            bends: walk.bends,
            motif: walk.motif || null,
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

      const puzzle = { size, seed, level, pieces, targetId: target.id, solution, config };
      const bentCount = pieces.filter((piece) => piece.bends >= 1).length;
      const complexCount = pieces.filter((piece) => piece.bends >= 2).length;
      const motifCount = pieces.filter((piece) => piece.motif).length;
      if (pieces.length >= Math.max(9, desiredPieces - 10) && bentCount >= Math.ceil(pieces.length * 0.55) &&
          complexCount >= Math.ceil(pieces.length * 0.25) &&
          motifCount >= config.minMotifs && !canExit(target, pieces, size) && validateSolution(puzzle)) {
        puzzle.par = requiredMovesForTarget(puzzle);
        if (puzzle.par < config.minPar) continue;
        puzzle.mode = config.mode;
        puzzle.moveLimit = config.mode === 'moves' ? puzzle.par + Math.max(2, 5 - Math.floor(config.progress * 3)) : null;
        puzzle.timeLimit = config.mode === 'time' ? Math.max(28, Math.round(puzzle.par * (4.8 - config.progress * 1.6) + 18)) : null;
        return puzzle;
      }
    }
    throw new Error('검증된 퍼즐을 생성하지 못했습니다. 새 시드를 사용해 주세요.');
  }

  return {
    DIRECTIONS,
    MAX_LEVEL,
    MOTIFS,
    levelConfig,
    makeRng,
    expandPath,
    directionOf,
    exitAnalysis,
    canExit,
    flowCellsAtStep,
    polylineLength,
    slicePolyline,
    flowGeometry,
    blockersFor,
    rayCells,
    requiredMovesForTarget,
    validateSolution,
    solvePuzzle,
    createPuzzle
  };
});
