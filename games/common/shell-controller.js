import { buildShareText, formatDateForShare, shareWithFallback, showShareFeedback } from './share.js';
import { getGameMeta } from './games.js';
import { loadLeaderboard, submitScore, claimInitials, updateNextGamePromo } from './shell-ui.js';

const RESET_ICON = `
  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
  </svg>
  Reset
`;

const REPLAY_ICON = `
  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9"/>
  </svg>
  Replay
`;

const PAUSE_ICON = `
  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6"/>
  </svg>
  Pause
`;

const RESUME_ICON = `
  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
  </svg>
  Resume
`;

function defaultElements() {
  return {
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
    nextGameText: document.getElementById('next-game-text')
  };
}

export function createShellController(adapter, elementOverrides = null) {
  const meta = getGameMeta(adapter.gameId);
  const elements = { ...defaultElements(), ...(elementOverrides || {}) };

  let modalShown = false;
  let completionMs = null;
  let hasSubmittedScore = false;
  let isInReplayMode = false;
  let timerWasRunning = false;
  let lastPuzzleId = null;
  let lastMode = null;

  function puzzleKeyPrefix(prefix) {
    return `${prefix}${adapter.getPuzzleId()}`;
  }

  function loadSubmittedState() {
    if (!meta?.submittedKeyPrefix) return false;
    try {
      return localStorage.getItem(puzzleKeyPrefix(meta.submittedKeyPrefix)) === 'true';
    } catch {
      return false;
    }
  }

  function saveSubmittedState() {
    if (!meta?.submittedKeyPrefix) return;
    try {
      localStorage.setItem(puzzleKeyPrefix(meta.submittedKeyPrefix), 'true');
    } catch {
      // ignore
    }
  }

  function loadReplayMode() {
    if (!meta?.replayKeyPrefix) return false;
    if (adapter.getMode() !== 'daily') return false;
    try {
      return localStorage.getItem(puzzleKeyPrefix(meta.replayKeyPrefix)) === 'true';
    } catch {
      return false;
    }
  }

  function saveReplayMode(enabled) {
    if (!meta?.replayKeyPrefix) return;
    if (adapter.getMode() !== 'daily') return;
    try {
      const key = puzzleKeyPrefix(meta.replayKeyPrefix);
      if (enabled) localStorage.setItem(key, 'true');
      else localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  function syncPuzzleState() {
    const puzzleId = adapter.getPuzzleId();
    const mode = adapter.getMode();
    if (puzzleId === lastPuzzleId && mode === lastMode) return;

    lastPuzzleId = puzzleId;
    lastMode = mode;

    modalShown = false;
    completionMs = null;
    adapter.setCompletionMs?.(null);

    hasSubmittedScore = mode === 'daily' ? loadSubmittedState() : false;
    isInReplayMode = mode === 'daily' ? loadReplayMode() : false;

    if (adapter.isComplete() && !isInReplayMode) {
      completionMs = adapter.getCompletionMs?.() ?? completionMs;
      modalShown = true;
    }

    if (mode === 'daily' && hasSubmittedScore && !adapter.isComplete() && !isInReplayMode) {
      if (adapter.loadCompletedState?.()) {
        completionMs = adapter.getCompletionMs?.() ?? completionMs;
        modalShown = true;
      }
    }
  }

  function updateStartOverlay() {
    if (!elements.startOverlay) return;
    const hasProgress = adapter.hasProgress ? adapter.hasProgress() : false;
    const shouldShow = !adapter.isStarted() && !adapter.isComplete() && !hasProgress;

    if (shouldShow) {
      elements.startOverlay.classList.remove('hidden');
      elements.pauseOverlay?.classList.add('hidden');
    } else {
      elements.startOverlay.classList.add('hidden');
    }
  }

  function updatePauseState() {
    if (elements.pauseBtn) {
      if (adapter.isComplete()) {
        elements.pauseBtn.classList.add('hidden');
      } else {
        elements.pauseBtn.classList.remove('hidden');
        elements.pauseBtn.innerHTML = adapter.isPaused() ? RESUME_ICON : PAUSE_ICON;
        elements.pauseBtn.disabled = false;
      }
    }

    if (elements.pauseOverlay) {
      if (adapter.isPaused() && !adapter.isComplete()) elements.pauseOverlay.classList.remove('hidden');
      else elements.pauseOverlay.classList.add('hidden');
    }
  }

  function updateResetButton() {
    if (!elements.resetBtn) return;
    elements.resetBtn.innerHTML = adapter.isComplete() ? REPLAY_ICON : RESET_ICON;
  }

  function updateLeaderboardButton() {
    if (!elements.leaderboardBtn) return;
    if (adapter.getMode() !== 'daily') {
      elements.leaderboardBtn.classList.add('hidden');
      return;
    }

    if (adapter.isComplete()) elements.leaderboardBtn.classList.remove('hidden');
    else elements.leaderboardBtn.classList.add('hidden');
  }

  function updateExitReplayButton() {
    if (!elements.exitReplayBtn) return;
    if (adapter.getMode() === 'daily' && isInReplayMode && !adapter.isComplete()) {
      elements.exitReplayBtn.classList.remove('hidden');
    } else {
      elements.exitReplayBtn.classList.add('hidden');
    }
  }

  function setCompletionTimeIfNeeded() {
    if (!adapter.isComplete()) return;
    const existing = adapter.getCompletionMs?.();
    if (existing != null) {
      completionMs = existing;
      return;
    }
    if (completionMs == null) {
      completionMs = adapter.getElapsedMs();
      adapter.setCompletionMs?.(completionMs);
    }
  }

  function resetShellState() {
    modalShown = false;
    completionMs = null;
    adapter.setCompletionMs?.(null);
    elements.shareBtn?.classList.add('hidden');
    elements.practiceCompleteActions?.classList.add('hidden');
    elements.practiceCompleteActions?.classList.remove('flex');
    elements.leaderboardList?.classList.add('hidden');
    elements.leaderboardTitle?.classList.add('hidden');
    elements.percentileMsg?.classList.add('hidden');
    elements.claimInitialsForm?.classList.add('hidden');
  }

  async function shareResult() {
    if (!elements.shareBtn) return;

    const timeMs = completionMs ?? adapter.getElapsedMs();
    const shareMeta = adapter.getShareMeta?.() || {};
    const gameName = shareMeta.gameName || meta?.name || adapter.gameId;
    const shareUrl = shareMeta.shareUrl || meta?.shareUrl || '';
    const gridLabel = shareMeta.gridLabel || adapter.getGridLabel();
    const puzzleLabel = formatDateForShare(adapter.getPuzzleId());

    const shareText = buildShareText({
      gameName,
      puzzleLabel,
      gridLabel,
      timeText: adapter.formatTime(timeMs || 0),
      shareUrl
    });

    try {
      const shareFile = await adapter.getShareFile?.();
      await shareWithFallback({
        shareTitle: `${gameName} - Daily Grid`,
        shareText,
        shareUrl,
        shareFile: shareFile || undefined,
        onCopy: () => showShareFeedback(elements.shareBtn, 'Copied to clipboard!'),
        onError: () => showShareFeedback(elements.shareBtn, 'Unable to share')
      });
    } catch (error) {
      showShareFeedback(elements.shareBtn, 'Unable to share');
    }
  }

  async function loadLeaderboardIntoModal() {
    if (!elements.leaderboardList) return;
    await loadLeaderboard({
      container: elements.leaderboardList,
      api: `/api/${adapter.gameId}/leaderboard`,
      puzzleId: adapter.getPuzzleId(),
      formatTimeFn: adapter.formatTime
    });
  }

  async function submitScoreIfNeeded() {
    if (adapter.getMode() !== 'daily') return;
    if (!adapter.isComplete()) return;
    if (hasSubmittedScore) {
      if (elements.percentileMsg) {
        elements.percentileMsg.textContent = 'Score already submitted for today';
        elements.percentileMsg.classList.remove('hidden');
      }
      return;
    }

    try {
      const payload = adapter.getCompletionPayload?.() || { timeMs: completionMs ?? adapter.getElapsedMs(), hintsUsed: 0 };
      const data = await submitScore({
        api: `/api/${adapter.gameId}/complete`,
        puzzleId: adapter.getPuzzleId(),
        anonId: adapter.getAnonId(),
        timeMs: payload.timeMs,
        hintsUsed: payload.hintsUsed ?? 0
      });

      hasSubmittedScore = true;
      saveSubmittedState();

      if (elements.percentileMsg) {
        const msg = `You ranked ${data.rank} out of ${data.total} solvers today (top ${100 - data.percentile}%)!`;
        elements.percentileMsg.textContent = msg;
        elements.percentileMsg.classList.remove('hidden');
      }

      if (data.rank <= 10 && elements.claimInitialsForm) {
        elements.claimInitialsForm.classList.remove('hidden');
      }
    } catch (error) {
      if (elements.percentileMsg) {
        elements.percentileMsg.textContent = 'Leaderboard temporarily unavailable';
        elements.percentileMsg.classList.remove('hidden');
      }
    }
  }

  async function handleClaimInitials(event) {
    event.preventDefault();
    const initials = elements.initialsInput?.value?.toUpperCase().trim();
    if (!initials || initials.length > 3) return;
    try {
      await claimInitials({
        api: `/api/${adapter.gameId}/claim-initials`,
        puzzleId: adapter.getPuzzleId(),
        anonId: adapter.getAnonId(),
        initials
      });
      elements.claimInitialsForm?.classList.add('hidden');
      await loadLeaderboardIntoModal();
    } catch (error) {
      alert(error.message || 'Failed to save initials. Please try again.');
    }
  }

  function showCompletionModal({ force = false } = {}) {
    if (!elements.completionModal) return;
    if (!force && !adapter.isComplete()) return;
    if (adapter.shouldShowCompletionModal && !adapter.shouldShowCompletionModal()) return;

    elements.practiceCompleteActions?.classList.add('hidden');
    elements.practiceCompleteActions?.classList.remove('flex');
    elements.leaderboardList?.classList.add('hidden');
    elements.leaderboardTitle?.classList.add('hidden');
    elements.percentileMsg?.classList.add('hidden');
    elements.claimInitialsForm?.classList.add('hidden');
    elements.shareBtn?.classList.add('hidden');
    elements.practiceInfiniteBtn?.classList.add('hidden');

    const finalTime = completionMs ?? adapter.getElapsedMs();
    if (elements.finalTime) elements.finalTime.textContent = adapter.formatTime(finalTime || 0);

    if (adapter.getMode() === 'daily') {
      const dailyTitle = adapter.getDailyModalTitle?.() || 'Solved!';
      const dailySubtitle = adapter.getDailyModalSubtitle?.() || "Great work on today's puzzle";
      if (elements.modalTitle) elements.modalTitle.textContent = dailyTitle;
      if (elements.modalSubtitle) elements.modalSubtitle.textContent = dailySubtitle;

      elements.shareBtn?.classList.remove('hidden');
      elements.leaderboardTitle?.classList.remove('hidden');
      elements.leaderboardList?.classList.remove('hidden');
      elements.practiceInfiniteBtn?.classList.remove('hidden');

      updateNextGamePromo({
        gameId: adapter.gameId,
        puzzleId: adapter.getPuzzleId(),
        elements: {
          nextGamePromo: elements.nextGamePromo,
          nextGameLink: elements.nextGameLink,
          nextGameLogo: elements.nextGameLogo,
          nextGameText: elements.nextGameText
        }
      });

      submitScoreIfNeeded();
      loadLeaderboardIntoModal();
    } else {
      const practiceTitle = adapter.getPracticeModalTitle?.() || 'Nice Job!';
      const practiceSubtitle = adapter.getPracticeModalSubtitle?.() || 'Practice puzzle complete';
      if (elements.modalTitle) elements.modalTitle.textContent = practiceTitle;
      if (elements.modalSubtitle) elements.modalSubtitle.textContent = practiceSubtitle;

      elements.practiceCompleteActions?.classList.remove('hidden');
      elements.practiceCompleteActions?.classList.add('flex');
    }

    elements.completionModal.classList.remove('hidden');
  }

  function hideCompletionModal() {
    elements.completionModal?.classList.add('hidden');
  }

  function confirmReset() {
    timerWasRunning = adapter.isTimerRunning ? adapter.isTimerRunning() : (!adapter.isPaused() && adapter.isStarted());
    if (timerWasRunning) adapter.pause();
    updatePauseState();
    elements.resetModal?.classList.remove('hidden');
  }

  function hideResetModal() {
    elements.resetModal?.classList.add('hidden');
  }

  function confirmExitReplay() {
    timerWasRunning = adapter.isTimerRunning ? adapter.isTimerRunning() : (!adapter.isPaused() && adapter.isStarted());
    if (timerWasRunning) adapter.pause();
    updatePauseState();
    elements.exitReplayModal?.classList.remove('hidden');
  }

  function hideExitReplayModal() {
    elements.exitReplayModal?.classList.add('hidden');
  }

  function startReplay() {
    isInReplayMode = true;
    saveReplayMode(true);
    adapter.startReplay();
    resetShellState();
    adapter.onResetUI?.();
    updateStartOverlay();
    updateExitReplayButton();
    adapter.onReplayStateChange?.(true);
  }

  function exitReplay() {
    isInReplayMode = false;
    saveReplayMode(false);
    adapter.exitReplay();
    adapter.onReplayStateChange?.(false);
  }

  function init() {
    elements.pauseBtn?.addEventListener('click', () => {
      if (adapter.isComplete()) return;
      if (adapter.isPaused()) adapter.resume();
      else adapter.pause();
      updatePauseState();
    });

    elements.pauseOverlay?.addEventListener('click', () => {
      if (adapter.isComplete()) return;
      adapter.resume();
      updatePauseState();
    });

    elements.startOverlay?.addEventListener('click', () => {
      if (adapter.isComplete()) return;
      adapter.startGame();
      updateStartOverlay();
    });

    elements.resetBtn?.addEventListener('click', () => {
      if (adapter.isComplete()) {
        startReplay();
      } else {
        confirmReset();
      }
    });

    elements.confirmResetBtn?.addEventListener('click', () => {
      hideResetModal();
      adapter.resetGame();
      resetShellState();
      adapter.onResetUI?.();
      adapter.saveProgress?.();
      updateStartOverlay();
      updatePauseState();
      updateResetButton();
      updateExitReplayButton();
    });

    elements.cancelResetBtn?.addEventListener('click', () => {
      hideResetModal();
      if (timerWasRunning) adapter.resume();
      updatePauseState();
    });

    elements.exitReplayBtn?.addEventListener('click', () => {
      confirmExitReplay();
    });

    elements.confirmExitReplayBtn?.addEventListener('click', () => {
      hideExitReplayModal();
      exitReplay();
    });

    elements.cancelExitReplayBtn?.addEventListener('click', () => {
      hideExitReplayModal();
      if (timerWasRunning) adapter.resume();
      updatePauseState();
    });

    elements.leaderboardBtn?.addEventListener('click', () => {
      if (adapter.getMode() !== 'daily') return;
      if (!adapter.isComplete() && !adapter.allowLeaderboardWhenIncomplete) return;
      showCompletionModal({ force: true });
    });

    elements.closeModalBtn?.addEventListener('click', hideCompletionModal);

    elements.shareBtn?.addEventListener('click', shareResult);

    elements.claimInitialsForm?.addEventListener('submit', handleClaimInitials);

    elements.tryAgainBtn?.addEventListener('click', () => {
      hideCompletionModal();
      resetShellState();
      adapter.onTryAgain?.();
    });

    elements.nextLevelBtn?.addEventListener('click', () => {
      hideCompletionModal();
      resetShellState();
      adapter.onNextLevel?.();
    });

    elements.backToDailyCompleteBtn?.addEventListener('click', () => {
      hideCompletionModal();
      resetShellState();
      adapter.onBackToDaily?.();
    });

    elements.practiceInfiniteBtn?.addEventListener('click', () => {
      hideCompletionModal();
      resetShellState();
      adapter.onPracticeInfinite?.();
    });
  }

  function update() {
    syncPuzzleState();
    setCompletionTimeIfNeeded();

    updateStartOverlay();
    updatePauseState();
    updateResetButton();
    updateLeaderboardButton();
    updateExitReplayButton();

    if (adapter.isComplete()) {
      if (isInReplayMode) {
        isInReplayMode = false;
        saveReplayMode(false);
        adapter.onReplayStateChange?.(false);
      }
      if (!modalShown && (!adapter.shouldShowCompletionModal || adapter.shouldShowCompletionModal())) {
        modalShown = true;
        showCompletionModal();
      }
    }
  }

  init();

  return {
    update,
    resetUI: resetShellState,
    showCompletionModal,
    hideCompletionModal,
    isInReplayMode: () => isInReplayMode,
    setModalShown: (val) => { modalShown = val; }
  };
}
