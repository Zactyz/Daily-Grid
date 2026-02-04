# Bits puzzle (Binary) generator & data model

> Target: deterministic 6×6 binary puzzle with the usual Binairo constraints: every row/column contains three `0`s and three `1`s, no three identical bits in a row, and all six rows must be distinct. We want to reuse the Daily Grid infrastructure (daily puzzle IDs, ``_shared/snake-utils-server.js`` helpers, ``PUZZLE_CACHE`` KV, score submission pattern) while making the generator easy to debug and cache.

## 1. Puzzle descriptor (server-side model)

| field | shape | purpose |
| --- | --- | --- |
| ``puzzleId`` | `string` (``YYYY-MM-DD`` from ``getPTDateYYYYMMDD``) | Primary key shared across Paths/Snake/etc; the canonical daily token for leaderboard submissions. |
| ``seed`` | `number` | ``hashString(``"bits:" + puzzleId``)``. Drives every randomness step (row ordering, clue sampling, hint rarities). |
| ``width`` / ``height`` | `number` (6) | Fixed for Bits; baked in for clarity if we ever extend to 8×8 in the future. |
| ``solution`` | `Array<string>` (length 6) | Six strings of 6 characters each (e.g., ``"101010"``) describing the full solution grid. Having row strings instead of a flat array keeps column verification easy. |
| ``clues`` | `Array<{ r: number; c: number; bit: 0 | 1 }>` | Subset of cells exposed to the player; chosen so that the remaining puzzle remains uniquely solvable. |
| ``rowSignatures`` | `Array<number>` | Precomputed bitmask for each row (e.g., ``0b101011``) used during generation/validation to ensure row uniqueness. |
| ``columnTotals`` | `Array<number>` | Recomputed column counts after placement (always [3,3,3,3,3,3] for a valid solution; stored purely for auditing). |
| ``metadata`` | `object` | e.g., ``{ builtFromSeed: talk-through steps, difficultyRank: 1-3 }`` for diagnostics/QA.

These descriptors are small, cache-friendly JSONs that can be stored in ``PUZZLE_CACHE`` (shared with Snake/Pathways) and returned directly from ``/api/bits/puzzle``. The server-side generation never exposes ``clues`` that would allow someone to reverse-engineer the puzzle outside the UI (the full solution is kept inside the cached object and only used during clue selection/validation).

## 2. Runtime grid state (client-local model)

The UI keeps a compact replica of the puzzle state so it can persist progress, show errors, and rehydrate after reloads. Fields follow ``common/utils`` conventions (``createSeededRandom``, ``getOrCreateAnonId``) to stay familiar.

```
interface BitsCell {
  r: number;
  c: number;
  value: 0 | 1 | null;      // null = user hasn't placed a bit yet
  isClue: boolean;          // true for server-provided entries
  isLocked: boolean;        // temporary lock when the user verifies a row/column
  status: 'ok' | 'typo' | 'unknown';
}

interface BitsGridState {
  puzzleId: string;          // matches the server descriptor
  cells: BitsCell[];         // 36 entries, row-major order
  hintsUsed: number;
  elapsed: number;           // ms of play time (clocks can pause)
  solvedAt?: number;         // timestamp
}
```

This state is persisted with the ``STORAGE_KEYS`` pattern used by Pathways (add ``BITS_PROGRESS`` to ``pathways-utils`` so the storage lookups feel identical). On load we compare ``storageState.puzzleId`` to ``getPTDateYYYYMMDD()``; if it matches we reuse the cached grid, otherwise we discard it and start from the new descriptor.

## 3. Deterministic generator plan

1. **Build row lookup table**: precompute every 6-bit string with exactly three ``1``s, no run of three identical bits, and store both the string and its bitmask. There are ~20 such rows; we keep them cached statically (``validRows`` array).
2. **Seed derivation**: ``seed = hashString(``"bits:" + puzzleId``)`` (using ``common/utils.js``). ``createSeededRandom(seed)`` generates reproducible pseudo-random values for every puzzle. We also expose helper functions like ``pickRow(random, pool)`` so validators can rerun a puzzle server-side for QA.
3. **Select rows**: shuffle ``validRows`` and try to assemble an ordered list of six different rows such that each column sum is 3. This is a classic exact cover/backtracking problem; because the grid is small we can simply check combinations by building a recursive helper that tracks column totals and row usage, backtracking when a column would exceed 3 ones. The same helper ensures every row is unique by keeping a ``Set`` of visited bitmasks.
4. **Check column runs**: once the six rows are fixed we verify columns do not have three identical bits in a row (if they do, shuffle and retry). The column check is deterministic.
5. **Clue selection**: With the solution locked in, we sample a subset of cells that ensures a unique solution. A simple first pass removes bits greedily: start with the full grid, attempt to blank a random cell (``value = null``) and run a quick constraint propagation (``row totals == 3``, ``no triple``). Because the grid is only 6×6 we can brute-force check uniqueness by trying both 0/1 for the removed cell and seeing if the constraints force a value. Remove whichever cells pass these uniqueness heuristics until we hit the target clue count (configurable between 14–18). Each removal decision is seeded via the PRNG so the clue pattern is deterministic for a given ``seed``.
6. **Capture final descriptor**: store the clue list and the solution rows in the descriptor for caching. The UI can derive ``gridState`` from the clue list.

