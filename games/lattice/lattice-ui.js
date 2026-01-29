import { LatticeEngine } from './lattice-engine.js';
import { getPTDateYYYYMMDD, parseCsv, getOrCreateAnonId, formatTime } from './lattice-utils.js';

const els = {
  timer: document.getElementById('timer'),
  gridSize: document.getElementById('grid-size'),
  board: document.getElementById('board'),
  clues: document.getElementById('clues'),
  check: document.getElementById('check'),
  reset: document.getElementById('reset'),
  practice: document.getElementById('practice'),
  leaderboard: document.getElementById('leaderboard'),

  // modal
  completionModal: document.getElementById('completion-modal'),
  finalTime: document.getElementById('final-time'),
  percentileMsg: document.getElementById('percentile-msg'),
  closeModalBtn: document.getElementById('close-modal-btn'),
  shareBtn: document.getElementById('share-btn'),
  modeBadge: document.getElementById('mode-badge'),
  modalTitle: document.getElementById('modal-title'),
  modalSubtitle: document.getElementById('modal-subtitle'),
  claimInitialsForm: document.getElementById('claim-initials-form'),
  initialsInput: document.getElementById('initials-input'),
  claimInitialsBtn: document.getElementById('claim-initials-btn'),
  nextGamePromo: document.getElementById('next-game-promo'),
  nextGameLink: document.getElementById('next-game-link'),
  nextGameLogo: document.getElementById('next-game-logo'),
  nextGameText: document.getElementById('next-game-text')
};

let puzzle = null;
let startedAt = null;
let timerInt = null;

// state[cat][row][col] => 0 blank, 1 X, 2 ✓
let state = null;
// manualX[cat][row][col] => boolean
let manualX = null;
// autoX[cat][row][col] => Set(anchorId)
let autoX = null;

let engine = null;
let hasSolved = false;

const STORAGE_PREFIX = 'dailygrid_lattice_progress_';
let saveThrottleMs = 2500;
let lastSaveAt = 0;

