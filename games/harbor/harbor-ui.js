import { getPTDateYYYYMMDD, getOrCreateAnonId, formatTime } from '../common/utils.js';
import { createShellController } from '../common/shell-controller.js';
import { formatDateForShare } from '../common/share.js';
import { buildShareCard } from '../common/share-card.js';
import { HarborEngine } from './harbor-engine.js';
import { applyPieceMove, applyGoalExit, clonePieces } from './harbor-puzzles.js';

const STATE_PREFIX = 'dailygrid_harbor_state_';
const ANIM_MS = 220;

const els = {
  board: document.getElementById('harbor-board'),
  progress: document.getElementById('progress-text'),
  gridSize: document.getElementById('grid-size'),
  puzzleDate: document.getElementById('puzzle-date')
};

let engine;
let shell;
let currentMode = 'daily';
let puzzleSeed = getPTDateYYYYMMDD();
let puzzleId = puzzleSeed;
let completionMs = null;
let lastTs = performance.now();
let lastSaveTs = 0;
let executing = false;

const stateKey = () => `${STATE_PREFIX}${currentMode}_${puzzleId}`;
const getPuzzleId = () => (currentMode === 'practice' ? `practice-${puzzleSeed}` : getPTDateYYYYMMDD());
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setLabels() {
  els.gridSize.textContent = engine.getGridLabel();
  els.puzzleDate.textContent = currentMode === 'practice' ? 'Practice' : puzzleId;
}

function updateProgress(message) {
  if (!els.progress) return;
  if (message) {
    els.progress.textContent = message;
    return;
  }
  if (engine.phase === 'executing') {
    els.progress.textContent = 'Running your sequence…';
    return;
  }
  if (engine.phase === 'rewinding') {
    els.progress.textContent = 'Wrong order — resetting…';
    return;
  }
  if (engine.isComplete) {
    els.progress.textContent = 'Exit cleared!';
    return;
  }
  const remaining = engine.pieceCount - engine.playerOrder.length;
  if (remaining === 0) {
    els.progress.textContent = 'All blocks selected — launching moves…';
    return;
  }
  els.progress.textContent = remaining === engine.pieceCount
    ? 'Tap blocks in the order they should move. The pink car must reach the exit.'
    : `${engine.playerOrder.length} of ${engine.pieceCount} selected • ${remaining} left`;
}

function renderBoard() {
  if (!els.board || !engine) return;
  els.board.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'harbor-grid';
  for (let i = 0; i < engine.width * engine.height; i += 1) {
    const cell = document.createElement('div');
    cell.className = 'harbor-cell';
    if (Math.floor(i / engine.width) === engine.exitRow && i % engine.width === engine.width - 1) {
      cell.classList.add('harbor-exit');
    }
    grid.appendChild(cell);
  }
  els.board.appendChild(grid);

  engine.pieces.forEach((piece) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'harbor-piece';
    if (piece.isGoal) el.classList.add('harbor-piece-goal');
    if (engine.phase === 'planning' && !executing) el.classList.add('harbor-piece-selectable');

    const idx = engine.getSelectionIndex(piece.id);
    if (idx >= 0) {
      el.classList.add('harbor-piece-selected');
      const badge = document.createElement('span');
      badge.className = 'harbor-piece-badge';
      badge.textContent = String(idx + 1);
      el.appendChild(badge);
    }

    const color = engine.getPieceColor(piece.id);
    el.style.setProperty('--piece-color', color);
    el.style.gridRow = piece.orient === 'H'
      ? `${piece.row + 1} / span 1`
      : `${piece.row + 1} / span ${piece.len}`;
    el.style.gridColumn = piece.orient === 'H'
      ? `${piece.col + 1} / span ${piece.len}`
      : `${piece.col + 1} / span 1`;

    el.setAttribute('aria-label', piece.isGoal ? 'Goal car' : `Block ${piece.id}`);
    el.addEventListener('click', () => handlePieceClick(piece.id));
    grid.appendChild(el);
  });
}

function save() {
  if (currentMode !== 'daily') return;
  localStorage.setItem(stateKey(), JSON.stringify({
    ...engine.exportState(),
    completionMs
  }));
}

function load() {
  if (currentMode !== 'daily') return;
  const raw = localStorage.getItem(stateKey());
  if (!raw) return;
  try {
    const state = JSON.parse(raw);
    engine.importState(state);
    completionMs = state.completionMs ?? null;
  } catch {
    // ignore bad local state
  }
}

function onPlanningChange() {
  if (!engine.timerStarted) engine.startTimer();
  if (engine.isPaused && !engine.isComplete) engine.resume();
  renderBoard();
  updateProgress();
  save();
  shell?.update();

  if (engine.allSelected() && !executing) {
    void runSequence();
  }
}

function handlePieceClick(pieceId) {
  if (engine.phase !== 'planning' || executing) return;
  if (!engine.toggleSelection(pieceId)) return;
  onPlanningChange();
}

