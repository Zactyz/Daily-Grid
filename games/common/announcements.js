const STORAGE_PREFIX = 'dailygrid_announcement_seen_';
const LAUNCH_COUNT_KEY = 'dailygrid_pwa_launch_count';
const LAUNCH_COUNT_SESSION_KEY = 'dailygrid_pwa_launch_count_recorded';
const STYLE_TAG_ID = 'dg-announcement-styles';

const ANNOUNCEMENT_CAMPAIGNS = [
  {
    id: '2026-03-welcome-tour-v3',
    title: 'Welcome to Daily Grid',
    pwaOnly: true,
    startsAt: '2026-02-27T00:00:00Z',
    priority: 220,
    minLaunchCount: 1,
    maxLaunchCount: 2,
    steps: [
      {
        icon: 'welcome',
        visual: 'welcome',
        title: 'Daily puzzles, fast',
        body: 'One fresh puzzle per game every day. Clean, quick, and made for your daily routine.',
        points: ['Daily + practice modes', 'Built for phone-first play', 'Progress saved automatically']
      },
      {
        icon: 'games',
        visual: 'modes',
        title: 'Pick a game, keep your flow',
        body: 'Jump between puzzle types in the same app shell — same controls, same feel.',
        points: ['Consistent UI across games', 'Practice anytime', 'Easy mode switching']
      },
      {
        icon: 'routine',
        visual: 'streaks',
        title: 'Progress that compounds',
        body: 'Solve daily to build streaks and unlock medals. Miss a day and restart your run.',
        points: ['Current + best streak', 'Daily habit loop', 'Medals reward consistency']
      }
    ]
  },
  {
    id: '2026-03-whats-new-tour-v3',
    title: "What's New",
    pwaOnly: true,
    startsAt: '2026-02-27T00:00:00Z',
    priority: 140,
    minLaunchCount: 3,
    steps: [
      {
        icon: 'spark',
        visual: 'modes',
        title: '3 new game modes',
        body: 'Pathways, Conduit, and Perimeter are now live. Three puzzle styles, same Daily Grid polish.',
        logos: [
          { src: '/games/pathways/pathways-logo.png', alt: 'Pathways', label: 'Pathways' },
          { src: '/games/conduit/conduit-logo.png', alt: 'Conduit', label: 'Conduit' },
          { src: '/games/perimeter/perimeter-logo.png', alt: 'Perimeter', label: 'Perimeter' }
        ],
        points: ['Route planning', 'Flow logic', 'Edge strategy']
      },
      {
        icon: 'streak',
        visual: 'streaks',
        title: 'Streaks are now live',
        body: 'Consistency now counts. Keep solving daily to push your best run higher.',
        points: ['Current + best tracking', 'Momentum over time', 'Great for habit building']
      },
      {
        icon: 'medal',
        visual: 'layout',
        title: 'Layout + medals refresh',
        body: 'Cleaner navigation, smoother medals browsing, and easier previous-day medal review.',
        points: ['Better tab flow', 'Cleaner medals page', 'Past-day medal visibility']
      }
    ]
  }
];

