import { pickTemplate, PUZZLE_TEMPLATES } from './harbor-puzzles.js';

const EXIT_ROW = 2;
const PIECE_COLORS = ['#00d4ff', '#bf5af2', '#54d6ff', '#7b2cbf', '#f72585'];
const GOAL_COLOR = '#ff2d95';
const IDLE_COLOR = '#4b5d73';

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
    this.template = null;
    this.loadPuzzle(seedKey);
  }

  loadPuzzle(seedKey) {
    this.template = pickTemplate(seedKey);
    this.initialPieces = clonePieces(this.template.pieces);
    this.pieces = clonePieces(this.template.pieces);
    this.playerOrder = [];
    this.phase = 'planning';
    this.isComplete = false;
    this.solutionShown = false;
  }

  get pieceCount() {
    return this.pieces.length;
  }

  getGridLabel() {
    return `${this.pieceCount} blocks`;
  }

  getPieceColor(pieceId) {
    const idx = this.getSelectionIndex(pieceId);
    if (idx < 0) return IDLE_COLOR;
    const piece = this.pieces.find((p) => p.id === pieceId);
    if (piece?.isGoal) return GOAL_COLOR;
    return PIECE_COLORS[idx % PIECE_COLORS.length];
  }

  getSelectionIndex(pieceId) {
    return this.playerOrder.indexOf(pieceId);
  }

  toggleSelection(pieceId) {
    if (this.phase !== 'planning' || this.isComplete) return false;
    const idx = this.playerOrder.indexOf(pieceId);
    if (idx >= 0) {
      this.playerOrder = this.playerOrder.slice(0, idx);
      return true;
    }
    this.playerOrder.push(pieceId);
    return true;
  }

  allSelected() {
    return this.playerOrder.length === this.pieces.length;
  }

  getMoveFor(pieceId) {
    return this.template.moves[pieceId];
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
      pieces: clonePieces(this.pieces),
      initialPieces: clonePieces(this.initialPieces),
      playerOrder: [...this.playerOrder],
      phase: this.phase,
      timeMs: this.timeMs,
      timerStarted: this.timerStarted,
      isPaused: this.isPaused,
      isComplete: this.isComplete,
      templateIndex: PUZZLE_TEMPLATES.indexOf(this.template)
    };
  }

  importState(state) {
    if (!state) return;
    const template = PUZZLE_TEMPLATES[state.templateIndex] || this.template;
    this.template = template;
    this.initialPieces = clonePieces(state.initialPieces || template.pieces);
    this.pieces = clonePieces(state.pieces || this.initialPieces);
    this.playerOrder = Array.isArray(state.playerOrder) ? [...state.playerOrder] : [];
    this.phase = state.phase || 'planning';
    this.timeMs = state.timeMs || 0;
    this.timerStarted = !!state.timerStarted;
    this.isPaused = !!state.isPaused;
    this.isComplete = !!state.isComplete;
  }
}
