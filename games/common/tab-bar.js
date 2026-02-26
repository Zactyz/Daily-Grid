/**
 * Liquid Glass Tab Bar
 *
 * Renders the fixed bottom navigation bar on hub pages (Daily, Practice, Medals, Profile).
 * Mount by calling mountTabBar() once per page. Pass the tab key for this page.
 *
 * Tab keys: 'daily' | 'practice' | 'medals' | 'profile'
 */

const TABS = [
  {
    key: 'daily',
    label: 'Daily',
    href: '/games/',
    icon: `<svg class="dg-tab-bar__icon" viewBox="0 0 24 24" fill="currentColor">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/>
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/>
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/>
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>
    </svg>`,
  },
  {
    key: 'practice',
    label: 'Practice',
    href: '/games/practice/',
    icon: `<svg class="dg-tab-bar__icon" viewBox="0 0 24 24" fill="currentColor">
      <rect x="2" y="7" width="3.5" height="10" rx="1.75"/>
      <rect x="5.5" y="10" width="1.5" height="4" rx="0.75"/>
      <rect x="7" y="11" width="10" height="2" rx="1"/>
      <rect x="17" y="10" width="1.5" height="4" rx="0.75"/>
      <rect x="18.5" y="7" width="3.5" height="10" rx="1.75"/>
    </svg>`,
  },
  {
    key: 'medals',
    label: 'Medals',
    href: '/games/medals/',
    icon: `<svg class="dg-tab-bar__icon" viewBox="0 0 24 24" fill="currentColor">
      <rect x="2" y="12" width="6" height="9.5" rx="1.5"/>
      <rect x="9" y="7" width="6" height="14.5" rx="1.5"/>
      <rect x="16" y="15" width="6" height="6.5" rx="1.5"/>
    </svg>`,
  },
  {
    key: 'profile',
    label: 'Profile',
    href: '/games/profile/',
    icon: `<svg class="dg-tab-bar__icon" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="7.5" r="3.5"/>
      <path d="M4 21c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5z"/>
    </svg>`,
  },
];

/**
 * Mount the liquid glass tab bar.
 * @param {string} activeKey - Which tab is currently active
 * @param {Object} [opts]
 * @param {number} [opts.profileMedalCount] - Number to show as badge on medals tab
 */
export function mountTabBar(activeKey, opts = {}) {
  // Always apply page padding (CSS media query removes it on desktop)
  document.documentElement.classList.add('dg-tab-bar-active');
  const main = document.querySelector('main, .tab-page-content, #page-content');
  (main || document.body).classList.add('dg-tab-bar-page-padding');

  const existing = document.getElementById('dg-tab-bar');
  if (existing) {
    // Bar already in HTML — just update active state (no layout jump)
    document.querySelectorAll('.dg-tab-bar__tab').forEach(li => {
      li.classList.toggle('active', li.dataset.tab === activeKey);
      const a = li.querySelector('a');
      if (a) a.setAttribute('aria-current', li.dataset.tab === activeKey ? 'page' : null);
    });
    return;
  }

  const bar = document.createElement('nav');
  bar.id = 'dg-tab-bar';
  bar.className = 'dg-tab-bar';
  bar.setAttribute('aria-label', 'Main navigation');

  const list = document.createElement('ul');
  list.className = 'dg-tab-bar__list';

  TABS.forEach(({ key, label, href, icon }) => {
    const li = document.createElement('li');
    li.className = `dg-tab-bar__tab${key === activeKey ? ' active' : ''}`;
    li.dataset.tab = key;

    const badge = (key === 'medals' && opts.profileMedalCount)
      ? `<span class="dg-tab-bar__badge">${opts.profileMedalCount}</span>`
      : '';

    li.innerHTML = `
      <a href="${href}" aria-label="${label}" ${key === activeKey ? 'aria-current="page"' : ''}>
        ${badge}
        ${icon}
        <span class="dg-tab-bar__label">${label}</span>
      </a>`;

    list.appendChild(li);
  });

  bar.appendChild(list);
  document.body.appendChild(bar);
}
