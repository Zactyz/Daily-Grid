import { formatTime, getOrCreateAnonId, getPTDateYYYYMMDD } from './pathways-utils.js';
import { getUncompletedGames as getCrossGamePromo } from '../common/games.js';
import { createShellController } from '../common/shell-controller.js';
import { loadLogoForShare, formatDateForShare } from '../common/share.js';

export class PathwaysUI {
  constructor(engine, onReset, onNextLevel, mode = 'daily') {
    this.engine = engine;
    this.onReset = onReset;
    this.onNextLevel = onNextLevel;
    this.mode = mode;
    this.renderer = null;

    this.validationTimeout = null;
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
    if (!this.elements.validationMessage || !this.elements.validationMessageText) return;

    if (this.validationTimeout) {
      clearTimeout(this.validationTimeout);
    }

    this.elements.validationMessageText.textContent = message;
    this.elements.validationMessage.classList.remove('hidden');

    this.validationTimeout = setTimeout(() => {
      this.hideValidationMessage();
    }, 3000);
  }

  hideValidationMessage() {
    if (!this.elements.validationMessage) return;
    this.elements.validationMessage.classList.add('hidden');
    if (this.validationTimeout) {
      clearTimeout(this.validationTimeout);
      this.validationTimeout = null;
    }
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

    const scale = 2;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const width = 400;
    const height = 340;
    canvas.width = width * scale;
    canvas.height = height * scale;
    ctx.scale(scale, scale);

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#0a0a0f');
    gradient.addColorStop(1, '#12121a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(240, 128, 128, 0.02)';
    for (let i = 0; i < width; i += 20) {
      for (let j = 0; j < height; j += 20) {
        ctx.fillRect(i, j, 1, 1);
      }
    }

    const glowGradient = ctx.createRadialGradient(width / 2, 0, 0, width / 2, 0, 180);
    glowGradient.addColorStop(0, 'rgba(240, 128, 128, 0.12)');
    glowGradient.addColorStop(1, 'transparent');
    ctx.fillStyle = glowGradient;
    ctx.fillRect(0, 0, width, height);

    const logoImage = await loadLogoForShare('/games/pathways/pathways-logo.png');

    const titleY = 50;
    ctx.fillStyle = '#f08080';
    ctx.font = 'bold 32px "Space Grotesk", system-ui, sans-serif';
    ctx.textAlign = 'center';

    if (logoImage) {
      const textWidth = ctx.measureText('Pathways').width;
      const logoSize = 34;
      const gap = 8;
      const totalWidth = logoSize + gap + textWidth;
      const startX = (width - totalWidth) / 2;

      ctx.drawImage(logoImage, startX, titleY - 26, logoSize, logoSize);

      ctx.textAlign = 'left';
      ctx.fillText('Pathways', startX + logoSize + gap, titleY);
      ctx.textAlign = 'center';
    } else {
      ctx.fillText('Pathways', width / 2, titleY);
    }

    ctx.fillStyle = '#71717a';
    ctx.font = '14px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText('Daily Grid Puzzle', width / 2, titleY + 24);

    const dateText = formatDateForShare(puzzleDate);
    ctx.fillStyle = 'rgba(240, 128, 128, 0.1)';
    const badgeWidth = 160;
    const badgeHeight = 26;
    const badgeX = (width - badgeWidth) / 2;
    const badgeY = titleY + 38;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 13);
    ctx.fill();
    ctx.strokeStyle = 'rgba(240, 128, 128, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#f08080';
    ctx.font = '12px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText(dateText, width / 2, badgeY + 17);

    ctx.fillStyle = 'rgba(240, 128, 128, 0.06)';
    const timeBoxWidth = 180;
    const timeBoxHeight = 85;
    const timeBoxX = (width - timeBoxWidth) / 2;
    const timeBoxY = badgeY + 38;
    ctx.beginPath();
    ctx.roundRect(timeBoxX, timeBoxY, timeBoxWidth, timeBoxHeight, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(240, 128, 128, 0.15)';
    ctx.stroke();

    ctx.fillStyle = 'rgba(240, 128, 128, 0.5)';
    ctx.font = '10px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText('MY TIME', width / 2, timeBoxY + 22);

    ctx.fillStyle = '#f08080';
    ctx.font = 'bold 38px "JetBrains Mono", monospace, system-ui';
    ctx.fillText(formatTime(finalTime), width / 2, timeBoxY + 58);

    ctx.fillStyle = '#52525b';
    ctx.font = '12px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText(`${gridSize} Grid`, width / 2, timeBoxY + timeBoxHeight + 18);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return null;
    return new File([blob], 'pathways-result.png', { type: 'image/png' });
  }
}
