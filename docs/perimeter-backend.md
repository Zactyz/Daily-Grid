# Perimeter backend + deployment wiring

This doc lays out how the upcoming *Perimeter* daily puzzle will connect to the existing Cloudflare Pages + D1 stack. The idea is to mimic the scoreboard/leaderboard pattern already powering Snake/Pathways/Lattice while keeping deployment/config steps familiar.

## 1. Database schema (D1 `DB` binding)

- `scripts/init-db.sql` now creates a `perimeter_scores` table that matches the shape of the other leaderboards:
  - `(puzzle_id, anon_id)` primary key constraint prevents duplicate submissions for the same puzzle per player.
  - `time_ms`, `hints_used`, and `initials` (max 3 uppercase letters) are persisted for ranking + initials claims.
  - `created_at` defaults to `CURRENT_TIMESTAMP` so the claim window can be enforced.
- Indexes on `(puzzle_id, time_ms)`, `(puzzle_id, created_at)`, and `(puzzle_id, anon_id)` keep leaderboard and claim queries fast.
- **After modifying this script** run the migrate helpers:
  - Local: `npm run db:init:local`
  - Production: `npm run db:init`
  Repeat after every schema change so the Cloudflare D1 (daily-grid-db) matches the code.

## 2. Pages Functions / endpoints

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/perimeter/complete` | `POST` | Submit a completion time (first submission per `anonId` wins) and return the rank/percentile/total for today.
| `/api/perimeter/leaderboard` | `GET` | Return the top-10 finishes for the requested `puzzleId` plus a total count (UI shows Top 3 + ellipsis + player).
| `/api/perimeter/claim-initials` | `POST` | Claim 1–3 uppercase initials within 10 minutes of a stored score.

Each handler:

- Applies the same CORS boilerplate used by the other puzzle APIs (so browsers can hit them from `/games/perimeter`).
- Calls `validateEnv(env)` from `_shared/snake-utils-server.js` to ensure the `DB` binding exists and `validateUUID` for all `anonId` inputs.
- Uses prepared statements against `perimeter_scores` for idempotent insertions, ranking, leaderboard queries, and initial updates.
- Returns `JSON` with an explicit `success` flag or an `error` payload and the appropriate HTTP status.

## 3. Frontend helpers / shared snippets

- The Perimeter UI should reuse the shared helpers in `games/common/*` (just like the other puzzles):
  - `games/common/utils.js` exposes `getPTDateYYYYMMDD`, `getOrCreateAnonId`, and `formatTime` so the leaderboard and share payloads stay consistent with the server-generated puzzle IDs.
  - `games/common/share.js` is the shared snippet for building share text (`buildShareText`) and falling back to the clipboard (`shareWithFallback`). Use it when showing results or sharing stats so all games talk the same language.
- Score submissions/leaderboard UI should mirror the patterns used in `games/snake/snake-ui.js`—lock the first completion time, mark the puzzle as submitted in `localStorage`, and allow initials claims within the 10‑minute window (even if the player ranks outside the Top 3 display).

## 4. Deployment / Wrangler checklist

1. ✅ **Bindings:** `wrangler.toml` already lists the shared `DB` D1 binding (`daily-grid-db`) and the `PUZZLE_CACHE` KV namespace. Perimeter’s functions reuse those bindings (`env.DB` for leaderboard rows, `env.PUZZLE_CACHE` for any cached puzzles if needed).
2. 🧪 **Local dev:** `npm run dev` spins up Pages + D1 + KV locally. Seed the same schema into the running local database with `npm run db:init:local` before exercising the APIs.
3. 📦 **Production schema:** Run `npm run db:init` any time `scripts/init-db.sql` changes so the live D1 gains `perimeter_scores` and its indexes.
4. 🚀 **Deploy:** `npm run deploy` (i.e. `wrangler pages deploy .`) publishes the static site plus the new functions under `functions/api/perimeter/`. The endpoints auto-attach because they live in the right folder.
5. 🧪 **Post-deploy verification:** Curl or hit `/api/perimeter/complete` → `/api/perimeter/leaderboard` → `/api/perimeter/claim-initials` with a fresh UUID to ensure the responses mirror the local flow.

Document any follow-up issues in this file so the next sprint knows what to monitor (e.g., claim-window drift, share text tweaks, etc.).
