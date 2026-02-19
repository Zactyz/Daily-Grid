export class PolyfitInput {
  constructor(canvas, engine, renderer, callbacks = {}) {
    this.canvas = canvas;
    this.engine = engine;
    this.renderer = renderer;
    this.getSelected = callbacks.getSelected;
    this.onChange = callbacks.onChange;
    this.onInteract = callbacks.onInteract;
    canvas.addEventListener('pointermove', (e) => this.handleMove(e));
    canvas.addEventListener('pointerleave', () => { renderer.setHover(null); renderer.render(); });
    canvas.addEventListener('pointerdown', (e) => this.handleDown(e));
  }
  setEngine(engine) { this.engine = engine; }
  setRenderer(renderer) { this.renderer = renderer; }

  handleMove(e) {
    const cell = this.renderer.cellAt(e.clientX, e.clientY);
    this.renderer.setHover(cell);
    this.renderer.render();
  }

  handleDown(e) {
    e.preventDefault();
    const cell = this.renderer.cellAt(e.clientX, e.clientY);
    if (!cell) return;
    const [x,y] = cell;
    const boardId = this.engine.board[y*this.engine.size + x];
    if (boardId !== null) {
      this.engine.removePiece(boardId);
      this.onChange?.();
      this.onInteract?.();
      return;
    }
    const selected = this.getSelected?.() ?? 0;
    if (this.engine.tryPlace(selected, x, y)) {
      this.onChange?.();
      this.onInteract?.();
    }
  }
}
