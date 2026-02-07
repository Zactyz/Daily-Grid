import { createSeededRandom, getPTDateYYYYMMDD, hashString } from '../common/utils.js';

export const GRID_SIZE = 7;
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

const BLOCKED_PROBABILITY = 0.14;
const FIXED_PROBABILITY = 0.14;
const DUAL_EXIT_PROBABILITY = 0.42;
const COVERAGE_RANGE = { min: 0.38, max: 0.55 };
const MIN_BRANCH_LENGTH = 2;
const MAX_BRANCH_LENGTH = 4;

function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function coordKey(cell) {
  return `${cell.r},${cell.c}`;
}

function parseKey(key) {
  const [r, c] = key.split(',').map(Number);
  return { r, c };
}

function inBounds(r, c, width, height) {
  return r >= 0 && r < height && c >= 0 && c < width;
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

function neighbors(cell, width, height) {
  const results = [];
  if (inBounds(cell.r - 1, cell.c, width, height)) results.push({ r: cell.r - 1, c: cell.c, dir: 'N', opp: 'S' });
  if (inBounds(cell.r + 1, cell.c, width, height)) results.push({ r: cell.r + 1, c: cell.c, dir: 'S', opp: 'N' });
  if (inBounds(cell.r, cell.c - 1, width, height)) results.push({ r: cell.r, c: cell.c - 1, dir: 'W', opp: 'E' });
  if (inBounds(cell.r, cell.c + 1, width, height)) results.push({ r: cell.r, c: cell.c + 1, dir: 'E', opp: 'W' });
  return results;
}

function pickEdgeCell(edge, blocked, width, height, rng, avoid = new Set()) {
  const candidates = [];
  if (edge === 'top' || edge === 'bottom') {
    const r = edge === 'top' ? 0 : height - 1;
    for (let c = 0; c < width; c += 1) {
      candidates.push({ r, c, dir: edge === 'top' ? 'N' : 'S' });
    }
  } else {
    const c = edge === 'left' ? 0 : width - 1;
    for (let r = 0; r < height; r += 1) {
      candidates.push({ r, c, dir: edge === 'left' ? 'W' : 'E' });
    }
  }

  const trimmed = candidates.filter((cell) => {
    const key = coordKey(cell);
    if (blocked.has(key)) return false;
    return !avoid.has(key);
  });

  const pool = trimmed.length ? trimmed : candidates.filter((cell) => !blocked.has(coordKey(cell)));
  if (!pool.length) return null;
  return pool[randInt(rng, 0, pool.length - 1)];
}

function buildRandomPath(start, goal, blocked, width, height, rng, minLength, forbidden = new Set()) {
  const maxAttempts = 140;
  const maxSteps = width * height * 4;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const visited = new Set([coordKey(start)]);
    const stack = [start];
    let current = start;
    let steps = 0;
    while (steps < maxSteps) {
      steps += 1;
      if (current.r === goal.r && current.c === goal.c && stack.length >= minLength) {
        return [...stack];
      }
      const options = neighbors(current, width, height)
        .map((n) => ({ r: n.r, c: n.c }))
        .filter((cell) => !blocked.has(coordKey(cell)))
        .filter((cell) => !forbidden.has(coordKey(cell)))
        .filter((cell) => !visited.has(coordKey(cell)));

      if (!options.length) {
        if (stack.length <= 1) break;
        stack.pop();
        current = stack[stack.length - 1];
        continue;
      }

      const next = options[randInt(rng, 0, options.length - 1)];
      stack.push(next);
      visited.add(coordKey(next));
      current = next;
    }
  }
  return null;
}

function growBranch(start, blocked, occupied, width, height, rng, length) {
  const path = [start];
  let current = start;
  for (let i = 0; i < length; i += 1) {
    const options = neighbors(current, width, height)
      .map((n) => ({ r: n.r, c: n.c }))
      .filter((cell) => !blocked.has(coordKey(cell)))
      .filter((cell) => !occupied.has(coordKey(cell)));
    if (!options.length) break;
    const next = options[randInt(rng, 0, options.length - 1)];
    path.push(next);
    current = next;
    occupied.add(coordKey(next));
  }
  return path;
}

function addPathEdges(path, connections, width) {
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
}

export async function fetchDescriptor(puzzleId) {
  const id = puzzleId || getPTDateYYYYMMDD();
  try {
    const resp = await fetch(`/api/conduit/puzzle?puzzleId=${id}`);
    if (resp.ok) {
      return await resp.json();
    }
  } catch (error) {
    console.warn('Conduit puzzle fetch failed, falling back to mock descriptor', error);
  }
  return generateMockDescriptor(id);
}

