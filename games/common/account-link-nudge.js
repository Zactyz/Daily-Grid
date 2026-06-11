import {
  isAccountNudgeEligible,
  markAccountNudgeDismissed,
  markNudgeShownThisSession,
  openAccountLinkFlow
} from './account-promo.js';

const MODAL_ID = 'dg-account-nudge-modal';

function ensureModal() {
  let modal = document.getElementById(MODAL_ID);
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = MODAL_ID;
  modal.className = 'hidden fixed inset-0 z-[60] flex items-center justify-center p-4';
  modal.style.background = 'rgba(0,0,0,0.75)';
  modal.innerHTML = `
    <div class="w-full max-w-sm rounded-2xl p-6" style="background:rgba(15,23,42,0.98);border:1px solid rgba(255,255,255,0.1)">
      <h2 class="text-lg font-semibold text-white mb-1">Keep your progress everywhere</h2>
      <p class="text-sm text-slate-400 mb-4">Linking email saves medals and streaks to the cloud, not just this device. Add friends and see friend leaderboards.</p>
      <div class="flex flex-col gap-2">
        <button type="button" id="dg-account-nudge-link"
          class="w-full py-2.5 rounded-lg font-semibold text-sm text-black"
          style="background:linear-gradient(135deg,#D4A650,#E5C37E)">Link email</button>
        <button type="button" id="dg-account-nudge-dismiss"
          class="w-full py-2.5 rounded-lg text-sm text-slate-400">Not now</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

/**
 * Session-scoped random nudge after several daily submits without account.
 * @returns {Promise<boolean>} true if modal was shown
 */
export async function maybeShowAccountLinkNudgeModal() {
  if (!(await isAccountNudgeEligible())) return Promise.resolve(false);

  const modal = ensureModal();
  const linkBtn = modal.querySelector('#dg-account-nudge-link');
  const dismissBtn = modal.querySelector('#dg-account-nudge-dismiss');

  return new Promise((resolve) => {
    const close = (shown) => {
      modal.classList.add('hidden');
      markNudgeShownThisSession();
      resolve(shown);
    };

    linkBtn.onclick = () => {
      markAccountNudgeDismissed();
      close(true);
      openAccountLinkFlow();
    };
    dismissBtn.onclick = () => {
      markAccountNudgeDismissed();
      close(true);
    };

    modal.classList.remove('hidden');
  });
}
