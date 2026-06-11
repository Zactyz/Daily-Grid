import { GAME_META, sortGamesByPlayHistory } from './games.js';
import { getPTDateYYYYMMDD } from './utils.js';

const PRACTICE_ARROW = `<svg class="w-4 h-4 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>`;

function practiceCardHtml(game) {
  return `<a href="${game.path}?practice=1" class="app-card hub-practice-card rounded-2xl p-4 flex items-center gap-3">
    <div class="practice-card-logo-wrap shrink-0">
      <img src="${game.logo}" alt="${game.name}" class="w-12 h-12 rounded-xl practice-card-logo">
    </div>
    <div class="flex-1 min-w-0 practice-card-body">
      <p class="font-semibold practice-card-title">${game.name}</p>
      <p class="text-xs text-slate-400 practice-card-tagline">${game.tagline}</p>
    </div>
    <span class="text-amber-300 text-sm font-semibold practice-cta shrink-0 inline-flex items-center gap-1.5">Practice ${PRACTICE_ARROW}</span>
  </a>`;
}

export function renderPracticeGameList(container) {
  if (!container) return;

  const puzzleId = getPTDateYYYYMMDD();
  const ordered = sortGamesByPlayHistory([...GAME_META], { puzzleId });
  container.innerHTML = ordered.map(practiceCardHtml).join('');
}
