import { GAME_META, sortGamesByPlayHistory } from './games.js';
import { getPTDateYYYYMMDD } from './utils.js';

function reorderList(container, ordered) {
  if (!container) return;

  const rank = new Map(ordered.map((game, index) => [game.id, index]));
  const cards = [...container.querySelectorAll('[data-game-id]')];
  if (!cards.length) return;

  container.classList.add('practice-list-reordering');
  cards.sort((a, b) => (rank.get(a.dataset.gameId) ?? 99) - (rank.get(b.dataset.gameId) ?? 99));
  cards.forEach((card) => container.appendChild(card));
  requestAnimationFrame(() => container.classList.remove('practice-list-reordering'));
}

/** Reorder pre-rendered practice cards to match Daily hub play-history order. */
export function initPracticeHub() {
  const puzzleId = getPTDateYYYYMMDD();
  const ordered = sortGamesByPlayHistory([...GAME_META], { puzzleId });
  reorderList(document.getElementById('practice-game-list'), ordered);
  reorderList(document.getElementById('desktop-practice-list'), ordered);
}
