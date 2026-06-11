import {
  shouldShowAccountPromo,
  hasSeenAccountIntro,
  markAccountIntroSeen,
  openAccountLinkFlow
} from './account-promo.js';

const MODAL_ID = 'dg-account-intro-modal';

function ensureModal() {
  let modal = document.getElementById(MODAL_ID);
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = MODAL_ID;
  modal.className = 'hidden fixed inset-0 z-[60] flex items-center justify-center p-4';
  modal.style.background = 'rgba(0,0,0,0.75)';
  modal.innerHTML = `
    <div class="w-full max-w-sm rounded-2xl p-6" style="background:rgba(15,23,42,0.98);border:1px solid rgba(255,255,255,0.1)">
      <h2 class="text-lg font-semibold text-white mb-1">Save your progress</h2>
      <p class="text-sm text-slate-400 mb-4">Optional email sign-in keeps medals, streaks, and scores if you switch devices. Still free to play without an account.</p>
      <div class="flex flex-col gap-2">
        <button type="button" id="dg-account-intro-link"
          class="w-full py-2.5 rounded-lg font-semibold text-sm text-black"
          style="background:linear-gradient(135deg,#D4A650,#E5C37E)">Link email</button>
        <button type="button" id="dg-account-intro-dismiss"
          class="w-full py-2.5 rounded-lg text-sm text-slate-400">Not now</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

/**
 * Once-ever intro modal for optional account linking.
 * @returns {Promise<boolean>} true if modal was shown
 */
export async function maybeShowAccountIntroModal() {
  if (!(await shouldShowAccountPromo())) return false;
  if (hasSeenAccountIntro()) return false;

  const modal = ensureModal();
  const linkBtn = modal.querySelector('#dg-account-intro-link');
  const dismissBtn = modal.querySelector('#dg-account-intro-dismiss');

  return new Promise((resolve) => {
    const close = (shown) => {
      modal.classList.add('hidden');
      markAccountIntroSeen();
      resolve(shown);
    };

    linkBtn.onclick = () => {
      close(true);
      openAccountLinkFlow();
    };
    dismissBtn.onclick = () => close(true);

    modal.classList.remove('hidden');
  });
}
