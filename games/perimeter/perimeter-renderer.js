export class PerimeterRenderer {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.engine = engine;
    this.ctx = canvas.getContext('2d');
    this.padding = 32;
    this.dpr = window.devicePixelRatio || 1;
    this.cellSize = 0;
    this.dotRadius = 6;
    this.resize();
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const size = Math.min(parent.clientWidth, parent.clientHeight || parent.clientWidth);
    this.displaySize = size;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.canvas.width = Math.round(size * this.dpr);
    this.canvas.height = Math.round(size * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const gridSpan = Math.max(this.engine.getGridWidth() - 1, this.engine.getGridHeight() - 1);
    const available = Math.max(1, size - this.padding * 2);
    this.cellSize = available / Math.max(1, gridSpan);
  }

  getDotPosition(x, y) {
    const xPos = this.padding + x * this.cellSize;
    const yPos = this.padding + y * this.cellSize;
    return { x: xPos, y: yPos };
  }

  getNearestDot(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const localX = (clientX - rect.left - this.padding) / this.cellSize;
    const localY = (clientY - rect.top - this.padding) / this.cellSize;
    const maxX = this.engine.getGridWidth() - 1;
    const maxY = this.engine.getGridHeight() - 1;
    const clampedX = Math.min(Math.max(Math.round(localX), 0), maxX);
    const clampedY = Math.min(Math.max(Math.round(localY), 0), maxY);
    const centerX = clampedX;
    const centerY = clampedY;
    const dx = Math.abs(localX - centerX);
    const dy = Math.abs(localY - centerY);
    const threshold = 0.6;
    if (dx > threshold || dy > threshold) return null;
    return [clampedX, clampedY];
  }

  render() {
    const ctx = this.ctx;
    const width = this.displaySize;
    const height = this.displaySize;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#F9F5EE';
    ctx.fillRect(0, 0, width, height);

    this.drawGridLines(ctx);
    this.drawPath(ctx);
    this.drawDots(ctx);
    this.drawGuards(ctx);
  }

  drawGridLines(ctx) {
    const cols = this.engine.getGridWidth();
    const rows = this.engine.getGridHeight();
    ctx.strokeStyle = 'rgba(31,50,82,0.15)';
    ctx.lineWidth = 1;
    for (let x = 0; x < cols; x++) {
      const { x: xPos } = this.getDotPosition(x, 0);
      const yStart = this.getDotPosition(0, 0).y;
      const yEnd = this.getDotPosition(0, rows - 1).y;
      ctx.beginPath();
      ctx.moveTo(xPos, yStart);
      ctx.lineTo(xPos, yEnd);
      ctx.stroke();
    }
    for (let y = 0; y < rows; y++) {
      const { y: yPos } = this.getDotPosition(0, y);
      const xStart = this.getDotPosition(0, 0).x;
      const xEnd = this.getDotPosition(cols - 1, 0).x;
      ctx.beginPath();
      ctx.moveTo(xStart, yPos);
      ctx.lineTo(xEnd, yPos);
      ctx.stroke();
    }
  }

  drawPath(ctx) {
    const edges = this.engine.getPlayerEdges();
    if (!edges.length) return;
    ctx.save();
    ctx.strokeStyle = '#1F3252';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(90,162,216,0.35)';
    ctx.shadowBlur = 14;

    edges.forEach(edgeKey => {
      const [a, b] = edgeKey.split('-').map(part => part.split(',').map(Number));
      const start = this.getDotPosition(a[0], a[1]);
      const end = this.getDotPosition(b[0], b[1]);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    });

    ctx.restore();
  }

  drawDots(ctx) {
    ctx.fillStyle = '#1F3252';
    ctx.save();
    const cols = this.engine.getGridWidth();
    const rows = this.engine.getGridHeight();
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        const { x: cx, y: cy } = this.getDotPosition(x, y);
        ctx.beginPath();
        ctx.arc(cx, cy, this.dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawGuards(ctx) {
    const guards = this.engine.getGuards();
    guards.forEach(guard => {
      const { x, y, type, number } = guard;
      const pos = this.getDotPosition(x, y);
      const radius = 16;
      const satisfied = this.engine.isGuardSatisfied(guard);

      ctx.save();
      ctx.lineWidth = 2;
      ctx.shadowColor = satisfied ? 'rgba(90,162,216,0.35)' : 'transparent';
      ctx.shadowBlur = satisfied ? 16 : 0;

      if (type === 'white') {
        ctx.fillStyle = satisfied ? '#E3F2FF' : '#F9F5EE';
        ctx.strokeStyle = satisfied ? '#5AA2D8' : '#1F3252';
      } else {
        ctx.fillStyle = satisfied ? '#5AA2D8' : '#1F3252';
        ctx.strokeStyle = '#ffffff';
      }

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = type === 'black' ? '#F9F5EE' : '#3A3C4D';
      ctx.font = 'bold 14px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(number.toString(), pos.x, pos.y);
      ctx.restore();
    });
  }
}
