import {
  createSeededRandom,
  getPTDateYYYYMMDD,
  formatTime,
  getOrCreateAnonId,
  hashString
} from '../common/utils.js';
import { createShellController } from '../common/shell-controller.js';
import { formatDateForShare } from '../common/share.js';
import { buildShareCard } from '../common/share-card.js';

const STATE_PREFIX = 'dailygrid_shikaku_state_';
const SIZE_RANGE = { min: 5, max: 7 };
const RECT_RANGE = { min: 6, max: 10 };
const MIN_RECT_AREA = 2;

const els = {
  grid: document.getElementById('parcel-grid'),
  progress: document.getElementById('progress-text'),
  rectCount: document.getElementById('rect-count'),
  puzzleDate: document.getElementById('puzzle-date'),
  validationMessage: document.getElementById('validation-message'),
  validationMessageText: document.getElementById('validation-message-text'),
  showSolutionBtn: document.getElementById('show-solution-btn'),
  solutionActions: document.getElementById('solution-actions'),
  solutionRetryBtn: document.getElementById('solution-retry-btn'),
  solutionNextBtn: document.getElementById('solution-next-btn'),
  pauseBtn: document.getElementById('pause-btn'),
  resetBtn: document.getElementById('reset-btn')
};

let gridSize = 5;
let clues = [];
let clueIds = new Set();
let cellAssignments = Array.from({ length: gridSize }, () => Array(gridSize).fill(null));
const rectangles = new Map();
const rectOverlays = new Map();
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
let messageTimeout = null;
let solutionShown = false;

const helperText = 'Drag to draw a rectangle. Tap a filled cell to clear it.';

function getPuzzleIdForMode(mode) {
  if (mode === 'practice') return `practice-${puzzleSeed}`;
  return getPTDateYYYYMMDD();
}

function getStateKey() {
  return `${STATE_PREFIX}${currentMode}_${puzzleId}`;
}

function getPuzzleSignature() {
  return `${gridSize}:${clues.map(clue => `${clue.r},${clue.c},${clue.area}`).join('|')}`;
}

function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function rectArea(rect) {
  return (rect.r2 - rect.r1 + 1) * (rect.c2 - rect.c1 + 1);
}

function generatePartition(size, targetRects, rng) {
  const full = { r1: 0, c1: 0, r2: size - 1, c2: size - 1 };
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const rects = [full];
    let guard = 0;
    while (rects.length < targetRects && guard < 400) {
      guard += 1;
      const splittable = rects.filter(rect => {
        const width = rect.c2 - rect.c1 + 1;
        const height = rect.r2 - rect.r1 + 1;
        return (width > 1 || height > 1) && rectArea(rect) >= MIN_RECT_AREA * 2;
      });
      if (splittable.length === 0) break;
      const target = splittable[randInt(rng, 0, splittable.length - 1)];
      const width = target.c2 - target.c1 + 1;
      const height = target.r2 - target.r1 + 1;
      const preferVertical = width > height ? rng() < 0.65 : rng() < 0.35;
      const orientations = preferVertical ? ['v', 'h'] : ['h', 'v'];
      let split = null;
      for (const orient of orientations) {
        if (orient === 'v' && width > 1) {
          const minSplit = target.c1 + 1;
          const maxSplit = target.c2;
          const choices = [];
          for (let c = minSplit; c <= maxSplit; c += 1) {
            const left = { r1: target.r1, c1: target.c1, r2: target.r2, c2: c - 1 };
            const right = { r1: target.r1, c1: c, r2: target.r2, c2: target.c2 };
            if (rectArea(left) >= MIN_RECT_AREA && rectArea(right) >= MIN_RECT_AREA) {
              choices.push({ left, right });
            }
          }
          if (choices.length) {
            split = choices[randInt(rng, 0, choices.length - 1)];
            break;
          }
        }
        if (orient === 'h' && height > 1) {
          const minSplit = target.r1 + 1;
          const maxSplit = target.r2;
          const choices = [];
          for (let r = minSplit; r <= maxSplit; r += 1) {
            const top = { r1: target.r1, c1: target.c1, r2: r - 1, c2: target.c2 };
            const bottom = { r1: r, c1: target.c1, r2: target.r2, c2: target.c2 };
            if (rectArea(top) >= MIN_RECT_AREA && rectArea(bottom) >= MIN_RECT_AREA) {
              choices.push({ top, bottom });
            }
          }
          if (choices.length) {
            split = choices[randInt(rng, 0, choices.length - 1)];
            break;
          }
        }
      }
      if (!split) continue;
      const idx = rects.indexOf(target);
      rects.splice(idx, 1);
      rects.push(split.left ?? split.top);
      rects.push(split.right ?? split.bottom);
    }
    if (rects.length !== targetRects) continue;
    return rects;
  }
  return null;
}

