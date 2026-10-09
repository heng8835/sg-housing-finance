// Phase 8a M-01 (owner Q2: phone AND desktop): the flat in focus bar under the page title of Afford, Rent & Buy and
// Plan (index.html .page-ctx slot, reserved by the phone overhaul F7): "For  Fernvale · 4-room · S$600,000  [Change]"
// and, with your choices, "‹  Flat 1 of 3 in your choices  ›". ‹ › and the rows of the "Which flat?" sheet set the
// focus to that shortlisted flat — the same focus object the Afford button in My choices sets (explore/legacy.js
// emits them as 'choices:list' {list}); no new money logic. The sheet: your choices as radio rows, a typical flat for
// what the map shows, "Type a price" (phones: Afford fills the sheet's [data-slot="flat-inputs"] on 'flatbar:inputs'
// {slot} — its price / type / lease fields move there; desktop: they stay on Afford, the row goes to them) and
// "Pick a block on the map". Pure parts: core/focusflat.js.
// Bus: listens 'choices:list' {list}, 'data:ready', 'phone:show-map' (closes the sheet); emits 'flatbar:inputs' {slot}.
import { esc } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { data } from '../../core/data.js';
import { effectiveFlat, onTypicalChange } from '../../core/typical.js';
import { barModel, barText, navText, showNav, stepChoice, choicePos } from '../../core/focusflat.js';

export const BAR_TABS = ['afford', 'rent', 'plan'];
const PHONE = '(max-width: 767px)';

