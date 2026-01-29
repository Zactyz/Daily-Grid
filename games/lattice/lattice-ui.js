import { LatticeEngine } from './lattice-engine.js';
import { getPTDateYYYYMMDD, parseCsv, getOrCreateAnonId, formatTime } from './lattice-utils.js';

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

  // begin overlay
  beginOverlay: document.getElementById('begin-overlay'),
  beginBtn: document.getElementById('begin-btn'),

  // controls
  leaderboardBtn: document.getElementById('leaderboard-btn'),
  pauseBtn: document.getElementById('pause-btn'),
  resetBtn: document.getElementById('reset-btn'),
  practiceModeBtn: document.getElementById('practice-mode-btn'),
  backToDailyBtn: document.getElementById('back-to-daily-btn'),

  // overlays
  pauseOverlay: document.getElementById('pause-overlay'),
  gameContainer: document.getElementById('game-container'),

  // modal
  completionModal: document.getElementById('completion-modal'),
  modalTitle: document.getElementById('modal-title'),
  modalSubtitle: document.getElementById('modal-subtitle'),
  finalTime: document.getElementById('final-time'),
  percentileMsg: document.getElementById('percentile-msg'),
  closeModalBtn: document.getElementById('close-modal-btn'),
  shareBtn: document.getElementById('share-btn'),
  practiceInfiniteBtn: document.getElementById('practice-infinite-btn'),

  claimInitialsForm: document.getElementById('claim-initials-form'),
  initialsInput: document.getElementById('initials-input'),

  nextGamePromo: document.getElementById('next-game-promo'),
  nextGameLink: document.getElementById('next-game-link'),
  nextGameLogo: document.getElementById('next-game-logo'),
  nextGameText: document.getElementById('next-game-text'),

  leaderboardTitle: document.getElementById('leaderboard-title'),
  leaderboardList: document.getElementById('leaderboard-list')
};

let engine = null;
let puzzle = null;
let mode = 'daily'; // 'daily' | 'practice'

let startedAt = null;
let timerInt = null;
let timerStarted = false;
let isPaused = false;
let hasSolved = false;
let isPrestart = true;

// state[cat][row][col] => 0 blank, 1 X, 2 ✓
let state = null;
let manualX = null;
let autoX = null;

const STORAGE_PREFIX = 'dailygrid_lattice_progress_';
let saveThrottleMs = 2500;
let lastSaveAt = 0;

function startTimer({ resumeElapsedMs = 0 } = {}) {
  timerStarted = true;
  isPaused = false;
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
  return Math.max(0, performance.now() - startedAt);
}

