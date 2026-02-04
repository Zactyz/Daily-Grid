import { getPTDateYYYYMMDD, formatTime, getOrCreateAnonId } from './shikaku-utils.js';
import { getUncompletedGames } from '../common/games.js';
import { buildShareText, shareWithFallback, showShareFeedback, formatDateForShare } from '../common/share.js';

const GRID_SIZE = 5;
const puzzleId = getPTDateYYYYMMDD();

const CLUES = [
  { id: 'A', r: 0, c: 1, area: 6 },
  { id: 'B', r: 1, c: 4, area: 4 },
  { id: 'C', r: 3, c: 0, area: 6 },
  { id: 'D', r: 2, c: 3, area: 6 },
  { id: 'E', r: 4, c: 3, area: 3 }
];

const els = {
  grid: document.getElementById('parcel-grid'),
  timer: document.getElementById('timer'),
  progress: document.getElementById('progress-text'),
  rectCount: document.getElementById('rect-count'),
  puzzleDate: document.getElementById('puzzle-date'),
  startOverlay: document.getElementById('start-overlay'),
  pauseOverlay: document.getElementById('pause-overlay'),
  startBtn: document.getElementById('start-btn'),
  resumeBtn: document.getElementById('resume-btn'),
  pauseBtn: document.getElementById('pause-btn'),
  resetBtn: document.getElementById('reset-btn'),
  leaderboardBtn: document.getElementById('leaderboard-btn'),
  completionModal: document.getElementById('completion-modal'),
  completionTime: document.getElementById('completion-time'),
  percentileMsg: document.getElementById('percentile-msg'),
  completionLeaderboard: document.getElementById('completion-leaderboard-list'),
  shareBtn: document.getElementById('share-btn'),
  closeCompletion: document.getElementById('close-modal-btn'),
  claimForm: document.getElementById('claim-initials-form'),
  initialsInput: document.getElementById('initials-input'),
  claimBtn: document.getElementById('claim-initials-btn'),
  claimMessage: document.getElementById('claim-message'),
  leaderboardModal: document.getElementById('leaderboard-modal'),
  leaderboardModalList: document.getElementById('leaderboard-modal-list'),
  closeLeaderboard: document.getElementById('close-leaderboard-btn'),
  nextGamePromo: document.getElementById('next-game-promo'),
  nextGameLogo: document.getElementById('next-game-logo'),
  nextGameText: document.getElementById('next-game-text'),
  nextGameLink: document.getElementById('next-game-link')
};

const cellAssignments = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
const rectangles = new Map();
let cells = [];
let dragStart = null;
let currentSelection = null;
let timerInterval = null;
let timerRunning = false;
let timerPaused = false;
let startTimestamp = 0;
let baseElapsed = 0;
let isPrestart = true;
let isComplete = false;
let completionMs = null;
let hasSubmittedScore = false;

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

function updateTimerDisplay(ms) {
  if (!els.timer) return;
  els.timer.textContent = formatTime(ms);
}

function startTimer() {
  if (timerRunning) return;
  timerRunning = true;
  timerPaused = false;
  startTimestamp = Date.now();
  timerInterval = window.setInterval(() => {
    if (!timerRunning || timerPaused || isComplete) return;
    const elapsed = baseElapsed + (Date.now() - startTimestamp);
    updateTimerDisplay(elapsed);
  }, 100);
}

function pauseTimer() {
  if (!timerRunning || timerPaused) return;
  baseElapsed += Date.now() - startTimestamp;
  timerPaused = true;
}

function resumeTimer() {
  if (!timerRunning || !timerPaused) return;
  timerPaused = false;
  startTimestamp = Date.now();
}

function resetTimer() {
  timerRunning = false;
  timerPaused = false;
  startTimestamp = 0;
  baseElapsed = 0;
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  updateTimerDisplay(0);
}

function setProgress(text) {
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
    completionMs = baseElapsed + (timerRunning ? Date.now() - startTimestamp : 0);
    completePuzzle();
  }
}

function handlePointerDown(event) {
  if (isComplete) return;
  const target = event.target.closest('.cell');
  if (!target) return;
  if (isPrestart) {
    isPrestart = false;
    els.startOverlay?.classList.add('hidden');
    startTimer();
  } else if (!timerRunning) {
    startTimer();
  }
  if (timerPaused) resumeTimer();

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
    setProgress('Each rectangle must include exactly one clue.');
    return;
  }
  const clue = clues[0];
  if (rectArea(rect) !== clue.area) {
    setProgress(`That rectangle needs area ${clue.area}.`);
    return;
  }

  for (let r = rect.r1; r <= rect.r2; r += 1) {
    for (let c = rect.c1; c <= rect.c2; c += 1) {
      const assigned = cellAssignments[r][c];
      if (assigned && assigned !== clue.id) {
        setProgress('Rectangles cannot overlap.');
        return;
      }
    }
  }

  assignRectangle(clue.id, rect);
  updateCounts();
  setProgress('Rectangle placed.');
  tryComplete();
}

