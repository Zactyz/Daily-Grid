import { createSeededRandom, hashString } from '../common/utils.js';

const WIDTH = 5;
const HEIGHT = 5;
const EXIT_ROW = 2;
const MAX_GENERATION_ATTEMPTS = 12000;

const PUZZLE_CACHE = new Map();

function clonePieces(pieces) {
  return pieces.map((p) => ({ ...p }));
}

function cellsFor(piece) {
  const out = [];
  for (let i = 0; i < piece.len; i += 1) {
    const r = piece.orient === 'H' ? piece.row : piece.row + i;
    const c = piece.orient === 'H' ? piece.col + i : piece.col;
    out.push(`${r},${c}`);
  }
  return out;
}

function buildOccupancy(pieces, ignoreId = null) {
  const map = new Map();
  pieces.forEach((piece) => {
    if (piece.id === ignoreId) return;
    cellsFor(piece).forEach((key) => map.set(key, piece.id));
  });
  return map;
}

function overlapsAny(pieces, candidate) {
  const occ = buildOccupancy(pieces);
  return cellsFor(candidate).some((key) => occ.has(key));
}

function canShift(pieces, pieceId, dr, dc, steps = 1) {
  const piece = pieces.find((p) => p.id === pieceId);
  if (!piece) return false;
  if (piece.orient === 'H' && dr !== 0) return false;
  if (piece.orient === 'V' && dc !== 0) return false;

  const trial = { ...piece, row: piece.row + dr * steps, col: piece.col + dc * steps };
  if (trial.row < 0 || trial.col < 0) return false;
  if (trial.orient === 'H' && trial.col + trial.len > WIDTH) return false;
  if (trial.orient === 'V' && trial.row + trial.len > HEIGHT) return false;

  const occ = buildOccupancy(pieces, pieceId);
  return cellsFor(trial).every((key) => !occ.has(key));
}

function shiftPiece(pieces, pieceId, dr, dc, steps = 1) {
  if (!canShift(pieces, pieceId, dr, dc, steps)) return false;
  const piece = pieces.find((p) => p.id === pieceId);
  piece.row += dr * steps;
  piece.col += dc * steps;
  return true;
}

function measureSlide(pieces, pieceId, dr, dc) {
  const trial = clonePieces(pieces);
  let steps = 0;
  while (canShift(trial, pieceId, dr, dc, 1)) {
    shiftPiece(trial, pieceId, dr, dc, 1);
    steps += 1;
  }
  return steps;
}

export function directionsForPiece(piece) {
  if (!piece || piece.isGoal) return [];
  return piece.orient === 'H'
    ? [{ dr: 0, dc: -1 }, { dr: 0, dc: 1 }]
    : [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }];
}

export function getDefaultDirection(pieces, pieceId) {
  const piece = pieces.find((p) => p.id === pieceId);
  if (!piece) return { dr: 0, dc: 0 };
  const options = directionsForPiece(piece).map((dir) => ({
    ...dir,
    dist: measureSlide(pieces, pieceId, dir.dr, dir.dc)
  }));
  const viable = options.filter((o) => o.dist > 0);
  if (viable.length === 0) return options[1] || options[0];
  const maxDist = Math.max(...viable.map((o) => o.dist));
  const best = viable.filter((o) => o.dist === maxDist);
  return best.find((o) => o.dc === 1)
    || best.find((o) => o.dr === 1)
    || best[0];
}

export function slidePieceDirected(pieces, pieceId, dr, dc) {
  const dist = measureSlide(pieces, pieceId, dr, dc);
  if (dist > 0) shiftPiece(pieces, pieceId, dr, dc, dist);
  return dist;
}

function isGoalExited(pieces) {
  const goal = pieces.find((p) => p.isGoal);
  return !!(goal && goal.row === EXIT_ROW && goal.col + goal.len >= WIDTH);
}

function tryGoalExit(pieces) {
  const goal = pieces.find((p) => p.isGoal);
  if (!goal || goal.row !== EXIT_ROW) return false;
  while (canShift(pieces, goal.id, 0, 1)) {
    shiftPiece(pieces, goal.id, 0, 1);
  }
  return isGoalExited(pieces);
}

export function stepGoalExit(pieces) {
  const goal = pieces.find((p) => p.isGoal);
  if (!goal || goal.row !== EXIT_ROW) return false;
  return shiftPiece(pieces, goal.id, 0, 1);
}

