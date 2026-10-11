// Phone Menu sheet (≤ 767 px; phone overhaul §2.2, phone top-bar spec phone-topbar-area-household.md §3). The top bar
// shows EN | 中文 and Simple | Pro itself (the header's .lang-switch / .mode-switch, reordered by styles/phone.css), the
// household entry "You" (household/chip.js) and Menu; text size (A / A+ / A++, shell/textsize.js → core/textsize.js) is
// only here, as the first row. The header's text size, Learn and Tour controls are hidden on phones.
// Menu rows hand off through the bus only: 'guide:open' {} (tour picker), 'learn:open' {id: null} (Learn index),
// 'samples:open' / 'samples:exit', 'start:open', and a [data-about] button (Learn → About, its document listener).
// 'menu:painted' {root} fires on every open; root's [data-slot="menu-extra"] is free for other modules (offline line).
import { t } from '../../core/i18n.js';
import { esc } from '../../core/dom.js';
import { textSizeEl } from './textsize.js';
import { PHONE_QUERY } from './phone.js';
import { donateUrl } from '../../core/version.js';

/** Rows that open something else (act → what the click does in mountMenu). */
export const MENU_ROWS = [
  { act: 'guides', label: 'Guides and tours' },
  { act: 'learn', label: 'Learn: housing & money terms' },
  { act: 'sample', label: 'Try a sample household', sample: false },
  { act: 'samples', label: 'Other samples', sample: true },
  { act: 'exit', label: 'Exit sample', sample: true },
  { act: 'start', label: 'Start here again' },
  { act: 'about', label: 'About and sources' },
];

/** The Menu sheet's inner markup (pure). inSample → "Other samples" + "Exit sample" instead of "Try a sample".
 *  donate → a last row linking to the Ko-fi page (new tab; not a [data-act] row, so the sheet stays open). */
export function menuHtml({ inSample = false, donate = '' } = {}) {
  const row = (r) => `<li><button type="button" class="pm-go" data-act="${r.act}"${r.act === 'about' ? ' data-about' : ''}>${esc(t(r.label))}</button></li>`;
  return `<div class="drawer-body pm-body">
  <div class="drawer-head pm-head"><h2 id="menuTitle">${esc(t('SG Housing & Finance'))}</h2><button type="button" class="btn" data-act="close">${esc(t('Close'))}</button></div>
  <ul class="pm-list">
    <li class="pm-row"><span class="pm-l" id="pmTs">${esc(t('Text size'))}</span><span class="pm-c" data-slot="ts"></span></li>
    ${MENU_ROWS.filter((r) => r.sample === undefined || r.sample === inSample).map(row).join('\n    ')}
    ${donate ? `<li><a class="pm-go pm-ext" href="${esc(donate)}" target="_blank" rel="noopener">${esc(t('Support this project'))} ☕</a></li>` : ''}
  </ul>
  <div data-slot="menu-extra"></div>
  <p class="pm-disc">${esc(t('Educational estimates, not financial advice'))}</p>
</div>`;
}

export function mountMenu({ store, bus } = {}) {
  const menuBtn = document.getElementById('phoneMenu');
  if (!menuBtn) return null;
  const mq = matchMedia(PHONE_QUERY);

  // full-screen sheet, built on first open; the text-size switch is built once and moved in
  let dlg = null, ts = null;
  function build() {
    dlg = document.createElement('dialog');
    dlg.id = 'menuDlg'; dlg.className = 'phone-full phone-menu'; dlg.setAttribute('aria-labelledby', 'menuTitle');
    document.body.append(dlg);
    ts = textSizeEl({ store }); ts.setAttribute('aria-labelledby', 'pmTs');
    dlg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      dlg.close();
      if (act === 'guides') bus?.emit('guide:open', {});
      else if (act === 'learn') bus?.emit('learn:open', { id: null });
      else if (act === 'sample' || act === 'samples') bus?.emit('samples:open', {});
      else if (act === 'exit') bus?.emit('samples:exit', {});
      else if (act === 'start') bus?.emit('start:open', { opener: menuBtn });
      // 'about': the [data-about] click goes on to Learn's document listener (About view)
    });
    dlg.addEventListener('close', () => { if (mq.matches) menuBtn.focus(); });
  }
  function open() {
    if (!dlg) build();
    dlg.innerHTML = menuHtml({ inSample: !!store.inSample?.(), donate: donateUrl() });
    dlg.querySelector('[data-slot="ts"]')?.append(ts);
    if (!dlg.open) dlg.showModal();
    bus?.emit('menu:painted', { root: dlg });
  }
  menuBtn.addEventListener('click', open);
  mq.addEventListener?.('change', () => { if (!mq.matches && dlg?.open) dlg.close(); });
  return { open, close: () => dlg?.open && dlg.close() };
}

/** Every English string this module shows (zh coverage test). */
export const uiStrings = () => [...MENU_ROWS.map((r) => r.label), 'SG Housing & Finance', 'Close', 'Text size', 'Support this project',
  'Educational estimates, not financial advice'];
