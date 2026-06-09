import { createSeededRandom, hashString } from '../common/utils.js';

const DEFAULT_WIDTH = 7;
const DEFAULT_HEIGHT = 7;
const DEFAULT_EXIT_LINE = 3;
const PUZZLE_VERSION = 3;
const VALID_MOVE_LIMITS = [7, 8];
const MIN_GRAY_VEHICLES = 12;
const MAX_GRAY_VEHICLES = 14;
const PIECE_IDS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const EXIT_SIDES = ['right', 'bottom', 'left', 'top'];
const VALID_EIGHT_MOVE_TYPES = [
  { 2: 'up', 4: 'upTop', 6: 'upTop' },
  { 2: 'up', 4: 'upTop', 6: 'down' },
  { 2: 'up', 4: 'down', 6: 'upTop' },
  { 2: 'down', 4: 'upTop', 6: 'upTop' },
  { 2: 'down', 4: 'upTop', 6: 'down' },
  { 2: 'down', 4: 'down', 6: 'upTop' }
];

const PUZZLE_CACHE = new Map();
const DEFAULT_BOUNDS = {
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
  exitRow: DEFAULT_EXIT_LINE,
  exitCol: DEFAULT_EXIT_LINE,
  exitSide: 'right'
};

function boundsFor(puzzleOrBounds = DEFAULT_BOUNDS) {
  const source = puzzleOrBounds || DEFAULT_BOUNDS;
  const width = source.width ?? DEFAULT_WIDTH;
  const height = source.height ?? DEFAULT_HEIGHT;
  return {
    width,
    height,
    exitSide: source.exitSide ?? 'right',
    exitRow: source.exitRow ?? DEFAULT_EXIT_LINE,
    exitCol: source.exitCol ?? DEFAULT_EXIT_LINE
  };
}

function clonePlan(plan) {
  return plan.map((step) => ({ ...step }));
}

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

function parseCell(cell) {
  const [row, col] = cell.split(',').map(Number);
  return { row, col };
}

function buildOccupancy(pieces, ignoreId = null) {
  const map = new Map();
  pieces.forEach((piece) => {
    if (piece.id === ignoreId) return;
    cellsFor(piece).forEach((key) => map.set(key, piece.id));
  });
  return map;
}

function isInBounds(piece, bounds) {
  if (piece.row < 0 || piece.col < 0) return false;
  if (piece.orient === 'H') return piece.col + piece.len <= bounds.width && piece.row < bounds.height;
  return piece.row + piece.len <= bounds.height && piece.col < bounds.width;
}

function overlapsAny(pieces, candidate) {
  const occ = buildOccupancy(pieces);
  return cellsFor(candidate).some((key) => occ.has(key));
}

function stateKey(pieces) {
  return pieces.map((p) => `${p.id}:${p.row},${p.col}`).join('|');
}

function blockingGoalPathIds(pieces, puzzleOrBounds = DEFAULT_BOUNDS) {
  const bounds = boundsFor(puzzleOrBounds);
  const goal = pieces.find((p) => p.isGoal);
  const blockers = new Set();
  if (!isGoalOnExitLine(goal, bounds)) return blockers;

  const occ = buildOccupancy(pieces, goal.id);
  const addCell = (row, col) => {
    const id = occ.get(`${row},${col}`);
    if (id) blockers.add(id);
  };

  if (bounds.exitSide === 'left') {
    for (let col = 0; col < goal.col; col += 1) addCell(goal.row, col);
    return blockers;
  }

  if (bounds.exitSide === 'top') {
    for (let row = 0; row < goal.row; row += 1) addCell(row, goal.col);
    return blockers;
  }

  if (bounds.exitSide === 'bottom') {
    for (let row = goal.row + goal.len; row < bounds.height; row += 1) addCell(row, goal.col);
    return blockers;
  }

  for (let col = goal.col + goal.len; col < bounds.width; col += 1) addCell(goal.row, col);
  return blockers;
}

function anyBlockingPieceAlreadyUsed(blockers, moverIndex, usedMask) {
  for (const id of blockers) {
    const index = moverIndex.get(id);
    if (index !== undefined && (usedMask & (1 << index)) !== 0) return true;
  }
  return false;
}

