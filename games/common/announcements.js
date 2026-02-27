const STORAGE_PREFIX = 'dailygrid_announcement_seen_';
const SNOOZE_PREFIX = 'dailygrid_announcement_snooze_until_';
const LAUNCH_COUNT_KEY = 'dailygrid_pwa_launch_count';
const LAUNCH_COUNT_SESSION_KEY = 'dailygrid_pwa_launch_count_recorded';
const STYLE_TAG_ID = 'dg-announcement-styles';

const ANNOUNCEMENT_CAMPAIGNS = [
  {
    id: '2026-03-welcome-tour-v1',
    title: 'Welcome to Daily Grid',
    pwaOnly: true,
    startsAt: '2026-02-27T00:00:00Z',
    priority: 200,
    minLaunchCount: 1,
    maxLaunchCount: 2,
    snoozeHours: 12,
    steps: [
      {
        icon: 'welcome',
        title: 'Welcome 👋',
        body: 'Daily Grid is your home for quick daily logic puzzles. Each game has one daily challenge and unlimited practice mode.'
      },
      {
        icon: 'games',
        title: 'How the games work',
        body: 'Solve today\'s puzzle to track streaks and earn medals. Practice mode lets you warm up without affecting your daily stats.'
      },
      {
        icon: 'routine',
        title: 'Make it part of your routine',
        body: 'Open once a day, solve a few favorites, and watch your streak and medal collection grow over time.'
      }
    ]
  },
  {
    id: '2026-03-whats-new-tour-v1',
    title: "What's New",
    pwaOnly: true,
    startsAt: '2026-02-27T00:00:00Z',
    priority: 100,
    minLaunchCount: 3,
    snoozeHours: 12,
    steps: [
      {
        icon: 'spark',
        title: '3 new game modes',
        body: 'We just added three fresh ways to play. Try Pathways for route planning, Conduit for flow logic, and Perimeter for edge-based puzzle strategy.',
        logos: [
          { src: '/games/pathways/pathways-logo.png', alt: 'Pathways', label: 'Pathways' },
          { src: '/games/conduit/conduit-logo.png', alt: 'Conduit', label: 'Conduit' },
          { src: '/games/perimeter/perimeter-logo.png', alt: 'Perimeter', label: 'Perimeter' }
        ]
      },
      {
        icon: 'streak',
        title: 'Streaks are live',
        body: 'Your daily consistency now matters. Build your streak by solving daily puzzles each day, and keep momentum to beat your best run.'
      },
      {
        icon: 'medal',
        title: 'New layout + medals improvements',
        body: 'The app layout is cleaner and faster to navigate. Medals are easier to browse, and you can now review previous-day medals and progress more clearly.'
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
      from { opacity: 0; transform: translateY(8px) scale(.985); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes dgAnnounceStepIn {
      from { opacity: 0; transform: translateX(12px); }
      to { opacity: 1; transform: translateX(0); }
    }
    .dg-announcement-card-enter { animation: dgAnnounceFadeIn 220ms ease-out; }
    .dg-announcement-step-enter { animation: dgAnnounceStepIn 200ms ease-out; }
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

function getSnoozeUntil(id) {
  try {
    return Number(localStorage.getItem(`${SNOOZE_PREFIX}${id}`) || '0');
  } catch {
    return 0;
  }
}

function setSnooze(id, hours = 12) {
  try {
    const ms = Math.max(1, hours) * 60 * 60 * 1000;
    localStorage.setItem(`${SNOOZE_PREFIX}${id}`, String(Date.now() + ms));
  } catch {
    // ignore
  }
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
  const startOk = !item.startsAt || Date.parse(item.startsAt) <= nowMs;
  const endOk = !item.endsAt || Date.parse(item.endsAt) >= nowMs;
  return startOk && endOk;
}

function pickCampaign(context = {}) {
  const nowMs = Date.now();
  const inPwa = isStandalonePWA();
  const launchCount = getAndRecordLaunchCount();

  const candidates = ANNOUNCEMENT_CAMPAIGNS
    .filter((item) => item && item.id && Array.isArray(item.steps) && item.steps.length > 0)
    .filter((item) => isActiveNow(item, nowMs))
    .filter((item) => !item.pwaOnly || inPwa)
    .filter((item) => {
      const snoozeUntil = getSnoozeUntil(item.id);
      return !Number.isFinite(snoozeUntil) || nowMs >= snoozeUntil;
    })
    .filter((item) => {
      if (!Number.isFinite(item.minLaunchCount)) return true;
      return launchCount >= item.minLaunchCount;
    })
    .filter((item) => {
      if (!Number.isFinite(item.maxLaunchCount)) return true;
      return launchCount <= item.maxLaunchCount;
    })
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

function getIconSvg(kind = 'spark') {
  const common = 'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';
  const map = {
    welcome: `<path ${common} d="M4 12h16M12 4v16"/><circle cx="12" cy="12" r="9" ${common}/>`,
    games: `<rect x="4" y="5" width="16" height="14" rx="3" ${common}/><path ${common} d="M9 12h.01M15 12h.01M12 9v6"/>`,
    routine: `<circle cx="12" cy="12" r="8" ${common}/><path ${common} d="M12 8v5l3 2"/>`,
    spark: `<path ${common} d="M12 3l2.4 4.8L19 10l-4.6 2.2L12 17l-2.4-4.8L5 10l4.6-2.2z"/>`,
    streak: `<path ${common} d="M12 3c0 4-4 5-4 9a4 4 0 0 0 8 0c0-4-4-5-4-9z"/><path ${common} d="M10 18h4"/>`,
    medal: `<circle cx="12" cy="10" r="4" ${common}/><path ${common} d="M8 14l-2 6 4-2 2 2 2-2 4 2-2-6"/>`
  };
  return map[kind] || map.spark;
}

export function maybeShowAnnouncementModal(context = {}) {
  const campaign = pickCampaign(context);
  if (!campaign) return;
  ensureStyles();

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
  card.className = 'dg-announcement-card-enter';
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
      <div style="font-size:12px; color:rgba(248,250,252,0.62); text-transform:uppercase; letter-spacing:.08em; font-weight:700;">${campaign.title || "What's New"}</div>
      <button id="dg-announcement-close" aria-label="Dismiss" style="background:none;border:none;color:rgba(248,250,252,0.6);font-size:22px;line-height:1;cursor:pointer;padding:0;">×</button>
    </div>

    <div id="dg-announcement-step" style="padding:16px;">
      <div id="dg-announcement-progress" style="display:flex;gap:6px;margin-bottom:12px;"></div>
      <div style="display:flex;align-items:center;gap:10px;">
        <div id="dg-announcement-icon" style="width:32px;height:32px;border-radius:10px;background:rgba(240,198,116,0.12);color:#f0c674;display:flex;align-items:center;justify-content:center;"></div>
        <h3 id="dg-announcement-title" style="margin:0; font-size:21px; line-height:1.2; font-weight:700;"></h3>
      </div>
      <p id="dg-announcement-body" style="margin:10px 0 0; font-size:14px; line-height:1.5; color:rgba(248,250,252,0.84);"></p>
      <div id="dg-announcement-logos"></div>
    </div>

    <div style="padding: 0 16px 16px; display:flex; gap:8px; justify-content:space-between; align-items:center; flex-wrap:wrap;">
      <div style="display:flex; gap:8px;">
        <button id="dg-announcement-prev" style="display:inline-flex;align-items:center;justify-content:center;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);color:#f8fafc;font-size:13px;font-weight:600;cursor:pointer;">Back</button>
        <button id="dg-announcement-later" style="display:inline-flex;align-items:center;justify-content:center;padding:10px 12px;border-radius:10px;background:transparent;border:1px solid rgba(255,255,255,0.16);color:rgba(248,250,252,0.82);font-size:13px;font-weight:600;cursor:pointer;">Remind me later</button>
      </div>
      <button id="dg-announcement-next" style="display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border-radius:10px;background:rgba(240,198,116,0.18);border:1px solid rgba(240,198,116,0.35);color:#f0c674;font-size:13px;font-weight:700;cursor:pointer;">Next</button>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const stepWrap = card.querySelector('#dg-announcement-step');
  const iconEl = card.querySelector('#dg-announcement-icon');
  const titleEl = card.querySelector('#dg-announcement-title');
  const bodyEl = card.querySelector('#dg-announcement-body');
  const logosEl = card.querySelector('#dg-announcement-logos');
  const progressEl = card.querySelector('#dg-announcement-progress');
  const prevBtn = card.querySelector('#dg-announcement-prev');
  const nextBtn = card.querySelector('#dg-announcement-next');
  const laterBtn = card.querySelector('#dg-announcement-later');

  const close = (mark = true) => {
    if (mark) markSeen(campaign.id);
    overlay.remove();
  };

  const render = () => {
    const step = steps[stepIndex];
    if (!step) return;

    stepWrap.classList.remove('dg-announcement-step-enter');
    void stepWrap.offsetWidth;
    stepWrap.classList.add('dg-announcement-step-enter');

    iconEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24">${getIconSvg(step.icon)}</svg>`;
    titleEl.textContent = step.title || '';
    bodyEl.textContent = step.body || '';
    logosEl.innerHTML = renderLogos(step.logos || []);

    progressEl.innerHTML = steps.map((_, i) => `
      <span style="height:6px;flex:1;border-radius:999px;background:${i <= stepIndex ? 'rgba(240,198,116,0.8)' : 'rgba(255,255,255,0.14)'}"></span>
    `).join('');

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

  laterBtn?.addEventListener('click', () => {
    setSnooze(campaign.id, campaign.snoozeHours || 12);
    close(false);
  });

  card.querySelector('#dg-announcement-close')?.addEventListener('click', () => close(true));

  // Prevent accidental outside-tap close for multi-step flow.
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      // no-op by design
    }
  });

  render();
}
