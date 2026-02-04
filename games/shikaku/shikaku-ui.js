import { getPTDateYYYYMMDD, formatTime, getOrCreateAnonId } from '../common/utils.js';
import { createShellController } from '../common/shell-controller.js';
import { formatDateForShare } from '../common/share.js';
import { buildShareCard } from '../common/share-card.js';

const GRID_SIZE = 5;
const STATE_PREFIX = 'dailygrid_shikaku_state_';

const CLUES = [
  { id: 'A', r: 0, c: 1, area: 6 },
  { id: 'B', r: 1, c: 4, area: 4 },
  { id: 'C', r: 3, c: 0, area: 6 },
  { id: 'D', r: 2, c: 3, area: 6 },
  { id: 'E', r: 4, c: 3, area: 3 }
];

const els = {
  grid: document.getElementById('parcel-grid'),
  progress: document.getElementById('progress-text'),
  rectCount: document.getElementById('rect-count'),
  puzzleDate: document.getElementById('puzzle-date')
};

const cellAssignments = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
const rectangles = new Map();
let cells = [];
let dragStart = null;
let currentSelection = null;
let shell = null;
let currentMode = 'daily';
let puzzleId = getPTDateYYYYMMDD();
let puzzleSeed = puzzleId;
let baseElapsed = 0;
let startTimestamp = 0;
let timerStarted = false;
let isPaused = false;
let isComplete = false;
let completionMs = null;
let tickInterval = null;

function getPuzzleIdForMode(mode) {
  if (mode === 'practice') return `practice-${puzzleSeed}`;
  return getPTDateYYYYMMDD();
}

function getStateKey() {
  return `${STATE_PREFIX}${currentMode}_${puzzleId}`;
}

function buildGrid() {
  if (!els.grid) return;
  els.grid.innerHTML = '';
  cells = [];
  for (let r = 0; r < GRID_SIZE; r += 1) {
    for (let c = 0; c < GRID_SIZE; c += 1) {
      const clue = CLUES.find(cl => cl.r === r && cl.c === c);
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = String(r);
      cell.dataset.c = String(c);
      if (clue) {
        cell.classList.add('clue');
        cell.textContent = String(clue.area);
        cell.dataset.clueId = clue.id;
      }
      els.grid.appendChild(cell);
      cells.push(cell);
    }
  }
}

function cellAt(r, c) {
  return cells.find(cell => Number(cell.dataset.r) === r && Number(cell.dataset.c) === c);
}

function updateProgress(text) {
  if (els.progress) els.progress.textContent = text;
}

function clearSelection() {
  currentSelection = null;
  cells.forEach(cell => cell.classList.remove('selected'));
}

function applySelection(rect) {
  clearSelection();
  if (!rect) return;
  for (let r = rect.r1; r <= rect.r2; r += 1) {
    for (let c = rect.c1; c <= rect.c2; c += 1) {
      const cell = cellAt(r, c);
      cell?.classList.add('selected');
    }
  }
}

function rectFromPoints(start, end) {
  const r1 = Math.min(start.r, end.r);
  const r2 = Math.max(start.r, end.r);
  const c1 = Math.min(start.c, end.c);
  const c2 = Math.max(start.c, end.c);
  return { r1, r2, c1, c2 };
}

function clueInsideRect(rect) {
  return CLUES.filter(cl => cl.r >= rect.r1 && cl.r <= rect.r2 && cl.c >= rect.c1 && cl.c <= rect.c2);
}

function rectArea(rect) {
  return (rect.r2 - rect.r1 + 1) * (rect.c2 - rect.c1 + 1);
}

function clearRectangleFor(clueId) {
  const existing = rectangles.get(clueId);
  if (!existing) return;
  for (let r = existing.r1; r <= existing.r2; r += 1) {
    for (let c = existing.c1; c <= existing.c2; c += 1) {
      if (cellAssignments[r][c] === clueId) {
        cellAssignments[r][c] = null;
        const cell = cellAt(r, c);
        cell?.classList.remove('assigned');
      }
    }
  }
  rectangles.delete(clueId);
}

function assignRectangle(clueId, rect) {
  clearRectangleFor(clueId);
  for (let r = rect.r1; r <= rect.r2; r += 1) {
    for (let c = rect.c1; c <= rect.c2; c += 1) {
      cellAssignments[r][c] = clueId;
      const cell = cellAt(r, c);
      cell?.classList.add('assigned');
    }
  }
  rectangles.set(clueId, rect);
}

function updateCounts() {
  if (els.rectCount) els.rectCount.textContent = String(rectangles.size);
}

function checkCompletion() {
  if (rectangles.size !== CLUES.length) return false;
  for (let r = 0; r < GRID_SIZE; r += 1) {
    for (let c = 0; c < GRID_SIZE; c += 1) {
      if (!cellAssignments[r][c]) return false;
    }
  }
  return true;
}

function tryComplete() {
  if (isComplete) return;
  if (checkCompletion()) {
    isComplete = true;
    completionMs = getElapsedMs();
    baseElapsed = completionMs;
    isPaused = true;
    timerStarted = true;
    saveProgress();
    shell?.update();
  }
}

function handlePointerDown(event) {
  if (isComplete) return;
  const target = event.target.closest('.cell');
  if (!target) return;
  if (!timerStarted) startTimer();
  if (isPaused) resumeTimer();

  dragStart = {
    r: Number(target.dataset.r),
    c: Number(target.dataset.c)
  };
  currentSelection = rectFromPoints(dragStart, dragStart);
  applySelection(currentSelection);
}

