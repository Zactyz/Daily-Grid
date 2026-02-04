import { LatticeEngine } from './lattice-engine.js';
import { getPTDateYYYYMMDD, parseCsv, getOrCreateAnonId, formatTime } from './lattice-utils.js';

import { getUncompletedGames as getCrossGamePromo } from '../common/games.js';
import { createShellController } from '../common/shell-controller.js';
import { formatDateForShare } from '../common/share.js';
import { buildShareCard } from '../common/share-card.js';

const els = {
  // header
  timer: document.getElementById('timer'),
  gridSize: document.getElementById('grid-size'),
  dailyBadge: document.getElementById('daily-badge'),
  practiceBadge: document.getElementById('practice-badge'),

  // board
  board: document.getElementById('board'),
  clues: document.getElementById('clues'),
  cluesPanel: document.getElementById('clues-panel'),

  // start overlay
  startOverlay: document.getElementById('start-overlay'),

  // controls
  leaderboardBtn: document.getElementById('leaderboard-btn'),
  pauseBtn: document.getElementById('pause-btn'),
  resetBtn: document.getElementById('reset-btn'),
  exitReplayBtn: document.getElementById('exit-replay-btn'),
  practiceModeBtn: document.getElementById('practice-mode-btn'),
  backToDailyBtn: document.getElementById('back-to-daily-btn'),

  // overlays
  pauseOverlay: document.getElementById('pause-overlay'),
  gameContainer: document.getElementById('game-container'),
  undoBtn: document.getElementById('undo-btn'),

  // modal
  completionModal: document.getElementById('completion-modal'),
  modalTitle: document.getElementById('modal-title'),
  modalSubtitle: document.getElementById('modal-subtitle'),
  finalTime: document.getElementById('final-time'),
  percentileMsg: document.getElementById('percentile-msg'),
  closeModalBtn: document.getElementById('close-modal-btn'),
  shareBtn: document.getElementById('share-btn'),
  practiceInfiniteBtn: document.getElementById('practice-infinite-btn'),
  resetModal: document.getElementById('reset-modal'),
  confirmResetBtn: document.getElementById('confirm-reset-btn'),
  cancelResetBtn: document.getElementById('cancel-reset-btn'),
  exitReplayModal: document.getElementById('exit-replay-modal'),
  confirmExitReplayBtn: document.getElementById('confirm-exit-replay-btn'),
  cancelExitReplayBtn: document.getElementById('cancel-exit-replay-btn'),

  // practice complete actions (modal)
  practiceCompleteActions: document.getElementById('practice-complete-actions'),
  tryAgainBtn: document.getElementById('try-again-btn'),
  nextLevelBtn: document.getElementById('next-level-btn'),
  backToDailyCompleteBtn: document.getElementById('back-to-daily-complete-btn'),

  claimInitialsForm: document.getElementById('claim-initials-form'),
  initialsInput: document.getElementById('initials-input'),

  nextGamePromo: document.getElementById('next-game-promo'),
  nextGameLink: document.getElementById('next-game-link'),
  nextGameLogo: document.getElementById('next-game-logo'),
  nextGameText: document.getElementById('next-game-text'),

  leaderboardTitle: document.getElementById('leaderboard-title'),
  leaderboardList: document.getElementById('leaderboard-list'),

  // Practice mode: show solution
  showSolutionBtn: document.getElementById('show-solution-btn'),
  solutionActions: document.getElementById('solution-actions'),
  solutionRetryBtn: document.getElementById('solution-retry-btn'),
  solutionNextBtn: document.getElementById('solution-next-btn')
};

let engine = null;
let puzzle = null;
let mode = 'daily'; // 'daily' | 'practice'
let shell = null;

function getUncompletedGames(puzzleId) {
  return getCrossGamePromo('lattice', puzzleId);
}

let startedAt = null;
let timerInt = null;
let timerStarted = false;
let isPaused = false;
let hasSolved = false;
let isPrestart = true;
let completionMs = null;
let isInReplayMode = loadReplayMode();
let solutionShown = false;
let pausedElapsedMs = null;

// state[cat][row][col] => 0 blank, 1 X, 2 ✓
let state = null;
let manualX = null;
let autoX = null;

let undoStack = [];
const UNDO_LIMIT = 200;

const STORAGE_PREFIX = 'dailygrid_lattice_progress_';
let saveThrottleMs = 2500;
let lastSaveAt = 0;

function replayKeyForPuzzleId(puzzleId) {
  return `dailygrid_lattice_replay_${puzzleId}`;
}

function loadReplayMode() {
  const puzzleId = getPTDateYYYYMMDD();
  try {
    return localStorage.getItem(replayKeyForPuzzleId(puzzleId)) === 'true';
  } catch {
    return false;
  }
}

function saveReplayMode(enabled) {
  if (!puzzle) return;
  try {
    if (enabled) localStorage.setItem(replayKeyForPuzzleId(puzzle.puzzleId), 'true');
    else localStorage.removeItem(replayKeyForPuzzleId(puzzle.puzzleId));
  } catch {}
}