function startTimer({ resumeElapsedMs = 0 } = {}) {
  // Keep time across refresh by storing an epoch start.
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

function storageKeyForPuzzle() {
  const id = puzzle?.mode === 'daily' ? puzzle.puzzleId : 'practice';
  return `${STORAGE_PREFIX}${id}`;
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

function saveProgress(force = false) {
  if (!puzzle) return;
  if (puzzle.mode !== 'daily') return; // only persist daily

  const now = Date.now();
  if (!force && now - lastSaveAt < saveThrottleMs) return;
  lastSaveAt = now;

  const payload = {
    puzzleId: puzzle.puzzleId,
    size: puzzle.size,
    identityCategory: puzzle.identityCategory,
    categories: puzzle.categories.map(c => c.category),

    // timer
    timerStarted: true,
    startedAtEpochMs: Date.now() - getElapsedMs(),

    // marks
    state,
    manualX,
    autoX: serializeAutoXSets(),

    // solved state
    hasSolved
  };

  try {
    localStorage.setItem(storageKeyForPuzzle(), JSON.stringify(payload));
  } catch (e) {
    console.warn('Failed to save lattice progress', e);
  }
}

function loadProgressForPuzzle(puzzleId) {
  const key = `${STORAGE_PREFIX}${puzzleId}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (payload?.puzzleId !== puzzleId) return null;
    return payload;
  } catch (e) {
    console.warn('Failed to load lattice progress', e);
    return null;
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
  // desiredX: true => add auto-x; false => remove auto-x
  const set = autoX[catKey][row][col];
  if (desiredX) set.add(anchor);
  else set.delete(anchor);

  const shouldBeX = set.size > 0;
  const isManual = manualX[catKey][row][col];

  if (state[catKey][row][col] === 2) return; // don't overwrite a ✓

  if (shouldBeX || isManual) {
    state[catKey][row][col] = 1;
  } else {
    state[catKey][row][col] = 0;
  }
}

function setCellBlank(catKey, row, col) {
  // Clears manual X if present; respects autoX
  if (state[catKey][row][col] === 1) {
    manualX[catKey][row][col] = false;
    const shouldBeX = autoX[catKey][row][col].size > 0;
    state[catKey][row][col] = shouldBeX ? 1 : 0;
  } else {
    state[catKey][row][col] = 0;
  }
}

function clearYes(catKey, row, col) {
  if (state[catKey][row][col] !== 2) return;

  const a = anchorId(catKey, row, col);
  const size = puzzle.size;

  // Remove auto X created by this yes
  for (let j = 0; j < size; j++) {
    if (j === col) continue;
    applyAutoX(catKey, row, j, a, false);
  }
  for (let i = 0; i < size; i++) {
    if (i === row) continue;
    applyAutoX(catKey, i, col, a, false);
  }

  // Clear this cell to blank (no manual)
  state[catKey][row][col] = 0;
}

function setYes(catKey, row, col) {
  const size = puzzle.size;

  // If there's an existing yes in the row, clear it first
  const existingRow = findRowYes(catKey, row);
  if (existingRow.kind === 'one' && existingRow.col !== col) {
    clearYes(catKey, row, existingRow.col);
  }

  // If there's an existing yes in the col, clear it first
  const existingCol = findColYes(catKey, col);
  if (existingCol.kind === 'one' && existingCol.row !== row) {
    clearYes(catKey, existingCol.row, col);
  }

  // Overwrite any X state in this cell
  state[catKey][row][col] = 2;
  manualX[catKey][row][col] = false;
  autoX[catKey][row][col].clear();

  const a = anchorId(catKey, row, col);

  // Auto-X the rest of the row and col
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

  // Cycle: blank -> X -> ✓ -> blank
  if (cur === 0) {
    state[catKey][row][col] = 1;
    manualX[catKey][row][col] = true;
    return;
  }

  if (cur === 1) {
    // X -> ✓
    setYes(catKey, row, col);
    return;
  }

  if (cur === 2) {
    // ✓ -> blank
    clearYes(catKey, row, col);
    return;
  }
}

function evaluateClue(idx) {
  const clue = puzzle.clues[idx];
  const size = puzzle.size;

  // helper to get row assignment status for a category
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
    const m = state[clue.category];
    const cell = m[clue.idIndex][clue.valueIndex];
    const ry = rowYes(clue.category, clue.idIndex);
    if (cell === 2) return 'satisfied';
    if (cell === 1) return 'conflict';
    if (ry.kind === 'one' && ry.col !== clue.valueIndex) return 'conflict';
    if (ry.kind === 'conflict') return 'conflict';
    return 'neutral';
  }

  if (clue.kind === 'idNeq') {
    const m = state[clue.category];
    const cell = m[clue.idIndex][clue.valueIndex];
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

    // Find if any row has aCat == aVal as ✓
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

function tryAutoSolve() {
  if (hasSolved) return;
  const result = checkSolved();
  if (!result.ok) return;
  hasSolved = true;
  stopTimer();
  const timeMs = performance.now() - startedAt;
  // emulate pressing check
  handleSolved(timeMs).catch(() => {
    showCompletionModal({ timeMs, rankText: puzzle.mode === 'daily' ? 'Leaderboard temporarily unavailable' : 'Practice puzzle complete' });
  });
}

function render() {
  hasSolved = false;

  if (els.modeBadge) {
    els.modeBadge.innerHTML = puzzle.mode === 'practice'
      ? '<span class="w-2 h-2 rounded-full bg-zinc-400"></span> Practice'
      : '<span class="w-2 h-2 rounded-full" style="background: var(--brand-accent);"></span> Daily Puzzle';
  }

  if (els.gridSize) {
    els.gridSize.textContent = `${puzzle.size}x${puzzle.size}`;
  }

  // clues
  els.clues.innerHTML = '';
  puzzle.clueTexts.forEach((t, idx) => {
    const li = document.createElement('li');
    li.textContent = t;
    li.dataset.clueIdx = String(idx);
    li.className = 'clue-neutral';
    els.clues.appendChild(li);
  });

  // board
  const container = document.createElement('div');
  container.className = 'space-y-8';

  const identity = puzzle.categories.find(c => c.category === puzzle.identityCategory);

  for (const cat of puzzle.categories) {
    if (cat.category === puzzle.identityCategory) continue;

    const section = document.createElement('section');

    const header = document.createElement('div');
    header.className = 'flex items-center justify-between mb-3 px-1';
    const h = document.createElement('h3');
    h.className = 'text-lg font-bold';
    h.textContent = `${labelCategory(identity.category)} × ${labelCategory(cat.category)}`;
    header.appendChild(h);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'overflow-auto';

    const table = document.createElement('table');
    table.className = 'w-full border-separate border-spacing-2';

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    const th0 = document.createElement('th');
    th0.className = 'text-left text-xs text-zinc-500 px-2';
    th0.textContent = labelCategory(identity.category);
    trh.appendChild(th0);
    for (let j = 0; j < puzzle.size; j++) {
      const th = document.createElement('th');
      th.className = 'text-xs text-zinc-400 px-1';
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
          toggleCell(cat.category, i, j);
          // rerender whole board (simple + safe)
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
          if (yes !== -1) return { ok: false, reason: 'Multiple ✓ in a row' };
          yes = j;
        }
      }
      if (yes === -1) return { ok: false, reason: 'Missing ✓ entries' };
      const correct = puzzle.solution[cat.category][i];
      if (yes !== correct) return { ok: false, reason: 'Some matches are incorrect' };
    }
  }
  return { ok: true };
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
  const puzzleId = getPTDateYYYYMMDD();
  puzzle = engine.generateDaily(puzzleId);
  initState();

  // restore progress
  const saved = loadProgressForPuzzle(puzzleId);
  let resumeElapsedMs = 0;
  if (saved) {
    try {
      // marks
      state = saved.state || state;
      manualX = saved.manualX || manualX;
      autoX = deserializeAutoXSets(saved.autoX || serializeAutoXSets());
      hasSolved = !!saved.hasSolved;

      // timer
      if (saved.startedAtEpochMs) {
        resumeElapsedMs = Math.max(0, Date.now() - saved.startedAtEpochMs);
      }
    } catch (e) {
      console.warn('Failed to restore lattice progress', e);
    }
  }

  render();
  updateClueStyles();
  startTimer({ resumeElapsedMs });
  await loadLeaderboard();
}

async function startPractice() {
  puzzle = engine.generatePractice();
  initState();
  render();
  updateClueStyles();
  startTimer({ resumeElapsedMs: 0 });
  els.leaderboard.textContent = 'Practice mode — no leaderboard.';
}

function showCompletionModal({ timeMs, rankText }) {
  if (!els.completionModal) return;
  els.finalTime.textContent = formatTime(timeMs);
  if (els.percentileMsg) els.percentileMsg.textContent = rankText || '';
  els.completionModal.classList.add('show');
}

function hideCompletionModal() {
  els.completionModal?.classList.remove('show');
}

async function shareResult(timeMs) {
  const date = puzzle.mode === 'daily' ? puzzle.puzzleId : 'practice';
  const text = `Lattice (${puzzle.size}x${puzzle.size}) — ${date}\n${formatTime(timeMs)}\nhttps://daily-grid.pages.dev/games/lattice/`;

  try {
    if (navigator.share) {
      await navigator.share({ text });
    } else {
      await navigator.clipboard.writeText(text);
      alert('Copied share text');
    }
  } catch {
    // ignore
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

async function loadLeaderboard() {
  if (puzzle.mode !== 'daily') return;
  const puzzleId = puzzle.puzzleId;
  const res = await fetch(`/api/lattice/leaderboard?puzzleId=${encodeURIComponent(puzzleId)}`);
  if (!res.ok) return;
  const data = await res.json();

  if (!data?.top10?.length) {
    els.leaderboard.textContent = 'No scores yet — be the first!';
    return;
  }

  els.leaderboard.innerHTML = data.top10.map((e) => {
    const initials = e.initials || '---';
    return `<div class="flex justify-between py-1"><span class="mono">${initials}</span><span class="mono">${formatTime(e.timeMs)}</span></div>`;
  }).join('');
}

function showNextGamePromo() {
  // Mirror Snake/Pathways: promote the other daily game
  if (!els.nextGamePromo || !els.nextGameLink || !els.nextGameLogo || !els.nextGameText) return;
  // Pick Snake for now
  els.nextGameLink.href = '/games/snake/';
  els.nextGameLogo.src = '/games/snake/snake-logo.png';
  els.nextGameText.textContent = "Play today's Snake";
  els.nextGamePromo.classList.remove('hidden');
}

function markSubmitted() {
  if (puzzle.mode !== 'daily') return;
  try {
    const key = `dailygrid_lattice_submitted_${puzzle.puzzleId}`;
    localStorage.setItem(key, 'true');
  } catch {}
}

function hasSubmittedToday() {
  if (puzzle.mode !== 'daily') return false;
  try {
    const key = `dailygrid_lattice_submitted_${puzzle.puzzleId}`;
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

async function claimInitials() {
  const initials = els.initialsInput?.value?.toUpperCase().trim();
  if (!initials || initials.length > 3) {
    alert('Please enter 1-3 letters');
    return;
  }

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

  els.claimInitialsForm?.classList.add('hidden');
  await loadLeaderboard();
}

async function handleSolved(timeMs) {
  if (puzzle.mode !== 'daily') {
    if (els.modalTitle) els.modalTitle.textContent = 'Solved!';
    if (els.modalSubtitle) els.modalSubtitle.textContent = 'Practice puzzle complete';
    showCompletionModal({ timeMs, rankText: 'Practice puzzle complete' });
    showNextGamePromo();
    return;
  }

  if (els.modalTitle) els.modalTitle.textContent = 'Solved!';
  if (els.modalSubtitle) els.modalSubtitle.textContent = "Great work on today's puzzle";

  // Only submit once per day
  if (!hasSubmittedToday()) {
    const data = await submitScore(timeMs);
    markSubmitted();

    const rankText = `You ranked ${data.rank} out of ${data.total} solvers today (top ${100 - data.percentile}%)!`;
    showCompletionModal({ timeMs, rankText });

    // show initials claim if top 10
    if (data.rank <= 10) {
      els.claimInitialsForm?.classList.remove('hidden');
    } else {
      els.claimInitialsForm?.classList.add('hidden');
    }
  } else {
    showCompletionModal({ timeMs, rankText: 'Score already submitted for today' });
    els.claimInitialsForm?.classList.add('hidden');
  }

  await loadLeaderboard();
  showNextGamePromo();
}

function wireUI() {
  els.reset.addEventListener('click', () => {
    initState();
    render();
    updateClueStyles();
    hasSolved = false;
    saveProgress(true);
  });

  els.practice.addEventListener('click', async () => {
    hideCompletionModal();
    await startPractice();
  });

  els.closeModalBtn?.addEventListener('click', hideCompletionModal);
  els.completionModal?.addEventListener('click', (e) => {
    if (e.target === els.completionModal) hideCompletionModal();
  });

  els.claimInitialsBtn?.addEventListener('click', async () => {
    try {
      await claimInitials();
    } catch (e) {
      alert(e.message || 'Failed to claim initials');
    }
  });

  els.check.addEventListener('click', async () => {
    const result = checkSolved();
    if (!result.ok) {
      alert(result.reason);
      return;
    }

    if (hasSolved) return;
    hasSolved = true;

    stopTimer();
    const timeMs = getElapsedMs();

    try {
      await handleSolved(timeMs);
    } catch {
      showCompletionModal({ timeMs, rankText: puzzle.mode === 'daily' ? 'Leaderboard temporarily unavailable' : 'Practice puzzle complete' });
    }

    saveProgress(true);
  });

  els.shareBtn?.addEventListener('click', async () => {
    const timeMs = getElapsedMs();
    await shareResult(timeMs);
  });

  // background save
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveProgress(true);
  });
  window.addEventListener('beforeunload', () => {
    saveProgress(true);
  });
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
