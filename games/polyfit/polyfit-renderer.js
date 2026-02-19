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

  cellAt(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const x = clientX - r.left - this.offsetX;
    const y = clientY - r.top - this.offsetY;
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    if (cx < 0 || cy < 0 || cx >= this.engine.size || cy >= this.engine.size) return null;
    return [cx, cy];
  }

  drawPieceCells(pieceId, originX, originY, options = {}) {
    const { alpha = 1, tone = null, inset = 3 } = options;
    const { ctx } = this;
    const p = this.engine.pieces[pieceId];
    if (!p) return;
    const color = tone || p.color;

    ctx.globalAlpha = alpha;
    p.variants[p.variantIndex].forEach(([dx, dy]) => {
      const x = originX + dx;
      const y = originY + dy;
      if (x < 0 || y < 0 || x >= this.engine.size || y >= this.engine.size) return;
      ctx.fillStyle = color;
      ctx.fillRect(this.offsetX + x * this.cell + inset, this.offsetY + y * this.cell + inset, this.cell - inset * 2, this.cell - inset * 2);
    });
    ctx.globalAlpha = 1;
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
    const { pieceId, clientX, clientY, valid } = this.dragPiece;
    const p = this.engine.pieces[pieceId];
    if (!p) return;

    const rect = this.canvas.getBoundingClientRect();
    const minX = Math.min(...p.variants[p.variantIndex].map(([x]) => x));
    const minY = Math.min(...p.variants[p.variantIndex].map(([, y]) => y));

    const anchorX = clientX - rect.left - this.offsetX;
    const anchorY = clientY - rect.top - this.offsetY;
    const gridX = anchorX / this.cell;
    const gridY = anchorY / this.cell;

    const { ctx } = this;
    ctx.globalAlpha = 0.94;
    p.variants[p.variantIndex].forEach(([dx, dy]) => {
      const x = this.offsetX + (gridX + dx - minX - 0.5) * this.cell + 3;
      const y = this.offsetY + (gridY + dy - minY - 0.5) * this.cell + 3;
      ctx.fillStyle = valid ? p.color : '#f87171';
      ctx.fillRect(x, y, this.cell - 6, this.cell - 6);
      ctx.strokeStyle = 'rgba(0,0,0,.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + .5, y + .5, this.cell - 7, this.cell - 7);
    });
    ctx.globalAlpha = 1;
  }

  render() {
    const { ctx } = this;
    const w = this.canvas.getBoundingClientRect().width;
    const h = this.canvas.getBoundingClientRect().height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#110e1a';
    ctx.fillRect(0, 0, w, h);

    // Draw only the target footprint cells (avoid confusing full-board square grid)
    for (let y = 0; y < this.engine.size; y += 1) {
      for (let x = 0; x < this.engine.size; x += 1) {
        const idx = y * this.engine.size + x;
        if (!this.engine.targetMask[idx]) continue;
        const px = this.offsetX + x * this.cell;
        const py = this.offsetY + y * this.cell;
        ctx.fillStyle = 'rgba(245, 158, 11, 0.07)';
        ctx.fillRect(px + 1, py + 1, this.cell - 2, this.cell - 2);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.22)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, this.cell - 1, this.cell - 1);
      }
    }

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
    if (activePreview && !this.dragPiece) {
      const { pieceId, x, y, valid } = activePreview;
      this.drawPlacementAffordance(pieceId, x, y, !!valid);
    }

    if (this.preview && this.dragPiece) {
      this.drawPlacementAffordance(this.preview.pieceId, this.preview.x, this.preview.y, !!this.preview.valid);
    }

    this.drawDraggingPiece();
  }
}
