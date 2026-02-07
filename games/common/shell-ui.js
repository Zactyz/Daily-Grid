import { formatDateForShare, buildShareText, shareWithFallback, showShareFeedback } from './share.js';
import { getUncompletedGamesSorted } from './games.js';
import { formatTime } from './utils.js';

export function toggleModal(el, show) {
  if (!el) return;
  if (show) el.classList.add('show');
  else el.classList.remove('show');
}

export async function loadLeaderboard({
  container,
  api,
  puzzleId,
  emptyText = 'No scores yet - be the first!',
  formatTimeFn,
  playerEntry
}) {
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
    const topEntries = data.top10.slice(0, 5);
    const rows = [];
    topEntries.forEach((entry, idx) => {
      const rank = Number.isFinite(entry.rank) ? entry.rank : idx + 1;
      const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : '';
      rows.push({
        type: 'entry',
        rank,
        initials: entry.initials || '???',
        timeMs: entry.timeMs,
        rankClass
      });
    });

    const showPlayer = playerEntry
      && Number.isFinite(playerEntry.rank)
      && playerEntry.rank > topEntries.length;

    if (showPlayer) {
      rows.push({ type: 'ellipsis' });
      rows.push({
        type: 'entry',
        rank: playerEntry.rank,
        initials: playerEntry.initials || '???',
        timeMs: playerEntry.timeMs,
        rankClass: ''
      });
    }

    container.innerHTML = rows.map((row, idx) => {
      const border = idx < rows.length - 1 ? 'border-b border-white/5' : '';
      if (row.type === 'ellipsis') {
        return `
          <div class="leaderboard-row leaderboard-ellipsis flex items-center px-3 py-2.5 ${border}">
            <span>…</span>
          </div>
        `;
      }
      const timeText = Number.isFinite(row.timeMs) ? fmt(row.timeMs) : '—';
      return `
        <div class="leaderboard-row flex items-center justify-between px-3 py-2.5 ${border}">
          <span class="leaderboard-name ${row.rankClass}">${row.rank}. ${row.initials}</span>
          <span class="leaderboard-time">${timeText}</span>
        </div>
      `;
    }).join('');
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
  const next = getUncompletedGamesSorted(gameId, puzzleId)[0];
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