async function loadLeaderboard(container) {
  if (!container) return;
  container.innerHTML = '<p class="text-center text-xs text-zinc-400 py-4">Loading leaderboard…</p>';
  try {
    const response = await fetch(`/api/shikaku/leaderboard?puzzleId=${puzzleId}`);
    if (!response.ok) throw new Error('Leaderboard failed');
    const data = await response.json();
    if (!data.top10 || data.top10.length === 0) {
      container.innerHTML = '<p class="text-center text-xs text-zinc-400 py-4">No scores yet — be the first!</p>';
      return;
    }
    container.innerHTML = data.top10.map((entry, idx) => `
      <div class="flex items-center justify-between py-1">
        <span>${idx + 1}. ${entry.initials || '???'}</span>
        <span>${formatTime(entry.timeMs)}</span>
      </div>
    `).join('');
  } catch (error) {
    container.innerHTML = '<p class="text-center text-xs text-zinc-400 py-4">Unable to load leaderboard.</p>';
  }
}

async function completePuzzle() {
  if (hasSubmittedScore) return;
  const anonId = getOrCreateAnonId();
  const timeMs = completionMs || 0;
  hasSubmittedScore = true;

  els.completionTime && (els.completionTime.textContent = formatTime(timeMs));
  els.completionModal?.classList.add('show');
  els.leaderboardBtn?.classList.remove('hidden');

  try {
    const response = await fetch('/api/shikaku/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ puzzleId, anonId, timeMs, hintsUsed: 0 })
    });
    const data = await response.json();
    if (data.success) {
      els.percentileMsg && (els.percentileMsg.textContent = `Rank #${data.rank} • Top ${data.percentile}%`);
      if (data.rank <= 10) {
        els.claimForm?.classList.remove('hidden');
      }
    }
  } catch (error) {
    console.warn('Score submit failed', error);
  }

  try {
    localStorage.setItem(`dailygrid_shikaku_submitted_${puzzleId}`, 'true');
  } catch (error) {
    console.warn('Failed to store completion flag', error);
  }

  await loadLeaderboard(els.completionLeaderboard);
  updateNextGamePromo();
}

function updateNextGamePromo() {
  if (!els.nextGamePromo) return;
  const next = getUncompletedGames('shikaku', puzzleId)[0];
  if (!next) {
    els.nextGamePromo.classList.add('hidden');
    return;
  }
  els.nextGameLogo && (els.nextGameLogo.src = next.logo);
  els.nextGameLogo && (els.nextGameLogo.alt = next.name);
  els.nextGameText && (els.nextGameText.textContent = next.name);
  if (els.nextGameLink) {
    els.nextGameLink.href = next.path;
  }
  els.nextGamePromo.classList.remove('hidden');
}

function handleShare() {
  const shareText = buildShareText({
    gameName: 'Parcel',
    puzzleLabel: formatDateForShare(puzzleId),
    gridLabel: 'Parcel',
    timeText: formatTime(completionMs || 0),
    shareUrl: window.location.href
  });
  shareWithFallback({
    shareText,
    shareTitle: 'Parcel by Daily Grid',
    shareUrl: window.location.href,
    onCopy: () => showShareFeedback(els.shareBtn, 'Copied'),
    onError: () => showShareFeedback(els.shareBtn, 'Failed')
  });
}

async function submitInitials(event) {
  event.preventDefault();
  const initials = els.initialsInput?.value.trim().toUpperCase();
  if (!initials || initials.length > 3) {
    els.claimMessage && (els.claimMessage.textContent = 'Enter 1–3 letters.');
    return;
  }
  try {
    const response = await fetch('/api/shikaku/claim-initials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ puzzleId, anonId: getOrCreateAnonId(), initials })
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error('Claim failed');
    els.claimMessage && (els.claimMessage.textContent = 'Claim saved!');
    els.claimForm?.classList.add('hidden');
  } catch (error) {
    els.claimMessage && (els.claimMessage.textContent = 'Unable to save.');
  }
}

function bindEvents() {
  els.grid?.addEventListener('pointerdown', handlePointerDown);
  els.grid?.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp);

  els.startBtn?.addEventListener('click', () => {
    isPrestart = false;
    els.startOverlay?.classList.add('hidden');
    startTimer();
  });
  els.resumeBtn?.addEventListener('click', () => {
    els.pauseOverlay?.classList.add('hidden');
    resumeTimer();
  });
  els.pauseBtn?.addEventListener('click', () => {
    pauseTimer();
    els.pauseOverlay?.classList.remove('hidden');
  });
  els.resetBtn?.addEventListener('click', () => {
    rectangles.clear();
    for (let r = 0; r < GRID_SIZE; r += 1) {
      for (let c = 0; c < GRID_SIZE; c += 1) {
        cellAssignments[r][c] = null;
      }
    }
    cells.forEach(cell => cell.classList.remove('assigned'));
    isComplete = false;
    completionMs = null;
    hasSubmittedScore = false;
    isPrestart = true;
    els.startOverlay?.classList.remove('hidden');
    els.pauseOverlay?.classList.add('hidden');
    resetTimer();
    updateCounts();
    setProgress('Drag to mark a rectangle.');
  });
  els.shareBtn?.addEventListener('click', handleShare);
  els.closeCompletion?.addEventListener('click', () => els.completionModal?.classList.remove('show'));
  els.leaderboardBtn?.addEventListener('click', () => {
    els.leaderboardModal?.classList.add('show');
    loadLeaderboard(els.leaderboardModalList);
  });
  els.closeLeaderboard?.addEventListener('click', () => els.leaderboardModal?.classList.remove('show'));
  els.claimForm?.addEventListener('submit', submitInitials);
}

function init() {
  if (els.puzzleDate) els.puzzleDate.textContent = puzzleId;
  buildGrid();
  updateTimerDisplay(0);
  updateCounts();
  setProgress('Drag to mark a rectangle.');
  bindEvents();
}

init();
