# Conduit puzzle (circuit routing) design

Conduit is a rotation-based circuit puzzle. The goal is to rotate tiles so the electric current flows from the **source inlet** to the **exit(s)**. Only circuit tiles need to be powered; empty cells are irrelevant.

## 1. Puzzle rules
- Rotate tiles 90° per tap.
- Power must flow from the **source** into the network.
- Every **active** circuit tile must be powered.
- **Blocked** tiles cannot be used.
- **Fixed** tiles are locked in place.
- Some puzzles include **two exits**, requiring a branch.

## 2. Descriptor model (frontend + backend)
The puzzle descriptor is intentionally compact:

```
{
  puzzleId,
  seed,
  width,
  height,
  entryPoints: [
    { r, c, dir, role: 'source' },
    { r, c, dir, role: 'exit' },
    { r, c, dir, role: 'exit' } // optional
  ],
  solutionCells: [
    { r, c, connections, segmentType, isPrefill, isBlocked, isActive }
  ],
  metadata: {
    difficulty,
    activeCount,
    blockedCount,
    exitCount
  }
}
```

Notes:
- `connections` is a bitmask (`N=1, E=2, S=4, W=8`).
- `isActive` is `true` for tiles that belong to the generated network.
- `isBlocked` blocks a tile entirely.
- `isPrefill` marks fixed tiles that cannot be rotated.

## 3. Generator approach (current)
1. **Grid**: fixed 7×7.
2. **Blocked tiles**: mark ~14% of cells as blocked (probabilistic).
3. **Entry & exit**:
   - Choose vertical or horizontal flow.
   - Entry on one edge, exit(s) on the opposite edge.
   - Optional second exit with its own probability.
4. **Primary path**:
   - Build a random, non-revisiting path from entry → exit1.
   - If dual exit, pick a branch point on the primary path and build a second path to exit2.
5. **Branch fill**:
   - Grow additional short branches from random active cells to reach a target coverage (~38–55% of available tiles).
6. **Fixed tiles**:
   - Lock a subset of active tiles (~14%), excluding entry/exit tiles.

This produces winding, solvable networks with occasional branching, without forcing every cell to be used.

## 4. Validation model
During play:
- A tile is **broken** if its connections mismatch a neighbor or an entry/exit port.
- A tile is **powered** if it is reachable from the source via valid connections.
- The puzzle is solved when:
  - All active tiles are powered.
  - No tile is broken.
  - Every exit is powered.

## 5. UX notes
- Active tiles are drawn; inactive cells are visually empty.
- Powered tiles glow; broken tiles tint warm/red.
- Source marker: cyan ring. Exit markers: gold diamonds.

## 6. Shared shell obligations
- Use the shared shell for overlays, completion, share, and leaderboard flows.
- Daily progress persists; practice does not.
- Completion celebration uses the shared pulse + confetti system.
