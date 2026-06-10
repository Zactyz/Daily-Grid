import { getPTDateYYYYMMDD, getOrCreateAnonId, formatTime } from '../common/utils.js';
import { createShellController } from '../common/shell-controller.js';
import { formatDateForShare } from '../common/share.js';
import { buildShareCard } from '../common/share-card.js';
import { HarborEngine } from './harbor-engine.js';
import {
  slidePieceDirected,
  clonePieces,
  slideGoalToExit,
  isGoalExited,
  directionsForPiece,
  exitDirectionForPuzzle
} from './harbor-puzzles.js';

const STATE_PREFIX = 'dailygrid_harbor_state_';
const ANIM_MS = 280;
const EXIT_ANIM_MS = 620;

const els = {
  board: document.getElementById('harbor-board'),
  progress: document.getElementById('progress-text'),
  gridSize: document.getElementById('grid-size'),
  puzzleDate: document.getElementById('puzzle-date'),
  undoBtn: document.getElementById('undo-btn'),
  showSolutionBtn: document.getElementById('show-solution-btn'),
  solutionActions: document.getElementById('solution-actions'),
  solutionRetryBtn: document.getElementById('solution-retry-btn'),
  solutionNextBtn: document.getElementById('solution-next-btn')
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
let pendingRunTimer = null;

let boardDom = null;
const pieceEls = new Map();

const stateKey = () => `${STATE_PREFIX}${currentMode}_${puzzleId}`;
const getPuzzleId = () => (currentMode === 'practice' ? `practice-${puzzleSeed}` : getPTDateYYYYMMDD());
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const DIR_ICON = {
  '0,-1': '<svg class="harbor-dir-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M10 6H2M4 3L1 6l3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  '0,1': '<svg class="harbor-dir-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8M8 3l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  '-1,0': '<svg class="harbor-dir-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10V2M3 4L6 1l3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  '1,0': '<svg class="harbor-dir-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2v8M3 8l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

function dirKey(dr, dc) {
  return `${dr},${dc}`;
}

function setLabels() {
  els.gridSize.textContent = engine.getGridLabel();
  els.puzzleDate.textContent = currentMode === 'practice' ? 'Practice' : puzzleId;
}

function updateUndoButton() {
  if (!els.undoBtn) return;
  const canUndo = engine.phase === 'planning' && !executing && !engine.isComplete && !engine.solutionShown && engine.playerPlan.length > 0;
  els.undoBtn.disabled = !canUndo;
  els.undoBtn.classList.toggle('opacity-40', !canUndo);
}

function updateSolutionUI() {
  const showPractice = currentMode === 'practice' && !engine.isComplete;
  if (!showPractice) {
    els.showSolutionBtn?.classList.add('hidden');
    els.solutionActions?.classList.add('hidden');
    return;
  }
  if (engine.solutionShown) {
    els.showSolutionBtn?.classList.add('hidden');
    if (executing) {
      els.solutionActions?.classList.add('hidden');
    } else {
      els.solutionActions?.classList.remove('hidden');
    }
  } else {
    els.showSolutionBtn?.classList.remove('hidden');
    els.solutionActions?.classList.add('hidden');
  }
}

function updateProgress(message) {
  if (!els.progress) return;
  if (message) {
    els.progress.textContent = message;
    return;
  }
  if (engine.solutionShown && currentMode === 'practice' && !executing) {
    els.progress.textContent = 'Solution shown • Try again or load the next practice puzzle.';
    return;
  }
  if (engine.phase === 'executing') {
    els.progress.textContent = 'Running your sequence...';
    return;
  }
  if (engine.phase === 'rewinding') {
    els.progress.textContent = 'Path blocked - rewinding...';
    return;
  }
  if (engine.isComplete) {
    els.progress.textContent = 'Exit cleared!';
    return;
  }
  const remaining = engine.movesRemaining;
  if (remaining === 0) {
    els.progress.textContent = 'Moves left: 0';
    return;
  }
  els.progress.textContent = `Moves left: ${remaining}`;
}

function pieceLayout(piece) {
  const colUnit = 100 / engine.width;
  const rowUnit = 100 / engine.height;
  const isH = piece.orient === 'H';
  return {
    left: `${piece.col * colUnit}%`,
    top: `${piece.row * rowUnit}%`,
    width: isH ? `${piece.len * colUnit}%` : `${colUnit}%`,
    height: isH ? `${rowUnit}%` : `${piece.len * rowUnit}%`
  };
}

function applyPieceLayout(el, piece) {
  const layout = pieceLayout(piece);
  el.style.left = layout.left;
  el.style.top = layout.top;
  el.style.width = layout.width;
  el.style.height = layout.height;
}

function positionExitHole(exitHole) {
  const side = engine.exitSide || 'right';
  const isHorizontalExit = side === 'left' || side === 'right';
  const trackSize = isHorizontalExit ? engine.height : engine.width;
  const line = isHorizontalExit ? engine.exitRow : engine.exitCol;
  const offsetPct = (line / trackSize) * 100;
  const offsetPad = (20 * line) / trackSize;
  const cellSize = `calc(${100 / trackSize}% - ${20 / trackSize}px)`;

  ['top', 'right', 'bottom', 'left', 'width', 'height'].forEach((prop) => {
    exitHole.style[prop] = '';
  });

  if (side === 'left' || side === 'right') {
    exitHole.style.top = `calc(10px + ${offsetPct}% - ${offsetPad}px)`;
    exitHole.style.width = '24px';
    exitHole.style.height = cellSize;
    exitHole.style[side] = '-24px';
    return;
  }

  exitHole.style.left = `calc(10px + ${offsetPct}% - ${offsetPad}px)`;
  exitHole.style.width = cellSize;
  exitHole.style.height = '24px';
  exitHole.style[side] = '-24px';
}

function destroyBoardDom() {
  pieceEls.clear();
  boardDom = null;
  if (els.board) els.board.innerHTML = '';
}

function clearPendingRun() {
  if (!pendingRunTimer) return;
  clearTimeout(pendingRunTimer);
  pendingRunTimer = null;
}

function scheduleAutoRun() {
  clearPendingRun();
  pendingRunTimer = setTimeout(() => {
    pendingRunTimer = null;
    if (engine.solutionShown || !engine.canRunPlan() || executing || engine.phase !== 'planning' || engine.isComplete) return;
    void runSequence();
  }, 260);
}

function ensureBoardDom() {
  if (boardDom) return boardDom;

  const tray = document.createElement('div');
  tray.className = `harbor-tray harbor-exit-${engine.exitSide || 'right'}`;
  tray.style.setProperty('--harbor-cols', String(engine.width));
  tray.style.setProperty('--harbor-rows', String(engine.height));

  const playfield = document.createElement('div');
  playfield.className = 'harbor-playfield';

  const gridBg = document.createElement('div');
  gridBg.className = 'harbor-grid-bg';
  for (let i = 0; i < engine.width * engine.height; i += 1) {
    const cell = document.createElement('div');
    cell.className = 'harbor-cell';
    gridBg.appendChild(cell);
  }

  const piecesLayer = document.createElement('div');
  piecesLayer.className = 'harbor-pieces-layer';

  const exitHole = document.createElement('div');
  exitHole.className = `harbor-exit-hole harbor-exit-hole-${engine.exitSide || 'right'}`;
  exitHole.setAttribute('aria-hidden', 'true');
  positionExitHole(exitHole);

  const exitSign = document.createElement('div');
  exitSign.className = 'harbor-exit-sign';
  exitSign.textContent = 'EXIT';
  exitHole.appendChild(exitSign);

  playfield.appendChild(gridBg);
  playfield.appendChild(piecesLayer);
  tray.appendChild(playfield);
  tray.appendChild(exitHole);
  els.board.appendChild(tray);

  boardDom = { tray, piecesLayer };
  return boardDom;
}

function createArrowButton(pieceId, dr, dc, className) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `harbor-end-arrow ${className}`;
  btn.dataset.dr = String(dr);
  btn.dataset.dc = String(dc);
  btn.innerHTML = DIR_ICON[dirKey(dr, dc)] || '';
  btn.setAttribute('aria-label', 'Set slide direction');
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    handleDirectionSelect(pieceId, dr, dc);
  });
  return btn;
}

