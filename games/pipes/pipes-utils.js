import { createSeededRandom, getPTDateYYYYMMDD, hashString } from '../common/utils.js';

export const GRID_SIZE = 7;
export const STORAGE_KEYS = {
  PIPES_PROGRESS: 'dailygrid_pipes_progress'
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

export function pipeTypeFromMask(mask) {
  const count = [DIR_MASKS.N, DIR_MASKS.E, DIR_MASKS.S, DIR_MASKS.W]
    .map((flag) => (mask & flag) ? 1 : 0)
    .reduce((a, b) => a + b, 0);
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

function buildEdgeRawPath(width, height) {
  const path = [];
  for (let r = 0; r < height; r += 1) {
    if (r % 2 === 0) {
      for (let c = 0; c < width; c += 1) {
        path.push({ r, c });
      }
    } else {
      for (let c = width - 1; c >= 0; c -= 1) {
        path.push({ r, c });
      }
    }
  }
  return path;
}

function getDirectionBetween(from, to) {
  const dr = to.r - from.r;
  const dc = to.c - from.c;
  if (dr === -1) return 'N';
  if (dr === 1) return 'S';
  if (dc === -1) return 'W';
  if (dc === 1) return 'E';
  return null;
}

export async function fetchDescriptor(puzzleId) {
  const id = puzzleId || getPTDateYYYYMMDD();
  try {
    const resp = await fetch(`/api/pipes/puzzle?puzzleId=${id}`);
    if (resp.ok) {
      return await resp.json();
    }
  } catch (error) {
    console.warn('Pipes puzzle fetch failed, falling back to mock descriptor', error);
  }
  return generateMockDescriptor(id);
}

function generateMockDescriptor(puzzleId) {
  const width = GRID_SIZE;
  const height = GRID_SIZE;
  const path = buildEdgeRawPath(width, height);
  const total = width * height;
  const connections = new Array(total).fill(0);

  for (let i = 0; i < path.length - 1; i += 1) {
    const current = path[i];
    const next = path[i + 1];
    const dir = getDirectionBetween(current, next);
    if (!dir) continue;
    const rev = OPPOSITE_DIR[dir];
    const curIdx = current.r * width + current.c;
    const nextIdx = next.r * width + next.c;
    connections[curIdx] |= DIR_MASKS[dir];
    connections[nextIdx] |= DIR_MASKS[rev];
  }

  const entryPoints = [
    { edge: 'left', index: path[0].r, dir: 'W', r: path[0].r, c: path[0].c },
    { edge: 'right', index: path[path.length - 1].r, dir: 'E', r: path[path.length - 1].r, c: path[path.length - 1].c }
  ];
  const startIdx = path[0].r * width + path[0].c;
  const endIdx = path[path.length - 1].r * width + path[path.length - 1].c;
  connections[startIdx] |= DIR_MASKS.W;
  connections[endIdx] |= DIR_MASKS.E;

  const prefillHints = new Set([
    0,
    Math.floor(path.length * 0.35),
    Math.floor(path.length * 0.65),
    path.length - 1
  ]);

  const solutionCells = [];
  const prefilledCells = [];

  for (let idx = 0; idx < total; idx += 1) {
    const r = Math.floor(idx / width);
    const c = idx % width;
    const mask = connections[idx];
    const type = pipeTypeFromMask(mask);
    const isPrefill = prefillHints.has(idx);
    if (isPrefill) {
      prefilledCells.push({ r, c, connections: mask });
    }
    solutionCells.push({
      r,
      c,
      connections: mask,
      pipeType: type === 'endpoint' ? 'straight' : type,
      isPrefill,
      flowPressure: 1 + ((r + c) % 3)
    });
  }

  const phaseSeed = hashString(`pipes:${puzzleId}`) + 0x42;
  const metadata = {
    difficulty: 'medium',
    junctions: solutionCells.filter((cell) => [3, 4].includes(
      [DIR_MASKS.N, DIR_MASKS.E, DIR_MASKS.S, DIR_MASKS.W]
        .filter((dir) => cell.connections & dir).length
    )).length,
    entryCount: entryPoints.length
  };

  const hints = [
    { type: 'edgeCount', target: { edge: 'left', index: path[0].r }, value: 1 },
    { type: 'edgeCount', target: { edge: 'right', index: path[path.length - 1].r }, value: 1 },
    { type: 'forcedTurn', target: { r: Math.floor(height / 2), c: Math.floor(width / 2) }, value: 'E' }
  ];

  return {
    puzzleId,
    seed: hashString(`pipes:${puzzleId}`),
    width,
    height,
    entryPoints,
    solutionCells,
    directionalHints: hints,
    prefilledCells,
    phaseTrace: [
      {
        phase: 'mock:zigzag',
        seed: phaseSeed,
        summary: 'Deterministic zigzag layout for UI preview'
      }
    ],
    metadata
  };
}
