import { formatTime, getOrCreateAnonId, getPTDateYYYYMMDD } from './pathways-utils.js';

const OTHER_GAMES = [
  {
    id: 'snake',
    name: 'Snake',
    path: '/games/snake/',
    logo: '/games/snake/snake-logo.png',
    submittedKeyPrefix: 'dailygrid_submitted_',
    theme: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400' }
  }
  // Future games can be added here
];

export class PathwaysUI {
  constructor(engine, onReset, onNextLevel, mode = 'daily') {
    this.engine = engine;
    this.onReset = onReset;
    this.onNextLevel = onNextLevel;
    this.mode = mode;
    
    this.lastUIUpdate = 0;
    this.uiThrottleMs = 100;
    this.modalShown = false;
    this.completionTime = null;
    this.hasSubmittedScore = false;
    this.timerWasRunning = false;
    this.isInReplayMode = this.loadReplayMode();
    
    this.elements = {
      timer: document.getElementById('timer'),
      pauseBtn: document.getElementById('pause-btn'),
      resetBtn: document.getElementById('reset-btn'),
      leaderboardBtn: document.getElementById('leaderboard-btn'),
      pauseOverlay: document.getElementById('pause-overlay'),
      startOverlay: document.getElementById('start-overlay'),
      completionModal: document.getElementById('completion-modal'),
      finalTime: document.getElementById('final-time'),
      percentileMsg: document.getElementById('percentile-msg'),
      claimInitialsForm: document.getElementById('claim-initials-form'),
      initialsInput: document.getElementById('initials-input'),
      leaderboardList: document.getElementById('leaderboard-list'),
      leaderboardTitle: document.getElementById('leaderboard-title'),
      closeModalBtn: document.getElementById('close-modal-btn'),
      nextLevelBtn: document.getElementById('next-level-btn'),
      practiceInfiniteBtn: document.getElementById('practice-infinite-btn'),
      tryAgainBtn: document.getElementById('try-again-btn'),
      backToDailyCompleteBtn: document.getElementById('back-to-daily-complete-btn'),
      practiceCompleteActions: document.getElementById('practice-complete-actions'),
      modalTitle: document.getElementById('modal-title'),
      modalSubtitle: document.getElementById('modal-subtitle'),
      resetModal: document.getElementById('reset-modal'),
      confirmResetBtn: document.getElementById('confirm-reset-btn'),
      cancelResetBtn: document.getElementById('cancel-reset-btn'),
      exitReplayModal: document.getElementById('exit-replay-modal'),
      confirmExitReplayBtn: document.getElementById('confirm-exit-replay-btn'),
      cancelExitReplayBtn: document.getElementById('cancel-exit-replay-btn'),
      exitReplayBtn: document.getElementById('exit-replay-btn'),
      shareBtn: document.getElementById('share-btn'),
      nextGamePromo: document.getElementById('next-game-promo'),
      nextGameLink: document.getElementById('next-game-link'),
      nextGameLogo: document.getElementById('next-game-logo'),
      nextGameText: document.getElementById('next-game-text'),
      externalGamePromo: document.getElementById('external-game-promo'),
      externalGameLogo: document.getElementById('external-game-logo'),
      externalGameText: document.getElementById('external-game-text')
    };
    
    if (this.mode === 'daily') {
      this.checkIfAlreadySubmitted();
    }
    
    this.setupListeners();
    this.setupVisibilityHandler();
    
    if (this.engine.state.isComplete) {
      this.completionTime = this.engine.state.timeMs;
      this.modalShown = true;
    }
    
    if (this.mode === 'daily' && this.hasSubmittedScore && !this.engine.state.isComplete && !this.isInReplayMode) {
      if (this.engine.loadCompletedState()) {
        this.completionTime = this.engine.state.timeMs;
        this.modalShown = true;
      }
    }
    
    this.updateStartOverlay();
    this.updatePauseState();
    this.updateResetButton();
    this.updateExitReplayButton();
    this.updateExternalGamePromo();
  }
  
  checkIfAlreadySubmitted() {
    try {
      const puzzleId = getPTDateYYYYMMDD();
      const submittedKey = `dailygrid_pathways_submitted_${puzzleId}`;
      this.hasSubmittedScore = localStorage.getItem(submittedKey) === 'true';
    } catch (e) {
      this.hasSubmittedScore = false;
    }
  }
  
