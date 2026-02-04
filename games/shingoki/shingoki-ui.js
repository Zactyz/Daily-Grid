import { getPTDateYYYYMMDD, getOrCreateAnonId, formatTime } from './shingoki-utils.js';
import { getUncompletedGames } from '../common/games.js';
import { buildShareText, formatDateForShare, shareWithFallback, showShareFeedback } from '../common/share.js';

const API_COMPLETE = '/api/shingoki/complete';
const API_LEADERBOARD = '/api/shingoki/leaderboard';
const API_CLAIM = '/api/shingoki/claim-initials';
const SHARE_URL = 'https://dailygrid.app/games/shingoki/';
const GAME_NAME = 'Sentinel Loop';
const SUBMITTED_KEY_PREFIX = 'dailygrid_shingoki_submitted_';

export class ShingokiUI {
  constructor(engine, renderer) {
    this.engine = engine;
    this.renderer = renderer;
    this.puzzleId = getPTDateYYYYMMDD();
    this.anonId = getOrCreateAnonId();
    this.completionTime = null;
    this.modalShown = false;
    this.submissionInFlight = false;
    this.claimInFlight = false;
    this.hasSubmittedScore = this.loadSubmissionFlag();

    this.elements = {
      timer: document.getElementById('timer'),
      gridSize: document.getElementById('grid-size'),
      pauseBtn: document.getElementById('pause-btn'),
      resetBtn: document.getElementById('reset-btn'),
      leaderboardBtn: document.getElementById('leaderboard-btn'),
      startOverlay: document.getElementById('start-overlay'),
      pauseOverlay: document.getElementById('pause-overlay'),
      completionModal: document.getElementById('completion-modal'),
      finalTime: document.getElementById('final-time'),
      percentileMsg: document.getElementById('percentile-msg'),
      leaderboardList: document.getElementById('leaderboard-list'),
      leaderboardTitle: document.getElementById('leaderboard-title'),
      claimInitialsForm: document.getElementById('claim-initials-form'),
      initialsInput: document.getElementById('initials-input'),
      claimFeedback: document.getElementById('claim-initials-feedback'),
      shareBtn: document.getElementById('share-btn'),
      closeModalBtn: document.getElementById('close-modal-btn'),
      nextGamePromo: document.getElementById('next-game-promo'),
      nextGameLink: document.getElementById('next-game-link'),
      nextGameLogo: document.getElementById('next-game-logo'),
      nextGameText: document.getElementById('next-game-text'),
      externalGamePromo: document.getElementById('external-game-promo'),
      externalGameLogo: document.getElementById('external-game-logo'),
      externalGameText: document.getElementById('external-game-text')
    };

    if (this.elements.gridSize) {
      this.elements.gridSize.textContent = this.engine.getGridLabel();
    }

    this.setupListeners();
    this.updateLeaderboardButton();
    this.updateStartOverlay();
    this.updatePauseOverlay();
  }

