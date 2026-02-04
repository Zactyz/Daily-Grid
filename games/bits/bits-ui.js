import { getPTDateYYYYMMDD, formatTime, getOrCreateAnonId } from '../common/utils.js';
import { getUncompletedGames } from '../common/games.js';
import { buildShareText, shareWithFallback, showShareFeedback, formatDateForShare } from '../common/share.js';

const GRID_SIZE = 6;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

const solutionRows = [
  '010101',
  '101010',
  '011001',
  '100110',
  '001011',
  '110100'
];

const solutionGrid = solutionRows.map(row => row.split('').map(Number));

const clueCells = [
  { r: 0, c: 1, bit: 1 },
  { r: 1, c: 0, bit: 1 },
  { r: 1, c: 5, bit: 0 },
  { r: 2, c: 4, bit: 0 },
  { r: 3, c: 3, bit: 1 },
  { r: 4, c: 2, bit: 1 },
  { r: 5, c: 0, bit: 1 },
  { r: 5, c: 5, bit: 0 }
];

const adjacencyHints = [
  { r: 0, c: 0, dir: 'right', type: 'different' },
  { r: 0, c: 1, dir: 'down', type: 'different' },
  { r: 0, c: 2, dir: 'right', type: 'different' },
  { r: 0, c: 3, dir: 'right', type: 'different' },
  { r: 1, c: 0, dir: 'down', type: 'different' },
  { r: 1, c: 2, dir: 'down', type: 'equal' },
  { r: 2, c: 1, dir: 'right', type: 'equal' },
  { r: 2, c: 3, dir: 'right', type: 'equal' },
  { r: 2, c: 4, dir: 'down', type: 'different' },
  { r: 3, c: 1, dir: 'right', type: 'equal' },
  { r: 3, c: 2, dir: 'down', type: 'different' },
  { r: 4, c: 0, dir: 'right', type: 'equal' },
  { r: 4, c: 3, dir: 'down', type: 'different' },
  { r: 5, c: 1, dir: 'right', type: 'different' }
];

const descriptor = {
  puzzleId: getPTDateYYYYMMDD(),
  solution: solutionRows,
  clues: clueCells,
  adjacencies: adjacencyHints
};

const els = {
  timer: document.getElementById('timer'),
  progress: document.getElementById('progress-text'),
  nextGamePromo: document.getElementById('next-game-promo'),
  nextGameLogo: document.getElementById('next-game-logo'),
  nextGameText: document.getElementById('next-game-text'),
  nextGameLink: document.getElementById('next-game-link'),
  gridRoot: document.getElementById('bits-grid'),
  startOverlay: document.getElementById('start-overlay'),
  pauseOverlay: document.getElementById('pause-overlay'),
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
  puzzleDate: document.getElementById('puzzle-date')
};

const cells = [];
let timerInterval = null;
let timerRunning = false;
let timerPaused = false;
let startTimestamp = 0;
let baseElapsed = 0;
let isPrestart = true;
let isComplete = false;
let completionMs = null;
let hasSubmittedScore = false;
let lastRank = null;

function buildCells() {
  cells.length = 0;
  const clueMap = new Map();
  descriptor.clues.forEach((clue) => {
    clueMap.set(`${clue.r}-${clue.c}`, clue.bit);
  });

  for (let r = 0; r < GRID_SIZE; r += 1) {
    for (let c = 0; c < GRID_SIZE; c += 1) {
      const key = `${r}-${c}`;
      const isClue = clueMap.has(key);
      const value = isClue ? clueMap.get(key) : null;
      cells.push({
        r,
        c,
        value,
        isClue,
        element: null,
        hints: { right: null, down: null }
      });
    }
  }
  applyAdjacencyHints();
}

function applyAdjacencyHints() {
  if (!descriptor.adjacencies) return;
  cells.forEach(cell => {
    cell.hints.right = null;
    cell.hints.down = null;
  });
  descriptor.adjacencies.forEach(({ r, c, dir, type }) => {
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return;
    const cell = cells[r * GRID_SIZE + c];
    if (!cell) return;
    if (dir === 'right' && c < GRID_SIZE - 1) {
      cell.hints.right = type;
    } else if (dir === 'down' && r < GRID_SIZE - 1) {
      cell.hints.down = type;
    }
  });
}

