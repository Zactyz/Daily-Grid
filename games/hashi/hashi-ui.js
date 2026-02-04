import { getPTDateYYYYMMDD, formatTime, getOrCreateAnonId } from './hashi-utils.js';
import { getUncompletedGames } from '../common/games.js';
import { buildShareText, shareWithFallback, showShareFeedback, formatDateForShare } from '../common/share.js';

const GRID_SIZE = 7;
const CANVAS_SIZE = 700;
const PADDING = 70;
const ISLAND_RADIUS = 22;
const BRIDGE_GAP = 8;

const puzzleId = getPTDateYYYYMMDD();

const PUZZLE = {
  puzzleId,
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
  timer: document.getElementById('timer'),
  progress: document.getElementById('progress-text'),
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
  puzzleDate: document.getElementById('puzzle-date'),
  islandCount: document.getElementById('island-count'),
  nextGamePromo: document.getElementById('next-game-promo'),
  nextGameLogo: document.getElementById('next-game-logo'),
  nextGameText: document.getElementById('next-game-text'),
  nextGameLink: document.getElementById('next-game-link')
};

const islandMap = new Map(PUZZLE.islands.map(i => [i.id, i]));
const bridges = new Map();
let selected = null;
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
    completionMs = baseElapsed + (timerRunning ? Date.now() - startTimestamp : 0);
    completePuzzle();
  }
}

function handleCanvasClick(event) {
  if (!els.canvas || isComplete) return;
  if (isPrestart) {
    dismissStartOverlay();
    startTimer();
  } else if (!timerRunning) {
    startTimer();
  }
  if (timerPaused) resumeTimer();

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

function dismissStartOverlay() {
  isPrestart = false;
  els.startOverlay?.classList.add('hidden');
}

function showPauseOverlay() {
  els.pauseOverlay?.classList.remove('hidden');
}

function hidePauseOverlay() {
  els.pauseOverlay?.classList.add('hidden');
}

async function loadLeaderboard(container) {
  if (!container) return;
  container.innerHTML = '<p class="text-center text-xs text-zinc-400 py-4">Loading leaderboard…</p>';
  try {
    const response = await fetch(`/api/hashi/leaderboard?puzzleId=${puzzleId}`);
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
    const response = await fetch('/api/hashi/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ puzzleId, anonId, timeMs, hintsUsed: 0 })
    });
    const data = await response.json();
    if (data.success) {
      lastRank = data.rank;
      els.percentileMsg && (els.percentileMsg.textContent = `Rank #${data.rank} • Top ${data.percentile}%`);
      if (data.rank <= 10) {
        els.claimForm?.classList.remove('hidden');
      }
    }
  } catch (error) {
    console.warn('Score submit failed', error);
  }

  try {
    localStorage.setItem(`dailygrid_hashi_submitted_${puzzleId}`, 'true');
  } catch (error) {
    console.warn('Failed to store completion flag', error);
  }

  await loadLeaderboard(els.completionLeaderboard);
  updateNextGamePromo();
}

function updateNextGamePromo() {
  if (!els.nextGamePromo) return;
  const next = getUncompletedGames('hashi', puzzleId)[0];
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
    gameName: 'Bridgeworks',
    puzzleLabel: formatDateForShare(puzzleId),
    gridLabel: 'Bridgeworks',
    timeText: formatTime(completionMs || 0),
    shareUrl: window.location.href
  });
  shareWithFallback({
    shareText,
    shareTitle: 'Bridgeworks by Daily Grid',
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
    const response = await fetch('/api/hashi/claim-initials', {
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
  els.canvas?.addEventListener('click', handleCanvasClick);
  els.startBtn?.addEventListener('click', () => {
    dismissStartOverlay();
    startTimer();
  });
  els.resumeBtn?.addEventListener('click', () => {
    hidePauseOverlay();
    resumeTimer();
  });
  els.pauseBtn?.addEventListener('click', () => {
    pauseTimer();
    showPauseOverlay();
  });
  els.resetBtn?.addEventListener('click', () => {
    bridges.clear();
    selected = null;
    isComplete = false;
    completionMs = null;
    hasSubmittedScore = false;
    lastRank = null;
    isPrestart = true;
    els.startOverlay?.classList.remove('hidden');
    hidePauseOverlay();
    resetTimer();
    updateProgressText();
    draw();
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
  if (els.islandCount) els.islandCount.textContent = String(PUZZLE.islands.length);
  updateTimerDisplay(0);
  updateProgressText();
  draw();
  bindEvents();
}

init();
