import { buildShareText, formatDateForShare, shareWithFallback, showShareFeedback } from './share.js';
import { getGameMeta } from './games.js';
import { loadLeaderboard, submitScore, claimInitials, updateNextGamePromo } from './shell-ui.js';

const RESET_ICON = `
  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
  </svg>
  Reset
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
    nextGameText: document.getElementById('next-game-text'),
    externalGamePromo: document.getElementById('external-game-promo'),
    externalGameLink: document.getElementById('external-game-link'),
    externalGameLogo: document.getElementById('external-game-logo'),
    externalGameText: document.getElementById('external-game-text'),
    startOverlayText: document.getElementById('start-overlay-text'),
    practiceModeBtn: document.getElementById('practice-mode-btn'),
    backToDailyBtn: document.getElementById('back-to-daily-btn'),
    dailyBadge: document.getElementById('daily-badge'),
    practiceBadge: document.getElementById('practice-badge'),
    toast: document.getElementById('shell-toast'),
    toastText: document.getElementById('shell-toast-text')
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
  let autoPausedByVisibility = false;
  let lastPuzzleId = null;
  let lastMode = null;
  let toastTimeout = null;

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
    if (adapter.disableReplay) return false;
    if (!meta?.replayKeyPrefix) return false;
    if (adapter.getMode() !== 'daily') return false;
    try {
      return localStorage.getItem(puzzleKeyPrefix(meta.replayKeyPrefix)) === 'true';
    } catch {
      return false;
    }
  }

  function saveReplayMode(enabled) {
    if (adapter.disableReplay) return;
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
    completionMs = adapter.getCompletionMs?.() ?? null;

    hasSubmittedScore = mode === 'daily' ? loadSubmittedState() : false;
    isInReplayMode = (mode === 'daily' && !adapter.disableReplay) ? loadReplayMode() : false;

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

    if (elements.startOverlayText) {
      elements.startOverlayText.textContent = adapter.getMode() === 'practice'
        ? 'Tap to begin practice'
        : 'Tap to begin';
    }

    if (shouldShow) {
      elements.startOverlay.classList.remove('hidden');
      elements.pauseOverlay?.classList.add('hidden');
    } else {
      elements.startOverlay.classList.add('hidden');
    }

    if (!adapter.isStarted() && !adapter.isComplete() && hasProgress && adapter.autoStartOnProgress) {
      adapter.startGame();
    }
  }

  function updateModeUI() {
    if (!elements.dailyBadge && !elements.practiceBadge) return;
    if (adapter.getMode() === 'daily') {
      elements.dailyBadge?.classList.remove('hidden');
      elements.practiceBadge?.classList.add('hidden');
      elements.practiceModeBtn?.classList.remove('hidden');
      elements.backToDailyBtn?.classList.add('hidden');
    } else {
      elements.dailyBadge?.classList.add('hidden');
      elements.practiceBadge?.classList.remove('hidden');
      elements.practiceModeBtn?.classList.add('hidden');
      elements.backToDailyBtn?.classList.remove('hidden');
    }
  }

  function updatePauseState() {
    if (elements.pauseBtn) {
      if (adapter.isComplete() || adapter.isSolutionShown?.()) {
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

  function updateTimerDisplay() {
    if (!elements.timer) return;
    if (adapter.disableShellTimer) return;
    const ms = adapter.getTimerDisplayMs
      ? adapter.getTimerDisplayMs()
      : (adapter.isComplete() ? (completionMs ?? adapter.getElapsedMs()) : adapter.getElapsedMs());
    elements.timer.textContent = adapter.formatTime(ms || 0);
  }

  function updateExternalPromo() {
    if (!elements.externalGamePromo) return;
    const shouldShow = adapter.getMode() === 'daily' && adapter.isComplete() && !isInReplayMode;
    if (!shouldShow) {
      elements.externalGamePromo.classList.add('hidden');
      return;
    }

    updateNextGamePromo({
      gameId: adapter.gameId,
      puzzleId: adapter.getPuzzleId(),
      elements: {
        nextGamePromo: elements.externalGamePromo,
        nextGameLink: elements.externalGameLink || elements.externalGamePromo,
        nextGameLogo: elements.externalGameLogo,
        nextGameText: elements.externalGameText
      }
    });
  }

  function updateResetButton() {
    if (!elements.resetBtn) return;
    if (adapter.isSolutionShown?.()) {
      elements.resetBtn.classList.add('hidden');
      return;
    }
    elements.resetBtn.classList.remove('hidden');
    elements.resetBtn.innerHTML = RESET_ICON;
  }

  function updateLeaderboardButton() {
    if (!elements.leaderboardBtn) return;
    if (adapter.isSolutionShown?.()) {
      elements.leaderboardBtn.classList.add('hidden');
      return;
    }
    if (adapter.getMode() !== 'daily') {
      elements.leaderboardBtn.classList.add('hidden');
      return;
    }

    if (adapter.isComplete()) elements.leaderboardBtn.classList.remove('hidden');
    else elements.leaderboardBtn.classList.add('hidden');
  }

  function updateExitReplayButton() {
    if (!elements.exitReplayBtn) return;
    if (!adapter.disableReplay && adapter.getMode() === 'daily' && isInReplayMode && !adapter.isComplete()) {
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
    const puzzleLabel = shareMeta.puzzleLabel || formatDateForShare(adapter.getPuzzleId());

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
      const shareMeta = adapter.getShareMeta?.() || {};
      const gameName = shareMeta.gameName || meta?.name || adapter.gameId;
      const dailyTitle = adapter.getDailyModalTitle?.() || 'Solved!';
      const dailySubtitle = adapter.getDailyModalSubtitle?.() || `Great job on today's ${gameName}`;
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
    const replace = (el) => {
      if (!el || !el.parentNode) return el;
      const clone = el.cloneNode(true);
      el.parentNode.replaceChild(clone, el);
      return clone;
    };

    elements.pauseBtn = replace(elements.pauseBtn);
    elements.resetBtn = replace(elements.resetBtn);
    elements.leaderboardBtn = replace(elements.leaderboardBtn);
    elements.pauseOverlay = replace(elements.pauseOverlay);
    elements.startOverlay = replace(elements.startOverlay);
    elements.confirmResetBtn = replace(elements.confirmResetBtn);
    elements.cancelResetBtn = replace(elements.cancelResetBtn);
    elements.exitReplayBtn = replace(elements.exitReplayBtn);
    elements.confirmExitReplayBtn = replace(elements.confirmExitReplayBtn);
    elements.cancelExitReplayBtn = replace(elements.cancelExitReplayBtn);
    elements.closeModalBtn = replace(elements.closeModalBtn);
    elements.shareBtn = replace(elements.shareBtn);
    elements.claimInitialsForm = replace(elements.claimInitialsForm);
    elements.initialsInput = elements.claimInitialsForm?.querySelector('#initials-input') || elements.initialsInput;
    elements.tryAgainBtn = replace(elements.tryAgainBtn);
    elements.nextLevelBtn = replace(elements.nextLevelBtn);
    elements.backToDailyCompleteBtn = replace(elements.backToDailyCompleteBtn);
    elements.practiceInfiniteBtn = replace(elements.practiceInfiniteBtn);
    elements.practiceModeBtn = replace(elements.practiceModeBtn);
    elements.backToDailyBtn = replace(elements.backToDailyBtn);

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
      confirmReset();
    });

    elements.confirmResetBtn?.addEventListener('click', () => {
      hideResetModal();
      adapter.resetGame();
      if (timerWasRunning) adapter.resume();
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

    elements.practiceModeBtn?.addEventListener('click', () => {
      resetShellState();
      adapter.onResetUI?.();
      adapter.onStartPractice?.();
    });

    elements.backToDailyBtn?.addEventListener('click', () => {
      resetShellState();
      adapter.onResetUI?.();
      adapter.onStartDaily?.();
    });

    document.addEventListener('visibilitychange', () => {
      if (adapter.pauseOnHide === false) return;
      if (document.visibilityState === 'hidden') {
        if (adapter.isStarted() && !adapter.isPaused() && !adapter.isComplete()) {
          adapter.pause();
          updatePauseState();
          autoPausedByVisibility = true;
        }
      } else if (autoPausedByVisibility) {
        adapter.resume();
        updatePauseState();
        autoPausedByVisibility = false;
      }
    });
  }

  function showToast(message, { durationMs = 2500 } = {}) {
    if (!elements.toast || !elements.toastText) return;
    elements.toastText.textContent = message;
    elements.toast.classList.remove('hidden');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      elements.toast.classList.add('hidden');
    }, durationMs);
  }

  function hideToast() {
    elements.toast?.classList.add('hidden');
    if (toastTimeout) {
      clearTimeout(toastTimeout);
      toastTimeout = null;
    }
  }

  function update() {
    syncPuzzleState();
    setCompletionTimeIfNeeded();

    updateStartOverlay();
    updatePauseState();
    updateTimerDisplay();
    updateResetButton();
    updateLeaderboardButton();
    updateExitReplayButton();
    updateModeUI();
    updateExternalPromo();

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
    setModalShown: (val) => { modalShown = val; },
    showToast,
    hideToast
  };
}
