# Perimeter design notes

## 1. Grid constraints

### Loop fundamentals
Perimeter (aka Semaphores) is played on a grid of dots. The player draws a single non-branching, non-crossing loop that travels along the orthogonal edges between dots and must pass through every circled node exactly once. Each circled node is a "guard" that imposes a behavior on the loop as it passes through: white guards force the path to continue straight, while black guards force it to turn. The loop must satisfy every guard simultaneously, so the circles become the anchors that turn an otherwise free loop into a determinate puzzle [1].

### Guard placement
Guards live on the intersections and only appear where the loop passes. Because each guard restricts the local behavior of the loop, their colors should be spread so that they can actually be honored. Tips for placement:
- **White guards** go where you want the line to continue: they are ideal for emphasizing long straight stretches and bridging several cells with a single pivot-free span.
- **Black guards** are the only way to enforce a 90° turn; place them where the generator needs the loop to change direction or create enclosed regions.
- Each guard corresponds to the actual loop that will be generated, so you can’t simply sprinkle them—white and black placements must match the direction the loop actually takes. This means the generator needs to know the loop before it can emit guards.
- When editing by hand for theme feel, keep a roughly even balance so the board doesn’t become all straights or all turns, which tends to drift toward too few or too many candidate solutions.

### Number ordering
Every numbered guard communicates the total length of the two straight-line arms that emerge from it. After picking a loop, count how many consecutive edges extend in each of the two directions that share the same axis with the guard's transit; the sum of those two counts is the guard's number [1]. Because the numbers are derived from the loop, they are automatically ordered by how the loop curls through the grid:
- Large numbers mark long straight runs and usually sit in the middle of corridors, near the board edges, or between widely spaced turns so there is enough room to satisfy the requested length.
- Small numbers (including 0 or 1) appear wherever the loop bends quickly, but note that both arms must be at least length 1 if the guard is turning, so the minimum sum is typically 2.
- The generator's job is to convert the unnumbered loop into these sums; any post-hoc change to a number requires recalculating the adjoining arms so the ordering stays consistent with the actual path.
- During puzzle construction it helps to cap each number by the available space along its axis (e.g., a 9 cannot live in a 5×5 grid unless the row or column actually supports that many segments). A quick validity check is to ensure each number is ≤ `(axis-length − 1) × 2`, then shrink it further if the loop’s geometry cannot deliver that much stretch.

*Generator planning note*: the number assignment happens after the loop has been fixed. Whenever you move a guard or adjust the loop, recompute lengths by walking outward from the guard along the loop until you reach either the next turn or the board edge.

---

## 2. Palette & UX notes for the blue-on-ivory aesthetic

### Palette
| Role | Color | Usage |
| --- | --- | --- |
| Ivory base | `#F9F5EE` | Background hero surfaces, modal backplates, board underlay.
| Deep indigo | `#1F3252` | Primary line color for the loop, anchor text, icons.
| Cerulean accent | `#5AA2D8` | Hover/focus states, guard halos, progress indicators.
| Soft storm | `#2A2B3D` | Text headings, footer, and dividing borders.
| Whisper highlight | `#E3F2FF` | Glows under active cells, subtle panel gradients.
| Muted charcoal | `#3A3C4D` | Secondary text, disabled buttons, X-marks.

Keep the palette airy: the ivory ground means any line, text, or panel should avoid heavy saturation beyond the indigo/cerulean duo. Pairing with a linen texture (dashed noise or very low opacity diagonal) reinforces the analog puzzle-binder vibe without overwhelming legibility.

