import { createSeededRandom, hashString, normalizeWall } from '../common/utils.js';

const GRID_RANGE = { min: 5, max: 7 };
const REGION_FILL_RANGE = { min: 0.35, max: 0.55 };
const CLUE_HIDE_PROB = 0.45;

function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function cellKey(cell) {
  return `${cell.r},${cell.c}`;
}

function parseCellKey(key) {
  const [r, c] = key.split(',').map(Number);
  return { r, c };
}

function inBounds(r, c, size) {
  return r >= 0 && r < size && c >= 0 && c < size;
}

function neighbors(cell, size) {
  const results = [];
  if (inBounds(cell.r - 1, cell.c, size)) results.push({ r: cell.r - 1, c: cell.c });
  if (inBounds(cell.r + 1, cell.c, size)) results.push({ r: cell.r + 1, c: cell.c });
  if (inBounds(cell.r, cell.c - 1, size)) results.push({ r: cell.r, c: cell.c - 1 });
  if (inBounds(cell.r, cell.c + 1, size)) results.push({ r: cell.r, c: cell.c + 1 });
  return results;
}

function buildRegion(size, target, rng) {
  const region = new Set();
  const start = { r: randInt(rng, 0, size - 1), c: randInt(rng, 0, size - 1) };
  region.add(cellKey(start));
  const frontier = [start];
  let guard = 0;

  while (region.size < target && frontier.length && guard < size * size * 10) {
    guard += 1;
    const baseIndex = randInt(rng, 0, frontier.length - 1);
    const base = frontier[baseIndex];
    const options = neighbors(base, size).filter((cell) => !region.has(cellKey(cell)));
    if (!options.length) {
      frontier.splice(baseIndex, 1);
      continue;
    }
    const next = options[randInt(rng, 0, options.length - 1)];
    region.add(cellKey(next));
    frontier.push(next);
  }

  return region;
}

function hasHoles(region, size) {
  const visited = new Set();
  const queue = [];

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (r !== 0 && c !== 0 && r !== size - 1 && c !== size - 1) continue;
      const key = `${r},${c}`;
      if (region.has(key)) continue;
      visited.add(key);
      queue.push({ r, c });
    }
  }

  while (queue.length) {
    const current = queue.shift();
    neighbors(current, size).forEach((neighbor) => {
      const key = cellKey(neighbor);
      if (region.has(key) || visited.has(key)) return;
      visited.add(key);
      queue.push(neighbor);
    });
  }

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const key = `${r},${c}`;
      if (!region.has(key) && !visited.has(key)) return true;
    }
  }

  return false;
}

function regionToEdges(region, size) {
  const edges = new Set();
  const addEdge = (x1, y1, x2, y2) => {
    edges.add(normalizeWall([x1, y1], [x2, y2]));
  };

  region.forEach((key) => {
    const { r, c } = parseCellKey(key);
    if (r === 0 || !region.has(`${r - 1},${c}`)) {
      addEdge(c, r, c + 1, r);
    }
    if (r === size - 1 || !region.has(`${r + 1},${c}`)) {
      addEdge(c, r + 1, c + 1, r + 1);
    }
    if (c === 0 || !region.has(`${r},${c - 1}`)) {
      addEdge(c, r, c, r + 1);
    }
    if (c === size - 1 || !region.has(`${r},${c + 1}`)) {
      addEdge(c + 1, r, c + 1, r + 1);
    }
  });

  return edges;
}

function countEdgesAroundCell(edges, r, c) {
  const top = normalizeWall([c, r], [c + 1, r]);
  const right = normalizeWall([c + 1, r], [c + 1, r + 1]);
  const bottom = normalizeWall([c, r + 1], [c + 1, r + 1]);
  const left = normalizeWall([c, r], [c, r + 1]);
  let count = 0;
  if (edges.has(top)) count += 1;
  if (edges.has(right)) count += 1;
  if (edges.has(bottom)) count += 1;
  if (edges.has(left)) count += 1;
  return count;
}

