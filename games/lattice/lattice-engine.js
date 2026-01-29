import { createSeededRandom, hashString, pickN, shuffle, permutations } from './lattice-utils.js';

// Puzzle model:
// - identity: { category, values: [..], roleLabel }
// - categories: [{ category, role, values:[..] }] includes identity as first
// - solution: { [category]: perm } where perm is array of indices: perm[identityIndex] = valueIndex
// - clues: array of clue objects

function roleAwareSubject(identityCategory, identityValue) {
  if (identityCategory === 'country') return `The person from ${identityValue}`;
  if (identityCategory === 'job') return `The ${identityValue}`;
  // name or anything else
  return identityValue;
}

function roleAwareNoun(category) {
  // very lightweight grammar
  const map = {
    animal: 'animal',
    pet: 'pet',
    drink: 'drink',
    food: 'food',
    hobby: 'hobby',
    vehicle: 'vehicle',
    color: 'color',
    job: 'job',
    country: 'country',
    name: 'name'
  };
  return map[category] || category;
}

export class LatticeEngine {
  constructor(dataset) {
    this.dataset = dataset; // { byCategory: Map<string,string[]>, rolesByCategory: Map<string,string> }
  }

  generateDaily(puzzleId) {
    const seed = hashString(`lattice:${puzzleId}`);
    return this._generate(seed, { mode: 'daily', puzzleId });
  }

  generatePractice() {
    const seed = Math.floor(Math.random() * 2 ** 31);
    return this._generate(seed, { mode: 'practice', puzzleId: null });
  }

  _generate(seed, meta) {
    const rnd = createSeededRandom(seed);

    // Choose size: 3 (60%) or 4 (40%)
    const size = rnd() < 0.6 ? 3 : 4;

    const identityCandidates = ['name', 'job', 'country'].filter(c => this.dataset.byCategory.has(c));
    const identityCategory = identityCandidates[Math.floor(rnd() * identityCandidates.length)];

    const otherCandidates = Array.from(this.dataset.byCategory.keys())
      .filter(c => c !== identityCategory)
      .filter(c => this.dataset.rolesByCategory.get(c) !== 'identity');

    const otherCount = size === 3 ? 2 : 3;
    const otherCategories = pickN(otherCandidates, otherCount, rnd);

    const categories = [identityCategory, ...otherCategories];

    // Pick values
    const pickedValues = new Map();
    for (const c of categories) {
      const pool = this.dataset.byCategory.get(c);
      const vals = pickN(pool, size, rnd);
      pickedValues.set(c, vals);
    }

    // Build solution permutations for each non-identity category
    const solution = {};
    const idVals = pickedValues.get(identityCategory);

    for (const c of otherCategories) {
      const perm = shuffle([...Array(size).keys()], rnd).slice();
      solution[c] = perm; // identityIndex -> valueIndex
    }

    // Always include identity with implicit identity mapping
    solution[identityCategory] = [...Array(size).keys()];

    // Generate clues until unique
    const base = { meta: { ...meta }, size, categories, identityCategory, values: pickedValues, solution };
    const { clues, difficulty } = this._generateCluesUnique(base, rnd);

    // Create display strings for clues
    const clueTexts = clues.map(clue => this._clueToText(clue, base));

    return {
      ...meta,
      size,
      identityCategory,
      categories: categories.map(c => ({ category: c, role: this.dataset.rolesByCategory.get(c), values: pickedValues.get(c) })),
      solution,
      clues,
      clueTexts,
      difficulty
    };
  }

  _generateCluesUnique(base, rnd) {
    const { size, identityCategory, categories, values, solution } = base;
    const otherCategories = categories.filter(c => c !== identityCategory);

    // candidate clue pool
    const candidates = [];

    // Positive identity-to-category facts
    for (const c of otherCategories) {
      for (let i = 0; i < size; i++) {
        const vi = solution[c][i];
        candidates.push({ kind: 'idEq', idIndex: i, category: c, valueIndex: vi });
      }
    }

    // Negative identity-to-category facts
    for (const c of otherCategories) {
      for (let i = 0; i < size; i++) {
        const correct = solution[c][i];
        for (let vi = 0; vi < size; vi++) {
          if (vi === correct) continue;
          candidates.push({ kind: 'idNeq', idIndex: i, category: c, valueIndex: vi });
        }
      }
    }

    // Links between two non-identity categories via shared identity row
    for (let a = 0; a < otherCategories.length; a++) {
      for (let b = a + 1; b < otherCategories.length; b++) {
        const ca = otherCategories[a];
        const cb = otherCategories[b];
        for (let i = 0; i < size; i++) {
          const va = solution[ca][i];
          const vb = solution[cb][i];
          candidates.push({ kind: 'link', a: { category: ca, valueIndex: va }, b: { category: cb, valueIndex: vb } });
        }
      }
    }

    shuffle(candidates, rnd);

    const clues = [];
    let attempts = 0;
    let solutionsCount = this.countSolutions({ size, identityCategory, categories, values, clues });

    while (solutionsCount !== 1 && attempts < 500) {
      // Add next clue that doesn't break (0 solutions)
      const clue = candidates.pop();
      if (!clue) break;
      clues.push(clue);
      const ccount = this.countSolutions({ size, identityCategory, categories, values, clues });
      if (ccount === 0) {
        // undo - contradiction
        clues.pop();
      } else {
        solutionsCount = ccount;
      }
      attempts++;
    }

    // Difficulty estimate: fewer clues + more indirect links => harder
    const linkCount = clues.filter(c => c.kind === 'link').length;
    const negCount = clues.filter(c => c.kind === 'idNeq').length;
    const posCount = clues.filter(c => c.kind === 'idEq').length;
    const difficulty = {
      clueCount: clues.length,
      linkCount,
      negCount,
      posCount
    };

    return { clues, difficulty };
  }

