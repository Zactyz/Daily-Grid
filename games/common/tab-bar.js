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
    icon: `<svg class="dg-tab-bar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5"/>
      <rect x="14" y="3" width="7" height="7" rx="1.5"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5"/>
      <rect x="14" y="14" width="7" height="7" rx="1.5"/>
    </svg>`,
  },
  {
    key: 'practice',
    label: 'Practice',
    href: '/games/practice/',
    icon: `<svg class="dg-tab-bar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>
      <circle cx="12" cy="12" r="4"/>
    </svg>`,
  },
  {
    key: 'medals',
    label: 'Medals',
    href: '/games/medals/',
    icon: `<svg class="dg-tab-bar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 21h8M12 21v-4"/>
      <circle cx="12" cy="11" r="5"/>
      <path d="M7.5 3l1.5 4h6l1.5-4"/>
    </svg>`,
  },
  {
    key: 'profile',
    label: 'Profile',
    href: '/games/profile/',
    icon: `<svg class="dg-tab-bar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
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
