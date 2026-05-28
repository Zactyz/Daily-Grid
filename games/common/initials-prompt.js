import {
  getPlayerInitials,
  setPlayerInitials,
  hasPlayerInitials,
  getCompletionsWithoutInitials,
  hasSeenInitialsPrompt,
  markInitialsPromptSeen
} from './utils.js';

const MODAL_ID = 'dg-initials-nudge-modal';

function ensureModal() {
  let modal = document.getElementById(MODAL_ID);
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = MODAL_ID;
  modal.className = 'hidden fixed inset-0 z-[60] flex items-center justify-center p-4';
  modal.style.background = 'rgba(0,0,0,0.75)';
  modal.innerHTML = `
    <div class="w-full max-w-sm rounded-2xl p-6" style="background:rgba(15,23,42,0.98);border:1px solid rgba(255,255,255,0.1)">
      <h2 class="text-lg font-semibold text-white mb-1">Show off your scores</h2>
      <p class="text-sm text-slate-400 mb-4">Add your initials to appear on leaderboards. You only need to set them once.</p>
      <input type="text" id="dg-initials-nudge-input" maxlength="3" placeholder="ABC"
        class="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-center uppercase text-lg tracking-widest placeholder:text-zinc-600 mb-4"
        autocomplete="off" autocapitalize="characters" spellcheck="false" />
      <div class="flex flex-col gap-2">
        <button type="button" id="dg-initials-nudge-save"
          class="w-full py-2.5 rounded-lg font-semibold text-sm text-black"
          style="background:linear-gradient(135deg,#D4A650,#E5C37E)">Save initials</button>
        <button type="button" id="dg-initials-nudge-dismiss"
          class="w-full py-2.5 rounded-lg text-sm text-slate-400">Not now</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

/**
 * One-time nudge after several completions without saving initials.
 * @returns {Promise<boolean>} true if modal was shown
 */
export function maybeShowInitialsNudgeModal() {
  if (hasPlayerInitials() || hasSeenInitialsPrompt()) return Promise.resolve(false);
  if (getCompletionsWithoutInitials() < 3) return Promise.resolve(false);

  const modal = ensureModal();
  const input = modal.querySelector('#dg-initials-nudge-input');
  const saveBtn = modal.querySelector('#dg-initials-nudge-save');
  const dismissBtn = modal.querySelector('#dg-initials-nudge-dismiss');
  const saved = getPlayerInitials();
  if (saved && input) input.value = saved;

  return new Promise((resolve) => {
    const close = (shown) => {
      modal.classList.add('hidden');
      markInitialsPromptSeen();
      resolve(shown);
    };

    saveBtn.onclick = () => {
      const initials = input?.value?.toUpperCase().trim();
      if (!initials || !/^[A-Z]{1,3}$/.test(initials)) {
        input?.focus();
        return;
      }
      setPlayerInitials(initials);
      close(true);
    };

    dismissBtn.onclick = () => close(true);

    modal.classList.remove('hidden');
    input?.focus();
  });
}
