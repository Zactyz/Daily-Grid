import { getPTDateYYYYMMDD } from '../games/common/utils.js';
import {
  generatePuzzle,
  simulatePlan,
  validatePuzzleDescriptor
} from '../games/blindslid/harbor-puzzles.js';

function addDays(dateId, days) {
  const date = new Date(`${dateId}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const today = getPTDateYYYYMMDD();
const seeds = new Set();
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : null;
const showProgress = process.argv.includes('--progress');

for (let i = 0; i < 90; i += 1) {
  seeds.add(addDays(today, i));
}

for (let i = 0; i < 24; i += 1) {
  seeds.add(`practice-harbor-${i}`);
}

const failures = [];
const counts = { 7: 0, 8: 0 };
const exitSides = new Map();
const signatures = new Set();

const seedList = Number.isFinite(limit) && limit > 0
  ? Array.from(seeds).slice(0, limit)
  : Array.from(seeds);

for (const seed of seedList) {
  if (showProgress) console.log(`Checking ${seed}...`);
  const puzzle = generatePuzzle(seed);
  const validation = validatePuzzleDescriptor(puzzle);

  if (!validation.valid) {
    failures.push(`${seed}: ${validation.errors.join('; ')}`);
    continue;
  }

  if (puzzle.width !== 7 || puzzle.height !== 7) {
    failures.push(`${seed}: expected 7x7, got ${puzzle.width}x${puzzle.height}`);
  }

  if (![7, 8].includes(puzzle.moveLimit)) {
    failures.push(`${seed}: expected moveLimit 7 or 8, got ${puzzle.moveLimit}`);
  }

  if (puzzle.selectableIds.length < 12 || puzzle.selectableIds.length > 14) {
    failures.push(`${seed}: expected 12-14 selectable vehicles, got ${puzzle.selectableIds.length}`);
  }

  const solution = simulatePlan(puzzle.pieces, puzzle.solutionPlan, puzzle);
  if (!solution.success || !solution.allMoved) {
    failures.push(`${seed}: stored solution failed simulation`);
  }

  exitSides.set(puzzle.exitSide, (exitSides.get(puzzle.exitSide) || 0) + 1);
  signatures.add(JSON.stringify(puzzle.pieces.map((piece) => ({
    id: piece.id,
    row: piece.row,
    col: piece.col,
    len: piece.len,
    orient: piece.orient,
    isGoal: !!piece.isGoal
  }))));
  counts[puzzle.moveLimit] += 1;
}

if (failures.length > 0) {
  console.error(`Harbor validation failed (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Harbor validation passed for ${seedList.length} seeds (${counts[7]} seven-move, ${counts[8]} eight-move, ${signatures.size} unique layouts, exits: ${Array.from(exitSides.entries()).map(([side, count]) => `${side} ${count}`).join(', ')}).`);
