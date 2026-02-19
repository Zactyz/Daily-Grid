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
    this.padding = 18;
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

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = r.width * dpr;
    this.canvas.height = r.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.sizePx = Math.min(r.width, r.height) - this.padding * 2;
    this.cell = this.sizePx / this.engine.size;
    this.offsetX = (r.width - this.sizePx) / 2;
    this.offsetY = (r.height - this.sizePx) / 2;
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

    if (localX < 0 || localY < 0 || localX >= this.sizePx || localY >= this.sizePx) return null;

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

  drawDraggingPiece() {
    if (!this.dragPiece) return;
    const { pieceId, clientX, clientY, anchorOffsetPx } = this.dragPiece;
    const p = this.engine.pieces[pieceId];
    if (!p) return;

    const rect = this.canvas.getBoundingClientRect();
    const b = this.pieceBoundsPx(pieceId);
    if (!b) return;

    const anchorX = anchorOffsetPx?.x ?? b.width / 2;
    const anchorY = anchorOffsetPx?.y ?? b.height / 2;
    const topLeftX = clientX - rect.left - anchorX;
    const topLeftY = clientY - rect.top - anchorY;

    const { ctx } = this;
    ctx.globalAlpha = 0.94;
    p.variants[p.variantIndex].forEach(([dx, dy]) => {
      const x = topLeftX + (dx - b.minX) * this.cell + 3;
      const y = topLeftY + (dy - b.minY) * this.cell + 3;
      ctx.fillStyle = p.color;
      ctx.fillRect(x, y, this.cell - 6, this.cell - 6);
      ctx.strokeStyle = 'rgba(0,0,0,.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + .5, y + .5, this.cell - 7, this.cell - 7);
    });
    ctx.globalAlpha = 1;
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
    const { ctx } = this;
    const w = this.canvas.getBoundingClientRect().width;
    const h = this.canvas.getBoundingClientRect().height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#110e1a';
    ctx.fillRect(0, 0, w, h);

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

    this.drawDraggingPiece();
  }
}
