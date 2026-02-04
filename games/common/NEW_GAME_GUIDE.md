# New Game Guide (Shell-First)

This repo uses a shared shell for navigation, controls, modals, overlays, sharing, and leaderboard flows.
New games should be implemented as **game logic + adapter**, not custom shell code.

## 1) Start from the shell contract
- Read `games/common/shell-adapter.md` for required/optional adapter hooks.
- Use `games/common/shell-template.html` to ensure all required IDs exist.
- Call `mountShell()` early in your page to validate IDs and inject the toast.

```js
import { mountShell } from '../common/shell-mount.js';
mountShell();
```

## 2) Build your adapter
Create a UI/controller that passes an adapter to `createShellController()`.
Keep it thin: only game-specific hooks like puzzle ID, time, pause/reset, and completion data.

```js
import { createShellController } from '../common/shell-controller.js';

const shell = createShellController({
  gameId: 'mygame',
  getMode: () => mode,
  getPuzzleId: () => puzzleId,
  getGridLabel: () => gridLabel,
  getElapsedMs: () => elapsedMs,
  formatTime,
  isComplete: () => isComplete,
  isPaused: () => isPaused,
  isStarted: () => timerStarted,
  hasProgress: () => hasProgress,
  pause, resume, startGame, resetGame,
  startReplay, exitReplay,
  getAnonId,
  getCompletionPayload: () => ({ timeMs, hintsUsed: 0 }),
  getShareFile: () => buildShareCard({ ... })
});
```

## 3) Use shared share cards
Use `games/common/share-card.js` to generate share images so all games look consistent.

```js
import { buildShareCard } from '../common/share-card.js';
```

## 4) Keep the loop single-instance
Avoid re-spawning animation loops on mode switches. Reuse the loop and swap adapters/engine state.

## 5) Consistency rules
- Timer display is owned by the shell.
- Mode badges and buttons are owned by the shell.
- Completion modal copy is standardized in the shell.

## 6) When in doubt
Follow the existing games: `games/snake`, `games/pathways`, `games/lattice`.
