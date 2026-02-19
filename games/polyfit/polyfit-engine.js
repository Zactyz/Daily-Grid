import { createSeededRandom, getPTDateYYYYMMDD, hashString } from '../common/utils.js';

const SHAPES = [
  [[0,0],[1,0],[0,1]],
  [[0,0],[1,0],[2,0],[1,1]],
  [[0,0],[0,1],[0,2],[1,2]],
  [[0,0],[1,0],[0,1],[1,1]],
  [[0,0],[1,0],[2,0],[3,0]],
  [[0,0],[1,0],[1,1],[2,1]]
];

const COLORS = ['#fb7185','#f59e0b','#10b981','#60a5fa','#a78bfa','#f472b6','#34d399'];

const norm = (cells) => {
  const minX = Math.min(...cells.map(c=>c[0]));
  const minY = Math.min(...cells.map(c=>c[1]));
  return cells.map(([x,y])=>[x-minX,y-minY]).sort((a,b)=>(a[1]-b[1])||(a[0]-b[0]));
};
const keyOf = (cells) => norm(cells).map(([x,y])=>`${x},${y}`).join('|');

function variants(cells) {
  const out = new Map();
  let cur = cells.map(c=>[...c]);
  for (let i=0;i<4;i++) {
    const ro = cur.map(([x,y])=>[y,-x]);
    cur = ro;
    [cur, cur.map(([x,y])=>[-x,y])].forEach(v=>out.set(keyOf(v), norm(v)));
  }
  return [...out.values()];
}

function canPlace(board, w, h, cells, ox, oy) {
  for (const [x,y] of cells) {
    const bx = ox + x; const by = oy + y;
    if (bx < 0 || by < 0 || bx >= w || by >= h) return false;
    if (board[by*w+bx] !== null) return false;
  }
  return true;
}

export class PolyfitEngine {
  constructor(seedKey) {
    this.seedKey = seedKey;
    this.size = 6;
    this.timeMs = 0;
    this.timerStarted = false;
    this.isPaused = false;
    this.isComplete = false;
    this.hintsUsed = 0;
    this.generate(seedKey);
  }

  static puzzleId(mode, practiceSeed) {
    return mode === 'practice' ? `practice-${practiceSeed}` : getPTDateYYYYMMDD();
  }

  generate(seedKey) {
    const rng = createSeededRandom(hashString(`polyfit:${seedKey}`));
    this.pieces = Array.from({ length: 5 }).map((_, i) => {
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
  }

  reset() {
    this.board.fill(null);
    this.pieces.forEach((p)=>{ p.placed = null; p.variantIndex = 0; });
    this.timeMs = 0;
    this.timerStarted = false;
    this.isPaused = false;
    this.isComplete = false;
  }

  rotateSelected(pieceId) {
    const p = this.pieces[pieceId];
    if (!p || p.placed) return;
    p.variantIndex = (p.variantIndex + 1) % p.variants.length;
  }

  removePiece(pieceId) {
    const p = this.pieces[pieceId];
    if (!p || !p.placed) return;
    for (let i = 0; i < this.board.length; i++) if (this.board[i] === pieceId) this.board[i] = null;
    p.placed = null;
    this.syncStatus();
  }

  tryPlace(pieceId, x, y) {
    const p = this.pieces[pieceId];
    if (!p || p.placed) return false;
    const cells = p.variants[p.variantIndex];
    if (!canPlace(this.board, this.size, this.size, cells, x, y)) return false;
    cells.forEach(([dx,dy]) => { this.board[(y+dy)*this.size + (x+dx)] = pieceId; });
    p.placed = { x, y, variantIndex: p.variantIndex };
    this.syncStatus();
    return true;
  }

  startTimer(){ if(!this.isComplete){ this.timerStarted = true; this.isPaused = false; }}
  pause(){ if(this.timerStarted && !this.isComplete) this.isPaused = true; }
  resume(){ if(this.timerStarted && !this.isComplete) this.isPaused = false; }
  updateTime(delta){ if(this.timerStarted && !this.isPaused && !this.isComplete) this.timeMs += delta; }

  syncStatus() {
    this.isComplete = this.pieces.every((p) => !!p.placed);
    if (this.isComplete) this.isPaused = true;
  }

  getFillCount() { return this.board.filter((v) => v !== null).length; }
  getTargetCount() { return this.pieces.reduce((sum,p)=>sum+p.variants[0].length, 0); }
  getGridLabel() { return `${this.size}x${this.size} box`; }
}