function addPiece(pieces, piece, bounds = DEFAULT_BOUNDS) {
  if (!isInBounds(piece, bounds)) return false;
  if (overlapsAny(pieces, piece)) return false;
  pieces.push(piece);
  return true;
}

function nextId(counter) {
  const id = PIECE_IDS[counter.value];
  counter.value += 1;
  return id;
}

function shuffled(items, rng) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function chooseOne(items, rng) {
  return items[Math.floor(rng() * items.length)];
}

export function directionsForPiece(piece) {
  if (!piece || piece.isGoal) return [];
  return piece.orient === 'H'
    ? [{ dr: 0, dc: -1 }, { dr: 0, dc: 1 }]
    : [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }];
}

export function exitDirectionForPuzzle(puzzleOrBounds = DEFAULT_BOUNDS) {
  const bounds = boundsFor(puzzleOrBounds);
  if (bounds.exitSide === 'left') return { dr: 0, dc: -1 };
  if (bounds.exitSide === 'top') return { dr: -1, dc: 0 };
  if (bounds.exitSide === 'bottom') return { dr: 1, dc: 0 };
  return { dr: 0, dc: 1 };
}

function isGoalOnExitLine(goal, puzzleOrBounds = DEFAULT_BOUNDS) {
  const bounds = boundsFor(puzzleOrBounds);
  if (!goal) return false;
  if (bounds.exitSide === 'left' || bounds.exitSide === 'right') {
    return goal.orient === 'H' && goal.row === bounds.exitRow;
  }
  return goal.orient === 'V' && goal.col === bounds.exitCol;
}

export function canShift(pieces, pieceId, dr, dc, steps = 1, puzzleOrBounds = DEFAULT_BOUNDS) {
  const bounds = boundsFor(puzzleOrBounds);
  const piece = pieces.find((p) => p.id === pieceId);
  if (!piece) return false;
  if (piece.orient === 'H' && dr !== 0) return false;
  if (piece.orient === 'V' && dc !== 0) return false;

  const trial = { ...piece, row: piece.row + dr * steps, col: piece.col + dc * steps };
  if (!isInBounds(trial, bounds)) return false;

  const occ = buildOccupancy(pieces, pieceId);
  return cellsFor(trial).every((key) => !occ.has(key));
}

function shiftPiece(pieces, pieceId, dr, dc, steps = 1, puzzleOrBounds = DEFAULT_BOUNDS) {
  if (!canShift(pieces, pieceId, dr, dc, steps, puzzleOrBounds)) return false;
  const piece = pieces.find((p) => p.id === pieceId);
  piece.row += dr * steps;
  piece.col += dc * steps;
  return true;
}

function measureSlide(pieces, pieceId, dr, dc, puzzleOrBounds = DEFAULT_BOUNDS) {
  const trial = clonePieces(pieces);
  let steps = 0;
  while (canShift(trial, pieceId, dr, dc, 1, puzzleOrBounds)) {
    shiftPiece(trial, pieceId, dr, dc, 1, puzzleOrBounds);
    steps += 1;
  }
  return steps;
}

export function getDefaultDirection(pieces, pieceId, puzzleOrBounds = DEFAULT_BOUNDS) {
  const piece = pieces.find((p) => p.id === pieceId);
  if (!piece) return { dr: 0, dc: 0 };
  const options = directionsForPiece(piece).map((dir) => ({
    ...dir,
    dist: measureSlide(pieces, pieceId, dir.dr, dir.dc, puzzleOrBounds)
  }));
  const viable = options.filter((o) => o.dist > 0);
  if (viable.length === 0) return options[1] || options[0];
  const maxDist = Math.max(...viable.map((o) => o.dist));
  const best = viable.filter((o) => o.dist === maxDist);
  return best.find((o) => o.dc === 1)
    || best.find((o) => o.dr === 1)
    || best[0];
}

export function slidePieceDirected(pieces, pieceId, dr, dc, puzzleOrBounds = DEFAULT_BOUNDS) {
  const dist = measureSlide(pieces, pieceId, dr, dc, puzzleOrBounds);
  if (dist > 0) shiftPiece(pieces, pieceId, dr, dc, dist, puzzleOrBounds);
  return dist;
}

