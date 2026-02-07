# Conduit puzzle (circuit wiring) generator & data model

> Target: deterministic 7×7 pipe network where every cell either preloads a pipe segment or must be rotated by the player, directional constraints ensure a single continuous system, and the whole descriptor plugs into the Daily Grid shared helpers (`PUZZLE_CACHE`, leaderboard helpers, `games/common` utilities). The generator is broken into clear phases so the `phase` helper can reproduce/replay each step (~2h work to wire through generator + shared wiring).

## 1. Puzzle descriptor (server-side model)

| field | shape | purpose |
| --- | --- | --- |
| `puzzleId` | `string` (`YYYY-MM-DD` via `getPTDateYYYYMMDD`) | Canonical daily token (shared across all games) and primary key for caching + leaderboard submissions. |
| `seed` | `number` (`hashString("conduit:" + puzzleId)`) | Base randomness for all phases; namespacing keeps Conduit distinct from other puzzles that use the same date. |
| `width` / `height` | `number` (7) | Fixed grid dimensions. |
| `entryPoints` | `Array<{ edge: 'top'|'bottom'|'left'|'right'; index: number; dir: 'N'|'E'|'S'|'W' }>` | Where water enters/exits (usually 2–3). Each entry includes the direction of the forced connection so the UI can draw a pipe stub at the border. |
| `solutionCells` | `Array<PipeCell>` | 49 objects describing the completed layout: bitmask of cardinal connections, pipe type, whether the cell is intended to be prefilled, `flowPressure` for difficulty tuning, etc. |
| `directionalHints` | `Array<DirectionalHint>` | Extra constraints (see section 3) that the UI can render: counts along rows/columns, arrow hints on select cells, and forced turn markers that help prune multiple solutions. |
| `prefilledCells` | `Array<{ r: number; c: number; connections: DirectionMask }>` | Cells the generator exposes up front as “locked” pieces; usually a mix of entry points, junctions, and a couple of curve anchors to keep the solution unique. |
| `phaseTrace` | `Array<{ phase: string; seed: number; summary: string }>` | Light-weight audit log (phase name + seed) so we can replay each stage from logs/tests when debugging seams. |
| `metadata` | `object` | Friendly info (e.g., `{ difficulty: 'medium', junctions: 12, branchFactor: 3 }`) for telemetry and future QA filters. |

`PipeCell` definition (server):

```
interface PipeCell {
  r: number;
  c: number;
  connections: DirectionMask;   // bitmask (N=1, E=2, S=4, W=8)
  pipeType: 'straight' | 'elbow' | 'tee' | 'cross';
  isPrefill: boolean;
  junctionId?: number;           // optional grouping for multi-step checks
  flowPressure?: number;         // used for hint weighting when drawing directional hints
}
```

Directional hints are simple value objects that describe an extra constraint without leaking the entire solution:

```
interface DirectionalHint {
  type: 'edgeCount' | 'forcedTurn' | 'flowMatch';
  target: { r: number; c: number } | { edge: 'top'|'left'|'bottom'|'right'; index: number };
  value: number | Dir;
  reason?: string; // human-friendly annotation for debugging
}
```

Storing this descriptor in `PUZZLE_CACHE` (keyed by `conduit:puzzle:${puzzleId}`) lets the `/api/conduit/puzzle` endpoint serve the cached payload instantly, matching the Snake/Pathways/Bits pattern.

## 2. Runtime grid state (client-model)

The UI keeps a compact mirror of the descriptor so it can track progress, highlight errors, and persist mid-solve. By following the storage pattern used by Pathways, we keep load/resume logic reusable.

```
interface ConduitPlayerCell {
  r: number;
  c: number;
  rotation: 0 | 90 | 180 | 270; // multiples of 90°; initial rotation keeps `connections` locked until player rotates
  isClue: boolean;
  isLocked: boolean;             // for temporary locks (e.g., once the user verifies a junction)
  status: 'unknown' | 'valid' | 'broken';
}

interface ConduitGridState {
  puzzleId: string;
  cells: ConduitPlayerCell[];      // length 49, row-major
  hintsUsed: number;
  elapsedMs: number;
  solvedAt?: number;
  phaseSnapshot?: string;        // serialized phase name/seed for debugging
}
```

