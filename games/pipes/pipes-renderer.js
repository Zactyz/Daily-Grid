import { DIR_MASKS, GRID_SIZE } from './pipes-utils.js';

const BACKGROUND_COLOR = '#020617';
const GRID_COLOR = 'rgba(255,255,255,0.08)';
const VALID_COLOR = '#34d399';
const BROKEN_COLOR = '#fb923c';
const SUPPORT_COLOR = '#0f172a';
const PREFILL_ACCENT = 'rgba(52, 211, 153, 0.16)';
const PADDING = 16;

export class PipesRenderer {
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
    const boardSize = Math.min(width, height) - PADDING * 2;
    this.metrics.boardSize = boardSize;
    this.metrics.cellSize = boardSize / GRID_SIZE;
    this.metrics.offsetX = (width - boardSize) / 2 + PADDING;
    this.metrics.offsetY = (height - boardSize) / 2 + PADDING;
    this.metrics.cssWidth = width;
    this.metrics.cssHeight = height;
  }

  getMetrics() {
    return this.metrics;
  }

  getCellAt(cssX, cssY) {
    const { offsetX, offsetY, cellSize } = this.metrics;
    const relativeX = cssX - offsetX;
    const relativeY = cssY - offsetY;
    if (relativeX < 0 || relativeY < 0) return null;
    const col = Math.floor(relativeX / cellSize);
    const row = Math.floor(relativeY / cellSize);
    if (col < 0 || col >= GRID_SIZE || row < 0 || row >= GRID_SIZE) return null;
    return row * GRID_SIZE + col;
  }

  render() {
    const ctx = this.ctx;
    const { cssWidth, cssHeight } = this.metrics;
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    this._drawGrid(ctx);
    this._drawCells(ctx);
    this._drawEntries(ctx);
  }

  _drawGrid(ctx) {
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    const { boardSize, offsetX, offsetY } = this.metrics;
    const step = boardSize / GRID_SIZE;
    ctx.beginPath();
    for (let i = 0; i <= GRID_SIZE; i += 1) {
      const pos = i * step;
      ctx.moveTo(offsetX + pos, offsetY);
      ctx.lineTo(offsetX + pos, offsetY + boardSize);
      ctx.moveTo(offsetX, offsetY + pos);
      ctx.lineTo(offsetX + boardSize, offsetY + pos);
    }
    ctx.stroke();
  }

  _drawCells(ctx) {
    const { offsetX, offsetY, cellSize } = this.metrics;
    const cells = this.engine.getCells();

    cells.forEach((cell) => {
      const centerX = offsetX + cell.c * cellSize + cellSize / 2;
      const centerY = offsetY + cell.r * cellSize + cellSize / 2;
      const mask = cell.playerMask;
      const color = cell.status === 'broken' ? BROKEN_COLOR : VALID_COLOR;

      if (cell.isPrefill) {
        ctx.fillStyle = PREFILL_ACCENT;
        ctx.beginPath();
        ctx.arc(centerX, centerY, cellSize * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.lineCap = 'round';
      ctx.lineWidth = 5;
      ctx.strokeStyle = color;

      const len = cellSize * 0.35;
      if (mask & DIR_MASKS.N) this._drawLine(ctx, centerX, centerY, centerX, centerY - len);
      if (mask & DIR_MASKS.E) this._drawLine(ctx, centerX, centerY, centerX + len, centerY);
      if (mask & DIR_MASKS.S) this._drawLine(ctx, centerX, centerY, centerX, centerY + len);
      if (mask & DIR_MASKS.W) this._drawLine(ctx, centerX, centerY, centerX - len, centerY);

      ctx.fillStyle = SUPPORT_COLOR;
      ctx.beginPath();
      ctx.arc(centerX, centerY, cellSize * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
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

  _drawEntries(ctx) {
    const descriptor = this.engine.getDescriptor();
    if (!descriptor.entryPoints) return;
    const { offsetX, offsetY, cellSize } = this.metrics;
    const radius = cellSize * 0.08;

    descriptor.entryPoints.forEach((entry) => {
      const cx = offsetX + entry.c * cellSize + cellSize / 2;
      const cy = offsetY + entry.r * cellSize + cellSize / 2;
      const dir = entry.dir;
      let targetX = cx;
      let targetY = cy;
      const len = cellSize * 0.4;

      if (dir === 'N') targetY -= len;
      if (dir === 'S') targetY += len;
      if (dir === 'E') targetX += len;
      if (dir === 'W') targetX -= len;

      ctx.strokeStyle = VALID_COLOR;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(targetX, targetY);
      ctx.stroke();
      ctx.fillStyle = VALID_COLOR;
      ctx.beginPath();
      ctx.arc(targetX, targetY, radius, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}