export function isGoalExited(pieces, puzzleOrBounds = DEFAULT_BOUNDS) {
  const bounds = boundsFor(puzzleOrBounds);
  const goal = pieces.find((p) => p.isGoal);
  if (!isGoalOnExitLine(goal, bounds)) return false;
  if (bounds.exitSide === 'left') return goal.col <= 0;
  if (bounds.exitSide === 'top') return goal.row <= 0;
  if (bounds.exitSide === 'bottom') return goal.row + goal.len >= bounds.height;
  return goal.col + goal.len >= bounds.width;
}

function tryGoalExit(pieces, puzzleOrBounds = DEFAULT_BOUNDS) {
  const bounds = boundsFor(puzzleOrBounds);
  const goal = pieces.find((p) => p.isGoal);
  if (!isGoalOnExitLine(goal, bounds)) return false;
  const dir = exitDirectionForPuzzle(bounds);
  while (canShift(pieces, goal.id, dir.dr, dir.dc, 1, bounds)) {
    shiftPiece(pieces, goal.id, dir.dr, dir.dc, 1, bounds);
  }
  return isGoalExited(pieces, bounds);
}

export function stepGoalExit(pieces, puzzleOrBounds = DEFAULT_BOUNDS) {
  const bounds = boundsFor(puzzleOrBounds);
  const goal = pieces.find((p) => p.isGoal);
  if (!isGoalOnExitLine(goal, bounds)) return false;
  const dir = exitDirectionForPuzzle(bounds);
  return shiftPiece(pieces, goal.id, dir.dr, dir.dc, 1, bounds);
}

export function slideGoalToExit(pieces, puzzleOrBounds = DEFAULT_BOUNDS) {
  const bounds = boundsFor(puzzleOrBounds);
  const goal = pieces.find((p) => p.isGoal);
  if (!isGoalOnExitLine(goal, bounds)) return 0;
  const dir = exitDirectionForPuzzle(bounds);
  return slidePieceDirected(pieces, goal.id, dir.dr, dir.dc, bounds);
}

export function canGoalExitImmediately(pieces, puzzleOrBounds = DEFAULT_BOUNDS) {
  return tryGoalExit(clonePieces(pieces), puzzleOrBounds);
}

export function simulatePlan(initialPieces, plan, puzzleOrBounds = DEFAULT_BOUNDS) {
  const pieces = clonePieces(initialPieces);
  const moved = new Set();

  for (const step of plan) {
    const distance = slidePieceDirected(pieces, step.id, step.dr, step.dc, puzzleOrBounds);
    if (distance <= 0) {
      return {
        success: false,
        allMoved: false,
        failedMove: step.id
      };
    }
    moved.add(step.id);
  }

  tryGoalExit(pieces, puzzleOrBounds);
  return {
    success: isGoalExited(pieces, puzzleOrBounds),
    allMoved: moved.size === plan.length,
    failedMove: null
  };
}

export function findShortestPlan(initialPieces, puzzleOrBounds = DEFAULT_BOUNDS, maxDepth = 8) {
  const bounds = boundsFor(puzzleOrBounds);
  const movers = initialPieces.filter((p) => !p.isGoal);
  const moverIndex = new Map(movers.map((piece, index) => [piece.id, index]));
  const initialBlockers = blockingGoalPathIds(initialPieces, bounds);
  if (initialBlockers.size === 0) return [];
  if (initialBlockers.size > maxDepth) return null;

  let frontier = [{ pieces: clonePieces(initialPieces), usedMask: 0, plan: [] }];
  const seen = new Set([`${stateKey(initialPieces)}#0`]);

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const nextFrontier = [];
    for (const node of frontier) {
      const blockers = blockingGoalPathIds(node.pieces, bounds);
      if (blockers.size === 0) return node.plan;
      if (anyBlockingPieceAlreadyUsed(blockers, moverIndex, node.usedMask)) continue;
      if (node.plan.length + blockers.size > maxDepth) continue;

      const orderedMovers = [
        ...movers.filter((mover) => blockers.has(mover.id)),
        ...movers.filter((mover) => !blockers.has(mover.id))
      ];

      for (const mover of orderedMovers) {
        const bit = 1 << moverIndex.get(mover.id);
        if ((node.usedMask & bit) !== 0) continue;

        for (const dir of directionsForPiece(mover)) {
          const pieces = clonePieces(node.pieces);
          const distance = slidePieceDirected(pieces, mover.id, dir.dr, dir.dc, bounds);
          if (distance <= 0) continue;

          const nextPlan = [...node.plan, { id: mover.id, dr: dir.dr, dc: dir.dc }];
          const usedMask = node.usedMask | bit;
          const nextBlockers = blockingGoalPathIds(pieces, bounds);
          if (nextBlockers.size === 0) return nextPlan;
          if (anyBlockingPieceAlreadyUsed(nextBlockers, moverIndex, usedMask)) continue;
          if (nextPlan.length + nextBlockers.size > maxDepth) continue;

          const key = `${stateKey(pieces)}#${usedMask}`;
          if (seen.has(key)) continue;
          seen.add(key);
          nextFrontier.push({ pieces, usedMask, plan: nextPlan });
        }
      }
    }
    frontier = nextFrontier;
    if (frontier.length === 0) break;
  }

  return null;
}