function buildClues(rects, rng) {
  const ids = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return rects.map((rect, idx) => {
    const r = randInt(rng, rect.r1, rect.r2);
    const c = randInt(rng, rect.c1, rect.c2);
    return {
      id: ids[idx] ?? `R${idx + 1}`,
      r,
      c,
      area: rectArea(rect)
    };
  });
}

function generateCandidates(clue, size) {
  const candidates = [];
  const area = clue.area;
  for (let h = 1; h <= size; h += 1) {
    if (area % h !== 0) continue;
    const w = area / h;
    if (w < 1 || w > size) continue;
    const rStart = Math.max(0, clue.r - h + 1);
    const rEnd = Math.min(clue.r, size - h);
    const cStart = Math.max(0, clue.c - w + 1);
    const cEnd = Math.min(clue.c, size - w);
    for (let r1 = rStart; r1 <= rEnd; r1 += 1) {
      const r2 = r1 + h - 1;
      for (let c1 = cStart; c1 <= cEnd; c1 += 1) {
        const c2 = c1 + w - 1;
        candidates.push({ r1, c1, r2, c2 });
      }
    }
  }
  return candidates;
}

function countSolutions(cluesList, size, limit = 2) {
  const totalArea = cluesList.reduce((sum, clue) => sum + clue.area, 0);
  if (totalArea !== size * size) return 0;
  const candidateSets = cluesList.map(clue => generateCandidates(clue, size));
  const order = [...cluesList.keys()].sort((a, b) => candidateSets[a].length - candidateSets[b].length);
  const used = Array.from({ length: size }, () => Array(size).fill(false));
  let solutions = 0;

  function canPlace(rect) {
    for (let r = rect.r1; r <= rect.r2; r += 1) {
      for (let c = rect.c1; c <= rect.c2; c += 1) {
        if (used[r][c]) return false;
      }
    }
    return true;
  }

  function setUsed(rect, value) {
    for (let r = rect.r1; r <= rect.r2; r += 1) {
      for (let c = rect.c1; c <= rect.c2; c += 1) {
        used[r][c] = value;
      }
    }
  }

  function backtrack(idx) {
    if (solutions >= limit) return;
    if (idx >= order.length) {
      solutions += 1;
      return;
    }
    const clueIndex = order[idx];
    const candidates = candidateSets[clueIndex];
    for (const rect of candidates) {
      if (!canPlace(rect)) continue;
      setUsed(rect, true);
      backtrack(idx + 1);
      setUsed(rect, false);
      if (solutions >= limit) return;
    }
  }

  backtrack(0);
  return solutions;
}

function solvePuzzle(cluesList, size) {
  const totalArea = cluesList.reduce((sum, clue) => sum + clue.area, 0);
  if (totalArea !== size * size) return null;
  const candidateSets = cluesList.map(clue => generateCandidates(clue, size));
  const order = [...cluesList.keys()].sort((a, b) => candidateSets[a].length - candidateSets[b].length);
  const used = Array.from({ length: size }, () => Array(size).fill(false));
  const solution = new Map();

  function canPlace(rect) {
    for (let r = rect.r1; r <= rect.r2; r += 1) {
      for (let c = rect.c1; c <= rect.c2; c += 1) {
        if (used[r][c]) return false;
      }
    }
    return true;
  }

  function setUsed(rect, value) {
    for (let r = rect.r1; r <= rect.r2; r += 1) {
      for (let c = rect.c1; c <= rect.c2; c += 1) {
        used[r][c] = value;
      }
    }
  }

  function backtrack(idx) {
    if (idx >= order.length) return true;
    const clueIndex = order[idx];
    const clue = cluesList[clueIndex];
    for (const rect of candidateSets[clueIndex]) {
      if (!canPlace(rect)) continue;
      setUsed(rect, true);
      solution.set(clue.id, rect);
      if (backtrack(idx + 1)) return true;
      solution.delete(clue.id);
      setUsed(rect, false);
    }
    return false;
  }

  return backtrack(0) ? solution : null;
}

