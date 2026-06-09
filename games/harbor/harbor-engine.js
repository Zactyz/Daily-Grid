import { generatePuzzle, directionsForPiece } from './harbor-puzzles.js';

const EXIT_ROW = 2;
const GOAL_COLOR = '#ff2d95';
const IDLE_COLOR = '#4a5f78';
const SELECTED_COLOR = '#5ec8e8';

function clonePieces(pieces) {
  return pieces.map((p) => ({ ...p }));
}

function clonePlan(plan) {
  return plan.map((step) => ({ ...step }));
}

function sameDir(a, b) {
  return a.dr === b.dr && a.dc === b.dc;
}

export class HarborEngine {
  constructor(seedKey) {
    this.seedKey = seedKey;
    this.width = 5;
    this.height = 5;
    this.exitRow = EXIT_ROW;
    this.timeMs = 0;
    this.timerStarted = false;
    this.isPaused = false;
    this.isComplete = false;
    this.hintsUsed = 0;
    this.solutionShown = false;
    this.phase = 'planning';
    this.playerPlan = [];
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
    this.playerPlan = [];
    this.phase = 'planning';
    this.isComplete = false;
    this.solutionShown = false;
  }

  get movableCount() {
    return this.moverIds.length;
  }

  getGridLabel() {
    return '5×5';
  }

  isMovable(pieceId) {
    return this.moverIds.includes(pieceId);
  }

  getPieceColor(pieceId) {
    const piece = this.pieces.find((p) => p.id === pieceId);
    if (piece?.isGoal) return GOAL_COLOR;
    if (this.getSelectionIndex(pieceId) >= 0) return SELECTED_COLOR;
    return IDLE_COLOR;
  }

  getSelectionIndex(pieceId) {
    return this.playerPlan.findIndex((step) => step.id === pieceId);
  }

  getPlanStep(pieceId) {
    return this.playerPlan.find((step) => step.id === pieceId) || null;
  }

  isLastSelected(pieceId) {
    if (this.playerPlan.length === 0) return false;
    return this.playerPlan[this.playerPlan.length - 1].id === pieceId;
  }

  canInteractWith(pieceId) {
    if (this.phase !== 'planning' || this.isComplete) return false;
    if (!this.isMovable(pieceId)) return false;
    const idx = this.getSelectionIndex(pieceId);
    return idx < 0 || this.isLastSelected(pieceId);
  }

  selectWithDirection(pieceId, dr, dc) {
    if (!this.canInteractWith(pieceId)) return false;

    const dirs = directionsForPiece(this.pieces.find((p) => p.id === pieceId));
    if (!dirs.some((dir) => sameDir(dir, { dr, dc }))) return false;

    const idx = this.getSelectionIndex(pieceId);
    if (idx >= 0) {
      this.playerPlan[idx] = { id: pieceId, dr, dc };
      return true;
    }

    this.playerPlan.push({ id: pieceId, dr, dc });
    return true;
  }

  undoLast() {
    if (this.phase !== 'planning' || this.isComplete) return false;
    if (this.playerPlan.length === 0) return false;
    this.playerPlan.pop();
    return true;
  }

  allSelected() {
    return this.playerPlan.length === this.moverIds.length;
  }

  showsPauseOverlay() {
    return this.isPaused && this.phase === 'planning';
  }

  startTimer() {
    if (this.timerStarted) return;
    this.timerStarted = true;
    this.isPaused = false;
  }

  pause() {
    if (!this.timerStarted || this.isComplete) return;
    if (this.phase !== 'planning') return;
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
      playerPlan: clonePlan(this.playerPlan),
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
    this.playerPlan = Array.isArray(state.playerPlan) ? clonePlan(state.playerPlan) : [];
    this.phase = state.phase || 'planning';
    this.timeMs = state.timeMs || 0;
    this.timerStarted = !!state.timerStarted;
    this.isPaused = !!state.isPaused;
    this.isComplete = !!state.isComplete;
  }
}