### UX notes
- **Board treatment**: use rounded square intersections with soft drop shadows (e.g., `box-shadow: 0 8px 20px rgba(23,27,45,0.12)`) to mimic a tile on a table. Draw the loop in the deep indigo with a 4px stroke and apply a glow (`filter: drop-shadow(0 0 12px rgba(90,162,216,0.35))`).
- **Guard rendering**: white guards remain plain circles with a thin indigo border and no fill. Black guards (turns) should have a filled `#1F3252` circle with a white stroke so they pop on the ivory. Numbers sit center-aligned inside the circle in the muted charcoal.
- **Hover/active states**: lighten the cell background toward `#E3F2FF` and thicken the outer stroke slightly; the contrast still reads well on ivory. Keep the high contrast between the indigo loop and the background to maintain WCAG compliance.
- **Tappable controls**: buttons and chips continue the gradient technique from existing games (indigo → cerulean) but should use darker outlines (use `border: 1px solid rgba(31,50,82,0.4)`).
- **Micro-interactions**: when the player satisfies a guard, flash the circle with the cerulean accent for 150ms. Use short blur effects for overlays (e.g., `backdrop-filter: blur(18px)`) to preserve softness while focusing on content.
- **Typography**: Space Grotesk or a similar humanist sans keeps things modern; combine with JetBrains Mono for numeric readouts (puzzle IDs, timers) so numbers stay crisp.

---

## 3. Shared vs custom obligations
| Feature | Shared | Custom |
| --- | --- | --- |
| Leaderboard / submission helpers | `games/common/utils.js` (date formatting, anon IDs, formatting time) + backend endpoints (`functions/api/perimeter/`) | None (re-use common flow). Ensure submission keys follow `dailygrid_perimeter_submitted_{date}` like other games.
| Share text + copy fallback | `games/common/share.js` (buildShareText, shareWithFallback, logo caching) | Supply `shareUrl`/`gameName` that match the new front-end and include the blue-on-ivory hero image.
| Visual chrome (nav, buttons, modals) | Style patterns/components that appear across Snake/Pathways/Lattice (glass cards, detail accordions, pause overlay). | The board layout, guard symbols, and new palette need their own CSS/HTML but can reuse class names (e.g., `.btn`, `.glass-strong`).
| Puzzle data flow | The `puzzleId`/`guild` concept, scoreboard API, and daily-notice UI should follow the existing naming (e.g., `games/common` share + scoreboard). | Loop logic, guard metadata, palette-specific icons, and clue language must be bespoke for Perimeter.
| Modal & overlay behaviors | Leverage the same `details`-based collapsible pattern plus share/leaderboard modals used by other games to keep interactions consistent. | The labels and text inside (e.g., guard explanations) should reflect the blue-and-ivory story.

---

## 4. Generator approach (~2h)
| Step | Description | Time estimate |
| --- | --- | --- |
| 1. Loop builder | Start with an empty `width × height` grid of dots and carve a large loop by running a randomized DFS/backtracking sweep that avoids self-intersections, enforcing a single cycle. Save the resulting edges (the solver from [2] shows that 5×5–40×40 loops are viable). | 45 min |
| 2. Guard derivation | Walk the loop again and, for every visited dot, tag it as white or black based on whether the incoming/outgoing directions align. Record the two straight arms for number calculation. | 30 min |
| 3. Number assignment & validation | At each guard, compute the length of each straight arm (count edges until a turn or boundary) and store the sum. If the sum exceeds the available rank (grid width/height), backtrack by shifting the loop locally or insert an extra turn. | 25 min |
| 4. Export + sanity checks | Serialize the puzzle (grid size, guard positions/colors/numbers) and add a quick verifier (optionally reuse the solver) to ensure the generated numbers actually reproduce the loop before publishing. | 20 min |
| **Total** | Baseline generator that produces a consistent, solvable candidate puzzle. Guaranteeing uniqueness or building a UI around it would take additional time, but the core loop → guard pipeline fits within ~2h. | **2h** |

---

## References
1. Perimeter FAQ — loop rules, guard colors, and number meaning: https://www.puzzle-perimeter.com/faq.php
2. Perimeter Solver repo (sample sizes/solver limits): https://raw.githubusercontent.com/joshprzybyszewski/perimetersolver/main/README.md
