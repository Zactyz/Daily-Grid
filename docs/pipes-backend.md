# Pipes backend wiring

Pipes reuses the same Cloudflare Pages + D1 leaderboard pattern that powers Snake, Pathways, Lattice, Bits, Shingoki, etc. This doc captures the new table, API surface, and deployment/validation steps so the next puzzle in the stack can immediately hook into the shared helpers and bindings.

## Schema & persistence

- Scores live in the new `pipes_scores` table added to `scripts/init-db.sql`. It mirrors the other leaderboards:
  - Columns: `puzzle_id` (`YYYY-MM-DD` from `getPTDateYYYYMMDD`), `anon_id` (UUID), `time_ms`, `hints_used`, `initials` (nullable string, ≤3 letters), `created_at`, plus the uniqueness constraint on `(puzzle_id, anon_id)`.
  - Indexes on `(puzzle_id, time_ms)`, `(puzzle_id, created_at)`, and `(puzzle_id, anon_id)` keep leaderboard and claim queries fast.
  - Run the migration locally and in production via the existing helper (`npm run db:init` / `wrangler d1 execute daily-grid-db --file=./scripts/init-db.sql`).

## API surface

All requests share the same CORS-friendly envelope and rely on `env.DB` (the `daily-grid-db` D1 database) being available.

### `POST /api/pipes/complete`
- Accepts `{ puzzleId, anonId, timeMs, hintsUsed }`.
- Validates the `puzzleId` format (`YYYY-MM-DD`), enforces a UUID, and only accepts times between 3s and 60m.
- Inserts once per `(puzzleId, anonId)` and keeps the first submission locked in, then computes rank/percentile based on `time_ms`.
- Returns `{ success: true, rank, percentile, total }`.

### `GET /api/pipes/leaderboard?puzzleId=...`
- Fetches the top 10 finishes plus a total count for the requested day.
- Returns `{ top10: [...], total }` where `top10` entries include `rank`, `timeMs`, `initials`, and `hintsUsed`.

### `POST /api/pipes/claim-initials`
- Called after a top-10 completion to persist up to 3 uppercase initials.
- Validates UUID + initials, rejects claims if no score exists, and enforces the 10-minute claim window from when the score was created.
- Updates just the matching row in `pipes_scores` and returns `{ success: true }`.

## Wrangler bindings

- The shared `wrangler.toml` already exposes `[[d1_databases]] binding = "DB"` pointing at the `daily-grid-db` database. Pipes continues to reference `env.DB` just like the other leaderboards.
- Puzzle generation cache (if Pipes ever needs server-side caching) shares the existing `[[kv_namespaces]] binding = "PUZZLE_CACHE"` namespace.
- No additional bindings are required, but deploys must rerun `npm run db:init`/`wrangler d1 execute` any time the schema (e.g., `pipes_scores`) changes.

## Shared helpers and UI wiring

Front-end code should keep using the helpers from `games/common/utils.js` and `games/common/share.js` so all puzzles align:

| Helper | Purpose |
| --- | --- |
| `getPTDateYYYYMMDD` | Produce the canonical LA-based puzzle ID used in leaderboard submissions. |
| `getOrCreateAnonId` | Keep the anonymous identity consistent between `complete`, `leaderboard`, and `claim-initials` calls. |
| `validateUUID` | Mirror the server-side UUID validation before any score POST. |
| `formatTime` | Normalize timers/shares in the UI to match what the server ranks. |
| `buildShareText` / `shareWithFallback` | Keep share cards consistent across puzzles (optional but recommended). |

Reusing these helpers avoids drifting ID math, styling, or claim/leaderboard workflows when wiring Pipes into the existing UI shell.

## Smoke tests & deploy checklist

1. `npm run db:init` (or `wrangler d1 execute daily-grid-db --file=./scripts/init-db.sql`) so `pipes_scores` exists before the endpoint hits production.
2. Run `wrangler pages dev . --d1 DB=daily-grid-db --kv PUZZLE_CACHE` and hit the new endpoints locally:
   - `curl -X POST http://localhost:8788/api/pipes/complete -H 'Content-Type: application/json' -d '{"puzzleId":"2024-01-01","anonId":"<uuid>","timeMs":42000,"hintsUsed":0}'`
   - `curl http://localhost:8788/api/pipes/leaderboard?puzzleId=2024-01-01`
   - `curl -X POST http://localhost:8788/api/pipes/claim-initials -d '{...}'`
3. Deploy with `wrangler pages deploy .` and repeat the same calls against the published URL (e.g., `https://dailygrid.app`).
4. If Pipes needs a server-cached puzzle or share data, reuse `PUZZLE_CACHE` with keys derived from `getPTDateYYYYMMDD` so the same storage pattern works for every future puzzle.

With these pieces in place, Pipes can slot into the leaderboard series without duplicating the scoreboard machinery or credentials math.