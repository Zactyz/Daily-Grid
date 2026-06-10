import { generatePuzzle, getDefaultDirection, directionsForPiece, PUZZLE_VERSION } from './harbor-puzzles.js';

const GOAL_COLOR = '#ff2d95';
const IDLE_COLOR = '#4a5f78';
const SELECTED_COLOR = '#5ec8e8';

function clonePieces(pieces) {
  return pieces.map((p) => ({ ...p }));
}

function clonePlan(plan) {
  return plan.map((step) => ({ ...step }));
}

export class HarborEngine {
  constructor(seedKey) {
    this.seedKey = seedKey;
    this.width = 7;
    this.height = 7;
    this.exitRow = 3;
    this.exitCol = 3;
    this.exitSide = 'right';
    this.moveLimit = 0;
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
    this.selectableIds = [];
    this.loadPuzzle(seedKey);
  }

  loadPuzzle(seedKey) {
    this.puzzle = generatePuzzle(seedKey);
    this.width = this.puzzle.width;
    this.height = this.puzzle.height;
    this.exitRow = this.puzzle.exitRow;
    this.exitCol = this.puzzle.exitCol;
    this.exitSide = this.puzzle.exitSide;
    this.moveLimit = this.puzzle.moveLimit;
    this.selectableIds = [...this.puzzle.selectableIds];
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

  get movesRemaining() {
    return Math.max(0, this.moveLimit - this.playerPlan.length);
  }

  getGridLabel() {
    return `${this.width}x${this.height} / ${this.moveLimit} moves`;
  }

  isMovable(pieceId) {
    return this.selectableIds.includes(pieceId);
  }

  getPieceColor(pieceId) {
    const piece = this.pieces.find((p) => p.id === pieceId);
    if (piece?.isGoal) return GOAL_COLOR;
    return this.getSelectionIndex(pieceId) >= 0 ? SELECTED_COLOR : IDLE_COLOR;
  }

  getSelectionIndex(pieceId) {
    return this.playerPlan.findIndex((step) => step.id === pieceId);
  }

  getPlanStep(pieceId) {
    return this.playerPlan.find((step) => step.id === pieceId) || null;
  }

  isLastSelected(pieceId) {
    return this.playerPlan.length > 0 && this.playerPlan[this.playerPlan.length - 1].id === pieceId;
  }

  canRunPlan() {
    return this.playerPlan.length === this.moveLimit;
  }

  applySolutionPlan() {
    const plan = this.puzzle?.solutionPlan;
    if (!Array.isArray(plan) || plan.length === 0) return false;
    this.solutionShown = true;
    this.playerPlan = clonePlan(plan);
    this.pause();
    return true;
  }

  canInteractWith(pieceId) {
    if (this.solutionShown) return false;
    if (this.phase !== 'planning' || this.isComplete) return false;
    if (!this.isMovable(pieceId)) return false;

    const idx = this.getSelectionIndex(pieceId);
    if (idx >= 0) return this.isLastSelected(pieceId);
    return this.playerPlan.length < this.moveLimit;
  }

  selectWithDirection(pieceId, dr, dc) {
    if (!this.canInteractWith(pieceId)) return false;

    const piece = this.pieces.find((p) => p.id === pieceId);
    const validDirection = directionsForPiece(piece).some((dir) => dir.dr === dr && dir.dc === dc);
    if (!validDirection) return false;

    const idx = this.getSelectionIndex(pieceId);
    if (idx >= 0) {
      if (this.isLastSelected(pieceId) && this.playerPlan[idx].dr === dr && this.playerPlan[idx].dc === dc) {
        this.playerPlan.pop();
        return true;
      }
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

  toggleSelection(pieceId) {
    if (this.phase !== 'planning' || this.isComplete) return false;
    if (!this.isMovable(pieceId)) return false;

    const idx = this.getSelectionIndex(pieceId);
    if (idx >= 0) {
      this.playerPlan = this.playerPlan.slice(0, idx);
      return true;
    }

    if (this.playerPlan.length >= this.moveLimit) return false;

    const dir = getDefaultDirection(this.pieces, pieceId, this.puzzle);
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
    return this.playerPlan.length === this.moveLimit;
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
      version: PUZZLE_VERSION,
      seedKey: this.seedKey,
      width: this.width,
      height: this.height,
      exitRow: this.exitRow,
      exitCol: this.exitCol,
      exitSide: this.exitSide,
      moveLimit: this.moveLimit,
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
    if (state.seedKey && state.seedKey !== this.seedKey) return;
    if (state.version !== PUZZLE_VERSION) return;
    if (state.width !== this.width || state.height !== this.height || state.moveLimit !== this.moveLimit) return;
    if (state.exitSide !== this.exitSide) return;

    this.pieces = clonePieces(state.pieces || this.initialPieces);
    if (Array.isArray(state.playerPlan)) {
      const seen = new Set();
      this.playerPlan = clonePlan(state.playerPlan)
        .filter((step) => {
          if (!this.isMovable(step.id) || seen.has(step.id)) return false;
          const piece = this.initialPieces.find((p) => p.id === step.id);
          const validDirection = directionsForPiece(piece).some((dir) => dir.dr === step.dr && dir.dc === step.dc);
          if (!validDirection) return false;
          seen.add(step.id);
          return true;
        })
        .slice(0, this.moveLimit);
    } else {
      this.playerPlan = [];
    }
    this.phase = 'planning';
    this.timeMs = state.timeMs || 0;
    this.timerStarted = !!state.timerStarted;
    this.isComplete = !!state.isComplete;
    this.isPaused = !!state.isPaused && !this.isComplete;
  }
}
