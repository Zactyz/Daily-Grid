export class PolyfitRenderer {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.engine = engine;
    this.selectedId = 0;
    this.hover = null;
    this.padding = 20;
    this.resize();
  }

  setEngine(engine) { this.engine = engine; this.resize(); }
  setSelected(id) { this.selectedId = id; }
  setHover(pos) { this.hover = pos; }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = r.width * dpr;
    this.canvas.height = r.height * dpr;
    this.ctx.setTransform(dpr,0,0,dpr,0,0);
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

  render() {
    const { ctx } = this;
    const w = this.canvas.getBoundingClientRect().width;
    const h = this.canvas.getBoundingClientRect().height;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = '#120f1a';
    ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = 'rgba(255,255,255,.1)';
    for (let i=0;i<=this.engine.size;i++) {
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
      ctx.fillRect(this.offsetX + x*this.cell + 2, this.offsetY + y*this.cell + 2, this.cell - 4, this.cell - 4);
    });

    const p = this.engine.pieces[this.selectedId];
    if (p && !p.placed && this.hover) {
      const [ox, oy] = this.hover;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = p.color;
      p.variants[p.variantIndex].forEach(([dx,dy]) => {
        const x = ox + dx; const y = oy + dy;
        if (x < 0 || y < 0 || x >= this.engine.size || y >= this.engine.size) return;
        ctx.fillRect(this.offsetX + x*this.cell + 2, this.offsetY + y*this.cell + 2, this.cell - 4, this.cell - 4);
      });
      ctx.globalAlpha = 1;
    }
  }
}
