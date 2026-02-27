const STORAGE_PREFIX = 'dailygrid_announcement_seen_';

/**
 * "What's New" campaigns.
 *
 * Best practice:
 * - Use ONE campaign for a multi-step release tour
 * - Use a unique `id` per release (never reuse ids)
 * - Add `startsAt`/`endsAt` so old tours expire
 * - Keep pwaOnly=true for app-only announcements
 */
const ANNOUNCEMENT_CAMPAIGNS = [
  {
    id: '2026-03-whats-new-tour-v1',
    title: "What's New",
    pwaOnly: true,
    startsAt: '2026-02-27T00:00:00Z',
    priority: 100,
    steps: [
      {
        title: '3 new game modes',
        body: 'We just added three fresh ways to play. Try Pathways for route planning, Conduit for flow logic, and Perimeter for edge-based puzzle strategy.',
        logos: [
          { src: '/games/pathways/pathways-logo.png', alt: 'Pathways', label: 'Pathways' },
          { src: '/games/conduit/conduit-logo.png', alt: 'Conduit', label: 'Conduit' },
          { src: '/games/perimeter/perimeter-logo.png', alt: 'Perimeter', label: 'Perimeter' }
        ]
      },
      {
        title: 'Streaks are live',
        body: 'Your daily consistency now matters. Build your streak by solving daily puzzles each day, and keep momentum to beat your best run.'
      },
      {
        title: 'New layout + medals improvements',
        body: 'The app layout is cleaner and faster to navigate. Medals are easier to browse, and you can now review previous-day medals and progress more clearly.'
      }
    ]
  }
];

function isStandalonePWA() {
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    window.matchMedia?.('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true
  );
}

function isSeen(id) {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${id}`) === '1';
  } catch {
    return false;
  }
}

function markSeen(id) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${id}`, '1');
  } catch {
    // ignore storage failures
  }
}

function isActiveNow(item, nowMs) {
  const startOk = !item.startsAt || Date.parse(item.startsAt) <= nowMs;
  const endOk = !item.endsAt || Date.parse(item.endsAt) >= nowMs;
  return startOk && endOk;
}

function pickCampaign(context = {}) {
  const nowMs = Date.now();
  const inPwa = isStandalonePWA();

  const candidates = ANNOUNCEMENT_CAMPAIGNS
    .filter((item) => item && item.id && Array.isArray(item.steps) && item.steps.length > 0)
    .filter((item) => isActiveNow(item, nowMs))
    .filter((item) => !item.pwaOnly || inPwa)
    .filter((item) => {
      if (!Array.isArray(item.gameIds) || item.gameIds.length === 0) return true;
      return item.gameIds.includes(context.gameId);
    })
    .filter((item) => !isSeen(item.id));

  candidates.sort((a, b) => {
    const priorityDiff = (b.priority || 0) - (a.priority || 0);
    if (priorityDiff !== 0) return priorityDiff;
    return (Date.parse(b.startsAt || 0) || 0) - (Date.parse(a.startsAt || 0) || 0);
  });

  return candidates[0] || null;
}