export function mountFlatBar({ store, bus }) {
  let choices = [];
  const mq = matchMedia(PHONE);
  const slots = BAR_TABS.map((id) => document.querySelector(`#tab-${id} > .page-head > .page-ctx`)).filter(Boolean);
  if (!slots.length) return null;
  // the flat the answers use: Afford and Plan take the largest selected type for an upgrader (A8) — so does the bar
  const flatNow = () => effectiveFlat(store, undefined, { prefer: store.get('plan.current.owns') ? 'largest' : null });
  const model = () => {
    const f = store.get('focus'), tf = flatNow();
    return barModel({ focus: f, tf, choices, blockLabel: f && f.bid != null ? data.block(f.bid)?.label || null : null });
  };

  function barHtml(m) {
    const text = m.empty ? t('No flat yet') : barText(m);
    const nav = showNav(m)
      ? `<div class="fb-nav"><button type="button" class="btn fb-step" data-fb="prev" aria-label="${esc(t('Previous flat in your choices'))}"${m.pos === 1 ? ' aria-disabled="true"' : ''}>‹</button>
        <span class="fb-pos" aria-live="polite">${esc(navText(m))}</span>
        <button type="button" class="btn fb-step" data-fb="next" aria-label="${esc(t('Next flat in your choices'))}"${m.pos && m.pos === m.n ? ' aria-disabled="true"' : ''}>›</button></div>` : '';
    return `<div class="fbar"><div class="fb-main"><p class="fb-t"><small>${t('For')}</small><b>${esc(text)}</b></p>
      <button type="button" class="btn fb-change" data-fb="change" aria-haspopup="dialog">${m.empty ? t('Choose a flat') : t('Change')}</button></div>${nav}</div>`;
  }

  function paint() {
    const html = barHtml(model());
    for (const s of slots) {
      // keep the keyboard focus on ‹ / › / Change across the repaint
      const a = document.activeElement, key = a && s.contains(a) ? a.dataset.fb : null;
      s.innerHTML = html;
      s.hidden = false;
      s.closest('.page-head')?.classList.add('has-ctx'); // desktop: show the slot without the phone title row
      if (key) s.querySelector(`[data-fb="${key}"]`)?.focus({ preventScroll: true });
    }
    if (dlg.open) paintList();
  }

  // ---------------------------------------------------------------- "Which flat?"
  const dlg = document.createElement('dialog');
  dlg.className = 'bsheet wf-dlg';
  dlg.setAttribute('aria-labelledby', 'wfT');
  dlg.innerHTML = `<div class="bs-head"><h2 id="wfT">${t('Which flat?')}</h2><button type="button" class="btn sm" data-wf="close">${t('Close')}</button></div>
    <div class="bs-body">
      <p class="wf-now" id="wfNow"></p>
      <h3 class="wf-h" id="wfChoicesH">${t('Your choices')}</h3>
      <div class="wf-list" id="wfList" role="radiogroup" aria-labelledby="wfChoicesH"></div>
      <h3 class="wf-h" id="wfOrH">${t('Or')}</h3>
      <div class="wf-list" id="wfOther" role="radiogroup" aria-labelledby="wfOrH"></div>
      <div class="wf-typed" id="wfTyped"><h3 class="wf-h">${t('Type a price')}</h3><div data-slot="flat-inputs"></div></div>
      <button type="button" class="btn wf-map" data-wf="map">${t('Pick a block on the map')}</button>
    </div>`;
  document.body.append(dlg);
  const slot = dlg.querySelector('[data-slot="flat-inputs"]');
  let opener = null;

  const row = (i, on, title, sub, price) => `<button type="button" class="wf-row" role="radio" aria-checked="${on}" data-wf="pick" data-i="${i}">
    <span class="wf-t"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${price ? `<span class="wf-p">${esc(price)}</span>` : ''}</button>`;

  function paintList() {
    const f = store.get('focus'), tf = flatNow(), m = model(), pos = choicePos(f, choices);
    dlg.querySelector('#wfNow').textContent = m.empty ? '' : t('Now: {0}', [barText(m)]);
    dlg.querySelector('#wfList').innerHTML = choices.length
      ? choices.map((c, i) => {
        const bm = barModel({ focus: c, tf: c, choices }), name = bm.empty ? c.label || '' : bm.name;
        const block = c.bid != null ? data.block(c.bid)?.label || '' : '';
        return row(i, pos === i + 1, name, [bm.ft, block !== name ? block : ''].filter(Boolean).join(' · '), bm.empty ? '' : bm.price);
      }).join('')
      : `<p class="hint">${t('Nothing in My choices yet.')}</p>`;
    dlg.querySelector('#wfOther').innerHTML = row('typical', !!(tf && tf.isDefault), t('A typical flat for what the map shows'), tf && tf.isDefault ? barText(m) : '', '');
    // phones: Afford's own fields; desktop: they stay on Afford — this row goes there
    const phone = mq.matches;
    if (phone) bus.emit('flatbar:inputs', { slot });
    else slot.innerHTML = `<button type="button" class="link wf-goprice" data-wf="price">${t('Type a price in Afford →')}</button>`;
  }

  function openSheet(from) {
    opener = from || null;
    slot.innerHTML = '';
    dlg.showModal();
    paintList(); // after showModal: Afford fills the slot of an open sheet only
    (dlg.querySelector('.wf-row[aria-checked="true"]') || dlg.querySelector('[data-wf="close"]'))?.focus();
  }
  const closeSheet = () => { if (dlg.open) dlg.close(); };
  dlg.addEventListener('close', () => { slot.innerHTML = ''; if (opener && opener.isConnected) opener.focus({ preventScroll: true }); opener = null; });

  function pick(i) {
    if (i === 'typical') {
      const f = store.get('focus'), tf = flatNow();
      // the typical flat = a focus without a price (core/typical.js); the flat type on screen stays
      store.set('focus', { source: 'price', label: t('Your own figures'), flatType: (f && f.flatType) || (tf && tf.flatType) || null, price: null, remainingLease: null });
    } else if (choices[+i]) store.set('focus', choices[+i]);
    closeSheet();
  }

  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) { closeSheet(); return; } // backdrop
    if (e.target.closest('[data-act="pick-map"]')) { closeSheet(); return; } // Afford's "Pick on the map →" in the fields
    const b = e.target.closest('[data-wf]');
    if (!b) return;
    const act = b.dataset.wf;
    if (act === 'close') closeSheet();
    else if (act === 'pick') pick(b.dataset.i);
    else if (act === 'map') { closeSheet(); bus.emit('nav:goto', { tab: 'explore' }); bus.emit('phone:show-map', {}); }
    else if (act === 'price') {
      closeSheet();
      bus.emit('nav:goto', { tab: 'afford' });
      setTimeout(() => { const i = document.getElementById('afPrice'); if (i) { i.scrollIntoView?.({ block: 'center' }); i.focus({ preventScroll: true }); } }, 0);
    }
  });
  // radio rows: arrow keys move between them
  dlg.addEventListener('keydown', (e) => {
    const r = e.target.closest?.('.wf-row');
    if (!r || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const all = [...dlg.querySelectorAll('.wf-row')], k = all.indexOf(r);
    all[(k + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus();
  });

  // ---------------------------------------------------------------- the bar
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('.page-ctx [data-fb]');
    if (!b) return;
    if (b.dataset.fb === 'change') { openSheet(b); return; }
    if (b.getAttribute('aria-disabled') === 'true') return;
    const next = stepChoice(store.get('focus'), choices, b.dataset.fb === 'prev' ? -1 : 1);
    if (next) store.set('focus', next);
  });

  bus.on('choices:list', ({ list } = {}) => { choices = Array.isArray(list) ? list.filter((c) => c && c.source === 'choice') : []; paint(); });
  store.subscribe('focus', paint);
  store.subscribe('plan.current', paint); // upgrader → the largest selected type
  onTypicalChange(paint);
  bus.on('data:ready', paint);
  bus.on('phone:show-map', closeSheet);
  mq.addEventListener?.('change', () => { closeSheet(); paint(); });
  paint();
  return { paint, open: openSheet };
}

/** Every English string this module shows (zh coverage test). */
export const uiStrings = () => ['No flat yet', 'Previous flat in your choices', 'Next flat in your choices', 'For', 'Choose a flat', 'Change',
  'Which flat?', 'Close', 'Your choices', 'Or', 'Type a price', 'Pick a block on the map', 'Now: {0}', 'Nothing in My choices yet.',
  'A typical flat for what the map shows', 'Type a price in Afford →', 'Your own figures'];
