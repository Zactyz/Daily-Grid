import { createSeededRandom, getPTDateYYYYMMDD, hashString } from '../common/utils.js';

const SHAPES = [
  [[0, 0], [1, 0], [0, 1]],
  [[0, 0], [1, 0], [2, 0], [1, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 2]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [1, 0], [1, 1], [2, 1]],
  [[0, 0], [1, 0], [2, 0], [0, 1]],
  [[0, 0], [1, 0], [1, 1], [1, 2]]
];

const COLORS = ['#fb7185', '#f59e0b', '#10b981', '#60a5fa', '#a78bfa', '#f472b6', '#34d399'];

const norm = (cells) => {
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - minX, y - minY]).sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
};

const keyOf = (cells) => norm(cells).map(([x, y]) => `${x},${y}`).join('|');

function variants(cells) {
  const out = new Map();
  let cur = cells.map((c) => [...c]);
  for (let i = 0; i < 4; i += 1) {
    [cur, cur.map(([x, y]) => [-x, y])].forEach((v) => out.set(keyOf(v), norm(v)));
    cur = cur.map(([x, y]) => [y, -x]);
  }
  return [...out.values()];
}

function canPlace(board, size, targetMask, cells, ox, oy) {
  for (const [x, y] of cells) {
    const bx = ox + x;
    const by = oy + y;
    if (bx < 0 || by < 0 || bx >= size || by >= size) return false;
    const idx = by * size + bx;
    if (!targetMask[idx]) return false;
    if (board[idx] !== null) return false;
  }
  return true;
}

function buildTargetMask(size, cellCount, rng) {
  const mask = new Array(size * size).fill(false);
  const startX = 1 + Math.floor(rng() * (size - 2));
  const startY = 1 + Math.floor(rng() * (size - 2));
  const frontier = [[startX, startY]];
  mask[startY * size + startX] = true;
  let filled = 1;

  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (filled < cellCount && frontier.length) {
    const base = frontier[Math.floor(rng() * frontier.length)];
    const shuffled = dirs.slice().sort(() => rng() - 0.5);
    let added = false;
    for (const [dx, dy] of shuffled) {
      const x = base[0] + dx;
      const y = base[1] + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const idx = y * size + x;
      if (mask[idx]) continue;
      mask[idx] = true;
      frontier.push([x, y]);
      filled += 1;
      added = true;
      break;
    }
    if (!added) frontier.splice(frontier.indexOf(base), 1);
  }

  return mask;
}

export class PolyfitEngine {
  constructor(seedKey) {
    this.seedKey = seedKey;
    this.size = 6;
    this.pieceCount = 6;
    this.timeMs = 0;
    this.timerStarted = false;
    this.isPaused = false;
    this.isComplete = false;
    this.hintsUsed = 0;
    this.solutionShown = false;
    this.generate(seedKey);
  }

  static puzzleId(mode, practiceSeed) {
    return mode === 'practice' ? `practice-${practiceSeed}` : getPTDateYYYYMMDD();
  }

  generate(seedKey) {
    const difficultyHash = hashString(`polyfit:difficulty:${seedKey}`);
    this.pieceCount = 4 + (difficultyHash % 4); // 4..7 inclusive

    const rng = createSeededRandom(hashString(`polyfit:${seedKey}`));
    this.pieces = Array.from({ length: this.pieceCount }).map((_, i) => {
      const base = SHAPES[Math.floor(rng() * SHAPES.length)];
      const opts = variants(base);
      return {
        id: i,
        color: COLORS[i % COLORS.length],
        variants: opts,
        variantIndex: 0,
        placed: null
      };
    });

    this.board = new Array(this.size * this.size).fill(null);
    this.targetCount = this.pieces.reduce((sum, p) => sum + p.variants[0].length, 0);
    this.targetMask = buildTargetMask(this.size, this.targetCount, rng);
  }

  reset({ resetTimer = true } = {}) {
    this.board.fill(null);
    this.pieces.forEach((p) => {
      p.placed = null;
      p.variantIndex = 0;
    });
    if (resetTimer) {
      this.timeMs = 0;
      this.timerStarted = false;
    }
    this.isPaused = false;
    this.isComplete = false;
    this.solutionShown = false;
  }

  rotateSelected(pieceId) {
    const p = this.pieces[pieceId];
    if (!p || p.placed) return;
    p.variantIndex = (p.variantIndex + 1) % p.variants.length;
  }

  removePiece(pieceId) {
    const p = this.pieces[pieceId];
    if (!p || !p.placed) return;
    for (let i = 0; i < this.board.length; i += 1) if (this.board[i] === pieceId) this.board[i] = null;
    p.placed = null;
    this.syncStatus();
  }

  canPlaceAt(pieceId, x, y) {
    const p = this.pieces[pieceId];
    if (!p || p.placed) return false;
    return canPlace(this.board, this.size, this.targetMask, p.variants[p.variantIndex], x, y);
  }

  tryPlace(pieceId, x, y) {
    const p = this.pieces[pieceId];
    if (!p || p.placed) return false;
    const cells = p.variants[p.variantIndex];
    if (!canPlace(this.board, this.size, this.targetMask, cells, x, y)) return false;
    cells.forEach(([dx, dy]) => {
      this.board[(y + dy) * this.size + (x + dx)] = pieceId;
    });
    p.placed = { x, y, variantIndex: p.variantIndex };
    this.syncStatus();
    return true;
  }

  revealSolution() {
    this.board.fill(null);
    this.pieces.forEach((p) => {
      p.placed = null;
      p.variantIndex = 0;
    });

    const openCells = [];
    this.targetMask.forEach((filled, idx) => {
      if (filled) openCells.push([idx % this.size, Math.floor(idx / this.size)]);
    });

    for (const p of this.pieces) {
      let placed = false;
      for (const [ox, oy] of openCells) {
        for (let v = 0; v < p.variants.length; v += 1) {
          p.variantIndex = v;
          const cells = p.variants[v];
          if (!canPlace(this.board, this.size, this.targetMask, cells, ox, oy)) continue;
          cells.forEach(([dx, dy]) => {
            this.board[(oy + dy) * this.size + (ox + dx)] = p.id;
          });
          p.placed = { x: ox, y: oy, variantIndex: v };
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (!placed) {
        this.reset({ resetTimer: false });
        this.solutionShown = true;
        return false;
      }
    }

    this.solutionShown = true;
    this.isComplete = false;
    this.isPaused = true;
    return true;
  }

  startTimer() { if (!this.isComplete) { this.timerStarted = true; this.isPaused = false; } }
  pause() { if (this.timerStarted && !this.isComplete) this.isPaused = true; }
  resume() { if (this.timerStarted && !this.isComplete) this.isPaused = false; }
  updateTime(delta) { if (this.timerStarted && !this.isPaused && !this.isComplete) this.timeMs += delta; }

  syncStatus() {
    const allPlaced = this.pieces.every((p) => !!p.placed);
    const filledTarget = this.targetMask.every((isTarget, idx) => (isTarget ? this.board[idx] !== null : true));
    this.isComplete = allPlaced && filledTarget;
    if (this.isComplete) this.isPaused = true;
    if (this.isComplete) this.solutionShown = false;
  }

  getFillCount() { return this.board.filter((v) => v !== null).length; }
  getTargetCount() { return this.targetCount; }
  getGridLabel() { return `${this.size}x${this.size} • ${this.pieceCount} pieces`; }
}