function renderLogos(logos = []) {
  if (!logos.length) return '';
  return `
    <div style="display:flex; gap:10px; margin-top:14px; flex-wrap:wrap;">
      ${logos.map((logo) => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);">
          <img src="${logo.src}" alt="${logo.alt || ''}" style="width:22px;height:22px;border-radius:6px;object-fit:cover;"/>
          <span style="font-size:12px;color:rgba(248,250,252,0.88);font-weight:600;">${logo.label || ''}</span>
        </div>
      `).join('')}
    </div>
  `;
}

export function maybeShowAnnouncementModal(context = {}) {
  const campaign = pickCampaign(context);
  if (!campaign) return;

  const steps = campaign.steps;
  let stepIndex = 0;

  const overlay = document.createElement('div');
  overlay.id = 'dg-announcement-modal';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 140;
    background: rgba(6, 8, 15, 0.88);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
  `;

  const card = document.createElement('div');
  card.style.cssText = `
    width: min(92vw, 460px);
    border-radius: 20px;
    background: linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.04));
    border: 1px solid rgba(255,255,255,0.14);
    box-shadow: 0 24px 56px rgba(0,0,0,0.45);
    color: #f8fafc;
    overflow: hidden;
  `;

  card.innerHTML = `
    <div style="padding:14px 16px 10px; display:flex; align-items:center; justify-content:space-between; gap:10px; border-bottom:1px solid rgba(255,255,255,0.08);">
      <div id="dg-announcement-kicker" style="font-size:12px; color:rgba(248,250,252,0.62); text-transform:uppercase; letter-spacing:.08em; font-weight:700;">${campaign.title || "What's New"}</div>
      <button id="dg-announcement-close" aria-label="Dismiss" style="background:none;border:none;color:rgba(248,250,252,0.6);font-size:22px;line-height:1;cursor:pointer;padding:0;">×</button>
    </div>

    <div style="padding:16px;">
      <div id="dg-announcement-progress" style="display:flex;gap:6px;margin-bottom:12px;"></div>
      <h3 id="dg-announcement-title" style="margin:0; font-size:21px; line-height:1.2; font-weight:700;"></h3>
      <p id="dg-announcement-body" style="margin:10px 0 0; font-size:14px; line-height:1.5; color:rgba(248,250,252,0.84);"></p>
      <div id="dg-announcement-logos"></div>
    </div>

    <div style="padding: 0 16px 16px; display:flex; gap:10px; justify-content:space-between; align-items:center;">
      <button id="dg-announcement-prev" style="display:inline-flex;align-items:center;justify-content:center;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);color:#f8fafc;font-size:13px;font-weight:600;cursor:pointer;">Back</button>
      <button id="dg-announcement-next" style="display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border-radius:10px;background:rgba(240,198,116,0.18);border:1px solid rgba(240,198,116,0.35);color:#f0c674;font-size:13px;font-weight:700;cursor:pointer;">Next</button>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const titleEl = card.querySelector('#dg-announcement-title');
  const bodyEl = card.querySelector('#dg-announcement-body');
  const logosEl = card.querySelector('#dg-announcement-logos');
  const progressEl = card.querySelector('#dg-announcement-progress');
  const prevBtn = card.querySelector('#dg-announcement-prev');
  const nextBtn = card.querySelector('#dg-announcement-next');

  const close = (mark = true) => {
    if (mark) markSeen(campaign.id);
    overlay.remove();
  };

  const render = () => {
    const step = steps[stepIndex];
    if (!step) return;

    titleEl.textContent = step.title || '';
    bodyEl.textContent = step.body || '';
    logosEl.innerHTML = renderLogos(step.logos || []);

    progressEl.innerHTML = steps
      .map((_, i) => `
        <span style="height:6px;flex:1;border-radius:999px;background:${i <= stepIndex ? 'rgba(240,198,116,0.8)' : 'rgba(255,255,255,0.14)'}"></span>
      `)
      .join('');

    prevBtn.style.visibility = stepIndex === 0 ? 'hidden' : 'visible';
    nextBtn.textContent = stepIndex >= steps.length - 1 ? 'Done' : 'Next';
  };

  prevBtn?.addEventListener('click', () => {
    if (stepIndex > 0) {
      stepIndex -= 1;
      render();
    }
  });

  nextBtn?.addEventListener('click', () => {
    if (stepIndex < steps.length - 1) {
      stepIndex += 1;
      render();
      return;
    }
    close(true);
  });

  card.querySelector('#dg-announcement-close')?.addEventListener('click', () => close(true));

  // Prevent accidental outside-tap close for multi-step flow.
  // If you want outside dismiss, switch to close(true) here.
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      // no-op by design
    }
  });

  render();
}