function buildClues(edges, size, rng) {
  const clues = [];
  let visible = 0;
  const totalCells = size * size;
  const minVisible = Math.max(6, Math.floor(totalCells * 0.35));

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const value = countEdgesAroundCell(edges, r, c);
      let isGiven = rng() > CLUE_HIDE_PROB;
      if (value === 0 && rng() < 0.6) isGiven = false;
      if (isGiven) visible += 1;
      clues.push({ r, c, value, isGiven });
    }
  }

  if (visible < minVisible) {
    const hidden = clues.filter((clue) => !clue.isGiven);
    const prefer = hidden.filter((clue) => clue.value > 0);
    while (visible < minVisible && hidden.length) {
      const pool = prefer.length ? prefer : hidden;
      const pickIndex = randInt(rng, 0, pool.length - 1);
      const pick = pool[pickIndex];
      pick.isGiven = true;
      visible += 1;
      hidden.splice(hidden.indexOf(pick), 1);
      const preferIndex = prefer.indexOf(pick);
      if (preferIndex >= 0) prefer.splice(preferIndex, 1);
    }
  }

  return clues;
}

function generatePuzzle(seedKey) {
  const seed = hashString(`perimeter:${seedKey}`);
  const rng = createSeededRandom(seed);

  for (let attempt = 0; attempt < 140; attempt += 1) {
    const size = randInt(rng, GRID_RANGE.min, GRID_RANGE.max);
    const target = randInt(
      rng,
      Math.floor(size * size * REGION_FILL_RANGE.min),
      Math.floor(size * size * REGION_FILL_RANGE.max)
    );
    const region = buildRegion(size, target, rng);
    if (hasHoles(region, size)) continue;
    const edges = regionToEdges(region, size);
    if (!edges.size) continue;
    const clues = buildClues(edges, size, rng);
    return {
      size,
      solutionEdges: edges,
      clues
    };
  }

  const fallbackSize = GRID_RANGE.min;
  const fallbackRegion = new Set();
  fallbackRegion.add('1,1');
  fallbackRegion.add('1,2');
  fallbackRegion.add('2,1');
  fallbackRegion.add('2,2');
  return {
    size: fallbackSize,
    solutionEdges: regionToEdges(fallbackRegion, fallbackSize),
    clues: buildClues(regionToEdges(fallbackRegion, fallbackSize), fallbackSize, createSeededRandom(seed))
  };
}

function parseEdgeKey(key) {
  const [a, b] = key.split('-').map((part) => part.split(',').map(Number));
  return { a, b };
}

export class PerimeterEngine {
  constructor(seedKey) {
    this.seedKey = seedKey;
    this.puzzle = generatePuzzle(seedKey);
    this.edgeStates = new Map();
    this.timeMs = 0;
    this.timerStarted = false;
    this.isPaused = false;
    this.isComplete = false;
    this.hintsUsed = 0;
    this.syncStatus();
  }

  reset() {
    this.edgeStates.clear();
    this.timeMs = 0;
    this.timerStarted = false;
    this.isPaused = false;
    this.isComplete = false;
    this.syncStatus();
  }

  getGridSize() {
    return this.puzzle.size;
  }

  getGridWidth() {
    return this.puzzle.size + 1;
  }

  getGridHeight() {
    return this.puzzle.size + 1;
  }

  getGridLabel() {
    return `${this.puzzle.size}x${this.puzzle.size} cells`;
  }

  getClues() {
    return this.puzzle.clues;
  }

  getLineEdges() {
    return Array.from(this.lineEdges || []);
  }

  getCrossEdges() {
    return Array.from(this.crossEdges || []);
  }

  getClueStates() {
    return this.clueStates || new Map();
  }

  getDegreeMap() {
    return this.degreeMap || new Map();
  }

  getInvalidNodes() {
    return this.invalidNodes || new Set();
  }

  getClueProgress() {
    const clueStates = this.getClueStates();
    let total = 0;
    let satisfied = 0;
    this.puzzle.clues.forEach((clue) => {
      if (!clue.isGiven) return;
      total += 1;
      const state = clueStates.get(cellKey(clue));
      if (state && state.lineCount === clue.value) satisfied += 1;
    });
    return { satisfied, total };
  }

  startTimer() {
    if (this.isComplete) return;
    this.timerStarted = true;
    this.isPaused = false;
  }

  pause() {
    if (!this.timerStarted || this.isComplete) return;
    this.isPaused = true;
  }

  resume() {
    if (!this.timerStarted || this.isComplete) return;
    this.isPaused = false;
  }

  updateTime(delta) {
    if (!this.timerStarted || this.isPaused || this.isComplete) return;
    this.timeMs += delta;
  }

  setEdgeState(key, state) {
    if (state === 0) {
      this.edgeStates.delete(key);
    } else {
      this.edgeStates.set(key, state);
    }
  }

