// "Plan" tab (Phase 4): CPF & retirement, sell then buy, key dates (+ .ics), options at 55+,
// primary schools by P1 distance band (+ map rings), BTO vs resale. Inputs live in the store's
// `plan` slice (and household); the rings toggle is per visit.
import { t } from '../../core/i18n.js';
import { cpfSection } from './cpf.js';
import { sellBuySection } from './sellbuy.js';
import { bindSaleRange } from './salerange.js';
import { keyDatesSection, icsFor } from './keydates.js';
import { seniorsSection } from './seniors.js';
import { schoolsSection, ringsFor } from './schools.js';
import { btoSection } from './bto.js';
import { bindBto } from './btoinputs.js';
import { readInput, todayIso } from './ui.js';
import { keepFolds, saveView } from '../../core/fold.js';
import { effectiveFlat, bindPickMap, onTypicalChange } from '../../core/typical.js';
import { bindNeeds } from '../../core/quickfill.js';

function download(text, filename, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function mountPlan({ store, policy, bus, el }) {
  const local = { ringsOn: false };
  const folds = keepFolds(el);
  // f = the focus flat as stored (schools, key dates, BTO); tf = f with a price, else the typical flat (CPF, sell then buy, 55+)
  // — of the largest selected flat type when the household owns a home and will sell (upgrader, A8)
  const ctx = () => ({ h: store.get('household'), f: store.get('focus'), tf: effectiveFlat(store, undefined, { prefer: store.get('plan.current.owns') ? 'largest' : null }), plan: store.get('plan'), policy, today: todayIso(), ringsOn: local.ringsOn, fold: folds.attr, mode: store.get('ui.mode') });
  // one failing section shows a message instead of breaking the tab (and app start-up)
  const safe = (fn, c) => { try { return fn(c); } catch (err) { console.error(err); return `<div class="section"><p class="notice">${t('This part could not be calculated')}: ${err.message}</p></div>`; } };
  const sendRings = () => bus.emit('explore:rings', local.ringsOn ? ringsFor(store.get('focus'), policy) : null);

  function render() {
    const c = ctx();
    const restore = saveView(el);
    folds.snapshot();
    el.innerHTML = [cpfSection, sellBuySection, keyDatesSection, seniorsSection, schoolsSection, btoSection].map((fn) => safe(fn, c)).join('')
      + `<p class="foot-note">${t('Educational guide — not legal or financial advice. HDB, CPF Board and IRAS have the final say.')}</p>`;
    folds.apply();
    bus.emit('learn:decorate', { root: el });
    restore();
  }

  el.addEventListener('change', (e) => {
    const x = e.target;
    if (!x.dataset.p) return;
    store.set(x.dataset.p, readInput(x));
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const kids = store.get('plan.dates.children') || [];
    if (b.dataset.act === 'add-child') store.set('plan.dates.children', [...kids, null]);
    else if (b.dataset.act === 'remove-child') store.set('plan.dates.children', kids.filter((_, i) => i !== +b.dataset.i));
    else if (b.dataset.act === 'ics') { const { text } = icsFor(ctx()); download(text, 'key-dates.ics', 'text/calendar;charset=utf-8'); }
    else if (b.dataset.act === 'rings') { local.ringsOn = !local.ringsOn; sendRings(); render(); }
    else if (b.dataset.act === 'goto-sellbuy') document.getElementById('planSellBuy')?.scrollIntoView({ block: 'start' }); // B6
    else if (b.dataset.act === 'hh-open') bus.emit('household:open', b.dataset.field ? { field: b.dataset.field } : {}); // B6
    else if (b.dataset.act === 'goto-rent') bus.emit('nav:goto', { tab: 'rent' }); // B9 gap cost needs your rent
  });
  bindPickMap(el);
  bindNeeds(el, { store, bus });
  bindSaleRange(el, { store }); // Sell then buy: current-block picker + "Use median"
  bindBto(el, { store }); // BTO vs resale: typed prices per project + flat type, "Use this wait"
  onTypicalChange(() => { const f = store.get('focus'); if (!(f && f.price > 0)) render(); });
  for (const k of ['household', 'plan', 'ui.mode']) store.subscribe(k, render); // ui.mode: Simple plain words (B10)
  store.subscribe('focus', () => { render(); if (local.ringsOn) sendRings(); });
  bus.on('data:ready', render);
  // e.g. "Compare with resale →" in a BTO map popup
  bus.on('plan:show', ({ section }) => { render(); document.getElementById(section)?.scrollIntoView({ block: 'start' }); });
  render();
}
