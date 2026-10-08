// Phone top bar (≤ 767 px, phone overhaul §2.2): the Aa text-size popover and the Menu sheet. The header's EN / 中文,
// Simple / Pro, text size, Learn and Tour controls are hidden on phones (styles/phone.css); the same switches
// (shell/lang.js, shell/mode.js, shell/textsize.js → core/textsize.js) and entry points live here instead.
// Menu rows hand off through the bus only: 'guide:open' {} (tour picker), 'learn:open' {id: null} (Learn index),
// 'samples:open' / 'samples:exit', 'start:open', and a [data-about] button (Learn → About, its document listener).
// 'menu:painted' {root} fires on every open; root's [data-slot="menu-extra"] is free for other modules (offline line).
import { t } from '../../core/i18n.js';
import { esc } from '../../core/dom.js';
import { langSeg } from './lang.js';
import { modeSeg } from './mode.js';
import { textSizeEl } from './textsize.js';
import { PHONE_QUERY } from './phone.js';

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

/** The Menu sheet's inner markup (pure). inSample → "Other samples" + "Exit sample" instead of "Try a sample". */
export function menuHtml({ inSample = false } = {}) {
  const row = (r) => `<li><button type="button" class="pm-go" data-act="${r.act}"${r.act === 'about' ? ' data-about' : ''}>${esc(t(r.label))}</button></li>`;
  return `<div class="drawer-body pm-body">
  <div class="drawer-head pm-head"><h2 id="menuTitle">${esc(t('SG Housing & Finance'))}</h2><button type="button" class="btn" data-act="close">${esc(t('Close'))}</button></div>
  <ul class="pm-list">
    <li class="pm-row"><span class="pm-l" id="pmLang">${esc(t('Language'))}</span><span class="pm-c" data-slot="lang"></span></li>
    <li class="pm-row"><span class="pm-l" id="pmTs">${esc(t('Text size'))}</span><span class="pm-c" data-slot="ts"></span></li>
    <li class="pm-row"><span class="pm-l" id="pmMode">${esc(t('Simple or Pro'))}<small>${esc(t('Pro shows more rows and tools'))}</small></span><span class="pm-c" data-slot="mode"></span></li>
    ${MENU_ROWS.filter((r) => r.sample === undefined || r.sample === inSample).map(row).join('\n    ')}
  </ul>
  <div data-slot="menu-extra"></div>
  <p class="pm-disc">${esc(t('Educational estimates, not financial advice'))}</p>
</div>`;
}

export function mountMenu({ store, bus } = {}) {
  const aa = document.getElementById('phoneAa'), menuBtn = document.getElementById('phoneMenu');
  if (!aa || !menuBtn) return null;
  const mq = matchMedia(PHONE_QUERY);

  // ---- Aa: a small popover with the three text sizes (labels drawn at their own sizes)
  const pop = document.createElement('div');
  pop.id = 'tsPop'; pop.className = 'ts-pop'; pop.hidden = true;
  pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-labelledby', 'tsPopLbl');
  pop.innerHTML = `<p class="ts-pop-l" id="tsPopLbl">${esc(t('Text size'))}</p>`;
  pop.append(textSizeEl({ store, cls: 'ts-pop-switch' }));
  document.body.append(pop);
  // R-10: anchored 8 px below the Aa button (the sample banner can push the top bar down); right: 16px stays in CSS
  const place = () => { if (!pop.hidden) pop.style.top = `${Math.round(aa.getBoundingClientRect().bottom + 8)}px`; };
  const setPop = (open) => { pop.hidden = !open; aa.setAttribute('aria-expanded', String(open)); place(); };
  pop.addEventListener('click', () => requestAnimationFrame(place)); // a new text size can move the button
  aa.addEventListener('click', () => { setPop(pop.hidden); if (!pop.hidden) pop.querySelector('button[aria-pressed="true"]')?.focus(); });
  document.addEventListener('pointerdown', (e) => { if (!pop.hidden && !pop.contains(e.target) && !aa.contains(e.target)) setPop(false); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) { setPop(false); aa.focus(); } });

  // ---- Menu: full-screen sheet, built on first open; the three switches are built once and moved in
  let dlg = null;
  const segs = {};
  function build() {
    dlg = document.createElement('dialog');
    dlg.id = 'menuDlg'; dlg.className = 'phone-full phone-menu'; dlg.setAttribute('aria-labelledby', 'menuTitle');
    document.body.append(dlg);
    segs.lang = langSeg({ store }); segs.lang.setAttribute('aria-labelledby', 'pmLang');
    segs.ts = textSizeEl({ store }); segs.ts.setAttribute('aria-labelledby', 'pmTs');
    segs.mode = modeSeg({ store }); segs.mode.setAttribute('aria-labelledby', 'pmMode');
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
    setPop(false);
    dlg.innerHTML = menuHtml({ inSample: !!store.inSample?.() });
    for (const [k, el] of Object.entries(segs)) dlg.querySelector(`[data-slot="${k}"]`)?.append(el);
    if (!dlg.open) dlg.showModal();
    bus?.emit('menu:painted', { root: dlg });
  }
  menuBtn.addEventListener('click', open);
  const leave = () => { if (!mq.matches) { setPop(false); if (dlg?.open) dlg.close(); } };
  mq.addEventListener?.('change', leave);
  addEventListener('resize', () => { leave(); place(); });
  return { open, close: () => dlg?.open && dlg.close(), popover: setPop };
}

/** Every English string this module shows (zh coverage test). */
export const uiStrings = () => [...MENU_ROWS.map((r) => r.label), 'SG Housing & Finance', 'Close', 'Language', 'Text size',
  'Simple or Pro', 'Pro shows more rows and tools', 'Educational estimates, not financial advice'];
