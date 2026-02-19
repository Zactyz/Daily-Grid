import { DIR_MASKS } from './conduit-utils.js';

const BACKGROUND_COLOR = '#05070a';
const GRID_COLOR = 'rgba(255, 255, 255, 0.08)';
const POWER_COLOR = '#ffe44d';
const POWER_GLOW = 'rgba(255, 228, 77, 0.50)';
const DIM_COLOR = 'rgba(148, 163, 184, 0.6)';
const BROKEN_COLOR = '#fb923c';
const SUPPORT_COLOR = '#0f172a';
const ENTRY_COLOR = '#fff27a';
const EXIT_COLOR_ON = '#ffd11a';
const EXIT_COLOR_OFF = '#9ca3af';
const PADDING = 16;

const DIR_VEC = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 }
};

export class ConduitRenderer {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.engine = engine;
    this.metrics = { offsetX: 0, offsetY: 0, cellSize: 0, boardSize: 0, cssWidth: 0, cssHeight: 0 };
    this.resize();
  }

  setEngine(engine) {
    this.engine = engine;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
    this.canvas.width = rect.width * ratio;
    this.canvas.height = rect.height * ratio;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this._updateMetrics(rect.width, rect.height);
  }

  _updateMetrics(width, height) {
    const gridSize = this.engine?.width || 7;
    const boardSize = Math.min(width, height) - PADDING * 2;
    this.metrics.boardSize = boardSize;
    this.metrics.cellSize = boardSize / gridSize;
    // keep perfectly centered; padding already accounted for in boardSize
    this.metrics.offsetX = (width - boardSize) / 2;
    this.metrics.offsetY = (height - boardSize) / 2;
    this.metrics.cssWidth = width;
    this.metrics.cssHeight = height;
    this.metrics.gridSize = gridSize;
  }

  getMetrics() {
    return this.metrics;
  }

  getCellAt(cssX, cssY) {
    const { offsetX, offsetY, cellSize, gridSize } = this.metrics;
    const relativeX = cssX - offsetX;
    const relativeY = cssY - offsetY;
    if (relativeX < 0 || relativeY < 0) return null;
    const col = Math.floor(relativeX / cellSize);
    const row = Math.floor(relativeY / cellSize);
    if (col < 0 || col >= gridSize || row < 0 || row >= gridSize) return null;
    return row * gridSize + col;
  }

  render() {
    const ctx = this.ctx;
    const { cssWidth, cssHeight } = this.metrics;
    const t = performance.now();

    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    this._drawGrid(ctx);
    this._drawCells(ctx, t);
    this._drawEntries(ctx, t);
  }

  _drawGrid(ctx) {
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    const { boardSize, offsetX, offsetY, gridSize } = this.metrics;
    const step = boardSize / gridSize;
    ctx.beginPath();
    for (let i = 0; i <= gridSize; i += 1) {
      const pos = i * step;
      ctx.moveTo(offsetX + pos, offsetY);
      ctx.lineTo(offsetX + pos, offsetY + boardSize);
      ctx.moveTo(offsetX, offsetY + pos);
      ctx.lineTo(offsetX + boardSize, offsetY + pos);
    }
    ctx.stroke();
  }

  _drawCells(ctx, t) {
    const { offsetX, offsetY, cellSize } = this.metrics;
    const cells = this.engine.getCells();

    cells.forEach((cell) => {
      const centerX = offsetX + cell.c * cellSize + cellSize / 2;
      const centerY = offsetY + cell.r * cellSize + cellSize / 2;
      const mask = cell.playerMask;
      const isBroken = cell.status === 'broken';
      const isPowered = cell.powered;
      const color = isBroken ? BROKEN_COLOR : (isPowered ? POWER_COLOR : DIM_COLOR);
      const len = cellSize * 0.35;

      if (isPowered) {
        ctx.fillStyle = POWER_GLOW;
        ctx.beginPath();
        ctx.arc(centerX, centerY, cellSize * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }

      const segments = [];
      if (mask & DIR_MASKS.N) segments.push([centerX, centerY, centerX, centerY - len]);
      if (mask & DIR_MASKS.E) segments.push([centerX, centerY, centerX + len, centerY]);
      if (mask & DIR_MASKS.S) segments.push([centerX, centerY, centerX, centerY + len]);
      if (mask & DIR_MASKS.W) segments.push([centerX, centerY, centerX - len, centerY]);

      for (const [x1, y1, x2, y2] of segments) {
        if (isPowered) {
          // outer bloom
          ctx.strokeStyle = 'rgba(255, 228, 77, 0.30)';
          ctx.lineCap = 'round';
          ctx.lineWidth = 9;
          this._drawLine(ctx, x1, y1, x2, y2);

          // hot electric body
          const g = ctx.createLinearGradient(x1, y1, x2, y2);
          g.addColorStop(0, '#ffd31a');
          g.addColorStop(0.55, '#fff19a');
          g.addColorStop(1, '#ffd31a');
          ctx.strokeStyle = g;
          ctx.lineWidth = 4;
          this._drawLine(ctx, x1, y1, x2, y2);

          // moving current streak
          ctx.save();
          ctx.strokeStyle = '#fffde7';
          ctx.lineWidth = 1.35;
          ctx.setLineDash([4, 7]);
          ctx.lineDashOffset = -(t * 0.03);
          this._drawLine(ctx, x1, y1, x2, y2);
          ctx.restore();
        } else {
          ctx.strokeStyle = color;
          ctx.lineCap = 'round';
          ctx.lineWidth = isBroken ? 3 : 2.6;
          this._drawLine(ctx, x1, y1, x2, y2);
        }
      }

      ctx.fillStyle = SUPPORT_COLOR;
      ctx.beginPath();
      ctx.arc(centerX, centerY, cellSize * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isPowered ? POWER_COLOR : '#94a3b8';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  _drawLine(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  _drawArrow(ctx, x, y, dir, color, size = 10) {
    const v = DIR_VEC[dir] || DIR_VEC.N;
    const perpX = -v.y;
    const perpY = v.x;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + v.x * size, y + v.y * size);
    ctx.lineTo(x - v.x * size * 0.7 + perpX * size * 0.62, y - v.y * size * 0.7 + perpY * size * 0.62);
    ctx.lineTo(x - v.x * size * 0.7 - perpX * size * 0.62, y - v.y * size * 0.7 - perpY * size * 0.62);
    ctx.closePath();
    ctx.fill();
  }

  _drawBoltIcon(ctx, x, y, color, size = 8) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x - size * 0.35, y - size * 0.7);
    ctx.lineTo(x + size * 0.05, y - size * 0.2);
    ctx.lineTo(x - size * 0.02, y - size * 0.2);
    ctx.lineTo(x + size * 0.35, y + size * 0.7);
    ctx.lineTo(x - size * 0.05, y + size * 0.15);
    ctx.lineTo(x + size * 0.02, y + size * 0.15);
    ctx.stroke();
    ctx.restore();
  }

  _drawEntries(ctx, t) {
    const descriptor = this.engine.getDescriptor();
    if (!descriptor.entryPoints) return;
    const { offsetX, offsetY, cellSize } = this.metrics;
    const pulse = 0.78 + Math.sin(t * 0.006) * 0.22;

    descriptor.entryPoints.forEach((entry) => {
      const v = DIR_VEC[entry.dir] || DIR_VEC.N;
      const cx = offsetX + entry.c * cellSize + cellSize / 2;
      const cy = offsetY + entry.r * cellSize + cellSize / 2;

      const edgeX = cx + v.x * (cellSize * 0.38);
      const edgeY = cy + v.y * (cellSize * 0.38);
      const outerX = cx + v.x * (cellSize * 0.68);
      const outerY = cy + v.y * (cellSize * 0.68);

      const isExit = entry.role === 'exit';
      const exitPowered = isExit ? this.engine?.isExitPowered?.(entry) : false;
      const color = isExit
        ? (exitPowered ? EXIT_COLOR_ON : EXIT_COLOR_OFF)
        : ENTRY_COLOR;

      // conduit lead to the border
      ctx.strokeStyle = color;
      ctx.lineWidth = 4.8;
      this._drawLine(ctx, edgeX, edgeY, outerX, outerY);

      // glow bubble outside board edge
      ctx.save();
      ctx.globalAlpha = pulse;
      if (isExit) {
        ctx.fillStyle = exitPowered ? 'rgba(255, 209, 26, 0.34)' : 'rgba(239, 68, 68, 0.42)';
      } else {
        ctx.fillStyle = 'rgba(255, 242, 122, 0.34)';
      }
      ctx.beginPath();
      ctx.arc(outerX, outerY, cellSize * 0.27, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // direction arrows OUTSIDE the cell
      const arrowDir = isExit ? entry.dir : ({ N: 'S', S: 'N', E: 'W', W: 'E' }[entry.dir]);
      this._drawArrow(ctx, outerX, outerY, arrowDir, color, Math.max(9, cellSize * 0.16));

      // bolt icon only on source/in arrow
      if (!isExit) {
        this._drawBoltIcon(ctx, outerX, outerY - cellSize * 0.24, '#fff8cc', Math.max(7, cellSize * 0.12));
      }
    });
  }
}
