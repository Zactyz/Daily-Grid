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
  rotate: document.getElementById('rotate-piece-btn'),
  showSolutionBtn: document.getElementById('show-solution-btn'),
  solutionActions: document.getElementById('solution-actions'),
  solutionRetryBtn: document.getElementById('solution-retry-btn'),
  solutionNextBtn: document.getElementById('solution-next-btn')
};

let engine; let renderer; let input; let shell;
let currentMode = 'daily';
let puzzleSeed = getPTDateYYYYMMDD();
let puzzleId = puzzleSeed;
let completionMs = null;
let selectedPiece = 0;
let tick;
let lastTs = performance.now();

const stateKey = () => `${STATE_PREFIX}${currentMode}_${puzzleId}`;
const getPuzzleId = () => (currentMode === 'practice' ? `practice-${puzzleSeed}` : getPTDateYYYYMMDD());

function setLabels() {
  els.gridSize.textContent = engine.getGridLabel();
  els.puzzleDate.textContent = currentMode === 'practice' ? 'Practice' : puzzleId;
}

function updateProgress() {
  const placed = engine.pieces.filter((p) => p.placed).length;
  const remaining = engine.pieces.length - placed;
  const filled = engine.getFillCount();
  const target = engine.getTargetCount();
  els.progress.textContent = `Goal: fill the amber footprint • Placed ${placed}/${engine.pieces.length} • Remaining ${remaining} • Cells ${filled}/${target}`;
}

function pieceShapeHTML(piece, { empty = false } = {}) {
  const cells = piece.variants[piece.variantIndex];
  const maxX = Math.max(...cells.map((c) => c[0]));
  const maxY = Math.max(...cells.map((c) => c[1]));
  const cols = maxX + 1;
  const rows = maxY + 1;
  const dots = new Set(cells.map(([x, y]) => `${x},${y}`));
  const blocks = [];

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const on = dots.has(`${x},${y}`);
      blocks.push(`<span class="shape-dot ${on ? (empty ? 'hole' : 'on') : ''}" style="--piece:${piece.color}"></span>`);
    }
  }

  return `<span class="shape-grid shape-grid-piece" style="grid-template-columns:repeat(${cols},var(--piece-cell-size,16px))">${blocks.join('')}</span>`;
}

function renderTray() {
  const draggingId = input?.getDragPieceId?.() ?? null;
  els.tray.innerHTML = '';
  els.tray.className = 'w-full mb-4 grid grid-cols-3 sm:grid-cols-6 gap-1.5 items-end';

  engine.pieces.forEach((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tray-piece-real w-full min-h-[74px] rounded-md border-0 bg-transparent p-1.5 flex flex-col justify-center items-center';
    b.style.touchAction = 'none';
    b.dataset.pieceId = String(p.id);

    const liftedFromBank = draggingId === p.id && !p.placed;
    const showHole = p.placed || liftedFromBank;

    b.innerHTML = `<div class="tray-body-real ${showHole ? 'tray-hole' : ''}">${pieceShapeHTML(p, { empty: showHole })}</div>`;

    if (!showHole) {
      b.addEventListener('pointerdown', (event) => {
        selectedPiece = p.id;
        renderer.setSelected(selectedPiece);
        input.startTrayDrag(p.id, event.clientX, event.clientY, b.getBoundingClientRect());
        renderTray();
        renderer.render();
      });
    }


    els.tray.appendChild(b);
  });
}

function updateSolutionUI() {
  const showPractice = currentMode === 'practice' && !engine.isComplete;
  if (!showPractice) {
    els.showSolutionBtn?.classList.add('hidden');
    els.solutionActions?.classList.add('hidden');
    return;
  }

  if (engine.solutionShown) {
    els.showSolutionBtn?.classList.add('hidden');
    els.solutionActions?.classList.remove('hidden');
  } else {
    els.showSolutionBtn?.classList.remove('hidden');
    els.solutionActions?.classList.add('hidden');
  }
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
    solutionShown: engine.solutionShown,
    pieces: engine.pieces.map((p) => ({ variantIndex: p.variantIndex, placed: p.placed })),
    board: engine.board
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
    engine.solutionShown = !!s.solutionShown;

    if (Array.isArray(s.board) && s.board.length === engine.board.length) {
      engine.board = s.board;
      (s.pieces || []).forEach((pState, i) => {
        const p = engine.pieces[i];
        if (!p) return;
        p.variantIndex = pState.variantIndex || 0;
        p.placed = pState.placed || null;
      });
      engine.syncStatus();
    }
  } catch {
    // ignore bad local state
  }
}