function canGoalExitImmediately(pieces) {
  return tryGoalExit(clonePieces(pieces));
}

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const result = [];
  for (let i = 0; i < arr.length; i += 1) {
    const head = arr[i];
    const tail = [...arr.slice(0, i), ...arr.slice(i + 1)];
    permutations(tail).forEach((perm) => result.push([head, ...perm]));
  }
  return result;
}

function directionCombos(movers) {
  const options = movers.map((piece) => directionsForPiece(piece));
  const result = [];

  function walk(index, acc) {
    if (index === movers.length) {
      result.push(acc);
      return;
    }
    for (const dir of options[index]) {
      walk(index + 1, [...acc, { id: movers[index].id, dr: dir.dr, dc: dir.dc }]);
    }
  }

  walk(0, []);
  return result;
}

export function simulatePlan(initialPieces, plan) {
  const pieces = clonePieces(initialPieces);
  const moved = new Set();

  for (const step of plan) {
    if (slidePieceDirected(pieces, step.id, step.dr, step.dc) > 0) moved.add(step.id);
  }

  tryGoalExit(pieces);
  return {
    success: isGoalExited(pieces),
    allMoved: moved.size === plan.length,
    movedCount: moved.size
  };
}

/** Exactly one winning plan where every mover slides at least one cell. */
function findUniqueFullPlan(pieces) {
  const movers = pieces.filter((p) => !p.isGoal);
  const ids = movers.map((p) => p.id);
  const solutions = [];

  for (const order of permutations(ids)) {
    const orderedMovers = order.map((id) => movers.find((m) => m.id === id));
    for (const dirs of directionCombos(orderedMovers)) {
      const plan = order.map((id, index) => ({
        id,
        dr: dirs[index].dr,
        dc: dirs[index].dc
      }));
      const result = simulatePlan(pieces, plan);
      if (result.success && result.allMoved) solutions.push(plan);
      if (solutions.length > 1) return null;
    }
  }

  return solutions.length === 1 ? solutions[0] : null;
}

function buildCandidateLayout(rng) {
  const pieces = [
    { id: 'goal', isGoal: true, row: EXIT_ROW, col: 0, len: 2, orient: 'H' }
  ];
  const ids = ['a', 'b', 'c', 'd'];

  for (let i = 0; i < ids.length; i += 1) {
    let placed = false;
    for (let attempt = 0; attempt < 150; attempt += 1) {
      const len = rng() < 0.4 ? 3 : 2;
      const orient = rng() < 0.55 ? 'H' : 'V';
      const maxRow = orient === 'V' ? HEIGHT - len : HEIGHT - 1;
      const maxCol = orient === 'H' ? WIDTH - len : WIDTH - 1;
      const candidate = {
        id: ids[i],
        len,
        orient,
        row: Math.floor(rng() * (maxRow + 1)),
        col: Math.floor(rng() * (maxCol + 1))
      };
      if (!overlapsAny(pieces, candidate)) {
        pieces.push(candidate);
        placed = true;
        break;
      }
    }
    if (!placed) return null;
  }

  if (canGoalExitImmediately(pieces)) return null;
  return pieces;
}

function finalizePuzzle(pieces, solutionPlan) {
  const moverIds = pieces.filter((p) => !p.isGoal).map((p) => p.id);
  return {
    pieces: clonePieces(pieces),
    solutionPlan,
    moverIds
  };
}

function generateFromSeed(seedKey, wave = 0, maxAttempts = MAX_GENERATION_ATTEMPTS) {
  const baseHash = hashString(wave === 0 ? `harbor:${seedKey}` : `harbor:${seedKey}:w${wave}`);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const rng = createSeededRandom(baseHash + attempt * 7919);
    const pieces = buildCandidateLayout(rng);
    if (!pieces) continue;

    const solutionPlan = findUniqueFullPlan(pieces);
    if (!solutionPlan) continue;

    return finalizePuzzle(pieces, solutionPlan);
  }

  return null;
}

export function generatePuzzle(seedKey) {
  if (PUZZLE_CACHE.has(seedKey)) return PUZZLE_CACHE.get(seedKey);

  for (let wave = 0; wave < 4; wave += 1) {
    const puzzle = generateFromSeed(seedKey, wave);
    if (puzzle) {
      PUZZLE_CACHE.set(seedKey, puzzle);
      return puzzle;
    }
  }

  throw new Error(`Harbor could not generate puzzle for seed: ${seedKey}`);
}

export function pickTemplate(seedKey) {
  return generatePuzzle(seedKey);
}

export { clonePieces, EXIT_ROW, WIDTH, HEIGHT, isGoalExited, canShift };