function createGrid() {
  if (!els.gridRoot) return;
  els.gridRoot.innerHTML = '';
  cells.forEach((cell, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'grid-cell';
    btn.dataset.index = index.toString();
    btn.addEventListener('click', handleCellClick);
    cell.element = btn;
    updateCellAppearance(cell);
    els.gridRoot.appendChild(btn);
  });
}

function updateCellAppearance(cell) {
  if (!cell.element) return;
  const { element } = cell;
  if (cell.value === null) {
    element.textContent = '';
  } else {
    element.textContent = cell.value.toString();
  }
  element.classList.toggle('filled', cell.value !== null);
  element.classList.toggle('clue', cell.isClue);
  element.disabled = cell.isClue;
  const label = `Row ${cell.r + 1}, column ${cell.c + 1}${cell.isClue ? ' (clue)' : ''}${cell.value !== null ? `, ${cell.value}` : ''}`;
  element.setAttribute('aria-label', label);
  renderCellHints(cell);
}

function renderCellHints(cell) {
  if (!cell.element) return;
  cell.element.querySelectorAll('.adj-hint').forEach(el => el.remove());
  if (!cell.hints) return;
  Object.entries(cell.hints).forEach(([dir, type]) => {
    if (!type) return;
    const span = document.createElement('span');
    span.className = 'adj-hint adj-hint-' + dir + ' ' + type;
    span.textContent = type === 'equal' ? '=' : '×';
    cell.element.appendChild(span);
  });
}

function updateProgressText() {
  if (!els.progress) return;
  const filled = cells.filter(cell => cell.value !== null).length;
  els.progress.textContent = `Cells filled: ${filled} / ${TOTAL_CELLS}`;
}

function handleCellClick(event) {
  const index = Number(event.currentTarget.dataset.index);
  const cell = cells[index];
  if (!cell || cell.isClue || isComplete) return;
  if (isPrestart) {
    dismissStartOverlay();
    startTimer();
  } else if (!timerRunning) {
    startTimer();
  }
  if (timerPaused) {
    resumeTimer();
  }

  const nextValue = cell.value === null ? 0 : cell.value === 0 ? 1 : null;
  cell.value = nextValue;
  updateCellAppearance(cell);
  updateProgressText();

  if (cells.every(c => c.value !== null)) {
    validateSolution();
  }
}

function dismissStartOverlay() {
  isPrestart = false;
  els.startOverlay?.classList.add('hidden');
}

function startTimer() {
  if (timerRunning) return;
  timerRunning = true;
  timerPaused = false;
  startTimestamp = performance.now();
  timerInterval = window.setInterval(() => {
    updateTimerDisplay();
  }, 200);
}

function pauseTimer() {
  if (!timerRunning || timerPaused) return;
  timerPaused = true;
  baseElapsed += performance.now() - startTimestamp;
  clearInterval(timerInterval);
  timerInterval = null;
  updateTimerDisplay();
  els.pauseBtn.textContent = 'Resume';
  showPauseOverlay();
}

function resumeTimer() {
  if (!timerRunning || !timerPaused) return;
  timerPaused = false;
  startTimestamp = performance.now();
  timerInterval = window.setInterval(() => {
    updateTimerDisplay();
  }, 200);
  els.pauseBtn.textContent = 'Pause';
  hidePauseOverlay();
}

function freezeTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  timerInterval = null;
  timerRunning = false;
  timerPaused = false;
}

function stopTimer() {
  freezeTimer();
  baseElapsed = 0;
  updateTimerDisplay();
  els.pauseBtn.textContent = 'Pause';
}

function getElapsedMs() {
  if (!timerRunning) return baseElapsed;
  if (timerPaused) return baseElapsed;
  return baseElapsed + (performance.now() - startTimestamp);
}

function updateTimerDisplay() {
  if (!els.timer) return;
  els.timer.textContent = formatTime(getElapsedMs());
}

