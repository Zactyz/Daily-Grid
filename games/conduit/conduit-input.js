import { shouldIgnoreGhostPointer, noteTouchPointerUp } from '../common/pointer-tap.js';

export class ConduitInput {
  constructor(canvas, engine, renderer, onChange) {
    this.canvas = canvas;
    this.engine = engine;
    this.renderer = renderer;
    this.onChange = onChange;

    this.canvas.style.touchAction = 'none';
    this._down = this._handleDown.bind(this);
    this._up = this._handleUp.bind(this);

    this.canvas.addEventListener('pointerdown', this._down);
    this.canvas.addEventListener('pointerup', this._up);
    this.canvas.addEventListener('pointercancel', this._up);
  }

  setEngine(engine) { this.engine = engine; }
  setRenderer(renderer) { this.renderer = renderer; }

  updateTouchBehavior(isComplete) {
    this.canvas.style.touchAction = isComplete ? 'auto' : 'none';
  }

  destroy() {
    this.canvas.removeEventListener('pointerdown', this._down);
    this.canvas.removeEventListener('pointerup', this._up);
    this.canvas.removeEventListener('pointercancel', this._up);
  }

  _handleUp(event) {
    noteTouchPointerUp(event);
  }

  _cellFromEvent(event) {
    const rect = this.canvas.getBoundingClientRect();
    return this.renderer?.getCellAt(event.clientX - rect.left, event.clientY - rect.top);
  }

  _handleDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    const idx = this._cellFromEvent(event);
    if (idx == null) return;
    if (shouldIgnoreGhostPointer(event, `conduit:${idx}`)) return;
    const didRotate = this.engine.rotateCell(idx);
    if (didRotate) this.onChange?.();
  }
}
