import { createSeededRandom, hashString } from '../common/utils.js';

const WIDTH = 6;
const HEIGHT = 6;
const EXIT_ROW = 2;

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

/**
 * Slide along the piece axis as far as possible toward open space.
 * When both directions are open, take the longer run (tie → toward exit / up).
 */
export function slidePieceMax(pieces, pieceId) {
  const piece = pieces.find((p) => p.id === pieceId);
  if (!piece || piece.isGoal) return 0;

  const options = piece.orient === 'H'
    ? [
      { dr: 0, dc: -1, dist: measureSlide(pieces, pieceId, 0, -1) },
      { dr: 0, dc: 1, dist: measureSlide(pieces, pieceId, 0, 1) }
    ]
    : [
      { dr: -1, dc: 0, dist: measureSlide(pieces, pieceId, -1, 0) },
      { dr: 1, dc: 0, dist: measureSlide(pieces, pieceId, 1, 0) }
    ];

  const viable = options.filter((o) => o.dist > 0);
  if (viable.length === 0) return 0;

  const maxDist = Math.max(...viable.map((o) => o.dist));
  const best = viable.filter((o) => o.dist === maxDist);
  const chosen = best.find((o) => o.dc === 1)
    || best.find((o) => o.dr === -1)
    || best[0];

  shiftPiece(pieces, pieceId, chosen.dr, chosen.dc, chosen.dist);
  return chosen.dist;
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

export function simulateOrder(initialPieces, order) {
  const pieces = clonePieces(initialPieces);
  const moved = new Set();

  for (const id of order) {
    if (slidePieceMax(pieces, id) > 0) moved.add(id);
  }

  tryGoalExit(pieces);
  return {
    success: isGoalExited(pieces),
    allMoved: moved.size === order.length
  };
}

function findUniqueSolution(pieces) {
  const movers = pieces.filter((p) => !p.isGoal).map((p) => p.id);
  const solutions = [];

  for (const order of permutations(movers)) {
    const result = simulateOrder(pieces, order);
    if (result.success) solutions.push(order);
    if (solutions.length > 1) return null;
  }

  return solutions.length === 1 ? solutions[0] : null;
}

function buildCandidateLayout(rng) {
  const pieces = [
    { id: 'goal', isGoal: true, row: EXIT_ROW, col: 0, len: 2, orient: 'H' }
  ];
  const ids = ['a', 'b', 'c', 'd', 'e'];

  for (let i = 0; i < ids.length; i += 1) {
    let placed = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const len = rng() < 0.45 ? 3 : 2;
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

/** Verified dense jams — each has exactly one solving move order. */
const PRECOMPUTED_PUZZLES = [
  { pieces: [{ id: 'goal', isGoal: true, row: 2, col: 0, len: 2, orient: 'H' }, { id: 'a', len: 3, orient: 'V', row: 2, col: 4 }, { id: 'b', len: 3, orient: 'H', row: 5, col: 1 }, { id: 'c', len: 2, orient: 'H', row: 1, col: 1 }, { id: 'd', len: 2, orient: 'H', row: 4, col: 2 }, { id: 'e', len: 2, orient: 'V', row: 1, col: 3 }], order: ['d', 'e', 'c', 'a', 'b'] },
  { pieces: [{ id: 'goal', isGoal: true, row: 2, col: 0, len: 2, orient: 'H' }, { id: 'a', len: 3, orient: 'V', row: 0, col: 3 }, { id: 'b', len: 3, orient: 'H', row: 3, col: 1 }, { id: 'c', len: 2, orient: 'V', row: 3, col: 0 }, { id: 'd', len: 3, orient: 'V', row: 0, col: 4 }, { id: 'e', len: 2, orient: 'H', row: 5, col: 4 }], order: ['c', 'e', 'd', 'b', 'a'] },
  { pieces: [{ id: 'goal', isGoal: true, row: 2, col: 0, len: 2, orient: 'H' }, { id: 'a', len: 2, orient: 'V', row: 3, col: 3 }, { id: 'b', len: 2, orient: 'H', row: 4, col: 4 }, { id: 'c', len: 3, orient: 'V', row: 0, col: 4 }, { id: 'd', len: 3, orient: 'H', row: 5, col: 0 }, { id: 'e', len: 2, orient: 'H', row: 1, col: 2 }], order: ['e', 'a', 'b', 'c', 'd'] },
  { pieces: [{ id: 'goal', isGoal: true, row: 2, col: 0, len: 2, orient: 'H' }, { id: 'a', len: 3, orient: 'V', row: 0, col: 3 }, { id: 'b', len: 2, orient: 'V', row: 3, col: 5 }, { id: 'c', len: 2, orient: 'V', row: 4, col: 0 }, { id: 'd', len: 2, orient: 'H', row: 0, col: 4 }, { id: 'e', len: 3, orient: 'H', row: 5, col: 3 }], order: ['c', 'e', 'a', 'd', 'b'] },
  { pieces: [{ id: 'goal', isGoal: true, row: 2, col: 0, len: 2, orient: 'H' }, { id: 'a', len: 2, orient: 'H', row: 4, col: 4 }, { id: 'b', len: 2, orient: 'H', row: 5, col: 2 }, { id: 'c', len: 2, orient: 'V', row: 3, col: 3 }, { id: 'd', len: 3, orient: 'V', row: 1, col: 2 }, { id: 'e', len: 3, orient: 'V', row: 1, col: 5 }], order: ['c', 'a', 'e', 'b', 'd'] },
  { pieces: [{ id: 'goal', isGoal: true, row: 2, col: 0, len: 2, orient: 'H' }, { id: 'a', len: 2, orient: 'H', row: 3, col: 1 }, { id: 'b', len: 2, orient: 'V', row: 0, col: 2 }, { id: 'c', len: 3, orient: 'V', row: 0, col: 4 }, { id: 'd', len: 3, orient: 'H', row: 5, col: 0 }, { id: 'e', len: 2, orient: 'V', row: 0, col: 3 }], order: ['c', 'd', 'e', 'a', 'b'] },
  { pieces: [{ id: 'goal', isGoal: true, row: 2, col: 0, len: 2, orient: 'H' }, { id: 'a', len: 2, orient: 'H', row: 5, col: 2 }, { id: 'b', len: 3, orient: 'V', row: 2, col: 4 }, { id: 'c', len: 3, orient: 'H', row: 1, col: 0 }, { id: 'd', len: 2, orient: 'V', row: 3, col: 5 }, { id: 'e', len: 3, orient: 'V', row: 2, col: 2 }], order: ['d', 'c', 'b', 'a', 'e'] },
  { pieces: [{ id: 'goal', isGoal: true, row: 2, col: 0, len: 2, orient: 'H' }, { id: 'a', len: 2, orient: 'H', row: 5, col: 2 }, { id: 'b', len: 2, orient: 'V', row: 4, col: 5 }, { id: 'c', len: 2, orient: 'V', row: 1, col: 4 }, { id: 'd', len: 2, orient: 'V', row: 0, col: 3 }, { id: 'e', len: 3, orient: 'H', row: 3, col: 1 }], order: ['b', 'a', 'c', 'e', 'd'] },
  { pieces: [{ id: 'goal', isGoal: true, row: 2, col: 0, len: 2, orient: 'H' }, { id: 'a', len: 2, orient: 'V', row: 4, col: 5 }, { id: 'b', len: 3, orient: 'H', row: 1, col: 3 }, { id: 'c', len: 3, orient: 'H', row: 5, col: 1 }, { id: 'd', len: 3, orient: 'V', row: 2, col: 3 }, { id: 'e', len: 3, orient: 'V', row: 2, col: 4 }], order: ['e', 'c', 'd', 'b', 'a'] },
  { pieces: [{ id: 'goal', isGoal: true, row: 2, col: 0, len: 2, orient: 'H' }, { id: 'a', len: 2, orient: 'V', row: 1, col: 3 }, { id: 'b', len: 3, orient: 'H', row: 5, col: 1 }, { id: 'c', len: 3, orient: 'V', row: 2, col: 5 }, { id: 'd', len: 3, orient: 'H', row: 3, col: 2 }, { id: 'e', len: 3, orient: 'H', row: 1, col: 0 }], order: ['d', 'a', 'e', 'c', 'b'] },
  { pieces: [{ id: 'goal', isGoal: true, row: 2, col: 0, len: 2, orient: 'H' }, { id: 'a', len: 2, orient: 'H', row: 0, col: 2 }, { id: 'b', len: 2, orient: 'V', row: 4, col: 3 }, { id: 'c', len: 2, orient: 'H', row: 1, col: 0 }, { id: 'd', len: 2, orient: 'V', row: 3, col: 4 }, { id: 'e', len: 2, orient: 'V', row: 1, col: 4 }], order: ['d', 'e', 'a', 'b', 'c'] },
  { pieces: [{ id: 'goal', isGoal: true, row: 2, col: 0, len: 2, orient: 'H' }, { id: 'a', len: 3, orient: 'V', row: 1, col: 4 }, { id: 'b', len: 2, orient: 'V', row: 0, col: 2 }, { id: 'c', len: 2, orient: 'H', row: 5, col: 0 }, { id: 'd', len: 2, orient: 'H', row: 3, col: 1 }, { id: 'e', len: 2, orient: 'V', row: 0, col: 3 }], order: ['a', 'c', 'e', 'd', 'b'] },
  { pieces: [{ id: 'goal', isGoal: true, row: 2, col: 0, len: 2, orient: 'H' }, { id: 'a', len: 2, orient: 'H', row: 1, col: 3 }, { id: 'b', len: 2, orient: 'V', row: 2, col: 2 }, { id: 'c', len: 2, orient: 'H', row: 5, col: 1 }, { id: 'd', len: 3, orient: 'H', row: 0, col: 1 }, { id: 'e', len: 3, orient: 'V', row: 2, col: 5 }], order: ['d', 'b', 'a', 'e', 'c'] },
  { pieces: [{ id: 'goal', isGoal: true, row: 2, col: 0, len: 2, orient: 'H' }, { id: 'a', len: 2, orient: 'H', row: 3, col: 4 }, { id: 'b', len: 3, orient: 'V', row: 0, col: 2 }, { id: 'c', len: 2, orient: 'V', row: 0, col: 3 }, { id: 'd', len: 2, orient: 'H', row: 3, col: 1 }, { id: 'e', len: 2, orient: 'H', row: 4, col: 3 }], order: ['e', 'c', 'a', 'd', 'b'] },
  { pieces: [{ id: 'goal', isGoal: true, row: 2, col: 0, len: 2, orient: 'H' }, { id: 'a', len: 2, orient: 'V', row: 0, col: 5 }, { id: 'b', len: 2, orient: 'H', row: 1, col: 2 }, { id: 'c', len: 3, orient: 'H', row: 3, col: 3 }, { id: 'd', len: 2, orient: 'H', row: 4, col: 2 }, { id: 'e', len: 2, orient: 'V', row: 2, col: 2 }], order: ['b', 'e', 'c', 'a', 'd'] },
  { pieces: [{ id: 'goal', isGoal: true, row: 2, col: 0, len: 2, orient: 'H' }, { id: 'a', len: 3, orient: 'H', row: 1, col: 3 }, { id: 'b', len: 3, orient: 'V', row: 1, col: 2 }, { id: 'c', len: 2, orient: 'V', row: 3, col: 3 }, { id: 'd', len: 2, orient: 'H', row: 0, col: 2 }, { id: 'e', len: 2, orient: 'V', row: 3, col: 5 }], order: ['b', 'a', 'e', 'd', 'c'] }
];

PRECOMPUTED_PUZZLES.forEach((puzzle, index) => {
  const solution = findUniqueSolution(puzzle.pieces);
  if (!solution) {
    throw new Error(`Harbor precomputed puzzle ${index} is invalid`);
  }
});

function finalizePuzzle(pieces, solutionOrder) {
  const moverIds = pieces.filter((p) => !p.isGoal).map((p) => p.id);
  return {
    pieces: clonePieces(pieces),
    solutionOrder,
    moverIds
  };
}

function tryGenerate(seedKey, maxAttempts = 40) {
  const baseHash = hashString(`harbor-gen:${seedKey}`);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const rng = createSeededRandom(baseHash + attempt * 7919);
    const pieces = buildCandidateLayout(rng);
    if (!pieces) continue;

    const solutionOrder = findUniqueSolution(pieces);
    if (!solutionOrder) continue;

    return finalizePuzzle(pieces, solutionOrder);
  }

  return null;
}

export function generatePuzzle(seedKey) {
  if (PUZZLE_CACHE.has(seedKey)) return PUZZLE_CACHE.get(seedKey);

  const generated = tryGenerate(seedKey);
  if (generated) {
    PUZZLE_CACHE.set(seedKey, generated);
    return generated;
  }

  const fallback = PRECOMPUTED_PUZZLES[hashString(`harbor:${seedKey}`) % PRECOMPUTED_PUZZLES.length];
  const puzzle = finalizePuzzle(fallback.pieces, fallback.order);
  PUZZLE_CACHE.set(seedKey, puzzle);
  return puzzle;
}

export function pickTemplate(seedKey) {
  return generatePuzzle(seedKey);
}

export { clonePieces, EXIT_ROW, WIDTH, HEIGHT, isGoalExited, canShift };