function validateSolution() {
  if (isComplete) return;
  const matches = cells.every((cell) => {
    const expected = solutionGrid[cell.r][cell.c];
    return cell.value === expected;
  });

  if (matches) {
    completePuzzle();
  }
}

function completePuzzle() {
  isComplete = true;
  completionMs = getElapsedMs();
  baseElapsed = completionMs;
  freezeTimer();
  updateTimerDisplay();
  els.pauseBtn.textContent = 'Pause';
  hidePauseOverlay();
  showCompletionModal();
  updateNextGamePromo();
  submitScore(completionMs);
  loadLeaderboard(els.completionLeaderboard);
}

async function submitScore(timeMs) {
  if (hasSubmittedScore) return;
  const payload = {
    puzzleId: descriptor.puzzleId,
    anonId: getOrCreateAnonId(),
    timeMs: Math.max(3000, Math.min(timeMs, 3600000)),
    hintsUsed: 0
  };
  try {
    const response = await fetch('/api/bits/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error('Failed to submit score');
    }
    const data = await response.json();
    hasSubmittedScore = true;
    const percentileValue = typeof data.percentile === 'number'
      ? Math.max(0, Math.min(100, data.percentile))
      : null;
    if (els.percentileMsg) {
      els.percentileMsg.textContent = percentileValue !== null
        ? `You ranked ${data.rank} / ${data.total} (top ${percentileValue}%)`
        : `You ranked ${data.rank} / ${data.total}`;
    }
    if (data.rank <= 10) {
      els.claimForm?.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Bits score submission failed', error);
    if (els.percentileMsg) {
      els.percentileMsg.textContent = 'Leaderboard temporarily unavailable';
    }
  }
}

async function loadLeaderboard(container) {
  if (!container) return;
  container.innerHTML = '<p class="progress-text">Loading leaderboard…</p>';
  try {
    const response = await fetch(`/api/bits/leaderboard?puzzleId=${descriptor.puzzleId}`);
    if (!response.ok) {
      throw new Error('Leaderboard request failed');
    }
    const data = await response.json();
    renderLeaderboard(container, data.top10 || []);
    if (container === els.leaderboardModalList && data.top10?.length === 0) {
      container.innerHTML = '<p class="progress-text">No scores yet — be the first.</p>';
    }
  } catch (error) {
    console.error('Leaderboard error', error);
    container.innerHTML = '<p class="progress-text">Unable to load leaderboard.</p>';
  }
}

function renderLeaderboard(container, entries) {
  if (!container) return;
  if (!entries || entries.length === 0) {
    container.innerHTML = '<p class="progress-text">No entries yet.</p>';
    return;
  }
  container.innerHTML = entries.map(entry => `
    <div class="leaderboard-row">
      <div style="display:flex;align-items:center;gap:0.5rem;">
        <span class="rank-circle">${entry.rank}</span>
        <span class="initials">${entry.initials || '---'}</span>
      </div>
      <span>${formatTime(entry.timeMs)}</span>
    </div>
  `).join('');
}

function showCompletionModal() {
  if (!els.completionModal) return;
  if (els.completionTime) {
    els.completionTime.textContent = `Time: ${formatTime(completionMs || 0)}`;
  }
  els.completionModal.classList.add('active');
}

function hideCompletionModal() {
  els.completionModal?.classList.remove('active');
}

function getPuzzleId() {
  return descriptor.puzzleId;
}

function hideNextGamePromo() {
  els.nextGamePromo?.classList.add('hidden');
}

function updateNextGamePromo() {
  if (!els.nextGamePromo) return;
  const puzzleId = getPuzzleId();
  const uncompleted = getUncompletedGames('bits', puzzleId);
  if (uncompleted.length === 0) {
    hideNextGamePromo();
    return;
  }
  const next = uncompleted[0];
  els.nextGameLogo.src = next.logo;
  els.nextGameLogo.alt = next.name;
  els.nextGameLink.href = next.path;
  els.nextGameText.textContent = 'Play today's ' + next.name;
  els.nextGamePromo.classList.remove('hidden');
}

function openLeaderboardModal() {
  if (!els.leaderboardModal) return;
  els.leaderboardModal.classList.add('active');
  loadLeaderboard(els.leaderboardModalList);
}

function closeLeaderboardModal() {
  els.leaderboardModal?.classList.remove('active');
}

function handleShare() {
  const shareText = buildShareText({
    gameName: 'Bits',
    puzzleLabel: formatDateForShare(descriptor.puzzleId),
    gridLabel: '6×6 Binary',
    timeText: formatTime(completionMs ?? getElapsedMs()),
    shareUrl: 'https://dailygrid.app/games/bits/'
  });

  shareWithFallback({
    shareText,
    shareTitle: 'Bits — Daily Grid',
    shareUrl: 'https://dailygrid.app/games/bits/',
    onCopy: () => showShareFeedback(els.shareBtn, 'Copied!'),
    onError: () => showShareFeedback(els.shareBtn, 'Share failed')
  }).catch((error) => {
    console.error('Share helper failed', error);
    showShareFeedback(els.shareBtn, 'Share failed');
  });
}

function claimInitials() {
  const initials = els.initialsInput?.value.toUpperCase().trim();
  if (!initials || initials.length > 3 || !/^[A-Z]{1,3}$/.test(initials)) {
    els.claimMessage.textContent = 'Enter 1–3 uppercase letters.';
    return;
  }
  els.claimMessage.textContent = '';
  fetch('/api/bits/claim-initials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      puzzleId: descriptor.puzzleId,
      anonId: getOrCreateAnonId(),
      initials
    })
  }).then(async (response) => {
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || 'Unable to claim initials');
    }
    els.claimMessage.textContent = 'Initials saved!';
    els.claimForm?.classList.add('hidden');
    loadLeaderboard(els.completionLeaderboard);
  }).catch((error) => {
    console.error('Claim initials failed', error);
    els.claimMessage.textContent = error.message || 'Claim failed';
  });
}