function createPieceElement(piece) {
  const el = document.createElement('div');
  el.dataset.pieceId = piece.id;
  el.className = `harbor-piece harbor-piece-${piece.orient === 'H' ? 'h' : 'v'}`;

  if (piece.isGoal) {
    el.classList.add('harbor-piece-goal');
    el.setAttribute('aria-hidden', 'true');
    const dir = exitDirectionForPuzzle(engine.puzzle);
    const arrow = document.createElement('span');
    arrow.className = 'harbor-goal-arrow';
    arrow.innerHTML = DIR_ICON[dirKey(dir.dr, dir.dc)] || '';
    el.appendChild(arrow);
    return el;
  }

  const dirs = directionsForPiece(piece);
  dirs.forEach((dir, index) => {
    const sideClass = piece.orient === 'H'
      ? (dir.dc < 0 ? 'harbor-end-arrow-left' : 'harbor-end-arrow-right')
      : (dir.dr < 0 ? 'harbor-end-arrow-top' : 'harbor-end-arrow-bottom');
    el.appendChild(createArrowButton(piece.id, dir.dr, dir.dc, sideClass));
  });

  return el;
}

function updatePieceElement(el, piece) {
  const idx = engine.getSelectionIndex(piece.id);
  const planStep = engine.getPlanStep(piece.id);
  const isSelected = idx >= 0;
  const isLast = engine.isLastSelected(piece.id);
  const isLocked = isSelected && !isLast;
  const canInteract = engine.canInteractWith(piece.id) && !executing;

  el.classList.toggle('harbor-piece-selected', isSelected);
  el.classList.toggle('harbor-piece-locked', isLocked);
  el.classList.toggle('harbor-piece-goal', !!piece.isGoal);
  el.classList.toggle('harbor-piece-idle', !isSelected && !piece.isGoal);

  if (!piece.isGoal) {
    el.style.setProperty('--piece-color', engine.getPieceColor(piece.id));
    el.style.background = engine.getPieceColor(piece.id);
  }

  let badge = el.querySelector('.harbor-piece-badge');
  if (isSelected) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'harbor-piece-badge';
      el.appendChild(badge);
    }
    badge.textContent = String(idx + 1);
  } else if (badge) {
    badge.remove();
  }

  el.querySelectorAll('.harbor-end-arrow').forEach((btn) => {
    const dr = Number(btn.dataset.dr);
    const dc = Number(btn.dataset.dc);
    const isActive = !!(planStep && planStep.dr === dr && planStep.dc === dc);
    btn.classList.toggle('harbor-end-arrow-active', isActive);
    btn.classList.toggle('harbor-end-arrow-idle', !isSelected);
    btn.classList.toggle('harbor-end-arrow-dim', isSelected && !isActive);
    btn.disabled = !canInteract;
  });

  applyPieceLayout(el, piece);
}