function generatePuzzle(seedStr) {
  const baseSeed = hashString(seedStr);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const rng = createSeededRandom(baseSeed + attempt * 9973);
    const size = randInt(rng, SIZE_RANGE.min, SIZE_RANGE.max);
    const maxRects = Math.min(RECT_RANGE.max, Math.floor((size * size) / MIN_RECT_AREA));
    const minRects = Math.min(RECT_RANGE.min, maxRects);
    const targetRects = randInt(rng, minRects, Math.max(minRects, maxRects));
    const rects = generatePartition(size, targetRects, rng);
    if (!rects) continue;
    const cluesCandidate = buildClues(rects, rng);
    if (countSolutions(cluesCandidate, size, 2) !== 1) continue;
    return { size, clues: cluesCandidate };
  }
  const fallbackSize = SIZE_RANGE.min;
  const fallbackRect = { r1: 0, c1: 0, r2: fallbackSize - 1, c2: fallbackSize - 1 };
  return {
    size: fallbackSize,
    clues: buildClues(
      generatePartition(fallbackSize, RECT_RANGE.min, createSeededRandom(baseSeed + 1)) ?? [fallbackRect],
      createSeededRandom(baseSeed + 2)
    )
  };
}

function applyPuzzle(seedStr) {
  const puzzle = generatePuzzle(seedStr);
  gridSize = puzzle.size;
  clues = puzzle.clues;
  clueIds = new Set(clues.map(clue => clue.id));
  cellAssignments = Array.from({ length: gridSize }, () => Array(gridSize).fill(null));
  rectangles.clear();
  rectOverlays.forEach(overlay => overlay.remove());
  rectOverlays.clear();
  buildGrid();
}

