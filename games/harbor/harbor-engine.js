import { generatePuzzle } from './harbor-puzzles.js';

const EXIT_ROW = 2;
const PIECE_COLORS = ['#7b8fa8', '#8b9cb5', '#6d7f99', '#95a6bd', '#7486a0'];
const GOAL_COLOR = '#f08080';
const IDLE_COLOR = '#6d7f99';

function clonePieces(pieces) {
  return pieces.map((p) => ({ ...p }));
}

export class HarborEngine {
  constructor(seedKey) {
    this.seedKey = seedKey;
    this.width = 6;
    this.height = 6;
    this.exitRow = EXIT_ROW;
    this.timeMs = 0;
    this.timerStarted = false;
    this.isPaused = false;
    this.isComplete = false;
    this.hintsUsed = 0;
    this.solutionShown = false;
    this.phase = 'planning';
    this.playerOrder = [];
    this.initialPieces = [];
    this.pieces = [];
    this.puzzle = null;
    this.moverIds = [];
    this.loadPuzzle(seedKey);
  }

  loadPuzzle(seedKey) {
    this.puzzle = generatePuzzle(seedKey);
    this.moverIds = [...this.puzzle.moverIds];
    this.initialPieces = clonePieces(this.puzzle.pieces);
    this.pieces = clonePieces(this.puzzle.pieces);
    this.playerOrder = [];
    this.phase = 'planning';
    this.isComplete = false;
    this.solutionShown = false;
  }

  get movableCount() {
    return this.moverIds.length;
  }

  getGridLabel() {
    return '6×6';
  }

  isMovable(pieceId) {
    return this.moverIds.includes(pieceId);
  }

  getPieceColor(pieceId) {
    const piece = this.pieces.find((p) => p.id === pieceId);
    if (piece?.isGoal) return GOAL_COLOR;
    const idx = this.getSelectionIndex(pieceId);
    if (idx < 0) return IDLE_COLOR;
    return PIECE_COLORS[idx % PIECE_COLORS.length];
  }

  getSelectionIndex(pieceId) {
    return this.playerOrder.indexOf(pieceId);
  }

  toggleSelection(pieceId) {
    if (this.phase !== 'planning' || this.isComplete) return false;
    if (!this.isMovable(pieceId)) return false;

    const idx = this.playerOrder.indexOf(pieceId);
    if (idx >= 0) {
      this.playerOrder = this.playerOrder.slice(0, idx);
      return true;
    }
    this.playerOrder.push(pieceId);
    return true;
  }

  allSelected() {
    return this.playerOrder.length === this.moverIds.length;
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
    if (!this.timerStarted || this.isPaused || this.isComplete) return;
    if (this.phase === 'executing' || this.phase === 'rewinding') return;
    this.timeMs += deltaMs;
  }

  reset({ resetTimer = true } = {}) {
    this.loadPuzzle(this.seedKey);
    if (resetTimer) {
      this.timeMs = 0;
      this.timerStarted = false;
      this.isPaused = false;
    }
  }

  exportState() {
    return {
      seedKey: this.seedKey,
      pieces: clonePieces(this.pieces),
      initialPieces: clonePieces(this.initialPieces),
      playerOrder: [...this.playerOrder],
      phase: this.phase,
      timeMs: this.timeMs,
      timerStarted: this.timerStarted,
      isPaused: this.isPaused,
      isComplete: this.isComplete
    };
  }

  importState(state) {
    if (!state) return;
    if (state.seedKey && state.seedKey !== this.seedKey) {
      this.seedKey = state.seedKey;
      this.loadPuzzle(state.seedKey);
    }
    this.pieces = clonePieces(state.pieces || this.initialPieces);
    this.playerOrder = Array.isArray(state.playerOrder) ? [...state.playerOrder] : [];
    this.phase = state.phase || 'planning';
    this.timeMs = state.timeMs || 0;
    this.timerStarted = !!state.timerStarted;
    this.isPaused = !!state.isPaused;
    this.isComplete = !!state.isComplete;
  }
}
