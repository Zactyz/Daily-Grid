// Separate drag thresholds: bank pieces benefit from a larger threshold to avoid
// accidental drags when the user intends to tap-to-rotate.
const BOARD_DRAG_THRESHOLD = 4;
const BANK_DRAG_THRESHOLD = 8;

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
    this.pressingBank = null;
    this._rotationCooldownUntil = 0;

    this._onMove         = (e) => this.handleMove(e);
    this._onLeave        = () => this.handlePointerLeave();
    this._onDown         = (e) => this.handleDown(e);
    this._onTapUp        = () => this.handleTapUp();
    this._onGlobalMove   = (e) => this.handleGlobalDragMove(e);
    this._onGlobalUp     = (e) => this.handleGlobalDragEnd(e);
    this._onGlobalCancel = (e) => this.handleGlobalDragEnd(e);

    canvas.addEventListener('pointermove',  this._onMove);
    canvas.addEventListener('pointerleave', this._onLeave);
    canvas.addEventListener('pointerdown',  this._onDown);
    canvas.addEventListener('pointerup',    this._onTapUp);

    window.addEventListener('pointermove',   this._onGlobalMove);
    window.addEventListener('pointerup',     this._onGlobalUp);
    window.addEventListener('pointercancel', this._onGlobalCancel);
  }

  destroy() {
    window.removeEventListener('pointermove',   this._onGlobalMove);
    window.removeEventListener('pointerup',     this._onGlobalUp);
    window.removeEventListener('pointercancel', this._onGlobalCancel);
    this.canvas.removeEventListener('pointermove',  this._onMove);
    this.canvas.removeEventListener('pointerleave', this._onLeave);
    this.canvas.removeEventListener('pointerdown',  this._onDown);
    this.canvas.removeEventListener('pointerup',    this._onTapUp);
    this.dragging = null;
    this.pressingBoard = null;
    this.pressingBank = null;
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

  startBoardDrag(pieceId, clientX, clientY, pointerId = null) {
    const piece = this.engine.pieces[pieceId];
    if (!piece || !piece.placed) return;

    const lastValid = {
      source: 'board',
      x: piece.placed.x,
      y: piece.placed.y,
      variantIndex: piece.placed.variantIndex
    };

    const anchorOffsetPx = this.renderer.getBoardPiecePointerOffset(pieceId, clientX, clientY);
    this.engine.removePiece(pieceId);

    this.dragging = {
      pieceId,
      source: 'board',
      pointerId,
      startClientX: clientX,
      startClientY: clientY,
      lastValid,
      moved: false,
      candidate: null,
      anchorOffsetPx
    };

    this.onSelectPiece?.(pieceId);
    this.setState('dragging');
    this.updateDragPreview(clientX, clientY);
  }

  // Rotates an unplaced piece and triggers canvas animation.
  // Cooldown prevents rapid double-taps from stacking animations and causing scroll jump.
  rotatePiece(pieceId) {
    const piece = this.engine.pieces[pieceId];
    if (!piece || piece.placed) return false;
    const now = performance.now();
    if (now < this._rotationCooldownUntil) return false;

    this._rotationCooldownUntil = now + 220;
    this.engine.rotateSelected(pieceId);
    this.renderer.animateRotation(pieceId);
    if (this.dragging?.pieceId === pieceId) {
      this.updateDragPreview(
        this.dragging.lastClientX ?? this.dragging.startClientX,
        this.dragging.lastClientY ?? this.dragging.startClientY
      );
    } else {
      this.renderer.render();
    }
    this.onSelectPiece?.(pieceId);
    this.onChange?.();
    return true;
  }

  updateDragPreview(clientX, clientY) {
    if (!this.dragging) return;

    this.dragging.lastClientX = clientX;
    this.dragging.lastClientY = clientY;

    const snapped = this.renderer.snapOriginForPointer(this.dragging.pieceId, clientX, clientY, this.dragging.anchorOffsetPx);
    if (!snapped) {
      this.dragging.candidate = null;
      this.renderer.setPreview(null);
      this.renderer.setDragPiece({ pieceId: this.dragging.pieceId, clientX, clientY, anchorOffsetPx: this.dragging.anchorOffsetPx });
      this.renderer.render();
      return;
    }

    const canPlace = this.engine.canPlaceAt(this.dragging.pieceId, snapped.x, snapped.y);
    this.dragging.candidate = canPlace ? { x: snapped.x, y: snapped.y, valid: true } : null;
    this.renderer.setPreview(canPlace ? { pieceId: this.dragging.pieceId, x: snapped.x, y: snapped.y, valid: true } : null);
    this.renderer.setDragPiece({ pieceId: this.dragging.pieceId, clientX, clientY, anchorOffsetPx: this.dragging.anchorOffsetPx });
    this.renderer.render();
  }

  handleGlobalDragMove(e) {
    // Check pressingBank threshold → transition to full drag
    if (this.pressingBank && !this.dragging) {
      if (this.pressingBank.pointerId !== null && e.pointerId !== this.pressingBank.pointerId) return;
      const dx = Math.abs(e.clientX - this.pressingBank.startClientX);
      const dy = Math.abs(e.clientY - this.pressingBank.startClientY);
      if (dx + dy > BANK_DRAG_THRESHOLD) {
        const { pieceId, pointerId } = this.pressingBank;
        const piece = this.engine.pieces[pieceId];
        this.pressingBank = null;
        if (piece && !piece.placed) {
          this.dragging = {
            pieceId,
            source: 'bank',
            pointerId,
            startClientX: e.clientX,
            startClientY: e.clientY,
            lastValid: { source: 'bank' },
            moved: true,
            candidate: null,
            anchorOffsetPx: null // center anchor at grid cell size
          };
          this.setState('dragging');
          this.updateDragPreview(e.clientX, e.clientY);
        }
      }
      return;
    }

    // Check pressingBoard threshold → transition to board drag
    if (this.pressingBoard && !this.dragging) {
      if (this.pressingBoard.pointerId !== null && e.pointerId !== this.pressingBoard.pointerId) return;
      const dx = Math.abs(e.clientX - this.pressingBoard.startClientX);
      const dy = Math.abs(e.clientY - this.pressingBoard.startClientY);
      if (dx + dy > BOARD_DRAG_THRESHOLD) {
        this.startBoardDrag(this.pressingBoard.pieceId, this.pressingBoard.startClientX, this.pressingBoard.startClientY, this.pressingBoard.pointerId);
        this.pressingBoard = null;
      }
    }

    if (!this.dragging) return;
    if (this.dragging.pointerId !== null && e.pointerId !== this.dragging.pointerId) return;

    const threshold = this.dragging.source === 'bank' ? BANK_DRAG_THRESHOLD : BOARD_DRAG_THRESHOLD;
    const dx = Math.abs(e.clientX - this.dragging.startClientX);
    const dy = Math.abs(e.clientY - this.dragging.startClientY);
    if (dx + dy > threshold) this.dragging.moved = true;

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
    // Bank press: tap to rotate
    if (this.pressingBank && !this.dragging) {
      if (this.pressingBank.pointerId !== null && e.pointerId !== this.pressingBank.pointerId) return;
      const pieceId = this.pressingBank.pieceId;
      this.pressingBank = null;
      this.rotatePiece(pieceId);
      this.renderer.render();
      return;
    }

    // Board press without drag: tap to unplace
    if (this.pressingBoard && !this.dragging) {
      if (this.pressingBoard.pointerId !== null && e.pointerId !== this.pressingBoard.pointerId) return;
      const pieceId = this.pressingBoard.pieceId;
      this.pressingBoard = null;
      this.engine.removePiece(pieceId);
      this.onSelectPiece?.(pieceId);
      this.onChange?.();
      this.renderer.render();
      return;
    }

    if (!this.dragging) return;
    if (this.dragging.pointerId !== null && e.pointerId !== this.dragging.pointerId) return;

    const { pieceId, moved } = this.dragging;
    const candidate = this.dragging.candidate;

    // Bank tap (drag started but didn't move enough) → rotate
    if (this.dragging.source === 'bank' && !moved) {
      this.dragging = null;
      this.renderer.setPreview(null);
      this.renderer.setDragPiece(null);
      this.setState('idle');
      this.rotatePiece(pieceId);
      this.renderer.render();
      return;
    }

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

    if (candidate !== null && !candidate?.valid) {
      this.renderer.pulseInvalidPiece(pieceId);
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

  handleTapUp() {
    // Board and bank taps are handled via pressingBoard/pressingBank in handleGlobalDragEnd.
  }

  handleDown(e) {
    e.preventDefault();
    if (this.dragging) return;

    const rect = this.canvas.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;

    // Check bank area first (bank is below grid in canvas)
    const bankPieceId = this.renderer.getBankPieceAt(localX, localY);
    if (bankPieceId !== null) {
      this.onSelectPiece?.(bankPieceId);
      this.pressingBank = {
        pieceId: bankPieceId,
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY
      };
      this.renderer.render(); // update selected highlight
      return;
    }

    // Check grid/board area
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