  toggleEdge(a, b) {
    const key = normalizeWall(a, b);
    const current = this.edgeStates.get(key) || 0;
    let next = 0;
    if (current === 0) next = 1;
    else if (current === 1) next = -1;
    else next = 0;
    this.setEdgeState(key, next);
    this.syncStatus();
    return true;
  }

  syncStatus() {
    this.lineEdges = new Set();
    this.crossEdges = new Set();
    this.edgeStates.forEach((state, key) => {
      if (state === 1) this.lineEdges.add(key);
      if (state === -1) this.crossEdges.add(key);
    });

    this.degreeMap = new Map();
    this.lineEdges.forEach((edgeKey) => {
      const { a, b } = parseEdgeKey(edgeKey);
      const keyA = `${a[0]},${a[1]}`;
      const keyB = `${b[0]},${b[1]}`;
      this.degreeMap.set(keyA, (this.degreeMap.get(keyA) || 0) + 1);
      this.degreeMap.set(keyB, (this.degreeMap.get(keyB) || 0) + 1);
    });

    this.invalidNodes = new Set();
    this.degreeMap.forEach((degree, key) => {
      if (degree > 2) this.invalidNodes.add(key);
    });

    this.clueStates = new Map();
    this.puzzle.clues.forEach((clue) => {
      const count = this.countLineEdgesAround(clue.r, clue.c);
      const decided = this.countDecidedEdgesAround(clue.r, clue.c);
      const over = count > clue.value;
      const complete = decided === 4 && count === clue.value;
      this.clueStates.set(cellKey(clue), {
        lineCount: count,
        decided,
        over,
        complete
      });
    });

    this.isComplete = this.checkSolved();
    if (this.isComplete) this.isPaused = true;
  }

  countLineEdgesAround(r, c) {
    const edges = [
      normalizeWall([c, r], [c + 1, r]),
      normalizeWall([c + 1, r], [c + 1, r + 1]),
      normalizeWall([c, r + 1], [c + 1, r + 1]),
      normalizeWall([c, r], [c, r + 1])
    ];
    return edges.reduce((sum, key) => sum + (this.lineEdges.has(key) ? 1 : 0), 0);
  }

  countDecidedEdgesAround(r, c) {
    const edges = [
      normalizeWall([c, r], [c + 1, r]),
      normalizeWall([c + 1, r], [c + 1, r + 1]),
      normalizeWall([c, r + 1], [c + 1, r + 1]),
      normalizeWall([c, r], [c, r + 1])
    ];
    return edges.reduce((sum, key) => sum + (this.edgeStates.has(key) ? 1 : 0), 0);
  }

  checkSolved() {
    if (!this.lineEdges.size) return false;
    for (const clue of this.puzzle.clues) {
      if (!clue.isGiven) continue;
      if (this.countLineEdgesAround(clue.r, clue.c) !== clue.value) return false;
    }

    let hasLine = false;
    let hasOpenEnd = false;
    for (let y = 0; y <= this.puzzle.size; y += 1) {
      for (let x = 0; x <= this.puzzle.size; x += 1) {
        const degree = this.degreeMap.get(`${x},${y}`) || 0;
        if (degree > 0) hasLine = true;
        if (degree !== 0 && degree !== 2) hasOpenEnd = true;
      }
    }
    if (!hasLine || hasOpenEnd) return false;

    const startKey = Array.from(this.degreeMap.keys()).find((key) => (this.degreeMap.get(key) || 0) > 0);
    if (!startKey) return false;
    const visited = new Set([startKey]);
    const queue = [startKey];
    const adjacency = new Map();

    this.lineEdges.forEach((edgeKey) => {
      const { a, b } = parseEdgeKey(edgeKey);
      const keyA = `${a[0]},${a[1]}`;
      const keyB = `${b[0]},${b[1]}`;
      if (!adjacency.has(keyA)) adjacency.set(keyA, []);
      if (!adjacency.has(keyB)) adjacency.set(keyB, []);
      adjacency.get(keyA).push(keyB);
      adjacency.get(keyB).push(keyA);
    });

    while (queue.length) {
      const current = queue.shift();
      (adjacency.get(current) || []).forEach((next) => {
        if (visited.has(next)) return;
        visited.add(next);
        queue.push(next);
      });
    }

    for (const edgeKey of this.lineEdges) {
      const { a, b } = parseEdgeKey(edgeKey);
      const keyA = `${a[0]},${a[1]}`;
      const keyB = `${b[0]},${b[1]}`;
      if (!visited.has(keyA) || !visited.has(keyB)) return false;
    }

    return true;
  }
}
