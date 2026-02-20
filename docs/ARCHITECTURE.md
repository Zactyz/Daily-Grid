# Daily Grid — Architecture Overview

## Stack

| Layer | Technology |
|-------|-----------|
| Hosting | Cloudflare Pages (static) |
| API | Cloudflare Workers (via Pages Functions) |
| Database | Cloudflare D1 (SQLite) |
| Frontend | Vanilla HTML/CSS/JS (ES modules) |
| CSS utilities | Tailwind CDN (in-browser JIT) |
| Fonts | Google Fonts (Space Grotesk, JetBrains Mono) |

---

## Directory Structure

```
/
├── index.html              # Main landing page
├── 404.html                # Custom 404
├── sitemap.xml             # SEO sitemap
├── robots.txt              # Crawler rules
├── wrangler.toml           # Cloudflare deployment config
├── games/
│   ├── index.html          # Games hub
│   ├── practice/
│   │   └── index.html      # Practice hub (links all 9 games with ?practice=1)
│   ├── common/             # Shared shell layer
│   │   ├── shell-controller.js   # Core shell state machine
│   │   ├── shell-ui.js           # Leaderboard and UI helpers
│   │   ├── shell-mount.js        # DOM validation + toast injection
│   │   ├── shell.css             # Shell-specific styles
│   │   ├── games-base.css        # Shared CSS for all game pages
│   │   ├── utils.js              # Shared utilities
│   │   ├── streak.js             # Client-side streak tracking
│   │   ├── stats.js              # Client-side stats and stats modal
│   │   ├── share.js              # Web Share API + clipboard fallback
│   │   ├── share-card.js         # Canvas-based share image generation
│   │   ├── games.js              # Game metadata registry
│   │   └── adapter-factory.js    # Shell adapter factory with defaults
│   ├── snake/
│   ├── pathways/
│   ├── lattice/
│   ├── bits/
│   ├── hashi/             # Game folder name; game display name: Bridgeworks
│   ├── conduit/
│   ├── perimeter/
│   ├── shikaku/           # Game folder name; game display name: Parcel
│   └── polyfit/
├── functions/
│   └── api/
│       ├── _shared/        # Shared Cloudflare Worker helpers
│       │   ├── api-helpers.js        # CORS, error/success responses
│       │   ├── validation-helpers.js # Input validation
│       │   ├── complete-helpers.js   # Score submission logic
│       │   ├── leaderboard-helpers.js
│       │   └── claim-helpers.js
│       └── {game}/         # Per-game API endpoints
│           ├── complete.js
│           ├── leaderboard.js
│           └── claim-initials.js
└── docs/                   # Developer documentation
```

---

## Shell Pattern

Every game page follows the same structure:

1. **HTML contract** — the page must include specific `id` attributes for the shell to hook into (see REQUIRED_IDS in `shell-mount.js`).
2. **`mountShell()`** — called from a `<script type="module">` tag; validates DOM and injects the toast element.
3. **Game adapter** — the game's UI script creates a shell adapter object and calls `createShellController(adapter)` or `createGameAdapter(overrides)` from `adapter-factory.js`.
4. **Shell controller** — manages all cross-cutting concerns: pause/resume, reset confirmation, completion modal, leaderboard, streak tracking, share, how-to-play onboarding, and practice mode UI.

### Game Adapter Interface

```js
{
  // Required
  gameId: 'bits',                     // Matches API route and games.js entry
  getMode: () => 'daily' | 'practice',
  getPuzzleId: () => string,          // e.g. '2025-03-15' or 'practice-abc123'
  getElapsedMs: () => number,
  isComplete: () => boolean,
  isPaused: () => boolean,
  isStarted: () => boolean,
  pause: () => void,
  resume: () => void,
  startGame: () => void,
  resetGame: (opts?) => void,
  getCompletionPayload: () => { timeMs: number, hintsUsed?: number },

  // Optional (defaults provided by createGameAdapter)
  getGridLabel: () => string,
  hasProgress: () => boolean,
  autoStartOnProgress: boolean,
  formatTime: (ms) => string,
  getAnonId: () => string,
  getCompletionMs: () => number | null,
  setCompletionMs: (ms) => void,
  onTryAgain: () => void,
  onNextLevel: () => void,
  onBackToDaily: () => void,
  onStartPractice: () => void,
  onStartDaily: () => void,
  onPracticeInfinite: () => void,
  startReplay: () => void,
  exitReplay: () => void,
  onResetUI: () => void,
  isTimerRunning: () => boolean,
  shouldShowCompletionModal: () => boolean,
  isSolutionShown: () => boolean,
  getShareMeta: () => { gameName, shareUrl, gridLabel?, accent? },
  getShareFile: () => Promise<File | null>,
  disableReplay: boolean,
  pauseOnHide: boolean,
}
```

