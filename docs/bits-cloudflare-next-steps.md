# Bits Cloudflare release + testing notes

## Local QA recap
1. Start the Pages dev server with the same bindings the release will use and a persistent state directory so the D1 schema survives restarts:
   ```bash
   npx wrangler pages dev . --d1 DB=daily-grid-db --kv PUZZLE_CACHE --persist-to=./miniflare-dev-state
   ```
2. Seed the local D1 schema *into the exact database file the dev server is reading* before exercising leaderboard APIs. Run this while the dev server is running or immediately after it starts so the generated `*.sqlite` file matches the server config:
   ```bash
   npx wrangler d1 execute daily-grid-db --local --persist-to=./miniflare-dev-state --file=./scripts/init-db.sql
   ```
   If Miniflare creates multiple hashed `*.sqlite` files (one per run), rerun the script against each file (a Python helper that loops over `miniflare-dev-state/v3/d1/miniflare-D1DatabaseObject/*.sqlite` is sufficient).
3. With the schema seeded, smoke-test leaderboard endpoints: 
   ```bash
   curl -s -X POST http://localhost:8788/api/bits/complete -H 'Content-Type: application/json' -d '{"puzzleId":"YYYY-MM-DD","anonId":"<uuid>","timeMs":60000,"hintsUsed":0}'
   curl -s "http://localhost:8788/api/bits/leaderboard?puzzleId=YYYY-MM-DD"
   curl -s -X POST http://localhost:8788/api/bits/claim-initials -H 'Content-Type: application/json' -d '{"puzzleId":"YYYY-MM-DD","anonId":"<same uuid>","initials":"ABC"}'
   ```
   The responses should show `success: true`, a leaderboard entry with the submitted time, and the initials persisted.
4. Verify the UI wiring by inspecting `games/bits/bits-ui.js`: timers (`startTimer`, `pauseTimer`, `resumeTimer`, `getElapsedMs`, `formatTime`) track elapsed time, the completion modal swaps in the leaderboard data from `loadLeaderboard`, and shared helpers (`getPTDateYYYYMMDD`, `formatTime`, `buildShareText`, `shareWithFallback`) are used consistently.

## Cloudflare deployment/testing checklist
1. **Apply the schema** – run `npm run db:init` so the production D1 (`daily-grid-db`) gains the `bits_scores` table + indexes every time the schema changes. This guarantees the APIs (`/api/bits/complete`, `/api/bits/leaderboard`, `/api/bits/claim-initials`) can read and write.
2. **Deploy Pages + Functions** – `npm run deploy` (i.e., `wrangler pages deploy .`) publishes the site and the new Bits functions. Confirm `wrangler.toml` still binds `DB` (the D1 database) and `PUZZLE_CACHE` (the shared KV namespace).
3. **Post-deploy API smoke tests** – hit the same endpoints used during local QA but against the deployed URL (`https://dailygrid.app` or the staging site). Use a fresh UUID per test, submit a completion, fetch the leaderboard, then claim initials. The responses should mirror the local behavior.
4. **UI sanity check** – open `/games/bits/` in the deployed environment, fill a few cells (or leverage the deterministic solution), and watch for the timer, completion modal, leaderboard modal, share button, and reset/pause flows to behave as expected. The UI pulls the same shared helpers as the server, so any mismatch will show up in these flows.
5. **Monitor persistence** – ensure the leaderboard modal always returns the cached entries from `bits_scores` and that the `claim-initials` call updates `initials` within ten minutes. If you add more puzzles or caching, reuse `PUZZLE_CACHE` and keep the date key in sync with `getPTDateYYYYMMDD` for consistent IDs.

Document any uncovered edge cases or failures in this file so the next QA run knows where to start.