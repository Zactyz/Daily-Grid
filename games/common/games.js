export const GAME_META = [
  {
    id: 'snake',
    name: 'Snake',
    tagline: 'Connect the numbers in order.',
    path: '/games/snake/',
    logo: '/games/snake/snake-logo.png',
    submittedKeyPrefix: 'dailygrid_submitted_',
    completedKeyPrefix: 'dailygrid_completed_',
    replayKeyPrefix: 'dailygrid_replay_',
    theme: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400' },
    shareUrl: 'https://dailygrid.app/games/snake/'
  },
  {
    id: 'pathways',
    name: 'Pathways',
    tagline: 'Connect the matching colors.',
    path: '/games/pathways/',
    logo: '/games/pathways/pathways-logo.png',
    submittedKeyPrefix: 'dailygrid_pathways_submitted_',
    completedKeyPrefix: 'dailygrid_pathways_completed_',
    replayKeyPrefix: 'dailygrid_pathways_replay_',
    theme: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-400' },
    shareUrl: 'https://dailygrid.app/games/pathways/'
  },
  {
    id: 'lattice',
    name: 'Logice',
    tagline: 'Solve the grid with clues.',
    path: '/games/lattice/',
    logo: '/games/lattice/lattice-logo.png?v=2',
    submittedKeyPrefix: 'dailygrid_lattice_submitted_',
    completedKeyPrefix: 'dailygrid_lattice_completed_',
    replayKeyPrefix: 'dailygrid_lattice_replay_',
    theme: { bg: 'bg-sky-500/10', border: 'border-sky-500/30', text: 'text-sky-400' },
    shareUrl: 'https://dailygrid.app/games/lattice/'
  },
  {
    id: 'bits',
    name: 'Bits',
    tagline: 'Balance the binary grid.',
    path: '/games/bits/',
    logo: '/games/bits/bitsnew-logo.jpg',
    submittedKeyPrefix: 'dailygrid_bits_submitted_',
    completedKeyPrefix: 'dailygrid_bits_completed_',
    theme: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400' },
    shareUrl: 'https://dailygrid.app/games/bits/'
  },
  {
    id: 'hashi',
    name: 'Bridges',
    tagline: 'Connect islands into one network.',
    path: '/games/hashi/',
    logo: '/games/hashi/hashi-logo.jpg',
    submittedKeyPrefix: 'dailygrid_hashi_submitted_',
    completedKeyPrefix: 'dailygrid_hashi_completed_',
    theme: { bg: 'bg-sky-500/10', border: 'border-sky-400/30', text: 'text-sky-300' },
    shareUrl: 'https://dailygrid.app/games/hashi/'
  },
  {
    id: 'shikaku',
    name: 'Parcel',
    tagline: 'Pack the grid into rectangles.',
    path: '/games/shikaku/',
    logo: '/games/shikaku/shikaku-logo.jpg',
    submittedKeyPrefix: 'dailygrid_shikaku_submitted_',
    completedKeyPrefix: 'dailygrid_shikaku_completed_',
    theme: { bg: 'bg-amber-300/15', border: 'border-amber-300/30', text: 'text-amber-200' },
    shareUrl: 'https://dailygrid.app/games/shikaku/'
  },
  {
    id: 'conduit',
    name: 'Conduit',
    tagline: 'Route the current to every exit.',
    path: '/games/conduit/',
    logo: '/games/conduit/conduit-logo.png',
    submittedKeyPrefix: 'dailygrid_conduit_submitted_',
    completedKeyPrefix: 'dailygrid_conduit_completed_',
    theme: { bg: 'bg-cyan-500/10', border: 'border-cyan-400/30', text: 'text-cyan-300' },
    shareUrl: 'https://dailygrid.app/games/conduit/'
  },
  {
    id: 'perimeter',
    name: 'Perimeter',
    tagline: 'Draw one loop from the clues.',
    path: '/games/perimeter/',
    logo: '/games/perimeter/perimeter-logo.png',
    submittedKeyPrefix: 'dailygrid_perimeter_submitted_',
    completedKeyPrefix: 'dailygrid_perimeter_completed_',
    theme: { bg: 'bg-indigo-500/10', border: 'border-indigo-400/30', text: 'text-indigo-300' },
    shareUrl: 'https://dailygrid.app/games/perimeter/'
  },
  {
    id: 'polyfit',
    name: 'Polyfit',
    tagline: 'Fill the shape with every piece.',
    path: '/games/polyfit/',
    logo: '/games/polyfit/polyfit-logo.png',
    submittedKeyPrefix: 'dailygrid_polyfit_submitted_',
    completedKeyPrefix: 'dailygrid_polyfit_completed_',
    theme: { bg: 'bg-amber-500/10', border: 'border-amber-400/30', text: 'text-amber-300' },
    shareUrl: 'https://dailygrid.app/games/polyfit/'
  },
  {
    id: 'tiles',
    name: 'Tiles',
    tagline: 'Slide the tiles into order.',
    path: '/games/tiles/',
    logo: '/games/tiles/tiles-logo.png',
    submittedKeyPrefix: 'dailygrid_tiles_submitted_',
    completedKeyPrefix: 'dailygrid_tiles_completed_',
    theme: { bg: 'bg-violet-500/10', border: 'border-violet-400/30', text: 'text-violet-300' },
    shareUrl: 'https://dailygrid.app/games/tiles/'
  },
  {
    id: 'harbor',
    name: 'BlindSlide',
    tagline: 'Program the slides, clear the exit.',
    path: '/games/harbor/',
    logo: '/games/harbor/harbor-logo.png',
    submittedKeyPrefix: 'dailygrid_harbor_submitted_',
    completedKeyPrefix: 'dailygrid_harbor_completed_',
    theme: { bg: 'bg-fuchsia-500/10', border: 'border-cyan-400/30', text: 'text-fuchsia-300' },
    shareUrl: 'https://dailygrid.app/games/harbor/'
  }
];

