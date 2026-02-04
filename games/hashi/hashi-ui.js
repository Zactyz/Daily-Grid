import { getPTDateYYYYMMDD, formatTime, getOrCreateAnonId } from '../common/utils.js';
import { createShellController } from '../common/shell-controller.js';
import { formatDateForShare } from '../common/share.js';
import { buildShareCard } from '../common/share-card.js';

const GRID_SIZE = 7;
const CANVAS_SIZE = 700;
const PADDING = 70;
const ISLAND_RADIUS = 22;
const BRIDGE_GAP = 8;
const STATE_PREFIX = 'dailygrid_hashi_state_';

const PUZZLE = {
  islands: [
    { id: 'A', r: 0, c: 1, required: 3 },
    { id: 'B', r: 0, c: 5, required: 2 },
    { id: 'C', r: 2, c: 0, required: 2 },
    { id: 'D', r: 2, c: 3, required: 4 },
    { id: 'E', r: 2, c: 6, required: 2 },
    { id: 'F', r: 4, c: 2, required: 3 },
    { id: 'G', r: 4, c: 5, required: 2 },
    { id: 'H', r: 6, c: 1, required: 2 },
    { id: 'I', r: 6, c: 4, required: 2 }
  ]
};

const els = {
  canvas: document.getElementById('hashi-canvas'),
  progress: document.getElementById('progress-text'),
  puzzleDate: document.getElementById('puzzle-date'),
  islandCount: document.getElementById('island-count')
};

const islandMap = new Map(PUZZLE.islands.map(i => [i.id, i]));
const bridges = new Map();
let selected = null;
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

function canvasPointFor(island) {
  const cell = (CANVAS_SIZE - PADDING * 2) / (GRID_SIZE - 1);
  return {
    x: PADDING + island.c * cell,
    y: PADDING + island.r * cell
  };
}

function edgeId(a, b) {
  return a < b ? `${a}--${b}` : `${b}--${a}`;
}

function getBridgeCount(a, b) {
  return bridges.get(edgeId(a, b)) || 0;
}

function setBridgeCount(a, b, count) {
  if (count <= 0) {
    bridges.delete(edgeId(a, b));
  } else {
    bridges.set(edgeId(a, b), Math.min(2, count));
  }
}

function islandsBetween(a, b) {
  const ia = islandMap.get(a);
  const ib = islandMap.get(b);
  if (!ia || !ib) return [];
  const between = [];
  if (ia.r === ib.r) {
    const row = ia.r;
    const minC = Math.min(ia.c, ib.c);
    const maxC = Math.max(ia.c, ib.c);
    PUZZLE.islands.forEach((island) => {
      if (island.r === row && island.c > minC && island.c < maxC) between.push(island);
    });
  } else if (ia.c === ib.c) {
    const col = ia.c;
    const minR = Math.min(ia.r, ib.r);
    const maxR = Math.max(ia.r, ib.r);
    PUZZLE.islands.forEach((island) => {
      if (island.c === col && island.r > minR && island.r < maxR) between.push(island);
    });
  }
  return between;
}

function connectionOrientation(a, b) {
  const ia = islandMap.get(a);
  const ib = islandMap.get(b);
  if (!ia || !ib) return null;
  if (ia.r === ib.r) return 'h';
  if (ia.c === ib.c) return 'v';
  return null;
}

function wouldCross(a, b) {
  const ia = islandMap.get(a);
  const ib = islandMap.get(b);
  const orientation = connectionOrientation(a, b);
  if (!orientation) return true;

  const aX = ia.c;
  const aY = ia.r;
  const bX = ib.c;
  const bY = ib.r;

  for (const [key, count] of bridges.entries()) {
    if (count <= 0) continue;
    const [cId, dId] = key.split('--');
    if (cId === a || cId === b || dId === a || dId === b) continue;
    const c = islandMap.get(cId);
    const d = islandMap.get(dId);
    if (!c || !d) continue;
    const otherOrientation = connectionOrientation(cId, dId);
    if (otherOrientation === orientation) continue;

    const cX = c.c;
    const cY = c.r;
    const dX = d.c;
    const dY = d.r;

    if (orientation === 'h') {
      const minX = Math.min(aX, bX);
      const maxX = Math.max(aX, bX);
      const minY = Math.min(cY, dY);
      const maxY = Math.max(cY, dY);
      const crossX = cX;
      const crossY = aY;
      if (crossX > minX && crossX < maxX && crossY > minY && crossY < maxY) {
        return true;
      }
    } else {
      const minX = Math.min(cX, dX);
      const maxX = Math.max(cX, dX);
      const minY = Math.min(aY, bY);
      const maxY = Math.max(aY, bY);
      const crossX = aX;
      const crossY = cY;
      if (crossX > minX && crossX < maxX && crossY > minY && crossY < maxY) {
        return true;
      }
    }
  }
  return false;
}