function ensureStyles() {
  if (document.getElementById(STYLE_TAG_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_TAG_ID;
  style.textContent = `
    @keyframes dgAnnounceFadeIn {
      from { opacity: 0; transform: translateY(10px) scale(.985); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes dgAnnounceStepIn {
      from { opacity: 0; transform: translateX(14px); }
      to { opacity: 1; transform: translateX(0); }
    }
    .dg-announcement-card-enter { animation: dgAnnounceFadeIn 240ms cubic-bezier(.22,.61,.36,1); }
    .dg-announcement-step-enter { animation: dgAnnounceStepIn 220ms cubic-bezier(.22,.61,.36,1); }
  `;
  document.head.appendChild(style);
}

function isStandalonePWA() {
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    window.matchMedia?.('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true
  );
}

function isSeen(id) {
  try { return localStorage.getItem(`${STORAGE_PREFIX}${id}`) === '1'; } catch { return false; }
}

function markSeen(id) {
  try { localStorage.setItem(`${STORAGE_PREFIX}${id}`, '1'); } catch {}
}

function getAndRecordLaunchCount() {
  try {
    if (!sessionStorage.getItem(LAUNCH_COUNT_SESSION_KEY)) {
      const current = Number(localStorage.getItem(LAUNCH_COUNT_KEY) || '0');
      const next = Number.isFinite(current) ? current + 1 : 1;
      localStorage.setItem(LAUNCH_COUNT_KEY, String(next));
      sessionStorage.setItem(LAUNCH_COUNT_SESSION_KEY, '1');
      return next;
    }
    const existing = Number(localStorage.getItem(LAUNCH_COUNT_KEY) || '1');
    return Number.isFinite(existing) && existing > 0 ? existing : 1;
  } catch {
    return 1;
  }
}

function isActiveNow(item, nowMs) {
  return (!item.startsAt || Date.parse(item.startsAt) <= nowMs) && (!item.endsAt || Date.parse(item.endsAt) >= nowMs);
}

function pickCampaign(context = {}) {
  const nowMs = Date.now();
  const launchCount = getAndRecordLaunchCount();

  const candidates = ANNOUNCEMENT_CAMPAIGNS
    .filter((item) => item && item.id && Array.isArray(item.steps) && item.steps.length)
    .filter((item) => isActiveNow(item, nowMs))
    .filter((item) => !item.pwaOnly || isStandalonePWA())
    .filter((item) => !Number.isFinite(item.minLaunchCount) || launchCount >= item.minLaunchCount)
    .filter((item) => !Number.isFinite(item.maxLaunchCount) || launchCount <= item.maxLaunchCount)
    .filter((item) => !Array.isArray(item.gameIds) || !item.gameIds.length || item.gameIds.includes(context.gameId))
    .filter((item) => !isSeen(item.id));

  candidates.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  return candidates[0] || null;
}

function getIconSvg(kind = 'spark') {
  const common = 'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';
  const map = {
    welcome: `<path ${common} d="M4 12h16M12 4v16"/><circle cx="12" cy="12" r="9" ${common}/>` ,
    games: `<rect x="4" y="5" width="16" height="14" rx="3" ${common}/><path ${common} d="M9 12h.01M15 12h.01M12 9v6"/>`,
    routine: `<circle cx="12" cy="12" r="8" ${common}/><path ${common} d="M12 8v5l3 2"/>`,
    spark: `<path ${common} d="M12 3l2.4 4.8L19 10l-4.6 2.2L12 17l-2.4-4.8L5 10l4.6-2.2z"/>`,
    streak: `<path ${common} d="M12 3c0 4-4 5-4 9a4 4 0 0 0 8 0c0-4-4-5-4-9z"/><path ${common} d="M10 18h4"/>`,
    medal: `<circle cx="12" cy="10" r="4" ${common}/><path ${common} d="M8 14l-2 6 4-2 2 2 2-2 4 2-2-6"/>`
  };
  return map[kind] || map.spark;
}

function renderLogos(logos = []) {
  if (!logos.length) return '';
  return `
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px;">
      ${logos.map((logo) => `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:10px 8px;border-radius:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);">
          <img src="${logo.src}" alt="${logo.alt || ''}" style="width:28px;height:28px;border-radius:8px;object-fit:cover;"/>
          <span style="font-size:11px;color:rgba(248,250,252,0.88);font-weight:600;">${logo.label || ''}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderPoints(points = []) {
  if (!points.length) return '';
  return `
    <div style="margin-top:12px;display:flex;flex-direction:column;gap:7px;">
      ${points.map((p) => `
        <div style="display:flex;align-items:center;gap:8px;color:rgba(248,250,252,0.80);font-size:13px;">
          <span style="width:6px;height:6px;border-radius:999px;background:rgba(240,198,116,0.9);"></span>
          <span>${p}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderVisualPanel(visual) {
  if (visual === 'layout') {
    return `
      <div style="margin-top:12px;border:1px solid rgba(255,255,255,0.12);border-radius:14px;overflow:hidden;background:linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02));">
        <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:10px;border-bottom:1px solid rgba(255,255,255,0.08);">
          ${['Daily','Practice','Medals','Profile'].map((t) => `<span style="text-align:center;font-size:11px;padding:7px 0;border-radius:8px;background:rgba(255,255,255,0.05);">${t}</span>`).join('')}
        </div>
        <div style="padding:10px 12px;font-size:12px;color:rgba(248,250,252,0.74);line-height:1.45;">Navigation and medals now share a cleaner, faster app shell.</div>
      </div>`;
  }
  if (visual === 'streaks') {
    return `
      <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div style="padding:10px;border-radius:12px;background:linear-gradient(160deg,rgba(249,115,22,0.16),rgba(249,115,22,0.08));border:1px solid rgba(249,115,22,0.35);">
          <div style="font-size:11px;color:rgba(255,255,255,0.65);">Current</div>
          <div style="font-size:20px;font-weight:700;color:#fb923c;line-height:1.2;">7d</div>
        </div>
        <div style="padding:10px;border-radius:12px;background:linear-gradient(160deg,rgba(240,198,116,0.16),rgba(240,198,116,0.08));border:1px solid rgba(240,198,116,0.35);">
          <div style="font-size:11px;color:rgba(255,255,255,0.65);">Best</div>
          <div style="font-size:20px;font-weight:700;color:#f0c674;line-height:1.2;">14d</div>
        </div>
      </div>`;
  }
  if (visual === 'modes') {
    return `
      <div style="margin-top:12px;border-radius:12px;padding:10px 12px;background:linear-gradient(160deg,rgba(99,102,241,0.12),rgba(99,102,241,0.04));border:1px solid rgba(99,102,241,0.24);font-size:12px;color:rgba(248,250,252,0.82);line-height:1.45;">
        Daily challenge + unlimited practice, with one consistent interface across games.
      </div>`;
  }
  if (visual === 'welcome') {
    return `
      <div style="margin-top:12px;border-radius:12px;padding:10px 12px;background:linear-gradient(160deg,rgba(240,198,116,0.14),rgba(240,198,116,0.04));border:1px solid rgba(240,198,116,0.24);font-size:12px;color:rgba(248,250,252,0.82);line-height:1.45;">
        Open Daily Grid, solve a few puzzles, and keep your momentum going in under 5 minutes.
      </div>`;
  }
  return '';
}

export function maybeShowAnnouncementModal(context = {}) {
  const campaign = pickCampaign(context);
  if (!campaign) return;
  ensureStyles();

  let stepIndex = 0;
  const steps = campaign.steps;

  const overlay = document.createElement('div');
  overlay.id = 'dg-announcement-modal';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:140;background:radial-gradient(circle at 30% -20%,rgba(240,198,116,.12),transparent 45%),rgba(6,8,15,.9);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);display:flex;align-items:center;justify-content:center;padding:24px 16px;';

  const card = document.createElement('div');
  card.className = 'dg-announcement-card-enter';
  card.style.cssText = 'width:min(92vw,470px);border-radius:22px;background:linear-gradient(180deg,rgba(255,255,255,.11),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.16);box-shadow:0 24px 56px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.08);color:#f8fafc;overflow:hidden;';
  card.innerHTML = `
    <div style="padding:14px 16px 10px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.08)">
      <div style="font-size:12px;color:rgba(248,250,252,.66);text-transform:uppercase;letter-spacing:.08em;font-weight:700;">${campaign.title}</div>
      <button id="dg-announcement-close" aria-label="Dismiss" style="background:none;border:none;color:rgba(248,250,252,.62);font-size:22px;line-height:1;cursor:pointer;">×</button>
    </div>
    <div id="dg-announcement-step" style="padding:16px;">
      <div id="dg-announcement-progress" style="display:flex;gap:6px;margin-bottom:12px;"></div>
      <div style="display:flex;align-items:center;gap:10px;">
        <div id="dg-announcement-icon" style="width:38px;height:38px;border-radius:12px;background:linear-gradient(160deg,rgba(240,198,116,.22),rgba(240,198,116,.08));border:1px solid rgba(240,198,116,.28);color:#f0c674;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(240,198,116,.14);"></div>
        <h3 id="dg-announcement-title" style="margin:0;font-size:22px;line-height:1.2;font-weight:700;"></h3>
      </div>
      <p id="dg-announcement-body" style="margin:10px 0 0;font-size:15px;line-height:1.45;color:rgba(248,250,252,.88);"></p>
      <div id="dg-announcement-visual"></div>
      <div id="dg-announcement-points"></div>
      <div id="dg-announcement-logos"></div>
    </div>
    <div style="padding:0 16px 16px;display:flex;gap:8px;justify-content:space-between;align-items:center;">
      <button id="dg-announcement-prev" style="padding:10px 14px;border-radius:11px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);color:#f8fafc;font-size:14px;font-weight:600;cursor:pointer;">Back</button>
      <button id="dg-announcement-next" style="padding:10px 16px;border-radius:11px;background:linear-gradient(160deg,rgba(240,198,116,.24),rgba(240,198,116,.14));border:1px solid rgba(240,198,116,.4);color:#f0c674;font-size:14px;font-weight:700;cursor:pointer;">Next</button>
    </div>`;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const stepWrap = card.querySelector('#dg-announcement-step');
  const iconEl = card.querySelector('#dg-announcement-icon');
  const titleEl = card.querySelector('#dg-announcement-title');
  const bodyEl = card.querySelector('#dg-announcement-body');
  const visualEl = card.querySelector('#dg-announcement-visual');
  const pointsEl = card.querySelector('#dg-announcement-points');
  const logosEl = card.querySelector('#dg-announcement-logos');
  const progressEl = card.querySelector('#dg-announcement-progress');
  const prevBtn = card.querySelector('#dg-announcement-prev');
  const nextBtn = card.querySelector('#dg-announcement-next');

  const close = () => {
    markSeen(campaign.id);
    overlay.remove();
  };

  const render = () => {
    const step = steps[stepIndex];
    if (!step) return;

    stepWrap.classList.remove('dg-announcement-step-enter');
    void stepWrap.offsetWidth;
    stepWrap.classList.add('dg-announcement-step-enter');

    iconEl.innerHTML = `<svg width="19" height="19" viewBox="0 0 24 24">${getIconSvg(step.icon)}</svg>`;
    titleEl.textContent = step.title || '';
    bodyEl.textContent = step.body || '';
    visualEl.innerHTML = renderVisualPanel(step.visual);
    pointsEl.innerHTML = renderPoints(step.points || []);
    logosEl.innerHTML = renderLogos(step.logos || []);

    progressEl.innerHTML = steps.map((_, i) => `<span style="height:6px;flex:1;border-radius:999px;background:${i <= stepIndex ? 'rgba(240,198,116,.84)' : 'rgba(255,255,255,.16)'}"></span>`).join('');
    prevBtn.style.visibility = stepIndex === 0 ? 'hidden' : 'visible';
    nextBtn.textContent = stepIndex === steps.length - 1 ? 'Done' : 'Next';
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
    close();
  });

  card.querySelector('#dg-announcement-close')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { /* no-op */ } });

  render();
}
