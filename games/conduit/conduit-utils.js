import { createSeededRandom, getPTDateYYYYMMDD, hashString } from '../common/utils.js';

export const GRID_MIN = 5;
export const GRID_MAX = 6;
export const STORAGE_KEYS = {
  CONDUIT_PROGRESS: 'dailygrid_conduit_progress'
};

export const DIR_MASKS = {
  N: 1,
  E: 2,
  S: 4,
  W: 8
};

export const DIR_SEQUENCE = ['N', 'E', 'S', 'W'];
export const OPPOSITE_DIR = {
  N: 'S',
  E: 'W',
  S: 'N',
  W: 'E'
};

export function rotateMask(mask, steps = 1) {
  let current = mask;
  for (let i = 0; i < (steps % 4 + 4) % 4; i += 1) {
    let next = 0;
    if (current & DIR_MASKS.N) next |= DIR_MASKS.E;
    if (current & DIR_MASKS.E) next |= DIR_MASKS.S;
    if (current & DIR_MASKS.S) next |= DIR_MASKS.W;
    if (current & DIR_MASKS.W) next |= DIR_MASKS.N;
    current = next;
  }
  return current;
}

export function segmentTypeFromMask(mask) {
  const count = [DIR_MASKS.N, DIR_MASKS.E, DIR_MASKS.S, DIR_MASKS.W]
    .map((flag) => (mask & flag) ? 1 : 0)
    .reduce((a, b) => a + b, 0);
  if (count === 0) return 'empty';
  if (count >= 4) return 'cross';
  if (count === 3) return 'tee';
  if (count === 2) {
    const isVertical = (mask & DIR_MASKS.N) && (mask & DIR_MASKS.S);
    const isHorizontal = (mask & DIR_MASKS.E) && (mask & DIR_MASKS.W);
    return (isVertical || isHorizontal) ? 'straight' : 'elbow';
  }
  return 'endpoint';
}

export function rotateMaskSteps(mask, steps) {
  return rotateMask(mask, steps);
}

function inBounds(r, c, width, height) {
  return r >= 0 && r < height && c >= 0 && c < width;
}

