import { getPTDateYYYYMMDD, formatTime, getOrCreateAnonId } from '../common/utils.js';
import { createShellController } from '../common/shell-controller.js';
import { formatDateForShare } from '../common/share.js';
import { buildShareCard } from '../common/share-card.js';
import { ConduitEngine } from './conduit-engine.js';
import { ConduitRenderer } from './conduit-renderer.js';
import { ConduitInput } from './conduit-input.js';
import { fetchDescriptor, rotateMaskSteps } from './conduit-utils.js';

const STATE_PREFIX = 'dailygrid_conduit_state_';

const els = {
  canvas: document.getElementById('conduit-canvas'),
  progress: document.getElementById('progress-text'),
  showSolutionBtn: document.getElementById('show-solution-btn'),
  solutionActions: document.getElementById('solution-actions'),
  solutionRetryBtn: document.getElementById('solution-retry-btn'),
  solutionNextBtn: document.getElementById('solution-next-btn')
};

let descriptor;
let engine;
let renderer;
let input;
let shell = null;
let currentMode = 'daily';
let puzzleId = '';
let puzzleSeed = '';
let baseElapsed = 0;
let startTimestamp = 0;
let timerStarted = false;
let isPaused = false;
let isComplete = false;
let completionMs = null;
let tickInterval = null;
let moveCount = 0;
let solutionShown = false;

function getPuzzleIdForMode(mode) {
  if (mode === 'practice') return `practice-${puzzleSeed}`;
  return getPTDateYYYYMMDD();
}

function getStateKey() {
  return `${STATE_PREFIX}${currentMode}_${puzzleId}`;
}

function getElapsedMs() {
  if (!timerStarted) return baseElapsed;
  if (isPaused) return baseElapsed;
  return baseElapsed + (performance.now() - startTimestamp);
}

function updatePracticeControls() {
  const practice = currentMode === 'practice';
  if (practice && !isComplete && !solutionShown) {
    els.showSolutionBtn?.classList.remove('hidden');
  } else {
    els.showSolutionBtn?.classList.add('hidden');
  }

  if (practice && solutionShown && !isComplete) {
    els.solutionActions?.classList.remove('hidden');
  } else {
    els.solutionActions?.classList.add('hidden');
  }
}

function startTimer() {
  if (timerStarted && !isPaused) return;
  timerStarted = true;
  isPaused = false;
  startTimestamp = performance.now();
  saveProgress();
}

function pauseTimer() {
  if (!timerStarted || isPaused) return;
  baseElapsed = getElapsedMs();
  isPaused = true;
  saveProgress();
}

function resumeTimer() {
  if (!timerStarted) {
    timerStarted = true;
    baseElapsed = baseElapsed || 0;
  }
  if (!isPaused) return;
  isPaused = false;
  startTimestamp = performance.now();
  saveProgress();
}

function updateProgress() {
  if (!engine || !els.progress) return;
  const exitPowered = engine.getExitPoweredCount();
  const exitTotal = engine.getExitCount();

  if (solutionShown && currentMode === 'practice') {
    els.progress.textContent = 'Solution shown • Try again or load the next practice puzzle.';
    return;
  }

  if (exitPowered === 0) {
    els.progress.textContent = 'Rotate tiles 90° to route power from the top entrance to all 3 exits.';
    return;
  }

  if (exitPowered >= exitTotal && exitTotal > 0) {
    els.progress.textContent = 'All exits powered • Circuit complete';
    return;
  }

  els.progress.textContent = `Exits powered: ${exitPowered}/${exitTotal}`;
}

function handleBoardInteraction() {
  if (!engine || isComplete || solutionShown) return;
  if (!timerStarted) startTimer();
  if (isPaused) resumeTimer();

  moveCount += 1;
  renderer?.render();
  updateProgress();

  if (engine.isSolved()) {
    completePuzzle();
  }

  saveProgress();
  shell?.update();
}

function resetPuzzle({ resetTimer }) {
  if (!descriptor) return;
  engine = new ConduitEngine(descriptor);
  renderer?.setEngine(engine);
  renderer?.render();
  input?.setEngine(engine);

  moveCount = 0;
  isComplete = false;
  completionMs = null;
  solutionShown = false;
  input?.updateTouchBehavior(false);

  if (resetTimer) {
    baseElapsed = 0;
    startTimestamp = 0;
    timerStarted = false;
    isPaused = false;
  }

  updateProgress();
  updatePracticeControls();
  saveProgress();
  shell?.update();
}

function showSolution() {
  if (currentMode !== 'practice' || !engine || isComplete) return;

  engine.getCells().forEach((cell) => {
    cell.rotation = 0;
    cell.playerMask = cell.solutionMask;
  });
  engine._evaluateStatuses?.();

  solutionShown = true;
  renderer?.render();
  updateProgress();
  updatePracticeControls();
  shell?.update();
}

function completePuzzle() {
  if (isComplete) return;
  isComplete = true;
  completionMs = getElapsedMs();
  baseElapsed = completionMs;
  isPaused = true;
  timerStarted = true;
  input?.updateTouchBehavior(true);
  updatePracticeControls();
  saveProgress();
  shell?.update();
}

