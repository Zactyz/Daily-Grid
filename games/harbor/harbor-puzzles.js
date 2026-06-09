import { createSeededRandom, hashString } from '../common/utils.js';

const WIDTH = 6;
const HEIGHT = 6;
const EXIT_ROW = 2;
const MOVER_IDS = ['a', 'b', 'c', 'd'];
const MAX_GENERATION_ATTEMPTS = 2500;

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
  const dists = [];

  for (const step of plan) {
    const dist = slidePieceDirected(pieces, step.id, step.dr, step.dc);
    if (dist > 0) moved.add(step.id);
    dists.push(dist);
  }

  tryGoalExit(pieces);
  return {
    success: isGoalExited(pieces),
    allMoved: moved.size === plan.length,
    movedCount: moved.size,
    dists
  };
}

function plansEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((step, index) => (
    step.id === b[index].id
    && step.dr === b[index].dr
    && step.dc === b[index].dc
  ));
}

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

function canExitAfterPrefix(pieces, plan, count) {
  const state = clonePieces(pieces);
  for (let i = 0; i < count; i += 1) {
    slidePieceDirected(state, plan[i].id, plan[i].dr, plan[i].dc);
  }
  return tryGoalExit(state);
}

function passesQualityGate(pieces, plan) {
  const forward = simulatePlan(pieces, plan);
  if (!forward.success || !forward.allMoved) return false;
  if (forward.dists.some((d) => d < 2)) return false;
  if (forward.dists.reduce((sum, d) => sum + d, 0) < 10) return false;

  for (let k = 1; k < plan.length; k += 1) {
    if (canExitAfterPrefix(pieces, plan, k)) return false;
  }

  for (let i = 0; i < plan.length; i += 1) {
    const reduced = plan.filter((_, index) => index !== i);
    if (simulatePlan(pieces, reduced).success) return false;
  }

  return true;
}

function tryPlacePiece(pieces, candidate, attempts, rng) {
  for (let i = 0; i < attempts; i += 1) {
    const trial = { ...candidate };
    if (i > 0) {
      const maxRow = trial.orient === 'V' ? HEIGHT - trial.len : HEIGHT - 1;
      const maxCol = trial.orient === 'H' ? WIDTH - trial.len : WIDTH - 1;
      trial.row = Math.floor(rng() * (maxRow + 1));
      trial.col = Math.floor(rng() * (maxCol + 1));
    }
    if (!overlapsAny(pieces, trial)) {
      pieces.push(trial);
      return true;
    }
  }
  return false;
}

function buildCandidateLayout(rng) {
  const pieces = [
    { id: 'goal', isGoal: true, row: EXIT_ROW, col: 0, len: 2, orient: 'H' }
  ];

  for (const id of MOVER_IDS) {
    const len = rng() < 0.45 ? 3 : 2;
    const orient = rng() < 0.55 ? 'H' : 'V';
    if (!tryPlacePiece(pieces, { id, len, orient, row: 0, col: 0 }, 200, rng)) return null;
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
    if (!solutionPlan || !passesQualityGate(pieces, solutionPlan)) continue;

    return finalizePuzzle(pieces, solutionPlan);
  }

  return null;
}

export function generatePuzzle(seedKey) {
  if (PUZZLE_CACHE.has(seedKey)) return PUZZLE_CACHE.get(seedKey);

  for (let wave = 0; wave < 6; wave += 1) {
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
