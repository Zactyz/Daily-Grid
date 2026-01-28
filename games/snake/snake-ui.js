import { formatTime, getOrCreateAnonId, getPTDateYYYYMMDD } from './snake-utils.js';

const OTHER_GAMES = [
  {
    id: 'pathways',
    name: 'Pathways',
    path: '/games/pathways/',
    logo: '/games/pathways/pathways-logo.png',
    submittedKeyPrefix: 'dailygrid_pathways_submitted_',
    theme: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-400' }
  }
  // Future games can be added here
];

export class SnakeUI {
  constructor(engine, onReset, onNextLevel, mode = 'daily') {
    this.engine = engine;
    this.onReset = onReset;
    this.onNextLevel = onNextLevel;
    this.mode = mode;
    
    this.lastUIUpdate = 0;
    this.uiThrottleMs = 100;
    this.modalShown = false;
    this.completionTime = null; // Lock in time when completed
    this.hasSubmittedScore = false; // Track if score was submitted (only first attempt counts)
    this.timerWasRunning = false; // Track timer state during reset dialog
    this.isInReplayMode = this.loadReplayMode(); // Track if user is replaying a completed puzzle
    
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
      practiceRetryNewBtn: document.getElementById('practice-retry-new-btn'),
      backToDailyCompleteBtn: document.getElementById('back-to-daily-complete-btn'),
      practiceCompleteActions: document.getElementById('practice-complete-actions'),
      modalTitle: document.getElementById('modal-title'),
      modalSubtitle: document.getElementById('modal-subtitle'),
      
      // Reset Modal
      resetModal: document.getElementById('reset-modal'),
      confirmResetBtn: document.getElementById('confirm-reset-btn'),
      cancelResetBtn: document.getElementById('cancel-reset-btn'),
      
      // Exit Replay Modal
      exitReplayModal: document.getElementById('exit-replay-modal'),
      confirmExitReplayBtn: document.getElementById('confirm-exit-replay-btn'),
      cancelExitReplayBtn: document.getElementById('cancel-exit-replay-btn'),
      exitReplayBtn: document.getElementById('exit-replay-btn'),
      
      // Share
      shareBtn: document.getElementById('share-btn'),
      
      // Cross-game promotion
      nextGamePromo: document.getElementById('next-game-promo'),
      nextGameLink: document.getElementById('next-game-link'),
      nextGameLogo: document.getElementById('next-game-logo'),
      nextGameText: document.getElementById('next-game-text'),
      externalGamePromo: document.getElementById('external-game-promo'),
      externalGameLogo: document.getElementById('external-game-logo'),
      externalGameText: document.getElementById('external-game-text'),
      
      // Validation messages
      validationMessage: document.getElementById('validation-message'),
      validationMessageText: document.getElementById('validation-message-text'),
      
      // Show solution (practice mode)
      showSolutionBtn: document.getElementById('show-solution-btn'),
      solutionActions: document.getElementById('solution-actions'),
      solutionRetryBtn: document.getElementById('solution-retry-btn'),
      solutionNextBtn: document.getElementById('solution-next-btn')
    };
    
    this.validationTimeout = null;
    this.solutionShown = false;
    
    // Check if already submitted for today
    if (this.mode === 'daily') {
      this.checkIfAlreadySubmitted();
    }
    
    this.setupListeners();
    this.setupVisibilityHandler();
    
    // If puzzle was already completed (loaded from storage), lock the time
    if (this.engine.state.isComplete) {
      this.completionTime = this.engine.state.timeMs;
      this.modalShown = true; // Don't auto-show modal on reload
    }
    
    // If score was already submitted today but puzzle was reset, restore completed state
    // BUT not if user is in replay mode (they intentionally want to replay)
    if (this.mode === 'daily' && this.hasSubmittedScore && !this.engine.state.isComplete && !this.isInReplayMode) {
      if (this.engine.loadCompletedState()) {
        this.completionTime = this.engine.state.timeMs;
        this.modalShown = true;
      }
    }
    
    // Show start overlay if puzzle hasn't been started yet
    this.updateStartOverlay();
    
    // Update pause button state (handles hiding when complete)
    this.updatePauseState();
    
    // Update reset button text/icon based on state
    this.updateResetButton();
    
