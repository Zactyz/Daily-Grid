const STORAGE_PREFIX = 'dailygrid_announcement_seen_';
const LAUNCH_COUNT_KEY = 'dailygrid_pwa_launch_count';
const LAUNCH_COUNT_SESSION_KEY = 'dailygrid_pwa_launch_count_recorded';
const STYLE_TAG_ID = 'dg-announcement-styles';

const TAB_ICONS = {
  daily: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/></svg>`,
  practice: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="7" width="3.5" height="10" rx="1.75"/><rect x="5.5" y="10" width="1.5" height="4" rx="0.75"/><rect x="7" y="11" width="10" height="2" rx="1"/><rect x="17" y="10" width="1.5" height="4" rx="0.75"/><rect x="18.5" y="7" width="3.5" height="10" rx="1.75"/></svg>`,
  medals: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="10.5" y="2" width="3" height="4.5" rx="0.75"/><circle cx="12" cy="15" r="7"/></svg>`,
  profile: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="7.5" r="3.5"/><path d="M4 21c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5z"/></svg>`
};

const ANNOUNCEMENT_CAMPAIGNS = [
  {
    id: '2026-03-welcome-tour-v4',
    title: 'Welcome',
    pwaOnly: true,
    startsAt: '2026-02-27T00:00:00Z',
    priority: 220,
    minLaunchCount: 1,
    maxLaunchCount: 2,
    steps: [
      {
        title: 'Welcome to Daily Grid',
        body: 'A quick daily puzzle app: solve today, or jump into practice.',
        visual: 'welcome'
      },
      {
        title: 'One app, all puzzle modes',
        body: 'Daily, Practice, Medals, and Profile live in one flow.',
        visual: 'tabs'
      },
      {
        title: 'Play daily, earn medals',
        body: 'Keep your streak going and track your progress over time.',
        visual: 'streak'
      }
    ]
  },
  {
    id: '2026-03-whats-new-tour-v4',
    title: "What's New",
    pwaOnly: true,
    startsAt: '2026-02-27T00:00:00Z',
    priority: 140,
    minLaunchCount: 3,
    steps: [
      {
        title: '3 new games are live',
        body: 'Polyfit, Conduit, and Perimeter are now part of Daily Grid.',
        visual: 'games',
        logos: [
          { src: '/games/polyfit/polyfit-logo.png', alt: 'Polyfit', label: 'Polyfit' },
          { src: '/games/conduit/conduit-logo.png', alt: 'Conduit', label: 'Conduit' },
          { src: '/games/perimeter/perimeter-logo.png', alt: 'Perimeter', label: 'Perimeter' }
        ]
      },
      {
        title: 'Streaks are live',
        body: 'Your daily consistency now tracks automatically.',
        visual: 'streak'
      },
      {
        title: 'Layout + medals refresh',
        body: 'Cleaner navigation and better previous-day medal review.',
        visual: 'tabs'
      }
    ]
  }
];

