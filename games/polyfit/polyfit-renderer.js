export class PolyfitRenderer {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.engine = engine;
    this.selectedId = 0;
    this.hover = null;
    this.preview = null;
    this.padding = 18;
    this.resize();
  }

  setEngine(engine) { this.engine = engine; this.resize(); }
  setSelected(id) { this.selectedId = id; }
  setHover(pos) { this.hover = pos; }
  setPreview(preview) { this.preview = preview; }

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

  drawPiece(pieceId, originX, originY, alpha = 1, valid = true) {
    const { ctx } = this;
    const p = this.engine.pieces[pieceId];
    if (!p) return;
    const tone = valid ? p.color : '#f87171';
    ctx.globalAlpha = alpha;
    p.variants[p.variantIndex].forEach(([dx, dy]) => {
      const x = originX + dx;
      const y = originY + dy;
      if (x < 0 || y < 0 || x >= this.engine.size || y >= this.engine.size) return;
      ctx.fillStyle = tone;
      ctx.fillRect(this.offsetX + x * this.cell + 3, this.offsetY + y * this.cell + 3, this.cell - 6, this.cell - 6);
    });
    ctx.globalAlpha = 1;
  }

  drawPreview(pieceId, originX, originY) {
    const { ctx } = this;
    const p = this.engine.pieces[pieceId];
    if (!p) return;

    p.variants[p.variantIndex].forEach(([dx, dy]) => {
      const x = originX + dx;
      const y = originY + dy;
      if (x < 0 || y < 0 || x >= this.engine.size || y >= this.engine.size) return;
      const idx = y * this.engine.size + x;
      const validCell = this.engine.targetMask[idx] && this.engine.board[idx] === null;

      const px = this.offsetX + x * this.cell + 3;
      const py = this.offsetY + y * this.cell + 3;
      const sz = this.cell - 6;

      if (validCell) {
        ctx.globalAlpha = 0.52;
        ctx.fillStyle = p.color;
        ctx.fillRect(px, py, sz, sz);
      } else {
        // gray hole marker for invalid placement area
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
        ctx.fillRect(px, py, sz, sz);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px + 1, py + 1, sz - 2, sz - 2);
      }
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

    for (let y = 0; y < this.engine.size; y += 1) {
      for (let x = 0; x < this.engine.size; x += 1) {
        const idx = y * this.engine.size + x;
        if (!this.engine.targetMask[idx]) continue;
        ctx.fillStyle = 'rgba(245, 158, 11, 0.11)';
        ctx.fillRect(this.offsetX + x * this.cell + 1, this.offsetY + y * this.cell + 1, this.cell - 2, this.cell - 2);
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    for (let i = 0; i <= this.engine.size; i += 1) {
      const p = this.offsetX + i * this.cell;
      ctx.beginPath(); ctx.moveTo(p, this.offsetY); ctx.lineTo(p, this.offsetY + this.sizePx); ctx.stroke();
      const q = this.offsetY + i * this.cell;
      ctx.beginPath(); ctx.moveTo(this.offsetX, q); ctx.lineTo(this.offsetX + this.sizePx, q); ctx.stroke();
    }

    this.engine.board.forEach((id, idx) => {
      if (id === null) return;
      const x = idx % this.engine.size;
      const y = Math.floor(idx / this.engine.size);
      ctx.fillStyle = this.engine.pieces[id].color;
      ctx.fillRect(this.offsetX + x * this.cell + 3, this.offsetY + y * this.cell + 3, this.cell - 6, this.cell - 6);
    });

    const activePreview = this.preview || (this.hover ? { pieceId: this.selectedId, x: this.hover[0], y: this.hover[1] } : null);
    if (activePreview) {
      const { pieceId, x, y } = activePreview;
      this.drawPreview(pieceId, x, y);
    }
  }
}