async function runSequence() {
  if (executing) return;
  executing = true;
  engine.phase = 'executing';
  engine.pause();
  updateProgress();
  renderBoard();

  const applied = [];
  const movesMap = engine.template.moves;

  for (const pieceId of engine.playerOrder) {
    const before = clonePieces(engine.pieces);
    const move = movesMap[pieceId];
    const ok = applyPieceMove(engine.pieces, pieceId, move);
    renderBoard();
    await sleep(ANIM_MS);

    if (!ok) {
      await rewindSequence(applied);
      executing = false;
      return;
    }
    applied.push({ pieceId, before });
  }

  const beforeExit = clonePieces(engine.pieces);
  const exited = applyGoalExit(engine.pieces);
  renderBoard();
  await sleep(ANIM_MS);

  if (!exited) {
    applied.push({ pieceId: 'goal-exit', before: beforeExit });
    await rewindSequence(applied);
    executing = false;
    return;
  }

  engine.phase = 'planning';
  engine.isComplete = true;
  completionMs = engine.timeMs;
  engine.pause();
  executing = false;
  updateProgress();
  renderBoard();
  save();
  shell?.update();
}

async function rewindSequence(applied) {
  engine.phase = 'rewinding';
  updateProgress();

  for (let i = applied.length - 1; i >= 0; i -= 1) {
    engine.pieces = clonePieces(applied[i].before);
    renderBoard();
    await sleep(ANIM_MS * 0.75);
  }

  engine.playerOrder = [];
  engine.phase = 'planning';
  engine.resume();
  updateProgress();
  renderBoard();
  save();
  shell?.update();
}

function initPuzzle() {
  engine = new HarborEngine(puzzleId);
  load();
  setLabels();
  updateProgress();
  renderBoard();
  shell?.update();
}

function switchMode(mode) {
  currentMode = mode;
  puzzleSeed = mode === 'practice'
    ? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
    : getPTDateYYYYMMDD();
  puzzleId = getPuzzleId();
  completionMs = null;
  executing = false;
  initPuzzle();
}

window.startPracticeMode = () => switchMode('practice');
window.startDailyMode = () => switchMode('daily');

function resetGame({ resetTimer = true } = {}) {
  executing = false;
  engine.reset({ resetTimer });
  completionMs = null;
  updateProgress();
  renderBoard();
  save();
  shell?.update();
}

function initShell() {
  shell = createShellController({
    gameId: 'harbor',
    getMode: () => currentMode,
    getPuzzleId: () => puzzleId,
    getGridLabel: () => engine.getGridLabel(),
    getElapsedMs: () => engine.timeMs,
    formatTime,
    autoStartOnProgress: true,
    isComplete: () => engine.isComplete,
    isPaused: () => engine.isPaused,
    isStarted: () => engine.timerStarted,
    hasProgress: () => engine.playerOrder.length > 0,
    isSolutionShown: () => false,
    shouldShowCompletionModal: () => true,
    pause: () => { engine.pause(); save(); },
    resume: () => { engine.resume(); save(); },
    startGame: () => { engine.startTimer(); save(); },
    resetGame: () => resetGame({ resetTimer: false }),
    startReplay: () => {},
    exitReplay: () => {},
    onResetUI: () => {},
    onTryAgain: () => resetGame({ resetTimer: true }),
    onNextLevel: () => switchMode('practice'),
    onBackToDaily: () => switchMode('daily'),
    onPracticeInfinite: () => switchMode('practice'),
    onStartPractice: () => switchMode('practice'),
    onStartDaily: () => switchMode('daily'),
    getAnonId: () => getOrCreateAnonId(),
    getCompletionPayload: () => ({
      timeMs: Math.max(3000, Math.min(engine.timeMs, 3600000)),
      hintsUsed: 0
    }),
    getShareMeta: () => ({
      gameName: 'Harbor',
      shareUrl: 'https://dailygrid.app/games/harbor/',
      gridLabel: engine.getGridLabel(),
      accent: '#ff2d95'
    }),
    getShareFile: () => buildShareCard({
      gameName: 'Harbor',
      logoPath: '/games/harbor/harbor-logo.svg',
      accent: '#ff2d95',
      accentSoft: 'rgba(255,45,149,.12)',
      backgroundStart: '#070d18',
      backgroundEnd: '#101b35',
      dateText: formatDateForShare(getPTDateYYYYMMDD()),
      timeText: formatTime(completionMs ?? engine.timeMs),
      gridLabel: engine.getGridLabel(),
      footerText: 'dailygrid.app/games/harbor'
    }),
    getCompletionMs: () => completionMs,
    setCompletionMs: (ms) => { completionMs = ms; },
    isTimerRunning: () => engine.timerStarted && !engine.isPaused && !engine.isComplete && engine.phase === 'planning',
    disableReplay: false,
    pauseOnHide: true
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initPuzzle();
  initShell();

  setInterval(() => {
    const now = performance.now();
    engine.updateTime(now - lastTs);
    lastTs = now;
    if (currentMode === 'daily' && engine.timerStarted && engine.phase === 'planning' && !engine.isPaused && !engine.isComplete) {
      if (now - lastSaveTs >= 2000) {
        lastSaveTs = now;
        save();
      }
    }
    shell?.update();
  }, 200);

  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
});
