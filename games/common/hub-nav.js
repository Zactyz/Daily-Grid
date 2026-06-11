/**
 * Desktop top navigation for games hub pages (Daily, Practice, Medals, Profile).
 * Mobile continues to use the bottom tab bar.
 *
 * Tab keys: 'daily' | 'practice' | 'medals' | 'profile'
 */

const HUB_LINKS = [
  { key: 'daily', label: 'Daily', href: '/games/' },
  { key: 'practice', label: 'Practice', href: '/games/practice/' },
  { key: 'medals', label: 'Medals', href: '/games/medals/' },
  { key: 'profile', label: 'Profile', href: '/games/profile/' },
];

/**
 * @param {string} activeKey
 */
export function mountHubNav(activeKey) {
  if (document.getElementById('dg-hub-nav')) return;

  document.body.classList.add('dg-hub-nav-page');

  const nav = document.createElement('nav');
  nav.id = 'dg-hub-nav';
  nav.className = 'dg-hub-nav';
  nav.setAttribute('aria-label', 'Games hub');

  const linksHtml = HUB_LINKS.map(({ key, label, href }) => {
    const activeClass = key === activeKey ? 'is-active' : '';
    const current = key === activeKey ? ' aria-current="page"' : '';
    return `<a href="${href}" class="${activeClass}"${current}>${label}</a>`;
  }).join('');

  nav.innerHTML = `
    <a href="/games/" class="dg-hub-nav__brand">
      <img src="/Images/web%20icon.png" alt="" class="dg-hub-nav__logo">
      <span class="dg-hub-nav__title">Daily Grid Games</span>
    </a>
    <div class="dg-hub-nav__links">
      ${linksHtml}
      <a href="/" class="dg-hub-nav__site-link">Home</a>
    </div>`;

  document.body.insertBefore(nav, document.body.firstChild);
}
