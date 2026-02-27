const STORAGE_PREFIX = 'dailygrid_announcement_seen_';

/**
 * Add announcements here.
 *
 * Best practice:
 * - bump `id` for each new message (never reuse an id)
 * - use `startsAt` / `endsAt` for scheduled campaigns
 * - keep `pwaOnly: true` for app-only notices
 */
const ANNOUNCEMENTS = [
  {
    id: '2026-02-pwa-announcement-system',
    title: 'Daily Grid update',
    body: 'We now support in-app announcements. You will only see each message once.',
    dismissLabel: 'Got it',
    pwaOnly: true,
    startsAt: '2026-02-27T00:00:00Z',
    priority: 1
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

function pickAnnouncement(context = {}) {
  const nowMs = Date.now();
  const inPwa = isStandalonePWA();

  const candidates = ANNOUNCEMENTS
    .filter((item) => item && item.id && item.title && item.body)
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

function closeModal(overlay) {
  overlay?.remove();
}

export function maybeShowAnnouncementModal(context = {}) {
  const announcement = pickAnnouncement(context);
  if (!announcement) return;

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
    width: min(92vw, 420px);
    border-radius: 18px;
    background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
    border: 1px solid rgba(255,255,255,0.14);
    box-shadow: 0 24px 56px rgba(0,0,0,0.45);
    color: #f8fafc;
    overflow: hidden;
  `;

  const dismissText = announcement.dismissLabel || 'Dismiss';
  const ctaText = announcement.ctaLabel;
  const ctaUrl = announcement.ctaUrl;

  card.innerHTML = `
    <div style="padding: 16px 16px 10px; display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
      <div style="font-size:13px; color:rgba(248,250,252,0.55); text-transform:uppercase; letter-spacing:.08em; font-weight:600;">Announcement</div>
      <button id="dg-announcement-close" aria-label="Dismiss" style="background:none;border:none;color:rgba(248,250,252,0.6);font-size:22px;line-height:1;cursor:pointer;padding:0;">×</button>
    </div>
    <div style="padding: 0 16px 8px;">
      <h3 style="margin:0; font-size:20px; line-height:1.2; font-weight:700;">${announcement.title}</h3>
      <p style="margin:10px 0 0; font-size:14px; line-height:1.45; color:rgba(248,250,252,0.82);">${announcement.body}</p>
    </div>
    <div style="padding: 14px 16px 16px; display:flex; gap:10px; justify-content:flex-end;">
      ${ctaText && ctaUrl ? `<a id="dg-announcement-cta" href="${ctaUrl}" style="display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border-radius:10px;background:rgba(240,198,116,0.18);border:1px solid rgba(240,198,116,0.35);color:#f0c674;text-decoration:none;font-size:13px;font-weight:600;">${ctaText}</a>` : ''}
      <button id="dg-announcement-dismiss" style="display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border-radius:10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#f8fafc;font-size:13px;font-weight:600;cursor:pointer;">${dismissText}</button>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const dismiss = () => {
    markSeen(announcement.id);
    closeModal(overlay);
  };

  overlay.querySelector('#dg-announcement-close')?.addEventListener('click', dismiss);
  overlay.querySelector('#dg-announcement-dismiss')?.addEventListener('click', dismiss);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) dismiss();
  });

  const ctaEl = overlay.querySelector('#dg-announcement-cta');
  if (ctaEl) {
    ctaEl.addEventListener('click', () => {
      markSeen(announcement.id);
      closeModal(overlay);
    });
  }
}
