import { getPTDateYYYYMMDD, formatTime, getOrCreateAnonId } from '../common/utils.js';
import { createShellController } from '../common/shell-controller.js';
import { formatDateForShare } from '../common/share.js';
import { buildShareCard } from '../common/share-card.js';
import { PipesEngine } from './pipes-engine.js';
import { PipesRenderer } from './pipes-renderer.js';
import { PipesInput } from './pipes-input.js';
import { fetchDescriptor, GRID_SIZE, rotateMaskSteps } from './pipes-utils.js';

const STATE_PREFIX = 'dailygrid_pipes_state_';

const els = {
  canvas: document.getElementById('pipes-canvas'),
  progress: document.getElementById('progress-text'),
  puzzleDate: document.getElementById('puzzle-date'),
  gridSize: document.getElementById('grid-size')
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
  const matched = engine.getCompletionCount();
  const total = GRID_SIZE * GRID_SIZE;
  const percent = Math.floor((matched / total) * 100);
  els.progress.textContent = `Aligned segments: ${matched} / ${total} • ${percent}%`;
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
  if (!els.gridSize) return;
  els.gridSize.textContent = `${GRID_SIZE}x${GRID_SIZE}`;
}

function handleBoardInteraction() {
  if (!engine || isComplete) return;
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
  engine = new PipesEngine(descriptor);
  renderer?.setEngine(engine);
  renderer?.render();
  input?.setEngine(engine);

  moveCount = 0;
  isComplete = false;
  completionMs = null;

  if (resetTimer) {
    baseElapsed = 0;
    startTimestamp = 0;
    timerStarted = false;
    isPaused = false;
  }

  updateProgress();
  saveProgress();
  shell?.update();
}

function completePuzzle() {
  if (isComplete) return;
  isComplete = true;
  completionMs = getElapsedMs();
  baseElapsed = completionMs;
  isPaused = true;
  timerStarted = true;
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
    if (cell.isPrefill) return;
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
  renderer?.render();
}

async function loadDescriptor() {
  descriptor = await fetchDescriptor(puzzleId);
  engine = new PipesEngine(descriptor);
  if (!renderer) {
    renderer = new PipesRenderer(els.canvas, engine);
  } else {
    renderer.setEngine(engine);
  }
  renderer.render();

  if (!input) {
    input = new PipesInput(els.canvas, engine, renderer, handleBoardInteraction);
  } else {
    input.setEngine(engine);
    input.setRenderer?.(renderer);
  }
}

function resetPracticePuzzle() {
  puzzleSeed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  puzzleId = getPuzzleIdForMode('practice');
  moveCount = 0;
  baseElapsed = 0;
  startTimestamp = 0;
  timerStarted = false;
  isPaused = false;
  isComplete = false;
  completionMs = null;
  loadDescriptor().then(() => {
    updateProgress();
    setDateLabel();
    shell?.update();
  });
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
  loadDescriptor().then(() => {
    initState();
    updateProgress();
    setDateLabel();
    shell?.update();
  });
}

function ensureTicker() {
  if (tickInterval) return;
  tickInterval = window.setInterval(() => {
    shell?.update();
  }, 200);
}

function initShell() {
  if (shell) return;

  shell = createShellController({
    gameId: 'pipes',
    getMode: () => currentMode,
    getPuzzleId: () => puzzleId,
    getGridLabel: () => `${GRID_SIZE}x${GRID_SIZE} Flow`,
    getElapsedMs: () => getElapsedMs(),
    formatTime,
    autoStartOnProgress: true,
    isComplete: () => isComplete,
    isPaused: () => isPaused,
    isStarted: () => timerStarted,
    hasProgress: () => moveCount > 0,
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
      timeMs: Math.max(3000, Math.min(getElapsedMs(), 3600000)),
      hintsUsed: 0
    }),
    getShareMeta: () => ({
      gameName: 'Flowline',
      shareUrl: 'https://dailygrid.app/games/pipes/',
      gridLabel: '7x7 Flow'
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
    gameName: 'Flowline',
    logoPath: '/games/pipes/pipes-logo.svg',
    accent: '#4ce0e8',
    accentSoft: 'rgba(76, 224, 232, 0.12)',
    backgroundStart: '#070c12',
    backgroundEnd: '#0b1424',
    dateText: puzzleDate,
    timeText: formatTime(finalTime || 0),
    gridLabel: 'Grid 7x7',
    footerText: 'dailygrid.app/games/pipes'
  });
}

async function init() {
  puzzleSeed = getPTDateYYYYMMDD();
  puzzleId = getPuzzleIdForMode(currentMode);
  await loadDescriptor();
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
