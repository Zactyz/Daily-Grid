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

function placementsForPiece(board, size, targetMask, piece) {
  const options = [];
  for (let v = 0; v < piece.variants.length; v += 1) {
    const cells = piece.variants[v];
    const maxX = Math.max(...cells.map(([x]) => x));
    const maxY = Math.max(...cells.map(([, y]) => y));
    for (let y = 0; y <= size - maxY - 1; y += 1) {
      for (let x = 0; x <= size - maxX - 1; x += 1) {
        if (canPlace(board, size, targetMask, cells, x, y)) options.push({ x, y, variantIndex: v, cells });
      }
    }
  }
  return options;
}

// Backtracking solver used for both generation and revealSolution.
// shuffleFn is optional; pass it during generation for randomness.
function solveBoard(board, size, targetMask, pieces, remaining, shuffleFn) {
  if (!remaining.length) return true;

  let bestIdx = -1;
  let bestOpts = null;
  for (let i = 0; i < remaining.length; i += 1) {
    const opts = placementsForPiece(board, size, targetMask, pieces[remaining[i]]);
    if (!opts.length) return false;
    if (!bestOpts || opts.length < bestOpts.length) { bestOpts = opts; bestIdx = i; }
  }

  if (shuffleFn) shuffleFn(bestOpts);

  const id = remaining.splice(bestIdx, 1)[0];
  const piece = pieces[id];

  for (const opt of bestOpts) {
    opt.cells.forEach(([dx, dy]) => { board[(opt.y + dy) * size + (opt.x + dx)] = id; });
    piece.variantIndex = opt.variantIndex;
    piece.placed = { x: opt.x, y: opt.y, variantIndex: opt.variantIndex };

    if (solveBoard(board, size, targetMask, pieces, remaining, shuffleFn)) return true;

    opt.cells.forEach(([dx, dy]) => { board[(opt.y + dy) * size + (opt.x + dx)] = null; });
    piece.placed = null;
  }

  remaining.splice(bestIdx, 0, id);
  return false;
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
    this._solution = null;
    this.generate(seedKey);
  }

  static puzzleId(mode, practiceSeed) {
    return mode === 'practice' ? `practice-${practiceSeed}` : getPTDateYYYYMMDD();
  }

  generate(seedKey) {
    const difficultyHash = hashString(`polyfit:difficulty:${seedKey}`);
    this.pieceCount = 4 + (difficultyHash % 4);
    this._solution = null;

    // Solution-first generation: place pieces on a blank board, derive targetMask from result.
    // Retry with different random sequences until placement succeeds (always fast in practice).
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const rng = createSeededRandom(hashString(`polyfit:${seedKey}:gen${attempt}`));

      const shuffle = (arr) => {
        for (let i = arr.length - 1; i > 0; i -= 1) {
          const j = Math.floor(rng() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
      };

      const pieces = Array.from({ length: this.pieceCount }, (_, i) => ({
        id: i,
        color: COLORS[i % COLORS.length],
        variants: variants(SHAPES[Math.floor(rng() * SHAPES.length)]),
        variantIndex: 0,
        placed: null
      }));

      const board = new Array(this.size * this.size).fill(null);
      const allOpen = new Array(this.size * this.size).fill(true);
      const remaining = pieces.map((p) => p.id);

      if (solveBoard(board, this.size, allOpen, pieces, remaining, shuffle)) {
        this.pieces = pieces;
        this.targetMask = board.map((v) => v !== null);
        this.targetCount = this.targetMask.filter(Boolean).length;
        // Cache solution so revealSolution is instant and always correct
        this._solution = {
          board: [...board],
          placements: pieces.map((p) => (p.placed ? { ...p.placed } : null))
        };
        // Reset all pieces to unplaced for the player
        pieces.forEach((p) => { p.placed = null; p.variantIndex = 0; });
        this.board = new Array(this.size * this.size).fill(null);
        return;
      }
    }

    // Emergency fallback — statistically unreachable with 40 attempts.
    // Falls back to the original random-generation approach without solvability guarantee.
    const rng = createSeededRandom(hashString(`polyfit:${seedKey}:fallback`));
    this.pieces = Array.from({ length: this.pieceCount }, (_, i) => ({
      id: i,
      color: COLORS[i % COLORS.length],
      variants: variants(SHAPES[Math.floor(rng() * SHAPES.length)]),
      variantIndex: 0,
      placed: null
    }));
    this.board = new Array(this.size * this.size).fill(null);
    this.targetCount = this.pieces.reduce((s, p) => s + p.variants[0].length, 0);
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
    // _solution is intentionally preserved across resets
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

    // Fast path: use the cached solution from generation (same session)
    if (this._solution) {
      this._solution.board.forEach((v, i) => { this.board[i] = v; });
      this._solution.placements.forEach((sol, i) => {
        if (sol) {
          this.pieces[i].placed = { ...sol };
          this.pieces[i].variantIndex = sol.variantIndex;
        }
      });
      this.solutionShown = true;
      this.isComplete = false;
      this.isPaused = true;
      return true;
    }

    // Re-solve after page reload (solution-first guarantees this always succeeds)
    const remaining = this.pieces.map((p) => p.id);
    const solved = solveBoard(this.board, this.size, this.targetMask, this.pieces, remaining, null);
    if (!solved) {
      this.reset({ resetTimer: false });
      this.solutionShown = true;
      return false;
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
