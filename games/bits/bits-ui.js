import { getPTDateYYYYMMDD, formatTime, getOrCreateAnonId } from '../common/utils.js';
import { createShellController } from '../common/shell-controller.js';
import { formatDateForShare } from '../common/share.js';
import { buildShareCard } from '../common/share-card.js';

const GRID_SIZE = 6;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;
const STATE_PREFIX = 'dailygrid_bits_state_';
const MIN_CLUES = 5;
const MAX_CLUES = 9;
const MIN_ADJ = 6;
const MAX_ADJ = 10;

let descriptor = null;
let solutionGrid = null;

const els = {
  timer: document.getElementById('timer'),
  progress: document.getElementById('progress-text'),
  gridRoot: document.getElementById('bits-grid'),
  gridSize: document.getElementById('grid-size'),
  puzzleDate: document.getElementById('puzzle-date'),
  showSolutionBtn: document.getElementById('show-solution-btn'),
  solutionActions: document.getElementById('solution-actions'),
  solutionRetryBtn: document.getElementById('solution-retry-btn'),
  solutionNextBtn: document.getElementById('solution-next-btn'),
  pauseBtn: document.getElementById('pause-btn'),
  resetBtn: document.getElementById('reset-btn')
};

const cells = [];
let currentMode = 'daily';
let puzzleId = getPTDateYYYYMMDD();
let puzzleSeed = puzzleId;
let baseElapsed = 0;
let startTimestamp = 0;
let timerStarted = false;
let isPaused = false;
let isComplete = false;
let completionMs = null;
let shell = null;
let tickInterval = null;
let solutionShown = false;

function getPuzzleIdForMode(mode) {
  if (mode === 'practice') return `practice-${puzzleSeed}`;
  return getPTDateYYYYMMDD();
}

function getStateKey() {
  return `${STATE_PREFIX}${currentMode}_${puzzleId}`;
}

function makeRng(seedString) {
  let seed = 1779033703 ^ seedString.length;
  for (let i = 0; i < seedString.length; i += 1) {
    seed = Math.imul(seed ^ seedString.charCodeAt(i), 3432918353);
    seed = (seed << 13) | (seed >>> 19);
  }
  return function rng() {
    seed = Math.imul(seed ^ (seed >>> 16), 2246822507);
    seed = Math.imul(seed ^ (seed >>> 13), 3266489909);
    seed ^= seed >>> 16;
    return (seed >>> 0) / 4294967296;
  };
}

function rngInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function weightedPickIndex(weights, rng) {
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return -1;
  let roll = rng() * total;
  for (let i = 0; i < weights.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

function pickWeightedUnique(indices, weights, count, rng) {
  const picked = new Set();
  const localWeights = weights.slice();
  while (picked.size < count) {
    const idx = weightedPickIndex(localWeights, rng);
    if (idx < 0) break;
    picked.add(indices[idx]);
    localWeights[idx] = 0;
    if (localWeights.every(w => w === 0)) break;
  }
  return picked;
}

function quadrantFor(r, c) {
  const half = GRID_SIZE / 2;
  const top = r < half;
  const left = c < half;
  if (top && left) return 0;
  if (top && !left) return 1;
  if (!top && left) return 2;
  return 3;
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generateFullGrid(rng) {
  const grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(-1));

  function rowCounts(row) {
    let zeros = 0;
    let ones = 0;
    for (let c = 0; c < GRID_SIZE; c += 1) {
      if (row[c] === 0) zeros += 1;
      if (row[c] === 1) ones += 1;
    }
    return { zeros, ones };
  }

  function colCounts(c) {
    let zeros = 0;
    let ones = 0;
    for (let r = 0; r < GRID_SIZE; r += 1) {
      if (grid[r][c] === 0) zeros += 1;
      if (grid[r][c] === 1) ones += 1;
    }
    return { zeros, ones };
  }

  function rowComplete(r) {
    return grid[r].every(v => v !== -1);
  }

  function colComplete(c) {
    for (let r = 0; r < GRID_SIZE; r += 1) {
      if (grid[r][c] === -1) return false;
    }
    return true;
  }

  function rowUnique(r) {
    if (!rowComplete(r)) return true;
    for (let i = 0; i < GRID_SIZE; i += 1) {
      if (i === r) continue;
      if (!rowComplete(i)) continue;
      let same = true;
      for (let c = 0; c < GRID_SIZE; c += 1) {
        if (grid[i][c] !== grid[r][c]) {
          same = false;
          break;
        }
      }
      if (same) return false;
    }
    return true;
  }

  function colUnique(c) {
    if (!colComplete(c)) return true;
    for (let j = 0; j < GRID_SIZE; j += 1) {
      if (j === c) continue;
      if (!colComplete(j)) continue;
      let same = true;
      for (let r = 0; r < GRID_SIZE; r += 1) {
        if (grid[r][j] !== grid[r][c]) {
          same = false;
          break;
        }
      }
      if (same) return false;
    }
    return true;
  }

  function hasThreeInRow(row) {
    for (let c = 0; c < GRID_SIZE - 2; c += 1) {
      const a = row[c];
      const b = row[c + 1];
      const d = row[c + 2];
      if (a === -1 || b === -1 || d === -1) continue;
      if (a === b && b === d) return true;
    }
    return false;
  }

  function hasThreeInCol(c) {
    for (let r = 0; r < GRID_SIZE - 2; r += 1) {
      const a = grid[r][c];
      const b = grid[r + 1][c];
      const d = grid[r + 2][c];
      if (a === -1 || b === -1 || d === -1) continue;
      if (a === b && b === d) return true;
    }
    return false;
  }

  function isValidPlacement(r, c, val) {
    const prev = grid[r][c];
    grid[r][c] = val;

    const row = grid[r];
    const { zeros: rowZeros, ones: rowOnes } = rowCounts(row);
    const rowRemaining = GRID_SIZE - rowZeros - rowOnes;
    if (rowZeros > 3 || rowOnes > 3) {
      grid[r][c] = prev;
      return false;
    }
    if (rowZeros + rowRemaining < 3 || rowOnes + rowRemaining < 3) {
      grid[r][c] = prev;
      return false;
    }

    const { zeros: colZeros, ones: colOnes } = colCounts(c);
    const colRemaining = GRID_SIZE - colZeros - colOnes;
    if (colZeros > 3 || colOnes > 3) {
      grid[r][c] = prev;
      return false;
    }
    if (colZeros + colRemaining < 3 || colOnes + colRemaining < 3) {
      grid[r][c] = prev;
      return false;
    }

    if (hasThreeInRow(row) || hasThreeInCol(c)) {
      grid[r][c] = prev;
      return false;
    }

    if (!rowUnique(r) || !colUnique(c)) {
      grid[r][c] = prev;
      return false;
    }

    if (rowComplete(r) && rowZeros !== 3) {
      grid[r][c] = prev;
      return false;
    }
    if (colComplete(c) && colZeros !== 3) {
      grid[r][c] = prev;
      return false;
    }

    grid[r][c] = prev;
    return true;
  }

  function backtrack(idx = 0) {
    if (idx === GRID_SIZE * GRID_SIZE) return true;
    const r = Math.floor(idx / GRID_SIZE);
    const c = idx % GRID_SIZE;
    if (grid[r][c] !== -1) return backtrack(idx + 1);

    const values = rng() < 0.5 ? [0, 1] : [1, 0];
    for (const val of values) {
      if (!isValidPlacement(r, c, val)) continue;
      grid[r][c] = val;
      if (backtrack(idx + 1)) return true;
      grid[r][c] = -1;
    }
    return false;
  }

  if (!backtrack()) return null;
  return grid;
}

function buildAdjacencyMap(adjacencies) {
  const map = new Map();
  function add(a, b, type) {
    const key = `${a.r},${a.c}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ r: b.r, c: b.c, type });
  }

  adjacencies.forEach(({ r, c, dir, type }) => {
    if (dir === 'right') {
      add({ r, c }, { r, c: c + 1 }, type);
      add({ r, c: c + 1 }, { r, c }, type);
    } else if (dir === 'down') {
      add({ r, c }, { r: r + 1, c }, type);
      add({ r: r + 1, c }, { r, c }, type);
    }
  });
  return map;
}

function countSolutions({ clues, adjacencies }, limit = 2) {
  const grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(-1));
  const adjacencyMap = buildAdjacencyMap(adjacencies);

  for (const clue of clues) {
    grid[clue.r][clue.c] = clue.bit;
  }

  function rowCounts(row) {
    let zeros = 0;
    let ones = 0;
    for (let c = 0; c < GRID_SIZE; c += 1) {
      if (row[c] === 0) zeros += 1;
      if (row[c] === 1) ones += 1;
    }
    return { zeros, ones };
  }

  function colCounts(c) {
    let zeros = 0;
    let ones = 0;
    for (let r = 0; r < GRID_SIZE; r += 1) {
      if (grid[r][c] === 0) zeros += 1;
      if (grid[r][c] === 1) ones += 1;
    }
    return { zeros, ones };
  }

  function rowComplete(r) {
    return grid[r].every(v => v !== -1);
  }

  function colComplete(c) {
    for (let r = 0; r < GRID_SIZE; r += 1) {
      if (grid[r][c] === -1) return false;
    }
    return true;
  }

  function rowUnique(r) {
    if (!rowComplete(r)) return true;
    for (let i = 0; i < GRID_SIZE; i += 1) {
      if (i === r) continue;
      if (!rowComplete(i)) continue;
      let same = true;
      for (let c = 0; c < GRID_SIZE; c += 1) {
        if (grid[i][c] !== grid[r][c]) {
          same = false;
          break;
        }
      }
      if (same) return false;
    }
    return true;
  }

  function colUnique(c) {
    if (!colComplete(c)) return true;
    for (let j = 0; j < GRID_SIZE; j += 1) {
      if (j === c) continue;
      if (!colComplete(j)) continue;
      let same = true;
      for (let r = 0; r < GRID_SIZE; r += 1) {
        if (grid[r][j] !== grid[r][c]) {
          same = false;
          break;
        }
      }
      if (same) return false;
    }
    return true;
  }

  function hasThreeInRow(row) {
    for (let c = 0; c < GRID_SIZE - 2; c += 1) {
      const a = row[c];
      const b = row[c + 1];
      const d = row[c + 2];
      if (a === -1 || b === -1 || d === -1) continue;
      if (a === b && b === d) return true;
    }
    return false;
  }

  function hasThreeInCol(c) {
    for (let r = 0; r < GRID_SIZE - 2; r += 1) {
      const a = grid[r][c];
      const b = grid[r + 1][c];
      const d = grid[r + 2][c];
      if (a === -1 || b === -1 || d === -1) continue;
      if (a === b && b === d) return true;
    }
    return false;
  }

  function adjacencyOk(r, c, val) {
    const key = `${r},${c}`;
    const hints = adjacencyMap.get(key);
    if (!hints) return true;
    for (const hint of hints) {
      const neighbor = grid[hint.r][hint.c];
      if (neighbor === -1) continue;
      if (hint.type === 'equal' && neighbor !== val) return false;
      if (hint.type === 'different' && neighbor === val) return false;
    }
    return true;
  }

  function isValidPlacement(r, c, val) {
    if (!adjacencyOk(r, c, val)) return false;
    const prev = grid[r][c];
    grid[r][c] = val;

    const row = grid[r];
    const { zeros: rowZeros, ones: rowOnes } = rowCounts(row);
    const rowRemaining = GRID_SIZE - rowZeros - rowOnes;
    if (rowZeros > 3 || rowOnes > 3) {
      grid[r][c] = prev;
      return false;
    }
    if (rowZeros + rowRemaining < 3 || rowOnes + rowRemaining < 3) {
      grid[r][c] = prev;
      return false;
    }

    const { zeros: colZeros, ones: colOnes } = colCounts(c);
    const colRemaining = GRID_SIZE - colZeros - colOnes;
    if (colZeros > 3 || colOnes > 3) {
      grid[r][c] = prev;
      return false;
    }
    if (colZeros + colRemaining < 3 || colOnes + colRemaining < 3) {
      grid[r][c] = prev;
      return false;
    }

    if (hasThreeInRow(row) || hasThreeInCol(c)) {
      grid[r][c] = prev;
      return false;
    }

    if (!rowUnique(r) || !colUnique(c)) {
      grid[r][c] = prev;
      return false;
    }

    if (rowComplete(r) && rowZeros !== 3) {
      grid[r][c] = prev;
      return false;
    }
    if (colComplete(c) && colZeros !== 3) {
      grid[r][c] = prev;
      return false;
    }

    grid[r][c] = prev;
    return true;
  }

  function findNextCell() {
    let best = null;
    let bestOptions = null;

    for (let r = 0; r < GRID_SIZE; r += 1) {
      for (let c = 0; c < GRID_SIZE; c += 1) {
        if (grid[r][c] !== -1) continue;
        const options = [];
        if (isValidPlacement(r, c, 0)) options.push(0);
        if (isValidPlacement(r, c, 1)) options.push(1);
        if (options.length === 0) return { r, c, options };
        if (!best || options.length < bestOptions.length) {
          best = { r, c };
          bestOptions = options;
          if (options.length === 1) return { r, c, options };
        }
      }
    }

    if (!best) return null;
    return { r: best.r, c: best.c, options: bestOptions };
  }

  function solve() {
    if (limit <= 0) return;
    const next = findNextCell();
    if (!next) {
      limit -= 1;
      return;
    }
    if (next.options.length === 0) return;

    for (const val of next.options) {
      if (!isValidPlacement(next.r, next.c, val)) continue;
      grid[next.r][next.c] = val;
      solve();
      if (limit <= 0) return;
      grid[next.r][next.c] = -1;
    }
  }

  // Validate initial clues against constraints
  for (let r = 0; r < GRID_SIZE; r += 1) {
    for (let c = 0; c < GRID_SIZE; c += 1) {
      const val = grid[r][c];
      if (val === -1) continue;
      if (!isValidPlacement(r, c, val)) return 0;
    }
  }

  solve();
  return 2 - limit;
}

function generateDescriptor(seedString) {
  const rng = makeRng(seedString);
  const maxAttempts = 40;
  const maxSelections = 40;
  const center = (GRID_SIZE - 1) / 2;
  const maxDist = Math.hypot(center, center);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const solution = generateFullGrid(rng);
    if (!solution) continue;

    for (let pickAttempt = 0; pickAttempt < maxSelections; pickAttempt += 1) {
      const clueCount = rngInt(rng, MIN_CLUES, MAX_CLUES);
      const adjCount = rngInt(rng, MIN_ADJ, MAX_ADJ);

      const allIndices = Array.from({ length: TOTAL_CELLS }, (_, i) => i);
      const weights = allIndices.map((idx) => {
        const r = Math.floor(idx / GRID_SIZE);
        const c = idx % GRID_SIZE;
        const dist = Math.hypot(r - center, c - center);
        return 1 + (1 - dist / maxDist) * 2.5;
      });

      const clueIndices = new Set();
      if (clueCount >= 4) {
        const quadrantPicks = [0, 1, 2, 3];
        quadrantPicks.forEach((q) => {
          const quadrantCandidates = allIndices.filter((idx) => {
            const r = Math.floor(idx / GRID_SIZE);
            const c = idx % GRID_SIZE;
            return quadrantFor(r, c) === q;
          });
          const quadrantWeights = quadrantCandidates.map((idx) => {
            const r = Math.floor(idx / GRID_SIZE);
            const c = idx % GRID_SIZE;
            const dist = Math.hypot(r - center, c - center);
            return 1 + (1 - dist / maxDist) * 2.5;
          });
          const pickSet = pickWeightedUnique(quadrantCandidates, quadrantWeights, 1, rng);
          pickSet.forEach(idx => clueIndices.add(idx));
        });
      }

      if (clueIndices.size < clueCount) {
        const remaining = allIndices.filter(idx => !clueIndices.has(idx));
        const remainingWeights = remaining.map((idx) => {
          const r = Math.floor(idx / GRID_SIZE);
          const c = idx % GRID_SIZE;
          const dist = Math.hypot(r - center, c - center);
          return 1 + (1 - dist / maxDist) * 2.5;
        });
        const picks = pickWeightedUnique(remaining, remainingWeights, clueCount - clueIndices.size, rng);
        picks.forEach(idx => clueIndices.add(idx));
      }

      const clues = Array.from(clueIndices).map(idx => {
        const r = Math.floor(idx / GRID_SIZE);
        const c = idx % GRID_SIZE;
        return { r, c, bit: solution[r][c] };
      });

      const adjacencyPairs = [];
      for (let r = 0; r < GRID_SIZE; r += 1) {
        for (let c = 0; c < GRID_SIZE; c += 1) {
          if (c < GRID_SIZE - 1) adjacencyPairs.push({ r, c, dir: 'right' });
          if (r < GRID_SIZE - 1) adjacencyPairs.push({ r, c, dir: 'down' });
        }
      }
      const adjWeights = adjacencyPairs.map((pair) => {
        const midR = pair.dir === 'right' ? pair.r : pair.r + 0.5;
        const midC = pair.dir === 'right' ? pair.c + 0.5 : pair.c;
        const dist = Math.hypot(midR - center, midC - center);
        return 1 + (1 - dist / maxDist) * 2;
      });
      const adjIndices = Array.from({ length: adjacencyPairs.length }, (_, i) => i);
      const adjPick = pickWeightedUnique(adjIndices, adjWeights, adjCount, rng);
      const adjacencies = Array.from(adjPick).map((idx) => {
        const pair = adjacencyPairs[idx];
        const { r, c, dir } = pair;
        const a = solution[r][c];
        const b = dir === 'right' ? solution[r][c + 1] : solution[r + 1][c];
        return { r, c, dir, type: a === b ? 'equal' : 'different' };
      });

      const hasEqual = adjacencies.some(adj => adj.type === 'equal');
      const hasDiff = adjacencies.some(adj => adj.type === 'different');
      if (!hasEqual || !hasDiff) {
        const remainingAdj = adjacencyPairs.filter((pair, idx) => !adjPick.has(idx));
        for (const pair of remainingAdj) {
          const { r, c, dir } = pair;
          const a = solution[r][c];
          const b = dir === 'right' ? solution[r][c + 1] : solution[r + 1][c];
          const type = a === b ? 'equal' : 'different';
          if (!hasEqual && type === 'equal') {
            adjacencies.pop();
            adjacencies.push({ r, c, dir, type });
            break;
          }
          if (!hasDiff && type === 'different') {
            adjacencies.pop();
            adjacencies.push({ r, c, dir, type });
            break;
          }
        }
      }

      const solutions = countSolutions({ clues, adjacencies }, 2);
      if (solutions === 1) {
        const solutionRows = solution.map(row => row.join(''));
        return { solution: solutionRows, clues, adjacencies };
      }
    }
  }

  const fallback = generateFullGrid(makeRng(seedString + '-fallback'));
  const fallbackRows = fallback ? fallback.map(row => row.join('')) : Array(GRID_SIZE).fill('0'.repeat(GRID_SIZE));
  return { solution: fallbackRows, clues: [], adjacencies: [] };
}

function setDescriptor(nextDescriptor) {
  descriptor = nextDescriptor;
  solutionGrid = descriptor.solution.map(row => row.split('').map(Number));
}

function loadState() {
  if (currentMode !== 'daily') return null;
  try {
    const raw = localStorage.getItem(getStateKey());
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.values)) return null;

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
  const values = cells.map(cell => cell.value);
  const payload = {
    values,
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
        invalid: false,
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

function clearInvalids() {
  cells.forEach((cell) => {
    cell.invalid = false;
  });
}

function markInvalid(r, c) {
  const cell = cells[r * GRID_SIZE + c];
  if (cell) cell.invalid = true;
}

function validateBoard() {
  clearInvalids();

  const grid = Array.from({ length: GRID_SIZE }, (_, r) =>
    Array.from({ length: GRID_SIZE }, (_, c) => {
      const cell = cells[r * GRID_SIZE + c];
      return cell?.value ?? null;
    })
  );

  if (descriptor?.adjacencies) {
    descriptor.adjacencies.forEach(({ r, c, dir, type }) => {
      const a = grid[r]?.[c];
      const b = dir === 'right' ? grid[r]?.[c + 1] : grid[r + 1]?.[c];
      if (a === null || b === null) return;
      const violates = type === 'equal' ? a !== b : a === b;
      if (violates) {
        markInvalid(r, c);
        if (dir === 'right') markInvalid(r, c + 1);
        else markInvalid(r + 1, c);
      }
    });
  }

  for (let r = 0; r < GRID_SIZE; r += 1) {
    let zeros = 0;
    let ones = 0;
    for (let c = 0; c < GRID_SIZE; c += 1) {
      if (grid[r][c] === 0) zeros += 1;
      if (grid[r][c] === 1) ones += 1;
    }
    if (zeros > 3) {
      for (let c = 0; c < GRID_SIZE; c += 1) {
        if (grid[r][c] === 0) markInvalid(r, c);
      }
    }
    if (ones > 3) {
      for (let c = 0; c < GRID_SIZE; c += 1) {
        if (grid[r][c] === 1) markInvalid(r, c);
      }
    }

    for (let c = 0; c < GRID_SIZE - 2; c += 1) {
      const a = grid[r][c];
      const b = grid[r][c + 1];
      const d = grid[r][c + 2];
      if (a !== null && a === b && b === d) {
        markInvalid(r, c);
        markInvalid(r, c + 1);
        markInvalid(r, c + 2);
      }
    }
  }

  for (let c = 0; c < GRID_SIZE; c += 1) {
    let zeros = 0;
    let ones = 0;
    for (let r = 0; r < GRID_SIZE; r += 1) {
      if (grid[r][c] === 0) zeros += 1;
      if (grid[r][c] === 1) ones += 1;
    }
    if (zeros > 3) {
      for (let r = 0; r < GRID_SIZE; r += 1) {
        if (grid[r][c] === 0) markInvalid(r, c);
      }
    }
    if (ones > 3) {
      for (let r = 0; r < GRID_SIZE; r += 1) {
        if (grid[r][c] === 1) markInvalid(r, c);
      }
    }

    for (let r = 0; r < GRID_SIZE - 2; r += 1) {
      const a = grid[r][c];
      const b = grid[r + 1][c];
      const d = grid[r + 2][c];
      if (a !== null && a === b && b === d) {
        markInvalid(r, c);
        markInvalid(r + 1, c);
        markInvalid(r + 2, c);
      }
    }
  }

  for (let r = 0; r < GRID_SIZE; r += 1) {
    const row = grid[r];
    if (row.some(v => v === null)) continue;
    for (let r2 = r + 1; r2 < GRID_SIZE; r2 += 1) {
      const row2 = grid[r2];
      if (row2.some(v => v === null)) continue;
      let same = true;
      for (let c = 0; c < GRID_SIZE; c += 1) {
        if (row[c] !== row2[c]) {
          same = false;
          break;
        }
      }
      if (same) {
        for (let c = 0; c < GRID_SIZE; c += 1) {
          markInvalid(r, c);
          markInvalid(r2, c);
        }
      }
    }
  }

  for (let c = 0; c < GRID_SIZE; c += 1) {
    const col = [];
    for (let r = 0; r < GRID_SIZE; r += 1) col.push(grid[r][c]);
    if (col.some(v => v === null)) continue;
    for (let c2 = c + 1; c2 < GRID_SIZE; c2 += 1) {
      const col2 = [];
      for (let r = 0; r < GRID_SIZE; r += 1) col2.push(grid[r][c2]);
      if (col2.some(v => v === null)) continue;
      let same = true;
      for (let r = 0; r < GRID_SIZE; r += 1) {
        if (col[r] !== col2[r]) {
          same = false;
          break;
        }
      }
      if (same) {
        for (let r = 0; r < GRID_SIZE; r += 1) {
          markInvalid(r, c);
          markInvalid(r, c2);
        }
      }
    }
  }

  cells.forEach(updateCellAppearance);
}

function updateCellAppearance(cell) {
  if (!cell.element) return;
  const { element } = cell;
  element.textContent = cell.value === null ? '' : cell.value.toString();
  element.classList.toggle('filled', cell.value !== null);
  element.classList.toggle('clue', cell.isClue);
  element.classList.toggle('value-0', cell.value === 0);
  element.classList.toggle('value-1', cell.value === 1);
  element.classList.toggle('invalid', cell.invalid);
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

function updateShowSolutionButton() {
  if (!els.showSolutionBtn) return;
  if (currentMode === 'practice' && !solutionShown && !isComplete) {
    els.showSolutionBtn.classList.remove('hidden');
  } else {
    els.showSolutionBtn.classList.add('hidden');
  }
}

function resetSolutionUI() {
  solutionShown = false;
  els.solutionActions?.classList.add('hidden');
  updateShowSolutionButton();
  els.pauseBtn?.classList.remove('hidden');
  els.resetBtn?.classList.remove('hidden');
}

function applySavedValues(savedValues) {
  if (!Array.isArray(savedValues)) return;
  cells.forEach((cell, idx) => {
    if (cell.isClue) return;
    const value = savedValues[idx];
    cell.value = value === 0 || value === 1 ? value : null;
  });
  validateBoard();
}

function handleCellClick(event) {
  const index = Number(event.currentTarget.dataset.index);
  const cell = cells[index];
  if (!cell || cell.isClue || isComplete) return;

  if (!timerStarted) startTimer();
  if (isPaused) resumeTimer();

  const nextValue = cell.value === null ? 0 : cell.value === 0 ? 1 : null;
  cell.value = nextValue;
  updateCellAppearance(cell);
  updateProgressText();
  validateBoard();
  saveProgress();

  if (cells.every(c => c.value !== null)) {
    validateSolution();
  }

  shell?.update();
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

function getElapsedMs() {
  if (!timerStarted) return baseElapsed;
  if (isPaused) return baseElapsed;
  return baseElapsed + (performance.now() - startTimestamp);
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
  if (isComplete) return;
  completionMs = getElapsedMs();
  baseElapsed = completionMs;
  isComplete = true;
  isPaused = true;
  timerStarted = true;
  saveProgress();
  shell?.update();
}

function showSolution() {
  if (!solutionGrid) {
    shell?.showToast('Solution not available for this puzzle.');
    return;
  }
  solutionShown = true;
  cells.forEach(cell => {
    if (cell.isClue) return;
    cell.value = solutionGrid[cell.r][cell.c];
    cell.invalid = false;
    updateCellAppearance(cell);
  });
  updateProgressText();
  isComplete = true;
  isPaused = true;
  timerStarted = true;
  completionMs = getElapsedMs();
  shell?.showToast('Solution revealed!');
  els.showSolutionBtn?.classList.add('hidden');
  els.solutionActions?.classList.remove('hidden');
  els.pauseBtn?.classList.add('hidden');
  els.resetBtn?.classList.add('hidden');
  shell?.update();
}

function resetPuzzle({ resetTimer }) {
  cells.forEach(cell => {
    if (!cell.isClue) {
      cell.value = null;
      updateCellAppearance(cell);
    }
    cell.invalid = false;
  });
  isComplete = false;
  completionMs = null;

  if (resetTimer) {
    baseElapsed = 0;
    startTimestamp = 0;
    timerStarted = false;
    isPaused = false;
  }

  updateProgressText();
  validateBoard();
  resetSolutionUI();
  saveProgress();
  shell?.update();
}

function setDateLabel() {
  if (!els.puzzleDate) return;
  if (currentMode === 'practice') {
    els.puzzleDate.textContent = 'Practice';
    return;
  }
  els.puzzleDate.textContent = puzzleId;
}

function updateGridLabel() {
  if (els.gridSize) {
    els.gridSize.textContent = '6 × 6';
  }
}

function initState() {
  const saved = loadState();
  baseElapsed = saved?.timeMs ?? 0;
  timerStarted = saved?.timerStarted ?? false;
  isPaused = saved?.isPaused ?? false;
  isComplete = saved?.isComplete ?? false;
  completionMs = saved?.completionMs ?? null;
  applySavedValues(saved?.values || []);
  validateBoard();
}

function initShell() {
  if (shell) return;

  shell = createShellController({
    gameId: 'bits',
    getMode: () => currentMode,
    getPuzzleId: () => puzzleId,
    getGridLabel: () => '6x6 Binary',
    getElapsedMs: () => getElapsedMs(),
    formatTime,
    autoStartOnProgress: true,
    isComplete: () => isComplete,
    isPaused: () => isPaused,
    isStarted: () => timerStarted,
    hasProgress: () => cells.some(cell => !cell.isClue && cell.value !== null),
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
      gameName: 'Bits',
      shareUrl: 'https://dailygrid.app/games/bits/',
      gridLabel: '6x6 Binary'
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
    gameName: 'Bits',
    logoPath: '/games/bits/bits-logo.jpg',
    accent: '#5bff94',
    accentSoft: 'rgba(91, 255, 148, 0.12)',
    backgroundStart: '#010b05',
    backgroundEnd: '#02140d',
    dateText: puzzleDate,
    timeText: formatTime(finalTime || 0),
    gridLabel: 'Grid 6x6',
    footerText: 'dailygrid.app/games/bits'
  });
}

function resetPracticePuzzle() {
  puzzleSeed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  setDescriptor(generateDescriptor(puzzleSeed));
  puzzleId = getPuzzleIdForMode('practice');
  buildCells();
  createGrid();
  baseElapsed = 0;
  startTimestamp = 0;
  timerStarted = false;
  isPaused = false;
  isComplete = false;
  completionMs = null;
  resetSolutionUI();
  updateProgressText();
  validateBoard();
  updateGridLabel();
  setDateLabel();
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
  setDescriptor(generateDescriptor(puzzleSeed));
  puzzleId = getPuzzleIdForMode(mode);
  buildCells();
  createGrid();
  initState();
  updateProgressText();
  validateBoard();
  updateGridLabel();
  setDateLabel();
  resetSolutionUI();
  shell?.update();
}

function ensureTicker() {
  if (tickInterval) return;
  tickInterval = window.setInterval(() => {
    updateShowSolutionButton();
    shell?.update();
  }, 200);
}

function init() {
  puzzleSeed = getPTDateYYYYMMDD();
  setDescriptor(generateDescriptor(puzzleSeed));
  puzzleId = getPuzzleIdForMode(currentMode);
  buildCells();
  createGrid();
  initState();
  updateProgressText();
  validateBoard();
  updateGridLabel();
  setDateLabel();
  initShell();
  ensureTicker();
  resetSolutionUI();
  shell?.update();
}

document.addEventListener('DOMContentLoaded', () => {
  init();
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