function setAnimating(on) {
  if (!boardDom) return;
  boardDom.piecesLayer.classList.toggle('harbor-animating', on);
  boardDom.tray.classList.toggle('harbor-complete', engine.isComplete);
}

function setGoalExiting(on) {
  if (!boardDom) return;
  boardDom.piecesLayer.classList.toggle('harbor-goal-exiting', on);
}

function renderBoard({ animate = false } = {}) {
  if (!els.board || !engine) return;

  ensureBoardDom();
  setAnimating(animate);
  boardDom.tray.classList.toggle('harbor-complete', engine.isComplete);

  const seen = new Set();
  engine.pieces.forEach((piece) => {
    seen.add(piece.id);
    let el = pieceEls.get(piece.id);
    if (!el) {
      el = createPieceElement(piece);
      pieceEls.set(piece.id, el);
      boardDom.piecesLayer.appendChild(el);
    }
    updatePieceElement(el, piece);
  });

  for (const [id, el] of pieceEls) {
    if (!seen.has(id)) {
      el.remove();
      pieceEls.delete(id);
    }
  }

  updateUndoButton();
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

  if (engine.canRunPlan() && !executing) scheduleAutoRun();
  else clearPendingRun();
}

function handleDirectionSelect(pieceId, dr, dc) {
  if (engine.phase !== 'planning' || executing || engine.isComplete) return;
  if (!engine.selectWithDirection(pieceId, dr, dc)) return;
  onPlanningChange();
}

function handleUndo() {
  if (engine.phase !== 'planning' || executing || engine.isComplete) return;
  if (!engine.undoLast()) return;
  onPlanningChange();
}

async function animateGoalExit() {
  if (isGoalExited(engine.pieces, engine.puzzle)) return true;
  const distance = slideGoalToExit(engine.pieces, engine.puzzle);
  if (distance <= 0) return false;
  setGoalExiting(true);
  renderBoard({ animate: true });
  await sleep(EXIT_ANIM_MS);
  setGoalExiting(false);
  return isGoalExited(engine.pieces, engine.puzzle);
}

