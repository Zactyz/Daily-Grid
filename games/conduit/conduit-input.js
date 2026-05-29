import { isSyntheticMousePointer, isDuplicateGameplayTap } from '../common/pointer-tap.js';

export class ConduitInput {
  constructor(canvas, engine, renderer, onChange) {
    this.canvas = canvas;
    this.engine = engine;
    this.renderer = renderer;
    this.onChange = onChange;

    this.canvas.style.touchAction = 'none';
    this._down = this._handleDown.bind(this);

    this.canvas.addEventListener('pointerdown', this._down);
  }

  setEngine(engine) { this.engine = engine; }
  setRenderer(renderer) { this.renderer = renderer; }

  updateTouchBehavior(isComplete) {
    this.canvas.style.touchAction = isComplete ? 'auto' : 'none';
  }

  destroy() {
    this.canvas.removeEventListener('pointerdown', this._down);
  }

  _cellFromEvent(event) {
    const rect = this.canvas.getBoundingClientRect();
    return this.renderer?.getCellAt(event.clientX - rect.left, event.clientY - rect.top);
  }

  _handleDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (isSyntheticMousePointer(event)) return;
    event.preventDefault();
    const idx = this._cellFromEvent(event);
    if (idx == null) return;
    if (isDuplicateGameplayTap(`conduit:${idx}`)) return;
    const didRotate = this.engine.rotateCell(idx);
    if (didRotate) this.onChange?.();
  }
}