function loadState() {
  if (currentMode !== 'daily') return null;
  try {
    const raw = localStorage.getItem(getStateKey());
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.rotations)) return null;
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
  const rotations = engine.getCells().map(cell => cell.rotation);
  const payload = {
    rotations,
    moveCount,
    timeMs: getElapsedMs(),
    timerStarted,
    isPaused,
    isComplete,
    completionMs
  };
  try {
    localStorage.setItem(getStateKey(), JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

function applySavedState(saved) {
  if (!engine || !saved?.rotations) return;
  const cells = engine.getCells();
  cells.forEach((cell, idx) => {
    if (cell.isPrefill || !cell.isActive) return;
    const rot = saved.rotations[idx];
    if (typeof rot !== 'number') return;
    cell.rotation = rot % 4;
    cell.playerMask = rotateMaskSteps(cell.solutionMask, cell.rotation);
  });
  engine._evaluateStatuses?.();
  moveCount = saved.moveCount ?? (saved.rotations ? 1 : 0);
}

function initState() {
  const saved = loadState();
  if (saved) {
    applySavedState(saved);
    baseElapsed = saved.timeMs ?? 0;
    timerStarted = saved.timerStarted ?? false;
    isPaused = saved.isPaused ?? false;
    isComplete = saved.isComplete ?? false;
    completionMs = saved.completionMs ?? null;
  } else {
    baseElapsed = 0;
    timerStarted = false;
    isPaused = false;
    isComplete = false;
    completionMs = null;
    moveCount = 0;
  }
  solutionShown = false;
  renderer?.render();
  updatePracticeControls();
  input?.updateTouchBehavior(isComplete);
}

function loadDescriptor() {
  descriptor = fetchDescriptor(puzzleId);
  engine = new ConduitEngine(descriptor);
  if (!renderer) {
    renderer = new ConduitRenderer(els.canvas, engine);
  } else {
    renderer.setEngine(engine);
  }
  renderer.render();

  if (!input) {
    input = new ConduitInput(els.canvas, engine, renderer, handleBoardInteraction);
  } else {
    input.setEngine(engine);
    input.setRenderer?.(renderer);
  }
}

function resetPracticePuzzle({ newPuzzle = true } = {}) {
  if (newPuzzle) {
    puzzleSeed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    puzzleId = getPuzzleIdForMode('practice');
  }
  moveCount = 0;
  baseElapsed = 0;
  startTimestamp = 0;
  timerStarted = false;
  isPaused = false;
  isComplete = false;
  completionMs = null;
  solutionShown = false;
  loadDescriptor();
  updateProgress();
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
  moveCount = 0;
  loadDescriptor();
  initState();
  updateProgress();
  updatePracticeControls();
  shell?.update();
}

function ensureTicker() {
  if (tickInterval) return;
  tickInterval = window.setInterval(() => {
    renderer?.render();
    shell?.update();
  }, 100);
}

function initShell() {
  if (shell) return;

  shell = createShellController({
    gameId: 'conduit',
    getMode: () => currentMode,
    getPuzzleId: () => puzzleId,
    getGridLabel: () => `${descriptor?.width || 6}x${descriptor?.height || 6} Circuit`,
    getElapsedMs: () => getElapsedMs(),
    formatTime,
    autoStartOnProgress: true,
    isComplete: () => isComplete,
    isPaused: () => isPaused,
    isStarted: () => timerStarted,
    hasProgress: () => moveCount > 0,
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
    onTryAgain: () => {
      if (currentMode === 'practice') resetPracticePuzzle();
      else resetPuzzle({ resetTimer: true });
    },
    onNextLevel: () => resetPracticePuzzle(),
    onBackToDaily: () => switchMode('daily'),
    onPracticeInfinite: () => switchMode('practice'),
    onStartPractice: () => switchMode('practice'),
    onStartDaily: () => switchMode('daily'),
    getAnonId: () => getOrCreateAnonId(),
    getCompletionPayload: () => ({
      timeMs: Math.max(3000, Math.min(getElapsedMs(), 3600000)),
      hintsUsed: 0
    }),
    getShareMeta: () => ({
      gameName: 'Conduit',
      shareUrl: 'https://dailygrid.app/games/conduit/',
      gridLabel: `${descriptor?.width || 6}x${descriptor?.height || 6} Circuit`
    }),
    getShareFile: () => buildShareImage(),
    getCompletionMs: () => completionMs,
    setCompletionMs: (ms) => {
      completionMs = ms;
    },
    isTimerRunning: () => timerStarted && !isPaused && !isComplete,
    disableReplay: true,
    pauseOnHide: true
  });
}

async function buildShareImage() {
  const finalTime = completionMs ?? getElapsedMs();
  const puzzleDate = formatDateForShare(getPTDateYYYYMMDD());
  return buildShareCard({
    gameName: 'Conduit',
    logoPath: '/games/conduit/conduit-logo.png',
    accent: '#ffe44d',
    accentSoft: 'rgba(255, 228, 77, 0.16)',
    backgroundStart: '#070c12',
    backgroundEnd: '#0b1424',
    dateText: puzzleDate,
    timeText: formatTime(finalTime || 0),
    gridLabel: `Grid ${descriptor?.width || 6}x${descriptor?.height || 6}`,
    footerText: 'dailygrid.app/games/conduit'
  });
}

function init() {
  puzzleSeed = getPTDateYYYYMMDD();
  puzzleId = getPuzzleIdForMode(currentMode);
  loadDescriptor();
  initState();
  updateProgress();
  initShell();
  ensureTicker();
  updatePracticeControls();
  shell?.update();

  window.addEventListener('resize', () => {
    renderer?.resize();
    renderer?.render();
  });

  els.showSolutionBtn?.addEventListener('click', () => showSolution());
  // Try Again resets the same puzzle; Next Puzzle generates a new one
  els.solutionRetryBtn?.addEventListener('click', () => resetPracticePuzzle({ newPuzzle: false }));
  els.solutionNextBtn?.addEventListener('click', () => resetPracticePuzzle({ newPuzzle: true }));
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  window.startPracticeMode = () => switchMode('practice');
  window.startDailyMode = () => switchMode('daily');
  window.addEventListener('beforeunload', saveProgress);
});
