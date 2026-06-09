import { getPTDateYYYYMMDD, getOrCreateAnonId, formatTime } from '../common/utils.js';
import { createShellController } from '../common/shell-controller.js';
import { formatDateForShare } from '../common/share.js';
import { buildShareCard } from '../common/share-card.js';
import { TilesEngine } from './tiles-engine.js';

const STATE_PREFIX = 'dailygrid_tiles_state_';

const els = {
  grid: document.getElementById('tiles-grid'),
  progress: document.getElementById('progress-text'),
  gridSize: document.getElementById('grid-size'),
  puzzleDate: document.getElementById('puzzle-date'),
  showSolutionBtn: document.getElementById('show-solution-btn'),
  solutionActions: document.getElementById('solution-actions'),
  solutionRetryBtn: document.getElementById('solution-retry-btn'),
  solutionNextBtn: document.getElementById('solution-next-btn')
};

let engine;
let shell;
let currentMode = 'daily';
let puzzleSeed = getPTDateYYYYMMDD();
let puzzleId = puzzleSeed;
let completionMs = null;
let lastTs = performance.now();
let lastSaveTs = 0;

const stateKey = () => `${STATE_PREFIX}${currentMode}_${puzzleId}`;
const getPuzzleId = () => (currentMode === 'practice' ? `practice-${puzzleSeed}` : getPTDateYYYYMMDD());

function setLabels() {
  els.gridSize.textContent = engine.getGridLabel();
  els.puzzleDate.textContent = currentMode === 'practice' ? 'Practice' : puzzleId;
}

function updateProgress() {
  if (!engine || !els.progress) return;
  if (engine.solutionShown && currentMode === 'practice') {
    els.progress.textContent = 'Solution shown • Try again or load the next practice puzzle.';
    return;
  }
  if (engine.isComplete) {
    els.progress.textContent = `Solved in ${engine.moveCount} moves`;
    return;
  }
  els.progress.textContent = engine.moveCount === 0
    ? 'Tap or swipe to slide tiles.'
    : `${engine.moveCount} move${engine.moveCount === 1 ? '' : 's'} • keep sliding`;
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

function renderGrid() {
  if (!els.grid || !engine) return;
  els.grid.innerHTML = '';
  engine.tiles.forEach((value, index) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'tiles-tile';
    tile.dataset.index = String(index);
    tile.setAttribute('aria-label', value === 0 ? 'Empty space' : `Tile ${value}`);

    if (value === 0) {
      tile.classList.add('tiles-tile-empty');
      tile.disabled = true;
    } else {
      tile.textContent = String(value);
      tile.disabled = !engine.canMove(index);
      if (engine.canMove(index)) tile.classList.add('tiles-tile-active');
    }

    tile.addEventListener('click', () => handleTileClick(index));
    els.grid.appendChild(tile);
  });
}

function save() {
  if (currentMode !== 'daily') return;
  localStorage.setItem(stateKey(), JSON.stringify(engine.exportState()));
}

function load() {
  if (currentMode !== 'daily') return;
  const raw = localStorage.getItem(stateKey());
  if (!raw) return;
  try {
    engine.importState(JSON.parse(raw));
  } catch {
    // ignore bad local state
  }
}

function onInteract() {
  if (!engine.timerStarted) engine.startTimer();
  if (engine.isPaused && !engine.isComplete && !engine.solutionShown) engine.resume();
  if (engine.isComplete) completionMs = completionMs ?? engine.timeMs;
  renderGrid();
  updateProgress();
  updateSolutionUI();
  save();
  shell?.update();
}

function handleTileClick(index) {
  if (!engine.tryMove(index)) return;
  onInteract();
  if (engine.isComplete) shell?.update();
}

