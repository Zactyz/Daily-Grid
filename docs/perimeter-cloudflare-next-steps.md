# Perimeter Cloudflare release + testing notes

## Local QA recap
1. **Start the Pages dev server with the shared bindings** so the functions see the same D1 + KV as prod:
   ```bash
   npx wrangler pages dev . --d1 DB=daily-grid-db --kv PUZZLE_CACHE --persist-to=./tmp/miniflare-dev-state --port 8787
   ```
2. **Seed the local D1 schema** before hitting the APIs. The first time you run the previous command, Miniflare will create `tmp/miniflare-dev-state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite`. Run the init script against that file (or rerun `npx wrangler d1 execute ... --local --persist-to=./tmp/miniflare-dev-state --file=./scripts/init-db.sql` **before** the dev server starts) so `perimeter_scores` + indexes exist when the worker boots. If you already started the server and it created a different `<hash>.sqlite`, apply `scripts/init-db.sql` directly against every `.sqlite` file in `tmp/miniflare-dev-state/v3/d1/miniflare-D1DatabaseObject`.
3. **Smoke-test the API surface** against `http://localhost:8787`:
   ```bash
   curl -s -X POST http://localhost:8787/api/perimeter/complete -H 'Content-Type: application/json' -d '{"puzzleId":"YYYY-MM-DD","anonId":"<uuid>","timeMs":90000,"hintsUsed":0}'
   curl -s "http://localhost:8787/api/perimeter/leaderboard?puzzleId=YYYY-MM-DD"
   curl -s -X POST http://localhost:8787/api/perimeter/claim-initials -H 'Content-Type: application/json' -d '{"puzzleId":"YYYY-MM-DD","anonId":"<same uuid>","initials":"ZAC"}'
   ```
   Expect `success: true`, a top-10 entry with the submitted time, and the initials echoed back on the leaderboard.
4. **Validate the share wiring** by invoking the shared helper. For example:
   ```bash
   node --input-type=module - <<'NODE'
   import { buildShareText, formatDateForShare } from './games/common/share.js';
   console.log(buildShareText({
     gameName: 'Perimeter',
     puzzleLabel: formatDateForShare('2026-02-04'),
     gridLabel: '7×7',
     timeText: '1:38',
     shareUrl: 'https://dailygrid.app/games/perimeter/'
   }));
   NODE
   ```
   The text should read:
   ```
   Perimeter by Daily Grid
   Wed, Feb 4, 2026 • 7×7
   Time: 1:38

   https://dailygrid.app/games/perimeter/
   ```
   The UI then calls `shareWithFallback`/`showShareFeedback` so mobile browsers trigger `navigator.share` and desktop users fall back to clipboard.

## Cloudflare deployment/testing checklist
1. **Apply the schema** – run `npm run db:init` so the production D1 (`daily-grid-db`) gains `perimeter_scores` + indexes every time `scripts/init-db.sql` changes.
2. **Deploy Pages + Functions** – run `npm run deploy` (`wrangler pages deploy .`). Confirm `wrangler.toml` still binds `DB` and `PUZZLE_CACHE` and that no new compatibility-date warnings appear.
3. **Post-deploy API smoke tests** – against the deployed URL (staging or `https://dailygrid.app`), repeat the `complete` → `leaderboard` → `claim-initials` sequence with a fresh UUID. The responses should mirror the local flow (rank/percentile, top-10 list, initials persisted).
4. **UI sanity check** – load `/games/perimeter/`, solve a grid, and make sure the timer/completion modal appears, the leaderboard modal fills with the latest scores, the claim initials form shows/hides when rank ≤ 10, and the share button builds the text above and triggers `shareWithFallback` with a success or clipboard fallback UI state.
5. **Monitor persistence** – confirm the leaderboard always reads from `perimeter_scores`, the 10‑minute initials window behaves the same as in Snake/Snake/Pathways, and the share URL stays `https://dailygrid.app/games/perimeter/` (or the staging equivalent).
6. **Watch for `wrangler` warnings** – the local server currently logs a compatibility-date warning because the installed Wrangler (3.x) is older than the requested runtime (2026-01-01). If the warning surfaces after deployment, consider updating to `wrangler@4.62.0` so you can target the desired compatibility date.

Document any uncovered edge cases or failures in this file so a follow-up QA run knows where to start. If there are repeated leaderboard/claim failures after deployment, capture the exact payload + response and check the D1 schema (especially the `created_at` default + indexes) before rerunning.