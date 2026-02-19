import { rotateMaskSteps } from './conduit-utils.js';

export class ConduitInput {
  constructor(canvas, engine, renderer, onChange) {
    this.canvas = canvas;
    this.engine = engine;
    this.renderer = renderer;
    this.onChange = onChange;
    this.dragging = false;
    this.visited = new Set();
    this.lastTap = { time: 0, idx: null };

    this.canvas.style.touchAction = 'none';
    this._down = this._handleDown.bind(this);
    this._move = this._handleMove.bind(this);
    this._up = this._handleUp.bind(this);
    this._context = (e) => e.preventDefault();

    this.canvas.addEventListener('pointerdown', this._down);
    this.canvas.addEventListener('pointermove', this._move);
    window.addEventListener('pointerup', this._up);
    this.canvas.addEventListener('contextmenu', this._context);
  }

  setEngine(engine) { this.engine = engine; }
  setRenderer(renderer) { this.renderer = renderer; }

  destroy() {
    this.canvas.removeEventListener('pointerdown', this._down);
    this.canvas.removeEventListener('pointermove', this._move);
    window.removeEventListener('pointerup', this._up);
    this.canvas.removeEventListener('contextmenu', this._context);
  }

  _cellFromEvent(event) {
    const rect = this.canvas.getBoundingClientRect();
    return this.renderer?.getCellAt(event.clientX - rect.left, event.clientY - rect.top);
  }

  _rotateBack(index) {
    const cell = this.engine.getCells()[index];
    if (!cell || cell.isPrefill || cell.isBlocked || !cell.isActive) return false;
    cell.rotation = (cell.rotation + 3) % 4;
    cell.playerMask = rotateMaskSteps(cell.solutionMask, cell.rotation);
    this.engine._evaluateStatuses?.();
    return true;
  }

  _rotate(index, reverse = false) {
    if (index == null) return false;
    if (reverse) return this._rotateBack(index);
    return this.engine.rotateCell(index);
  }

  _handleDown(event) {
    event.preventDefault();
    const idx = this._cellFromEvent(event);
    if (idx == null) return;
    const now = Date.now();
    const reverse = event.button === 2 || (this.lastTap.idx === idx && now - this.lastTap.time < 280);
    const did = this._rotate(idx, reverse);
    if (did) {
      this.onChange?.();
      this.visited.add(idx);
      this.dragging = true;
      this.lastTap = { time: now, idx };
      this.canvas.setPointerCapture?.(event.pointerId);
    }
  }

  _handleMove(event) {
    if (!this.dragging) return;
    const idx = this._cellFromEvent(event);
    if (idx == null || this.visited.has(idx)) return;
    const did = this._rotate(idx, false);
    if (did) {
      this.visited.add(idx);
      this.onChange?.();
    }
  }

  _handleUp() {
    this.dragging = false;
    this.visited.clear();
  }
}