function generateMockDescriptor(puzzleId) {
  const width = GRID_SIZE;
  const height = GRID_SIZE;
  const seed = hashString(`conduit:${puzzleId}`);
  const rng = createSeededRandom(seed);
  const total = width * height;

  for (let attempt = 0; attempt < 160; attempt += 1) {
    const blocked = new Set();
    for (let r = 0; r < height; r += 1) {
      for (let c = 0; c < width; c += 1) {
        if (rng() < BLOCKED_PROBABILITY) {
          blocked.add(coordKey({ r, c }));
        }
      }
    }

    const isVertical = rng() < 0.5;
    const entryEdge = isVertical ? 'top' : 'left';
    const exitEdge = isVertical ? 'bottom' : 'right';
    const dualExit = rng() < DUAL_EXIT_PROBABILITY;

    const entry = pickEdgeCell(entryEdge, blocked, width, height, rng);
    if (!entry) continue;
    const avoid = new Set([coordKey(entry)]);
    const exit1 = pickEdgeCell(exitEdge, blocked, width, height, rng, avoid);
    if (!exit1) continue;
    avoid.add(coordKey(exit1));
    let exit2 = null;
    if (dualExit) {
      exit2 = pickEdgeCell(exitEdge, blocked, width, height, rng, avoid);
    }

    const minLength = Math.max(6, Math.round((width + height) * 0.6));
    const path1 = buildRandomPath(entry, exit1, blocked, width, height, rng, minLength);
    if (!path1) continue;

    const pathSet = new Set(path1.map(coordKey));
    const paths = [path1];

    if (exit2) {
      const minIdx = Math.max(1, Math.floor(path1.length * 0.3));
      const maxIdx = Math.max(minIdx + 1, Math.floor(path1.length * 0.7));
      const branchStart = path1[randInt(rng, minIdx, maxIdx)];
      const forbidden = new Set(pathSet);
      forbidden.delete(coordKey(branchStart));
      const branchMin = Math.max(4, Math.floor(minLength * 0.6));
      const path2 = buildRandomPath(branchStart, exit2, blocked, width, height, rng, branchMin, forbidden);
      if (!path2) continue;
      paths.push(path2);
      path2.forEach((cell) => pathSet.add(coordKey(cell)));
    }

    const availableCount = total - blocked.size;
    const coverage = COVERAGE_RANGE.min + rng() * (COVERAGE_RANGE.max - COVERAGE_RANGE.min);
    let targetCount = Math.min(availableCount, Math.round(availableCount * coverage));
    if (targetCount < pathSet.size) targetCount = pathSet.size;

    let branchAttempts = 0;
    while (pathSet.size < targetCount && branchAttempts < 80) {
      branchAttempts += 1;
      const baseKey = Array.from(pathSet)[randInt(rng, 0, pathSet.size - 1)];
      const base = parseKey(baseKey);
      const branchLen = randInt(rng, MIN_BRANCH_LENGTH, MAX_BRANCH_LENGTH);
      const branchPath = growBranch(base, blocked, pathSet, width, height, rng, branchLen);
      if (branchPath.length <= 1) continue;
      paths.push(branchPath);
    }

    const connections = new Array(total).fill(0);
    paths.forEach((path) => addPathEdges(path, connections, width));

    const entryIdx = entry.r * width + entry.c;
    connections[entryIdx] |= DIR_MASKS[entry.dir];
    const exit1Idx = exit1.r * width + exit1.c;
    connections[exit1Idx] |= DIR_MASKS[exit1.dir];
    let exit2Idx = null;
    if (exit2) {
      exit2Idx = exit2.r * width + exit2.c;
      connections[exit2Idx] |= DIR_MASKS[exit2.dir];
    }

    const activeIndices = [];
    for (let idx = 0; idx < total; idx += 1) {
      if (connections[idx] !== 0 && !blocked.has(coordKey({ r: Math.floor(idx / width), c: idx % width }))) {
        activeIndices.push(idx);
      }
    }

    if (activeIndices.length < Math.floor(total * 0.25)) continue;

    const fixedSet = new Set();
    const reserved = new Set([entryIdx, exit1Idx, exit2Idx].filter((v) => v !== null));
    activeIndices.forEach((idx) => {
      if (reserved.has(idx)) return;
      if (rng() < FIXED_PROBABILITY) fixedSet.add(idx);
    });
    const maxFixed = Math.max(1, Math.floor(activeIndices.length * 0.25));
    while (fixedSet.size > maxFixed) {
      const pick = Array.from(fixedSet)[randInt(rng, 0, fixedSet.size - 1)];
      fixedSet.delete(pick);
    }

    const solutionCells = [];
    for (let idx = 0; idx < total; idx += 1) {
      const r = Math.floor(idx / width);
      const c = idx % width;
      const key = coordKey({ r, c });
      const mask = blocked.has(key) ? 0 : connections[idx];
      const isActive = mask !== 0;
      const type = segmentTypeFromMask(mask);
      solutionCells.push({
        r,
        c,
        connections: mask,
        segmentType: type,
        isPrefill: fixedSet.has(idx),
        isBlocked: blocked.has(key),
        isActive
      });
    }

    const entryPoints = [
      { edge: entryEdge, index: isVertical ? entry.c : entry.r, dir: entry.dir, r: entry.r, c: entry.c, role: 'source' },
      { edge: exitEdge, index: isVertical ? exit1.c : exit1.r, dir: exit1.dir, r: exit1.r, c: exit1.c, role: 'exit' }
    ];
    if (exit2) {
      entryPoints.push({ edge: exitEdge, index: isVertical ? exit2.c : exit2.r, dir: exit2.dir, r: exit2.r, c: exit2.c, role: 'exit' });
    }

    const metadata = {
      difficulty: exit2 ? 'hard' : 'medium',
      activeCount: activeIndices.length,
      blockedCount: blocked.size,
      exitCount: exit2 ? 2 : 1
    };

    return {
      puzzleId,
      seed,
      width,
      height,
      entryPoints,
      solutionCells,
      metadata
    };
  }

  return {
    puzzleId,
    seed: hashString(`conduit:${puzzleId}`),
    width: GRID_SIZE,
    height: GRID_SIZE,
    entryPoints: [],
    solutionCells: [],
    metadata: { difficulty: 'easy', activeCount: 0, blockedCount: 0, exitCount: 0 }
  };
}