function startTimer({ resumeElapsedMs = 0 } = {}) {
  timerStarted = true;
  isPaused = false;
  pausedElapsedMs = null;
  startedAt = performance.now() - resumeElapsedMs;
  clearInterval(timerInt);
  timerInt = setInterval(() => {
    const ms = performance.now() - startedAt;
    els.timer.textContent = formatTime(ms);
  }, 100);
}

function stopTimer() {
  clearInterval(timerInt);
  timerInt = null;
}

function getElapsedMs() {
  if (startedAt == null) return 0;
  if (isPaused && pausedElapsedMs != null) return pausedElapsedMs;
  return Math.max(0, performance.now() - startedAt);
}

function setPrestart(show) {
  isPrestart = show;

  // Keep board visible but block interaction with start overlay
  if (els.startOverlay) {
    if (show) els.startOverlay.classList.remove('hidden');
    else els.startOverlay.classList.add('hidden');
  }

  // Dim/blur board under overlay
  if (els.gameContainer) {
    if (show) els.gameContainer.classList.add('prestart');
    else els.gameContainer.classList.remove('prestart');
  }

  // Hide clues until start (match vibe of other games)
  if (els.cluesPanel) {
    if (show) els.cluesPanel.classList.add('hidden');
    else els.cluesPanel.classList.remove('hidden');
  }

  // controls disabled
  for (const b of [els.pauseBtn, els.resetBtn, els.leaderboardBtn]) {
    if (!b) continue;
    b.disabled = show;
    b.style.opacity = show ? '0.45' : '';
    b.style.pointerEvents = show ? 'none' : '';
  }
}

function ensureTimerStarted() {
  if (timerStarted) return;
  if (isPrestart) return;
  startTimer({ resumeElapsedMs: 0 });
  saveProgress(true);
}

function setMode(nextMode) {
  mode = nextMode;
  if (mode === 'daily') {
    els.showSolutionBtn?.classList.add('hidden');
    els.solutionActions?.classList.add('hidden');
  } else {
    els.showSolutionBtn?.classList.remove('hidden');
    els.solutionActions?.classList.add('hidden');
  }
}

function initState() {
  const size = puzzle.size;
  state = {};
  manualX = {};
  autoX = {};
  for (const cat of puzzle.categories) {
    if (cat.category === puzzle.identityCategory) continue;
    state[cat.category] = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
    manualX[cat.category] = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
    autoX[cat.category] = Array.from({ length: size }, () => Array.from({ length: size }, () => new Set()));
  }
  updateExitReplayButton();
}