Persist under a new storage key (e.g., `STORAGE_KEYS.CONDUIT_PROGRESS`) so the shell can reuse the same save/load helpers that Pathways/Bits already rely on. On load, compare `state.puzzleId` to `getPTDateYYYYMMDD()` and drop stale snapshots.

## 3. Directional constraints and helper types

Conduit revolves around ensuring the network is consistent in all four directions. The generator tracks these invariants explicitly so the UI can validate moves locally without recalculating the entire graph.

- **Direction mask helpers**: reuse the `DirectionMask` helpers from `games/common/utils` to flip connections when a cell rotates (bit operations keep performance predictable). A mask of `0b0101` (N + S) means a straight vertical pipe.
- **Neighbor matching**: each `PipeCell`’s `connections` must match the `connections` of its direct neighbors (e.g., if a cell has `E` enabled, the cell at `(r, c+1)` must have `W`). The generation phases enforce this by building the graph edge-first and never exposing orphan connections, except at `entryPoints` and planned `exitPoints`.
- **Directional hints**:
  - `edgeCount`: row/column counts of how many conduit hook into a boundary segment; these mirror the `pathways` style hints and help reduce branching.
  - `forcedTurn`: mark a cell that must turn in a specific direction so the UI can draw a directional indicator (useful for narrative/visual rhythm).
  - `flowMatch`: pairs of cells that must share or differ in the direction of a connection (e.g., “The pipe north of this junction must continue east”). These hints are derived deterministically from `flowPressure` or by sampling candidate branches.
- **Branching rules**: the generator limits the number of `tee`/`cross` junctions to keep the puzzle solvable within 7×7; remaining cells are straights or elbows. We track a `branchBudget` (e.g., at most 3 tees) per descriptor.

## 4. Deterministic generator phases

We break generation into explicit named phases so a `phase helper` module (`conduit/phase-helper.js`) can seed each stage separately, log the results, and make debugging/regeneration deterministic.

1. **`phase-one: carve skeleton`**
   - Derive `phaseSeed = hashString(seed + ':skeleton')` and pass it to `createSeededRandom`.
   - Build a graph starting from `entryPoints`, walking through the grid until every target exit is reached. Track `visitedCells` and ensure no cell gets more than 4 connections.
   - Latest random choices decide where to place elbows/straight segments; we keep a small `branchCandidates` pool so the network stays winding but manageable.
   - If the attempt fails (dead-end or unconnected exit), increment a secondary offset (`seed + attempt * 0x1000`) and rerun phase one (cap at ~100 tries). The attempt counter is recorded in `phaseTrace`.

2. **`phase-two: pin directional constraints`**
   - Seed derived via `phaseSeed = hashString(seed + ':constraints')`.
   - Walk the `solutionCells` graph and gather metadata: counts per edge, candidate forced turns, branch spans. Use `flowPressure` to rank junctions (higher pressure = better candidate for hints).
   - Emit `directionalHints` (edge counts, forced turns, flow matches) seeded so they stay the same every build.
   - This phase also decides which cells become `prefilledCells`; typically anchor entry points + 1–2 internal junctions chosen by pressure.

3. **`phase-three: finalize descriptor`**
   - Seed derived via `phaseSeed = hashString(seed + ':clues')`.
   - Sample additional `prefetched` pieces (up to N more) and compute `metadata` (junction count, difficulty rank). Keep a deterministic `prefillSet` and record it for the UI (so share text can mention e.g., “Clues: 5 anchors”).
   - Build the final descriptor and store it in `PUZZLE_CACHE`. If this phase ever runs in isolation (e.g., for regression tests), the helper can replay the seeds logged in `phaseTrace`.

