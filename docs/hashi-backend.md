# Hashi backend + deployment wiring

Hashi plugs into the same Cloudflare Pages + D1 leaderboard stack that powers Snake, Pathways, Lattice, Bits, and the rest of the Daily Grid puzzle shell. The goal is to wire the `hashi_scores` table, API endpoints, and shared share/I/O helpers so this new puzzle reuses the existing bindings (DB + `PUZZLE_CACHE`), shared server utilities, and front-end shell APIs.

## Schema & persistence (D1 `DB` binding)

- Add a `hashi_scores` table to `scripts/init-db.sql` alongside the other leaderboard tables:
  - Columns: `puzzle_id` (`YYYY-MM-DD`), `anon_id` (UUID), `time_ms`, `hints_used` (default `0`), optional `initials` (1–3 uppercase letters), `created_at` (defaults to `CURRENT_TIMESTAMP`), and a uniqueness constraint on `(puzzle_id, anon_id)` so only the first completion per day/per player counts.
  - Indexes on `(puzzle_id, time_ms)`, `(puzzle_id, created_at)`, and `(puzzle_id, anon_id)` keep leaderboard, claim, and de-duplication queries cheap.
  - Any schema change must be followed by the helper scripts so the production `daily-grid-db` already has the new table before the endpoints go live:
    - Local dev: `npm run db:init:local`
    - Production/migration: `npm run db:init`

## API surface (under `functions/api/hashi`)

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/hashi/complete` | `POST` | Accept a `puzzleId`, `anonId`, `timeMs`, and optional `hintsUsed`. Only the first score per `(puzzleId, anonId)` is persisted, and the response reports the rank/percentile/total so the shell UI can show immediate leaderboard feedback. |
| `/api/hashi/leaderboard` | `GET` | Return the top-10 finishes for the requested `puzzleId` plus the total count, mirroring the format used by Snake and the rest of the shell. |
| `/api/hashi/claim-initials` | `POST` | Allow a top-10 player to stash 1–3 uppercase initials within a 10-minute claim window. Validates the UUID, puzzle ID, initials, and rejects missing or stale claims. |

Each endpoint:

- Shares the same CORS boilerplate used by the other puzzle functions so `/games/hashi` can hit them from the browser.
- Calls `validateEnv(env)` (and `validateUUID` where appropriate) from `functions/_shared/snake-utils-server.js` so the shared DB binding checks stay centralized.
- Reads/writes the new `hashi_scores` table, keeping the leaderboard math, insertion idempotency, ranking, and claim windows aligned with the existing puzzles.
- Returns a consistent JSON payload with a `success` flag or an `error` message plus proper HTTP status codes.

## Shared shell APIs & share binder reuse

Hashi should live inside the same shell that all the other Daily Grid puzzles share:

- **Server helpers:** `functions/_shared/snake-utils-server.js` exposes `validateEnv` and `validateUUID`, so Hashi’s endpoints can rely on the same validation routines and DB binding checks.
- **Client helpers:** Reuse `games/common/utils.js` (`getPTDateYYYYMMDD`, `getOrCreateAnonId`, `formatTime`, etc.) and `games/common/share.js` (`buildShareText`, `shareWithFallback`) so the Hashi UI/leaderboard flow, share text, and share buttons stay consistent with the rest of the shell.
- **Share binder:** The `PUZZLE_CACHE` KV namespace already acts as the shared binder for caching deterministic boards, share metadata, or any server-generated collateral. Hashi should hit `PUZZLE_CACHE` with keys derived from `getPTDateYYYYMMDD()` (e.g., `hashi:puzzle:${puzzleId}`) if it ever needs server-side caching, just like the other puzzles do.
- **Folder layout:** Place the new handlers under `functions/api/hashi/complete.js`, `leaderboard.js`, and `claim-initials.js` so Wrangler picks them up automatically and the `functions/api/` shell remains consistent.

## Wrangler bindings & deployment checklist

1. **Bindings:** `wrangler.toml` already wires the shared D1 database (`[[d1_databases]] binding = "DB"`) and the `[[kv_namespaces]] binding = "PUZZLE_CACHE"` cache. Hashi reuses both — `env.DB` for `hashi_scores` and `env.PUZZLE_CACHE` for any shared puzzle/cache content (stick to the existing names so future puzzles can rely on the same script).
2. **Local dev:** Run `npm run dev` (`wrangler pages dev . --d1 DB=daily-grid-db --kv PUZZLE_CACHE`), make sure `hashi_scores` exists via `npm run db:init:local`, then exercise the endpoints with curl or HTTP clients:
   - `curl -X POST http://localhost:8788/api/hashi/complete -H 'Content-Type: application/json' -d '{"puzzleId":"2026-02-04","anonId":"<uuid>","timeMs":42000,"hintsUsed":0}'`
   - `curl http://localhost:8788/api/hashi/leaderboard?puzzleId=2026-02-04`
   - `curl -X POST http://localhost:8788/api/hashi/claim-initials -H 'Content-Type: application/json' -d '{"puzzleId":"2026-02-04","anonId":"<uuid>","initials":"ZAC"}'`
3. **Production schema:** Whenever `scripts/init-db.sql` changes, re-run `npm run db:init` (or `wrangler d1 execute daily-grid-db --file=./scripts/init-db.sql`) so the live D1 database has `hashi_scores` and its indexes before the new API is deployed.
4. **Deploy:** `npm run deploy` (`wrangler pages deploy .`) pushes the static site plus the `functions/api/hashi/*` handlers. Wrangler wires the endpoints automatically because they live under the `functions/api` tree.
5. **Post-deploy verification:** Hit `/api/hashi/complete`, `/api/hashi/leaderboard`, and `/api/hashi/claim-initials` using the published URL (e.g., `https://dailygrid.app/api/hashi/complete`) to confirm the request flow mirrors the local behavior. If Hashi caches share data through `PUZZLE_CACHE`, ensure the same keys/responses work in production so the shared binder remains consistent.

Document any follow-up quirks here (claim-window drift, share text tuning, or schema tweaks) so future maintainers can lean on this shared shell pattern.