export class ConduitInput {
  constructor(canvas, engine, renderer, onChange) {
    this.canvas = canvas;
    this.engine = engine;
    this.renderer = renderer;
    this.onChange = onChange;
    this._boundPointer = this._handlePointer.bind(this);
    this.canvas.addEventListener('pointerdown', this._boundPointer, { passive: false });
  }

  setEngine(engine) {
    this.engine = engine;
  }

  setRenderer(renderer) {
    this.renderer = renderer;
  }

  destroy() {
    this.canvas.removeEventListener('pointerdown', this._boundPointer);
  }

  _handlePointer(event) {
    event.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const cssX = event.clientX - rect.left;
    const cssY = event.clientY - rect.top;
    if (!this.renderer) return;
    const index = this.renderer.getCellAt(cssX, cssY);
    if (index === null) return;
    const didRotate = this.engine.rotateCell(index);
    if (didRotate) {
      this.onChange?.();
    }
  }
}
