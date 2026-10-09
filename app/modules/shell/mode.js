// Simple / Pro switch (header; on phones the same element is the second item of the top bar — styles/phone.css reorders
// it, phone-topbar-area-household.md §3; class mode-switch kept so tours find it on every width). Simple hides
// power-user controls (.pro-only) and shortens the compare table; the choice is stored in the store's ui slice.

import { t } from '../../core/i18n.js';

const modeOf = (store) => (store.get('ui.mode') === 'pro' ? 'pro' : 'simple');

/** A bound Simple / Pro seg (not placed); keeps its pressed state in step with the store. */
export function modeSeg({ store, cls = '' }) {
  const seg = document.createElement('div');
  seg.className = `seg${cls ? ' ' + cls : ''}`; seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', t('Detail level'));
  seg.innerHTML = `<button type="button" role="radio" data-v="simple" title="${t('Key numbers only')}">${t('Simple')}</button><button type="button" role="radio" data-v="pro" title="${t('Every row, filter and layer')}">${t('Pro')}</button>`;
  const sync = () => {
    const mode = modeOf(store);
    seg.querySelectorAll('button').forEach((b) => { const on = b.dataset.v === mode; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
  };
  seg.addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (b) store.set('ui.mode', b.dataset.v); });
  store.subscribe('ui', sync);
  sync();
  return seg;
}

export function mountModeSwitch({ store }) {
  const seg = modeSeg({ store });
  seg.className = 'seg mode-switch'; // tours target .mode-switch
  document.getElementById('learnBtn')?.before(seg) ?? document.querySelector('header .spacer').after(seg);
  const apply = () => document.body.classList.toggle('simple', modeOf(store) === 'simple');
  store.subscribe('ui', apply);
  apply();
}
