export class PolyfitInput {
  constructor(canvas, engine, renderer, callbacks = {}) {
    this.canvas = canvas;
    this.engine = engine;
    this.renderer = renderer;
    this.getSelected = callbacks.getSelected;
    this.onChange = callbacks.onChange;
    this.onInteract = callbacks.onInteract;
    this.onSelectPiece = callbacks.onSelectPiece;
    this.onStateChange = callbacks.onStateChange;

    this.state = 'idle'; // idle | dragging | placed | returning
    this.dragging = null;
    this.pressingBoard = null;

    canvas.addEventListener('pointermove', (e) => this.handleMove(e));
    canvas.addEventListener('pointerleave', () => this.handlePointerLeave());
    canvas.addEventListener('pointerdown', (e) => this.handleDown(e));
    canvas.addEventListener('pointerup', (e) => this.handleTapUp(e));

    window.addEventListener('pointermove', (e) => this.handleGlobalDragMove(e));
    window.addEventListener('pointerup', (e) => this.handleGlobalDragEnd(e));
  }

  setEngine(engine) { this.engine = engine; }
  setRenderer(renderer) { this.renderer = renderer; }

  setState(next) {
    this.state = next;
    this.onStateChange?.(next, this.dragging);
  }

  getDragPieceId() {
    return this.dragging?.pieceId ?? null;
  }

  startTrayDrag(pieceId, clientX, clientY) {
    const piece = this.engine.pieces[pieceId];
    if (!piece || piece.placed) return;

    this.dragging = {
      pieceId,
      source: 'bank',
      pointerId: null,
      startClientX: clientX,
      startClientY: clientY,
      lastValid: { source: 'bank' },
      moved: false,
      candidate: null
    };

    this.onSelectPiece?.(pieceId);
    this.setState('dragging');
    this.updateDragPreview(clientX, clientY);
  }

  startBoardDrag(pieceId, clientX, clientY, pointerId = null) {
    const piece = this.engine.pieces[pieceId];
    if (!piece || !piece.placed) return;

    const lastValid = {
      source: 'board',
      x: piece.placed.x,
      y: piece.placed.y,
      variantIndex: piece.placed.variantIndex
    };

    this.engine.removePiece(pieceId);

    this.dragging = {
      pieceId,
      source: 'board',
      pointerId,
      startClientX: clientX,
      startClientY: clientY,
      lastValid,
      moved: false,
      candidate: null
    };

    this.onSelectPiece?.(pieceId);
    this.setState('dragging');
    this.updateDragPreview(clientX, clientY);
  }

  rotatePiece(pieceId) {
    const piece = this.engine.pieces[pieceId];
    if (!piece) return false;

    if (!piece.placed) {
      this.engine.rotateSelected(pieceId);
      this.onSelectPiece?.(pieceId);
      this.renderer.render();
      this.onChange?.();
      return true;
    }

    const original = { ...piece.placed };
    this.engine.removePiece(pieceId);
    piece.variantIndex = (piece.variantIndex + 1) % piece.variants.length;

    const placed = this.engine.tryPlace(pieceId, original.x, original.y);
    if (!placed) {
      piece.variantIndex = original.variantIndex;
      this.engine.tryPlace(pieceId, original.x, original.y);
      this.renderer.pulseInvalidPiece(pieceId);
      this.renderer.render();
      this.onChange?.();
      return false;
    }

    this.onSelectPiece?.(pieceId);
    this.renderer.render();
    this.onChange?.();
    this.onInteract?.();
    return true;
  }

  updateDragPreview(clientX, clientY) {
    if (!this.dragging) return;

    const cell = this.renderer.cellAt(clientX, clientY);
    if (!cell) {
      this.dragging.candidate = null;
      this.renderer.setPreview(null);
      this.renderer.setDragPiece({ pieceId: this.dragging.pieceId, clientX, clientY, valid: false });
      this.renderer.render();
      return;
    }

    const [x, y] = cell;
    const canPlace = this.engine.canPlaceAt(this.dragging.pieceId, x, y);
    this.dragging.candidate = { x, y, valid: canPlace };
    this.renderer.setPreview({ pieceId: this.dragging.pieceId, x, y, valid: canPlace });
    this.renderer.setDragPiece({ pieceId: this.dragging.pieceId, clientX, clientY, valid: canPlace });
    this.renderer.render();
  }

  handleGlobalDragMove(e) {
    if (this.pressingBoard && !this.dragging) {
      const dx = Math.abs(e.clientX - this.pressingBoard.startClientX);
      const dy = Math.abs(e.clientY - this.pressingBoard.startClientY);
      if (dx + dy > 6) {
        this.startBoardDrag(this.pressingBoard.pieceId, this.pressingBoard.startClientX, this.pressingBoard.startClientY, this.pressingBoard.pointerId);
        this.pressingBoard = null;
      }
    }

    if (!this.dragging) return;

    const dx = Math.abs(e.clientX - this.dragging.startClientX);
    const dy = Math.abs(e.clientY - this.dragging.startClientY);
    if (dx + dy > 6) this.dragging.moved = true;

    this.updateDragPreview(e.clientX, e.clientY);
  }

  finishDragWithSnapBack(pieceId) {
    const drag = this.dragging;
    if (!drag) return;

    this.setState('returning');

    if (drag.lastValid.source === 'board') {
      this.engine.pieces[pieceId].variantIndex = drag.lastValid.variantIndex;
      this.engine.tryPlace(pieceId, drag.lastValid.x, drag.lastValid.y);
    }

    this.dragging = null;
    this.renderer.setPreview(null);
    this.renderer.setDragPiece(null);
    this.setState('placed');
    this.onChange?.();
    this.renderer.render();
    this.setState('idle');
  }

  handleGlobalDragEnd(e) {
    if (this.pressingBoard && !this.dragging) {
      const pieceId = this.pressingBoard.pieceId;
      this.pressingBoard = null;
      this.rotatePiece(pieceId);
      return;
    }

    if (!this.dragging) return;

    const { pieceId } = this.dragging;
    const candidate = this.dragging.candidate;

    if (candidate?.valid && this.engine.tryPlace(pieceId, candidate.x, candidate.y)) {
      this.dragging = null;
      this.renderer.setPreview(null);
      this.renderer.setDragPiece(null);
      this.setState('placed');
      this.onChange?.();
      this.onInteract?.();
      this.renderer.render();
      this.setState('idle');
      return;
    }

    this.finishDragWithSnapBack(pieceId);
  }

  handlePointerLeave() {
    if (!this.dragging) {
      this.renderer.setHover(null);
      this.renderer.setPreview(null);
      this.renderer.render();
    }
  }

  handleMove(e) {
    if (this.dragging) return;
    const cell = this.renderer.cellAt(e.clientX, e.clientY);
    this.renderer.setHover(cell);
    this.renderer.render();
  }

  handleTapUp(e) {
    if (this.dragging) return;
    const target = e.target?.closest?.('[data-piece-id]');
    if (!target) return;
    const pieceId = Number(target.dataset.pieceId);
    if (Number.isNaN(pieceId)) return;

    const piece = this.engine.pieces[pieceId];
    if (!piece) return;
    if (!piece.placed) {
      this.rotatePiece(pieceId);
    }
  }

  handleDown(e) {
    e.preventDefault();
    if (this.dragging) return;

    const cell = this.renderer.cellAt(e.clientX, e.clientY);
    if (!cell) return;
    const [x, y] = cell;
    const boardId = this.engine.board[y * this.engine.size + x];

    if (boardId !== null) {
      this.pressingBoard = {
        pieceId: boardId,
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY
      };
    }
  }
}
