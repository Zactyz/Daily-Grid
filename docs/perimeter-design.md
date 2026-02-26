# Perimeter design notes

## 1. Core rules (loop + perimeter clues)
Perimeter is a single-loop puzzle on a dot grid. Players draw a continuous loop along the grid edges. Numbers inside cells tell you how many of the four edges around that cell belong to the loop.

Rules:
- Draw one continuous, non-branching loop along the grid lines.
- Every dot has degree 0 or 2 (no dead ends, no branches).
- Each given number equals the count of loop edges around that cell.
- Use an X mark to rule out edges.

## 2. Generator (current implementation)

### Loop source: region perimeter
We generate a random, connected region of cells and take its boundary as the loop. This guarantees a single, non-self-intersecting loop as long as the region is connected and hole-free.

Steps:
1. **Pick grid size**: `5–7` cells per side.
2. **Build region**: randomized growth from a seed cell to a target coverage of ~35–55%.
3. **Reject holes**: flood-fill the outside and ensure all non-region cells are reachable from the boundary.
4. **Extract boundary**: every edge between a region cell and a non-region cell is part of the loop.
5. **Derive clues**: for each cell, count how many of its four edges are in the loop.
6. **Hide clues**: hide ~45% of clues, with a minimum visible threshold (~35% of cells). Prefer keeping non-zero clues visible.

This yields solvable puzzles (not necessarily unique) with a balanced mix of clues.

## 3. Visual language & UX
Theme is deep navy with sky accents:
- Background: `#0c1018`
- Accent: `#7da2ff`
- Grid lines: faint sky tint
- Loop edges: bright with a soft glow
- Clues: circular badges that glow when satisfied and warn red when exceeded

UX notes:
- Tapping an edge cycles **empty → line → X**.
- Invalid nodes (degree > 2) tint red to discourage branching.
- Progress text shows clue satisfaction and line count.

## 4. Shared shell obligations
- Use the shared shell for overlays, pause/reset, completion modal, share, and leaderboard.
- Use `buildShareCard` for a consistent share image.
- Daily progress persists; practice does not.
- Completion celebration uses the shared pulse + confetti system.

## 5. Future enhancements
- Uniqueness check via solver (optional, not required for daily cadence).
- Difficulty tiers by clue density / region size.
- Optional “auto-X” assist or edge-locking for beginners.
