import { formatTime, getOrCreateAnonId, getPTDateYYYYMMDD } from './snake-utils.js';
import { getUncompletedGames as getCrossGamePromo } from '../common/games.js';
import { createShellController } from '../common/shell-controller.js';
import { formatDateForShare } from '../common/share.js';
import { buildShareCard } from '../common/share-card.js';

export class SnakeUI {
  constructor(engine, onReset, onNextLevel, mode = 'daily') {
    this.engine = engine;
    this.onReset = onReset;
    this.onNextLevel = onNextLevel;
    this.mode = mode;

    this.solutionShown = false;

    this.elements = {
      pauseBtn: document.getElementById('pause-btn'),
      resetBtn: document.getElementById('reset-btn'),
      showSolutionBtn: document.getElementById('show-solution-btn'),
      solutionActions: document.getElementById('solution-actions'),
      solutionRetryBtn: document.getElementById('solution-retry-btn'),
      solutionNextBtn: document.getElementById('solution-next-btn'),
      externalGamePromo: document.getElementById('external-game-promo'),
      externalGameLogo: document.getElementById('external-game-logo'),
      externalGameText: document.getElementById('external-game-text')
    };

    this.shell = createShellController({
      gameId: 'snake',
      getMode: () => this.mode,
      getPuzzleId: () => this.engine.puzzle.id,
      getGridLabel: () => `${this.engine.puzzle.width}x${this.engine.puzzle.height}`,
      getElapsedMs: () => this.engine.state.timeMs,
      formatTime,
      autoStartOnProgress: true,
      isComplete: () => this.engine.state.isComplete,
      isPaused: () => this.engine.state.isPaused,
      isStarted: () => this.engine.state.timerStarted,
      hasProgress: () => this.engine.state.path.length > 0,
      pause: () => this.engine.pause(),
      resume: () => this.engine.resume(),
      startGame: () => this.engine.startTimer(),
      resetGame: () => {
        this.engine.reset(false);
        this.engine.saveProgress();
      },
      startReplay: () => {
        this.engine.reset(false);
        this.engine.saveProgress();
      },
      exitReplay: () => {
        this.engine.loadCompletedState();
      },
      onResetUI: () => this.resetUI(),
      onTryAgain: () => {
        this.engine.reset(false);
        this.engine.saveProgress();
        this.resetUI();
      },
      onNextLevel: () => this.onNextLevel?.(),
      onBackToDaily: () => window.startDailyMode?.(),
      onPracticeInfinite: () => window.startPracticeMode?.(),
      onStartPractice: () => window.startPracticeMode?.(),
      onStartDaily: () => window.startDailyMode?.(),
      getAnonId: () => getOrCreateAnonId(),
      getCompletionPayload: () => ({ timeMs: this.engine.state.timeMs, hintsUsed: 0 }),
      getShareFile: () => this.buildShareImage(),
      shouldShowCompletionModal: () => !this.solutionShown,
      isSolutionShown: () => this.solutionShown,
      disableReplay: true,
      pauseOnHide: true
    });

    this.setupCustomListeners();
    this.updateShowSolutionButton();
    this.updateExternalGamePromo();
  }

  setupCustomListeners() {
    this.elements.showSolutionBtn?.addEventListener('click', () => this.showSolution());
    this.elements.solutionRetryBtn?.addEventListener('click', () => {
      this.engine.reset(false);
      this.engine.saveProgress();
      this.resetUI();
    });
    this.elements.solutionNextBtn?.addEventListener('click', () => {
      this.resetUI();
      this.onNextLevel?.();
    });
  }

  update() {
    this.shell.update();
    this.updateShowSolutionButton();
    this.updateExternalGamePromo();

    if (this.solutionShown) {
      this.elements.showSolutionBtn?.classList.add('hidden');
      this.elements.solutionActions?.classList.remove('hidden');
      this.elements.pauseBtn?.classList.add('hidden');
      this.elements.resetBtn?.classList.add('hidden');
    } else {
      this.elements.pauseBtn?.classList.remove('hidden');
      this.elements.resetBtn?.classList.remove('hidden');
    }
  }