  markAsSubmitted() {
    try {
      const puzzleId = getPTDateYYYYMMDD();
      const submittedKey = `dailygrid_pathways_submitted_${puzzleId}`;
      localStorage.setItem(submittedKey, 'true');
      this.hasSubmittedScore = true;
    } catch (e) {
      console.warn('Failed to save submission status');
    }
  }
  
  loadReplayMode() {
    if (this.mode !== 'daily') return false;
    try {
      const puzzleId = getPTDateYYYYMMDD();
      const replayKey = `dailygrid_pathways_replay_${puzzleId}`;
      return localStorage.getItem(replayKey) === 'true';
    } catch (e) {
      return false;
    }
  }
  
  saveReplayMode(isReplaying) {
    if (this.mode !== 'daily') return;
    try {
      const puzzleId = getPTDateYYYYMMDD();
      const replayKey = `dailygrid_pathways_replay_${puzzleId}`;
      if (isReplaying) {
        localStorage.setItem(replayKey, 'true');
      } else {
        localStorage.removeItem(replayKey);
      }
    } catch (e) {
      console.warn('Failed to save replay mode');
    }
  }
  
  setupListeners() {
    this.elements.pauseBtn?.addEventListener('click', () => this.togglePause());
    this.elements.resetBtn?.addEventListener('click', () => {
      if (this.engine.state.isComplete) {
        this.startReplay();
      } else {
        this.confirmReset();
      }
    });
    
    this.elements.exitReplayBtn?.addEventListener('click', () => {
      this.confirmExitReplay();
    });
    
    this.elements.leaderboardBtn?.addEventListener('click', () => {
      if (this.engine.state.isComplete) {
        this.showCompletionModal(true);
      }
    });
    
    this.elements.closeModalBtn?.addEventListener('click', () => this.hideCompletionModal());
    
    this.elements.nextLevelBtn?.addEventListener('click', () => {
      this.hideCompletionModal();
      if (this.onNextLevel) {
        this.onNextLevel();
      } else {
        this.onReset();
      }
    });
    
    this.elements.tryAgainBtn?.addEventListener('click', () => {
      this.hideCompletionModal();
      this.engine.reset(false);
      this.resetUI();
      this.engine.saveProgress();
      this.updateStartOverlay();
    });
    
    this.elements.backToDailyCompleteBtn?.addEventListener('click', () => {
      this.hideCompletionModal();
      window.startDailyMode();
    });
    
    this.elements.practiceInfiniteBtn?.addEventListener('click', () => {
      this.hideCompletionModal();
      window.startPracticeMode();
    });
    
    this.elements.confirmResetBtn?.addEventListener('click', () => {
      const wasComplete = this.engine.state.isComplete;
      const wasInReplay = this.isInReplayMode;
      this.hideResetModal();
      
      if (wasComplete) {
        this.startReplay();
      } else if (wasInReplay) {
        // Clear all paths
        for (const pair of this.engine.puzzle.pairs) {
          this.engine.state.paths[pair.color] = [];
        }
        this.engine.resume();
        this.engine.saveProgress();
        this.elements.startOverlay?.classList.add('hidden');
        this.elements.pauseOverlay?.classList.add('hidden');
        this.updatePauseState();
      } else {
        // Clear all paths
        for (const pair of this.engine.puzzle.pairs) {
          this.engine.state.paths[pair.color] = [];
        }
        this.engine.resume();
        this.engine.saveProgress();
        this.elements.startOverlay?.classList.add('hidden');
        this.elements.pauseOverlay?.classList.add('hidden');
        this.updatePauseState();
      }
      this.updateResetButton();
    });
    
    this.elements.cancelResetBtn?.addEventListener('click', () => {
      this.hideResetModal();
      if (this.timerWasRunning) {
        this.engine.resume();
        this.updatePauseState();
      }
    });
    
    this.elements.confirmExitReplayBtn?.addEventListener('click', () => {
      this.hideExitReplayModal();
      this.isInReplayMode = false;
      this.saveReplayMode(false);
      if (this.engine.loadCompletedState()) {
        this.completionTime = this.engine.state.timeMs;
        this.modalShown = true;
        this.updatePauseState();
        this.updateStartOverlay();
        this.updateResetButton();
        this.updateExitReplayButton();
      }
    });
    
    this.elements.cancelExitReplayBtn?.addEventListener('click', () => {
      this.hideExitReplayModal();
      if (this.timerWasRunning) {
        this.engine.resume();
        this.updatePauseState();
      }
    });
    
    this.elements.pauseOverlay?.addEventListener('click', () => {
      if (this.engine.state.isPaused && !this.engine.state.isComplete) {
        this.togglePause();
      }
    });
    
    this.elements.startOverlay?.addEventListener('click', () => {
      this.startGame();
    });
    
    this.elements.claimInitialsForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.claimInitials();
    });
    
    this.elements.shareBtn?.addEventListener('click', () => {
      this.shareResult();
    });
  }
  
  setupVisibilityHandler() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !this.engine.state.isComplete) {
        this.engine.pause();
        this.updatePauseState();
      }
    });
  }
  
  update() {
    const now = Date.now();
    if (now - this.lastUIUpdate < this.uiThrottleMs) {
      return;
    }
    this.lastUIUpdate = now;
    
    if (this.engine.state.isComplete && this.completionTime === null) {
      this.completionTime = this.engine.state.timeMs;
    }
    
    if (this.elements.timer) {
      const displayTime = this.completionTime !== null ? this.completionTime : this.engine.state.timeMs;
      this.elements.timer.textContent = formatTime(displayTime);
    }
    
    if (this.engine.state.isComplete && !this.modalShown) {
      this.modalShown = true;
      this.isInReplayMode = false;
      this.saveReplayMode(false);
      this.updateResetButton();
      this.updateExitReplayButton();
      this.updateExternalGamePromo();
      this.showCompletionModal();
    }

    if (this.engine.state.isComplete && this.mode === 'daily') {
      this.elements.leaderboardBtn?.classList.remove('hidden');
      this.elements.pauseBtn?.classList.add('hidden');
    } else if (!this.engine.state.isComplete) {
      this.elements.leaderboardBtn?.classList.add('hidden');
    }
    
    if (this.mode === 'practice') {
      this.elements.leaderboardBtn?.classList.add('hidden');
    }
  }
  
  togglePause() {
    if (this.engine.state.isComplete) return;
    
    if (this.engine.state.isPaused) {
      this.engine.resume();
    } else {
      this.engine.pause();
    }
    
    this.updatePauseState();
  }
  
  updatePauseState() {
    if (this.elements.pauseBtn) {
      if (this.engine.state.isComplete) {
        this.elements.pauseBtn.classList.add('hidden');
      } else if (this.engine.state.isPaused) {
        this.elements.pauseBtn.classList.remove('hidden');
        this.elements.pauseBtn.innerHTML = `
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          Resume
        `;
        this.elements.pauseBtn.disabled = false;
      } else {
        this.elements.pauseBtn.classList.remove('hidden');
        this.elements.pauseBtn.innerHTML = `
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6"/>
          </svg>
          Pause
        `;
        this.elements.pauseBtn.disabled = false;
      }
    }
    
    if (this.elements.pauseOverlay) {
      if (this.engine.state.isPaused && !this.engine.state.isComplete) {
        this.elements.pauseOverlay.classList.remove('hidden');
      } else {
        this.elements.pauseOverlay.classList.add('hidden');
      }
    }
  }
  
  confirmReset() {
    this.timerWasRunning = this.engine.state.timerStarted && !this.engine.state.isPaused && !this.engine.state.isComplete;
    if (this.timerWasRunning) {
      this.engine.pause();
      this.updatePauseState();
    }
    this.elements.resetModal?.classList.remove('hidden');
  }
  
  hideResetModal() {
    this.elements.resetModal?.classList.add('hidden');
  }
  
  startReplay() {
    this.isInReplayMode = true;
    this.saveReplayMode(true);
    this.engine.reset(false);
    this.resetUI();
    this.engine.saveProgress();
    this.updateStartOverlay();
    this.updateExitReplayButton();
  }
  
  confirmExitReplay() {
    this.timerWasRunning = this.engine.state.timerStarted && !this.engine.state.isPaused;
    if (this.timerWasRunning) {
      this.engine.pause();
      this.updatePauseState();
    }
    this.elements.exitReplayModal?.classList.remove('hidden');
  }
  
  hideExitReplayModal() {
    this.elements.exitReplayModal?.classList.add('hidden');
  }
  
  updateExitReplayButton() {
    if (!this.elements.exitReplayBtn) return;
    
    const shouldShow = this.isInReplayMode && !this.engine.state.isComplete;
    
    if (shouldShow) {
      this.elements.exitReplayBtn.classList.remove('hidden');
    } else {
      this.elements.exitReplayBtn.classList.add('hidden');
    }
  }
  
  getUncompletedGames() {
    const puzzleId = getPTDateYYYYMMDD();
    return OTHER_GAMES.filter(game => {
      const key = `${game.submittedKeyPrefix}${puzzleId}`;
      return localStorage.getItem(key) !== 'true';
    });
  }
  
  showNextGamePromo() {
    if (!this.elements.nextGamePromo || this.mode !== 'daily') return;
    
    const uncompleted = this.getUncompletedGames();
    if (uncompleted.length === 0) {
      this.elements.nextGamePromo.classList.add('hidden');
      return;
    }
    
    const nextGame = uncompleted[0];
    this.elements.nextGameLink.href = nextGame.path;
    this.elements.nextGameLink.className = `block w-full py-3 px-4 rounded-xl text-center transition-all ${nextGame.theme.bg} border ${nextGame.theme.border} hover:${nextGame.theme.bg.replace('/10', '/20')}`;
    this.elements.nextGameLogo.src = nextGame.logo;
    this.elements.nextGameLogo.alt = nextGame.name;
    this.elements.nextGameText.textContent = `Play today's ${nextGame.name}`;
    this.elements.nextGameText.className = `font-semibold text-sm ${nextGame.theme.text}`;
    
    this.elements.nextGamePromo.classList.remove('hidden');
  }
  
  updateExternalGamePromo() {
    if (!this.elements.externalGamePromo || this.mode !== 'daily') return;
    
    // Only show if puzzle is complete
    if (!this.engine.state.isComplete && !this.hasSubmittedScore) {
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
  
  async showCompletionModal(skipSubmission = false) {
    if (!this.elements.completionModal) return;
    
    this.elements.closeModalBtn?.classList.add('hidden');
    this.elements.practiceInfiniteBtn?.classList.add('hidden');
    this.elements.practiceCompleteActions?.classList.add('hidden');
    this.elements.practiceCompleteActions?.classList.remove('flex');
    this.elements.nextLevelBtn?.classList.add('hidden');
    this.elements.leaderboardList?.classList.add('hidden');
    this.elements.leaderboardTitle?.classList.add('hidden');
    this.elements.percentileMsg?.classList.add('hidden');
    this.elements.claimInitialsForm?.classList.add('hidden');
    this.elements.shareBtn?.classList.add('hidden');
    
    const finalTime = this.completionTime !== null ? this.completionTime : this.engine.state.timeMs;
    
    if (this.elements.finalTime) {
      this.elements.finalTime.textContent = formatTime(finalTime);
    }
    
    if (this.elements.pauseOverlay) {
      this.elements.pauseOverlay.classList.add('hidden');
    }
    
    if (this.mode === 'daily') {
      if (this.elements.modalTitle) this.elements.modalTitle.textContent = 'All pathways connected!';
      if (this.elements.modalSubtitle) this.elements.modalSubtitle.textContent = "Great work on today's puzzle";
      
      this.elements.leaderboardList?.classList.remove('hidden');
      this.elements.leaderboardTitle?.classList.remove('hidden');
      if (this.elements.leaderboardList) {
        this.elements.leaderboardList.innerHTML = '<p class="text-zinc-500 text-center py-6 text-xs">Loading...</p>';
      }
      
      this.elements.shareBtn?.classList.remove('hidden');
      this.elements.closeModalBtn?.classList.remove('hidden');
      this.elements.practiceInfiniteBtn?.classList.remove('hidden');
      
      this.elements.completionModal.classList.remove('hidden');
      
      if (!skipSubmission) {
        await this.submitScore(finalTime);
      }
      await this.loadLeaderboard();
      
      this.elements.percentileMsg?.classList.remove('hidden');
      
      this.showNextGamePromo();
    } else {
      if (this.elements.modalTitle) this.elements.modalTitle.textContent = 'Nice Job!';
      if (this.elements.modalSubtitle) this.elements.modalSubtitle.textContent = 'Practice puzzle complete';
      
      this.elements.practiceCompleteActions?.classList.remove('hidden');
      this.elements.practiceCompleteActions?.classList.add('flex');
      this.elements.nextLevelBtn?.classList.remove('hidden');
      
      this.elements.completionModal.classList.remove('hidden');
    }
  }
  
  hideCompletionModal() {
    if (!this.elements.completionModal) return;
    this.elements.completionModal.classList.add('hidden');
  }
  
  async submitScore(timeMs) {
    if (this.hasSubmittedScore) {
      if (this.elements.percentileMsg) {
        this.elements.percentileMsg.textContent = 'Score already submitted for today';
      }
      return;
    }
    
    try {
      const anonId = getOrCreateAnonId();
      const puzzleId = getPTDateYYYYMMDD();
      
      const response = await fetch('/api/pathways/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          puzzleId,
          anonId,
          timeMs: timeMs || this.engine.state.timeMs,
          hintsUsed: 0
        })
      });
      
      if (!response.ok) throw new Error('Failed to submit score');
      
      const data = await response.json();
      
      this.markAsSubmitted();
      
      if (this.elements.percentileMsg) {
        const msg = `You ranked ${data.rank} out of ${data.total} solvers today (top ${100 - data.percentile}%)!`;
        this.elements.percentileMsg.textContent = msg;
      }
      
      if (data.rank <= 10 && this.elements.claimInitialsForm) {
        this.elements.claimInitialsForm.classList.remove('hidden');
      }
      
    } catch (error) {
      console.error('Failed to submit score:', error);
      if (this.elements.percentileMsg) {
        this.elements.percentileMsg.textContent = 'Leaderboard temporarily unavailable';
      }
    }
  }
  
  async loadLeaderboard() {
    try {
      const puzzleId = getPTDateYYYYMMDD();
      const response = await fetch(`/api/pathways/leaderboard?puzzleId=${puzzleId}`);
      
      if (!response.ok) throw new Error('Failed to load leaderboard');
      
      const data = await response.json();
      
      if (this.elements.leaderboardList && data.top10.length > 0) {
        this.elements.leaderboardList.innerHTML = data.top10.map((entry, idx) => `
          <div class="leaderboard-row flex items-center justify-between px-3 py-2.5 ${idx < data.top10.length - 1 ? 'border-b border-white/5' : ''}">
            <div class="flex items-center gap-3">
              <span class="w-6 h-6 rounded-md ${entry.rank <= 3 ? 'bg-rose-500/20 text-rose-400' : 'bg-zinc-700/50 text-zinc-500'} text-xs font-bold flex items-center justify-center">${entry.rank}</span>
              <span class="font-mono text-sm tracking-wider ${entry.initials ? 'text-zinc-300' : 'text-zinc-600'}">${entry.initials || '---'}</span>
            </div>
            <span class="font-mono text-sm text-zinc-400">${formatTime(entry.timeMs)}</span>
          </div>
        `).join('');
      } else if (this.elements.leaderboardList) {
        this.elements.leaderboardList.innerHTML = '<p class="text-zinc-500 text-center py-6 text-xs">No scores yet - be the first!</p>';
      }
      
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
    }
  }
  
  async claimInitials() {
    const initials = this.elements.initialsInput?.value.toUpperCase().trim();
    
    if (!initials || initials.length > 3) {
      alert('Please enter 1-3 letters');
      return;
    }
    
    try {
      const anonId = getOrCreateAnonId();
      const puzzleId = getPTDateYYYYMMDD();
      
      const response = await fetch('/api/pathways/claim-initials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          puzzleId,
          anonId,
          initials
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to claim initials');
      }
      
      this.elements.claimInitialsForm?.classList.add('hidden');
      await this.loadLeaderboard();
      
    } catch (error) {
      console.error('Failed to claim initials:', error);
      alert(error.message || 'Failed to save initials. Please try again.');
    }
  }
  
  async shareResult() {
    const finalTime = this.completionTime !== null ? this.completionTime : this.engine.state.timeMs;
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
    
    const glowGradient = ctx.createRadialGradient(width/2, 0, 0, width/2, 0, 180);
    glowGradient.addColorStop(0, 'rgba(240, 128, 128, 0.12)');
    glowGradient.addColorStop(1, 'transparent');
    ctx.fillStyle = glowGradient;
    ctx.fillRect(0, 0, width, height);
    
    const logoLoaded = await this.loadLogoForShare(ctx, width);
    
    const titleY = 50;
    ctx.fillStyle = '#f08080';
    ctx.font = 'bold 32px "Space Grotesk", system-ui, sans-serif';
    ctx.textAlign = 'center';
    
    if (logoLoaded) {
      const textWidth = ctx.measureText('Pathways').width;
      const logoSize = 34;
      const gap = 8;
      const totalWidth = logoSize + gap + textWidth;
      const startX = (width - totalWidth) / 2;
      
      ctx.drawImage(this.logoImage, startX, titleY - 26, logoSize, logoSize);
      
      ctx.textAlign = 'left';
      ctx.fillText('Pathways', startX + logoSize + gap, titleY);
      ctx.textAlign = 'center';
    } else {
      ctx.fillText('Pathways', width/2, titleY);
    }
    
    ctx.fillStyle = '#71717a';
    ctx.font = '14px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText('Daily Grid Puzzle', width/2, titleY + 24);
    
    const dateText = this.formatDateForShare(puzzleDate);
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
    ctx.fillText(dateText, width/2, badgeY + 17);
    
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
    ctx.fillText('MY TIME', width/2, timeBoxY + 22);
    
    ctx.fillStyle = '#f08080';
    ctx.font = 'bold 38px "JetBrains Mono", monospace, system-ui';
    ctx.fillText(formatTime(finalTime), width/2, timeBoxY + 58);
    
    ctx.fillStyle = '#52525b';
    ctx.font = '12px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText(`${gridSize} Grid`, width/2, timeBoxY + timeBoxHeight + 18);
    
    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const file = new File([blob], 'pathways-result.png', { type: 'image/png' });
      
      const shareText = `Pathways by Daily Grid\n${dateText} • ${gridSize}\nTime: ${formatTime(finalTime)}\n\nhttps://dailygrid.app/games/pathways`;
      
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Pathways - Daily Grid',
          text: shareText,
          files: [file]
        });
      } else if (navigator.share) {
        await navigator.share({
          title: 'Pathways - Daily Grid',
          text: shareText,
          url: 'https://dailygrid.app/games/pathways'
        });
      } else {
        await navigator.clipboard.writeText(shareText);
        this.showShareFeedback('Copied to clipboard!');
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Share failed:', error);
        const shareText = `Pathways by Daily Grid\n${this.formatDateForShare(puzzleDate)} • ${gridSize}\nTime: ${formatTime(finalTime)}\n\nhttps://dailygrid.app/games/pathways`;
        try {
          await navigator.clipboard.writeText(shareText);
          this.showShareFeedback('Copied to clipboard!');
        } catch (clipError) {
          this.showShareFeedback('Unable to share');
        }
      }
    }
  }
  
  async loadLogoForShare(ctx, canvasWidth) {
    if (this.logoImage) return true;
    
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.logoImage = img;
        resolve(true);
      };
      img.onerror = () => {
        resolve(false);
      };
      img.src = '/games/pathways/pathways-logo.png';
    });
  }
  
  formatDateForShare(dateStr) {
    const [year, month, day] = dateStr.split('-');
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  }
  
  showShareFeedback(message) {
    const btn = this.elements.shareBtn;
    if (!btn) return;
    
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
      </svg>
      ${message}
    `;
    btn.disabled = true;
    
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }, 2000);
  }
  
  resetUI() {
    this.completionTime = null;
    this.modalShown = false;
    if (this.elements.pauseBtn) {
      this.elements.pauseBtn.disabled = false;
      this.elements.pauseBtn.classList.remove('hidden');
    }
    this.updatePauseState();
    this.updateStartOverlay();
    this.updateResetButton();
    this.updateExitReplayButton();
  }
  
  updateStartOverlay() {
    if (!this.elements.startOverlay) return;
    
    const hasProgress = Object.values(this.engine.state.paths).some(path => path && path.length > 0);
    const shouldShow = !this.engine.state.timerStarted && 
                       !this.engine.state.isComplete && 
                       !hasProgress;
    
    if (shouldShow) {
      this.elements.startOverlay.classList.remove('hidden');
      this.elements.pauseOverlay?.classList.add('hidden');
    } else {
      this.elements.startOverlay.classList.add('hidden');
    }
  }
  
  updateResetButton() {
    if (!this.elements.resetBtn) return;
    
    if (this.engine.state.isComplete) {
      this.elements.resetBtn.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9"/>
        </svg>
        Replay
      `;
    } else {
      this.elements.resetBtn.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg>
        Reset
      `;
    }
  }
  
  startGame() {
    if (this.engine.state.timerStarted || this.engine.state.isComplete) return;
    
    this.engine.startTimer();
    this.elements.startOverlay?.classList.add('hidden');
  }
}
