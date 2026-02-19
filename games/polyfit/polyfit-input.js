export class PolyfitInput {
  constructor(canvas, engine, renderer, callbacks = {}) {
    this.canvas = canvas;
    this.engine = engine;
    this.renderer = renderer;
    this.getSelected = callbacks.getSelected;
    this.onChange = callbacks.onChange;
    this.onInteract = callbacks.onInteract;
    this.onSelectPiece = callbacks.onSelectPiece;

    this.dragging = null;

    canvas.addEventListener('pointermove', (e) => this.handleMove(e));
    canvas.addEventListener('pointerleave', () => {
      if (!this.dragging) {
        renderer.setHover(null);
        renderer.setPreview(null);
        renderer.render();
      }
    });
    canvas.addEventListener('pointerdown', (e) => this.handleDown(e));

    window.addEventListener('pointermove', (e) => this.handleGlobalDragMove(e));
    window.addEventListener('pointerup', (e) => this.handleGlobalDragEnd(e));
  }

  setEngine(engine) { this.engine = engine; }
  setRenderer(renderer) { this.renderer = renderer; }

  startTrayDrag(pieceId, clientX, clientY) {
    const piece = this.engine.pieces[pieceId];
    if (!piece || piece.placed) return;
    this.dragging = { pieceId };
    this.onSelectPiece?.(pieceId);
    this.updateDragPreview(clientX, clientY);
  }

  updateDragPreview(clientX, clientY) {
    if (!this.dragging) return;
    const cell = this.renderer.cellAt(clientX, clientY);
    if (!cell) {
      this.renderer.setPreview(null);
      this.renderer.render();
      return;
    }
    this.renderer.setPreview({ pieceId: this.dragging.pieceId, x: cell[0], y: cell[1] });
    this.renderer.render();
  }

  handleGlobalDragMove(e) {
    if (!this.dragging) return;
    this.updateDragPreview(e.clientX, e.clientY);
  }

  handleGlobalDragEnd(e) {
    if (!this.dragging) return;
    const cell = this.renderer.cellAt(e.clientX, e.clientY);
    if (cell && this.engine.tryPlace(this.dragging.pieceId, cell[0], cell[1])) {
      this.onChange?.();
      this.onInteract?.();
    }
    this.dragging = null;
    this.renderer.setPreview(null);
    this.renderer.render();
  }

  handleMove(e) {
    if (this.dragging) return;
    const cell = this.renderer.cellAt(e.clientX, e.clientY);
    this.renderer.setHover(cell);
    this.renderer.render();
  }

  handleDown(e) {
    e.preventDefault();
    if (this.dragging) return;

    const cell = this.renderer.cellAt(e.clientX, e.clientY);
    if (!cell) return;
    const [x, y] = cell;
    const boardId = this.engine.board[y * this.engine.size + x];

    if (boardId !== null) {
      this.engine.removePiece(boardId);
      this.onSelectPiece?.(boardId);
      this.onChange?.();
      this.onInteract?.();
      // immediately pick up and continue as drag
      this.dragging = { pieceId: boardId };
      this.updateDragPreview(e.clientX, e.clientY);
      return;
    }

    const selected = this.getSelected?.() ?? 0;
    if (this.engine.tryPlace(selected, x, y)) {
      this.onChange?.();
      this.onInteract?.();
    }
  }
}
