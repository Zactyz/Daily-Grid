import { getPTDateYYYYMMDD, getOrCreateAnonId, formatTime } from '../common/utils.js';
import { createShellController } from '../common/shell-controller.js';
import { formatDateForShare } from '../common/share.js';
import { buildShareCard } from '../common/share-card.js';
import { PolyfitEngine } from './polyfit-engine.js';
import { PolyfitRenderer } from './polyfit-renderer.js';
import { PolyfitInput } from './polyfit-input.js';

const STATE_PREFIX = 'dailygrid_polyfit_state_';
const els = {
  canvas: document.getElementById('polyfit-canvas'),
  progress: document.getElementById('progress-text'),
  gridSize: document.getElementById('grid-size'),
  puzzleDate: document.getElementById('puzzle-date'),
  tray: document.getElementById('piece-tray'),
  rotate: document.getElementById('rotate-piece-btn')
};

let engine, renderer, input, shell;
let currentMode = 'daily';
let puzzleSeed = getPTDateYYYYMMDD();
let puzzleId = puzzleSeed;
let completionMs = null;
let selectedPiece = 0;
let tick;
let lastTs = performance.now();

const stateKey = () => `${STATE_PREFIX}${currentMode}_${puzzleId}`;
const getPuzzleId = () => currentMode === 'practice' ? `practice-${puzzleSeed}` : getPTDateYYYYMMDD();

function setLabels() {
  els.gridSize.textContent = engine.getGridLabel();
  els.puzzleDate.textContent = currentMode === 'practice' ? 'Practice' : puzzleId;
}

function updateProgress() {
  const placed = engine.pieces.filter(p=>p.placed).length;
  els.progress.textContent = `Placed: ${placed}/${engine.pieces.length} • Filled: ${engine.getFillCount()}/${engine.getTargetCount()}`;
}

function renderTray() {
  els.tray.innerHTML = '';
  engine.pieces.forEach((p) => {
    const b = document.createElement('button');
    b.className = `px-3 py-2 rounded-lg border text-sm ${selectedPiece===p.id?'border-amber-300 text-amber-200':'border-white/10 text-white/70'} ${p.placed?'opacity-40':''}`;
    b.textContent = `Piece ${p.id + 1}`;
    b.style.background = `${p.color}22`;
    b.onclick = () => { if (!p.placed) { selectedPiece = p.id; renderer.setSelected(selectedPiece); renderer.render(); renderTray(); } };
    els.tray.appendChild(b);
  });
}

function save() {
  if (currentMode !== 'daily') return;
  const payload = {
    timeMs: engine.timeMs,
    timerStarted: engine.timerStarted,
    isPaused: engine.isPaused,
    isComplete: engine.isComplete,
    completionMs,
    selectedPiece,
    pieces: engine.pieces.map((p) => ({ variantIndex: p.variantIndex, placed: p.placed }))
  };
  localStorage.setItem(stateKey(), JSON.stringify(payload));
}

function load() {
  if (currentMode !== 'daily') return;
  const raw = localStorage.getItem(stateKey());
  if (!raw) return;
  try {
    const s = JSON.parse(raw);
    engine.timeMs = s.timeMs || 0;
    engine.timerStarted = !!s.timerStarted;
    engine.isPaused = s.timerStarted ? true : !!s.isPaused;
    engine.isComplete = !!s.isComplete;
    completionMs = s.completionMs ?? null;
    selectedPiece = s.selectedPiece ?? 0;
    engine.board.fill(null);
    (s.pieces || []).forEach((pState, i) => {
      const p = engine.pieces[i];
      if (!p) return;
      p.variantIndex = pState.variantIndex || 0;
      p.placed = pState.placed || null;
      if (p.placed) {
        p.variants[p.placed.variantIndex].forEach(([dx,dy]) => {
          const x = p.placed.x + dx; const y = p.placed.y + dy;
          engine.board[y*engine.size+x] = p.id;
        });
      }
    });
    engine.syncStatus();
  } catch {}
}

