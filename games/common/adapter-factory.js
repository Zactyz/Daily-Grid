import { createShellController } from './shell-controller.js';
import { formatTime, getOrCreateAnonId } from './utils.js';

/**
 * Creates a shell controller with sensible defaults for optional adapter properties.
 * Games only need to supply the required fields and any overrides.
 *
 * Required fields:
 *   gameId, getMode, getPuzzleId, getElapsedMs, isComplete, isPaused, isStarted,
 *   pause, resume, startGame, resetGame, getCompletionPayload
 *
 * Common optional fields (all have defaults):
 *   getGridLabel, onTryAgain, onNextLevel, onBackToDaily, onStartPractice, onStartDaily,
 *   onPracticeInfinite, startReplay, exitReplay, onResetUI, getShareMeta, getShareFile,
 *   getCompletionMs, setCompletionMs, hasProgress, isTimerRunning, shouldShowCompletionModal,
 *   isSolutionShown, autoStartOnProgress, disableReplay, pauseOnHide
 */
export function createGameAdapter(overrides, elementOverrides = null) {
  const {
    gameId,
    getMode,
    getPuzzleId,
    getElapsedMs,
    isComplete,
    isPaused,
    isStarted,
    pause,
    resume,
    startGame,
    resetGame,
    getCompletionPayload,
    // Optional with defaults below
    ...rest
  } = overrides;

  const onStartPractice = overrides.onStartPractice ?? (() => {});
  const onStartDaily = overrides.onStartDaily ?? (() => {});

  let _completionMs = null;

  const adapter = {
    gameId,
    getMode,
    getPuzzleId,
    getElapsedMs,
    formatTime,
    isComplete,
    isPaused,
    isStarted,
    pause,
    resume,
    startGame,
    resetGame,
    getCompletionPayload,

    getGridLabel: () => '',
    hasProgress: () => false,
    autoStartOnProgress: false,
    disableReplay: true,
    pauseOnHide: true,

    startReplay: () => {},
    exitReplay: () => {},
    onResetUI: () => {},

    onTryAgain: () => resetGame({ resetTimer: true }),
    onNextLevel: onStartPractice,
    onBackToDaily: onStartDaily,
    onPracticeInfinite: onStartPractice,
    onStartPractice,
    onStartDaily,

    getAnonId: () => getOrCreateAnonId(),

    getCompletionMs: () => _completionMs,
    setCompletionMs: (ms) => { _completionMs = ms; },

    isTimerRunning: () => isStarted() && !isPaused() && !isComplete(),
    shouldShowCompletionModal: () => true,
    isSolutionShown: () => false,

    getShareMeta: () => ({ gameName: gameId, shareUrl: `https://dailygrid.app/games/${gameId}/` }),
    getShareFile: async () => null,

    // Spread overrides last so games can still override any of the above defaults
    ...rest,

    // Re-apply these because ...rest may have partial versions from overrides
    onStartPractice: overrides.onStartPractice ?? onStartPractice,
    onStartDaily: overrides.onStartDaily ?? onStartDaily,
    onNextLevel: overrides.onNextLevel ?? onStartPractice,
    onBackToDaily: overrides.onBackToDaily ?? onStartDaily,
    onPracticeInfinite: overrides.onPracticeInfinite ?? onStartPractice,
    onTryAgain: overrides.onTryAgain ?? (() => resetGame({ resetTimer: true })),
  };

  // If the game provides setCompletionMs, wire up getCompletionMs to use the game's own storage
  // (games that pass both getCompletionMs and setCompletionMs will use theirs via ...rest above)

  return createShellController(adapter, elementOverrides);
}