  setupListeners() {
    this.elements.startOverlay?.addEventListener('click', () => this.startGame());
    this.elements.pauseBtn?.addEventListener('click', () => this.togglePause());
    this.elements.resetBtn?.addEventListener('click', () => this.resetBoard());
    this.elements.leaderboardBtn?.addEventListener('click', () => {
      if (this.engine.isComplete) this.showCompletionModal(true);
    });
    this.elements.closeModalBtn?.addEventListener('click', () => this.hideCompletionModal());
    this.elements.shareBtn?.addEventListener('click', () => this.shareResult());
    this.elements.claimInitialsForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.claimInitials();
    });
  }

  handleUserInteraction() {
    if (!this.engine.timerStarted && !this.engine.isComplete) {
      this.startGame();
    }
  }

  startGame() {
    this.engine.startTimer();
    this.elements.startOverlay?.classList.add('hidden');
    this.updatePauseButton();
    this.updateStartOverlay();
  }

  togglePause() {
    if (this.engine.isComplete) return;
    if (this.engine.isPaused) {
      this.engine.resume();
    } else {
      this.engine.pause();
    }
    this.updatePauseButton();
    this.updatePauseOverlay();
  }

  resetBoard() {
    this.engine.reset();
    this.completionTime = null;
    this.modalShown = false;
    this.hasSubmittedScore = this.loadSubmissionFlag();
    this.elements.percentileMsg?.classList.add('hidden');
    this.hideCompletionModal();
    this.elements.leaderboardBtn?.classList.add('hidden');
    if (this.elements.claimInitialsForm) {
      this.elements.claimInitialsForm.classList.add('hidden');
    }
    if (this.elements.claimFeedback) {
      this.elements.claimFeedback.textContent = '';
    }
    this.elements.pauseOverlay?.classList.add('hidden');
    this.elements.startOverlay?.classList.remove('hidden');
    this.elements.externalGamePromo?.classList.add('hidden');
    this.elements.nextGamePromo?.classList.add('hidden');
    this.updatePauseButton();
    this.updateStartOverlay();
    this.renderer.render();
  }

  update() {
    this.updateTimerDisplay();
    this.updateStartOverlay();
    this.updatePauseOverlay();
    this.updateLeaderboardButton();

    if (this.engine.isComplete) {
      if (this.completionTime === null) {
        this.completionTime = this.engine.timeMs;
      }
      if (!this.modalShown) {
        this.showCompletionModal();
        this.elements.leaderboardBtn?.classList.remove('hidden');
      }
    }
  }

  updateTimerDisplay() {
    if (!this.elements.timer) return;
    const displayTime = this.engine.isComplete && this.completionTime !== null
      ? this.completionTime
      : this.engine.timeMs;
    this.elements.timer.textContent = formatTime(displayTime);
  }

  updateStartOverlay() {
    if (!this.elements.startOverlay) return;
    const shouldShow = !this.engine.timerStarted && !this.engine.isComplete;
    this.elements.startOverlay.classList.toggle('hidden', !shouldShow);
  }

  updatePauseOverlay() {
    if (!this.elements.pauseOverlay) return;
    if (this.engine.isComplete) {
      this.elements.pauseOverlay.classList.add('hidden');
      return;
    }
    this.elements.pauseOverlay.classList.toggle('hidden', !this.engine.isPaused);
  }

  updatePauseButton() {
    if (!this.elements.pauseBtn) return;
    this.elements.pauseBtn.textContent = this.engine.isPaused ? 'Resume' : 'Pause';
  }

  updateLeaderboardButton() {
    if (!this.elements.leaderboardBtn) return;
    if (this.engine.isComplete) {
      this.elements.leaderboardBtn.classList.remove('hidden');
    } else {
      this.elements.leaderboardBtn.classList.add('hidden');
    }
  }

  async showCompletionModal(force = false) {
    if (!this.elements.completionModal) return;
    if (this.modalShown && !force) return;
    this.modalShown = true;
    this.elements.completionModal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    if (this.elements.finalTime) {
      this.elements.finalTime.textContent = formatTime(this.completionTime || this.engine.timeMs);
    }
    this.elements.percentileMsg?.classList.remove('hidden');
    if (this.elements.percentileMsg) {
      this.elements.percentileMsg.textContent = 'Submitting your time…';
    }
    if (this.elements.leaderboardList) {
      this.elements.leaderboardList.innerHTML = '<p class="text-xs text-stone-500 text-center py-6">Loading leaderboard…</p>';
    }
    this.elements.shareBtn?.classList.remove('hidden');
    if (this.elements.claimInitialsForm) {
      this.elements.claimInitialsForm.classList.add('hidden');
    }
    await this.submitScore();
    await this.loadLeaderboard();
    this.updateCrossGamePromo();
  }

  hideCompletionModal() {
    if (!this.elements.completionModal) return;
    this.elements.completionModal.classList.add('hidden');
    this.modalShown = false;
    document.body.classList.remove('modal-open');
  }

  async submitScore() {
    if (this.hasSubmittedScore || this.submissionInFlight) {
      if (this.elements.percentileMsg) {
        this.elements.percentileMsg.textContent = 'Score already submitted for today.';
      }
      return;
    }

    this.submissionInFlight = true;
    try {
      const response = await fetch(API_COMPLETE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          puzzleId: this.puzzleId,
          anonId: this.anonId,
          timeMs: this.completionTime || this.engine.timeMs,
          hintsUsed: this.engine.hintsUsed || 0
        })
      });

      if (!response.ok) throw new Error('Leaderboard submission failed');
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Submission error');

      this.hasSubmittedScore = true;
      this.markSubmission();
      if (this.elements.percentileMsg) {
        this.elements.percentileMsg.textContent = `You ranked ${data.rank} of ${data.total} solvers today (you beat ${data.percentile}% of attempts).`;
      }
      if (data.rank <= 10 && this.elements.claimInitialsForm) {
        this.elements.claimInitialsForm.classList.remove('hidden');
        this.elements.claimFeedback.textContent = '';
      }
    } catch (error) {
      console.error(error);
      if (this.elements.percentileMsg) {
        this.elements.percentileMsg.textContent = 'Leaderboard temporarily unavailable.';
      }
    } finally {
      this.submissionInFlight = false;
    }
  }

  async loadLeaderboard() {
    if (!this.elements.leaderboardList) return;
    try {
      const response = await fetch(`${API_LEADERBOARD}?puzzleId=${this.puzzleId}`);
      if (!response.ok) throw new Error('Failed to load leaderboard');
      const data = await response.json();
      if (!data.top10?.length) {
        this.elements.leaderboardList.innerHTML = '<p class="text-xs text-stone-500 text-center py-6">No scores yet - be the first!</p>';
        return;
      }
      this.elements.leaderboardList.innerHTML = data.top10.map((entry, idx) => `
        <div class="flex items-center justify-between px-3 py-2.5 border-b border-white/10">
          <div class="flex items-center gap-3">
            <span class="w-6 h-6 rounded-full bg-sky-500/20 text-sky-300 text-[11px] font-semibold flex items-center justify-center">${entry.rank}</span>
            <span class="mono text-xs tracking-[0.2em] text-stone-800">${entry.initials || '---'}</span>
          </div>
          <span class="mono text-xs text-stone-600">${formatTime(entry.timeMs)}</span>
        </div>
      `).join('');
    } catch (error) {
      console.error(error);
      this.elements.leaderboardList.innerHTML = '<p class="text-xs text-stone-500 text-center py-6">Unable to load leaderboard.</p>';
    }
  }

  async claimInitials() {
    if (this.claimInFlight || !this.elements.initialsInput) return;
    const value = this.elements.initialsInput.value.trim().toUpperCase();
    if (!/^[A-Z]{1,3}$/.test(value)) {
      this.elements.claimFeedback.textContent = 'Enter 1-3 uppercase letters.';
      return;
    }

    this.claimInFlight = true;
    try {
      const response = await fetch(API_CLAIM, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          puzzleId: this.puzzleId,
          anonId: this.anonId,
          initials: value
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to claim initials');
      this.elements.claimFeedback.textContent = 'Initials saved!';
      this.elements.claimInitialsForm?.classList.add('hidden');
    } catch (error) {
      console.error(error);
      this.elements.claimFeedback.textContent = error?.message || 'Claim failed';
    } finally {
      this.claimInFlight = false;
    }
  }

  shareResult() {
    const finalTime = this.completionTime || this.engine.timeMs;
    const gridLabel = this.engine.getGridLabel();
    const shareText = buildShareText({
      gameName: GAME_NAME,
      puzzleLabel: formatDateForShare(this.puzzleId),
      gridLabel,
      timeText: formatTime(finalTime),
      shareUrl: SHARE_URL
    });

    shareWithFallback({
      shareTitle: `${GAME_NAME} - Daily Grid`,
      shareText,
      shareUrl: SHARE_URL,
      onCopy: () => showShareFeedback(this.elements.shareBtn, 'Copied!'),
      onError: () => showShareFeedback(this.elements.shareBtn, 'Unable to share')
    }).catch((error) => {
      console.error('Share error:', error);
      showShareFeedback(this.elements.shareBtn, 'Unable to share');
    });
  }

  updateCrossGamePromo() {
    const candidates = getUncompletedGames('shingoki', this.puzzleId);
    if (!candidates.length) {
      this.elements.externalGamePromo?.classList.add('hidden');
      this.elements.nextGamePromo?.classList.add('hidden');
      return;
    }

    const nextGame = candidates[0];
    if (this.elements.nextGamePromo && this.elements.nextGameLink && this.elements.nextGameLogo && this.elements.nextGameText) {
      this.elements.nextGameLink.href = nextGame.path;
      this.elements.nextGameLink.className = `block w-full py-3 px-4 rounded-xl text-center transition-all ${nextGame.theme.bg} border ${nextGame.theme.border} hover:${nextGame.theme.bg.replace('/10', '/20')}`;
      this.elements.nextGameLogo.src = nextGame.logo;
      this.elements.nextGameLogo.alt = nextGame.name;
      this.elements.nextGameText.textContent = `Play today’s ${nextGame.name}`;
      this.elements.nextGameText.className = `font-semibold text-sm ${nextGame.theme.text}`;
      this.elements.nextGamePromo.classList.remove('hidden');
    }

    if (!this.engine.isComplete) {
      this.elements.externalGamePromo?.classList.add('hidden');
      return;
    }

    if (this.elements.externalGamePromo && this.elements.externalGameLogo && this.elements.externalGameText) {
      this.elements.externalGamePromo.href = nextGame.path;
      this.elements.externalGameLogo.src = nextGame.logo;
      this.elements.externalGameLogo.alt = nextGame.name;
      this.elements.externalGameText.textContent = `Play today’s ${nextGame.name}`;
      this.elements.externalGameText.className = `font-semibold text-sm ${nextGame.theme.text}`;
      this.elements.externalGamePromo.classList.remove('hidden');
    }
  }

  loadSubmissionFlag() {
    try {
      return localStorage.getItem(`${SUBMITTED_KEY_PREFIX}${this.puzzleId}`) === 'true';
    } catch (error) {
      console.warn('Unable to read submission flag', error);
      return false;
    }
  }

  markSubmission() {
    try {
      localStorage.setItem(`${SUBMITTED_KEY_PREFIX}${this.puzzleId}`, 'true');
    } catch (error) {
      console.warn('Unable to save submission flag', error);
    }
  }
}
