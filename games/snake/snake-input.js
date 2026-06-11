import { shouldIgnoreGhostPointer, noteTouchPointerUp } from '../common/pointer-tap.js';

export class SnakeInput {
  constructor(canvas, engine, renderer, onUpdate, onValidationCheck) {
    this.canvas = canvas;
    this.engine = engine;
    this.renderer = renderer;
    this.onUpdate = onUpdate;
    this.onValidationCheck = onValidationCheck || (() => {});
    this.activePointerId = null;

    this.setupListeners();
  }
  
  setupListeners() {
    this.canvas.style.touchAction = 'none';

    this._onDown = (e) => this.handlePointerDown(e);
    this._onMove = (e) => this.handlePointerMove(e);
    this._onUp = (e) => this.handlePointerUp(e);

    this.canvas.addEventListener('pointerdown', this._onDown, { passive: false });
    this.canvas.addEventListener('pointermove', this._onMove, { passive: false });
    window.addEventListener('pointermove', this._onMove, { passive: false });
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
  }

  destroy() {
    this.canvas.removeEventListener('pointerdown', this._onDown);
    this.canvas.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
  }
  
  // Update touch behavior based on game state (allow scrolling when complete/paused)
  updateTouchBehavior() {
    if (this.engine.state.isComplete || this.engine.state.isPaused) {
      this.canvas.style.touchAction = 'auto';
    } else {
      this.canvas.style.touchAction = 'none';
    }
  }
  
  handlePointerDown(e) {
    if (this.engine.state.isPaused || this.engine.state.isComplete) return;
    if (e.target !== this.canvas) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    e.preventDefault();

    const cell = this.renderer.getCellFromPointer(e.clientX, e.clientY);
    if (!cell) return;
    
    const [x, y] = cell;
    if (shouldIgnoreGhostPointer(e, `snake:${x},${y}`)) return;

    this.activePointerId = e.pointerId;
    
    const existingIdx = this.engine.state.path.findIndex(([px, py]) => px === x && py === y);
    if (existingIdx !== -1) {
      this.engine.undoToCell(x, y);
      this.engine.state.isDragging = true;
      this.onUpdate();
      return;
    }
    
    if (this.engine.addCell(x, y)) {
      this.engine.state.isDragging = true;
      this.onUpdate();
    }
  }
  
  handlePointerMove(e) {
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;
    if (!this.engine.state.isDragging) return;
    if (this.engine.state.isPaused || this.engine.state.isComplete) return;
    
    e.preventDefault();
    
    const cell = this.renderer.getCellFromPointer(e.clientX, e.clientY);
    if (!cell) return;
    
    const [x, y] = cell;
    const lastCell = this.engine.state.path[this.engine.state.path.length - 1];
    
    if (lastCell && lastCell[0] === x && lastCell[1] === y) return;
    
    const existingIdx = this.engine.state.path.findIndex(([px, py]) => px === x && py === y);
    if (existingIdx !== -1) {
      // Prevent accidental deep undo while dragging
      // Only allow undo if it's the immediately preceding cell (back 1 step)
      if (existingIdx === this.engine.state.path.length - 2) {
        this.engine.undoToCell(x, y);
        this.onUpdate();
      }
      return;
    }
    
    if (this.engine.addCell(x, y)) {
      this.onUpdate();
    }
  }
  
  handlePointerUp(e) {
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;
    noteTouchPointerUp(e);
    if (this.engine.state.isDragging) {
      this.onValidationCheck();
    }
    this.engine.state.isDragging = false;
    this.activePointerId = null;
  }
}