    // Hide exit replay button initially
    this.updateExitReplayButton();
    
    // Show external cross-game promo if applicable
    this.updateExternalGamePromo();
    
    // Show solution button (practice mode only)
    this.updateShowSolutionButton();
  }
  
  checkIfAlreadySubmitted() {
    try {
      const puzzleId = getPTDateYYYYMMDD();
      const submittedKey = `dailygrid_submitted_${puzzleId}`;
      this.hasSubmittedScore = localStorage.getItem(submittedKey) === 'true';
    } catch (e) {
      this.hasSubmittedScore = false;
    }
  }
  
  markAsSubmitted() {
    try {
      const puzzleId = getPTDateYYYYMMDD();
      const submittedKey = `dailygrid_submitted_${puzzleId}`;
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
      const replayKey = `dailygrid_replay_${puzzleId}`;
      return localStorage.getItem(replayKey) === 'true';
    } catch (e) {
      return false;
    }
  }
  
  saveReplayMode(isReplaying) {
    if (this.mode !== 'daily') return;
    try {
      const puzzleId = getPTDateYYYYMMDD();
      const replayKey = `dailygrid_replay_${puzzleId}`;
      if (isReplaying) {
        localStorage.setItem(replayKey, 'true');
      } else {
        localStorage.removeItem(replayKey);
      }
    } catch (e) {
      console.warn('Failed to save replay mode');
    }
  }
  
  // Helper to replace element (removes all old listeners by cloning)
  replaceElement(el) {
    if (!el) return null;
    if (!el.parentNode) {
      // Element not in DOM - can't replace, but shouldn't happen for our static HTML elements
      console.warn('replaceElement: element has no parent', el.id);
      return el;
    }
    const newEl = el.cloneNode(true);
    el.parentNode.replaceChild(newEl, el);
    return newEl;
  }
  
  setupListeners() {
    // Replace elements that may have accumulated listeners from previous UI instances
    // This ensures clean listener state for buttons that stay visible across mode changes
    this.elements.showSolutionBtn = this.replaceElement(this.elements.showSolutionBtn);
    this.elements.solutionRetryBtn = this.replaceElement(this.elements.solutionRetryBtn);
    this.elements.solutionNextBtn = this.replaceElement(this.elements.solutionNextBtn);
    this.elements.practiceInfiniteBtn = this.replaceElement(this.elements.practiceInfiniteBtn);
    this.elements.backToDailyCompleteBtn = this.replaceElement(this.elements.backToDailyCompleteBtn);
    this.elements.nextLevelBtn = this.replaceElement(this.elements.nextLevelBtn);
    this.elements.tryAgainBtn = this.replaceElement(this.elements.tryAgainBtn);
    this.elements.practiceRetryNewBtn = this.replaceElement(this.elements.practiceRetryNewBtn);
    
    this.elements.pauseBtn?.addEventListener('click', () => this.togglePause());
    this.elements.resetBtn?.addEventListener('click', () => {
      if (this.engine.state.isComplete) {
        // Replay: Skip confirmation, reset immediately
        this.startReplay();
      } else {
        // Reset during play: Show confirmation
        this.confirmReset();
      }
    });
    
    // Exit Replay button (X) - restore completed state
    this.elements.exitReplayBtn?.addEventListener('click', () => {
      this.confirmExitReplay();
    });
    this.elements.leaderboardBtn?.addEventListener('click', () => {
      // Show modal if complete
      if (this.engine.state.isComplete) {
        this.showCompletionModal(true); // true = force show without resubmitting
      }
    });
    
    // Close Modal Button (Daily Mode)
    this.elements.closeModalBtn?.addEventListener('click', () => this.hideCompletionModal());
    
    // Practice Mode Buttons
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
      this.engine.reset(false); // Reset timer too for "Try Again"
      this.resetUI();
      this.engine.saveProgress();
      this.updateStartOverlay(); // Show begin screen
    });
    
    this.elements.practiceRetryNewBtn?.addEventListener('click', () => {
      this.hideCompletionModal();
      if (this.onNextLevel) {
        this.onNextLevel(); // Effectively same as "Next Level" but communicates "Try Another"
      }
    });
    
    this.elements.backToDailyCompleteBtn?.addEventListener('click', () => {
      this.hideCompletionModal();
      // Hide solution actions before switching modes
      this.elements.solutionActions?.classList.add('hidden');
      window.startDailyMode();
    });
    
    // Daily Mode: Practice Button
    this.elements.practiceInfiniteBtn?.addEventListener('click', () => {
      this.hideCompletionModal();
      // Hide solution actions before switching modes
      this.elements.solutionActions?.classList.add('hidden');
      window.startPracticeMode();
    });
    
    // Show Solution Button (practice mode only)
    this.elements.showSolutionBtn?.addEventListener('click', () => {
      this.showSolution();
    });
    
    // Solution revealed action buttons
    this.elements.solutionRetryBtn?.addEventListener('click', () => {
      this.engine.reset(false);
      this.resetUI();
      this.engine.saveProgress();
      this.updateStartOverlay();
    });
    
    this.elements.solutionNextBtn?.addEventListener('click', () => {
      // Hide solution actions before switching to new puzzle
      this.elements.solutionActions?.classList.add('hidden');
      window.startPracticeMode();
    });
    
    // Reset Modal Logic
    this.elements.confirmResetBtn?.addEventListener('click', () => {
      const wasComplete = this.engine.state.isComplete;
      const wasInReplay = this.isInReplayMode;
      this.hideResetModal();
      
      if (wasComplete) {
        // Completed puzzle: Start replay
        this.startReplay();
      } else if (wasInReplay) {
        // In replay mode: Reset but keep timer, stay in replay
        this.engine.state.path = []; // Clear path only
        this.engine.resume(); // Resume timer
        this.engine.saveProgress();
        // Hide all overlays - go straight back to playing
        this.elements.startOverlay?.classList.add('hidden');
        this.elements.pauseOverlay?.classList.add('hidden');
        this.updatePauseState();
      } else {
        // Normal play: Keep timer running, resume immediately
        this.engine.state.path = []; // Clear path only
        this.engine.resume(); // Resume timer (was paused during dialog)
        this.engine.saveProgress();
        // Hide all overlays - go straight back to playing
        this.elements.startOverlay?.classList.add('hidden');
        this.elements.pauseOverlay?.classList.add('hidden');
        this.updatePauseState();
      }
      this.updateResetButton();
    });
    
    this.elements.cancelResetBtn?.addEventListener('click', () => {
      this.hideResetModal();
      // Resume timer if it was running before dialog opened
      if (this.timerWasRunning) {
        this.engine.resume();
        this.updatePauseState();
      }
    });
    
    // Exit Replay Modal Logic
    this.elements.confirmExitReplayBtn?.addEventListener('click', () => {
      this.hideExitReplayModal();
      this.isInReplayMode = false;
      this.saveReplayMode(false);
      // Restore completed state
      if (this.engine.loadCompletedState()) {
        this.completionTime = this.engine.state.timeMs;
        this.modalShown = true;
        this.updatePauseState();
        this.updateStartOverlay();
        this.updateResetButton();
        this.updateExitReplayButton();
        this.updateExternalGamePromo();
      }
    });
    
    this.elements.cancelExitReplayBtn?.addEventListener('click', () => {
      this.hideExitReplayModal();
      // Resume timer
      if (this.timerWasRunning) {
        this.engine.resume();
        this.updatePauseState();
      }
    });
    
    // Click on pause overlay to resume
    this.elements.pauseOverlay?.addEventListener('click', () => {
      if (this.engine.state.isPaused && !this.engine.state.isComplete) {
        this.togglePause();
      }
    });
    
    // Click on start overlay to begin
    this.elements.startOverlay?.addEventListener('click', () => {
      this.startGame();
    });
    
    this.elements.claimInitialsForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.claimInitials();
    });
    
    // Share button
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
    
    // Lock in completion time when puzzle is first completed
    if (this.engine.state.isComplete && this.completionTime === null) {
      this.completionTime = this.engine.state.timeMs;
    }
    
    // Update timer display - use locked time if completed
    if (this.elements.timer) {
      const displayTime = this.completionTime !== null ? this.completionTime : this.engine.state.timeMs;
      this.elements.timer.textContent = formatTime(displayTime);
    }
    
    // Show completion modal
    if (this.engine.state.isComplete && !this.modalShown) {
      this.modalShown = true;
      this.isInReplayMode = false; // Exit replay mode on completion
      this.saveReplayMode(false); // Clear from storage too
      this.updateResetButton(); // Change to "Replay"
      this.updateExitReplayButton(); // Hide X button
      this.updateExternalGamePromo(); // Show cross-game promo
      this.showCompletionModal();
    }

    // Show leaderboard button if complete (daily mode only)
    if (this.engine.state.isComplete && this.mode === 'daily') {
      this.elements.leaderboardBtn?.classList.remove('hidden');
      this.elements.pauseBtn?.classList.add('hidden');
    } else if (!this.engine.state.isComplete) {
      this.elements.leaderboardBtn?.classList.add('hidden');
    }
    
    // Hide leaderboard button in practice mode
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
    // Update button
    if (this.elements.pauseBtn) {
      if (this.engine.state.isComplete) {
        // Hide pause button when complete (leaderboard button shows instead)
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
    
    // Update overlay
    if (this.elements.pauseOverlay) {
      if (this.engine.state.isPaused && !this.engine.state.isComplete) {
        this.elements.pauseOverlay.classList.remove('hidden');
      } else {
        this.elements.pauseOverlay.classList.add('hidden');
      }
    }
  }
  
  confirmReset() {
    // Pause timer during dialog (if running)
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
  
  // Start replay immediately (no confirmation)
  startReplay() {
    this.isInReplayMode = true;
    this.saveReplayMode(true);
    this.engine.reset(false); // Reset timer and path
    this.resetUI();
    this.engine.saveProgress();
    this.updateStartOverlay();
    this.updateExitReplayButton();
    this.updateExternalGamePromo();
  }
  
  confirmExitReplay() {
    // Pause timer during dialog
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
  
  // Show/hide exit replay button
  updateExitReplayButton() {
    if (!this.elements.exitReplayBtn) return;
    
    // Show X button only when in replay mode and puzzle is not yet complete
    const shouldShow = this.isInReplayMode && !this.engine.state.isComplete;
    
    if (shouldShow) {
      this.elements.exitReplayBtn.classList.remove('hidden');
    } else {
      this.elements.exitReplayBtn.classList.add('hidden');
    }
  }
  
  showValidationMessage(message) {
    if (!this.elements.validationMessage || !this.elements.validationMessageText) return;
    
    // Clear any existing timeout
    if (this.validationTimeout) {
      clearTimeout(this.validationTimeout);
    }
    
    this.elements.validationMessageText.textContent = message;
    this.elements.validationMessage.classList.remove('hidden');
    
    // Auto-hide after 3 seconds
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
    
    // Only show in practice mode and when not already showing solution
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
    
    // Mark as viewing solution but NOT complete (no modal, allows review)
    this.engine.state.isPaused = true;
    
    // Hide the show solution button, pause button, and reset button
    this.elements.showSolutionBtn?.classList.add('hidden');
    this.elements.pauseBtn?.classList.add('hidden');
    this.elements.resetBtn?.classList.add('hidden');
    
    // Show the solution action buttons
    this.elements.solutionActions?.classList.remove('hidden');
    
    // Show a message
    this.showValidationMessage('Solution revealed!');
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
    
    // Hide if actively playing (including replay mode)
    // Show only when puzzle is complete AND not in replay mode
    if (!this.engine.state.isComplete || this.isInReplayMode) {
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
    
    // Reset all modal elements to default hidden state first
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
    
    // Use the locked completion time
    const finalTime = this.completionTime !== null ? this.completionTime : this.engine.state.timeMs;
    
    if (this.elements.finalTime) {
      this.elements.finalTime.textContent = formatTime(finalTime);
    }
    
    // Hide pause overlay if showing
    if (this.elements.pauseOverlay) {
      this.elements.pauseOverlay.classList.add('hidden');
    }
    
    if (this.mode === 'daily') {
      // Set title/subtitle first
      if (this.elements.modalTitle) this.elements.modalTitle.textContent = 'Complete!';
      if (this.elements.modalSubtitle) this.elements.modalSubtitle.textContent = "Great work on today's puzzle";
      
      // Show leaderboard section with loading state
      this.elements.leaderboardList?.classList.remove('hidden');
      this.elements.leaderboardTitle?.classList.remove('hidden');
      if (this.elements.leaderboardList) {
        this.elements.leaderboardList.innerHTML = '<p class="text-zinc-500 text-center py-6 text-xs">Loading...</p>';
      }
      
      // Show buttons
      this.elements.shareBtn?.classList.remove('hidden');
      this.elements.closeModalBtn?.classList.remove('hidden');
      this.elements.practiceInfiniteBtn?.classList.remove('hidden');
      
      // Show modal now (content will load)
      this.elements.completionModal.classList.remove('hidden');
      
      if (!skipSubmission) {
        await this.submitScore(finalTime);
      }
      await this.loadLeaderboard();
      
      this.elements.percentileMsg?.classList.remove('hidden');
      
      this.showNextGamePromo();
    } else {
      // Practice mode
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
    // Only submit on first attempt - no gaming the leaderboard with resets
    if (this.hasSubmittedScore) {
      if (this.elements.percentileMsg) {
        this.elements.percentileMsg.textContent = 'Score already submitted for today';
      }
      return;
    }
    
    try {
      const anonId = getOrCreateAnonId();
      const puzzleId = getPTDateYYYYMMDD();
      
      const response = await fetch('/api/snake/complete', {
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
      
      // Mark as submitted so resets don't count
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
      const response = await fetch(`/api/snake/leaderboard?puzzleId=${puzzleId}`);
      
      if (!response.ok) throw new Error('Failed to load leaderboard');
      
      const data = await response.json();
      
      if (this.elements.leaderboardList && data.top10.length > 0) {
        this.elements.leaderboardList.innerHTML = data.top10.map((entry, idx) => `
          <div class="leaderboard-row flex items-center justify-between px-3 py-2.5 ${idx < data.top10.length - 1 ? 'border-b border-white/5' : ''}">
            <div class="flex items-center gap-3">
              <span class="w-6 h-6 rounded-md ${entry.rank <= 3 ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-700/50 text-zinc-500'} text-xs font-bold flex items-center justify-center">${entry.rank}</span>
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
      
      const response = await fetch('/api/snake/claim-initials', {
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
    
    // Generate share image at 2x resolution for HD/Retina
    const scale = 2;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Square-ish image dimensions
    const width = 400;
    const height = 340;
    canvas.width = width * scale;
    canvas.height = height * scale;
    ctx.scale(scale, scale);
    
    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#0a0a0f');
    gradient.addColorStop(1, '#12121a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    // Subtle pattern overlay
    ctx.fillStyle = 'rgba(240, 198, 104, 0.02)';
    for (let i = 0; i < width; i += 20) {
      for (let j = 0; j < height; j += 20) {
        ctx.fillRect(i, j, 1, 1);
      }
    }
    
    // Top glow
    const glowGradient = ctx.createRadialGradient(width/2, 0, 0, width/2, 0, 180);
    glowGradient.addColorStop(0, 'rgba(240, 198, 104, 0.12)');
    glowGradient.addColorStop(1, 'transparent');
    ctx.fillStyle = glowGradient;
    ctx.fillRect(0, 0, width, height);
    
    // Load and draw logo
    const logoLoaded = await this.loadLogoForShare(ctx, width);
    
    // Title with logo
    const titleY = 50;
    ctx.fillStyle = '#f0c674';
    ctx.font = 'bold 32px "Space Grotesk", system-ui, sans-serif';
    ctx.textAlign = 'center';
    
    if (logoLoaded) {
      // Logo + Snake text side by side
      const textWidth = ctx.measureText('Snake').width;
      const logoSize = 34;
      const gap = 8;
      const totalWidth = logoSize + gap + textWidth;
      const startX = (width - totalWidth) / 2;
      
      // Draw logo (already loaded)
      ctx.drawImage(this.logoImage, startX, titleY - 26, logoSize, logoSize);
      
      // Draw text
      ctx.textAlign = 'left';
      ctx.fillText('Snake', startX + logoSize + gap, titleY);
      ctx.textAlign = 'center';
    } else {
      ctx.fillText('Snake', width/2, titleY);
    }
    
    // Subtitle
    ctx.fillStyle = '#71717a';
    ctx.font = '14px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText('Daily Grid Puzzle', width/2, titleY + 24);
    
    // Date badge
    const dateText = this.formatDateForShare(puzzleDate);
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
    ctx.fillText(dateText, width/2, badgeY + 17);
    
    // Time display box
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
    
    // Time label
    ctx.fillStyle = 'rgba(240, 198, 104, 0.5)';
    ctx.font = '10px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText('MY TIME', width/2, timeBoxY + 22);
    
    // Time value
    ctx.fillStyle = '#f0c674';
    ctx.font = 'bold 38px "JetBrains Mono", monospace, system-ui';
    ctx.fillText(formatTime(finalTime), width/2, timeBoxY + 58);
    
    // Grid size below time box
    ctx.fillStyle = '#52525b';
    ctx.font = '12px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText(`${gridSize} Grid`, width/2, timeBoxY + timeBoxHeight + 18);
    
    // Convert to blob
    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const file = new File([blob], 'snake-result.png', { type: 'image/png' });
      
      // Share text with https:// for clickable link on iPhone
      const shareText = `Snake by Daily Grid\n${dateText} • ${gridSize}\nTime: ${formatTime(finalTime)}\n\nhttps://dailygrid.app/games/snake`;
      
      // Try native share first (mobile)
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Snake - Daily Grid',
          text: shareText,
          files: [file]
        });
      } else if (navigator.share) {
        // Share without image (some browsers)
        await navigator.share({
          title: 'Snake - Daily Grid',
          text: shareText,
          url: 'https://dailygrid.app/games/snake'
        });
      } else {
        // Fallback: Copy text to clipboard
        await navigator.clipboard.writeText(shareText);
        this.showShareFeedback('Copied to clipboard!');
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Share failed:', error);
        // Fallback to copying text
        const shareText = `Snake by Daily Grid\n${this.formatDateForShare(puzzleDate)} • ${gridSize}\nTime: ${formatTime(finalTime)}\n\nhttps://dailygrid.app/games/snake`;
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
    // Load logo image for share card
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
      img.src = '/games/snake/snake-logo.png';
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
    // Temporarily change share button text
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
  
  // Reset UI state (called when puzzle is reset)
  resetUI() {
    this.completionTime = null;
    this.modalShown = false;
    this.solutionShown = false; // Reset so Show Solution button can reappear
    // Re-enable and show pause button
    if (this.elements.pauseBtn) {
      this.elements.pauseBtn.disabled = false;
      this.elements.pauseBtn.classList.remove('hidden');
    }
    // Show reset button again
    this.elements.resetBtn?.classList.remove('hidden');
    // Hide solution action buttons
    this.elements.solutionActions?.classList.add('hidden');
    this.updatePauseState();
    this.updateStartOverlay();
    this.updateResetButton();
    this.updateExitReplayButton();
    this.updateShowSolutionButton();
  }
  
  // Show/hide start overlay based on whether the game has started
  updateStartOverlay() {
    if (!this.elements.startOverlay) return;
    
    // Show start overlay only if:
    // - Timer hasn't started yet
    // - Puzzle is not complete
    // - No progress (path is empty)
    const shouldShow = !this.engine.state.timerStarted && 
                       !this.engine.state.isComplete && 
                       this.engine.state.path.length === 0;
    
    if (shouldShow) {
      this.elements.startOverlay.classList.remove('hidden');
      // Hide pause overlay when showing start overlay
      this.elements.pauseOverlay?.classList.add('hidden');
    } else {
      this.elements.startOverlay.classList.add('hidden');
    }
  }
  
  // Update reset button text/icon based on completion state
  updateResetButton() {
    if (!this.elements.resetBtn) return;
    
    if (this.engine.state.isComplete) {
      // Replay mode - single spin arrow
      this.elements.resetBtn.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9"/>
        </svg>
        Replay
      `;
    } else {
      // Reset mode - double arrow
      this.elements.resetBtn.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg>
        Reset
      `;
    }
  }
  
  // Start the game (called when user clicks start overlay)
  startGame() {
    if (this.engine.state.timerStarted || this.engine.state.isComplete) return;
    
    this.engine.startTimer();
    this.elements.startOverlay?.classList.add('hidden');
  }
}
