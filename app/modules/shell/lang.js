// EN / 中文 switch (header; on phones the same switch sits in the Menu sheet, shell/menu.js). The choice is stored in
// the store's ui slice; switching reloads the page so every view — including the legacy map/compare code — is rebuilt
// in the new language.
import { LANGS, currentLang } from '../../core/i18n.js';

/** A bound EN / 中文 seg (not placed). cls = extra class (header: lang-switch). */
export function langSeg({ store, cls = '' }) {
  const seg = document.createElement('div');
  seg.className = `seg${cls ? ' ' + cls : ''}`; seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', 'Language / 语言');
  seg.innerHTML = Object.entries(LANGS).map(([code, name]) => `<button type="button" role="radio" lang="${code === 'zh' ? 'zh-Hans' : 'en'}" data-v="${code}" class="${code === currentLang() ? 'on' : ''}" aria-checked="${code === currentLang()}">${code === 'en' ? 'EN' : name}</button>`).join('');
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b || b.dataset.v === currentLang()) return;
    store.set('ui.lang', b.dataset.v);
    location.reload();
  });
  return seg;
}

export function mountLangSwitch({ store }) {
  const seg = langSeg({ store });
  seg.className = 'seg lang-switch';
  document.querySelector('.mode-switch')?.before(seg) ?? document.querySelector('header .spacer').after(seg);
}