function isValidConnection(a, b) {
  if (a === b) return false;
  const orientation = connectionOrientation(a, b);
  if (!orientation) return false;
  if (islandsBetween(a, b).length > 0) return false;
  if (wouldCross(a, b)) return false;
  return true;
}

function updateProgressText() {
  if (!els.progress) return;
  if (isComplete) {
    els.progress.textContent = 'All islands connected.';
    return;
  }
  if (selected) {
    els.progress.textContent = `Selected island ${selected}. Choose a partner.`;
    return;
  }
  els.progress.textContent = 'Choose an island to start bridging.';
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
  bridges.clear();
  selected = null;
  isComplete = false;
  completionMs = null;

  if (resetTimer) {
    baseElapsed = 0;
    startTimestamp = 0;
    timerStarted = false;
    isPaused = false;
  }

  updateProgressText();
  draw();
  saveProgress();
  shell?.update();
}

function getIslandProgress() {
  const counts = new Map();
  PUZZLE.islands.forEach((island) => counts.set(island.id, 0));
  bridges.forEach((count, key) => {
    const [a, b] = key.split('--');
    counts.set(a, (counts.get(a) || 0) + count);
    counts.set(b, (counts.get(b) || 0) + count);
  });
  return counts;
}

function isAllConnected() {
  if (PUZZLE.islands.length === 0) return false;
  const visited = new Set();
  const stack = [PUZZLE.islands[0].id];
  while (stack.length) {
    const current = stack.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    for (const [key, count] of bridges.entries()) {
      if (count <= 0) continue;
      const [a, b] = key.split('--');
      if (a === current && !visited.has(b)) stack.push(b);
      if (b === current && !visited.has(a)) stack.push(a);
    }
  }
  return visited.size === PUZZLE.islands.length;
}

function checkCompletion() {
  const counts = getIslandProgress();
  const allMatch = PUZZLE.islands.every((island) => counts.get(island.id) === island.required);
  if (allMatch && isAllConnected()) {
    isComplete = true;
    completionMs = getElapsedMs();
    baseElapsed = completionMs;
    isPaused = true;
    timerStarted = true;
    saveProgress();
    shell?.update();
  }
}

function handleCanvasClick(event) {
  if (!els.canvas || isComplete) return;
  if (!timerStarted) startTimer();
  if (isPaused) resumeTimer();

  const rect = els.canvas.getBoundingClientRect();
  const scaleX = els.canvas.width / rect.width;
  const scaleY = els.canvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  const clicked = PUZZLE.islands.find((island) => {
    const pos = canvasPointFor(island);
    const dx = x - pos.x;
    const dy = y - pos.y;
    return Math.hypot(dx, dy) <= ISLAND_RADIUS;
  });
  if (!clicked) return;

  if (!selected) {
    selected = clicked.id;
    updateProgressText();
    draw();
    return;
  }

  if (selected === clicked.id) {
    selected = null;
    updateProgressText();
    draw();
    return;
  }

  if (!isValidConnection(selected, clicked.id)) {
    selected = clicked.id;
    updateProgressText();
    draw();
    return;
  }

  const current = getBridgeCount(selected, clicked.id);
  const next = (current + 1) % 3;
  setBridgeCount(selected, clicked.id, next);
  selected = null;
  updateProgressText();
  draw();
  checkCompletion();
  saveProgress();
  shell?.update();
}

function drawGrid(ctx) {
  const cell = (CANVAS_SIZE - PADDING * 2) / (GRID_SIZE - 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i < GRID_SIZE; i += 1) {
    const x = PADDING + i * cell;
    ctx.beginPath();
    ctx.moveTo(x, PADDING);
    ctx.lineTo(x, CANVAS_SIZE - PADDING);
    ctx.stroke();

    const y = PADDING + i * cell;
    ctx.beginPath();
    ctx.moveTo(PADDING, y);
    ctx.lineTo(CANVAS_SIZE - PADDING, y);
    ctx.stroke();
  }
}

function drawBridgeLine(ctx, x1, y1, x2, y2) {
  const pad = ISLAND_RADIUS - 6;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const sx = x1 + Math.cos(angle) * pad;
  const sy = y1 + Math.sin(angle) * pad;
  const ex = x2 - Math.cos(angle) * pad;
  const ey = y2 - Math.sin(angle) * pad;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
}