function transformPiece(piece, transformCell) {
  const transformed = cellsFor(piece).map((cell) => transformCell(parseCell(cell)));
  const rows = transformed.map((cell) => cell.row);
  const cols = transformed.map((cell) => cell.col);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  return {
    ...piece,
    row: minRow,
    col: minCol,
    len: transformed.length,
    orient: minRow === maxRow ? 'H' : 'V'
  };
}

function transformPieces(pieces, { mirrorRows, rotation }) {
  const size = DEFAULT_WIDTH;
  const transforms = [];
  if (mirrorRows) {
    transforms.push((cell) => ({ row: size - 1 - cell.row, col: cell.col }));
  }
  for (let i = 0; i < rotation; i += 1) {
    transforms.push((cell) => ({ row: cell.col, col: size - 1 - cell.row }));
  }

  return pieces.map((piece) => transformPiece(piece, (cell) => (
    transforms.reduce((acc, fn) => fn(acc), cell)
  )));
}

function pieceCanMoveInitially(pieces, piece, bounds = DEFAULT_BOUNDS) {
  return directionsForPiece(piece).some((dir) => canShift(pieces, piece.id, dir.dr, dir.dc, 1, bounds));
}

function isCanonicalExitLaneCell(cell) {
  const { row, col } = parseCell(cell);
  return row === DEFAULT_EXIT_LINE && col >= 2;
}

function quadrantForCell(row, col, bounds = DEFAULT_BOUNDS) {
  const bottom = row >= Math.floor(bounds.height / 2);
  const right = col >= Math.floor(bounds.width / 2);
  return (bottom ? 2 : 0) + (right ? 1 : 0);
}

function scoreDecoyCandidate(piece, pieces, bounds, rng) {
  const rowCounts = Array(bounds.height).fill(0);
  const colCounts = Array(bounds.width).fill(0);
  const quadrantCounts = [0, 0, 0, 0];

  pieces
    .filter((p) => !p.isGoal)
    .forEach((existing) => {
      cellsFor(existing).forEach((cell) => {
        const { row, col } = parseCell(cell);
        rowCounts[row] += 1;
        colCounts[col] += 1;
        quadrantCounts[quadrantForCell(row, col, bounds)] += 1;
      });
    });

  let score = rng() * 0.5;
  const seenQuadrants = new Set();

  cellsFor(piece).forEach((cell) => {
    const { row, col } = parseCell(cell);
    const quadrant = quadrantForCell(row, col, bounds);
    seenQuadrants.add(quadrant);
    score += Math.max(0, 4 - rowCounts[row]);
    score += Math.max(0, 4 - colCounts[col]);
    score -= quadrantCounts[quadrant] * 0.55;
    if (row === 0 || row === bounds.height - 1) score -= 1.25;
    if (col === 0 || col === bounds.width - 1) score -= 1;
    if (row === DEFAULT_EXIT_LINE || col === DEFAULT_EXIT_LINE) score += 0.2;
  });

  seenQuadrants.forEach((quadrant) => {
    if (quadrantCounts[quadrant] <= 2) score += 2.5;
  });

  if (piece.len === 3) score -= 2.25;
  return score;
}

function makeDependencyTypes(moveLimit, rng) {
  if (moveLimit === 8) return { ...chooseOne(VALID_EIGHT_MOVE_TYPES, rng) };

  const lockColumns = shuffled([2, 4, 6], rng).slice(0, 2);
  const types = {};
  lockColumns.forEach((col) => {
    const options = col === 2 ? ['up', 'down'] : ['upTop', 'down'];
    types[col] = chooseOne(options, rng);
  });

  if (types[4] === 'down' && types[6] === 'down') {
    types[chooseOne([4, 6], rng)] = 'upTop';
  }

  return types;
}

