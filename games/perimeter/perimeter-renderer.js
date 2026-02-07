const BACKGROUND_COLOR = '#0c1018';
const GRID_COLOR = 'rgba(125, 162, 255, 0.08)';
const DOT_COLOR = '#e2e8f0';
const LINE_COLOR = '#7da2ff';
const LINE_GLOW = 'rgba(125, 162, 255, 0.35)';
const CROSS_COLOR = 'rgba(148, 163, 184, 0.45)';
const INVALID_COLOR = '#fb7185';
const CLUE_BG = 'rgba(15, 23, 42, 0.75)';
const CLUE_BORDER = 'rgba(148, 163, 184, 0.25)';
const CLUE_OK = 'rgba(125, 162, 255, 0.35)';
const CLUE_OK_TEXT = '#c7d2fe';

export class PerimeterRenderer {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.engine = engine;
    this.ctx = canvas.getContext('2d');
    this.padding = 28;
    this.dpr = window.devicePixelRatio || 1;
    this.cellSize = 0;
    this.dotRadius = 5;
    this.resize();
  }

  setEngine(engine) {
    this.engine = engine;
    this.resize();
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent || !this.engine) return;
    const size = Math.min(parent.clientWidth, parent.clientHeight || parent.clientWidth);
    this.displaySize = size;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.canvas.width = Math.round(size * this.dpr);
    this.canvas.height = Math.round(size * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const gridSpan = this.engine.getGridSize();
    const available = Math.max(1, size - this.padding * 2);
    this.cellSize = available / Math.max(1, gridSpan);
    this.dotRadius = Math.max(4, this.cellSize * 0.12);
  }

  getDotPosition(x, y) {
    const xPos = this.padding + x * this.cellSize;
    const yPos = this.padding + y * this.cellSize;
    return { x: xPos, y: yPos };
  }

  getCellCenter(r, c) {
    const x = this.padding + (c + 0.5) * this.cellSize;
    const y = this.padding + (r + 0.5) * this.cellSize;
    return { x, y };
  }

  getNearestDot(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const localX = (clientX - rect.left - this.padding) / this.cellSize;
    const localY = (clientY - rect.top - this.padding) / this.cellSize;
    const maxX = this.engine.getGridWidth() - 1;
    const maxY = this.engine.getGridHeight() - 1;
    const clampedX = Math.min(Math.max(Math.round(localX), 0), maxX);
    const clampedY = Math.min(Math.max(Math.round(localY), 0), maxY);
    const dx = Math.abs(localX - clampedX);
    const dy = Math.abs(localY - clampedY);
    const threshold = 0.6;
    if (dx > threshold || dy > threshold) return null;
    return [clampedX, clampedY];
  }

  render() {
    const ctx = this.ctx;
    const width = this.displaySize;
    const height = this.displaySize;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, width, height);

    this.drawGridLines(ctx);
    this.drawClues(ctx);
    this.drawEdges(ctx);
    this.drawDots(ctx);
  }

  drawGridLines(ctx) {
    const cols = this.engine.getGridWidth();
    const rows = this.engine.getGridHeight();
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    for (let x = 0; x < cols; x += 1) {
      const { x: xPos } = this.getDotPosition(x, 0);
      const yStart = this.getDotPosition(0, 0).y;
      const yEnd = this.getDotPosition(0, rows - 1).y;
      ctx.beginPath();
      ctx.moveTo(xPos, yStart);
      ctx.lineTo(xPos, yEnd);
      ctx.stroke();
    }
    for (let y = 0; y < rows; y += 1) {
      const { y: yPos } = this.getDotPosition(0, y);
      const xStart = this.getDotPosition(0, 0).x;
      const xEnd = this.getDotPosition(cols - 1, 0).x;
      ctx.beginPath();
      ctx.moveTo(xStart, yPos);
      ctx.lineTo(xEnd, yPos);
      ctx.stroke();
    }
  }

  drawEdges(ctx) {
    const lines = this.engine.getLineEdges();
    const crosses = this.engine.getCrossEdges();

    if (lines.length) {
      ctx.save();
      ctx.strokeStyle = LINE_COLOR;
      ctx.lineWidth = Math.max(5, this.cellSize * 0.22);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = LINE_GLOW;
      ctx.shadowBlur = 18;
      lines.forEach((edgeKey) => {
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

    if (crosses.length) {
      ctx.save();
      ctx.strokeStyle = CROSS_COLOR;
      ctx.lineWidth = 2;
      crosses.forEach((edgeKey) => {
        const [a, b] = edgeKey.split('-').map(part => part.split(',').map(Number));
        const start = this.getDotPosition(a[0], a[1]);
        const end = this.getDotPosition(b[0], b[1]);
        const mx = (start.x + end.x) / 2;
        const my = (start.y + end.y) / 2;
        const size = this.cellSize * 0.18;
        ctx.beginPath();
        ctx.moveTo(mx - size, my - size);
        ctx.lineTo(mx + size, my + size);
        ctx.moveTo(mx + size, my - size);
        ctx.lineTo(mx - size, my + size);
        ctx.stroke();
      });
      ctx.restore();
    }
  }

  drawDots(ctx) {
    const cols = this.engine.getGridWidth();
    const rows = this.engine.getGridHeight();
    const invalidNodes = this.engine.getInvalidNodes();
    for (let x = 0; x < cols; x += 1) {
      for (let y = 0; y < rows; y += 1) {
        const { x: cx, y: cy } = this.getDotPosition(x, y);
        const key = `${x},${y}`;
        ctx.fillStyle = invalidNodes.has(key) ? INVALID_COLOR : DOT_COLOR;
        ctx.beginPath();
        ctx.arc(cx, cy, this.dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawClues(ctx) {
    const clues = this.engine.getClues();
    const clueStates = this.engine.getClueStates();
    const size = this.engine.getGridSize();

    clues.forEach((clue) => {
      if (!clue.isGiven) return;
      const { x, y } = this.getCellCenter(clue.r, clue.c);
      const state = clueStates.get(`${clue.r},${clue.c}`) || { lineCount: 0, over: false, complete: false };
      const radius = Math.max(14, this.cellSize * 0.3);

      let fill = CLUE_BG;
      let stroke = CLUE_BORDER;
      let text = '#e2e8f0';
      if (state.over) {
        fill = 'rgba(251, 113, 133, 0.2)';
        stroke = INVALID_COLOR;
        text = INVALID_COLOR;
      } else if (state.complete) {
        fill = CLUE_OK;
        stroke = LINE_COLOR;
        text = CLUE_OK_TEXT;
      }

      ctx.save();
      ctx.lineWidth = 2;
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = text;
      ctx.font = `700 ${Math.max(12, this.cellSize * 0.3)}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(clue.value.toString(), x, y);
      ctx.restore();
    });
  }
}