function labelCategory(cat) {
  if (cat === 'name') return 'Name';
  if (cat === 'job') return 'Job';
  if (cat === 'country') return 'Country';
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

function cellText(v) {
  if (v === 1) return '×';
  if (v === 2) return '✓';
  return '';
}

function cellClass(v) {
  const base = 'grid-cell mono';
  if (v === 1) return `${base} state-no`;
  if (v === 2) return `${base} state-yes`;
  return `${base} state-blank`;
}

function anchorId(catKey, row, col) {
  return `${catKey}:${row}:${col}`;
}

function findRowYes(catKey, row) {
  const size = puzzle.size;
  let yes = -1;
  for (let j = 0; j < size; j++) {
    if (state[catKey][row][j] === 2) {
      if (yes !== -1) return { kind: 'conflict' };
      yes = j;
    }
  }
  return yes === -1 ? { kind: 'none' } : { kind: 'one', col: yes };
}

function findColYes(catKey, col) {
  const size = puzzle.size;
  let yes = -1;
  for (let i = 0; i < size; i++) {
    if (state[catKey][i][col] === 2) {
      if (yes !== -1) return { kind: 'conflict' };
      yes = i;
    }
  }
  return yes === -1 ? { kind: 'none' } : { kind: 'one', row: yes };
}

function applyAutoX(catKey, row, col, anchor, desiredX) {
  const set = autoX[catKey][row][col];
  if (desiredX) set.add(anchor);
  else set.delete(anchor);

  const shouldBeX = set.size > 0;
  const isManual = manualX[catKey][row][col];

  if (state[catKey][row][col] === 2) return;

  if (shouldBeX || isManual) state[catKey][row][col] = 1;
  else state[catKey][row][col] = 0;
}

function clearYes(catKey, row, col) {
  if (state[catKey][row][col] !== 2) return;

  const a = anchorId(catKey, row, col);
  const size = puzzle.size;

  for (let j = 0; j < size; j++) {
    if (j === col) continue;
    applyAutoX(catKey, row, j, a, false);
  }
  for (let i = 0; i < size; i++) {
    if (i === row) continue;
    applyAutoX(catKey, i, col, a, false);
  }

  state[catKey][row][col] = 0;
}

function setYes(catKey, row, col) {
  const size = puzzle.size;

  const existingRow = findRowYes(catKey, row);
  if (existingRow.kind === 'one' && existingRow.col !== col) clearYes(catKey, row, existingRow.col);

  const existingCol = findColYes(catKey, col);
  if (existingCol.kind === 'one' && existingCol.row !== row) clearYes(catKey, existingCol.row, col);

  state[catKey][row][col] = 2;
  manualX[catKey][row][col] = false;
  autoX[catKey][row][col].clear();

  const a = anchorId(catKey, row, col);

  for (let j = 0; j < size; j++) {
    if (j === col) continue;
    applyAutoX(catKey, row, j, a, true);
  }
  for (let i = 0; i < size; i++) {
    if (i === row) continue;
    applyAutoX(catKey, i, col, a, true);
  }
}

function toggleCell(catKey, row, col) {
  const cur = state[catKey][row][col];
  if (cur === 0) {
    state[catKey][row][col] = 1;
    manualX[catKey][row][col] = true;
    return;
  }
  if (cur === 1) {
    setYes(catKey, row, col);
    return;
  }
  if (cur === 2) {
    clearYes(catKey, row, col);
    return;
  }
}

function serializeAutoXSets() {
  const out = {};
  for (const catKey of Object.keys(autoX)) {
    out[catKey] = autoX[catKey].map(row => row.map(set => Array.from(set)));
  }
  return out;
}

function deserializeAutoXSets(raw) {
  const out = {};
  for (const catKey of Object.keys(raw || {})) {
    out[catKey] = raw[catKey].map(row => row.map(arr => new Set(arr || [])));
  }
  return out;
}

function clonePlain(obj) {
  // structuredClone is ideal but not universal in older runtimes.
  try { return structuredClone(obj); } catch {}
  return JSON.parse(JSON.stringify(obj));
}

function snapshotForUndo() {
  return {
    state: clonePlain(state),
    manualX: clonePlain(manualX),
    autoX: serializeAutoXSets()
  };
}

function restoreFromUndo(snap) {
  state = snap.state;
  manualX = snap.manualX;
  autoX = deserializeAutoXSets(snap.autoX);
}

function pushUndo() {
  undoStack.push(snapshotForUndo());
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  updateUndoButton();
}

function updateUndoButton() {
  if (!els.undoBtn) return;
  const disabled = isPrestart || isPaused || hasSolved || undoStack.length === 0;
  els.undoBtn.disabled = disabled;
  els.undoBtn.style.opacity = disabled ? '0.45' : '';
  els.undoBtn.style.pointerEvents = disabled ? 'none' : '';
}

function updateLeaderboardButton() {
  // Match Snake/Pathways: leaderboard button only appears once completed (daily mode only)
  if (!els.leaderboardBtn) return;

  if (mode === 'daily' && hasSolved && !isInReplayMode) {
    els.leaderboardBtn.classList.remove('hidden');
    els.pauseBtn?.classList.add('hidden');
  } else {
    els.leaderboardBtn.classList.add('hidden');
    // In daily unsolved, pause button should be visible
    if (mode === 'daily') els.pauseBtn?.classList.remove('hidden');
  }
}

function storageKeyForPuzzleId(puzzleId) {
  return `${STORAGE_PREFIX}${puzzleId}`;
}

function saveProgress(force = false) {
  if (!puzzle) return;
  if (mode !== 'daily') return;
  if (isInReplayMode) return;

  const now = Date.now();
  if (!force && now - lastSaveAt < saveThrottleMs) return;
  lastSaveAt = now;

  const payload = {
    puzzleId: puzzle.puzzleId,
    timerStarted,
    startedAtEpochMs: timerStarted ? (Date.now() - getElapsedMs()) : null,
    elapsedMs: getElapsedMs(),
    isPaused,
    state,
    manualX,
    autoX: serializeAutoXSets(),
    hasSolved,
    completionMs
  };

  try {
    localStorage.setItem(storageKeyForPuzzleId(puzzle.puzzleId), JSON.stringify(payload));
  } catch (e) {
    console.warn('Failed to save lattice progress', e);
  }
}

function loadProgressForPuzzleId(puzzleId) {
  try {
    const raw = localStorage.getItem(storageKeyForPuzzleId(puzzleId));
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (payload?.puzzleId !== puzzleId) return null;
    return payload;
  } catch {
    return null;
  }
}

function evaluateClue(idx) {
  const clue = puzzle.clues[idx];
  const size = puzzle.size;

  const rowYes = (catKey, row) => {
    let yes = -1;
    for (let j = 0; j < size; j++) {
      if (state[catKey][row][j] === 2) {
        if (yes !== -1) return { kind: 'conflict' };
        yes = j;
      }
    }
    return yes === -1 ? { kind: 'none' } : { kind: 'one', col: yes };
  };

  if (clue.kind === 'idEq') {
    const cell = state[clue.category][clue.idIndex][clue.valueIndex];
    const ry = rowYes(clue.category, clue.idIndex);
    if (cell === 2) return 'satisfied';
    if (cell === 1) return 'conflict';
    if (ry.kind === 'one' && ry.col !== clue.valueIndex) return 'conflict';
    if (ry.kind === 'conflict') return 'conflict';
    return 'neutral';
  }

  if (clue.kind === 'idNeq') {
    const cell = state[clue.category][clue.idIndex][clue.valueIndex];
    const ry = rowYes(clue.category, clue.idIndex);
    if (cell === 2) return 'conflict';
    if (cell === 1) return 'satisfied';
    if (ry.kind === 'one' && ry.col !== clue.valueIndex) return 'satisfied';
    if (ry.kind === 'conflict') return 'conflict';
    return 'neutral';
  }

  if (clue.kind === 'link') {
    const aCat = clue.a.category;
    const bCat = clue.b.category;
    const aVal = clue.a.valueIndex;
    const bVal = clue.b.valueIndex;

    let aRow = -1;
    for (let i = 0; i < size; i++) {
      if (state[aCat][i][aVal] === 2) { aRow = i; break; }
    }

    let bRow = -1;
    for (let i = 0; i < size; i++) {
      if (state[bCat][i][bVal] === 2) { bRow = i; break; }
    }

    if (aRow !== -1) {
      const bCell = state[bCat][aRow][bVal];
      const bAssigned = rowYes(bCat, aRow);
      if (bCell === 2) return 'satisfied';
      if (bCell === 1) return 'conflict';
      if (bAssigned.kind === 'one' && bAssigned.col !== bVal) return 'conflict';
      if (bAssigned.kind === 'conflict') return 'conflict';
      return 'neutral';
    }

    if (bRow !== -1) {
      const aCell = state[aCat][bRow][aVal];
      const aAssigned = rowYes(aCat, bRow);
      if (aCell === 2) return 'satisfied';
      if (aCell === 1) return 'conflict';
      if (aAssigned.kind === 'one' && aAssigned.col !== aVal) return 'conflict';
      if (aAssigned.kind === 'conflict') return 'conflict';
      return 'neutral';
    }

    return 'neutral';
  }

  return 'neutral';
}

function updateClueStyles() {
  const items = els.clues?.querySelectorAll('li[data-clue-idx]') || [];
  items.forEach((li) => {
    const idx = Number(li.dataset.clueIdx);
    const status = evaluateClue(idx);
    li.classList.remove('clue-neutral', 'clue-satisfied', 'clue-conflict');
    li.classList.add(`clue-${status}`);
  });
}

function checkSolved() {
  const size = puzzle.size;
  const identityCategory = puzzle.identityCategory;

  for (const cat of puzzle.categories) {
    if (cat.category === identityCategory) continue;
    const matrix = state[cat.category];
    for (let i = 0; i < size; i++) {
      let yes = -1;
      for (let j = 0; j < size; j++) {
        if (matrix[i][j] === 2) {
          if (yes !== -1) return { ok: false };
          yes = j;
        }
      }
      if (yes === -1) return { ok: false };
      const correct = puzzle.solution[cat.category][i];
      if (yes !== correct) return { ok: false };
    }
  }
  return { ok: true };
}

function showCompletionModal() {
  els.completionModal?.classList.remove('hidden');
}

function hideCompletionModal() {
  els.completionModal?.classList.add('hidden');
}

function showResetModal() {
  els.resetModal?.classList.remove('hidden');
}

function hideResetModal() {
  els.resetModal?.classList.add('hidden');
}

function showExitReplayModal() {
  els.exitReplayModal?.classList.remove('hidden');
}

function hideExitReplayModal() {
  els.exitReplayModal?.classList.add('hidden');
}

function updateExitReplayButton() {
  if (!els.exitReplayBtn) return;
  if (mode === 'daily' && isInReplayMode && !hasSolved) {
    els.exitReplayBtn.classList.remove('hidden');
  } else {
    els.exitReplayBtn.classList.add('hidden');
  }
}

function showPauseOverlay(show) {
  if (!els.pauseOverlay) return;
  if (show) els.pauseOverlay.classList.remove('hidden');
  else els.pauseOverlay.classList.add('hidden');
}

function pause() {
  if (isPaused) return;
  if (!timerStarted) return;
  isPaused = true;
  pausedElapsedMs = getElapsedMs();
  stopTimer();
  showPauseOverlay(true);
  saveProgress(true);
  shell?.update();
}

function resume() {
  if (!isPaused) return;
  const resumeMs = pausedElapsedMs ?? getElapsedMs();
  isPaused = false;
  pausedElapsedMs = null;
  showPauseOverlay(false);
  startTimer({ resumeElapsedMs: resumeMs });
  shell?.update();
}

function showNextGamePromo() {
  if (!els.nextGamePromo || !els.nextGameLink || !els.nextGameLogo || !els.nextGameText) return;

  // Consistent with Snake/Pathways: only show cross-game promo for today's daily puzzle.
  // (Practice mode completion shouldn't nag about streak completion.)
  if (mode !== 'daily' || isInReplayMode) {
    els.nextGamePromo.classList.add('hidden');
    return;
  }

  const puzzleId = puzzle?.puzzleId || getPTDateYYYYMMDD();
  const uncompleted = getUncompletedGames(puzzleId);

  if (uncompleted.length === 0) {
    els.nextGamePromo.classList.add('hidden');
    return;
  }

  const nextGame = uncompleted[0];
  els.nextGameLink.href = nextGame.path;
  // Match styling used in other games
  els.nextGameLink.className = `block w-full py-3 px-4 rounded-xl text-center transition-all ${nextGame.theme.bg} border ${nextGame.theme.border} hover:${nextGame.theme.bg.replace('/10', '/20')}`;
  els.nextGameLogo.src = nextGame.logo;
  els.nextGameLogo.alt = nextGame.name;
  els.nextGameText.textContent = `Play today's ${nextGame.name}`;
  els.nextGameText.className = `font-semibold text-sm ${nextGame.theme.text}`;

  els.nextGamePromo.classList.remove('hidden');
}

function markSubmitted() {
  if (mode !== 'daily') return;
  try {
    localStorage.setItem(`dailygrid_lattice_submitted_${puzzle.puzzleId}`, 'true');
  } catch {}
}

function loadCompletedState() {
  if (!puzzle) return false;
  const saved = loadProgressForPuzzleId(puzzle.puzzleId);
  if (!saved || !saved.hasSolved) return false;

  state = saved.state || state;
  manualX = saved.manualX || manualX;
  autoX = deserializeAutoXSets(saved.autoX || serializeAutoXSets());
  solutionShown = false;
  hasSolved = true;
  timerStarted = false;
  completionMs = saved.completionMs ?? completionMs ?? 0;

  render();
  updateClueStyles();
  updateUndoButton();
  updateLeaderboardButton();
  updateExitReplayButton();
  showPauseOverlay(false);
  setPrestart(false);
  stopTimer();
  els.timer.textContent = formatTime(completionMs || 0);
  return true;
}

function startReplay() {
  if (mode !== 'daily') return;
  isInReplayMode = true;
  solutionShown = false;
  hasSolved = false;
  completionMs = null;
  initState();
  undoStack = [];
  render();
  updateClueStyles();
  updateUndoButton();
  updateLeaderboardButton();
  updateExitReplayButton();
  setPrestart(false);
  startTimer({ resumeElapsedMs: 0 });
}

function hasSubmittedToday() {
  if (mode !== 'daily') return false;
  try {
    return localStorage.getItem(`dailygrid_lattice_submitted_${puzzle.puzzleId}`) === 'true';
  } catch {
    return false;
  }
}

async function submitScore(timeMs) {
  const anonId = getOrCreateAnonId();
  const puzzleId = puzzle.puzzleId;

  const response = await fetch('/api/lattice/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ puzzleId, anonId, timeMs: Math.floor(timeMs), hintsUsed: 0 })
  });

  if (!response.ok) throw new Error('Failed to submit score');
  return response.json();
}

