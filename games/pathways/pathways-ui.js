import { formatTime, getOrCreateAnonId, getPTDateYYYYMMDD } from './pathways-utils.js';
import { getUncompletedGames as getCrossGamePromo } from '../common/games.js';
import { createShellController } from '../common/shell-controller.js';
import { formatDateForShare } from '../common/share.js';
import { buildShareCard } from '../common/share-card.js';

export class PathwaysUI {
  constructor(engine, onReset, onNextLevel, mode = 'daily') {
    this.engine = engine;
    this.onReset = onReset;
    this.onNextLevel = onNextLevel;
    this.mode = mode;
    this.renderer = null;

    this.solutionShown = false;

    this.elements = {
      pauseBtn: document.getElementById('pause-btn'),
      resetBtn: document.getElementById('reset-btn'),
      obstacleHint: document.getElementById('obstacle-hint'),
      obstacleHintText: document.getElementById('obstacle-hint-text'),
      validationMessage: document.getElementById('validation-message'),
      validationMessageText: document.getElementById('validation-message-text'),
      showSolutionBtn: document.getElementById('show-solution-btn'),
      solutionActions: document.getElementById('solution-actions'),
      solutionRetryBtn: document.getElementById('solution-retry-btn'),
      solutionNextBtn: document.getElementById('solution-next-btn'),
      externalGamePromo: document.getElementById('external-game-promo'),
      externalGameLogo: document.getElementById('external-game-logo'),
      externalGameText: document.getElementById('external-game-text')
    };

    this.shell = createShellController({
      gameId: 'pathways',
      getMode: () => this.mode,
      getPuzzleId: () => this.engine.puzzle.id,
      getGridLabel: () => `${this.engine.puzzle.width}x${this.engine.puzzle.height}`,
      getElapsedMs: () => this.engine.state.timeMs,
      formatTime,
      autoStartOnProgress: true,
      isComplete: () => this.engine.state.isComplete,
      isPaused: () => this.engine.state.isPaused,
      isStarted: () => this.engine.state.timerStarted,
      hasProgress: () => Object.values(this.engine.state.paths).some(path => path && path.length > 0),
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
      getDailyModalTitle: () => 'All pathways connected!'
    });

    this.setupCustomListeners();
    this.updateObstacleHint();
    this.updateShowSolutionButton();
    this.updateExternalGamePromo();
  }

  setRenderer(renderer) {
    this.renderer = renderer;
    this.updateObstacleHint();
  }

  setupCustomListeners() {
    this.elements.showSolutionBtn?.addEventListener('click', () => this.showSolution());
    this.elements.solutionRetryBtn?.addEventListener('click', () => {
      this.engine.reset(false);
      this.engine.saveProgress();
      this.resetUI();
    });
    this.elements.solutionNextBtn?.addEventListener('click', () => {
      this.onNextLevel?.();
    });
  }

  update() {
    this.shell.update();
    this.updateObstacleHint();
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

  updateObstacleHint() {
    if (!this.elements.obstacleHint || !this.engine.puzzle?.obstacles?.length) return;

    const obstacle = this.engine.puzzle.obstacles[0];
    const count = obstacle.cells?.length || 1;
    const plural = count > 1;
    let hintText = '';
    let hintClass = '';

    switch (obstacle.type) {
      case 'wall':
        hintText = plural
          ? `${count} blocked cells cannot be crossed`
          : 'Blocked cell cannot be crossed';
        hintClass = 'bg-zinc-500/15 border-zinc-500/25 text-zinc-300';
        break;
      case 'bridge':
        hintText = plural
          ? `${count} bridges: Two paths may cross at each`
          : 'Bridge: Two paths may cross here';
        hintClass = 'bg-sky-500/15 border-sky-500/25 text-sky-300';
        break;
      case 'checkpoint':
        if (plural) {
          hintText = `${count} checkpoints: Paths must pass through marked cells`;
        } else {
          const colorName = this.renderer?.getColorName(obstacle.cells[0]?.color) || 'The colored';
          hintText = `Checkpoint: ${colorName} path must pass through the marked cell`;
        }
        hintClass = 'bg-amber-500/15 border-amber-500/25 text-amber-300';
        break;
      default:
        this.elements.obstacleHint.classList.add('hidden');
        return;
    }

    this.elements.obstacleHintText.textContent = hintText;
    this.elements.obstacleHint.className = `w-full max-w-xs mb-3 px-3 py-2 rounded-lg text-xs text-center ${hintClass}`;
    this.elements.obstacleHint.classList.remove('hidden');
  }

  checkAndShowValidation() {
    const validation = this.engine.getValidationState();

    if (validation.allPathsComplete && !validation.gridFilled) {
      this.showValidationMessage('All cells must be filled!');
    } else if (validation.checkpointMissed) {
      this.showValidationMessage('Path must go through the checkpoint!');
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

    for (const pair of this.engine.puzzle.pairs) {
      const solutionPath = this.engine.puzzle.solution[pair.color];
      if (solutionPath) {
        this.engine.state.paths[pair.color] = [...solutionPath];
      }
    }

    this.engine.state.isPaused = true;

    this.elements.showSolutionBtn?.classList.add('hidden');
    this.elements.solutionActions?.classList.remove('hidden');

    this.showValidationMessage('Solution revealed!');
  }

  getUncompletedGames() {
    const puzzleId = getPTDateYYYYMMDD();
    return getCrossGamePromo('pathways', puzzleId);
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
    const puzzleDate = getPTDateYYYYMMDD();
    const gridSize = `${this.engine.puzzle.width}x${this.engine.puzzle.height}`;
    return buildShareCard({
      gameName: 'Pathways',
      logoPath: '/games/pathways/pathways-logo.png',
      accent: '#f08080',
      accentSoft: 'rgba(240, 128, 128, 0.12)',
      dateText: formatDateForShare(puzzleDate),
      timeText: formatTime(finalTime),
      gridLabel: `${gridSize} Grid`
    });
  }
}
