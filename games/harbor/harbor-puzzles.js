import { hashString } from '../common/utils.js';

const WIDTH = 6;
const HEIGHT = 6;
const EXIT_ROW = 2;

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

/** Slide the goal one cell right when legal (for stepped exit animation). */
export function stepGoalExit(pieces) {
  const goal = pieces.find((p) => p.isGoal);
  if (!goal || goal.row !== EXIT_ROW) return false;
  return shiftPiece(pieces, goal.id, 0, 1);
}

export function simulateTemplate(template) {
  const pieces = clonePieces(template.pieces);
  for (const id of template.order) {
    const move = template.moves[id];
    const steps = Math.max(Math.abs(move.dr), Math.abs(move.dc));
    if (!shiftPiece(pieces, id, Math.sign(move.dr), Math.sign(move.dc), steps)) {
      return false;
    }
  }
  return tryGoalExit(pieces);
}

/** Verified puzzles with 4–5 blocks; order is the unique solve sequence. */
export const PUZZLE_TEMPLATES = [
  {
    pieces: [
      { id: 'goal', isGoal: true, row: 2, col: 0, len: 2, orient: 'H' },
      { id: 'a', row: 0, col: 0, len: 2, orient: 'H' },
      { id: 'b', row: 0, col: 2, len: 2, orient: 'H' },
      { id: 'c', row: 1, col: 0, len: 2, orient: 'H' }
    ],
    order: ['b', 'a', 'c', 'goal'],
    moves: { b: { dr: 0, dc: 1 }, a: { dr: 0, dc: 1 }, c: { dr: 0, dc: 1 }, goal: { dr: 0, dc: 1 } }
  },
  {
    pieces: [
      { id: 'goal', isGoal: true, row: 2, col: 0, len: 2, orient: 'H' },
      { id: 'a', row: 0, col: 0, len: 2, orient: 'H' },
      { id: 'b', row: 0, col: 2, len: 2, orient: 'H' },
      { id: 'c', row: 1, col: 1, len: 2, orient: 'H' }
    ],
    order: ['b', 'a', 'c', 'goal'],
    moves: { b: { dr: 0, dc: 1 }, a: { dr: 0, dc: 1 }, c: { dr: 0, dc: 1 }, goal: { dr: 0, dc: 1 } }
  },
  {
    pieces: [
      { id: 'goal', isGoal: true, row: 2, col: 0, len: 2, orient: 'H' },
      { id: 'a', row: 0, col: 0, len: 2, orient: 'H' },
      { id: 'b', row: 0, col: 2, len: 2, orient: 'H' },
      { id: 'c', row: 1, col: 0, len: 2, orient: 'H' },
      { id: 'd', row: 1, col: 2, len: 2, orient: 'H' }
    ],
    order: ['b', 'a', 'd', 'c', 'goal'],
    moves: { b: { dr: 0, dc: 1 }, a: { dr: 0, dc: 1 }, d: { dr: 0, dc: 1 }, c: { dr: 0, dc: 1 }, goal: { dr: 0, dc: 1 } }
  },
  {
    pieces: [
      { id: 'goal', isGoal: true, row: 2, col: 0, len: 2, orient: 'H' },
      { id: 'a', row: 0, col: 0, len: 2, orient: 'H' },
      { id: 'b', row: 0, col: 2, len: 2, orient: 'H' },
      { id: 'c', row: 1, col: 0, len: 2, orient: 'H' },
      { id: 'd', row: 1, col: 2, len: 2, orient: 'V' }
    ],
    order: ['b', 'a', 'd', 'c', 'goal'],
    moves: { b: { dr: 0, dc: 1 }, a: { dr: 0, dc: 1 }, d: { dr: 2, dc: 0 }, c: { dr: 0, dc: 1 }, goal: { dr: 0, dc: 1 } }
  },
  {
    pieces: [
      { id: 'goal', isGoal: true, row: 2, col: 0, len: 2, orient: 'H' },
      { id: 'a', row: 0, col: 0, len: 2, orient: 'H' },
      { id: 'b', row: 0, col: 2, len: 2, orient: 'H' },
      { id: 'c', row: 1, col: 0, len: 2, orient: 'H' },
      { id: 'd', row: 1, col: 3, len: 2, orient: 'H' }
    ],
    order: ['b', 'a', 'c', 'd', 'goal'],
    moves: { b: { dr: 0, dc: 1 }, a: { dr: 0, dc: 1 }, c: { dr: 0, dc: 1 }, d: { dr: 0, dc: 1 }, goal: { dr: 0, dc: 1 } }
  },
  {
    pieces: [
      { id: 'goal', isGoal: true, row: 2, col: 0, len: 2, orient: 'H' },
      { id: 'a', row: 0, col: 0, len: 2, orient: 'H' },
      { id: 'b', row: 0, col: 2, len: 2, orient: 'H' },
      { id: 'c', row: 1, col: 0, len: 2, orient: 'H' },
      { id: 'd', row: 1, col: 3, len: 2, orient: 'V' }
    ],
    order: ['b', 'a', 'c', 'd', 'goal'],
    moves: { b: { dr: 0, dc: 1 }, a: { dr: 0, dc: 1 }, c: { dr: 0, dc: 1 }, d: { dr: 2, dc: 0 }, goal: { dr: 0, dc: 1 } }
  }
];

PUZZLE_TEMPLATES.forEach((template, index) => {
  if (!simulateTemplate(template)) {
    throw new Error(`Harbor puzzle template ${index} is invalid`);
  }
});

export function pickTemplate(seedKey) {
  const index = hashString(`harbor:${seedKey}`) % PUZZLE_TEMPLATES.length;
  return PUZZLE_TEMPLATES[index];
}

export function applyPieceMove(pieces, pieceId, move) {
  const steps = Math.max(Math.abs(move.dr), Math.abs(move.dc));
  return shiftPiece(pieces, pieceId, Math.sign(move.dr), Math.sign(move.dc), steps);
}

export function applyGoalExit(pieces) {
  return tryGoalExit(pieces);
}

export { clonePieces, EXIT_ROW, WIDTH, HEIGHT, isGoalExited, canShift };
