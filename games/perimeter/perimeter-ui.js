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
  gridSize: document.getElementById('grid-size'),
  showSolutionBtn: document.getElementById('show-solution-btn'),
  solutionActions: document.getElementById('solution-actions'),
  solutionRetryBtn: document.getElementById('solution-retry-btn'),
  solutionNextBtn: document.getElementById('solution-next-btn')
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
let solutionShown = false;

function getPuzzleIdForMode(mode) {
  if (mode === 'practice') return `practice-${puzzleSeed}`;
  return getPTDateYYYYMMDD();
}

function getStateKey() {
  return `${STATE_PREFIX}${currentMode}_${puzzleId}`;
}

// mark mode removed: tap edges to toggle line on/off

function updatePracticeControls() {
  const practice = currentMode === 'practice';
  if (practice && !engine?.isComplete && !solutionShown) {
    els.showSolutionBtn?.classList.remove('hidden');
  } else {
    els.showSolutionBtn?.classList.add('hidden');
  }

  if (practice && solutionShown) {
    els.solutionActions?.classList.remove('hidden');
  } else {
    els.solutionActions?.classList.add('hidden');
  }
}

function updateProgress() {
  if (!engine || !els.progress) return;
  const { satisfied, total } = engine.getClueProgress();
  const lines = engine.getLineEdges().length;
  const invalidNodes = engine.getInvalidNodes().size;

  if (solutionShown && currentMode === 'practice') {
    els.progress.textContent = 'Solution shown • Try again or load another practice puzzle.';
    return;
  }

  if (lines === 0) {
    els.progress.textContent = 'Tap any edge to draw a line. Tap a drawn edge again to remove it.';
    return;
  }

  const warning = invalidNodes > 0 ? ` • Fix ${invalidNodes} junction${invalidNodes === 1 ? '' : 's'}` : '';
  els.progress.textContent = `Clues: ${satisfied}/${total} • Lines: ${lines}${warning}`;
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
  engine.reset({ resetTimer });

  completionMs = null;
  solutionShown = false;
  input?.updateTouchBehavior(false);
  updateProgress();
  updatePracticeControls();
  renderer?.render();
  saveProgress();
  shell?.update();
}

function completeIfSolved() {
  if (!engine) return;
  if (!engine.isComplete) return;
  completionMs = completionMs ?? engine.timeMs;
  input?.updateTouchBehavior(true);
  updatePracticeControls();
  saveProgress();
  shell?.update();
}

function showSolution() {
  if (currentMode !== 'practice' || !engine || engine.isComplete) return;

  const solutionEdges = Array.from(engine?.puzzle?.solutionEdges || []);
  engine.edgeStates = new Map(solutionEdges.map((edge) => [edge, 1]));
  engine.syncStatus();
  solutionShown = true;
  completionMs = null;
  renderer?.render();
  updateProgress();
  updatePracticeControls();
  shell?.update();
}

function handleInteraction() {
  if (!engine || engine.isComplete || solutionShown) return;
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
  const edges = Array.isArray(saved.edges) ? saved.edges : [];
  engine.edgeStates = new Map(edges);
  engine.timeMs = saved.timeMs ?? 0;
  engine.timerStarted = saved.timerStarted ?? false;
  engine.isPaused = saved.isPaused ?? false;
  engine.isComplete = saved.isComplete ?? false;
  completionMs = saved.completionMs ?? null;
  engine.syncStatus();

  // Guard against stale/corrupt pause snapshots that have no board progress.
  // This avoids landing on an empty "Paused" overlay after revisit.
  if (!engine.isComplete && engine.getLineEdges().length === 0) {
    engine.isPaused = false;
    engine.timerStarted = false;
  }
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
  solutionShown = false;
  renderer?.render();
  updatePracticeControls();
  input?.updateTouchBehavior(engine?.isComplete ?? false);
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
  solutionShown = false;
  loadPuzzle();
  initState();
  updateProgress();
  setGridLabel();
  setDateLabel();
  updatePracticeControls();
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
  solutionShown = false;
  loadPuzzle();
  initState();
  updateProgress();
  setGridLabel();
  setDateLabel();
  updatePracticeControls();
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
    isSolutionShown: () => solutionShown,
    shouldShowCompletionModal: () => !solutionShown,
    pause: () => pauseTimer(),
    resume: () => resumeTimer(),
    startGame: () => startTimer(),
    resetGame: () => resetPuzzle({ resetTimer: false }),
    startReplay: () => {},
    exitReplay: () => {},
    onResetUI: () => {
      solutionShown = false;
      updatePracticeControls();
      updateProgress();
    },
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
    hideResetWhenComplete: true,
    disableReplay: true,
    pauseOnHide: true
  });
}

async function buildShareImage() {
  const finalTime = completionMs ?? engine?.timeMs ?? 0;
  const puzzleDate = formatDateForShare(getPTDateYYYYMMDD());
  return buildShareCard({
    gameName: 'Perimeter',
    logoPath: '/games/perimeter/perimeter-logo.png',
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
  updatePracticeControls();
  shell?.update();

  window.addEventListener('resize', () => {
    renderer?.resize();
    renderer?.render();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  init();

  // mark mode removed

  els.showSolutionBtn?.addEventListener('click', () => showSolution());
  els.solutionRetryBtn?.addEventListener('click', () => {
    resetPuzzle({ resetTimer: true });
  });
  els.solutionNextBtn?.addEventListener('click', () => resetPracticePuzzle());

  window.startPracticeMode = () => switchMode('practice');
  window.startDailyMode = () => switchMode('daily');
  window.addEventListener('beforeunload', saveProgress);
});
