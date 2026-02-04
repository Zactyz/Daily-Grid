export class PipesInput {
  constructor(canvas, engine, renderer, onChange) {
    this.canvas = canvas;
    this.engine = engine;
    this.renderer = renderer;
    this.onChange = onChange;
    this._boundClick = this._handleClick.bind(this);
    this.canvas.addEventListener('click', this._boundClick);
  }

  setEngine(engine) {
    this.engine = engine;
  }

  setRenderer(renderer) {
    this.renderer = renderer;
  }

  destroy() {
    this.canvas.removeEventListener('click', this._boundClick);
  }

  _handleClick(event) {
    const rect = this.canvas.getBoundingClientRect();
    const cssX = event.clientX - rect.left;
    const cssY = event.clientY - rect.top;
    if (!this.renderer) return;
    const index = this.renderer.getCellAt(cssX, cssY);
    if (index === null) return;
    this.engine.rotateCell(index);
    this.onChange?.();
  }
}