function addOrganicDecoys(pieces, counter, rng, targetCount) {
  const bounds = DEFAULT_BOUNDS;
  let misses = 0;

  while (pieces.filter((p) => !p.isGoal).length < targetCount && misses < 90) {
    const candidates = [];

    for (let i = 0; i < 34; i += 1) {
      const orient = rng() < 0.54 ? 'H' : 'V';
      const len = rng() < 0.08 ? 3 : 2;
      const maxRow = orient === 'V' ? bounds.height - len : bounds.height - 1;
      const maxCol = orient === 'H' ? bounds.width - len : bounds.width - 1;
      const piece = {
        id: PIECE_IDS[counter.value],
        len,
        orient,
        row: Math.floor(rng() * (maxRow + 1)),
        col: Math.floor(rng() * (maxCol + 1))
      };

      if (cellsFor(piece).some(isCanonicalExitLaneCell)) continue;
      if (!isInBounds(piece, bounds) || overlapsAny(pieces, piece)) continue;

      const trialPieces = [...pieces, piece];
      if (!pieceCanMoveInitially(trialPieces, piece, bounds)) continue;

      candidates.push({
        piece,
        score: scoreDecoyCandidate(piece, pieces, bounds, rng)
      });
    }

    if (candidates.length === 0) {
      misses += 1;
      continue;
    }

    candidates.sort((a, b) => b.score - a.score);
    pieces.push(candidates[0].piece);
    counter.value += 1;
    misses = 0;
  }
}

function collectLineStats(pieces, solutionIds, bounds) {
  const rows = Array.from({ length: bounds.height }, () => ({
    cells: 0,
    inactiveCells: 0,
    pieces: new Set(),
    inactivePieces: new Set()
  }));
  const cols = Array.from({ length: bounds.width }, () => ({
    cells: 0,
    inactiveCells: 0,
    pieces: new Set(),
    inactivePieces: new Set()
  }));

  pieces
    .filter((piece) => !piece.isGoal)
    .forEach((piece) => {
      const isInactive = !solutionIds.has(piece.id);
      cellsFor(piece).forEach((cell) => {
        const { row, col } = parseCell(cell);
        rows[row].cells += 1;
        rows[row].pieces.add(piece.id);
        cols[col].cells += 1;
        cols[col].pieces.add(piece.id);
        if (isInactive) {
          rows[row].inactiveCells += 1;
          rows[row].inactivePieces.add(piece.id);
          cols[col].inactiveCells += 1;
          cols[col].inactivePieces.add(piece.id);
        }
      });
    });

  return { rows, cols };
}

function passesVisualDiversity(puzzle, solutionPlan) {
  const bounds = boundsFor(puzzle);
  const grayPieces = puzzle.pieces.filter((piece) => !piece.isGoal);
  const solutionIds = new Set(solutionPlan.map((step) => step.id));
  const inactivePieces = grayPieces.filter((piece) => !solutionIds.has(piece.id));
  const horizontalCount = grayPieces.filter((piece) => piece.orient === 'H').length;
  const verticalCount = grayPieces.length - horizontalCount;

  if (inactivePieces.length < 4) return false;
  if (horizontalCount < 4 || verticalCount < 4) return false;
  if (inactivePieces.filter((piece) => piece.len >= 3).length > 1) return false;

  const quadrants = [0, 0, 0, 0];
  const inactiveQuadrants = [0, 0, 0, 0];
  grayPieces.forEach((piece) => {
    const touched = new Set();
    cellsFor(piece).forEach((cell) => {
      const { row, col } = parseCell(cell);
      touched.add(quadrantForCell(row, col, bounds));
    });
    touched.forEach((quadrant) => {
      quadrants[quadrant] += 1;
      if (!solutionIds.has(piece.id)) inactiveQuadrants[quadrant] += 1;
    });
  });

  if (quadrants.filter(Boolean).length < 4) return false;
  if (inactiveQuadrants.filter(Boolean).length < 3) return false;

  const { rows, cols } = collectLineStats(grayPieces, solutionIds, bounds);
  const horizontalExit = bounds.exitSide === 'left' || bounds.exitSide === 'right';
  const exitLine = horizontalExit ? bounds.exitRow : bounds.exitCol;

  for (let row = 0; row < bounds.height; row += 1) {
    if (horizontalExit && row === exitLine) continue;
    const stats = rows[row];
    const isEdge = row === 0 || row === bounds.height - 1;
    if (stats.inactiveCells >= 5) return false;
    if (stats.inactivePieces.size >= 4) return false;
    if (isEdge && stats.cells >= 6) return false;
    if (!isEdge && stats.cells >= 7 && stats.inactiveCells >= 3) return false;
  }

  for (let col = 0; col < bounds.width; col += 1) {
    if (!horizontalExit && col === exitLine) continue;
    const stats = cols[col];
    const isEdge = col === 0 || col === bounds.width - 1;
    if (stats.inactiveCells >= 5) return false;
    if (stats.inactivePieces.size >= 4) return false;
    if (isEdge && stats.cells >= 6) return false;
    if (!isEdge && stats.cells >= 7 && stats.inactiveCells >= 3) return false;
  }

  return true;
}

