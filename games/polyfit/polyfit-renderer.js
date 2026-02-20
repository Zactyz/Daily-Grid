const BANK_GAP = 8;
const BANK_PAD = 12; // space between grid bottom and bank top, and below bank

export class PolyfitRenderer {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.engine = engine;
    this.selectedId = 0;
    this.hover = null;
    this.preview = null;
    this.dragPiece = null;
    this.invalidPiecePulse = null;
    this.rotationAnim = null;
    this.padding = 14;
    this._bankPieceSlots = [];
    this.canvasW = 0;
    this.canvasH = 0;
    this.resize();
  }

  setEngine(engine) { this.engine = engine; this.resize(); }
  setSelected(id) { this.selectedId = id; }
  setHover(pos) { this.hover = pos; }
  setPreview(preview) { this.preview = preview; }
  setDragPiece(payload) { this.dragPiece = payload; }

  pulseInvalidPiece(pieceId) {
    this.invalidPiecePulse = { pieceId, until: performance.now() + 280 };
  }

  animateRotation(pieceId, origin = null) {
    // Always animate 90deg so symmetric (2-variant) pieces don't flip too far visually.
    const angleRad = Math.PI / 2;
    this.rotationAnim = {
      pieceId,
      start: performance.now(),
      duration: 170,
      origin,
      angleRad
    };
  }

  getRotationState(pieceId) {
    if (!this.rotationAnim || this.rotationAnim.pieceId !== pieceId) return null;
    const elapsed = performance.now() - this.rotationAnim.start;
    const t = Math.min(1, elapsed / this.rotationAnim.duration);
    if (t >= 1) {
      this.rotationAnim = null;
      return null;
    }
    // Animate from -angleRad to 0 so piece appears to spin into new orientation.
    // angleRad = 360°/numVariants (90° for 4 variants, 180° for 2 variants).
    const { angleRad } = this.rotationAnim;
    return {
      angle: angleRad * (t - 1),
      origin: this.rotationAnim.origin
    };
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;

    const N = this.engine.pieces.length;
    const bankRows = N <= 4 ? 1 : 2;
    const bankCols = Math.ceil(N / bankRows);

    // Grid fills available width
    this.gridSizePx = r.width - this.padding * 2;
    this.cell = this.gridSizePx / this.engine.size;
    this.offsetX = this.padding;
    this.offsetY = this.padding;

    // Bank cell: fit bankCols×4-cell slots across the grid width
    this.bankCell = Math.max(8, Math.floor((this.gridSizePx - (bankCols - 1) * BANK_GAP) / (bankCols * 4)));
    this.bankSlotPx = 4 * this.bankCell;
    this.bankCols = bankCols;
    this.bankRows = bankRows;

    // Center the bank row(s) within the grid width
    const bankRowW = bankCols * this.bankSlotPx + (bankCols - 1) * BANK_GAP;
    this.bankStartX = this.offsetX + (this.gridSizePx - bankRowW) / 2;
    this.bankY = this.offsetY + this.gridSizePx + BANK_PAD;

    // Total canvas logical height
    const bankAreaH = bankRows * this.bankSlotPx + (bankRows - 1) * BANK_GAP;
    const totalH = this.bankY + bankAreaH + BANK_PAD;

    this.canvas.width = r.width * dpr;
    this.canvas.height = totalH * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.canvasW = r.width;
    this.canvasH = totalH;

    // Pre-compute bank slot hit areas
    this._bankPieceSlots = this.engine.pieces.map((p, i) => {
      const col = i % bankCols;
      const row = Math.floor(i / bankCols);
      return {
        x: this.bankStartX + col * (this.bankSlotPx + BANK_GAP),
        y: this.bankY + row * (this.bankSlotPx + BANK_GAP),
        w: this.bankSlotPx,
        h: this.bankSlotPx,
        pieceId: p.id
      };
    });
  }

  // Returns piece id if (localX, localY) is inside an unplaced bank slot; null otherwise.
  getBankPieceAt(localX, localY) {
    for (const slot of this._bankPieceSlots) {
      if (localX >= slot.x && localX < slot.x + slot.w &&
          localY >= slot.y && localY < slot.y + slot.h) {
        const p = this.engine.pieces[slot.pieceId];
        if (p && !p.placed) return slot.pieceId;
      }
    }
    return null;
  }

  pieceBoundsPx(pieceId) {
    const p = this.engine.pieces[pieceId];
    if (!p) return null;
    const cells = p.variants[p.variantIndex];
    const minX = Math.min(...cells.map(([x]) => x));
    const minY = Math.min(...cells.map(([, y]) => y));
    const maxX = Math.max(...cells.map(([x]) => x));
    const maxY = Math.max(...cells.map(([, y]) => y));
    return {
      minX,
      minY,
      width: (maxX - minX + 1) * this.cell,
      height: (maxY - minY + 1) * this.cell
    };
  }

  getBoardPiecePointerOffset(pieceId, clientX, clientY) {
    const piece = this.engine.pieces[pieceId];
    if (!piece?.placed) return null;
    const rect = this.canvas.getBoundingClientRect();
    const b = this.pieceBoundsPx(pieceId);
    if (!b) return null;

    const topLeftX = this.offsetX + (piece.placed.x + b.minX) * this.cell;
    const topLeftY = this.offsetY + (piece.placed.y + b.minY) * this.cell;

    return {
      x: clientX - rect.left - topLeftX,
      y: clientY - rect.top - topLeftY
    };
  }

  snapOriginForPointer(pieceId, clientX, clientY, anchorOffsetPx = null) {
    const rect = this.canvas.getBoundingClientRect();
    const b = this.pieceBoundsPx(pieceId);
    if (!b) return null;

    const anchorX = anchorOffsetPx?.x ?? b.width / 2;
    const anchorY = anchorOffsetPx?.y ?? b.height / 2;

    const localX = clientX - rect.left - this.offsetX;
    const localY = clientY - rect.top - this.offsetY;

    if (localX < 0 || localY < 0 || localX >= this.gridSizePx || localY >= this.gridSizePx) return null;

    const originX = Math.round((localX - anchorX) / this.cell - b.minX);
    const originY = Math.round((localY - anchorY) / this.cell - b.minY);

    return { x: originX, y: originY };
  }

  cellAt(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const x = clientX - r.left - this.offsetX;
    const y = clientY - r.top - this.offsetY;
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    if (cx < 0 || cy < 0 || cx >= this.engine.size || cy >= this.engine.size) return null;
    return [cx, cy];
  }

  drawPlacementAffordance(pieceId, originX, originY, isValid) {
    const { ctx } = this;
    const p = this.engine.pieces[pieceId];
    if (!p) return;

    const stroke = isValid ? 'rgba(16,185,129,.95)' : 'rgba(248,113,113,.9)';
    const fill = isValid ? 'rgba(16,185,129,.15)' : 'rgba(248,113,113,.15)';

    p.variants[p.variantIndex].forEach(([dx, dy]) => {
      const x = originX + dx;
      const y = originY + dy;
      if (x < 0 || y < 0 || x >= this.engine.size || y >= this.engine.size) return;

      const px = this.offsetX + x * this.cell + 4;
      const py = this.offsetY + y * this.cell + 4;
      const sz = this.cell - 8;
      ctx.fillStyle = fill;
      ctx.fillRect(px, py, sz, sz);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, sz, sz);
    });
  }

  // Draws piece cells at an arbitrary top-left position.
  // cellSize defaults to grid cell size (this.cell); pass bankCell for bank rendering.
  drawPieceCells(piece, cells, topLeftX, topLeftY, alpha = 1, cellSize = null) {
    const cs = cellSize ?? this.cell;
    const { ctx } = this;
    const minX = Math.min(...cells.map(([x]) => x));
    const minY = Math.min(...cells.map(([, y]) => y));
    const maxX = Math.max(...cells.map(([x]) => x));
    const maxY = Math.max(...cells.map(([, y]) => y));
    const width = (maxX - minX + 1) * cs;
    const height = (maxY - minY + 1) * cs;

    const rotation = this.getRotationState(piece.id);
    if (rotation) {
      const origin = rotation.origin || { x: topLeftX + width / 2, y: topLeftY + height / 2 };
      ctx.save();
      ctx.translate(origin.x, origin.y);
      ctx.rotate(rotation.angle);
      ctx.translate(-origin.x, -origin.y);
    }

    const margin = Math.max(2, Math.round(cs * 0.05));
    ctx.globalAlpha = alpha;
    cells.forEach(([dx, dy]) => {
      const x = topLeftX + (dx - minX) * cs + margin;
      const y = topLeftY + (dy - minY) * cs + margin;
      ctx.fillStyle = piece.color;
      ctx.fillRect(x, y, cs - 2 * margin, cs - 2 * margin);
      ctx.strokeStyle = 'rgba(0,0,0,.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, cs - 2 * margin - 1, cs - 2 * margin - 1);
    });
    ctx.globalAlpha = 1;

    if (rotation) ctx.restore();
  }

  drawDraggingPiece() {
    if (!this.dragPiece) return;
    const { pieceId, clientX, clientY, anchorOffsetPx } = this.dragPiece;
    const p = this.engine.pieces[pieceId];
    if (!p) return;

    const rect = this.canvas.getBoundingClientRect();
    if (clientX < rect.left - 24 || clientY < rect.top - 24 || clientX > rect.right + 24 || clientY > rect.bottom + 24) return;

    const b = this.pieceBoundsPx(pieceId);
    if (!b) return;

    const anchorX = anchorOffsetPx?.x ?? b.width / 2;
    const anchorY = anchorOffsetPx?.y ?? b.height / 2;
    const topLeftX = clientX - rect.left - anchorX;
    const topLeftY = clientY - rect.top - anchorY;

    // Drag piece always renders at grid cell size
    this.drawPieceCells(p, p.variants[p.variantIndex], topLeftX, topLeftY, 0.94);
  }

  drawBank() {
    const { ctx } = this;
    const draggingId = this.dragPiece?.pieceId ?? null;

    // Subtle separator line between grid and bank
    ctx.strokeStyle = 'rgba(245,158,11,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.offsetX, this.bankY - BANK_PAD / 2);
    ctx.lineTo(this.offsetX + this.gridSizePx, this.bankY - BANK_PAD / 2);
    ctx.stroke();

    this._bankPieceSlots.forEach((slot) => {
      const p = this.engine.pieces[slot.pieceId];
      if (!p) return;

      const cells = p.variants[p.variantIndex];
      const bw = (Math.max(...cells.map(([x]) => x)) + 1) * this.bankCell;
      const bh = (Math.max(...cells.map(([, y]) => y)) + 1) * this.bankCell;
      const drawX = slot.x + (slot.w - bw) / 2;
      const drawY = slot.y + (slot.h - bh) / 2;

      const isDragging = draggingId === p.id && !p.placed;
      const isPlaced = !!p.placed;
      const isSelected = p.id === this.selectedId && !isPlaced && !isDragging;

      if (isPlaced || isDragging) {
        // Dim ghost placeholder so the player knows the slot exists
        ctx.globalAlpha = 0.25;
        cells.forEach(([dx, dy]) => {
          ctx.fillStyle = p.color;
          const m = Math.max(1, Math.round(this.bankCell * 0.05));
          ctx.fillRect(drawX + dx * this.bankCell + m, drawY + dy * this.bankCell + m, this.bankCell - 2 * m, this.bankCell - 2 * m);
        });
        ctx.globalAlpha = 1;
      } else {
        // Selection highlight background
        if (isSelected) {
          ctx.fillStyle = `${p.color}20`;
          ctx.fillRect(slot.x, slot.y, slot.w, slot.h);
        }

        // Draw piece at bank cell size
        this.drawPieceCells(p, cells, drawX, drawY, 1.0, this.bankCell);

        // Selection border
        if (isSelected) {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.6;
          ctx.strokeRect(slot.x + 1, slot.y + 1, slot.w - 2, slot.h - 2);
          ctx.globalAlpha = 1;
        }
      }
    });
  }

  drawFootprint() {
    const { ctx } = this;

    for (let y = 0; y < this.engine.size; y += 1) {
      for (let x = 0; x < this.engine.size; x += 1) {
        const idx = y * this.engine.size + x;
        if (!this.engine.targetMask[idx]) continue;
        const px = this.offsetX + x * this.cell;
        const py = this.offsetY + y * this.cell;
        ctx.fillStyle = 'rgba(245, 158, 11, 0.09)';
        ctx.fillRect(px + 1, py + 1, this.cell - 2, this.cell - 2);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.18)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, this.cell - 1, this.cell - 1);

        const neighbors = [
          [x, y - 1, 0, 0, this.cell, 0],
          [x + 1, y, this.cell, 0, this.cell, this.cell],
          [x, y + 1, 0, this.cell, this.cell, this.cell],
          [x - 1, y, 0, 0, 0, this.cell]
        ];

        neighbors.forEach(([nx, ny, x1, y1, x2, y2]) => {
          if (nx < 0 || ny < 0 || nx >= this.engine.size || ny >= this.engine.size || !this.engine.targetMask[ny * this.engine.size + nx]) {
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.52)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px + x1, py + y1);
            ctx.lineTo(px + x2, py + y2);
            ctx.stroke();
          }
        });
      }
    }
  }

  render() {
    if (!this.canvasW || !this.canvasH) return;
    const { ctx } = this;
    ctx.clearRect(0, 0, this.canvasW, this.canvasH);
    ctx.fillStyle = '#110e1a';
    ctx.fillRect(0, 0, this.canvasW, this.canvasH);

    this.drawFootprint();

    this.engine.board.forEach((id, idx) => {
      if (id === null) return;
      const x = idx % this.engine.size;
      const y = Math.floor(idx / this.engine.size);
      const pulsing = this.invalidPiecePulse && this.invalidPiecePulse.pieceId === id && performance.now() < this.invalidPiecePulse.until;
      const tone = pulsing ? '#f87171' : this.engine.pieces[id].color;
      ctx.fillStyle = tone;
      ctx.fillRect(this.offsetX + x * this.cell + 3, this.offsetY + y * this.cell + 3, this.cell - 6, this.cell - 6);
    });

    const activePreview = this.preview || (this.hover ? { pieceId: this.selectedId, x: this.hover[0], y: this.hover[1], valid: this.engine.canPlaceAt(this.selectedId, this.hover[0], this.hover[1]) } : null);
    if (activePreview && !this.dragPiece && activePreview.valid) {
      const { pieceId, x, y } = activePreview;
      this.drawPlacementAffordance(pieceId, x, y, true);
    }

    if (this.preview && this.dragPiece && this.preview.valid) {
      this.drawPlacementAffordance(this.preview.pieceId, this.preview.x, this.preview.y, true);
    }

    this.drawBank();
    this.drawDraggingPiece();

    if (this.rotationAnim) requestAnimationFrame(() => this.render());
  }
}