const PLAY_STATS_KEY = 'dailygrid_play_stats_v1';
export const MIN_DAYS_FOR_PERSONALIZED = 3;

export function getGameMeta(id) {
  return GAME_META.find(game => game.id === id) || null;
}

export function getOtherGames(currentId) {
  return GAME_META.filter(game => game.id !== currentId);
}

function loadPlayStats() {
  try {
    const raw = localStorage.getItem(PLAY_STATS_KEY);
    if (!raw) return { games: {}, daysWithCompletion: [] };
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return { games: {}, daysWithCompletion: [] };
    if (!data.games) data.games = {};
    if (!Array.isArray(data.daysWithCompletion)) data.daysWithCompletion = [];
    return data;
  } catch {
    return { games: {}, daysWithCompletion: [] };
  }
}

function savePlayStats(stats) {
  try {
    localStorage.setItem(PLAY_STATS_KEY, JSON.stringify(stats));
  } catch {
    // ignore storage failures
  }
}

/** Distinct calendar days (puzzle IDs) with at least one game completion recorded. */
export function getDistinctCompletionDaysCount() {
  const stats = loadPlayStats();
  return stats.daysWithCompletion?.length || 0;
}

export function recordGameCompletion(gameId, puzzleId) {
  if (!gameId || !puzzleId) return;
  const stats = loadPlayStats();
  const gameStats = stats.games?.[gameId] || { completions: 0, lastCompleted: 0, lastPuzzleId: null };
  if (gameStats.lastPuzzleId === puzzleId) return;

  gameStats.completions = (gameStats.completions || 0) + 1;
  gameStats.lastCompleted = Date.now();
  gameStats.lastPuzzleId = puzzleId;
  stats.games = stats.games || {};
  stats.games[gameId] = gameStats;

  const days = new Set(stats.daysWithCompletion || []);
  days.add(puzzleId);
  stats.daysWithCompletion = Array.from(days).slice(-30);

  savePlayStats(stats);
}

function getDailyStateStorageKey(gameId, puzzleId) {
  if (gameId === 'polyfit') return `dailygrid_polyfit_state_v2_daily_${puzzleId}`;
  if (gameId === 'snake') return 'dailygrid_snake_progress';
  if (gameId === 'pathways') return 'dailygrid_pathways_progress';
  if (gameId === 'lattice') return `dailygrid_lattice_progress_${puzzleId}`;
  return `dailygrid_${gameId}_state_daily_${puzzleId}`;
}

