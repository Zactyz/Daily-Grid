import { getPTDateYYYYMMDD, formatTime, formatDateForShare, getOrCreateAnonId } from '../common/utils.js';
import { buildShareText, shareWithFallback, showShareFeedback } from '../common/share.js';
import { getGameMeta, getUncompletedGames } from '../common/games.js';
import { PipesEngine } from './pipes-engine.js';
import { PipesRenderer } from './pipes-renderer.js';
import { PipesInput } from './pipes-input.js';
import { fetchDescriptor, GRID_SIZE } from './pipes-utils.js';

const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

const els = {};
let descriptor;
let engine;
let renderer;
let input;
let puzzleId = '';
let timerInterval = null;
let timerRunning = false;
let timerPaused = false;
let startTimestamp = 0;
let baseElapsed = 0;
let isPrestart = true;
let isComplete = false;
let completionMs = 0;
let hasSubmittedScore = false;

function mapElements() {
  els.canvas = document.getElementById('pipes-canvas');
  els.timer = document.getElementById('timer');
  els.progress = document.getElementById('progress-text');
  els.startOverlay = document.getElementById('start-overlay');
  els.pauseOverlay = document.getElementById('pause-overlay');
  els.pauseBtn = document.getElementById('pause-btn');
  els.resetBtn = document.getElementById('reset-btn');
  els.leaderboardBtn = document.getElementById('leaderboard-btn');
  els.completionModal = document.getElementById('completion-modal');
  els.completionTime = document.getElementById('completion-time');
  els.percentileMsg = document.getElementById('percentile-msg');
  els.completionLeaderboard = document.getElementById('completion-leaderboard-list');
  els.shareBtn = document.getElementById('share-btn');
  els.closeModalBtn = document.getElementById('close-modal-btn');
  els.claimForm = document.getElementById('claim-initials-form');
  els.claimMessage = document.getElementById('claim-message');
  els.initialsInput = document.getElementById('initials-input');
  els.nextGamePromo = document.getElementById('next-game-promo');
  els.nextGameLogo = document.getElementById('next-game-logo');
  els.nextGameText = document.getElementById('next-game-text');
  els.nextGameLink = document.getElementById('next-game-link');
  els.puzzleDate = document.getElementById('puzzle-date');
  els.leaderboardModal = document.getElementById('leaderboard-modal');
  els.leaderboardModalList = document.getElementById('leaderboard-modal-list');
  els.closeLeaderboard = document.getElementById('close-leaderboard-btn');
}

async function start() {
  mapElements();
  descriptor = await fetchDescriptor();
  puzzleId = descriptor.puzzleId || getPTDateYYYYMMDD();
  els.puzzleDate.textContent = formatDateForShare(puzzleId);
  engine = new PipesEngine(descriptor);
  renderer = new PipesRenderer(els.canvas, engine);
  renderer.render();
  input = new PipesInput(els.canvas, engine, renderer, onBoardInteraction);
  bindEvents();
  updateProgress();
  updateTimerDisplay();
}

function bindEvents() {
  window.addEventListener('resize', () => {
    renderer.resize();
    renderer.render();
  });
  els.pauseBtn?.addEventListener('click', togglePause);
  els.resetBtn?.addEventListener('click', resetPuzzle);
  els.leaderboardBtn?.addEventListener('click', () => {
    els.leaderboardModal?.classList.remove('hidden');
    loadLeaderboard(els.leaderboardModalList);
  });
  els.closeLeaderboard?.addEventListener('click', () => {
    els.leaderboardModal?.classList.add('hidden');
  });
  els.shareBtn?.addEventListener('click', handleShare);
  els.closeModalBtn?.addEventListener('click', hideCompletionModal);
  els.claimForm?.addEventListener('submit', submitInitials);
}

