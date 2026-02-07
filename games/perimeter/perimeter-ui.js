import { getPTDateYYYYMMDD, getOrCreateAnonId, formatTime } from '../common/utils.js';
import { createShellController } from '../common/shell-controller.js';
import { formatDateForShare } from '../common/share.js';
import { buildShareCard } from '../common/share-card.js';
import { PerimeterEngine } from './perimeter-engine.js';
import { PerimeterRenderer } from './perimeter-renderer.js';
import { PerimeterInput } from './perimeter-input.js';

const STATE_PREFIX = 'dailygrid_perimeter_state_';

const els = {
  canvas: document.getElementById('perimeter-canvas'),
  progress: document.getElementById('progress-text'),
  puzzleDate: document.getElementById('puzzle-date'),
  gridSize: document.getElementById('grid-size')
};

let engine;
let renderer;
let input;
let shell = null;
let currentMode = 'daily';
let puzzleId = getPTDateYYYYMMDD();
let puzzleSeed = puzzleId;
let completionMs = null;
let tickInterval = null;
let lastTimestamp = 0;

function getPuzzleIdForMode(mode) {
  if (mode === 'practice') return `practice-${puzzleSeed}`;
  return getPTDateYYYYMMDD();
}

function getStateKey() {
  return `${STATE_PREFIX}${currentMode}_${puzzleId}`;
}

function updateProgress() {
  if (!engine || !els.progress) return;
  const { satisfied, total } = engine.getClueProgress();
  const lines = engine.getLineEdges().length;
  els.progress.textContent = `Clues: ${satisfied} / ${total} • Lines: ${lines}`;
}

function setDateLabel() {
  if (!els.puzzleDate) return;
  if (currentMode === 'practice') {
    els.puzzleDate.textContent = 'Practice';
    return;
  }
  els.puzzleDate.textContent = puzzleId;
}

function setGridLabel() {
  if (!els.gridSize || !engine) return;
  els.gridSize.textContent = engine.getGridLabel();
}

function startTimer() {
  engine?.startTimer();
  saveProgress();
}

function pauseTimer() {
  engine?.pause();
  saveProgress();
}

function resumeTimer() {
  engine?.resume();
  saveProgress();
}

function resetPuzzle({ resetTimer }) {
  if (!engine) return;
  engine.reset();

  if (resetTimer) {
    engine.timeMs = 0;
    engine.timerStarted = false;
    engine.isPaused = false;
  }

  completionMs = null;
  updateProgress();
  renderer?.render();
  saveProgress();
  shell?.update();
}

function completeIfSolved() {
  if (!engine) return;
  if (!engine.isComplete) return;
  completionMs = completionMs ?? engine.timeMs;
  saveProgress();
  shell?.update();
}

function handleInteraction() {
  if (!engine || engine.isComplete) return;
  if (!engine.timerStarted) startTimer();
  if (engine.isPaused) resumeTimer();
  updateProgress();
  renderer?.render();
  completeIfSolved();
}

function loadState() {
  if (currentMode !== 'daily') return null;
  try {
    const raw = localStorage.getItem(getStateKey());
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.edges)) return null;
    if (data.timerStarted && !data.isComplete && !data.isPaused) {
      data.isPaused = true;
    }
    return data;
  } catch {
    return null;
  }
}