function setPrestart(show) {
  isPrestart = show;
  if (els.beginOverlay) {
    if (show) els.beginOverlay.classList.remove('hidden');
    else els.beginOverlay.classList.add('hidden');
  }

  // hide main UI until start
  if (els.gameContainer) {
    if (show) els.gameContainer.classList.add('hidden');
    else els.gameContainer.classList.remove('hidden');
  }
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
    els.practiceBadge?.classList.add('hidden');
    els.dailyBadge?.classList.remove('hidden');
    els.practiceModeBtn?.classList.remove('hidden');
    els.backToDailyBtn?.classList.add('hidden');
  } else {
    els.dailyBadge?.classList.add('hidden');
    els.practiceBadge?.classList.remove('hidden');
    els.practiceModeBtn?.classList.add('hidden');
    els.backToDailyBtn?.classList.remove('hidden');
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

function storageKeyForPuzzleId(puzzleId) {
  return `${STORAGE_PREFIX}${puzzleId}`;
}

function saveProgress(force = false) {
  if (!puzzle) return;
  if (mode !== 'daily') return;

  const now = Date.now();
  if (!force && now - lastSaveAt < saveThrottleMs) return;
  lastSaveAt = now;

  const payload = {
    puzzleId: puzzle.puzzleId,
    timerStarted,
    startedAtEpochMs: timerStarted ? (Date.now() - getElapsedMs()) : null,
    state,
    manualX,
    autoX: serializeAutoXSets(),
    hasSolved
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

function showPauseOverlay(show) {
  if (!els.pauseOverlay) return;
  if (show) els.pauseOverlay.classList.remove('hidden');
  else els.pauseOverlay.classList.add('hidden');
}

function pause() {
  if (isPaused) return;
  if (!timerStarted) return;
  isPaused = true;
  stopTimer();
  showPauseOverlay(true);
  saveProgress(true);
}

function resume() {
  if (!isPaused) return;
  isPaused = false;
  showPauseOverlay(false);
  startTimer({ resumeElapsedMs: getElapsedMs() });
}

function showNextGamePromo() {
  if (!els.nextGamePromo || !els.nextGameLink || !els.nextGameLogo || !els.nextGameText) return;
  els.nextGameLink.href = '/games/snake/';
  els.nextGameLogo.src = '/games/snake/snake-logo.png';
  els.nextGameText.textContent = "Play today's Snake";
  els.nextGamePromo.classList.remove('hidden');
}

function markSubmitted() {
  if (mode !== 'daily') return;
  try {
    localStorage.setItem(`dailygrid_lattice_submitted_${puzzle.puzzleId}`, 'true');
  } catch {}
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
  if (els.claimInitialsForm) {
    if (showInitials) els.claimInitialsForm.classList.remove('hidden');
    else els.claimInitialsForm.classList.add('hidden');
  }
  showCompletionModal();
}

async function handleSolved() {
  const timeMs = getElapsedMs();
  stopTimer();

  if (mode !== 'daily') {
    showSolvedModal({ timeMs, rankText: 'Practice puzzle complete', showInitials: false });
    showNextGamePromo();
    await loadLeaderboardIntoModal();
    return;
  }

  if (!hasSubmittedToday()) {
    const data = await submitScore(timeMs);
    markSubmitted();

    const rankText = `You ranked ${data.rank} out of ${data.total} solvers today (top ${100 - data.percentile}%)!`;
    showSolvedModal({ timeMs, rankText, showInitials: data.rank <= 10 });
  } else {
    showSolvedModal({ timeMs, rankText: 'Score already submitted for today', showInitials: false });
  }

  showNextGamePromo();
  await loadLeaderboardIntoModal();
  saveProgress(true);
}

function tryAutoSolve() {
  if (hasSolved) return;
  const solved = checkSolved();
  if (!solved.ok) return;
  hasSolved = true;
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
    table.className = 'w-auto table-fixed border-separate border-spacing-1 mx-auto';

    // fixed column widths so the boxes form an actual grid
    const colgroup = document.createElement('colgroup');
    const col0 = document.createElement('col');
    col0.style.width = '110px';
    colgroup.appendChild(col0);
    for (let j = 0; j < puzzle.size; j++) {
      const col = document.createElement('col');
      col.style.width = '56px';
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
      th.className = 'text-xs text-zinc-400 px-1 text-center';
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

  const saved = loadProgressForPuzzleId(puzzleId);
  let resumeElapsedMs = 0;
  if (saved) {
    state = saved.state || state;
    manualX = saved.manualX || manualX;
    autoX = deserializeAutoXSets(saved.autoX || serializeAutoXSets());
    hasSolved = !!saved.hasSolved;
    timerStarted = !!saved.timerStarted;
    if (timerStarted && saved.startedAtEpochMs) {
      resumeElapsedMs = Math.max(0, Date.now() - saved.startedAtEpochMs);
    }
  } else {
    timerStarted = false;
  }

  render();
  updateClueStyles();

  if (timerStarted) {
    setPrestart(false);
    startTimer({ resumeElapsedMs });
  } else {
    stopTimer();
    els.timer.textContent = formatTime(0);
    setPrestart(true);
  }
}

async function startPractice() {
  setMode('practice');
  puzzle = engine.generatePractice();
  initState();
  timerStarted = false;
  hasSolved = false;
  isPaused = false;
  stopTimer();
  showPauseOverlay(false);
  render();
  updateClueStyles();
  els.timer.textContent = formatTime(0);
  setPrestart(true);
}

function wireUI() {
  els.beginBtn?.addEventListener('click', () => {
    setPrestart(false);
    startTimer({ resumeElapsedMs: 0 });
    saveProgress(true);
  });

  els.resetBtn?.addEventListener('click', () => {
    if (mode === 'daily') {
      // reset board, keep timer running (match other games)
      initState();
      render();
      updateClueStyles();
      hasSolved = false;
      saveProgress(true);
    } else {
      startPractice();
    }
  });

  els.pauseBtn?.addEventListener('click', () => {
    if (isPaused) resume();
    else pause();
  });

  els.pauseOverlay?.addEventListener('click', () => resume());

  els.leaderboardBtn?.addEventListener('click', async () => {
    // open modal even if unsolved
    if (els.modalTitle) els.modalTitle.textContent = 'Leaderboard';
    if (els.modalSubtitle) els.modalSubtitle.textContent = mode === 'daily' ? "Today's Top 10" : 'Practice mode';
    if (els.percentileMsg) els.percentileMsg.textContent = '';
    els.claimInitialsForm?.classList.add('hidden');
    showNextGamePromo();
    showCompletionModal();
    if (mode === 'daily') await loadLeaderboardIntoModal();
  });

  els.closeModalBtn?.addEventListener('click', hideCompletionModal);
  els.completionModal?.addEventListener('click', (e) => {
    if (e.target === els.completionModal) hideCompletionModal();
  });

  els.claimInitialsForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const initials = els.initialsInput?.value?.toUpperCase().trim();
    if (!initials || initials.length > 3) return;
    try {
      await claimInitials(initials);
      els.claimInitialsForm?.classList.add('hidden');
      await loadLeaderboardIntoModal();
    } catch (err) {
      alert(err.message || 'Failed to claim initials');
    }
  });

  els.practiceModeBtn?.addEventListener('click', () => startPractice());
  els.practiceInfiniteBtn?.addEventListener('click', () => {
    hideCompletionModal();
    startPractice();
  });

  els.backToDailyBtn?.addEventListener('click', () => startDaily());

  els.shareBtn?.addEventListener('click', async () => {
    const date = mode === 'daily' ? puzzle.puzzleId : 'practice';
    const text = `Lattice (${puzzle.size}x${puzzle.size}) — ${date}\n${formatTime(getElapsedMs())}\nhttps://daily-grid.pages.dev/games/lattice/`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        alert('Copied share text');
      }
    } catch {}
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
