// Separate drag thresholds: tray pieces benefit from a larger threshold to avoid
// accidental drags when the user intends to tap-to-rotate.
const BOARD_DRAG_THRESHOLD = 4;
const TRAY_DRAG_THRESHOLD = 8;

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
    this.dragGhost = null;

    canvas.addEventListener('pointermove', (e) => this.handleMove(e));
    canvas.addEventListener('pointerleave', () => this.handlePointerLeave());
    canvas.addEventListener('pointerdown', (e) => this.handleDown(e));
    canvas.addEventListener('pointerup', () => this.handleTapUp());

    window.addEventListener('pointermove', (e) => this.handleGlobalDragMove(e));
    window.addEventListener('pointerup', (e) => this.handleGlobalDragEnd(e));
    // pointercancel fires when OS interrupts the pointer (e.g. incoming call).
    // Treat it identically to pointerup so the drag state is always cleaned up.
    window.addEventListener('pointercancel', (e) => this.handleGlobalDragEnd(e));
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

  ensureGhost() {
    if (this.dragGhost) return this.dragGhost;
    const ghost = document.createElement('div');
    ghost.className = 'polyfit-drag-ghost';
    ghost.style.position = 'fixed';
    ghost.style.left = '0';
    ghost.style.top = '0';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '80';
    ghost.style.opacity = '0';
    ghost.style.transition = 'opacity .08s ease-out';
    document.body.appendChild(ghost);
    this.dragGhost = ghost;
    return ghost;
  }

  buildGhostShape(pieceId) {
    const piece = this.engine.pieces[pieceId];
    const cells = piece?.variants[piece.variantIndex];
    if (!piece || !cells) return;
    const maxX = Math.max(...cells.map(([x]) => x));
    const maxY = Math.max(...cells.map(([, y]) => y));
    const dotSet = new Set(cells.map(([x, y]) => `${x},${y}`));
    const cellPx = 22;

    const wrap = this.ensureGhost();
    wrap.style.display = 'grid';
    wrap.style.gridTemplateColumns = `repeat(${maxX + 1}, ${cellPx}px)`;
    wrap.style.gap = '2px';
    wrap.innerHTML = '';

    for (let y = 0; y <= maxY; y += 1) {
      for (let x = 0; x <= maxX; x += 1) {
        const dot = document.createElement('span');
        dot.style.width = `${cellPx}px`;
        dot.style.height = `${cellPx}px`;
        dot.style.borderRadius = '4px';
        if (dotSet.has(`${x},${y}`)) {
          dot.style.background = piece.color;
          dot.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,.15)';
        } else {
          dot.style.background = 'transparent';
        }
        wrap.appendChild(dot);
      }
    }
  }

  showGhost(pieceId) {
    this.buildGhostShape(pieceId);
    this.ensureGhost().style.opacity = '0.96';
  }

  hideGhost() {
    if (!this.dragGhost) return;
    this.dragGhost.style.opacity = '0';
  }

  moveGhost(clientX, clientY, anchorOffsetPx = null) {
    if (!this.dragGhost) return;
    const rect = this.dragGhost.getBoundingClientRect();
    const anchorX = anchorOffsetPx?.x ?? rect.width / 2;
    const anchorY = anchorOffsetPx?.y ?? rect.height / 2;
    this.dragGhost.style.transform = `translate(${Math.round(clientX - anchorX)}px, ${Math.round(clientY - anchorY)}px)`;
  }

  computeTrayAnchor(pieceId, clientX, clientY, trayRect) {
    const piece = this.engine.pieces[pieceId];
    const cells = piece?.variants[piece.variantIndex];
    if (!piece || !cells || !trayRect) return null;

    const maxX = Math.max(...cells.map(([x]) => x));
    const maxY = Math.max(...cells.map(([, y]) => y));
    const cols = maxX + 1;
    const rows = maxY + 1;
    const pieceCell = 22;
    const gap = 2;
    const pieceWidth = cols * pieceCell + Math.max(0, cols - 1) * gap;
    const pieceHeight = rows * pieceCell + Math.max(0, rows - 1) * gap;

    const left = trayRect.left + (trayRect.width - pieceWidth) / 2;
    const top = trayRect.top + (trayRect.height - pieceHeight) / 2;

    return {
      x: Math.max(0, Math.min(pieceWidth, clientX - left)),
      y: Math.max(0, Math.min(pieceHeight, clientY - top))
    };
  }

  startTrayDrag(pieceId, clientX, clientY, trayRect = null, pointerId = null) {
    const piece = this.engine.pieces[pieceId];
    if (!piece || piece.placed) return;

    this.dragging = {
      pieceId,
      source: 'bank',
      pointerId,
      startClientX: clientX,
      startClientY: clientY,
      lastValid: { source: 'bank' },
      moved: false,
      candidate: null,
      anchorOffsetPx: this.computeTrayAnchor(pieceId, clientX, clientY, trayRect)
    };

    this.showGhost(pieceId);
    this.onSelectPiece?.(pieceId);
    this.setState('dragging');
    this.updateDragPreview(clientX, clientY);
  }

  startFloatingPiece(pieceId, clientX, clientY, anchorOffsetPx = null) {
    this.dragging = {
      pieceId,
      source: 'floating',
      pointerId: null,
      startClientX: clientX,
      startClientY: clientY,
      lastValid: { source: 'bank' },
      moved: true,
      candidate: null,
      anchorOffsetPx
    };
    this.showGhost(pieceId);
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

    this.showGhost(pieceId);
    this.onSelectPiece?.(pieceId);
    this.setState('dragging');
    this.updateDragPreview(clientX, clientY);
  }

  rotatePiece(pieceId) {
    const piece = this.engine.pieces[pieceId];
    if (!piece) return false;

    if (!piece.placed) {
      this.engine.rotateSelected(pieceId);
      this.renderer.animateRotation(pieceId);
      if (this.dragging?.pieceId === pieceId) {
        this.showGhost(pieceId);
        this.updateDragPreview(this.dragging.lastClientX ?? this.dragging.startClientX, this.dragging.lastClientY ?? this.dragging.startClientY);
      } else {
        this.renderer.render();
      }
      this.onSelectPiece?.(pieceId);
      this.onChange?.();
      return true;
    }

    const original = { ...piece.placed };
    this.engine.removePiece(pieceId);
    piece.variantIndex = (piece.variantIndex + 1) % piece.variants.length;

    const placed = this.engine.tryPlace(pieceId, original.x, original.y);
    if (!placed) {
      const rect = this.canvas.getBoundingClientRect();
      const floatX = rect.left + rect.width / 2;
      const floatY = rect.top + 28;
      this.renderer.animateRotation(pieceId);
      this.startFloatingPiece(pieceId, floatX, floatY, null);
      this.onChange?.();
      this.onInteract?.();
      return false;
    }

    this.renderer.animateRotation(pieceId, {
      x: this.renderer.offsetX + (original.x + 0.5) * this.renderer.cell,
      y: this.renderer.offsetY + (original.y + 0.5) * this.renderer.cell
    });
    this.onSelectPiece?.(pieceId);
    this.renderer.render();
    this.onChange?.();
    this.onInteract?.();
    return true;
  }

  updateDragPreview(clientX, clientY) {
    if (!this.dragging) return;

    this.dragging.lastClientX = clientX;
    this.dragging.lastClientY = clientY;
    this.moveGhost(clientX, clientY, this.dragging.anchorOffsetPx);

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
    if (this.pressingBoard && !this.dragging) {
      const dx = Math.abs(e.clientX - this.pressingBoard.startClientX);
      const dy = Math.abs(e.clientY - this.pressingBoard.startClientY);
      if (dx + dy > BOARD_DRAG_THRESHOLD) {
        this.startBoardDrag(this.pressingBoard.pieceId, this.pressingBoard.startClientX, this.pressingBoard.startClientY, this.pressingBoard.pointerId);
        this.pressingBoard = null;
      }
    }

    if (!this.dragging) return;
    // Only track the pointer that started the drag
    if (this.dragging.pointerId !== null && e.pointerId !== this.dragging.pointerId) return;

    const threshold = this.dragging.source === 'bank' ? TRAY_DRAG_THRESHOLD : BOARD_DRAG_THRESHOLD;
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
    this.hideGhost();
    this.renderer.setPreview(null);
    this.renderer.setDragPiece(null);
    this.setState('placed');
    this.onChange?.();
    this.renderer.render();
    this.setState('idle');
  }

  handleGlobalDragEnd(e) {
    // Only handle the pointer that started the drag (ignore other fingers)
    if (this.dragging && this.dragging.pointerId !== null && e.pointerId !== this.dragging.pointerId) return;
    if (this.pressingBoard && this.pressingBoard.pointerId !== null && e.pointerId !== this.pressingBoard.pointerId) return;

    if (this.pressingBoard && !this.dragging) {
      const pieceId = this.pressingBoard.pieceId;
      this.pressingBoard = null;
      this.rotatePiece(pieceId);
      return;
    }

    if (!this.dragging) return;

    const { pieceId, source, moved } = this.dragging;
    const candidate = this.dragging.candidate;

    if (source === 'bank' && !moved) {
      this.rotatePiece(pieceId);
      this.dragging = null;
      this.hideGhost();
      this.renderer.setPreview(null);
      this.renderer.setDragPiece(null);
      this.setState('idle');
      this.renderer.render();
      return;
    }

    if (candidate?.valid && this.engine.tryPlace(pieceId, candidate.x, candidate.y)) {
      this.dragging = null;
      this.hideGhost();
      this.renderer.setPreview(null);
      this.renderer.setDragPiece(null);
      this.setState('placed');
      this.onChange?.();
      this.onInteract?.();
      this.renderer.render();
      this.setState('idle');
      return;
    }

    // Bug fix: 'floating' pieces must snap back to tray on invalid drop.
    // Previously, this branch returned early without clearing dragging or hiding the ghost,
    // leaving the piece permanently lost and the game stuck.
    if (source === 'floating') {
      this.renderer.pulseInvalidPiece(pieceId);
      this.dragging = null;
      this.hideGhost();
      this.renderer.setPreview(null);
      this.renderer.setDragPiece(null);
      this.setState('idle');
      this.onChange?.();
      this.renderer.render();
      return;
    }

    // Show invalid-placement pulse before snap-back for board drags
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
    // Board taps are handled in handleGlobalDragEnd via pressingBoard.
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
