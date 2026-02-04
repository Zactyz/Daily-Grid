# Bits backend + D1 wiring

This document collects the essentials for connecting the new **Bits** puzzle to the existing Cloudflare Pages + D1 stack. The goal was to reuse the leaderboard/score submission pattern already implemented for Snake, Pathways, and Lattice while keeping the deployment flow familiar.

## 1. Database (D1, `DB` binding)

1. **Schema addition:** `scripts/init-db.sql` now creates a `bits_scores` table with the same shape as the other leaderboards (`puzzle_id`, `anon_id`, `time_ms`, `hints_used`, `initials`, `created_at`, plus a uniqueness constraint per player per puzzle).
2. **Indexes:** The script also creates indexes on `(puzzle_id, time_ms)`, `(puzzle_id, created_at)`, and `(puzzle_id, anon_id)` for fast ranking, history checks, and `initials` claims.
3. **Apply schema changes:**
   - Local D1: `npm run db:init:local` (`wrangler d1 execute daily-grid-db --local --file=./scripts/init-db.sql`).
   - Production D1: `npm run db:init` (`wrangler d1 execute daily-grid-db --file=./scripts/init-db.sql`).
   - Re-run after every schema change so the Cloudflare database matches the code.

The same `DB` binding defined in `wrangler.toml` is shared by all game endpoints, so no extra binding names are required.

## 2. Bits Functions

The Bits backend exposes three Pages Functions under `functions/api/bits/`:

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/bits/complete` | `POST` | Submit the first completion time for a (puzzleId, anonId) pair and respond with rank/percentile/total. Body: `{ puzzleId, anonId, timeMs, hintsUsed? }`. Time is clamped to 3s–1h, and duplicate submissions reuse the stored value.
| `/api/bits/leaderboard` | `GET` | Return the top 10 finishes + total count for `puzzleId`.
| `/api/bits/claim-initials` | `POST` | Claim 1-3 uppercase initials within 10 minutes of a stored score.

Each handler:

- Applies the standard `corsHeaders` block (matching the existing endpoints).  
- Validates the request, checks `env.DB`, and uses prepared statements to interact with `bits_scores`.  
- Logs errors and returns a JSON error payload with a 500 when something blows up.

## 3. Shared utilities

`functions/_shared/snake-utils-server.js` now functions as the normalized helper for every leaderboard consumer (even though the file is named `snake-...`). Bits reuses the same exports:

```js
export function getPTDateYYYYMMDD(now = new Date()) { /* timezone aware date helper */ }
export function validateUUID(uuid) { /* UUIDv4 regex */ }
export function validateEnv(env) {
  if (!env.DB) {
    throw new Error('Database binding (DB) not configured');
  }
}
```

Use `validateUUID` anytime the client is sending `anonId`, and call `validateEnv(env)` at the top of handlers that need `env.DB`. If Bits ever needs to generate puzzles server-side, `getPTDateYYYYMMDD` provides the same LA-centric daily ID that other games use.

## 4. Deployment notes

1. **Local dev:** Use `npm run dev` to start Wrangler Pages with the local D1 + KV bindings (`DB=daily-grid-db`, `KV=PUZZLE_CACHE`).
2. **Schema deployment:** After editing `scripts/init-db.sql`, run `npm run db:init` (or `npm run db:init:local`) to push the table change to the appropriate D1 database.
3. **Publish:** `npm run deploy` (`wrangler pages deploy .`) pushes the Pages site and functions. The Bits functions automatically pick up the new routes because they live under `functions/api/bits/`.
4. **Bindings check:** Confirm `wrangler.toml` still declares the `DB` (D1) and `PUZZLE_CACHE` (KV) bindings — Bits uses the same bindings as the other puzzles.

If you add Bits-specific caching later, reuse the `PUZZLE_CACHE` binding (already scoped in `wrangler.toml`) with `env.PUZZLE_CACHE`. This keeps the deployment pattern uniform across Daily Grid games.
