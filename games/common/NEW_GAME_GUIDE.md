# New Game Guide (Shell-First)

This repo uses a shared shell for navigation, controls, modals, overlays, sharing, and leaderboard flows.
New games should be implemented as **game logic + adapter**, not custom shell code.

## 1) Start from the shell contract
- Read `games/common/shell-adapter.md` for required/optional adapter hooks.
- Use `games/common/shell-template.html` to ensure all required IDs exist.
- Include `games/common/shell.css` so shared elements look right.
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
  // IMPORTANT: hasProgress should ignore prefilled/clue cells
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

## 5) Progress + overlays
- The shell shows the “Begin” overlay when `!isStarted && !isComplete && !hasProgress`.
- Make sure `hasProgress` does **not** count clue/prefill cells, or the overlay won’t appear.

## 6) Practice vs daily behavior
- Daily puzzles should be deterministic (seed from date).
- Practice puzzles should be random but follow the same rules/constraints.
- Persist **daily** progress; practice usually does not persist.

## 7) Cross‑game banners (after completion)
- The completion modal already uses the shell’s “next game” promo.
- For the **on‑page** banner after completion, include the optional markup from `shell-template.html`:
  - `external-game-promo`, `external-game-logo`, `external-game-text`
- The shell will show it only for completed daily puzzles.

## 8) Register the game in shared lists
When adding a new game, update these shared locations so it appears everywhere:
- `games/common/games.js`
  - Add to `GAME_META` with `id`, `name`, `path`, `logo`, `submittedKeyPrefix`, `completedKeyPrefix`, `theme`, and `shareUrl`.
  - This powers the completion banners and personalized ordering.
- `games/index.html`
  - Add a card in the Daily Puzzles list.
  - Add the `gameMeta` entry for play/leaderboard routing.
  - Add `completedPrefixes` and `submittedPrefixes` for completion status.
- `games/practice/index.html`
  - Add the practice hub card for the game.

## 9) Leaderboard + storage keys
- Create a D1 table in `scripts/init-db.sql` for the new game (matching existing tables).
- The shell reads completion state from localStorage using your prefixes:
  - Submitted: `${submittedKeyPrefix}${YYYY-MM-DD}` (daily only)
  - Completed: `${completedKeyPrefix}${YYYY-MM-DD}` (daily only)
- Provide `getCompletionPayload()` and `getAnonId()` in the adapter.
- Leaderboard display is capped at Top 5. If the player ranks below Top 5, the UI shows an ellipsis row and their rank.
- The shell stores the player’s local leaderboard entry under `dailygrid_${gameId}_leaderboard_${puzzleId}` to support this.

## 10) Sharing previews (social/iMessage)
- Add OG/Twitter meta tags to the game’s `index.html`.
- Add an OG image under `games/assets/` and reference it in:
  - `og:image`, `twitter:image`, and `og:url` tags.
- Also update `/games/index.html` with `og:image` for the games list page.
- Share button text is standardized to: “I just completed the daily {GameName} puzzle on Daily Grid. Can you beat my time?”
- Share URLs are intentionally omitted from the share payload.

## 11) Mobile + PWA expectations
- Keep desktop layout intact; use mobile styles to feel app-like.
- Ensure the app back arrow is present on mobile (shell handles this).
- Avoid extra scrolling space on mobile (see recent padding fixes).
- Disable unwanted text selection/zoom in interactive areas (`touch-action: manipulation`, `user-select: none`).
- Add `celebrate-target` to the main game board element so the completion pulse animation can run before the modal.

## 12) Consistency rules
- Timer display is owned by the shell.
- Mode badges and buttons are owned by the shell.
- Completion modal copy is standardized in the shell.
- Use the shell template IDs exactly as written.

## 13) When in doubt
Follow the existing games: `games/snake`, `games/pathways`, `games/lattice`.
