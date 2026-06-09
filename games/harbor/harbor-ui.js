import { getPTDateYYYYMMDD, getOrCreateAnonId, formatTime } from '../common/utils.js';
import { createShellController } from '../common/shell-controller.js';
import { formatDateForShare } from '../common/share.js';
import { buildShareCard } from '../common/share-card.js';
import { HarborEngine } from './harbor-engine.js';
import { slidePieceDirected, clonePieces, stepGoalExit, isGoalExited, directionsForPiece } from './harbor-puzzles.js';

const STATE_PREFIX = 'dailygrid_harbor_state_';
const ANIM_MS = 280;

const els = {
  board: document.getElementById('harbor-board'),
  progress: document.getElementById('progress-text'),
  gridSize: document.getElementById('grid-size'),
  puzzleDate: document.getElementById('puzzle-date'),
  undoBtn: document.getElementById('undo-btn'),
  runBtn: document.getElementById('run-btn')
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
  const canUndo = engine.phase === 'planning' && !executing && !engine.isComplete && engine.playerPlan.length > 0;
  els.undoBtn.disabled = !canUndo;
  els.undoBtn.classList.toggle('opacity-40', !canUndo);
}

function updateRunButton() {
  if (!els.runBtn) return;
  const canRun = engine.phase === 'planning' && !executing && !engine.isComplete && engine.canRunPlan();
  els.runBtn.disabled = !canRun;
  els.runBtn.classList.toggle('opacity-40', !canRun);
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
    els.progress.textContent = 'Path blocked — rewinding…';
    return;
  }
  if (engine.isComplete) {
    els.progress.textContent = 'Exit cleared!';
    return;
  }
  const remaining = engine.movableCount - engine.playerPlan.length;
  if (remaining === 0) {
    els.progress.textContent = 'All vehicles programmed — tap Run to test your plan';
    return;
  }
  els.progress.textContent = remaining === engine.movableCount
    ? `Program all ${engine.movableCount} gray vehicles, then tap Run. Pink car is not selectable.`
    : `${engine.playerPlan.length} of ${engine.movableCount} programmed • ${remaining} left`;
}

function pieceLayout(piece) {
  const unit = 100 / engine.width;
  const isH = piece.orient === 'H';
  return {
    left: `${piece.col * unit}%`,
    top: `${piece.row * unit}%`,
    width: isH ? `${piece.len * unit}%` : `${unit}%`,
    height: isH ? `${unit}%` : `${piece.len * unit}%`
  };
}

function applyPieceLayout(el, piece) {
  const layout = pieceLayout(piece);
  el.style.left = layout.left;
  el.style.top = layout.top;
  el.style.width = layout.width;
  el.style.height = layout.height;
}

function destroyBoardDom() {
  pieceEls.clear();
  boardDom = null;
  if (els.board) els.board.innerHTML = '';
}

function ensureBoardDom() {
  if (boardDom) return boardDom;

  const tray = document.createElement('div');
  tray.className = 'harbor-tray';

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
  exitHole.className = 'harbor-exit-hole';
  exitHole.setAttribute('aria-hidden', 'true');

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
  updateRunButton();
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
  const maxSteps = engine.width + 2;
  for (let i = 0; i < maxSteps; i += 1) {
    if (isGoalExited(engine.pieces)) return true;
    if (!stepGoalExit(engine.pieces)) break;
    renderBoard({ animate: true });
    await sleep(ANIM_MS);
  }
  return isGoalExited(engine.pieces);
}

async function runSequence() {
  if (executing) return;
  executing = true;
  engine.phase = 'executing';
  updateProgress();
  renderBoard();

  const applied = [];
  let allMoved = true;

  for (const step of engine.playerPlan) {
    const before = clonePieces(engine.pieces);
    const distance = slidePieceDirected(engine.pieces, step.id, step.dr, step.dc);
    if (distance === 0) allMoved = false;
    renderBoard({ animate: true });
    await sleep(ANIM_MS);
    applied.push({ pieceId: step.id, before, distance });
  }

  const beforeExit = clonePieces(engine.pieces);
  const exited = await animateGoalExit();

  if (!exited || !allMoved) {
    applied.push({ pieceId: 'goal-exit', before: beforeExit });
    updateProgress(allMoved ? 'Path blocked — try a different plan' : 'Every vehicle must move — try again');
    await rewindSequence(applied);
    executing = false;
    return;
  }

  engine.phase = 'planning';
  engine.isComplete = true;
  completionMs = engine.timeMs;
  executing = false;
  setAnimating(false);
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
    renderBoard({ animate: true });
    await sleep(ANIM_MS * 0.7);
  }

  engine.playerPlan = [];
  engine.phase = 'planning';
  setAnimating(false);
  updateProgress();
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
    isPaused: () => engine.showsPauseOverlay(),
    isStarted: () => engine.timerStarted,
    hasProgress: () => engine.playerPlan.length > 0,
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
  els.runBtn?.addEventListener('click', () => {
    if (!engine.canRunPlan() || executing) return;
    void runSequence();
  });

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
