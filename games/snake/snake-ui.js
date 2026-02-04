import { formatTime, getOrCreateAnonId, getPTDateYYYYMMDD } from './snake-utils.js';
import { getUncompletedGames as getCrossGamePromo } from '../common/games.js';
import { createShellController } from '../common/shell-controller.js';
import { loadLogoForShare, formatDateForShare } from '../common/share.js';

export class SnakeUI {
  constructor(engine, onReset, onNextLevel, mode = 'daily') {
    this.engine = engine;
    this.onReset = onReset;
    this.onNextLevel = onNextLevel;
    this.mode = mode;

    this.validationTimeout = null;
    this.solutionShown = false;

    this.elements = {
      pauseBtn: document.getElementById('pause-btn'),
      resetBtn: document.getElementById('reset-btn'),
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
      gameId: 'snake',
      getMode: () => this.mode,
      getPuzzleId: () => this.engine.puzzle.id,
      getGridLabel: () => `${this.engine.puzzle.width}x${this.engine.puzzle.height}`,
      getElapsedMs: () => this.engine.state.timeMs,
      formatTime,
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
      getDailyModalTitle: () => 'Complete!',
      getAnonId: () => getOrCreateAnonId(),
      getCompletionPayload: () => ({ timeMs: this.engine.state.timeMs, hintsUsed: 0 }),
      getShareFile: () => this.buildShareImage()
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

    ctx.fillStyle = 'rgba(240, 198, 104, 0.02)';
    for (let i = 0; i < width; i += 20) {
      for (let j = 0; j < height; j += 20) {
        ctx.fillRect(i, j, 1, 1);
      }
    }

    const glowGradient = ctx.createRadialGradient(width / 2, 0, 0, width / 2, 0, 180);
    glowGradient.addColorStop(0, 'rgba(240, 198, 104, 0.12)');
    glowGradient.addColorStop(1, 'transparent');
    ctx.fillStyle = glowGradient;
    ctx.fillRect(0, 0, width, height);

    const logoImage = await loadLogoForShare('/games/snake/snake-logo.png');

    const titleY = 50;
    ctx.fillStyle = '#f0c674';
    ctx.font = 'bold 32px "Space Grotesk", system-ui, sans-serif';
    ctx.textAlign = 'center';

    if (logoImage) {
      const textWidth = ctx.measureText('Snake').width;
      const logoSize = 34;
      const gap = 8;
      const totalWidth = logoSize + gap + textWidth;
      const startX = (width - totalWidth) / 2;

      ctx.drawImage(logoImage, startX, titleY - 26, logoSize, logoSize);

      ctx.textAlign = 'left';
      ctx.fillText('Snake', startX + logoSize + gap, titleY);
      ctx.textAlign = 'center';
    } else {
      ctx.fillText('Snake', width / 2, titleY);
    }

    ctx.fillStyle = '#71717a';
    ctx.font = '14px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText('Daily Grid Puzzle', width / 2, titleY + 24);

    ctx.fillStyle = 'rgba(240, 198, 104, 0.1)';
    const badgeWidth = 160;
    const badgeHeight = 26;
    const badgeX = (width - badgeWidth) / 2;
    const badgeY = titleY + 38;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 13);
    ctx.fill();
    ctx.strokeStyle = 'rgba(240, 198, 104, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#f0c674';
    ctx.font = '12px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText(puzzleDate, width / 2, badgeY + 17);

    ctx.fillStyle = 'rgba(240, 198, 104, 0.06)';
    const timeBoxWidth = 180;
    const timeBoxHeight = 85;
    const timeBoxX = (width - timeBoxWidth) / 2;
    const timeBoxY = badgeY + 38;
    ctx.beginPath();
    ctx.roundRect(timeBoxX, timeBoxY, timeBoxWidth, timeBoxHeight, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(240, 198, 104, 0.15)';
    ctx.stroke();

    ctx.fillStyle = '#f0c674';
    ctx.font = 'bold 32px "JetBrains Mono", monospace';
    ctx.fillText(formatTime(finalTime), width / 2, timeBoxY + 40);

    ctx.fillStyle = '#52525b';
    ctx.font = '12px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText('TIME', width / 2, timeBoxY + 62);

    ctx.fillStyle = '#71717a';
    ctx.font = '12px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText(`Grid ${gridSize}`, width / 2, timeBoxY + 90);

    ctx.fillStyle = 'rgba(240, 198, 104, 0.08)';
    const footerY = height - 50;
    ctx.beginPath();
    ctx.roundRect(width / 2 - 120, footerY, 240, 32, 16);
    ctx.fill();

    ctx.fillStyle = '#f0c674';
    ctx.font = '12px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText('dailygrid.app/games/snake', width / 2, footerY + 21);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return null;
    return new File([blob], 'snake-share.png', { type: 'image/png' });
  }
}
