# Shell Adapter Contract

This document describes the adapter interface expected by `games/common/shell-controller.js`.

## Required
- `gameId` (string)
- `getMode()` -> `'daily' | 'practice'`
- `getPuzzleId()` -> string
- `getGridLabel()` -> string
- `getElapsedMs()` -> number
- `formatTime(ms)` -> string
- `isComplete()` -> boolean
- `isPaused()` -> boolean
- `isStarted()` -> boolean
- `hasProgress()` -> boolean
- `pause()`
- `resume()`
- `startGame()`
- `resetGame()`
- `startReplay()`
- `exitReplay()`
- `getAnonId()` -> string
- `getCompletionPayload()` -> { timeMs, hintsUsed? }

## Optional
- `autoStartOnProgress` (boolean)
- `disableShellTimer` (boolean)
- `getCompletionMs()` / `setCompletionMs(ms)`
- `getTimerDisplayMs()` -> number
- `getShareFile()` -> File
- `getShareMeta()` -> { gameName?, shareUrl?, gridLabel?, puzzleLabel? }
- `getDailyModalTitle()` / `getDailyModalSubtitle()`
- `getPracticeModalTitle()` / `getPracticeModalSubtitle()`
- `onResetUI()`
- `onTryAgain()`
- `onNextLevel()`
- `onBackToDaily()`
- `onPracticeInfinite()`
- `onStartPractice()`
- `onStartDaily()`
- `onReplayStateChange(enabled)`
- `allowLeaderboardWhenIncomplete` (boolean)
- `shouldShowCompletionModal()` -> boolean
- `isSolutionShown()` -> boolean
- `disableReplay` (boolean)
- `pauseOnHide` (boolean)
- `saveProgress()`