function buildGrid() {
  if (!els.grid) return;
  els.grid.innerHTML = '';
  els.grid.style.setProperty('--grid-size', String(gridSize));
  cells = [];
  for (let r = 0; r < gridSize; r += 1) {
    for (let c = 0; c < gridSize; c += 1) {
      const clue = clues.find(cl => cl.r === r && cl.c === c);
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

function showMessage(text, { temporary = false } = {}) {
  if (!els.validationMessage || !els.validationMessageText) return;
  els.validationMessageText.textContent = text;
  els.validationMessage.classList.remove('hidden');
  if (messageTimeout) {
    window.clearTimeout(messageTimeout);
    messageTimeout = null;
  }
  if (temporary) {
    messageTimeout = window.setTimeout(() => {
      showMessage(helperText);
    }, 2200);
  }
}

function updateProgress(text, { temporary = false } = {}) {
  showMessage(text, { temporary });
}

function resetSolutionUI() {
  solutionShown = false;
  els.solutionActions?.classList.add('hidden');
  updateShowSolutionButton();
  els.pauseBtn?.classList.remove('hidden');
  els.resetBtn?.classList.remove('hidden');
}

function updateShowSolutionButton() {
  if (!els.showSolutionBtn) return;
  if (currentMode === 'practice' && !solutionShown && !isComplete) {
    els.showSolutionBtn.classList.remove('hidden');
  } else {
    els.showSolutionBtn.classList.add('hidden');
  }
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
  return clues.filter(cl => cl.r >= rect.r1 && cl.r <= rect.r2 && cl.c >= rect.c1 && cl.c <= rect.c2);
}

function clearRectangleFor(clueId) {
  const existing = rectangles.get(clueId);
  if (!existing) return;
  const overlay = rectOverlays.get(clueId);
  if (overlay) {
    overlay.remove();
    rectOverlays.delete(clueId);
  }
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

function createOverlay(clueId, rect) {
  const existing = rectOverlays.get(clueId);
  if (existing) existing.remove();
  if (!els.grid) return;
  const startCell = cellAt(rect.r1, rect.c1);
  const endCell = cellAt(rect.r2, rect.c2);
  if (!startCell || !endCell) return;
  const gridRect = els.grid.getBoundingClientRect();
  const startRect = startCell.getBoundingClientRect();
  const endRect = endCell.getBoundingClientRect();
  const left = startRect.left - gridRect.left;
  const top = startRect.top - gridRect.top;
  const right = endRect.right - gridRect.left;
  const bottom = endRect.bottom - gridRect.top;
  const overlay = document.createElement('div');
  overlay.className = 'rect-outline';
  overlay.dataset.clueId = clueId;
  overlay.style.left = `${left}px`;
  overlay.style.top = `${top}px`;
  overlay.style.width = `${Math.max(0, right - left)}px`;
  overlay.style.height = `${Math.max(0, bottom - top)}px`;
  els.grid.appendChild(overlay);
  rectOverlays.set(clueId, overlay);
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
  createOverlay(clueId, rect);
}

function updateCounts() {
  if (els.rectCount) els.rectCount.textContent = String(rectangles.size);
}

function checkCompletion() {
  if (rectangles.size !== clues.length) return false;
  for (let r = 0; r < gridSize; r += 1) {
    for (let c = 0; c < gridSize; c += 1) {
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
  } else if (rectangles.size === clues.length) {
    updateProgress('All squares must be filled in.', { temporary: true });
  }
}

function showSolution() {
  const solution = solvePuzzle(clues, gridSize);
  if (!solution) {
    updateProgress('Solution not available for this puzzle.', { temporary: true });
    return;
  }
  solutionShown = true;
  rectangles.clear();
  rectOverlays.forEach(overlay => overlay.remove());
  rectOverlays.clear();
  for (let r = 0; r < gridSize; r += 1) {
    for (let c = 0; c < gridSize; c += 1) {
      cellAssignments[r][c] = null;
    }
  }
  cells.forEach(cell => cell.classList.remove('assigned'));
  solution.forEach((rect, clueId) => assignRectangle(clueId, rect));
  updateCounts();
  isComplete = true;
  isPaused = true;
  timerStarted = true;
  completionMs = getElapsedMs();
  updateProgress('Solution revealed!', { temporary: true });
  els.showSolutionBtn?.classList.add('hidden');
  els.solutionActions?.classList.remove('hidden');
  els.pauseBtn?.classList.add('hidden');
  els.resetBtn?.classList.add('hidden');
  shell?.update();
}

function handlePointerDown(event) {
  if (isComplete) return;
  event.preventDefault();
  if (event.currentTarget && event.currentTarget.setPointerCapture) {
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  const target = event.target.closest('.cell') ?? document.elementFromPoint(event.clientX, event.clientY)?.closest('.cell');
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
  event.preventDefault();
  const target = event.target.closest('.cell') ?? document.elementFromPoint(event.clientX, event.clientY)?.closest('.cell');
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
  event.preventDefault();
  const target = event.target.closest('.cell') ?? document.elementFromPoint(event.clientX, event.clientY)?.closest('.cell');
  if (!target) {
    dragStart = null;
    clearSelection();
    return;
  }

  const end = { r: Number(target.dataset.r), c: Number(target.dataset.c) };
  const rect = rectFromPoints(dragStart, end);
  dragStart = null;
  clearSelection();

  if (rect.r1 === rect.r2 && rect.c1 === rect.c2) {
    const assigned = cellAssignments[rect.r1][rect.c1];
    if (assigned) {
      clearRectangleFor(assigned);
      updateCounts();
      updateProgress('Rectangle cleared.', { temporary: true });
      saveProgress();
      shell?.update();
      return;
    }
  }

  const clues = clueInsideRect(rect);
  if (clues.length !== 1) {
    updateProgress('Each rectangle must include exactly one clue.', { temporary: true });
    return;
  }
  const clue = clues[0];
  if (rectArea(rect) !== clue.area) {
    updateProgress(`That rectangle needs area ${clue.area}.`, { temporary: true });
    return;
  }

  for (let r = rect.r1; r <= rect.r2; r += 1) {
    for (let c = rect.c1; c <= rect.c2; c += 1) {
      const assigned = cellAssignments[r][c];
      if (assigned && assigned !== clue.id) {
        updateProgress('Rectangles cannot overlap.', { temporary: true });
        return;
      }
    }
  }

  assignRectangle(clue.id, rect);
  updateCounts();
  updateProgress('Rectangle placed.', { temporary: true });
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
  rectOverlays.forEach(overlay => overlay.remove());
  rectOverlays.clear();
  rectangles.clear();
  for (let r = 0; r < gridSize; r += 1) {
    for (let c = 0; c < gridSize; c += 1) {
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
  if (solutionShown) {
    solutionShown = false;
  }

  updateCounts();
  updateProgress(helperText);
  updateShowSolutionButton();
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
    if (data.signature && data.signature !== getPuzzleSignature()) return null;
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
    signature: getPuzzleSignature(),
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
  rectOverlays.forEach(overlay => overlay.remove());
  rectOverlays.clear();
  rectangles.clear();
  for (let r = 0; r < gridSize; r += 1) {
    for (let c = 0; c < gridSize; c += 1) {
      cellAssignments[r][c] = null;
    }
  }
  cells.forEach(cell => cell.classList.remove('assigned'));

  if (saved?.rectangles) {
    saved.rectangles.forEach(({ clueId, rect }) => {
      if (!clueId || !rect || !clueIds.has(clueId)) return;
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
    updateShowSolutionButton();
    shell?.update();
  }, 200);
}

function resetPracticePuzzle() {
  puzzleSeed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  puzzleId = getPuzzleIdForMode('practice');
  applyPuzzle(puzzleSeed);
  initState();
  resetPuzzle({ resetTimer: true });
  setDateLabel();
  resetSolutionUI();
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
  applyPuzzle(puzzleSeed);
  initState();
  updateCounts();
  updateProgress(helperText);
  setDateLabel();
  resetSolutionUI();
  shell?.update();
}

function initShell() {
  if (shell) return;

  shell = createShellController({
    gameId: 'shikaku',
    getMode: () => currentMode,
    getPuzzleId: () => puzzleId,
    getGridLabel: () => `${gridSize}x${gridSize} Rects`,
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
    onTryAgain: () => {
      resetPuzzle({ resetTimer: true });
      resetSolutionUI();
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
      gameName: 'Parcel',
      shareUrl: 'https://dailygrid.app/games/shikaku/',
      gridLabel: `${gridSize}x${gridSize} Parcel`
    }),
    getShareFile: () => buildShareImage(),
    getCompletionMs: () => completionMs,
    setCompletionMs: (ms) => {
      completionMs = ms;
    },
    isTimerRunning: () => timerStarted && !isPaused && !isComplete,
    shouldShowCompletionModal: () => !solutionShown,
    isSolutionShown: () => solutionShown,
    disableReplay: true,
    pauseOnHide: true
  });
}

async function buildShareImage() {
  const finalTime = completionMs ?? getElapsedMs();
  const puzzleDate = formatDateForShare(getPTDateYYYYMMDD());
  return buildShareCard({
    gameName: 'Parcel',
    logoPath: '/games/shikaku/shikaku-logo.jpg',
    accent: '#c9a36b',
    accentSoft: 'rgba(201, 163, 107, 0.2)',
    backgroundStart: '#1b140e',
    backgroundEnd: '#2a1b10',
    dateText: puzzleDate,
    timeText: formatTime(finalTime || 0),
    gridLabel: `Grid ${gridSize}x${gridSize}`,
    footerText: 'dailygrid.app/games/shikaku'
  });
}

function init() {
  puzzleSeed = getPTDateYYYYMMDD();
  puzzleId = getPuzzleIdForMode(currentMode);
  applyPuzzle(puzzleSeed);
  initState();
  updateCounts();
  updateProgress(helperText);
  setDateLabel();
  initShell();
  ensureTicker();
  resetSolutionUI();
  shell?.update();
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  els.grid?.addEventListener('pointerdown', handlePointerDown, { passive: false });
  els.grid?.addEventListener('pointermove', handlePointerMove, { passive: false });
  window.addEventListener('pointerup', handlePointerUp);
  els.showSolutionBtn?.addEventListener('click', () => showSolution());
  els.solutionRetryBtn?.addEventListener('click', () => {
    resetPuzzle({ resetTimer: true });
    resetSolutionUI();
  });
  els.solutionNextBtn?.addEventListener('click', () => {
    resetSolutionUI();
    resetPracticePuzzle();
  });
  window.startPracticeMode = () => switchMode('practice');
  window.startDailyMode = () => switchMode('daily');
  window.addEventListener('beforeunload', saveProgress);
});