function readDailyProgress(gameId, puzzleId) {
  try {
    const raw = localStorage.getItem(getDailyStateStorageKey(gameId, puzzleId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isProgressForToday(data, gameId, puzzleId) {
  if (!data) return false;
  if (gameId === 'snake' || gameId === 'pathways' || gameId === 'lattice') {
    return data.puzzleId === puzzleId;
  }
  return true;
}

function hasMeaningfulAttempt(data, gameId) {
  if (!data || data.isComplete) return false;
  if (data.timerStarted) return true;

  switch (gameId) {
    case 'snake':
      return Array.isArray(data.path) && data.path.length > 0;
    case 'pathways':
      return data.paths && Object.values(data.paths).some((path) => Array.isArray(path) && path.length > 0);
    case 'lattice':
      return data.hasSolved === true ? false : Boolean(data.timerStarted);
    case 'bits':
    case 'hashi':
      return Array.isArray(data.bridges) && data.bridges.some((bridge) => (bridge?.count || 0) > 0);
    case 'conduit':
      return (data.moveCount || 0) > 0;
    case 'perimeter':
      return Array.isArray(data.edges) && data.edges.length > 0;
    case 'shikaku':
      return Array.isArray(data.rectangles) && data.rectangles.length > 0;
    case 'polyfit':
      return (Array.isArray(data.pieces) && data.pieces.some((piece) => piece?.placed))
        || (Array.isArray(data.board) && data.board.some((cell) => cell != null));
    case 'tiles':
      return (data.moveCount || 0) > 0;
    case 'harbor':
      return Array.isArray(data.playerOrder) && data.playerOrder.length > 0;
    default:
      return false;
  }
}

/** True when today's daily puzzle was started but not finished or submitted. */
export function isGameAttemptedToday(game, puzzleId) {
  if (!game?.id || !puzzleId || isGameFinishedToday(game, puzzleId)) return false;
  const data = readDailyProgress(game.id, puzzleId);
  if (!isProgressForToday(data, game.id, puzzleId)) return false;
  return hasMeaningfulAttempt(data, game.id);
}

export function isGameFinishedToday(game, puzzleId) {
  if (!game || !puzzleId) return false;
  try {
    if (game.completedKeyPrefix) {
      const completedKey = `${game.completedKeyPrefix}${puzzleId}`;
      if (localStorage.getItem(completedKey) === 'true') return true;
    }
    const submittedKey = `${game.submittedKeyPrefix}${puzzleId}`;
    return localStorage.getItem(submittedKey) === 'true';
  } catch {
    return false;
  }
}

/**
 * Order games by recent play history. In-progress attempts for today are pushed to the end.
 */
export function sortGamesByPlayHistory(games, { minDays = MIN_DAYS_FOR_PERSONALIZED, puzzleId } = {}) {
  if (!games?.length) return games;

  const stats = loadPlayStats();
  const useHistory = stats.daysWithCompletion && stats.daysWithCompletion.length >= minDays;
  const catalogIndex = new Map(GAME_META.map((game, index) => [game.id, index]));

  return [...games].sort((a, b) => {
    if (puzzleId) {
      const aAttempted = isGameAttemptedToday(a, puzzleId);
      const bAttempted = isGameAttemptedToday(b, puzzleId);
      if (aAttempted !== bAttempted) return aAttempted ? 1 : -1;
    }

    if (!useHistory) {
      return (catalogIndex.get(a.id) ?? 0) - (catalogIndex.get(b.id) ?? 0);
    }

    const aStats = stats.games?.[a.id] || {};
    const bStats = stats.games?.[b.id] || {};
    const aLast = aStats.lastCompleted || 0;
    const bLast = bStats.lastCompleted || 0;

    if (bLast !== aLast) return bLast - aLast;

    const aPlays = aStats.completions || 0;
    const bPlays = bStats.completions || 0;
    if (bPlays !== aPlays) return bPlays - aPlays;

    return (catalogIndex.get(a.id) ?? 0) - (catalogIndex.get(b.id) ?? 0);
  });
}

/**
 * Daily + Practice hub display order: incomplete dailies (play-history) then completed (A–Z).
 * Matches the Daily hub card order on both mobile and desktop.
 */
export function getHubGameDisplayOrder(puzzleId) {
  const incomplete = GAME_META.filter((g) => !isGameFinishedToday(g, puzzleId));
  const completed = GAME_META.filter((g) => isGameFinishedToday(g, puzzleId));
  const incompleteSorted = sortGamesByPlayHistory(incomplete, { puzzleId });
  const completedSorted = [...completed].sort((a, b) => a.name.localeCompare(b.name));
  return [...incompleteSorted, ...completedSorted];
}

function getPersonalizedOrder(games, options) {
  return sortGamesByPlayHistory(games, options);
}

export function getUncompletedGames(currentId, puzzleId) {
  if (!puzzleId) {
    return getOtherGames(currentId);
  }

  return getOtherGames(currentId).filter(game => !isGameFinishedToday(game, puzzleId));
}

export function getUncompletedGamesSorted(currentId, puzzleId) {
  const base = getUncompletedGames(currentId, puzzleId);
  return getPersonalizedOrder(base, { puzzleId });
}

export function getDefaultNextGame(currentId, puzzleId) {
  const sorted = getUncompletedGamesSorted(currentId, puzzleId);
  return sorted.length > 0 ? sorted[0] : null;
}