async function loadLeaderboardIntoModal() {
  if (!els.leaderboardList) return;
  const puzzleId = puzzle.puzzleId;
  els.leaderboardList.innerHTML = '<p class="text-zinc-500 text-center py-6 text-xs">Loading...</p>';

  const response = await fetch(`/api/lattice/leaderboard?puzzleId=${encodeURIComponent(puzzleId)}`);
  if (!response.ok) {
    els.leaderboardList.innerHTML = '<p class="text-zinc-500 text-center py-6 text-xs">Leaderboard unavailable</p>';
    return;
  }

  const data = await response.json();

  if (!data?.top10?.length) {
    els.leaderboardList.innerHTML = '<p class="text-zinc-500 text-center py-6 text-xs">No scores yet - be the first!</p>';
    return;
  }

  els.leaderboardList.innerHTML = data.top10.map((entry, idx) => `
    <div class="leaderboard-row flex items-center justify-between px-3 py-2.5 ${idx < data.top10.length - 1 ? 'border-b border-white/5' : ''}">
      <div class="flex items-center gap-3">
        <span class="w-6 h-6 rounded-md ${entry.rank <= 3 ? 'bg-white/10 text-zinc-200' : 'bg-zinc-700/50 text-zinc-500'} text-xs font-bold flex items-center justify-center">${entry.rank}</span>
        <span class="font-mono text-sm tracking-wider ${entry.initials ? 'text-zinc-300' : 'text-zinc-600'}">${entry.initials || '---'}</span>
      </div>
      <span class="font-mono text-sm text-zinc-400">${formatTime(entry.timeMs)}</span>
    </div>
  `).join('');
}

