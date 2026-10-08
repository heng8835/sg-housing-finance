// Simple / Pro switch (header). Simple hides power-user controls (.pro-only) and shortens the
// compare table; the choice is stored in the store's ui slice.

import { t } from '../../core/i18n.js';

export function mountModeSwitch({ store }) {
  const seg = document.createElement('div');
  seg.className = 'seg mode-switch'; seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', t('Detail level'));
  seg.innerHTML = `<button type="button" role="radio" data-v="simple" title="${t('Key numbers only')}">${t('Simple')}</button><button type="button" role="radio" data-v="pro" title="${t('Every row, filter and layer')}">${t('Pro')}</button>`;
  document.getElementById('learnBtn')?.before(seg) ?? document.querySelector('header .spacer').after(seg);

  const apply = () => {
    const mode = store.get('ui.mode') === 'pro' ? 'pro' : 'simple';
    document.body.classList.toggle('simple', mode === 'simple');
    seg.querySelectorAll('button').forEach((b) => { const on = b.dataset.v === mode; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
  };
  seg.addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (b) store.set('ui.mode', b.dataset.v); });
  store.subscribe('ui', apply);
  apply();
}