  countSolutions(puzzle) {
    const { size, identityCategory, categories, clues } = puzzle;
    const otherCategories = categories.filter(c => c !== identityCategory);

    // Precompute all perms for size
    const perms = permutations([...Array(size).keys()]);

    let count = 0;

    // For each category, assignment is a perm: identityIndex -> valueIndex
    // We'll iterate nested over perms (k categories). k is 2 or 3.

    const k = otherCategories.length;

    function checkClue(clue, assign) {
      // assign: { [category]: perm }
      if (clue.kind === 'idEq') {
        return assign[clue.category][clue.idIndex] === clue.valueIndex;
      }
      if (clue.kind === 'idNeq') {
        return assign[clue.category][clue.idIndex] !== clue.valueIndex;
      }
      if (clue.kind === 'link') {
        const ca = clue.a.category;
        const cb = clue.b.category;
        // There exists an identity row i such that ca has va and cb has vb
        // Since assign is bijection, we can locate by scanning
        for (let i = 0; i < size; i++) {
          if (assign[ca][i] === clue.a.valueIndex) {
            return assign[cb][i] === clue.b.valueIndex;
          }
        }
        return false;
      }
      return true;
    }

    const assign = {};

    const loop = (idx) => {
      if (idx === k) {
        // evaluate all clues
        for (const clue of clues) {
          if (!checkClue(clue, assign)) return;
        }
        count++;
        return;
      }
      const cat = otherCategories[idx];
      for (const p of perms) {
        assign[cat] = p;
        loop(idx + 1);
      }
    };

    loop(0);
    return count;
  }

  _clueToText(clue, base) {
    const { identityCategory, values } = base;
    const idVals = values.get(identityCategory);

    if (clue.kind === 'idEq') {
      const subj = roleAwareSubject(identityCategory, idVals[clue.idIndex]);
      const val = values.get(clue.category)[clue.valueIndex];
      const noun = roleAwareNoun(clue.category);

      // template by category
      if (clue.category === 'country') return `${subj} is from ${val}.`;
      if (clue.category === 'job') return `${subj} is the ${val}.`;
      if (clue.category === 'color') return `${subj} likes ${val}.`;
      if (clue.category === 'drink') return `${subj} drinks ${val}.`;
      if (clue.category === 'food') return `${subj} eats ${val}.`;
      if (clue.category === 'hobby') return `${subj} enjoys ${val}.`;
      if (clue.category === 'vehicle') return `${subj} drives the ${val}.`;
      if (clue.category === 'animal') return `${subj} has the ${val}.`;
      return `${subj} matches ${noun}: ${val}.`;
    }

    if (clue.kind === 'idNeq') {
      const subj = roleAwareSubject(identityCategory, idVals[clue.idIndex]);
      const val = values.get(clue.category)[clue.valueIndex];

      if (clue.category === 'color') return `${subj} does not like ${val}.`;
      if (clue.category === 'drink') return `${subj} does not drink ${val}.`;
      if (clue.category === 'food') return `${subj} does not eat ${val}.`;
      if (clue.category === 'hobby') return `${subj} does not enjoy ${val}.`;
      if (clue.category === 'vehicle') return `${subj} does not drive the ${val}.`;
      if (clue.category === 'animal') return `${subj} does not have the ${val}.`;
      if (clue.category === 'job') return `${subj} is not the ${val}.`;
      if (clue.category === 'country') return `${subj} is not from ${val}.`;
      return `${subj} is not associated with ${val}.`;
    }

    if (clue.kind === 'link') {
      const aVal = values.get(clue.a.category)[clue.a.valueIndex];
      const bVal = values.get(clue.b.category)[clue.b.valueIndex];

      // Use clearer template anchored on one category -> other
      // Example: "The person who drinks Tea enjoys Chess."
      const aPhrase = this._valuePhrase(clue.a.category, aVal);
      const bPhrase = this._valuePhrase(clue.b.category, bVal);
      return `The person who ${aPhrase} ${bPhrase}.`;
    }

    return 'Clue';
  }

  _valuePhrase(category, value) {
    if (category === 'country') return `is from ${value}`;
    if (category === 'job') return `is the ${value}`;
    if (category === 'color') return `likes ${value}`;
    if (category === 'drink') return `drinks ${value}`;
    if (category === 'food') return `eats ${value}`;
    if (category === 'hobby') return `enjoys ${value}`;
    if (category === 'vehicle') return `drives the ${value}`;
    if (category === 'animal') return `has the ${value}`;
    return `has ${category} ${value}`;
  }
}