async function claimInitials(initials) {
  const anonId = getOrCreateAnonId();
  const puzzleId = puzzle.puzzleId;

  const response = await fetch('/api/lattice/claim-initials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ puzzleId, anonId, initials })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to claim initials');
  }
}

function showSolvedModal({ timeMs, rankText, showInitials }) {
  els.finalTime.textContent = formatTime(timeMs);
  if (els.percentileMsg) els.percentileMsg.textContent = rankText || '';

  // Reset modal sections to match Snake/Pathways behavior
  // Daily: show leaderboard area + share/practice buttons
  // Practice: hide leaderboard + show practice completion actions
  if (mode === 'daily') {
    els.practiceCompleteActions?.classList.add('hidden');
    els.practiceCompleteActions?.classList.remove('flex');

    els.shareBtn?.classList.remove('hidden');
    els.practiceInfiniteBtn?.classList.remove('hidden');
    els.closeModalBtn?.classList.remove('hidden');

    // Leaderboard section shown in daily modal (content may still be loading)
    els.leaderboardTitle?.classList.remove('hidden');
    els.leaderboardList?.classList.remove('hidden');

    if (els.claimInitialsForm) {
      if (showInitials) els.claimInitialsForm.classList.remove('hidden');
      else els.claimInitialsForm.classList.add('hidden');
    }
  } else {
    // Practice mode
    els.shareBtn?.classList.add('hidden');
    els.practiceInfiniteBtn?.classList.add('hidden');
    els.closeModalBtn?.classList.remove('hidden');

    els.claimInitialsForm?.classList.add('hidden');
    els.nextGamePromo?.classList.add('hidden');
    els.leaderboardTitle?.classList.add('hidden');
    els.leaderboardList?.classList.add('hidden');

    els.practiceCompleteActions?.classList.remove('hidden');
    els.practiceCompleteActions?.classList.add('flex');
  }

  showCompletionModal();
}