function onBoardInteraction() {
  if (isComplete) return;
  if (isPrestart) {
    dismissStartOverlay();
    startTimer();
  } else if (!timerRunning) {
    startTimer();
  }
  renderer.render();
  updateProgress();
  if (engine.isSolved()) {
    completePuzzle();
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
  timerInterval = window.setInterval(updateTimerDisplay, 250);
}

function togglePause() {
  if (isComplete) return;
  if (!timerRunning) return;
  if (timerPaused) {
    resumeTimer();
  } else {
    pauseTimer();
  }
}

function pauseTimer() {
  if (!timerRunning || timerPaused) return;
  timerPaused = true;
  baseElapsed += performance.now() - startTimestamp;
  clearInterval(timerInterval);
  timerInterval = null;
  els.pauseOverlay?.classList.remove('hidden');
  els.pauseBtn.textContent = 'Resume';
}

function resumeTimer() {
  if (!timerRunning || !timerPaused) return;
  timerPaused = false;
  startTimestamp = performance.now();
  timerInterval = window.setInterval(updateTimerDisplay, 250);
  els.pauseOverlay?.classList.add('hidden');
  els.pauseBtn.textContent = 'Pause';
}

function stopTimer() {
  timerRunning = false;
  timerPaused = false;
  clearInterval(timerInterval);
  timerInterval = null;
  baseElapsed = 0;
  startTimestamp = performance.now();
  els.pauseOverlay?.classList.add('hidden');
  els.pauseBtn.textContent = 'Pause';
  updateTimerDisplay();
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

function resetPuzzle() {
  stopTimer();
  isPrestart = true;
  isComplete = false;
  hasSubmittedScore = false;
  completionMs = 0;
  engine = new PipesEngine(descriptor);
  renderer.setEngine(engine);
  renderer.render();
  input.setEngine(engine);
  els.completionModal?.classList.add('hidden');
  els.nextGamePromo?.classList.add('hidden');
  els.claimForm?.classList.add('hidden');
  els.claimMessage && (els.claimMessage.textContent = '');
  els.startOverlay?.classList.remove('hidden');
  els.leaderboardBtn?.classList.add('hidden');
  updateProgress();
}

function completePuzzle() {
  if (isComplete) return;
  isComplete = true;
  completionMs = Math.max(3000, getElapsedMs());
  stopTimer();
  els.completionTime && (els.completionTime.textContent = `Time: ${formatTime(completionMs)}`);
  els.completionModal?.classList.remove('hidden');
  els.percentileMsg?.textContent = 'Submitting score...';
  els.leaderboardBtn?.classList.remove('hidden');
  updateNextGamePromo();
  submitScore(completionMs);
  loadLeaderboard(els.completionLeaderboard);
}

async function submitScore(timeMs) {
  if (hasSubmittedScore) return;
  const payload = {
    puzzleId,
    anonId: getOrCreateAnonId(),
    timeMs: Math.max(3000, Math.min(timeMs, 3600000)),
    hintsUsed: 0
  };
  try {
    const response = await fetch('/api/pipes/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('Score submission failed');
    const data = await response.json();
    hasSubmittedScore = true;
    updatePercentile(data);
    if (data.rank <= 10) {
      els.claimForm?.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Flowline score submission failed', error);
    if (els.percentileMsg) {
      els.percentileMsg.textContent = 'Leaderboard temporarily unavailable';
    }
  }
}

function updatePercentile(data) {
  if (!els.percentileMsg) return;
  const percentileValue = typeof data.percentile === 'number'
    ? Math.max(0, Math.min(100, data.percentile))
    : null;
  els.percentileMsg.textContent = percentileValue !== null
    ? `You ranked ${data.rank} / ${data.total} (top ${percentileValue}%)`
    : `You ranked ${data.rank} / ${data.total}`;
}

async function loadLeaderboard(container) {
  if (!container) return;
  container.innerHTML = '<p class="text-center text-xs text-zinc-400 py-4">Loading leaderboard…</p>';
  try {
    const response = await fetch(`/api/pipes/leaderboard?puzzleId=${puzzleId}`);
    if (!response.ok) throw new Error('Leaderboard request failed');
    const data = await response.json();
    renderLeaderboard(container, data.top10 || []);
    if ((data.top10?.length || 0) === 0) {
      container.innerHTML = '<p class="text-center text-xs text-zinc-400 py-4">No entries yet — be the first.</p>';
    }
  } catch (error) {
    console.error('Leaderboard error', error);
    container.innerHTML = '<p class="text-center text-xs text-zinc-400 py-4">Unable to load leaderboard.</p>';
  }
}

function renderLeaderboard(container, entries) {
  if (!entries || entries.length === 0) {
    container.innerHTML = '<p class="text-center text-xs text-zinc-400 py-4">No entries yet.</p>';
    return;
  }
  container.innerHTML = entries.map((entry) => `
    <div class="flex items-center justify-between px-3 py-2 text-xs border-b border-white/5">
      <span class="text-sm font-semibold tracking-wide">${entry.rank}. ${entry.initials || '---'}</span>
      <span>${formatTime(entry.timeMs)}</span>
    </div>
  `).join('');
}

function updateProgress() {
  const matched = engine.getCompletionCount();
  const percent = Math.floor((matched / TOTAL_CELLS) * 100);
  if (els.progress) {
    els.progress.textContent = `Aligned segments: ${matched} / ${TOTAL_CELLS} • ${percent}%`;
  }
}

function updateNextGamePromo() {
  const next = getUncompletedGames('pipes', puzzleId)[0];
  if (!next) {
    els.nextGamePromo?.classList.add('hidden');
    return;
  }
  els.nextGamePromo?.classList.remove('hidden');
  els.nextGameLogo && (els.nextGameLogo.src = next.logo);
  els.nextGameLogo && (els.nextGameLogo.alt = `${next.name} logo`);
  els.nextGameText && (els.nextGameText.textContent = `Play ${next.name}`);
  if (els.nextGameLink) {
    els.nextGameLink.href = next.path;
    els.nextGameLink.title = `Continue with ${next.name}`;
  }
}

function handleShare() {
  const shareText = buildShareText({
    gameName: 'Flowline',
    puzzleLabel: formatDateForShare(puzzleId),
    gridLabel: '7×7 neon flow',
    timeText: formatTime(completionMs),
    shareUrl: window.location.href
  });
  shareWithFallback({
    shareText,
    shareTitle: 'Flowline by Daily Grid',
    shareUrl: window.location.href,
    onCopy() {
      showShareFeedback(els.shareBtn, 'Copied');
    },
    onError() {
      showShareFeedback(els.shareBtn, 'Failed');
    }
  });
}

async function submitInitials(event) {
  event.preventDefault();
  const initials = (els.initialsInput?.value || '').trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(initials)) {
    els.claimMessage && (els.claimMessage.textContent = 'Enter 1–3 letters.');
    return;
  }
  const payload = {
    puzzleId,
    anonId: getOrCreateAnonId(),
    initials
  };
  try {
    const response = await fetch('/api/pipes/claim-initials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('Claim failed');
    els.claimMessage && (els.claimMessage.textContent = 'Claim saved!');
  } catch (error) {
    console.error('Claim error', error);
    els.claimMessage && (els.claimMessage.textContent = 'Unable to save.');
  }
}

function hideCompletionModal() {
  els.completionModal?.classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  start();
});
