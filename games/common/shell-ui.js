import { formatDateForShare, buildShareText, shareWithFallback, showShareFeedback } from './share.js';
import { getUncompletedGames } from './games.js';
import { formatTime } from './utils.js';

export function toggleModal(el, show) {
  if (!el) return;
  if (show) el.classList.add('show');
  else el.classList.remove('show');
}

export async function loadLeaderboard({ container, api, puzzleId, emptyText = 'No scores yet - be the first!', formatTimeFn }) {
  if (!container) return;
  container.innerHTML = '<p class="text-zinc-500 text-center py-6 text-xs">Loading...</p>';
  try {
    const response = await fetch(`${api}?puzzleId=${encodeURIComponent(puzzleId)}`);
    if (!response.ok) throw new Error('Failed to load leaderboard');
    const data = await response.json();
    if (!data.top10 || data.top10.length === 0) {
      container.innerHTML = `<p class="text-zinc-500 text-center py-6 text-xs">${emptyText}</p>`;
      return;
    }
    const fmt = formatTimeFn || formatTime;
    container.innerHTML = data.top10.map((entry, idx) => `
      <div class="leaderboard-row flex items-center justify-between px-3 py-2.5 ${idx < data.top10.length - 1 ? 'border-b border-white/5' : ''}">
        <span>${idx + 1}. ${entry.initials || '???'}</span>
        <span>${fmt(entry.timeMs)}</span>
      </div>
    `).join('');
  } catch (error) {
    container.innerHTML = '<p class="text-zinc-500 text-center py-6 text-xs">Leaderboard unavailable</p>';
  }
}

export async function submitScore({ api, puzzleId, anonId, timeMs, hintsUsed = 0 }) {
  const response = await fetch(api, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ puzzleId, anonId, timeMs, hintsUsed })
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Score submit failed');
  }
  return data;
}

export async function claimInitials({ api, puzzleId, anonId, initials }) {
  const response = await fetch(api, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ puzzleId, anonId, initials })
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Claim failed');
  }
  return data;
}

export function updateNextGamePromo({ gameId, puzzleId, elements }) {
  if (!elements?.nextGamePromo) return;
  const next = getUncompletedGames(gameId, puzzleId)[0];
  if (!next) {
    elements.nextGamePromo.classList.add('hidden');
    return;
  }
  if (elements.nextGameLogo) {
    elements.nextGameLogo.src = next.logo;
    elements.nextGameLogo.alt = next.name;
  }
  if (elements.nextGameText) elements.nextGameText.textContent = next.name;
  if (elements.nextGameLink) elements.nextGameLink.href = next.path;
  elements.nextGamePromo.classList.remove('hidden');
}

export function buildShellShareText({ gameName, puzzleId, gridLabel, shareUrl, timeMs }) {
  return buildShareText({
    gameName,
    puzzleLabel: formatDateForShare(puzzleId),
    gridLabel,
    timeText: formatTime(timeMs || 0),
    shareUrl
  });
}

export async function shareResult({ shareBtn, gameName, puzzleId, gridLabel, shareUrl, timeMs }) {
  const shareText = buildShellShareText({ gameName, puzzleId, gridLabel, shareUrl, timeMs });
  try {
    await shareWithFallback({
      shareTitle: `${gameName} - Daily Grid`,
      shareText,
      shareUrl,
      onCopy: () => showShareFeedback(shareBtn, 'Copied to clipboard!'),
      onError: () => showShareFeedback(shareBtn, 'Unable to share')
    });
  } catch (error) {
    showShareFeedback(shareBtn, 'Unable to share');
  }
}
