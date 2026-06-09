import { createSeededRandom, hashString } from '../common/utils.js';

const SIZE = 4;
const CELL_COUNT = SIZE * SIZE;

const SOLVED = Array.from({ length: CELL_COUNT - 1 }, (_, i) => i + 1).concat(0);

function indexToRowCol(index) {
  return [Math.floor(index / SIZE), index % SIZE];
}

function rowColToIndex(row, col) {
  return row * SIZE + col;
}

function getNeighborIndices(emptyIndex) {
  const [row, col] = indexToRowCol(emptyIndex);
  const neighbors = [];
  if (row > 0) neighbors.push(rowColToIndex(row - 1, col));
  if (row < SIZE - 1) neighbors.push(rowColToIndex(row + 1, col));
  if (col > 0) neighbors.push(rowColToIndex(row, col - 1));
  if (col < SIZE - 1) neighbors.push(rowColToIndex(row, col + 1));
  return neighbors;
}

function isAdjacent(a, b) {
  const [ar, ac] = indexToRowCol(a);
  const [br, bc] = indexToRowCol(b);
  return Math.abs(ar - br) + Math.abs(ac - bc) === 1;
}

export class TilesEngine {
  constructor(seedKey) {
    this.seedKey = seedKey;
    this.size = SIZE;
    this.tiles = [...SOLVED];
    this.moveCount = 0;
    this.timeMs = 0;
    this.timerStarted = false;
    this.isPaused = false;
    this.isComplete = false;
    this.hintsUsed = 0;
    this.solutionShown = false;
    this.generate(seedKey);
  }

  generate(seedKey) {
    const rng = createSeededRandom(hashString(`tiles:${seedKey}`));
    const scrambleMoves = 80 + (hashString(`tiles:moves:${seedKey}`) % 120);
    this.tiles = [...SOLVED];
    this.moveCount = 0;
    this.isComplete = false;
    this.solutionShown = false;

    let emptyIdx = CELL_COUNT - 1;
    let lastMoved = -1;

    for (let i = 0; i < scrambleMoves; i += 1) {
      const neighbors = getNeighborIndices(emptyIdx).filter((idx) => idx !== lastMoved);
      const pick = neighbors[Math.floor(rng() * neighbors.length)];
      this.tiles[emptyIdx] = this.tiles[pick];
      this.tiles[pick] = 0;
      lastMoved = emptyIdx;
      emptyIdx = pick;
    }
  }

  getGridLabel() {
    return `${SIZE}×${SIZE}`;
  }

  getEmptyIndex() {
    return this.tiles.indexOf(0);
  }

  canMove(tileIndex) {
    if (this.isComplete || this.solutionShown) return false;
    return isAdjacent(tileIndex, this.getEmptyIndex());
  }

  tryMove(tileIndex) {
    if (!this.canMove(tileIndex)) return false;
    const emptyIdx = this.getEmptyIndex();
    this.tiles[emptyIdx] = this.tiles[tileIndex];
    this.tiles[tileIndex] = 0;
    this.moveCount += 1;
    this.isComplete = this.tiles.every((value, idx) => value === SOLVED[idx]);
    return true;
  }

  revealSolution() {
    this.tiles = [...SOLVED];
    this.solutionShown = true;
    this.isComplete = false;
  }

  startTimer() {
    if (this.timerStarted) return;
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

  updateTime(deltaMs) {
    if (!this.timerStarted || this.isPaused || this.isComplete || this.solutionShown) return;
    this.timeMs += deltaMs;
  }

  reset({ resetTimer = true } = {}) {
    const seedKey = this.seedKey;
    this.generate(seedKey);
    if (resetTimer) {
      this.timeMs = 0;
      this.timerStarted = false;
      this.isPaused = false;
    }
  }

  setSeedKey(seedKey) {
    this.seedKey = seedKey;
    this.generate(seedKey);
    this.timeMs = 0;
    this.timerStarted = false;
    this.isPaused = false;
  }

  exportState() {
    return {
      tiles: [...this.tiles],
      moveCount: this.moveCount,
      timeMs: this.timeMs,
      timerStarted: this.timerStarted,
      isPaused: this.isPaused,
      isComplete: this.isComplete,
      solutionShown: this.solutionShown
    };
  }

  importState(state) {
    if (!state || !Array.isArray(state.tiles) || state.tiles.length !== CELL_COUNT) return;
    this.tiles = [...state.tiles];
    this.moveCount = state.moveCount || 0;
    this.timeMs = state.timeMs || 0;
    this.timerStarted = !!state.timerStarted;
    this.isPaused = state.timerStarted ? true : !!state.isPaused;
    this.isComplete = !!state.isComplete;
    this.solutionShown = !!state.solutionShown;
  }
}