  resetUI() {
    this.solutionShown = false;
    this.hideValidationMessage();
    this.elements.solutionActions?.classList.add('hidden');
    this.elements.showSolutionBtn?.classList.remove('hidden');
    this.elements.pauseBtn?.classList.remove('hidden');
    this.elements.resetBtn?.classList.remove('hidden');
  }

  showValidationMessage(message) {
    this.shell.showToast(message);
  }

  hideValidationMessage() {
    this.shell.hideToast();
  }

  checkAndShowValidation() {
    const validation = this.engine.getValidationState();

    if (validation.gridFilled && !validation.numbersCorrectOrder) {
      if (validation.wrongOrderAt) {
        this.showValidationMessage(`Numbers must be visited in order! Expected ${validation.wrongOrderAt.expected}, found ${validation.wrongOrderAt.got}`);
      } else {
        this.showValidationMessage('Numbers must be visited in order!');
      }
    }
  }

  updateShowSolutionButton() {
    if (!this.elements.showSolutionBtn) return;

    if (this.mode === 'practice' && !this.solutionShown && !this.engine.state.isComplete) {
      this.elements.showSolutionBtn.classList.remove('hidden');
    } else {
      this.elements.showSolutionBtn.classList.add('hidden');
    }
  }

  showSolution() {
    if (!this.engine.puzzle.solution) {
      this.showValidationMessage('Solution not available for this puzzle');
      return;
    }

    this.solutionShown = true;
    this.engine.state.path = [...this.engine.puzzle.solution];
    this.engine.state.isPaused = true;
    this.engine.state.isComplete = true;
    this.engine.state.timerStarted = true;

    this.elements.showSolutionBtn?.classList.add('hidden');
    this.elements.solutionActions?.classList.remove('hidden');

    this.showValidationMessage('Solution revealed!');
  }

  getUncompletedGames() {
    const puzzleId = getPTDateYYYYMMDD();
    return getCrossGamePromo('snake', puzzleId);
  }

  updateExternalGamePromo() {
    if (!this.elements.externalGamePromo || this.mode !== 'daily') return;

    if (!this.engine.state.isComplete || this.shell.isInReplayMode()) {
      this.elements.externalGamePromo.classList.add('hidden');
      return;
    }

    const uncompleted = this.getUncompletedGames();
    if (uncompleted.length === 0) {
      this.elements.externalGamePromo.classList.add('hidden');
      return;
    }

    const nextGame = uncompleted[0];
    this.elements.externalGamePromo.href = nextGame.path;
    this.elements.externalGamePromo.className = `w-full max-w-md mt-4 py-3 px-4 rounded-xl border transition-all flex items-center justify-center gap-3 ${nextGame.theme.bg} ${nextGame.theme.border} hover:bg-opacity-20`;
    this.elements.externalGameLogo.src = nextGame.logo;
    this.elements.externalGameLogo.alt = nextGame.name;
    this.elements.externalGameText.textContent = `Play today's ${nextGame.name}`;
    this.elements.externalGameText.className = `font-semibold text-sm ${nextGame.theme.text}`;

    this.elements.externalGamePromo.classList.remove('hidden');
  }

  async buildShareImage() {
    const finalTime = this.engine.state.timeMs;
    const puzzleDate = formatDateForShare(getPTDateYYYYMMDD());
    const gridSize = `${this.engine.puzzle.width}x${this.engine.puzzle.height}`;
    return buildShareCard({
      gameName: 'Snake',
      logoPath: '/games/snake/snake-logo.png',
      accent: '#f0c674',
      accentSoft: 'rgba(240, 198, 104, 0.12)',
      dateText: puzzleDate,
      timeText: formatTime(finalTime),
      gridLabel: `Grid ${gridSize}`,
      footerText: 'dailygrid.app/games/snake'
    });
  }
}