function getNeighbors(r, c, width, height) {
  const out = [];
  if (inBounds(r - 1, c, width, height)) out.push({ r: r - 1, c, dir: 'N' });
  if (inBounds(r, c + 1, width, height)) out.push({ r, c: c + 1, dir: 'E' });
  if (inBounds(r + 1, c, width, height)) out.push({ r: r + 1, c, dir: 'S' });
  if (inBounds(r, c - 1, width, height)) out.push({ r, c: c - 1, dir: 'W' });
  return out;
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function edgePick(edge, width, height, rng, avoid = new Set()) {
  const cells = [];
  if (edge === 'top') {
    for (let c = 0; c < width; c += 1) cells.push({ r: 0, c, dir: 'N' });
  } else if (edge === 'bottom') {
    for (let c = 0; c < width; c += 1) cells.push({ r: height - 1, c, dir: 'S' });
  } else if (edge === 'left') {
    for (let r = 0; r < height; r += 1) cells.push({ r, c: 0, dir: 'W' });
  } else {
    for (let r = 0; r < height; r += 1) cells.push({ r, c: width - 1, dir: 'E' });
  }
  const filtered = cells.filter((cell) => !avoid.has(`${cell.r},${cell.c}`));
  const pool = filtered.length ? filtered : cells;
  return pool[Math.floor(rng() * pool.length)];
}

export async function fetchDescriptor(puzzleId) {
  const id = puzzleId || getPTDateYYYYMMDD();
  try {
    const resp = await fetch(`/api/conduit/puzzle?puzzleId=${id}`);
    if (resp.ok) {
      const data = await resp.json();
      const hasValidGrid = Number.isInteger(data?.width) && Number.isInteger(data?.height) && data.height === data.width;
      const inRange = hasValidGrid && data.width >= GRID_MIN && data.width <= GRID_MAX;
      const hasCells = Array.isArray(data?.solutionCells) && data.solutionCells.length === data.width * data.height;
      const hasEntries = Array.isArray(data?.entryPoints) && data.entryPoints.length >= 2;

      if (inRange && hasCells && hasEntries) {
        return data;
      }
    }
  } catch (error) {
    console.warn('Conduit puzzle fetch failed, falling back to mock descriptor', error);
  }
  return generateMockDescriptor(id);
}

function generateMockDescriptor(puzzleId) {
  const seed = hashString(`conduit:${puzzleId}`);
  const rng = createSeededRandom(seed);
  const size = rng() < 0.5 ? GRID_MIN : GRID_MAX;
  const width = size;
  const height = size;
  const total = width * height;
  const connections = new Array(total).fill(0);

  const visited = new Set();
  const stack = [];
  const startR = Math.floor(rng() * height);
  const startC = Math.floor(rng() * width);
  const startKey = `${startR},${startC}`;
  visited.add(startKey);
  stack.push({ r: startR, c: startC });

  while (stack.length) {
    const current = stack[stack.length - 1];
    const unvisited = shuffleInPlace(getNeighbors(current.r, current.c, width, height), rng)
      .filter((n) => !visited.has(`${n.r},${n.c}`));

    if (!unvisited.length) {
      stack.pop();
      continue;
    }

    const next = unvisited[0];
    const curIdx = current.r * width + current.c;
    const nextIdx = next.r * width + next.c;
    connections[curIdx] |= DIR_MASKS[next.dir];
    connections[nextIdx] |= DIR_MASKS[OPPOSITE_DIR[next.dir]];
    visited.add(`${next.r},${next.c}`);
    stack.push({ r: next.r, c: next.c });
  }

  const sourceEdge = 'top';
  const source = edgePick(sourceEdge, width, height, rng);

  const avoid = new Set([`${source.r},${source.c}`]);
  const exitLeft = edgePick('left', width, height, rng, avoid);
  avoid.add(`${exitLeft.r},${exitLeft.c}`);
  const exitRight = edgePick('right', width, height, rng, avoid);
  avoid.add(`${exitRight.r},${exitRight.c}`);
  const exitBottom = edgePick('bottom', width, height, rng, avoid);

  connections[source.r * width + source.c] |= DIR_MASKS[source.dir];
  connections[exitLeft.r * width + exitLeft.c] |= DIR_MASKS[exitLeft.dir];
  connections[exitRight.r * width + exitRight.c] |= DIR_MASKS[exitRight.dir];
  connections[exitBottom.r * width + exitBottom.c] |= DIR_MASKS[exitBottom.dir];

  const solutionCells = [];
  for (let idx = 0; idx < total; idx += 1) {
    const r = Math.floor(idx / width);
    const c = idx % width;
    const mask = connections[idx];
    solutionCells.push({
      r,
      c,
      connections: mask,
      segmentType: segmentTypeFromMask(mask),
      isPrefill: false,
      isBlocked: false,
      isActive: true
    });
  }

  return {
    puzzleId,
    seed,
    width,
    height,
    entryPoints: [
      { edge: sourceEdge, index: source.c, dir: source.dir, r: source.r, c: source.c, role: 'source' },
      { edge: 'left', index: exitLeft.r, dir: exitLeft.dir, r: exitLeft.r, c: exitLeft.c, role: 'exit' },
      { edge: 'right', index: exitRight.r, dir: exitRight.dir, r: exitRight.r, c: exitRight.c, role: 'exit' },
      { edge: 'bottom', index: exitBottom.c, dir: exitBottom.dir, r: exitBottom.r, c: exitBottom.c, role: 'exit' }
    ],
    solutionCells,
    metadata: {
      difficulty: 'medium',
      activeCount: total,
      blockedCount: 0,
      exitCount: 3
    }
  };
}