If generation fails after a bounded number of attempts (e.g., 200 tries to pick rows/new removal order), we increment a secondary seed (``seed + attemptIndex``) and try again, which keeps the process deterministic per puzzle but ensures recovery from pathological seeds.

## 4. Binairo+ adjacency hints

To mirror the Binairo+ variant we expose a small set of adjacency clues in the descriptor via the ``adjacencies`` array. Each hint is ```{ r, c, dir, type }``` pointing at the cell at (r,c), the edge (``right`` or ``down``), and whether the neighbor should match (``equal``) or differ (``different``). The UI draws ``=`` and ``×`` symbols between those cells so the player can prune options without relying on dozens of prefills.

Generation samples about 8–12 adjacency edges from the completed solution, preferring edges that sit near ambiguous rows or columns. We still derive the selection from ``createSeededRandom(seed)``, so the hints stay deterministic and can be cached alongside the rest of the descriptor. Because the adjacency list lives in the descriptor, the UI, any cache rehydration path, and regression tests always replay the same clues for a given puzzle.

## 5. Seed ⇒ puzzleId mapping

| value | formula | reason |
| --- | --- | --- |
| ``puzzleId`` | ``getPTDateYYYYMMDD(now)`` | LA-centric date, matches other Daily Grid games so leaderboard submissions share the same day. |
| ``seed`` | ``hashString(``"bits:" + puzzleId``)`` | Namespacing with ``"bits:"`` means we can reuse the same date across games without generating the same seed. |
| ``rowOrderSeed`` | ``seed ^ 0xA3F1C6B7`` (or similar) | Each subsystem (row selection, clue removal, difficulty tweaks) derives its own PRNG by mixing in a constant so we can sample reproducibly without having to pass huge state objects through the pipeline. |
| ``clueSeed`` | ``hashString(seed + ':clues')`` | For logging/verifying we store how the clue selection seed maps back to ``puzzleId``; the descriptor includes it so we can rerun the clue pass during regression tests. |

The puzzle payload returned from ``/api/bits/puzzle`` simply includes ``puzzleId`` (to synchronize storage), and the client replays the generator if it needs to validate a move (for example, to highlight winning rows). Because the generator is deterministic, we can even offer an offline "solve" mode by recomputing ``solution`` on the fly using ``hashString`` + ``createSeededRandom`` (no extra storage needed).

## 6. Shared helpers / infrastructure re-use

| helper | source | usage in Bits |
| --- | --- | --- |
| ``getPTDateYYYYMMDD`` | ``functions/_shared/snake-utils-server.js`` and ``games/common/utils.js`` | Daily ID generator for both frontend and backend, ensures Bits puzzles share the same time window as Snake/Pathways. |
| ``validateUUID`` / ``validateEnv`` | ``functions/_shared/snake-utils-server.js`` | Same validation logic when Bits hits ``/api/bits/complete`` or ``/api/bits/claim-initials``. |
| ``createSeededRandom`` / ``hashString`` | ``games/common/utils.js`` | Base PRNG and hashing utilities for deterministic puzzles on frontend + backend. |
| ``PUZZLE_CACHE`` binding | ``wrangler.toml`` shared across all games | Cache puzzle descriptor (clues + solution) so we never regenerate more than once per day on the server. |
| ``DB`` / ``bits_scores`` table | ``scripts/init-db.sql`` (new ``bits_scores`` table mirroring the Snake/Pathways schema) | Score submissions/leaderboard reuse the same D1 structure; ``bits_scores`` has ``puzzle_id``, ``anon_id``, ``time_ms``, ``hints_used``, ``initials``, ``created_at`` with the usual indexes. |
| ``STORAGE_KEYS`` pattern | ``pathways-utils.js`` exports | Add ``BITS_PROGRESS`` key (mirrors ``PATHWAYS_PROGRESS``) and use ``getOrCreateAnonId`` to keep user identity consistent for leaderboard submissions. |
| ``Grid state persistence`` | Follows Pathways’ approach with ``localStorage`` + JSON snapshots | Bits stores ``gridState`` under ``STORAGE_KEYS.BITS_PROGRESS`` so we can resume mid-solve. |

Because the server already exposes leaderboard endpoints for Snake/Pathways/Lattice, Bits reuses the same endpoints (`complete`, `leaderboard`, `claim-initials`) but with ``bits_scores`` as the backing table, so we do not need to write new APIs beyond the puzzle generator and the UI hook that calls it.

## 7. Next steps / implementation notes

1. Build ``games/bits/bits-generator.js`` (or similar) that exports ``generateBitsDescriptor(puzzleId)`` using the above steps; export helper versions of the row library for tests.  
2. Create ``functions/api/bits/puzzle.[js|ts]`` that tries ``PUZZLE_CACHE`` first and falls back to ``generateBitsDescriptor`` when the cache miss occurs.  
3. Add client-side components (``BitsEngine``, ``BitsInput``, etc.) that consume the descriptor, store grid state via ``STORAGE_KEYS.BITS_PROGRESS``, and reuse UI patterns from Pathways (clue highlighting, progress modal).  
4. Document the generator in ``repos/Daily-Grid/docs/bits-puzzle-design.md`` (this file) so future contributors understand the deterministic constraints, seeds, and shared helpers.