function drawBridges(ctx) {
  for (const [key, count] of bridges.entries()) {
    if (count <= 0) continue;
    const [aId, bId] = key.split('--');
    const a = islandMap.get(aId);
    const b = islandMap.get(bId);
    if (!a || !b) continue;
    const aPos = canvasPointFor(a);
    const bPos = canvasPointFor(b);
    const horizontal = a.r === b.r;
    const offset = count === 2 ? BRIDGE_GAP : 0;

    ctx.strokeStyle = '#f5d0a7';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';

    if (horizontal) {
      const y = aPos.y;
      drawBridgeLine(ctx, aPos.x, y - offset, bPos.x, y - offset);
      if (count === 2) {
        drawBridgeLine(ctx, aPos.x, y + offset, bPos.x, y + offset);
      }
    } else {
      const x = aPos.x;
      drawBridgeLine(ctx, x - offset, aPos.y, x - offset, bPos.y);
      if (count === 2) {
        drawBridgeLine(ctx, x + offset, aPos.y, x + offset, bPos.y);
      }
    }
  }
}

function drawIslands(ctx) {
  const counts = getIslandProgress();
  PUZZLE.islands.forEach((island) => {
    const pos = canvasPointFor(island);
    const current = counts.get(island.id) || 0;
    const satisfied = current === island.required;

    ctx.fillStyle = satisfied ? '#1a120e' : '#2a1b14';
    ctx.strokeStyle = selected === island.id ? '#f5d0a7' : '#d8a06a';
    ctx.lineWidth = selected === island.id ? 4 : 2;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, ISLAND_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = satisfied ? '#f5d0a7' : '#f0e2d4';
    ctx.font = 'bold 18px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(island.required), pos.x, pos.y);

    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(245, 208, 167, 0.8)';
    ctx.fillText(`${current}`, pos.x, pos.y + 18);
  });
}

function draw() {
  if (!els.canvas) return;
  const ctx = els.canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.fillStyle = '#1a0f0c';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  drawGrid(ctx);
  drawBridges(ctx);
  drawIslands(ctx);
}

function loadState() {
  if (currentMode !== 'daily') return null;
  try {
    const raw = localStorage.getItem(getStateKey());
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.bridges)) return null;
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
  const bridgesData = Array.from(bridges.entries()).map(([key, count]) => ({ key, count }));
  const payload = {
    bridges: bridgesData,
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
  bridges.clear();
  if (saved?.bridges) {
    saved.bridges.forEach(({ key, count }) => {
      if (!key || typeof count !== 'number') return;
      bridges.set(key, count);
    });
  }
}

function initState() {
  const saved = loadState();
  applySavedState(saved);
  baseElapsed = saved?.timeMs ?? 0;
  timerStarted = saved?.timerStarted ?? false;
  isPaused = saved?.isPaused ?? false;
  isComplete = saved?.isComplete ?? false;
  completionMs = saved?.completionMs ?? null;
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
  bridges.clear();
  selected = null;
  baseElapsed = 0;
  startTimestamp = 0;
  timerStarted = false;
  isPaused = false;
  isComplete = false;
  completionMs = null;
  updateProgressText();
  setDateLabel();
  draw();
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
  puzzleId = getPuzzleIdForMode(mode);
  bridges.clear();
  selected = null;
  initState();
  updateProgressText();
  setDateLabel();
  draw();
  shell?.update();
}

function initShell() {
  if (shell) return;

  shell = createShellController({
    gameId: 'hashi',
    getMode: () => currentMode,
    getPuzzleId: () => puzzleId,
    getGridLabel: () => '7x7 Bridges',
    getElapsedMs: () => getElapsedMs(),
    formatTime,
    autoStartOnProgress: true,
    isComplete: () => isComplete,
    isPaused: () => isPaused,
    isStarted: () => timerStarted,
    hasProgress: () => bridges.size > 0,
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
      gameName: 'Bridgeworks',
      shareUrl: 'https://dailygrid.app/games/hashi/',
      gridLabel: '7x7 Bridges'
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
    gameName: 'Bridgeworks',
    logoPath: '/games/hashi/hashi-logo.svg',
    accent: '#E8B47A',
    accentSoft: 'rgba(232, 180, 122, 0.12)',
    backgroundStart: '#120A08',
    backgroundEnd: '#1a100b',
    dateText: puzzleDate,
    timeText: formatTime(finalTime || 0),
    gridLabel: 'Grid 7x7',
    footerText: 'dailygrid.app/games/hashi'
  });
}

function init() {
  if (els.islandCount) els.islandCount.textContent = String(PUZZLE.islands.length);
  puzzleSeed = getPTDateYYYYMMDD();
  puzzleId = getPuzzleIdForMode(currentMode);
  initState();
  updateProgressText();
  setDateLabel();
  draw();
  initShell();
  ensureTicker();
  shell?.update();
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  els.canvas?.addEventListener('click', handleCanvasClick);
  window.startPracticeMode = () => switchMode('practice');
  window.startDailyMode = () => switchMode('daily');
  window.addEventListener('beforeunload', saveProgress);
});