function initSwipeControls() {
  if (!els.grid) return;
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let swipeHandled = false;
  const THRESH = 28;

  const onStart = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const pt = e.touches?.[0] ?? e;
    startX = pt.clientX;
    startY = pt.clientY;
    tracking = true;
    swipeHandled = false;
  };

  const onEnd = (e) => {
    if (!tracking) return;
    tracking = false;
    const pt = e.changedTouches?.[0] ?? e;
    const dx = pt.clientX - startX;
    const dy = pt.clientY - startY;
    if (Math.hypot(dx, dy) < THRESH) return;
    if (!engine.tryMoveBySwipe(dx, dy)) return;
    swipeHandled = true;
    e.preventDefault();
    e.stopPropagation();
    onInteract();
    if (engine.isComplete) shell?.update();
  };

  const suppressClickAfterSwipe = (e) => {
    if (!swipeHandled) return;
    e.preventDefault();
    e.stopPropagation();
    swipeHandled = false;
  };

  els.grid.addEventListener('pointerdown', onStart, { capture: true });
  els.grid.addEventListener('pointerup', onEnd, { capture: true });
  els.grid.addEventListener('touchstart', onStart, { capture: true, passive: true });
  els.grid.addEventListener('touchend', onEnd, { capture: true });
  els.grid.addEventListener('click', suppressClickAfterSwipe, { capture: true });
}

function initPuzzle() {
  engine = new TilesEngine(puzzleId);
  load();
  setLabels();
  updateProgress();
  updateSolutionUI();
  renderGrid();
  shell?.update();
}

function switchMode(mode) {
  currentMode = mode;
  puzzleSeed = mode === 'practice'
    ? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
    : getPTDateYYYYMMDD();
  puzzleId = getPuzzleId();
  completionMs = null;
  initPuzzle();
}

window.startPracticeMode = () => switchMode('practice');
window.startDailyMode = () => switchMode('daily');

function resetGame({ resetTimer = true } = {}) {
  engine.reset({ resetTimer });
  completionMs = null;
  updateProgress();
  updateSolutionUI();
  renderGrid();
  save();
  shell?.update();
}

function showSolution() {
  if (currentMode !== 'practice' || engine.solutionShown) return;
  engine.revealSolution();
  updateProgress();
  updateSolutionUI();
  renderGrid();
  shell?.update();
}

function initShell() {
  shell = createShellController({
    gameId: 'tiles',
    getMode: () => currentMode,
    getPuzzleId: () => puzzleId,
    getGridLabel: () => engine.getGridLabel(),
    getElapsedMs: () => engine.timeMs,
    formatTime,
    autoStartOnProgress: true,
    isComplete: () => engine.isComplete,
    isPaused: () => engine.isPaused,
    isStarted: () => engine.timerStarted,
    hasProgress: () => engine.moveCount > 0,
    isSolutionShown: () => engine.solutionShown,
    shouldShowCompletionModal: () => !engine.solutionShown,
    pause: () => { engine.pause(); save(); },
    resume: () => { engine.resume(); save(); },
    startGame: () => { engine.startTimer(); save(); },
    resetGame: () => resetGame({ resetTimer: false }),
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
    getCompletionPayload: () => ({
      timeMs: Math.max(3000, Math.min(engine.timeMs, 3600000)),
      hintsUsed: 0
    }),
    getShareMeta: () => ({
      gameName: 'Tiles',
      shareUrl: 'https://dailygrid.app/games/tiles/',
      gridLabel: engine.getGridLabel(),
      accent: '#a78bfa'
    }),
    getShareFile: () => buildShareCard({
      gameName: 'Tiles',
      logoPath: '/games/tiles/tiles-logo.svg',
      accent: '#a78bfa',
      accentSoft: 'rgba(167,139,250,.12)',
      backgroundStart: '#0f0a1a',
      backgroundEnd: '#1a1030',
      dateText: formatDateForShare(getPTDateYYYYMMDD()),
      timeText: formatTime(completionMs ?? engine.timeMs),
      gridLabel: engine.getGridLabel(),
      footerText: 'dailygrid.app/games/tiles'
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
  initSwipeControls();

  els.showSolutionBtn?.addEventListener('click', showSolution);
  els.solutionRetryBtn?.addEventListener('click', () => resetGame({ resetTimer: true }));
  els.solutionNextBtn?.addEventListener('click', () => switchMode('practice'));

  setInterval(() => {
    const now = performance.now();
    engine.updateTime(now - lastTs);
    lastTs = now;
    if (currentMode === 'daily' && engine.timerStarted && !engine.isPaused && !engine.isComplete) {
      if (now - lastSaveTs >= 2000) {
        lastSaveTs = now;
        save();
      }
    }
    shell?.update();
  }, 200);

  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
});
