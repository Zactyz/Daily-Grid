import { DIR_MASKS } from './conduit-utils.js';

const BACKGROUND_COLOR = '#05070a';
const GRID_COLOR = 'rgba(255, 255, 255, 0.08)';
const POWER_COLOR = '#ffe44d';
const POWER_GLOW = 'rgba(255, 228, 77, 0.45)';
const DIM_COLOR = 'rgba(148, 163, 184, 0.6)';
const BROKEN_COLOR = '#fb923c';
const SUPPORT_COLOR = '#111827';
const ENTRY_COLOR = '#ffe44d';
const EXIT_COLOR = '#facc15';
const PADDING = 16;

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
    this.metrics.offsetX = (width - boardSize) / 2 + PADDING;
    this.metrics.offsetY = (height - boardSize) / 2 + PADDING;
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
      const coreWidth = isPowered ? 3.2 : 2.6;
      const len = cellSize * 0.35;

      if (isPowered) {
        ctx.fillStyle = POWER_GLOW;
        ctx.beginPath();
        ctx.arc(centerX, centerY, cellSize * 0.38, 0, Math.PI * 2);
        ctx.fill();
      }

      const segments = [];
      if (mask & DIR_MASKS.N) segments.push([centerX, centerY, centerX, centerY - len]);
      if (mask & DIR_MASKS.E) segments.push([centerX, centerY, centerX + len, centerY]);
      if (mask & DIR_MASKS.S) segments.push([centerX, centerY, centerX, centerY + len]);
      if (mask & DIR_MASKS.W) segments.push([centerX, centerY, centerX - len, centerY]);

      for (const [x1, y1, x2, y2] of segments) {
        if (isPowered) {
          ctx.strokeStyle = 'rgba(255, 228, 77, 0.24)';
          ctx.lineCap = 'round';
          ctx.lineWidth = 8;
          this._drawLine(ctx, x1, y1, x2, y2);

          ctx.strokeStyle = 'rgba(255, 245, 170, 0.95)';
          ctx.lineWidth = coreWidth;
          this._drawLine(ctx, x1, y1, x2, y2);

          ctx.save();
          ctx.strokeStyle = '#fff7c2';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 8]);
          ctx.lineDashOffset = -(t * 0.02);
          this._drawLine(ctx, x1, y1, x2, y2);
          ctx.restore();
        } else {
          ctx.strokeStyle = color;
          ctx.lineCap = 'round';
          ctx.lineWidth = isBroken ? 3 : coreWidth;
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

  _drawEntries(ctx, t) {
    const descriptor = this.engine.getDescriptor();
    if (!descriptor.entryPoints) return;
    const { offsetX, offsetY, cellSize } = this.metrics;
    const radius = cellSize * 0.09;
    const pulse = 0.8 + Math.sin(t * 0.005) * 0.2;

    descriptor.entryPoints.forEach((entry) => {
      const cx = offsetX + entry.c * cellSize + cellSize / 2;
      const cy = offsetY + entry.r * cellSize + cellSize / 2;
      const isExit = entry.role === 'exit';
      const color = isExit ? EXIT_COLOR : ENTRY_COLOR;
      let targetX = cx;
      let targetY = cy;
      const len = cellSize * 0.4;

      if (entry.dir === 'N') targetY -= len;
      if (entry.dir === 'S') targetY += len;
      if (entry.dir === 'E') targetX += len;
      if (entry.dir === 'W') targetX -= len;

      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      this._drawLine(ctx, cx, cy, targetX, targetY);

      ctx.fillStyle = color;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      if (isExit) {
        ctx.moveTo(targetX, targetY - radius);
        ctx.lineTo(targetX + radius, targetY);
        ctx.lineTo(targetX, targetY + radius);
        ctx.lineTo(targetX - radius, targetY);
        ctx.closePath();
      } else {
        ctx.arc(targetX, targetY, radius, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }
}