function makeCanonicalPieces(dependencyTypes, rng, targetCount) {
  const bounds = DEFAULT_BOUNDS;
  const counter = { value: 0 };
  const pieces = [
    { id: 'goal', isGoal: true, row: DEFAULT_EXIT_LINE, col: 0, len: 2, orient: 'H' }
  ];

  for (const col of [2, 3, 4, 5, 6]) {
    const type = dependencyTypes[col];
    const primary = type === 'down'
      ? { id: nextId(counter), len: 2, orient: 'V', row: 3, col }
      : { id: nextId(counter), len: type === 'upTop' ? 3 : 2, orient: 'V', row: type === 'upTop' ? 1 : 2, col };

    if (!addPiece(pieces, primary, bounds)) return null;
  }

  for (const rawCol of Object.keys(dependencyTypes)) {
    const col = Number(rawCol);
    const type = dependencyTypes[col];
    if (type === 'down') {
      if (!addPiece(pieces, {
        id: nextId(counter),
        len: 2,
        orient: 'H',
        row: 5,
        col: col - 1
      }, bounds)) return null;
      if (!addPiece(pieces, {
        id: nextId(counter),
        len: 2,
        orient: 'H',
        row: 2,
        col: col - 1
      }, bounds)) return null;
      continue;
    }

    if (!addPiece(pieces, {
      id: nextId(counter),
      len: 2,
      orient: 'H',
      row: type === 'upTop' ? 0 : 1,
      col: col - 1
    }, bounds)) return null;
    if (!addPiece(pieces, {
      id: nextId(counter),
      len: 2,
      orient: 'H',
      row: 4,
      col: col - 1
    }, bounds)) return null;
  }

  addOrganicDecoys(pieces, counter, rng, targetCount);
  return pieces;
}

function buildCandidate(seedKey, attempt) {
  const rng = createSeededRandom(hashString(`harbor:${seedKey}:${attempt}`));
  const moveLimit = rng() < 0.55 ? 7 : 8;
  const dependencyTypes = makeDependencyTypes(moveLimit, rng);
  const targetCount = MIN_GRAY_VEHICLES + Math.floor(rng() * (MAX_GRAY_VEHICLES - MIN_GRAY_VEHICLES + 1));
  const mirrorRows = rng() < 0.5;
  const rotation = Math.floor(rng() * 4);
  const canonicalPieces = makeCanonicalPieces(dependencyTypes, rng, targetCount);
  if (!canonicalPieces || canonicalPieces.filter((p) => !p.isGoal).length < MIN_GRAY_VEHICLES) return null;

  const pieces = transformPieces(canonicalPieces, { mirrorRows, rotation });
  const exitSide = EXIT_SIDES[rotation];
  const selectableIds = pieces.filter((p) => !p.isGoal).map((p) => p.id);

  return {
    version: PUZZLE_VERSION,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    exitSide,
    exitRow: DEFAULT_EXIT_LINE,
    exitCol: DEFAULT_EXIT_LINE,
    moveLimit,
    selectableIds,
    moverIds: [...selectableIds],
    pieces
  };
}