### Adding a New Game

1. Create `games/{gameId}/index.html` following the HTML contract.
2. Import `mountShell` and call it; import and call `createShellController` or `createGameAdapter`.
3. Expose `window.startPracticeMode` and `window.startDailyMode`.
4. Add the `?practice=1` URL bootstrap (inline or via `initPracticeFromUrl()` from `utils.js`).
5. Add API handlers in `functions/api/{gameId}/`.
6. Register the game in `games/common/games.js`.
7. Add the game card to `games/index.html` and `games/practice/index.html`.

---

## Practice Mode Deep Linking

Every game supports `?practice=1` in the URL to immediately enter practice mode:

```html
<script type="module">
  import { initPracticeFromUrl } from '../common/utils.js';
  initPracticeFromUrl();
</script>
```

Games must expose `window.startPracticeMode` before `initPracticeFromUrl()` fires (it defers to the next tick via `setTimeout(0)`).

---

## API Layout

Each game exposes three Cloudflare Workers endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/{game}/complete` | POST | Submit completion time; returns rank and percentile |
| `/api/{game}/leaderboard` | GET | Fetch today's top scores (by puzzleId query param) |
| `/api/{game}/claim-initials` | POST | Claim a display name on the leaderboard |

### Shared Helpers (`functions/_shared/`)

| File | Purpose |
|------|---------|
| `api-helpers.js` | CORS headers, OPTIONS handler, error/success response builders |
| `validation-helpers.js` | `validatePuzzleId`, `validateTimeMs`, `validateInitials`, `validateUUID` |
| `complete-helpers.js` | `insertScore`, `calculateRank`, `calculatePercentile` |
| `leaderboard-helpers.js` | `getLeaderboard` — fetches and formats top entries |
| `claim-helpers.js` | `claimInitials` — updates an existing score row with initials |

---

## CSS Architecture

### Layers

1. **Tailwind CDN** — utility classes (responsive, flex, spacing, colors).
2. **`games/common/shell.css`** — shell overlay animations (confetti, celebrate, toast).
3. **`games/common/games-base.css`** — shared design tokens, glass surfaces, buttons, typography, mobile app bar, accordion, scrollbar utilities, focus states, reduced-motion overrides.
4. **Game `<style>` block** — only `:root` variable overrides, game-specific accent shadows/borders, and unique game element styles.

### CSS Variables (per game)

| Variable | Purpose | Default |
|----------|---------|---------|
| `--brand-bg` | Page background color | `#0a0a0f` |
| `--brand-accent` | Primary accent (buttons, highlights) | `#888888` |
| `--brand-accent-dim` | Darker accent for gradients | `#666666` |
| `--glass-bg` | Glass surface background | `rgba(255,255,255,0.02)` |
| `--glass-border` | Glass surface border | `rgba(255,255,255,0.06)` |

---

## Client-Side State

State is stored in `localStorage` under well-defined keys:

| Key pattern | Purpose |
|-------------|---------|
| `dailygrid_anon_id` | Anonymous UUID for leaderboard participation |
| `dailygrid_{game}_completed_{date}` | Daily puzzle completion flag |
| `dailygrid_{game}_submitted_{date}` | Score submission flag |
| `dailygrid_{game}_leaderboard_{puzzleId}` | Cached player leaderboard entry |
| `dailygrid_{game}_leaderboard_seen_{puzzleId}` | Leaderboard seen flag |
| `dailygrid_{game}_streak` | `{ current, best, lastCompletedDate }` |
| `dailygrid_{game}_stats` | `{ totalCompleted, totalTimeMs }` |

---

## Deployment

```bash
# Install Wrangler
npm install -g wrangler

# Deploy to Cloudflare Pages
wrangler pages deploy

# Initialize D1 database (run once per game)
wrangler d1 execute daily-grid-db --file=./scripts/schema.sql
```

The `wrangler.toml` binds the D1 database as `DB` in all Workers functions.

---

## Game-Specific Notes

| Game | Folder | Puzzle Source |
|------|--------|--------------|
| Snake | `games/snake/` | Client-side seeded generation |
| Pathways | `games/pathways/` | Client-side seeded generation |
| Logice | `games/lattice/` | Fetches `./data/categories.csv` |
| Bits | `games/bits/` | Client-side seeded generation |
| Bridgeworks | `games/hashi/` | Client-side seeded generation |
| Conduit | `games/conduit/` | Client-side generation |
| Perimeter | `games/perimeter/` | Client-side seeded generation |
| Parcel | `games/shikaku/` | Client-side seeded generation |
| Polyfit | `games/polyfit/` | Client-side solution-first generation |