function onInteract() {
  if (!engine.timerStarted) engine.startTimer();
  if (engine.isPaused) engine.resume();
  if (engine.isComplete) completionMs = completionMs ?? engine.timeMs;
  updateProgress(); renderTray(); renderer.render(); save(); shell?.update();
}

function initPuzzle() {
  engine = new PolyfitEngine(puzzleId);
  renderer = new PolyfitRenderer(els.canvas, engine);
  renderer.setSelected(selectedPiece);
  input = new PolyfitInput(els.canvas, engine, renderer, { getSelected: () => selectedPiece, onChange: onInteract, onInteract });
  load();
  setLabels(); updateProgress(); renderTray(); renderer.render(); shell?.update();
}

function switchMode(mode) {
  currentMode = mode;
  puzzleSeed = mode === 'practice' ? `${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}` : getPTDateYYYYMMDD();
  puzzleId = getPuzzleId();
  completionMs = null;
  selectedPiece = 0;
  initPuzzle();
}

function initShell() {
  shell = createShellController({
    gameId: 'polyfit',
    getMode: () => currentMode,
    getPuzzleId: () => puzzleId,
    getGridLabel: () => engine.getGridLabel(),
    getElapsedMs: () => engine.timeMs,
    formatTime,
    autoStartOnProgress: true,
    isComplete: () => engine.isComplete,
    isPaused: () => engine.isPaused,
    isStarted: () => engine.timerStarted,
    hasProgress: () => engine.pieces.some((p) => p.placed),
    pause: () => { engine.pause(); save(); },
    resume: () => { engine.resume(); save(); },
    startGame: () => { engine.startTimer(); save(); },
    resetGame: () => { engine.reset(); completionMs = null; updateProgress(); renderTray(); renderer.render(); save(); },
    startReplay: () => {}, exitReplay: () => {}, onResetUI: () => {},
    onTryAgain: () => { engine.reset(); completionMs = null; updateProgress(); renderTray(); renderer.render(); save(); },
    onNextLevel: () => switchMode('practice'),
    onBackToDaily: () => switchMode('daily'),
    onPracticeInfinite: () => switchMode('practice'),
    onStartPractice: () => switchMode('practice'),
    onStartDaily: () => switchMode('daily'),
    getAnonId: () => getOrCreateAnonId(),
    getCompletionPayload: () => ({ timeMs: Math.max(3000, Math.min(engine.timeMs, 3600000)), hintsUsed: 0 }),
    getShareMeta: () => ({ gameName: 'Polyfit', shareUrl: 'https://dailygrid.app/games/polyfit/', gridLabel: engine.getGridLabel() }),
    getShareFile: () => buildShareCard({
      gameName: 'Polyfit', logoPath: '/games/polyfit/polyfit-logo.svg', accent: '#f59e0b', accentSoft: 'rgba(245,158,11,.12)',
      backgroundStart: '#120f1a', backgroundEnd: '#251225', dateText: formatDateForShare(getPTDateYYYYMMDD()), timeText: formatTime(completionMs ?? engine.timeMs), gridLabel: `Grid ${engine.getGridLabel()}`, footerText: 'dailygrid.app/games/polyfit'
    }),
    getCompletionMs: () => completionMs,
    setCompletionMs: (ms) => { completionMs = ms; },
    isTimerRunning: () => engine.timerStarted && !engine.isPaused && !engine.isComplete,
    disableReplay: true,
    pauseOnHide: true
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initPuzzle();
  initShell();
  els.rotate.onclick = () => { engine.rotateSelected(selectedPiece); renderer.render(); save(); };
  tick = setInterval(() => { const now = performance.now(); engine.updateTime(now - lastTs); lastTs = now; shell?.update(); }, 200);
  window.addEventListener('resize', () => { renderer.resize(); renderer.render(); });
  window.addEventListener('beforeunload', save);
});