function saveProgress() {
  if (currentMode !== 'daily' || !engine) return;
  const payload = {
    edges: Array.from(engine.edgeStates.entries()),
    timeMs: engine.timeMs,
    timerStarted: engine.timerStarted,
    isPaused: engine.isPaused,
    isComplete: engine.isComplete,
    completionMs
  };
  try {
    localStorage.setItem(getStateKey(), JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

function applySavedState(saved) {
  if (!engine || !saved) return;
  engine.edgeStates = new Map(saved.edges || []);
  engine.timeMs = saved.timeMs ?? 0;
  engine.timerStarted = saved.timerStarted ?? false;
  engine.isPaused = saved.isPaused ?? false;
  engine.isComplete = saved.isComplete ?? false;
  completionMs = saved.completionMs ?? null;
  engine.syncStatus();
}

function initState() {
  const saved = loadState();
  if (saved) {
    applySavedState(saved);
  } else if (engine) {
    engine.timeMs = 0;
    engine.timerStarted = false;
    engine.isPaused = false;
    engine.isComplete = false;
    completionMs = null;
  }
  renderer?.render();
}

function loadPuzzle() {
  engine = new PerimeterEngine(puzzleId);
  if (!renderer) {
    renderer = new PerimeterRenderer(els.canvas, engine);
  } else {
    renderer.setEngine(engine);
  }
  if (!input) {
    input = new PerimeterInput(els.canvas, engine, renderer, {
      onEdgeChange: () => {
        renderer.render();
        updateProgress();
      },
      onInteraction: () => {
        handleInteraction();
      }
    });
  } else {
    input.setEngine(engine);
    input.setRenderer(renderer);
  }
  renderer.render();
}

function resetPracticePuzzle() {
  puzzleSeed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  puzzleId = getPuzzleIdForMode('practice');
  loadPuzzle();
  initState();
  updateProgress();
  setGridLabel();
  setDateLabel();
  shell?.update();
}

function switchMode(mode) {
  if (currentMode === mode) return;
  saveProgress();
  currentMode = mode;
  if (mode === 'practice') {
    puzzleSeed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  } else {
    puzzleSeed = getPTDateYYYYMMDD();
  }
  puzzleId = getPuzzleIdForMode(mode);
  loadPuzzle();
  initState();
  updateProgress();
  setGridLabel();
  setDateLabel();
  shell?.update();
}

function ensureTicker() {
  if (tickInterval || !engine) return;
  lastTimestamp = performance.now();
  tickInterval = window.setInterval(() => {
    const now = performance.now();
    const delta = now - lastTimestamp;
    lastTimestamp = now;
    engine.updateTime(delta);
    shell?.update();
  }, 200);
}

function initShell() {
  if (shell) return;

  shell = createShellController({
    gameId: 'perimeter',
    getMode: () => currentMode,
    getPuzzleId: () => puzzleId,
    getGridLabel: () => engine?.getGridLabel() || '6x6 cells',
    getElapsedMs: () => engine?.timeMs || 0,
    formatTime,
    autoStartOnProgress: true,
    isComplete: () => engine?.isComplete || false,
    isPaused: () => engine?.isPaused || false,
    isStarted: () => engine?.timerStarted || false,
    hasProgress: () => (engine?.edgeStates?.size || 0) > 0,
    pause: () => pauseTimer(),
    resume: () => resumeTimer(),
    startGame: () => startTimer(),
    resetGame: () => resetPuzzle({ resetTimer: false }),
    startReplay: () => {},
    exitReplay: () => {},
    onResetUI: () => {},
    onTryAgain: () => resetPuzzle({ resetTimer: true }),
    onNextLevel: () => resetPracticePuzzle(),
    onBackToDaily: () => switchMode('daily'),
    onPracticeInfinite: () => switchMode('practice'),
    onStartPractice: () => switchMode('practice'),
    onStartDaily: () => switchMode('daily'),
    getAnonId: () => getOrCreateAnonId(),
    getCompletionPayload: () => ({
      timeMs: Math.max(3000, Math.min(engine?.timeMs || 0, 3600000)),
      hintsUsed: engine?.hintsUsed || 0
    }),
    getShareMeta: () => ({
      gameName: 'Perimeter',
      shareUrl: 'https://dailygrid.app/games/perimeter/',
      gridLabel: engine?.getGridLabel() || '6x6 cells'
    }),
    getShareFile: () => buildShareImage(),
    getCompletionMs: () => completionMs,
    setCompletionMs: (ms) => {
      completionMs = ms;
    },
    isTimerRunning: () => (engine?.timerStarted && !engine?.isPaused && !engine?.isComplete) || false,
    disableReplay: true,
    pauseOnHide: true
  });
}

async function buildShareImage() {
  const finalTime = completionMs ?? engine?.timeMs ?? 0;
  const puzzleDate = formatDateForShare(getPTDateYYYYMMDD());
  return buildShareCard({
    gameName: 'Perimeter',
    logoPath: '/games/perimeter/perimeter-logo.svg',
    accent: '#7da2ff',
    accentSoft: 'rgba(125, 162, 255, 0.12)',
    backgroundStart: '#0c1018',
    backgroundEnd: '#121a2a',
    dateText: puzzleDate,
    timeText: formatTime(finalTime || 0),
    gridLabel: `Grid ${engine?.getGridSize() || 6}x${engine?.getGridSize() || 6}`,
    footerText: 'dailygrid.app/games/perimeter'
  });
}

function init() {
  loadPuzzle();
  initState();
  updateProgress();
  setGridLabel();
  setDateLabel();
  initShell();
  ensureTicker();
  shell?.update();

  window.addEventListener('resize', () => {
    renderer?.resize();
    renderer?.render();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  window.startPracticeMode = () => switchMode('practice');
  window.startDailyMode = () => switchMode('daily');
  window.addEventListener('beforeunload', saveProgress);
});