function onInteract() {
  if (!engine.timerStarted) engine.startTimer();
  if (engine.isPaused && !engine.isComplete && !engine.solutionShown) engine.resume();
  if (engine.isComplete) completionMs = completionMs ?? engine.timeMs;
  updateProgress();
  updateSolutionUI();
  renderTray();
  renderer.render();
  save();
  shell?.update();
}

function initPuzzle() {
  engine = new PolyfitEngine(puzzleId);
  renderer = new PolyfitRenderer(els.canvas, engine);
  renderer.setSelected(selectedPiece);
  input = new PolyfitInput(els.canvas, engine, renderer, {
    getSelected: () => selectedPiece,
    onSelectPiece: (pieceId) => {
      selectedPiece = pieceId;
      renderer.setSelected(selectedPiece);
      renderTray();
    },
    onStateChange: () => renderTray(),
    onChange: onInteract,
    onInteract
  });
  load();
  setLabels();
  updateProgress();
  updateSolutionUI();
  renderTray();
  renderer.render();
  shell?.update();
}

function switchMode(mode) {
  currentMode = mode;
  puzzleSeed = mode === 'practice' ? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}` : getPTDateYYYYMMDD();
  puzzleId = getPuzzleId();
  completionMs = null;
  selectedPiece = 0;
  initPuzzle();
}

function resetGame({ resetTimer = true } = {}) {
  engine.reset({ resetTimer });
  completionMs = null;
  updateProgress();
  updateSolutionUI();
  renderTray();
  renderer.render();
  save();
}

function showSolution() {
  if (currentMode !== 'practice' || engine.solutionShown) return;
  engine.revealSolution();
  updateProgress();
  updateSolutionUI();
  renderTray();
  renderer.render();
  shell?.update();
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
    isSolutionShown: () => engine.solutionShown,
    shouldShowCompletionModal: () => !engine.solutionShown,
    pause: () => { engine.pause(); save(); },
    resume: () => { engine.resume(); save(); },
    startGame: () => { engine.startTimer(); save(); },
    resetGame: () => resetGame({ resetTimer: true }),
    startReplay: () => {},
    exitReplay: () => {},
    onResetUI: () => {},
    onTryAgain: () => resetGame({ resetTimer: true }),
    onNextLevel: () => switchMode('practice'),
    onBackToDaily: () => switchMode('daily'),
    onPracticeInfinite: () => switchMode('practice'),
    onStartPractice: () => switchMode('practice'),
    onStartDaily: () => switchMode('daily'),
    getAnonId: () => getOrCreateAnonId(),
    getCompletionPayload: () => ({ timeMs: Math.max(3000, Math.min(engine.timeMs, 3600000)), hintsUsed: 0 }),
    getShareMeta: () => ({ gameName: 'Polyfit', shareUrl: 'https://dailygrid.app/games/polyfit/', gridLabel: engine.getGridLabel(), accent: '#f59e0b' }),
    getShareFile: () => buildShareCard({
      gameName: 'Polyfit',
      logoPath: '/games/polyfit/polyfit-logo.svg',
      accent: '#f59e0b',
      accentSoft: 'rgba(245,158,11,.12)',
      backgroundStart: '#120f1a',
      backgroundEnd: '#251225',
      dateText: formatDateForShare(getPTDateYYYYMMDD()),
      timeText: formatTime(completionMs ?? engine.timeMs),
      gridLabel: engine.getGridLabel(),
      footerText: 'dailygrid.app/games/polyfit'
    }),
    getCompletionMs: () => completionMs,
    setCompletionMs: (ms) => { completionMs = ms; },
    isTimerRunning: () => engine.timerStarted && !engine.isPaused && !engine.isComplete,
    disableReplay: false,
    pauseOnHide: true
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initPuzzle();
  initShell();

  els.rotate?.classList.remove('hidden');
  els.rotate?.addEventListener('click', () => {
    if (engine.isComplete) return;
    input.rotatePiece(selectedPiece);
    renderTray();
    renderer.render();
    save();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'r' && !engine.isComplete) {
      input.rotatePiece(selectedPiece);
      renderTray();
      renderer.render();
      save();
    }
  });

  els.showSolutionBtn?.addEventListener('click', showSolution);
  els.solutionRetryBtn?.addEventListener('click', () => resetGame({ resetTimer: true }));
  els.solutionNextBtn?.addEventListener('click', () => switchMode('practice'));

  tick = setInterval(() => {
    const now = performance.now();
    engine.updateTime(now - lastTs);
    lastTs = now;
    shell?.update();
  }, 200);

  window.addEventListener('resize', () => { renderer.resize(); renderer.render(); });
  window.addEventListener('beforeunload', save);
});