async function runSequence({ solutionPlayback = false } = {}) {
  if (executing) return;
  clearPendingRun();
  executing = true;
  engine.phase = 'executing';
  updateProgress(solutionPlayback ? 'Running solution...' : undefined);
  updateSolutionUI();
  renderBoard();

  const applied = [];
  let allMoved = true;

  for (const step of engine.playerPlan) {
    const before = clonePieces(engine.pieces);
    const distance = slidePieceDirected(engine.pieces, step.id, step.dr, step.dc, engine.puzzle);
    renderBoard({ animate: true });
    await sleep(ANIM_MS);
    applied.push({ pieceId: step.id, before, distance });
    if (distance <= 0) {
      allMoved = false;
      updateProgress('That vehicle cannot move - rewinding...');
      await rewindSequence(applied, { solutionPlayback });
      return;
    }
  }

  const beforeExit = clonePieces(engine.pieces);
  const exited = await animateGoalExit();

  if (!exited || !allMoved) {
    applied.push({ pieceId: 'goal-exit', before: beforeExit });
    updateProgress(allMoved ? 'Path blocked - try a different plan' : 'That vehicle cannot move - try again');
    await rewindSequence(applied, { solutionPlayback });
    return;
  }

  engine.phase = 'planning';
  executing = false;
  setAnimating(false);

  if (solutionPlayback) {
    updateProgress();
    updateSolutionUI();
    renderBoard();
    shell?.update();
    return;
  }

  engine.isComplete = true;
  completionMs = engine.timeMs;
  updateProgress();
  renderBoard();
  save();
  shell?.update();
}

async function rewindSequence(applied, { solutionPlayback = false } = {}) {
  engine.phase = 'rewinding';
  updateProgress();

  for (let i = applied.length - 1; i >= 0; i -= 1) {
    engine.pieces = clonePieces(applied[i].before);
    renderBoard({ animate: true });
    await sleep(ANIM_MS * 0.7);
  }

  engine.playerPlan = [];
  engine.phase = 'planning';
  executing = false;
  setAnimating(false);
  if (solutionPlayback) {
    engine.solutionShown = false;
  }
  updateProgress();
  updateSolutionUI();
  renderBoard();
  save();
  shell?.update();
}

function initPuzzle() {
  destroyBoardDom();
  engine = new HarborEngine(puzzleId);
  load();
  setLabels();
  updateProgress();
  updateSolutionUI();
  renderBoard();
  shell?.update();
}

function switchMode(mode) {
  clearPendingRun();
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
  clearPendingRun();
  executing = false;
  engine.reset({ resetTimer });
  completionMs = null;
  updateProgress();
  updateSolutionUI();
  renderBoard();
  save();
  shell?.update();
}

async function showSolution() {
  if (currentMode !== 'practice' || engine.solutionShown || engine.isComplete || executing) return;
  if (!engine.applySolutionPlan()) return;
  if (!engine.timerStarted) engine.startTimer();
  updateProgress('Showing solution moves...');
  updateSolutionUI();
  renderBoard();
  shell?.update();
  await sleep(500);
  await runSequence({ solutionPlayback: true });
}

function initShell() {
  shell = createShellController({
    gameId: 'harbor',
    getMode: () => currentMode,
    getPuzzleId: () => puzzleId,
    getGridLabel: () => engine.getGridLabel(),
    getElapsedMs: () => engine.timeMs,
    formatTime,
    autoStartOnProgress: false,
    disableStartOverlay: true,
    isComplete: () => engine.isComplete,
    isPaused: () => engine.showsPauseOverlay(),
    isStarted: () => engine.timerStarted,
    hasProgress: () => engine.playerPlan.length > 0,
    isSolutionShown: () => engine.solutionShown,
    shouldShowCompletionModal: () => !engine.solutionShown,
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
      gameName: 'BlindSlide',
      shareUrl: 'https://dailygrid.app/games/harbor/',
      gridLabel: engine.getGridLabel(),
      accent: '#ff2d95'
    }),
    getShareFile: () => buildShareCard({
      gameName: 'BlindSlide',
      logoPath: '/games/harbor/harbor-logo.png',
      accent: '#ff2d95',
      accentSoft: 'rgba(255,45,149,.12)',
      backgroundStart: '#070d18',
      backgroundEnd: '#0a1224',
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

  els.undoBtn?.addEventListener('click', handleUndo);
  els.showSolutionBtn?.addEventListener('click', () => { void showSolution(); });
  els.solutionRetryBtn?.addEventListener('click', () => resetGame({ resetTimer: true }));
  els.solutionNextBtn?.addEventListener('click', () => switchMode('practice'));

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