function handlePointerMove(event) {
  if (!dragStart) return;
  const target = event.target.closest('.cell');
  if (!target) return;
  const rect = rectFromPoints(dragStart, {
    r: Number(target.dataset.r),
    c: Number(target.dataset.c)
  });
  currentSelection = rect;
  applySelection(currentSelection);
}

function handlePointerUp(event) {
  if (!dragStart) return;
  const target = event.target.closest('.cell');
  if (!target) {
    dragStart = null;
    clearSelection();
    return;
  }

  const end = { r: Number(target.dataset.r), c: Number(target.dataset.c) };
  const rect = rectFromPoints(dragStart, end);
  dragStart = null;
  clearSelection();

  const clues = clueInsideRect(rect);
  if (clues.length !== 1) {
    updateProgress('Each rectangle must include exactly one clue.');
    return;
  }
  const clue = clues[0];
  if (rectArea(rect) !== clue.area) {
    updateProgress(`That rectangle needs area ${clue.area}.`);
    return;
  }

  for (let r = rect.r1; r <= rect.r2; r += 1) {
    for (let c = rect.c1; c <= rect.c2; c += 1) {
      const assigned = cellAssignments[r][c];
      if (assigned && assigned !== clue.id) {
        updateProgress('Rectangles cannot overlap.');
        return;
      }
    }
  }

  assignRectangle(clue.id, rect);
  updateCounts();
  updateProgress('Rectangle placed.');
  tryComplete();
  saveProgress();
  shell?.update();
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

function resetPuzzle({ resetTimer }) {
  rectangles.clear();
  for (let r = 0; r < GRID_SIZE; r += 1) {
    for (let c = 0; c < GRID_SIZE; c += 1) {
      cellAssignments[r][c] = null;
    }
  }
  cells.forEach(cell => cell.classList.remove('assigned'));
  clearSelection();
  dragStart = null;
  isComplete = false;
  completionMs = null;

  if (resetTimer) {
    baseElapsed = 0;
    startTimestamp = 0;
    timerStarted = false;
    isPaused = false;
  }

  updateCounts();
  updateProgress('Drag to mark a rectangle.');
  saveProgress();
  shell?.update();
}

function loadState() {
  if (currentMode !== 'daily') return null;
  try {
    const raw = localStorage.getItem(getStateKey());
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.rectangles)) return null;
    if (data.timerStarted && !data.isComplete && !data.isPaused) {
      data.isPaused = true;
    }
    return data;
  } catch {
    return null;
  }
}

function saveProgress() {
  if (currentMode !== 'daily') return;
  const rectanglesData = Array.from(rectangles.entries()).map(([clueId, rect]) => ({
    clueId,
    rect
  }));
  const payload = {
    rectangles: rectanglesData,
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
  rectangles.clear();
  for (let r = 0; r < GRID_SIZE; r += 1) {
    for (let c = 0; c < GRID_SIZE; c += 1) {
      cellAssignments[r][c] = null;
    }
  }
  cells.forEach(cell => cell.classList.remove('assigned'));

  if (saved?.rectangles) {
    saved.rectangles.forEach(({ clueId, rect }) => {
      if (!clueId || !rect) return;
      assignRectangle(clueId, rect);
    });
  }
  updateCounts();
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
  }
}

function setDateLabel() {
  if (!els.puzzleDate) return;
  if (currentMode === 'practice') {
    els.puzzleDate.textContent = 'Practice';
    return;
  }
  els.puzzleDate.textContent = puzzleId;
}

function ensureTicker() {
  if (tickInterval) return;
  tickInterval = window.setInterval(() => {
    shell?.update();
  }, 200);
}

function resetPracticePuzzle() {
  puzzleSeed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  puzzleId = getPuzzleIdForMode('practice');
  resetPuzzle({ resetTimer: true });
  setDateLabel();
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
  initState();
  updateCounts();
  updateProgress('Drag to mark a rectangle.');
  setDateLabel();
  shell?.update();
}

function initShell() {
  if (shell) return;

  shell = createShellController({
    gameId: 'shikaku',
    getMode: () => currentMode,
    getPuzzleId: () => puzzleId,
    getGridLabel: () => `${GRID_SIZE}x${GRID_SIZE} Rects`,
    getElapsedMs: () => getElapsedMs(),
    formatTime,
    autoStartOnProgress: true,
    isComplete: () => isComplete,
    isPaused: () => isPaused,
    isStarted: () => timerStarted,
    hasProgress: () => rectangles.size > 0,
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
      gameName: 'Parcel',
      shareUrl: 'https://dailygrid.app/games/shikaku/',
      gridLabel: '5x5 Parcel'
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
    gameName: 'Parcel',
    logoPath: '/games/shikaku/shikaku-logo.svg',
    accent: '#9AD0B5',
    accentSoft: 'rgba(154, 208, 181, 0.12)',
    backgroundStart: '#0E1410',
    backgroundEnd: '#122018',
    dateText: puzzleDate,
    timeText: formatTime(finalTime || 0),
    gridLabel: 'Grid 5x5',
    footerText: 'dailygrid.app/games/shikaku'
  });
}

function init() {
  puzzleSeed = getPTDateYYYYMMDD();
  puzzleId = getPuzzleIdForMode(currentMode);
  buildGrid();
  initState();
  updateCounts();
  updateProgress('Drag to mark a rectangle.');
  setDateLabel();
  initShell();
  ensureTicker();
  shell?.update();
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  els.grid?.addEventListener('pointerdown', handlePointerDown);
  els.grid?.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp);
  window.startPracticeMode = () => switchMode('practice');
  window.startDailyMode = () => switchMode('daily');
  window.addEventListener('beforeunload', saveProgress);
});
