import { formatTime, getOrCreateAnonId, getPTDateYYYYMMDD } from './snake-utils.js';

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
    
    this.elements = {
      timer: document.getElementById('timer'),
      pauseBtn: document.getElementById('pause-btn'),
      resetBtn: document.getElementById('reset-btn'),
      leaderboardBtn: document.getElementById('leaderboard-btn'),
      pauseOverlay: document.getElementById('pause-overlay'),
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
      cancelResetBtn: document.getElementById('cancel-reset-btn')
    };
    
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
    if (this.mode === 'daily' && this.hasSubmittedScore && !this.engine.state.isComplete) {
      if (this.engine.loadCompletedState()) {
        this.completionTime = this.engine.state.timeMs;
        this.modalShown = true;
      }
    }
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
  
  setupListeners() {
    this.elements.pauseBtn?.addEventListener('click', () => this.togglePause());
    this.elements.resetBtn?.addEventListener('click', () => this.confirmReset());
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
    });
    
    this.elements.practiceRetryNewBtn?.addEventListener('click', () => {
      this.hideCompletionModal();
      if (this.onNextLevel) {
        this.onNextLevel(); // Effectively same as "Next Level" but communicates "Try Another"
      }
    });
    
    this.elements.backToDailyCompleteBtn?.addEventListener('click', () => {
      this.hideCompletionModal();
      window.startDailyMode();
    });
    
    // Daily Mode: Practice Button
    this.elements.practiceInfiniteBtn?.addEventListener('click', () => {
      this.hideCompletionModal();
      window.startPracticeMode();
    });
    
    // Reset Modal Logic
    this.elements.confirmResetBtn?.addEventListener('click', () => {
      this.hideResetModal();
      // Regular reset (during play) keeps timer running
      this.onReset(); 
    });
    
    this.elements.cancelResetBtn?.addEventListener('click', () => {
      this.hideResetModal();
    });
    
    // Click on pause overlay to resume
    this.elements.pauseOverlay?.addEventListener('click', () => {
      if (this.engine.state.isPaused && !this.engine.state.isComplete) {
        this.togglePause();
      }
    });
    
    this.elements.claimInitialsForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.claimInitials();
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
      this.showCompletionModal();
    }

    // Show leaderboard button if complete
    if (this.engine.state.isComplete) {
      this.elements.leaderboardBtn?.classList.remove('hidden');
    } else {
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
        // Show "Complete" state - disable interactions
        this.elements.pauseBtn.innerHTML = `
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
          Complete
        `;
        this.elements.pauseBtn.disabled = true;
        this.elements.pauseBtn.classList.add('opacity-50', 'cursor-not-allowed');
      } else if (this.engine.state.isPaused) {
        this.elements.pauseBtn.innerHTML = `
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          Resume
        `;
        this.elements.pauseBtn.disabled = false;
        this.elements.pauseBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      } else {
        this.elements.pauseBtn.innerHTML = `
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6"/>
          </svg>
          Pause
        `;
        this.elements.pauseBtn.disabled = false;
        this.elements.pauseBtn.classList.remove('opacity-50', 'cursor-not-allowed');
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
    this.elements.resetModal?.classList.remove('hidden');
  }
  
  hideResetModal() {
    this.elements.resetModal?.classList.add('hidden');
  }
  
  async showCompletionModal(skipSubmission = false) {
    if (!this.elements.completionModal) return;
    
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
      if (!skipSubmission) {
        await this.submitScore(finalTime);
      }
      await this.loadLeaderboard();
      this.elements.closeModalBtn?.classList.remove('hidden');
      this.elements.practiceInfiniteBtn?.classList.remove('hidden');
      
      this.elements.practiceCompleteActions?.classList.add('hidden');
      this.elements.nextLevelBtn?.classList.add('hidden');
      
      if (this.elements.leaderboardList) this.elements.leaderboardList.classList.remove('hidden');
      if (this.elements.leaderboardTitle) this.elements.leaderboardTitle.classList.remove('hidden');
      if (this.elements.percentileMsg) this.elements.percentileMsg.classList.remove('hidden');
      
      if (this.elements.modalTitle) this.elements.modalTitle.textContent = 'Complete!';
      if (this.elements.modalSubtitle) this.elements.modalSubtitle.textContent = "Great work on today's puzzle";
    } else {
      // Practice mode
      if (this.elements.percentileMsg) {
        this.elements.percentileMsg.textContent = 'Practice puzzle complete!';
        // Hide "today's top 10" and percentile msg styling if needed
        this.elements.percentileMsg.classList.add('hidden'); // Actually hide it to avoid duplicate messages
      }
      
      if (this.elements.modalTitle) this.elements.modalTitle.textContent = 'Nice Job!';
      if (this.elements.modalSubtitle) this.elements.modalSubtitle.textContent = 'Practice puzzle complete';
      if (this.elements.claimInitialsForm) {
        this.elements.claimInitialsForm.classList.add('hidden');
      }
      if (this.elements.leaderboardList) {
        this.elements.leaderboardList.classList.add('hidden');
      }
      if (this.elements.leaderboardTitle) {
        this.elements.leaderboardTitle.classList.add('hidden');
      }
      
      this.elements.closeModalBtn?.classList.add('hidden');
      this.elements.practiceInfiniteBtn?.classList.add('hidden');
      
      this.elements.practiceCompleteActions?.classList.remove('hidden');
      this.elements.practiceCompleteActions?.classList.add('flex');
      
      // Ensure Next Level button is visible (might have been hidden by Daily mode)
      this.elements.nextLevelBtn?.classList.remove('hidden');
    }
    
    this.elements.completionModal.classList.remove('hidden');
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
  
  // Reset UI state (called when puzzle is reset)
  resetUI() {
    this.completionTime = null;
    this.modalShown = false;
    // Re-enable pause button
    if (this.elements.pauseBtn) {
      this.elements.pauseBtn.disabled = false;
      this.elements.pauseBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
    this.updatePauseState();
  }
}
