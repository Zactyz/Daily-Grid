# Shikaku backend wiring

This document captures the new scoreboard plumbing that lets the upcoming Shikaku puzzle plug into the shared Cloudflare Pages + D1 stack. The idea is to mirror the leaderboard pattern used by Snake/Pathways/Lattice/etc. while making sure the deployment notes, helper templates, and cache bindings are all documented up front.

## Schema & persistence

- A dedicated `shikaku_scores` table lives alongside the other leaderboards in `scripts/init-db.sql`. It keeps the same shape:
  - Columns: `puzzle_id` (`YYYY-MM-DD` from `getPTDateYYYYMMDD`), `anon_id` (UUID), `time_ms`, `hints_used`, optional `initials` (up to three uppercase letters), `created_at` plus the uniqueness constraint on `(puzzle_id, anon_id)`.
  - Indexes on `(puzzle_id, time_ms)`, `(puzzle_id, created_at)`, and `(puzzle_id, anon_id)` keep leaderboard/claim queries fast.
  - Run the migration locally or in production via the helpers in `package.json`:
    - Local: `npm run db:init:local`
    - Production: `npm run db:init`
  Repeat this whenever the schema changes so `daily-grid-db` already has `shikaku_scores` and its indexes before the endpoints are live.

## API surface

Every endpoint shares the same CORS envelope and relies on the `DB` D1 binding for persistence.

### `POST /api/shikaku/complete`
- Accepts `{ puzzleId, anonId, timeMs, hintsUsed }`.
- Validates the YYYY-MM-DD puzzle ID, ensures the anon ID is a UUID, and only allows times between 3 seconds and 60 minutes.
- Inserts once per `(puzzleId, anonId)` (first attempt wins) and then reports the stored time’s rank, percentile, and total submissions so the UI can give instant feedback.

### `GET /api/shikaku/leaderboard?puzzleId=...`
- Returns the top 10 finishes (timeMs, initials, hintsUsed) plus the total count for the requested day.
- Mirrors the `snake` leaderboard format so every puzzle can reuse the same leaderboard UI components.

### `POST /api/shikaku/claim-initials`
- Used after a top-10 finish to stash 1–3 uppercase initials.
- Validates the puzzle ID, UUID, and initials, rejects requests without a stored score, and enforces a 10-minute claim window based on the row’s `created_at`.
- Updates the matching row in `shikaku_scores` and returns a `{ success: true }` payload.

## Wrangler bindings & KV cache

- `wrangler.toml` already wires the `[[d1_databases]] binding = "DB"` (the `daily-grid-db` schema) plus the `[[kv_namespaces]] binding = "PUZZLE_CACHE"` cache.
- Every Shikaku endpoint reads/writes via `env.DB`. If the puzzle also needs a server-generated board, reuse the same KV pattern as `functions/api/snake/puzzle.js` (use `PUZZLE_CACHE` with keys derived from `getPTDateYYYYMMDD`, add `Cache-Control`, and fallback to a deterministic generator). This keeps caching, offline dev, and production wiring consistent with the other games.

## Shared helpers & templates

Re-use the existing helper templates so the UI math + share copy stay in sync with the server IDs/ranks:

| File | Purpose |
| --- | --- |
| `games/common/utils.js` | `getPTDateYYYYMMDD`, `getOrCreateAnonId`, `formatTime`, and other helpers keep puzzle IDs/time formatting consistent between client and server. |
| `games/common/share.js` | `buildShareText` and `shareWithFallback` ensure share cards look the same as the other puzzles. |
| `functions/_shared/snake-utils-server.js` | The server-side helper exposes `validateUUID` and `validateEnv`, so every endpoint can assume the same validation rules and DB binding checks.

Reusing these templates makes sure Shikaku’s leaderboard flow doesn’t diverge from the other puzzles.

## Smoke tests & deploy checklist

1. `npm run db:init` (or `wrangler d1 execute daily-grid-db --file=./scripts/init-db.sql`) so `shikaku_scores` exists in production before hitting the new endpoints. Run `npm run db:init:local` when testing locally.
2. Run `npm run dev` (`wrangler pages dev . --d1 DB=daily-grid-db --kv PUZZLE_CACHE`). Exercise the endpoints locally with curl/HTTP clients to make sure the responses match the documentation:
   - `curl -X POST http://localhost:8788/api/shikaku/complete -H 'Content-Type: application/json' -d '{"puzzleId":"2026-02-03","anonId":"<uuid>","timeMs":45000,"hintsUsed":0}'`
   - `curl http://localhost:8788/api/shikaku/leaderboard?puzzleId=2026-02-03`
   - `curl -X POST http://localhost:8788/api/shikaku/claim-initials -H 'Content-Type: application/json' -d '{"puzzleId":"2026-02-03","anonId":"<uuid>","initials":"ZAC"}'`
3. Deploy via `npm run deploy` (`wrangler pages deploy .`). The functions auto-publish because they live under `functions/api/shikaku/`.
4. Hit the same endpoints against the published URL (e.g., https://dailygrid.app/api/shikaku/complete) to confirm the responses still look right.
5. If the puzzle layer needs cached board data, reuse `PUZZLE_CACHE` with keys like `shikaku:puzzle:${getPTDateYYYYMMDD()}` so future puzzles can share the same caching story.

Keeping these steps in mind ensures Shikaku plugs into the shared scoreboard/CLI tooling without duplicating the stack.