function showPauseOverlay() {
  els.pauseOverlay?.classList.remove('hidden');
}

function hidePauseOverlay() {
  els.pauseOverlay?.classList.add('hidden');
}

function togglePause() {
  if (!timerRunning) return;
  if (timerPaused) {
    resumeTimer();
  } else {
    pauseTimer();
  }
}

function resetGame() {
  cells.forEach(cell => {
    if (!cell.isClue) {
      cell.value = null;
      updateCellAppearance(cell);
    }
  });
  isComplete = false;
  completionMs = null;
  lastRank = null;
  hasSubmittedScore = false;
  els.claimForm?.classList.add('hidden');
  els.claimMessage.textContent = '';
  stopTimer();
  baseElapsed = 0;
  isPrestart = true;
  els.startOverlay?.classList.remove('hidden');
  hidePauseOverlay();
  hideCompletionModal();
  closeLeaderboardModal();
  updateTimerDisplay();
  updateProgressText();
  updateNextGamePromo();
}

function setDateLabel() {
  if (els.puzzleDate) {
    els.puzzleDate.textContent = descriptor.puzzleId;
  }
}

function attachListeners() {
  els.pauseBtn?.addEventListener('click', togglePause);
  els.resetBtn?.addEventListener('click', resetGame);
  els.leaderboardBtn?.addEventListener('click', openLeaderboardModal);
  els.closeCompletion?.addEventListener('click', hideCompletionModal);
  els.closeLeaderboard?.addEventListener('click', closeLeaderboardModal);
  els.pauseOverlay?.addEventListener('click', () => {
    if (timerPaused) {
      resumeTimer();
    }
  });
  els.startOverlay?.addEventListener('click', () => {
    if (isPrestart) {
      dismissStartOverlay();
    }
  });
  els.shareBtn?.addEventListener('click', handleShare);
  els.claimBtn?.addEventListener('click', claimInitials);
}

function initBits() {
  buildCells();
  createGrid();
  updateProgressText();
  setDateLabel();
  updateNextGamePromo();
  attachListeners();
}

document.addEventListener('DOMContentLoaded', initBits);
