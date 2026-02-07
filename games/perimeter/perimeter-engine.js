import { normalizeWall } from '../common/utils.js';

const GRID_WIDTH = 4;
const GRID_HEIGHT = 4;
const GRID_LABEL = '4 × 4 dots';

const LOOP_SEQUENCE = [
  [0, 0],
  [1, 0],
  [2, 0],
  [3, 0],
  [3, 1],
  [2, 1],
  [1, 1],
  [1, 2],
  [2, 2],
  [3, 2],
  [3, 3],
  [2, 3],
  [1, 3],
  [0, 3],
  [0, 2],
  [0, 1]
];

function coordKey([x, y]) {
  return `${x},${y}`;
}

function parseKey(key) {
  const [x, y] = key.split(',').map(Number);
  return [x, y];
}

function buildNeighbors(sequence) {
  const neighbors = new Map();

  for (let i = 0; i < sequence.length; i++) {
    const current = sequence[i];
    const next = sequence[(i + 1) % sequence.length];
    const currentKey = coordKey(current);
    const nextKey = coordKey(next);

    if (!neighbors.has(currentKey)) neighbors.set(currentKey, []);
    if (!neighbors.has(nextKey)) neighbors.set(nextKey, []);

    neighbors.get(currentKey).push(next);
    neighbors.get(nextKey).push(current);
  }

  return neighbors;
}

function areAdjacent(a, b) {
  const dx = Math.abs(a[0] - b[0]);
  const dy = Math.abs(a[1] - b[1]);
  return dx + dy === 1;
}

function isStraightNeighbor(a, b, origin) {
  return (a[0] === origin[0] && b[0] === origin[0]) || (a[1] === origin[1] && b[1] === origin[1]);
}

function normalizeDirection(from, to) {
  return [Math.sign(to[0] - from[0]), Math.sign(to[1] - from[1])];
}

function countArmLength(origin, neighbor, neighborsMap, edgeSet) {
  let length = 0;
  let prev = origin;
  let current = neighbor;
  const [dirX, dirY] = normalizeDirection(prev, current);

  while (true) {
    const edgeKey = normalizeWall(prev, current);
    if (!edgeSet.has(edgeKey)) break;
    length += 1;

    const currentKey = coordKey(current);
    const currentNeighbors = neighborsMap.get(currentKey) || [];
    const next = currentNeighbors.find(n => n[0] !== prev[0] || n[1] !== prev[1]);
    if (!next) break;

    const [nextDirX, nextDirY] = normalizeDirection(current, next);
    if (nextDirX === dirX && nextDirY === dirY) {
      prev = current;
      current = next;
      continue;
    }
    break;
  }

  return length;
}

function buildPuzzle() {
  const neighbors = buildNeighbors(LOOP_SEQUENCE);
  const edges = new Set();

  for (let i = 0; i < LOOP_SEQUENCE.length; i++) {
    const current = LOOP_SEQUENCE[i];
    const next = LOOP_SEQUENCE[(i + 1) % LOOP_SEQUENCE.length];
    if (!areAdjacent(current, next)) {
      throw new Error('Loop sequence contains non-adjacent nodes');
    }
    edges.add(normalizeWall(current, next));
  }

  const guards = [];
  neighbors.forEach((adjacent, key) => {
    const [x, y] = parseKey(key);
    if (adjacent.length !== 2) {
      console.warn('Unexpected neighbor count at', key);
    }
    const neighborA = adjacent[0];
    const neighborB = adjacent[1];
    const type = isStraightNeighbor(neighborA, neighborB, [x, y]) ? 'white' : 'black';
    const armA = countArmLength([x, y], neighborA, neighbors, edges);
    const armB = countArmLength([x, y], neighborB, neighbors, edges);
    guards.push({
      x,
      y,
      type,
      number: armA + armB,
      neighbors: [neighborA, neighborB]
    });
  });

  return {
    gridWidth: GRID_WIDTH,
    gridHeight: GRID_HEIGHT,
    gridLabel: GRID_LABEL,
    solutionEdges: edges,
    guards,
    loopSequence: LOOP_SEQUENCE
  };
}

const PUZZLE = buildPuzzle();

export class PerimeterEngine {
  constructor() {
    this.puzzle = PUZZLE;
    this.playerEdges = new Set();
    this.timeMs = 0;
    this.timerStarted = false;
    this.isPaused = false;
    this.isComplete = false;
    this.hintsUsed = 0;
  }

  getGridWidth() {
    return this.puzzle.gridWidth;
  }

  getGridHeight() {
    return this.puzzle.gridHeight;
  }

  getGridLabel() {
    return this.puzzle.gridLabel;
  }

  getGuards() {
    return this.puzzle.guards;
  }

  getPlayerEdges() {
    return Array.from(this.playerEdges);
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

  reset() {
    this.playerEdges.clear();
    this.timeMs = 0;
    this.timerStarted = false;
    this.isPaused = false;
    this.isComplete = false;
  }

  updateTime(delta) {
    if (!this.timerStarted || this.isPaused || this.isComplete) return;
    this.timeMs += delta;
  }

  toggleEdge(a, b) {
    if (!areAdjacent(a, b)) return false;
    const key = normalizeWall(a, b);
    if (this.playerEdges.has(key)) {
      this.playerEdges.delete(key);
    } else {
      this.playerEdges.add(key);
    }
    this.syncCompletion();
    return true;
  }

  syncCompletion() {
    if (this.playerEdges.size !== this.puzzle.solutionEdges.size) {
      this.isComplete = false;
      return;
    }
    for (const edge of this.puzzle.solutionEdges) {
      if (!this.playerEdges.has(edge)) {
        this.isComplete = false;
        return;
      }
    }
    this.isComplete = true;
    this.isPaused = true;
  }

  hasEdgeBetween(origin, neighbor) {
    return this.playerEdges.has(normalizeWall([origin.x, origin.y], neighbor));
  }

  isGuardSatisfied(guard) {
    return guard.neighbors.every(neighbor => this.hasEdgeBetween(guard, neighbor));
  }
}
