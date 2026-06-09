import { generatePuzzle, getDefaultDirection, directionsForPiece } from './harbor-puzzles.js';

const EXIT_ROW = 2;
const PIECE_COLORS = ['#7b8fa8', '#8b9cb5', '#6d7f99', '#95a6bd'];
const GOAL_COLOR = '#f08080';
const IDLE_COLOR = '#6d7f99';

function clonePieces(pieces) {
  return pieces.map((p) => ({ ...p }));
}

function clonePlan(plan) {
  return plan.map((step) => ({ ...step }));
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
    const idx = this.getSelectionIndex(pieceId);
    if (idx < 0) return IDLE_COLOR;
    return PIECE_COLORS[idx % PIECE_COLORS.length];
  }

  getSelectionIndex(pieceId) {
    return this.playerPlan.findIndex((step) => step.id === pieceId);
  }

  getPlanStep(pieceId) {
    return this.playerPlan.find((step) => step.id === pieceId) || null;
  }

  toggleSelection(pieceId) {
    if (this.phase !== 'planning' || this.isComplete) return false;
    if (!this.isMovable(pieceId)) return false;

    const idx = this.getSelectionIndex(pieceId);
    if (idx >= 0) {
      this.playerPlan = this.playerPlan.slice(0, idx);
      return true;
    }

    const dir = getDefaultDirection(this.pieces, pieceId);
    this.playerPlan.push({ id: pieceId, dr: dir.dr, dc: dir.dc });
    return true;
  }

  toggleDirection(pieceId) {
    if (this.phase !== 'planning' || this.isComplete) return false;
    const idx = this.getSelectionIndex(pieceId);
    if (idx < 0) return false;

    const piece = this.pieces.find((p) => p.id === pieceId);
    if (!piece) return false;
    const dirs = directionsForPiece(piece);
    if (dirs.length < 2) return false;

    const current = this.playerPlan[idx];
    const next = dirs.find((dir) => dir.dr !== current.dr || dir.dc !== current.dc) || dirs[0];
    this.playerPlan[idx] = { id: pieceId, dr: next.dr, dc: next.dc };
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
    if (Array.isArray(state.playerPlan)) {
      this.playerPlan = clonePlan(state.playerPlan);
    } else if (Array.isArray(state.playerOrder)) {
      this.playerPlan = state.playerOrder.map((id) => {
        const dir = getDefaultDirection(this.initialPieces, id);
        return { id, dr: dir.dr, dc: dir.dc };
      });
    } else {
      this.playerPlan = [];
    }
    this.phase = state.phase || 'planning';
    this.timeMs = state.timeMs || 0;
    this.timerStarted = !!state.timerStarted;
    this.isPaused = !!state.isPaused;
    this.isComplete = !!state.isComplete;
  }
}