The `phase helper` module exports utilities like `initPhase(name, baseSeed)` and `recordPhase(name, seed, summary)` so every run logs the `phaseTrace` array that the descriptor consumes.

## 5. Seed mapping & caching strategy

| value | formula | comment |
| --- | --- | --- |
| `puzzleId` | `getPTDateYYYYMMDD(now)` | LA-centric date to stay in sync with the other Daily Grid puzzles. |
| `seed` | `hashString('conduit:' + puzzleId)` | Namespacing ensures Conduit’ randomness never collides with Snake/Bits/etc. |
| per-phase seed | `hashString(seed + ':phaseName')` | Each phase derives its own PRNG so we can rerun one phase (e.g., `constraints` only) without threading a large RNG state through the pipeline. |
| fallback attempt seed | `seed + attempt * 0x1000` | When `phase-one` fails, we bump the seed (logged in `phaseTrace`) and rerun; deterministic because the attempt index is part of the recorded state. |

After composing the final descriptor, the `/api/conduit/puzzle` handler first checks `env.PUZZLE_CACHE` for `conduit:puzzle:${puzzleId}`. On a cache miss it runs the generator, caches the result with `expirationTtl: 86400`, and returns the descriptor. This matches the same caching strategy Snake/Pathways/Bits already rely on.

## 6. Shared helpers / infrastructure re-use

| helper | source | role in Conduit |
| --- | --- | --- |
| `getPTDateYYYYMMDD` | `functions/_shared/snake-utils-server.js` & `games/common/utils.js` | Daily ID generator for both backend + frontend; keeps puzzle IDs aligned with the rest of the site. |
| `validateEnv` / `validateUUID` | `functions/_shared/snake-utils-server.js` | Standard safety checks for `/api/conduit/complete`, `/leaderboard`, `/claim-initials`. |
| `hashString` / `createSeededRandom` | `games/common/utils.js` | Shared hashing/PRNG ensures the descriptor can be replayed by both server and client and the `phase helper` can derive seeds consistently. |
| `PUZZLE_CACHE` binding | `wrangler.toml` | Stores the descriptor keyed by `conduit:puzzle:${puzzleId}` so regeneration happens only once per day. |
| `conduit_scores` table | `scripts/init-db.sql` | Matches the existing leaderboard schema (`puzzle_id`, `anon_id`, `time_ms`, `hints_used`, `initials`, `created_at`). |
| `phase helper` module | new file (e.g., `functions/conduit/phase-helper.js` or `games/conduit/phase-helper.js`) | Orchestrates deterministic seeds/logging for each generation phase; exports `initPhase`, `recordPhase`, `deriveMask` helpers so both server + tests can replay a single phase. |
| `STORAGE_KEYS` + shared progress helpers | repurpose `Pathways`/`Bits` storage helpers | Persist `CONDUIT_PROGRESS` in `localStorage` (just like Pathways) so the resumes are consistent. |

## 7. Next steps & implementation notes

1. Implement `games/conduit/conduit-generator.js` that exposes `generateDescriptor(puzzleId)` and internally uses the `phase helper` helpers outlined above. The generator should expose hooks for unit tests (e.g., `forTest: { phaseTrace, branchBudget }`).
2. Add `functions/api/conduit/puzzle.js` that checks `PUZZLE_CACHE`, calls the generator on a miss, caches the descriptor, and returns it. Confirm it reuses `validateEnv` and records attempts in `phaseTrace` for observability.
3. Wire the UI under `games/conduit/` to consume the descriptor, persist state in `STORAGE_KEYS.CONDUIT_PROGRESS`, and feed completion/hints to the existing leaderboard + share helpers (`buildShareText`, etc.).
4. Timebox: planning + implementation of the above phases + shared wiring should fit in a ~2h focused chunk once the backbone modules exist (generator + API). If time runs long, prioritize `phase-one` + caching first so `complete`/`leaderboard` can stay idle while the UI ships.