function finalizePuzzle(seedKey) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const puzzle = buildCandidate(seedKey, attempt);
    if (!puzzle) continue;
    const shortestPlan = findShortestPlan(puzzle.pieces, puzzle, puzzle.moveLimit);
    if (!shortestPlan || shortestPlan.length !== puzzle.moveLimit) continue;
    const simulated = simulatePlan(puzzle.pieces, shortestPlan, puzzle);
    if (!simulated.success || !simulated.allMoved) continue;
    if (!passesVisualDiversity(puzzle, shortestPlan)) continue;
    return {
      ...puzzle,
      solutionPlan: clonePlan(shortestPlan)
    };
  }

  throw new Error(`Unable to generate a verified Harbor puzzle for seed ${seedKey}`);
}

export function validatePuzzleDescriptor(puzzle) {
  const errors = [];
  const bounds = boundsFor(puzzle);
  const pieces = puzzle?.pieces || [];
  const grayPieces = pieces.filter((p) => !p.isGoal);
  const goal = pieces.find((p) => p.isGoal);

  if (bounds.width !== DEFAULT_WIDTH || bounds.height !== DEFAULT_HEIGHT) {
    errors.push(`Expected ${DEFAULT_WIDTH}x${DEFAULT_HEIGHT}, got ${bounds.width}x${bounds.height}`);
  }
  if (!EXIT_SIDES.includes(bounds.exitSide)) errors.push(`Invalid exitSide ${bounds.exitSide}`);
  if (!goal) errors.push('Missing goal piece');
  else if (!isGoalOnExitLine(goal, bounds)) errors.push('Goal must point along the exit line');
  if (grayPieces.length < MIN_GRAY_VEHICLES || grayPieces.length > MAX_GRAY_VEHICLES) {
    errors.push(`Expected ${MIN_GRAY_VEHICLES}-${MAX_GRAY_VEHICLES} gray vehicles, got ${grayPieces.length}`);
  }
  if (!VALID_MOVE_LIMITS.includes(puzzle?.moveLimit)) {
    errors.push(`Expected moveLimit ${VALID_MOVE_LIMITS.join(' or ')}, got ${puzzle?.moveLimit}`);
  }
  if (!Array.isArray(puzzle?.solutionPlan) || puzzle.solutionPlan.length !== puzzle?.moveLimit) {
    errors.push('Solution plan length must equal moveLimit');
  }
  if (!Array.isArray(puzzle?.selectableIds) || puzzle.selectableIds.length !== grayPieces.length) {
    errors.push('selectableIds must include every gray vehicle');
  }

  const seenCells = new Map();
  for (const piece of pieces) {
    if (!isInBounds(piece, bounds)) errors.push(`Piece ${piece.id} is out of bounds`);
    for (const cell of cellsFor(piece)) {
      if (seenCells.has(cell)) errors.push(`Pieces ${seenCells.get(cell)} and ${piece.id} overlap at ${cell}`);
      seenCells.set(cell, piece.id);
    }
  }

  if (canGoalExitImmediately(pieces, bounds)) errors.push('Goal can exit immediately');

  let shortestPlan = null;
  if (errors.length === 0) {
    const simulated = simulatePlan(pieces, puzzle.solutionPlan, bounds);
    if (!simulated.success || !simulated.allMoved) errors.push('Stored solution plan does not solve cleanly');
    shortestPlan = findShortestPlan(pieces, bounds, puzzle.moveLimit);
    if (!shortestPlan) errors.push('No solution found within moveLimit');
    else if (shortestPlan.length !== puzzle.moveLimit) {
      errors.push(`Shortest solution is ${shortestPlan.length}, expected ${puzzle.moveLimit}`);
    } else if (!passesVisualDiversity(puzzle, shortestPlan)) {
      errors.push('Layout does not pass Harbor visual diversity checks');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    shortestPlan
  };
}

export function generatePuzzle(seedKey) {
  if (PUZZLE_CACHE.has(seedKey)) return PUZZLE_CACHE.get(seedKey);
  const puzzle = finalizePuzzle(seedKey);
  PUZZLE_CACHE.set(seedKey, puzzle);
  return puzzle;
}

export function pickTemplate(seedKey) {
  return generatePuzzle(seedKey);
}

export {
  clonePieces,
  DEFAULT_EXIT_LINE as EXIT_ROW,
  DEFAULT_WIDTH as WIDTH,
  DEFAULT_HEIGHT as HEIGHT,
  PUZZLE_VERSION
};