async function handleSolved() {
  const timeMs = getElapsedMs();
  stopTimer();
  timerStarted = false;

  if (isInReplayMode) {
    isInReplayMode = false;
    saveReplayMode(false);
    loadCompletedState();
    return;
  }

  completionMs = Math.floor(timeMs);
  if (els.timer) els.timer.textContent = formatTime(completionMs || 0);
  shell?.update();
  saveProgress(true);
}

function showSolution() {
  if (mode !== 'practice') return;
  if (!puzzle) return;

  // If user hasn't started yet, begin so they can see the board unblurred.
  if (isPrestart) setPrestart(false);

  // Stop timer (practice only)
  stopTimer();
  timerStarted = true;
  isPaused = false;
  showPauseOverlay(false);

  // Fill state with the true solution
  const size = puzzle.size;
  const identityCategory = puzzle.identityCategory;

  // Clear undo/history and any derived state
  undoStack = [];

  for (const cat of puzzle.categories) {
    if (cat.category === identityCategory) continue;

    // reset manual/autofill state
    manualX[cat.category] = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
    autoX[cat.category] = Array.from({ length: size }, () => Array.from({ length: size }, () => new Set()));

    for (let i = 0; i < size; i++) {
      const correctJ = puzzle.solution[cat.category][i];
      for (let j = 0; j < size; j++) {
        state[cat.category][i][j] = (j === correctJ) ? 2 : 1;
      }
    }
  }

  solutionShown = true;
  hasSolved = true;
  render();
  updateClueStyles();
  updateUndoButton();

  // Toggle practice UI
  els.showSolutionBtn?.classList.add('hidden');
  els.solutionActions?.classList.remove('hidden');
}

function tryAutoSolve() {
  if (hasSolved) return;
  const solved = checkSolved();
  if (!solved.ok) return;
  hasSolved = true;
  updateLeaderboardButton();
  handleSolved().catch(() => {
    // ignore
  });
}