function ensureStyles() {
  if (document.getElementById(STYLE_TAG_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_TAG_ID;
  style.textContent = `
    @keyframes dgAnnounceFadeIn { from { opacity: 0; transform: translateY(10px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes dgAnnounceStepIn { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: translateX(0); } }
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

function renderLogos(logos = []) {
  if (!logos.length) return '';
  return `
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:14px;">
      ${logos.map((logo) => `
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 8px;border-radius:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);">
          <img src="${logo.src}" alt="${logo.alt || ''}" style="width:32px;height:32px;border-radius:8px;object-fit:cover;"/>
          <span style="font-size:11px;color:rgba(248,250,252,0.9);font-weight:600;">${logo.label || ''}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderVisual(visual) {
  if (visual === 'tabs') {
    return `
      <div style="margin-top:14px;border:1px solid rgba(255,255,255,0.12);border-radius:14px;overflow:hidden;background:rgba(255,255,255,0.03);">
        <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;padding:10px;border-bottom:1px solid rgba(255,255,255,0.08);">
          ${[
            ['daily', 'Daily'],
            ['practice', 'Practice'],
            ['medals', 'Medals'],
            ['profile', 'Profile']
          ].map(([k, label]) => `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:7px 2px;border-radius:9px;background:rgba(255,255,255,0.05);color:rgba(248,250,252,0.85);"><span style="width:14px;height:14px;display:inline-flex;">${TAB_ICONS[k]}</span><span style="font-size:10px;">${label}</span></div>`).join('')}
        </div>
        <div style="padding:10px 12px;font-size:12px;color:rgba(248,250,252,0.72);line-height:1.45;">Same tab bar, cleaner flow across the app.</div>
      </div>`;
  }
  if (visual === 'streak') {
    return `
      <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div style="padding:11px;border-radius:12px;background:rgba(249,115,22,0.11);border:1px solid rgba(249,115,22,0.30);">
          <div style="font-size:11px;color:rgba(255,255,255,0.66);">Current</div>
          <div style="font-size:22px;font-weight:700;color:#fb923c;line-height:1.1;">7d</div>
        </div>
        <div style="padding:11px;border-radius:12px;background:rgba(240,198,116,0.11);border:1px solid rgba(240,198,116,0.30);">
          <div style="font-size:11px;color:rgba(255,255,255,0.66);">Best</div>
          <div style="font-size:22px;font-weight:700;color:#f0c674;line-height:1.1;">14d</div>
        </div>
      </div>`;
  }
  if (visual === 'games' || visual === 'welcome') {
    return `
      <div style="margin-top:14px;padding:12px;border-radius:12px;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.22);font-size:12px;color:rgba(248,250,252,0.82);line-height:1.45;">
        Designed for quick play sessions with a consistent app UI.
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
  let touchStartX = null;

  const overlay = document.createElement('div');
  overlay.id = 'dg-announcement-modal';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:140;background:radial-gradient(circle at 30% -20%,rgba(240,198,116,.12),transparent 45%),rgba(6,8,15,.9);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);display:flex;align-items:center;justify-content:center;padding:20px 14px;';

  const card = document.createElement('div');
  card.className = 'dg-announcement-card-enter';
  card.style.cssText = 'width:min(94vw,500px);min-height:min(74vh,640px);display:flex;flex-direction:column;border-radius:22px;background:linear-gradient(180deg,rgba(255,255,255,.11),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.16);box-shadow:0 24px 56px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.08);color:#f8fafc;overflow:hidden;';

  card.innerHTML = `
    <div style="padding:15px 16px 12px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.08)">
      <div style="font-size:12px;color:rgba(248,250,252,.66);text-transform:uppercase;letter-spacing:.08em;font-weight:700;">${campaign.title}</div>
      <button id="dg-announcement-close" aria-label="Dismiss" style="background:none;border:none;color:rgba(248,250,252,.62);font-size:24px;line-height:1;cursor:pointer;">×</button>
    </div>

    <div id="dg-announcement-step" style="padding:20px 18px;flex:1;display:flex;flex-direction:column;">
      <div id="dg-announcement-progress" style="display:flex;gap:8px;margin-bottom:18px;"></div>
      <h3 id="dg-announcement-title" style="margin:0;font-size:28px;line-height:1.15;font-weight:700;letter-spacing:-0.02em;"></h3>
      <p id="dg-announcement-body" style="margin:12px 0 0;font-size:17px;line-height:1.4;color:rgba(248,250,252,.88);"></p>
      <div id="dg-announcement-visual" style="margin-top:4px;"></div>
      <div id="dg-announcement-logos"></div>
    </div>

    <div style="padding:14px 18px 18px;display:flex;gap:10px;justify-content:space-between;align-items:center;">
      <button id="dg-announcement-prev" style="padding:12px 16px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);color:#f8fafc;font-size:15px;font-weight:600;cursor:pointer;">Back</button>
      <button id="dg-announcement-next" style="padding:12px 18px;border-radius:12px;background:linear-gradient(160deg,rgba(240,198,116,.24),rgba(240,198,116,.14));border:1px solid rgba(240,198,116,.4);color:#f0c674;font-size:15px;font-weight:700;cursor:pointer;">Next</button>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const stepWrap = card.querySelector('#dg-announcement-step');
  const titleEl = card.querySelector('#dg-announcement-title');
  const bodyEl = card.querySelector('#dg-announcement-body');
  const visualEl = card.querySelector('#dg-announcement-visual');
  const logosEl = card.querySelector('#dg-announcement-logos');
  const progressEl = card.querySelector('#dg-announcement-progress');
  const prevBtn = card.querySelector('#dg-announcement-prev');
  const nextBtn = card.querySelector('#dg-announcement-next');

  const close = () => {
    markSeen(campaign.id);
    overlay.remove();
  };

  const goNext = () => {
    if (stepIndex < steps.length - 1) {
      stepIndex += 1;
      render();
    } else {
      close();
    }
  };

  const goPrev = () => {
    if (stepIndex > 0) {
      stepIndex -= 1;
      render();
    }
  };

  const render = () => {
    const step = steps[stepIndex];
    if (!step) return;

    stepWrap.classList.remove('dg-announcement-step-enter');
    void stepWrap.offsetWidth;
    stepWrap.classList.add('dg-announcement-step-enter');

    titleEl.textContent = step.title || '';
    bodyEl.textContent = step.body || '';
    visualEl.innerHTML = renderVisual(step.visual);
    logosEl.innerHTML = renderLogos(step.logos || []);

    progressEl.innerHTML = steps
      .map((_, i) => `<span style="height:7px;flex:1;border-radius:999px;background:${i <= stepIndex ? 'rgba(240,198,116,.84)' : 'rgba(255,255,255,.16)'}"></span>`)
      .join('');

    prevBtn.style.visibility = stepIndex === 0 ? 'hidden' : 'visible';
    nextBtn.textContent = stepIndex === steps.length - 1 ? 'Done' : 'Next';
  };

  prevBtn?.addEventListener('click', goPrev);
  nextBtn?.addEventListener('click', goNext);
  card.querySelector('#dg-announcement-close')?.addEventListener('click', close);

  card.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches?.[0]?.clientX ?? null;
  }, { passive: true });

  card.addEventListener('touchend', (e) => {
    const endX = e.changedTouches?.[0]?.clientX;
    if (touchStartX == null || endX == null) return;
    const delta = endX - touchStartX;
    if (Math.abs(delta) < 42) return;
    if (delta < 0) goNext();
    else goPrev();
  }, { passive: true });

  overlay.addEventListener('click', (e) => { if (e.target === overlay) { /* no-op */ } });

  render();
}
