import { buildShareText, formatDateForShare, shareWithFallback, showShareFeedback } from './share.js';
import { getGameMeta, recordGameCompletion } from './games.js';
import { loadLeaderboard, submitScore, claimInitials, updateNextGamePromo } from './shell-ui.js';
import { recordStreak, getStreak, getMsUntilPTMidnight, formatCountdown } from './streak.js';
import { recordStats, showStatsModal } from './stats.js';
import { getPTDateYYYYMMDD } from './utils.js';
import { requestPushPermission, isPushSubscribed, hasPushOptIn } from './push.js';
import { showTutorialModal } from './tutorial-modal.js';
import { maybeShowAnnouncementModal } from './announcements.js';

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

let touchGuardInitialized = false;

function shouldAllowDoubleTap(target) {
  if (!target) return false;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return true;
  return false;
}

  function initTouchGuards() {
  if (touchGuardInitialized || typeof window === 'undefined') return;
  touchGuardInitialized = true;
  let lastTouchEnd = 0;

  document.addEventListener('touchend', (event) => {
    const target = event.target;
    if (shouldAllowDoubleTap(target)) return;
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });

  document.addEventListener('gesturestart', (event) => {
    event.preventDefault();
  }, { passive: false });
  }

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
  initTouchGuards();
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
  const wantsLeaderboard = new URLSearchParams(window.location.search).get('leaderboard') === '1';
  let leaderboardDeepLink = wantsLeaderboard;
  let modalPending = false;
  let latestPlayerEntry = null;

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

  function loadCompletedState() {
    if (!meta?.completedKeyPrefix) return false;
    try {
      return localStorage.getItem(puzzleKeyPrefix(meta.completedKeyPrefix)) === 'true';
    } catch {
      return false;
    }
  }

  function leaderboardEntryKey() {
    return `dailygrid_${adapter.gameId}_leaderboard_${adapter.getPuzzleId()}`;
  }

  function leaderboardSeenKey() {
    return `dailygrid_${adapter.gameId}_leaderboard_seen_${adapter.getPuzzleId()}`;
  }

  function hasSeenLeaderboard() {
    try {
      return localStorage.getItem(leaderboardSeenKey()) === '1';
    } catch {
      return false;
    }
  }

  function markLeaderboardSeen() {
    try {
      localStorage.setItem(leaderboardSeenKey(), '1');
    } catch {
      // ignore
    }
  }

  function loadLocalLeaderboardEntry() {
    try {
      const raw = localStorage.getItem(leaderboardEntryKey());
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !Number.isFinite(data.rank)) return null;
      return data;
    } catch {
      return null;
    }
  }

  function saveLocalLeaderboardEntry(entry) {
    if (!entry || !Number.isFinite(entry.rank)) return;
    try {
      localStorage.setItem(leaderboardEntryKey(), JSON.stringify(entry));
    } catch {
      // ignore
    }
  }

  function getPlayerEntry() {
    return latestPlayerEntry || loadLocalLeaderboardEntry();
  }

  function shouldUseYouLabel(entry) {
    if (!entry) return false;
    if (entry.initials) return false;
    return !hasSeenLeaderboard();
  }

  function updateClaimInitialsVisibility() {
    if (!elements.claimInitialsForm) return;
    if (adapter.getMode() !== 'daily') {
      elements.claimInitialsForm.classList.add('hidden');
      return;
    }
    const entry = getPlayerEntry();
    if (entry && !entry.initials) {
      elements.claimInitialsForm.classList.remove('hidden');
    } else {
      elements.claimInitialsForm.classList.add('hidden');
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

  function saveCompletedState() {
    if (!meta?.completedKeyPrefix) return;
    try {
      localStorage.setItem(puzzleKeyPrefix(meta.completedKeyPrefix), 'true');
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
    latestPlayerEntry = null;

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
      saveCompletedState();
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
    const isDaily = adapter.getMode() === 'daily';
    if (isDaily) {
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
      if (adapter.isPaused() && !adapter.isComplete() && !adapter.isSolutionShown?.()) elements.pauseOverlay.classList.remove('hidden');
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

  function markBannerNavigation() {
    try {
      sessionStorage.setItem('dailygrid_return_to_games', '1');
    } catch {
      // ignore
    }
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
    if (adapter.getMode() === 'daily' && !isInReplayMode) {
      saveCompletedState();
      recordGameCompletion(adapter.gameId, adapter.getPuzzleId());
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
    const shareUrl = '';
    const shareText = buildShareText({ gameName });

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
    updateClaimInitialsVisibility();
    const entry = getPlayerEntry();
    await loadLeaderboard({
      container: elements.leaderboardList,
      api: `/api/${adapter.gameId}/leaderboard`,
      puzzleId: adapter.getPuzzleId(),
      formatTimeFn: adapter.formatTime,
      playerEntry: entry,
      preferYouLabel: shouldUseYouLabel(entry)
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
      saveCompletedState();

      if (Number.isFinite(data.rank)) {
        const existingEntry = loadLocalLeaderboardEntry();
        latestPlayerEntry = {
          rank: data.rank,
          timeMs: payload.timeMs,
          initials: existingEntry?.initials ?? null
        };
        saveLocalLeaderboardEntry(latestPlayerEntry);
      }

      if (elements.percentileMsg) {
        const rank = data.rank;
        const total = data.total ?? 0;
        let msg;
        if (rank === 1 && total === 1) {
          msg = 'First to solve today!';
        } else if (rank === 1) {
          msg = 'You\u2019re #1 on today\u2019s leaderboard!';
        } else {
          const topPct = Math.max(1, Math.round(100 - (data.percentile ?? 0)));
          msg = `You finished in the top ${topPct}% of solvers!`;
        }
        elements.percentileMsg.textContent = msg;
        elements.percentileMsg.classList.remove('hidden');
      }

      updateClaimInitialsVisibility();
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
      const existingEntry = loadLocalLeaderboardEntry();
      if (existingEntry) {
        existingEntry.initials = initials;
        latestPlayerEntry = existingEntry;
        saveLocalLeaderboardEntry(existingEntry);
      } else if (latestPlayerEntry) {
        latestPlayerEntry.initials = initials;
        saveLocalLeaderboardEntry(latestPlayerEntry);
      }
      elements.claimInitialsForm?.classList.add('hidden');
      await loadLeaderboardIntoModal();
    } catch (error) {
      showToast(error.message || 'Failed to save initials. Please try again.');
    }
  }

  let countdownInterval = null;

  function injectStreakDisplay(modal, streak) {
    if (!modal) return;
    let el = modal.querySelector('#streak-display');
    if (!el) {
      el = document.createElement('div');
      el.id = 'streak-display';
      el.className = 'flex items-center justify-center gap-1.5 text-sm font-medium mb-4';
      // Insert after the timer-display block
      const timerDisplay = modal.querySelector('.timer-display');
      if (timerDisplay) timerDisplay.after(el);
      else modal.querySelector('[id="percentile-msg"]')?.before(el);
    }
    if (streak.current >= 2) {
      const best = streak.current === streak.best && streak.best > 1 ? ' — new best!' : '';
      el.innerHTML = `
        <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#f97316">
          <path d="M12 2c0 6-6 8-6 14a6 6 0 0012 0c0-6-6-8-6-14z"/>
        </svg>
        <span style="color:#f97316">${streak.current}-day streak${best}</span>
      `;
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  }

  function injectStatsButton(modal, gameId, gameName) {
    if (!modal) return;
    if (modal.querySelector('#stats-modal-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'stats-modal-btn';
    btn.textContent = 'View Stats';
    btn.style.cssText = `
      display: block; width: 100%; margin-top: .5rem; padding: .5rem;
      background: none; border: 1px solid rgba(255,255,255,.08);
      border-radius: .6rem; color: #71717a; font-size: .75rem; font-weight: 600;
      cursor: pointer; transition: all .15s ease;
    `;
    btn.addEventListener('mouseenter', () => { btn.style.borderColor = 'rgba(255,255,255,.16)'; btn.style.color = '#a1a1aa'; });
    btn.addEventListener('mouseleave', () => { btn.style.borderColor = 'rgba(255,255,255,.08)'; btn.style.color = '#71717a'; });
    btn.addEventListener('click', () => showStatsModal(gameId, gameName));
    const buttonsArea = modal.querySelector('.flex.flex-col.gap-3');
    if (buttonsArea) buttonsArea.after(btn);
  }

  function injectCountdownDisplay(modal) {
    if (!modal) return;
    let el = modal.querySelector('#next-puzzle-countdown');
    if (!el) {
      el = document.createElement('p');
      el.id = 'next-puzzle-countdown';
      el.className = 'text-center text-xs text-zinc-500 mb-4';
      // Insert before leaderboard title or before close button area
      const lbTitle = modal.querySelector('#leaderboard-title');
      if (lbTitle) lbTitle.before(el);
      else modal.querySelector('.flex.flex-col.gap-3')?.before(el);
    }

    if (countdownInterval) clearInterval(countdownInterval);

    const update = () => {
      const ms = getMsUntilPTMidnight();
      el.textContent = `Next puzzle in: ${formatCountdown(ms)}`;
    };
    update();
    countdownInterval = setInterval(update, 60_000);
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

      // Streak and stats tracking
      const streakData = recordStreak(adapter.gameId);
      recordStats(adapter.gameId, completionMs ?? adapter.getElapsedMs());
      injectStreakDisplay(elements.completionModal, streakData);
      injectCountdownDisplay(elements.completionModal);
      injectStatsButton(elements.completionModal, adapter.gameId, meta?.name || adapter.gameId);

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

      submitScoreIfNeeded()
        .finally(() => loadLeaderboardIntoModal());
    } else {
      const practiceTitle = adapter.getPracticeModalTitle?.() || 'Nice Job!';
      const practiceSubtitle = adapter.getPracticeModalSubtitle?.() || 'Practice puzzle complete';
      if (elements.modalTitle) elements.modalTitle.textContent = practiceTitle;
      if (elements.modalSubtitle) elements.modalSubtitle.textContent = practiceSubtitle;

      elements.practiceCompleteActions?.classList.remove('hidden');
      elements.practiceCompleteActions?.classList.add('flex');
    }

    elements.completionModal.classList.remove('hidden');

    // Show push opt-in prompt after first daily completion (only once, only if not already asked)
    if (adapter.getMode() === 'daily') {
      schedulePushOptIn(elements.completionModal);
    }
  }

  function hideCompletionModal() {
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    elements.completionModal?.classList.add('hidden');
    const entry = getPlayerEntry();
    if (entry && !entry.initials) {
      markLeaderboardSeen();
    }
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

    elements.nextGameLink?.addEventListener('click', markBannerNavigation);
    elements.nextGamePromo?.addEventListener('click', markBannerNavigation);
    elements.externalGameLink?.addEventListener('click', markBannerNavigation);
    elements.externalGamePromo?.addEventListener('click', markBannerNavigation);

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

    const mobileBackLink = document.querySelector('.mobile-app-bar a');
    if (mobileBackLink) {
      mobileBackLink.addEventListener('click', (event) => {
        event.preventDefault();
        try {
          const bannerFlag = sessionStorage.getItem('dailygrid_return_to_games');
          if (bannerFlag === '1') {
            sessionStorage.removeItem('dailygrid_return_to_games');
            window.location.href = '/games/';
            return;
          }
        } catch {}
        if (window.history.length > 1) {
          window.history.back();
          return;
        }
        let fallback = '/games/';
        try {
          const ref = document.referrer;
          if (ref) {
            const refUrl = new URL(ref);
            if (refUrl.origin === window.location.origin) {
              if (refUrl.pathname.startsWith('/games/practice')) fallback = '/games/practice/';
              else if (refUrl.pathname.startsWith('/games/')) fallback = '/games/';
              else fallback = '/';
            }
          }
        } catch {}
        window.location.href = fallback;
      });
    }

    window.addEventListener('popstate', () => {
      try {
        const bannerFlag = sessionStorage.getItem('dailygrid_return_to_games');
        if (bannerFlag === '1') {
          sessionStorage.removeItem('dailygrid_return_to_games');
          window.location.href = '/games/';
        }
      } catch {
        // ignore
      }
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

  function runDefaultCelebration() {
    const targets = document.querySelectorAll('.celebrate-target');
    if (!targets.length) return 0;
    targets.forEach((el) => {
      el.classList.remove('celebrate-animate');
      void el.offsetWidth;
      el.classList.add('celebrate-animate');
    });
    const durationMs = 2400;
    window.setTimeout(() => {
      targets.forEach((el) => el.classList.remove('celebrate-animate'));
    }, durationMs);
    return durationMs;
  }

  function getCelebrateColor() {
    const shareMeta = adapter.getShareMeta?.() || {};
    const metaColor = shareMeta.accent || shareMeta.accentColor || shareMeta.color;
    if (metaColor) return metaColor;
    try {
      const cssAccent = getComputedStyle(document.documentElement).getPropertyValue('--brand-accent').trim();
      if (cssAccent) return cssAccent;
    } catch {
      // ignore
    }
    return '#D4A650';
  }

  function runConfetti(color) {
    if (!color) return 0;
    document.querySelectorAll('.shell-confetti').forEach((node) => node.remove());
    const container = document.createElement('div');
    container.className = 'shell-confetti';
    const pieceCount = 32;
    let maxDuration = 0;
    for (let i = 0; i < pieceCount; i += 1) {
      const piece = document.createElement('span');
      piece.className = 'shell-confetti-piece';
      const width = 6 + Math.random() * 7;
      const height = width * (0.5 + Math.random() * 0.7);
      const duration = 3600 + Math.random() * 2000;
      const delay = Math.random() * 320;
      const dx = (Math.random() * 240 - 120).toFixed(1);
      const rot = (Math.random() * 360).toFixed(1);
      const opacity = (0.55 + Math.random() * 0.4).toFixed(2);
      const xStart = (Math.random() * 110 - 5).toFixed(2);
      piece.style.setProperty('--x', `${xStart}%`);
      piece.style.setProperty('--w', `${width.toFixed(1)}px`);
      piece.style.setProperty('--h', `${height.toFixed(1)}px`);
      piece.style.setProperty('--o', opacity);
      piece.style.setProperty('--dur', `${duration.toFixed(0)}ms`);
      piece.style.setProperty('--delay', `${delay.toFixed(0)}ms`);
      piece.style.setProperty('--dx', `${dx}px`);
      piece.style.setProperty('--rot', `${rot}deg`);
      piece.style.backgroundColor = color;
      container.appendChild(piece);
      maxDuration = Math.max(maxDuration, duration + delay);
    }
    document.body.appendChild(container);
    window.setTimeout(() => {
      container.remove();
    }, maxDuration + 500);
    return maxDuration;
  }

  function startCompletionSequence() {
    if (modalPending) return;
    modalPending = true;

    const finish = () => {
      modalPending = false;
      if (modalShown) return;
      modalShown = true;
      showCompletionModal();
    };

    runConfetti(getCelebrateColor());

    let result = null;
    try {
      result = adapter.onCelebrate?.();
    } catch {
      result = null;
    }

    if (navigator?.vibrate) {
      try {
        navigator.vibrate([30, 60, 30]);
      } catch {
        // ignore
      }
    }

    if (result && typeof result.then === 'function') {
      result.then(finish).catch(finish);
      return;
    }

    if (typeof result === 'number' && result > 0) {
      window.setTimeout(finish, result);
      return;
    }

    const duration = runDefaultCelebration();
    if (duration > 0) window.setTimeout(finish, duration);
    else finish();
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

    if (leaderboardDeepLink && adapter.getMode() === 'daily' && adapter.isComplete() && !isInReplayMode) {
      leaderboardDeepLink = false;
      modalPending = false;
      modalShown = true;
      showCompletionModal({ force: true });
    }

    if (adapter.isComplete()) {
      if (isInReplayMode) {
        isInReplayMode = false;
        saveReplayMode(false);
        adapter.onReplayStateChange?.(false);
      }
      if (!modalShown && !modalPending && (!adapter.shouldShowCompletionModal || adapter.shouldShowCompletionModal())) {
        startCompletionSequence();
      }
    }
  }

    init();

    // First-time onboarding: show tutorial modal (or fall back to accordion)
    if (adapter.gameId) {
      const onboardKey = `dailygrid_onboarded_${adapter.gameId}`;

      // Find the How to Play details element (used for fallback + help button)
      const allDetails = document.querySelectorAll('details');
      const howToPlay = Array.from(allDetails).find(d => {
        const s = d.querySelector('summary');
        return s && /how to play/i.test(s.textContent);
      });

      // Inject a "Show Tutorial" button at the bottom of the How to Play accordion
      // so returning users can re-open the tutorial at any time.
      if (howToPlay && window.DG_TUTORIAL_STEPS?.length) {
        const helpBtn = document.createElement('button');
        helpBtn.className = 'dg-tutorial-help-btn dg-tutorial-help-btn--inline';
        helpBtn.setAttribute('aria-label', 'Show tutorial walkthrough');
        helpBtn.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polygon points="10,8 16,12 10,16"/>
          </svg>
          Show Tutorial`;
        helpBtn.addEventListener('click', () => showTutorialModal(window.DG_TUTORIAL_STEPS));
        howToPlay.insertAdjacentElement('beforeend', helpBtn);
      }

      if (!localStorage.getItem(onboardKey)) {
        localStorage.setItem(onboardKey, '1');
        const steps = window.DG_TUTORIAL_STEPS;
        if (steps?.length) {
          // Delay slightly so the start overlay is visible first
          setTimeout(() => showTutorialModal(steps), 500);
        } else if (howToPlay && !howToPlay.open) {
          // Fallback: open the How to Play accordion for games without tutorial steps
          setTimeout(() => { howToPlay.open = true; }, 400);
        }
      }
    }

    // App-only announcements (once per message id, per browser profile)
    // Delay slightly so first-render overlays/tutorial can settle.
    setTimeout(() => {
      maybeShowAnnouncementModal({
        gameId: adapter.gameId,
        mode: adapter.getMode?.()
      });
    }, 900);

    // ── Push opt-in prompt ────────────────────────────────────────────────────
    /**
     * Show a gentle push notification prompt inside the completion modal.
     * Only shown once (keyed by PUSH_ASKED_KEY in localStorage), and only if
     * the browser supports push and the user has not already subscribed.
     */
    const PUSH_ASKED_KEY = 'dailygrid_push_asked';
    async function schedulePushOptIn(modal) {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      if (localStorage.getItem(PUSH_ASKED_KEY)) return;
      const already = await isPushSubscribed();
      if (already) return;

      // Wait 2 s so the leaderboard has time to load first
      setTimeout(async () => {
        if (!modal || modal.classList.contains('hidden')) return;

        // Inject a subtle prompt row into the modal
        const existing = modal.querySelector('#push-opt-in-prompt');
        if (existing) return;

        const prompt = document.createElement('div');
        prompt.id = 'push-opt-in-prompt';
        prompt.style.cssText = `
          margin: 12px 0 0;
          padding: 12px 14px;
          border-radius: 12px;
          background: rgba(167,139,250,0.08);
          border: 1px solid rgba(167,139,250,0.18);
          display: flex; align-items: center; gap: 10px;
        `;
        prompt.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <p style="flex:1;font-size:12px;color:rgba(255,255,255,0.65);line-height:1.4">
            Get notified when tomorrow's puzzles are live.
          </p>
          <button id="push-opt-in-yes" style="
            background:rgba(167,139,250,0.18);border:1px solid rgba(167,139,250,0.3);
            color:#c4b5fd;border-radius:8px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;
          ">Enable</button>
          <button id="push-opt-in-no" style="
            background:none;border:none;color:rgba(255,255,255,0.3);
            font-size:18px;cursor:pointer;line-height:1;padding:2px 4px;
          " aria-label="Dismiss">×</button>
        `;
        // Append inside the modal's inner card (first child div), or directly to modal
        const inner = modal.querySelector('#completion-modal > div, .glass-strong, .modal-inner');
        (inner || modal).appendChild(prompt);

        prompt.querySelector('#push-opt-in-yes')?.addEventListener('click', async () => {
          const anonId = adapter.getAnonId?.() || localStorage.getItem('dailygrid_anon_id');
          localStorage.setItem(PUSH_ASKED_KEY, '1');
          const btn = prompt.querySelector('#push-opt-in-yes');
          if (btn) btn.textContent = '…';
          // Fetch VAPID key if not already loaded
          if (!window.DG_VAPID_PUBLIC_KEY) {
            try {
              const r = await fetch('/api/push/vapid-public-key');
              const d = await r.json();
              if (d.publicKey) window.DG_VAPID_PUBLIC_KEY = d.publicKey;
            } catch { /* push will gracefully fail if key unavailable */ }
          }
          const result = await requestPushPermission(anonId, window.DG_VAPID_PUBLIC_KEY);
          prompt.remove();
          if (result?.ok) showToast('You will be notified when new puzzles are live!');
        });
        prompt.querySelector('#push-opt-in-no')?.addEventListener('click', () => {
          localStorage.setItem(PUSH_ASKED_KEY, '1');
          prompt.remove();
        });
      }, 2000);
    }

    // Auto-reload when PT date changes so the new puzzle loads for users with
    // the page open across midnight (e.g. overnight, or across timezone boundaries).
    const loadedPTDate = getPTDateYYYYMMDD();
    const msToPTMidnight = getMsUntilPTMidnight();
    // Reload ~2 seconds after PT midnight to let the new puzzle propagate
    setTimeout(() => window.location.reload(), msToPTMidnight + 2000);
    // Also reload when the user returns to the tab on a different PT day
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && getPTDateYYYYMMDD() !== loadedPTDate) {
        window.location.reload();
      }
    });

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
