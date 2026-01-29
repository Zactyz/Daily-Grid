import { LatticeEngine } from './lattice-engine.js';
import { getPTDateYYYYMMDD, parseCsv, hashString, createSeededRandom, getOrCreateAnonId, formatTime } from './lattice-utils.js';

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
  modeBadge: document.getElementById('mode-badge')
};

let puzzle = null;
let startedAt = null;
let timerInt = null;
let state = null; // user marks

function startTimer() {
  startedAt = performance.now();
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

function initState() {
  const size = puzzle.size;
  state = {};
  for (const cat of puzzle.categories) {
    if (cat.category === puzzle.identityCategory) continue;
    // matrix [idIndex][valueIndex] => 0 blank, 1 no, 2 yes
    state[cat.category] = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
  }
}

function render() {
  // badge
  if (els.modeBadge) {
    els.modeBadge.innerHTML = puzzle.mode === 'practice'
      ? '<span class="w-2 h-2 rounded-full bg-zinc-400"></span> Practice'
      : '<span class="w-2 h-2 rounded-full bg-amber-400"></span> Daily Puzzle';
  }

  if (els.gridSize) {
    els.gridSize.textContent = `${puzzle.size}x${puzzle.size}`;
  }

  // clues
  els.clues.innerHTML = '';
  puzzle.clueTexts.forEach((t) => {
    const li = document.createElement('li');
    li.textContent = t;
    els.clues.appendChild(li);
  });

  // board: render each category table (identity x other)
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
          state[cat.category][i][j] = (state[cat.category][i][j] + 1) % 3;
          div.className = cellClass(state[cat.category][i][j]);
          div.textContent = cellText(state[cat.category][i][j]);
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

function checkSolved() {
  const size = puzzle.size;
  const identityCategory = puzzle.identityCategory;

  for (const cat of puzzle.categories) {
    if (cat.category === identityCategory) continue;
    const matrix = state[cat.category];
    // For each identity row: must have exactly one ✓ and it must be correct
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

async function startDaily(engine) {
  const puzzleId = getPTDateYYYYMMDD();
  puzzle = engine.generateDaily(puzzleId);
  initState();
  render();
  startTimer();
  await loadLeaderboard();
}

async function startPractice(engine) {
  puzzle = engine.generatePractice();
  initState();
  render();
  startTimer();
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
  } catch (_) {
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

function wireUI(engine) {
  els.reset.addEventListener('click', () => {
    initState();
    render();
  });

  els.practice.addEventListener('click', async () => {
    hideCompletionModal();
    await startPractice(engine);
  });

  els.closeModalBtn?.addEventListener('click', hideCompletionModal);
  els.completionModal?.addEventListener('click', (e) => {
    if (e.target === els.completionModal) hideCompletionModal();
  });

  els.check.addEventListener('click', async () => {
    const result = checkSolved();
    if (!result.ok) {
      alert(result.reason);
      return;
    }

    stopTimer();
    const timeMs = performance.now() - startedAt;

    if (puzzle.mode === 'daily') {
      try {
        const data = await submitScore(timeMs);
        const rankText = `You ranked ${data.rank} out of ${data.total} solvers today (top ${100 - data.percentile}%)!`;
        showCompletionModal({ timeMs, rankText });
        await loadLeaderboard();
      } catch (e) {
        showCompletionModal({ timeMs, rankText: 'Leaderboard temporarily unavailable' });
      }
    } else {
      showCompletionModal({ timeMs, rankText: 'Practice puzzle complete' });
    }
  });

  els.shareBtn?.addEventListener('click', async () => {
    const timeMs = performance.now() - startedAt;
    await shareResult(timeMs);
  });
}

(async function main() {
  try {
    const dataset = await loadDataset();
    const engine = new LatticeEngine(dataset);
    wireUI(engine);
    await startDaily(engine);
  } catch (e) {
    console.error(e);
    els.title.textContent = 'Failed to load Lattice';
    els.board.innerHTML = `<div class="text-sm text-red-300">${String(e)}</div>`;
  }
})();