function render() {
  if (els.gridSize) els.gridSize.textContent = `${puzzle.size}x${puzzle.size}`;

  // clues
  els.clues.innerHTML = '';
  puzzle.clueTexts.forEach((t, idx) => {
    const li = document.createElement('li');
    li.textContent = t;
    li.dataset.clueIdx = String(idx);
    li.className = 'clue-neutral';
    els.clues.appendChild(li);
  });

  const container = document.createElement('div');
  container.className = 'space-y-5';

  const identity = puzzle.categories.find(c => c.category === puzzle.identityCategory);

  for (const cat of puzzle.categories) {
    if (cat.category === puzzle.identityCategory) continue;

    const section = document.createElement('section');

    const header = document.createElement('div');
    header.className = 'flex items-center justify-between mb-3 px-1';
    const h = document.createElement('h3');
    h.className = 'text-base font-bold';
    h.textContent = `${labelCategory(identity.category)} × ${labelCategory(cat.category)}`;
    header.appendChild(h);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'overflow-auto';

    const table = document.createElement('table');
    table.className = 'w-auto table-fixed border-separate mx-auto';
    // slightly tighter spacing so the grid feels more like Snake tiles
    table.style.borderSpacing = '4px';

    // fixed column widths so the boxes form an actual grid
    const colgroup = document.createElement('colgroup');
    const col0 = document.createElement('col');
    col0.style.width = '120px';
    colgroup.appendChild(col0);
    for (let j = 0; j < puzzle.size; j++) {
      const col = document.createElement('col');
      col.style.width = '64px';
      colgroup.appendChild(col);
    }
    table.appendChild(colgroup);

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    const th0 = document.createElement('th');
    th0.className = 'text-left text-xs text-zinc-500 pr-2';
    th0.textContent = labelCategory(identity.category);
    trh.appendChild(th0);
    for (let j = 0; j < puzzle.size; j++) {
      const th = document.createElement('th');
      th.className = 'text-xs text-zinc-400 px-0 text-center leading-tight';
      th.textContent = cat.values[j];
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let i = 0; i < puzzle.size; i++) {
      const tr = document.createElement('tr');
      const rowLabel = document.createElement('td');
      rowLabel.className = 'text-sm text-zinc-200 pr-2';
      rowLabel.textContent = identity.values[i];
      tr.appendChild(rowLabel);

      for (let j = 0; j < puzzle.size; j++) {
        const td = document.createElement('td');
        const div = document.createElement('div');
        div.className = cellClass(state[cat.category][i][j]);
        div.textContent = cellText(state[cat.category][i][j]);

        div.addEventListener('click', () => {
          if (hasSolved) return;
          if (isPaused) return;
          if (isPrestart) return;

          // snapshot BEFORE mutation
          pushUndo();

          ensureTimerStarted();
          toggleCell(cat.category, i, j);
          render();
          updateClueStyles();
          tryAutoSolve();
          saveProgress(false);
        });

        td.appendChild(div);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    tableWrap.appendChild(table);

    section.appendChild(header);
    section.appendChild(tableWrap);
    container.appendChild(section);
  }

  els.board.innerHTML = '';
  els.board.appendChild(container);
  shell?.update();
}

async function loadDataset() {
  const res = await fetch('./data/categories.csv', { cache: 'no-store' });
  const text = await res.text();
  const rows = parseCsv(text);
  const header = rows[0].map(h => h.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  const byCategory = new Map();
  const rolesByCategory = new Map();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const category = (row[idx.category] || '').trim();
    const value = (row[idx.value] || '').trim();
    const role = (row[idx.role] || '').trim();
    if (!category || !value || !role) continue;

    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(value);
    rolesByCategory.set(category, role);
  }

  return { byCategory, rolesByCategory };
}

async function startDaily() {
  setMode('daily');
  const puzzleId = getPTDateYYYYMMDD();
  puzzle = engine.generateDaily(puzzleId);
  initState();
  undoStack = [];
  solutionShown = false;
  isPaused = false;
  pausedElapsedMs = null;

  // Hide practice-only controls
  els.showSolutionBtn?.classList.add('hidden');
  els.solutionActions?.classList.add('hidden');

  const saved = loadProgressForPuzzleId(puzzleId);
  let resumeElapsedMs = 0;
  if (saved) {
    state = saved.state || state;
    manualX = saved.manualX || manualX;
    autoX = deserializeAutoXSets(saved.autoX || serializeAutoXSets());
    hasSolved = !!saved.hasSolved;
    completionMs = saved.completionMs ?? null;
    timerStarted = !!saved.timerStarted;
    if (timerStarted) {
      if (typeof saved.elapsedMs === 'number') {
        resumeElapsedMs = Math.max(0, saved.elapsedMs);
        if (saved.isPaused) {
          isPaused = true;
          pausedElapsedMs = resumeElapsedMs;
        }
      } else if (saved.startedAtEpochMs) {
        resumeElapsedMs = Math.max(0, Date.now() - saved.startedAtEpochMs);
      }
    }
  } else {
    timerStarted = false;
  }

  render();
  updateClueStyles();
  updateUndoButton();
  updateLeaderboardButton();

  if (isInReplayMode) {
    hasSolved = false;
    timerStarted = false;
    completionMs = null;
  }

  if (hasSolved && !isInReplayMode) {
    stopTimer();
    timerStarted = false;
    setPrestart(false);
    els.timer.textContent = formatTime(completionMs || 0);
  } else if (timerStarted && isPaused) {
    stopTimer();
    setPrestart(false);
    els.timer.textContent = formatTime(resumeElapsedMs || 0);
    showPauseOverlay(true);
  } else if (timerStarted) {
    setPrestart(false);
    startTimer({ resumeElapsedMs });
  } else {
    stopTimer();
    els.timer.textContent = formatTime(0);
    setPrestart(true);
  }

  updateExitReplayButton();
  shell?.update();
}

async function startPractice() {
  setMode('practice');
  puzzle = engine.generatePractice();
  initState();
  undoStack = [];
  solutionShown = false;
  timerStarted = false;
  hasSolved = false;
  isPaused = false;
  stopTimer();
  showPauseOverlay(false);
  render();
  updateClueStyles();
  updateUndoButton();
  updateLeaderboardButton();
  els.timer.textContent = formatTime(0);
  setPrestart(true);

  // Practice-only controls
  els.showSolutionBtn?.classList.remove('hidden');
  els.solutionActions?.classList.add('hidden');
  shell?.update();
}

function resetPracticePuzzle() {
  initState();
  undoStack = [];
  solutionShown = false;
  timerStarted = false;
  hasSolved = false;
  isPaused = false;
  pausedElapsedMs = null;
  stopTimer();
  showPauseOverlay(false);
  render();
  updateClueStyles();
  els.timer.textContent = formatTime(0);
  setPrestart(true);
  els.showSolutionBtn?.classList.remove('hidden');
  els.solutionActions?.classList.add('hidden');
  updateUndoButton();
  updateLeaderboardButton();
  shell?.resetUI();
  shell?.update();
}

function wireUI() {
  shell = createShellController({
    gameId: 'lattice',
    getMode: () => mode,
    getPuzzleId: () => puzzle?.puzzleId || getPTDateYYYYMMDD(),
    getGridLabel: () => (puzzle ? `${puzzle.size}x${puzzle.size}` : ''),
    getElapsedMs: () => getElapsedMs(),
    getCompletionMs: () => completionMs,
    setCompletionMs: (ms) => { completionMs = ms; },
    formatTime,
    isComplete: () => hasSolved,
    isPaused: () => isPaused,
    isStarted: () => timerStarted,
    hasProgress: () => !isPrestart,
    pause,
    resume,
    startGame: () => {
      setPrestart(false);
      startTimer({ resumeElapsedMs: 0 });
      saveProgress(true);
      updateUndoButton();
    },
    resetGame: () => {
      solutionShown = false;
      initState();
      undoStack = [];
      render();
      updateClueStyles();
      hasSolved = false;
      if (!timerStarted) {
        setPrestart(true);
      } else {
        setPrestart(false);
      }
      updateUndoButton();
      updateLeaderboardButton();
      saveProgress(true);
    },
    startReplay,
    exitReplay: () => { loadCompletedState(); },
    onResetUI: () => {
      els.showSolutionBtn?.classList.remove('hidden');
      els.solutionActions?.classList.add('hidden');
      updateUndoButton();
      updateLeaderboardButton();
    },
    onTryAgain: () => { if (mode === 'practice') resetPracticePuzzle(); },
    onNextLevel: () => { if (mode === 'practice') startPractice(); },
    onBackToDaily: () => startDaily(),
    onPracticeInfinite: () => startPractice(),
    onStartPractice: () => startPractice(),
    onStartDaily: () => startDaily(),
    onReplayStateChange: (enabled) => { isInReplayMode = enabled; updateExitReplayButton(); },
    getAnonId: () => getOrCreateAnonId(),
    getCompletionPayload: () => ({ timeMs: Math.floor(completionMs ?? getElapsedMs()), hintsUsed: 0 }),
    shouldShowCompletionModal: () => !solutionShown,
    disableShellTimer: false,
    disableReplay: true,
    getShareFile: () => buildShareCard({
      gameName: 'Lattice',
      logoPath: '/games/lattice/lattice-logo.png?v=2',
      accent: '#7dd3fc',
      accentSoft: 'rgba(125, 211, 252, 0.12)',
      dateText: formatDateForShare(puzzle?.puzzleId || getPTDateYYYYMMDD()),
      timeText: formatTime(completionMs ?? getElapsedMs()),
      gridLabel: `${puzzle?.size || ''}x${puzzle?.size || ''}`,
      footerText: 'dailygrid.app/games/lattice'
    }),
    saveProgress: () => saveProgress(true)
  });

  els.undoBtn?.addEventListener('click', () => {
    if (isPrestart || isPaused || hasSolved) return;
    const snap = undoStack.pop();
    if (!snap) return;
    restoreFromUndo(snap);
    render();
    updateClueStyles();
    saveProgress(true);
    updateUndoButton();
  });

  els.completionModal?.addEventListener('click', (e) => {
    if (e.target === els.completionModal) hideCompletionModal();
  });

  // Mode buttons handled by shared shell controller.

  // Practice: show solution + actions
  els.showSolutionBtn?.addEventListener('click', () => showSolution());
  els.solutionRetryBtn?.addEventListener('click', () => {
    resetPracticePuzzle();
  });
  els.solutionNextBtn?.addEventListener('click', () => {
    // New practice puzzle
    startPractice();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveProgress(true);
  });
  window.addEventListener('beforeunload', () => saveProgress(true));
}

(async function main() {
  try {
    const dataset = await loadDataset();
    engine = new LatticeEngine(dataset);
    wireUI();
    await startDaily();
  } catch (e) {
    console.error(e);
    if (els.board) els.board.innerHTML = `<div class="text-sm text-red-300">${String(e)}</div>`;
  }
})();
