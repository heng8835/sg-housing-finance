// Explore — quick add from a block (Phase 8 M-05, mobile-revamp-ideas.md §3, mockup frame 3). The block card's
// "Add to my choices" / "Add a flat from this block…" opens a small form instead of the 8-field My choices form:
// Flat type as chips (only the types sold here, with their sale counts) · Asking price, prefilled with that type's
// median here and labelled "median here — change it to the asking price" (owner Q5) · [Add to my choices] · a fold
// "More details (optional)" (storey, windows face, size, nickname, link). After adding, one line: "Added … ·
// N flats in your choices" with [Compare them] [Undo]. Phones: a sheet view stacked on the card (‹ Back to the card);
// desktop: a panel under the card's buttons. The full form stays for typed addresses and never-sold blocks.
// Sev-1: the prefills are the direct add's (./handoff.js createHandoff().add: last RECENT_M months of that type's
// sales, else all years; storey = nearestStorey of their median, size and price = medians, price to the S$1,000) —
// quickRow() is that same computation for any one type (tests/explore/quickadd.test.js checks they agree).
// Undo: one message in the view (P8-06, spec M-05) — "Added … · N flats in your choices." [Compare them] [Undo]; no
// second Undo line at the toast spot. Undo removes the flat it just added and the quick add shows its form again.
import { t } from '../../core/i18n.js';
import { esc } from '../../core/dom.js';
import { flatTypeLabel } from '../../core/flattype.js';
import { moneyInput, parseMoney, formatMoney, bindMoneyInputs } from '../../core/moneyinput.js';
import { typeCounts, addPlan, nearestStorey, RECENT_M } from './handoff.js';

export const ROUND_TO = 1000; // S$: the direct add rounds the median price to the nearest thousand (handoff.js)
const SHEET_ID = 'quickadd';
export const TALL_PX = 720; // UI choice: below this viewport height (or with larger text) the quick add opens the sheet full

/** Flat types sold in this block, smallest first: [{ ft, n, recent }] — n = the sales the prefill uses
 *  (last RECENT_M months of that type, else all years; recent says which). */
export function quickTypes({ recent, all, ftOf }) {
  const rc = typeCounts(recent, ftOf), ac = typeCounts(all, ftOf);
  return [...ac.keys()].sort((a, b) => a - b).map((ft) => ({ ft, n: rc.get(ft) || ac.get(ft), recent: rc.has(ft) }));
}

/** The direct add's row for one flat type: { ft, storey, sqm, price } (sqm / price null = no sales of it). */
export function quickRow({ ft, recent, all, ftOf, storeyOf, sqmOf, priceOf, median, storeyMid, storeyChoices }) {
  let same = recent.filter((i) => ftOf(i) === ft);
  if (!same.length) same = all.filter((i) => ftOf(i) === ft);
  const n = same.length;
  return {
    ft,
    storey: nearestStorey(median(same.map(storeyOf)), storeyMid, storeyChoices),
    sqm: n ? Math.round(median(same.map(sqmOf))) : null,
    price: n ? Math.round(median(same.map(priceOf)) / ROUND_TO) * ROUND_TO : null,
  };
}

/** The chip picked first: the direct add's type (most sales among the selected types) when sold here, else the first. */
export function firstType(types, { recent, all, ftOf, selected }) {
  const want = addPlan({ recent, all, ftOf, selected }).ft;
  return types.some((x) => x.ft === want) ? want : types[0]?.ft ?? null;
}

/** The choice saved by quick add (same shape as the direct add and the form). details = the "More details" values. */
export function quickChoice({ id, bid, label, row, price, details = {} }) {
  const d = details;
  return {
    id, bid, ft: row.ft,
    storey: d.storey != null && d.storey !== '' ? +d.storey : row.storey,
    sqm: d.sqm > 0 ? +d.sqm : row.sqm,
    price,
    name: (d.name || '').trim() || label,
    url: (d.url || '').trim(),
    facing: d.facing || '',
  };
}

const salesText = (n) => (n === 1 ? t('1 sale') : t('{0} sales', [n]));
const hintText = (ftName, recent) => (recent
  ? t('Median {0} here, last {1} years — change it to the asking price.', [ftName, RECENT_M / 12])
  : t('Median {0} here, all years — change it to the asking price.', [ftName]));

/** The form (pure HTML). x: { types, ft, row, label, storeyOptions, facingOptions, phone, note } */
export function formHtml(x) {
  const ftName = (ft) => flatTypeLabel(x.ftCode(ft));
  const chips = x.types.map((y) => `<button type="button" class="chip qa-chip${y.ft === x.ft ? ' on' : ''}" role="radio" aria-checked="${y.ft === x.ft}" tabindex="${y.ft === x.ft ? 0 : -1}" data-ft="${y.ft}">`
    + `<span>${esc(ftName(y.ft))}</span><small>${esc(salesText(y.n))}</small></button>`).join('');
  const cur = x.types.find((y) => y.ft === x.ft);
  const more = `<details class="fold p8-more qa-more" data-fold="qaMore"><summary><span class="fold-t">${t('More details (optional)')}</span>`
    + `<span class="fold-s">${t('storey, windows face, size, nickname, link')}</span></summary><div class="fold-body"><div class="fields">`
    + `<label class="f"><span>${t('Storey')}</span><select class="qa-storey">${x.storeyOptions}</select></label>`
    + `<label class="f"><span>${t('Main windows face')}</span><select class="qa-facing">${x.facingOptions}</select></label>`
    + `<label class="f"><span>${t('Floor area (sqm)')}</span><input type="number" class="qa-sqm" inputmode="decimal" min="20" max="300" value="${x.row.sqm ?? ''}"></label>`
    + `<label class="f"><span>${t('Nickname')}</span><input type="text" class="qa-name" autocomplete="off" placeholder="${esc(x.label)}"></label>`
    + `<label class="f wide"><span>${t('Listing URL (optional)')}</span><input type="url" class="qa-url" autocomplete="off" placeholder="https://"></label>`
    + '</div></div></details>';
  return `<div class="qa-form">${x.phone ? '' : `<h5 class="bc-h qa-title">${t('Add a flat from this block')}</h5>`}
    ${x.note ? `<p class="qa-note" role="status">${esc(x.note)}</p>` : ''}
    <p class="qa-l" id="qaTypesL">${t('Flat type')}</p><div class="chips qa-types" role="radiogroup" aria-labelledby="qaTypesL">${chips}</div>
    <label class="f qa-pricef"><span>${t('Asking price (S$)')}</span>${moneyInput({ value: x.row.price, attrs: 'class="qa-price" aria-describedby="qaHint"' })}
      <small class="f-help" id="qaHint">${esc(hintText(ftName(x.ft), cur ? cur.recent : true))}</small></label>
    <p class="notice qa-err" hidden></p>
    <div class="qa-acts"><button type="button" class="btn primary qa-add">${t('Add to my choices')}</button>${x.phone ? '' : `<button type="button" class="btn qa-cancel">${t('Cancel')}</button>`}</div>
    ${more}</div>`;
}

/** After adding (pure HTML): one line "Added … · N flats in your choices.", [Compare them] (2+ flats) [Undo], the next-step hint. */
export function doneHtml({ name, ftName, n, phone }) {
  const msg = n === 1 ? t('Added {0}, {1} · 1 flat in your choices.', [name, ftName]) : t('Added {0}, {1} · {2} flats in your choices.', [name, ftName, n]);
  return `<div class="qa-done"><p class="qa-msg" role="status">${esc(msg)}</p>
    <div class="qa-acts">${n >= 2 ? `<button type="button" class="btn primary qa-compare">${t('Compare them')}</button>` : ''}<button type="button" class="btn qa-undo">${t('Undo')}</button>${phone ? '' : `<button type="button" class="btn qa-cancel">${t('Close')}</button>`}</div>
    <p class="hint">${n >= 2 ? '' : `${t('Add one more flat to compare.')} `}${phone ? t('Or tap another block to add it.') : t('Or click another block to add it.')}</p></div>`;
}

// ------------------------------------------------------------------ browser
/**
 * ctx: { D, TX, blockTx, lastMonthIdx, median, storeyMid, storeyChoices, getS, bus, phone(), add(choice without id)
 *        → { id, n }, undo(id), compare(), storeyOptions() (the form's <option>s), facingOptions() }
 * → { open(bi) → false when the block was never sold (use the full form) }
 */
export function createQuickAdd(ctx) {
  const { D, TX, blockTx, lastMonthIdx, median, storeyMid, storeyChoices } = ctx;
  const ftOf = (i) => TX.ft[i];
  let cur = null; // { bi, el, types, ft, edited }

  const lists = (bi) => { const all = blockTx[bi]; return { all, recent: all.filter((i) => TX.m[i] >= lastMonthIdx - (RECENT_M - 1)) }; };
  const rowOf = (bi, ft) => quickRow({ ft, ...lists(bi), ftOf, storeyOf: (i) => TX.s[i], sqmOf: (i) => TX.a[i], priceOf: (i) => TX.p[i], median, storeyMid, storeyChoices });
  const q = (sel) => cur?.el.querySelector(sel);

  function paintForm(note = '') {
    const row = rowOf(cur.bi, cur.ft);
    cur.el.innerHTML = formHtml({ types: cur.types, ft: cur.ft, row, label: D.blocks[cur.bi].label, ftCode: (ft) => D.flat_types[ft],
      storeyOptions: ctx.storeyOptions(), facingOptions: ctx.facingOptions(), phone: ctx.phone(), note });
    if (row.storey != null) q('.qa-storey').value = String(row.storey);
    cur.edited = { price: false, sqm: false };
  }
  function pickType(ft) {
    if (!cur || ft === cur.ft) return;
    const was = rowOf(cur.bi, cur.ft), row = rowOf(cur.bi, ft);
    cur.ft = ft;
    for (const b of cur.el.querySelectorAll('.qa-chip')) { const on = +b.dataset.ft === ft; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }
    // a typed price / size stays; an untouched prefill follows the type (it was that type's median)
    const price = q('.qa-price'), sqm = q('.qa-sqm');
    if (!cur.edited.price || parseMoney(price.value) === was.price) { price.value = formatMoney(row.price); cur.edited.price = false; }
    if (!cur.edited.sqm || +sqm.value === was.sqm) { sqm.value = row.sqm ?? ''; cur.edited.sqm = false; }
    if (row.storey != null) q('.qa-storey').value = String(row.storey);
    const y = cur.types.find((x) => x.ft === ft);
    q('#qaHint').textContent = hintText(flatTypeLabel(D.flat_types[ft]), y ? y.recent : true);
  }
  function add() {
    const price = parseMoney(q('.qa-price').value), err = q('.qa-err');
    if (!(price > 0)) { err.textContent = t('Type the asking price.'); err.hidden = false; q('.qa-price').focus(); return; }
    const details = { storey: q('.qa-storey').value, facing: q('.qa-facing').value, sqm: +q('.qa-sqm').value || null, name: q('.qa-name').value, url: q('.qa-url').value };
    const c = quickChoice({ id: null, bid: cur.bi, label: D.blocks[cur.bi].label, row: rowOf(cur.bi, cur.ft), price, details });
    const { id, n } = ctx.add(c), ftName = flatTypeLabel(D.flat_types[cur.ft]), mine = cur;
    cur.el.innerHTML = doneHtml({ name: c.name, ftName, n, phone: ctx.phone() });
    q('.qa-compare, .qa-undo')?.focus({ preventScroll: true });
    mine.added = id;
  }
  function undo() { // the flat just added goes; the form comes back with a note
    if (!cur || cur.added == null) return;
    ctx.undo(cur.added);
    cur.added = null;
    paintForm(t('Undone — that flat is no longer in your choices.'));
    q('.qa-chip.on')?.focus({ preventScroll: true });
  }
  function close() {
    if (!cur) return;
    const { el } = cur; cur = null;
    if (el.classList.contains('ms-view')) ctx.bus?.emit('sheet:pop', { id: SHEET_ID }); else el.remove();
  }
  function wire(el) {
    bindMoneyInputs(el);
    el.addEventListener('click', (e) => {
      const chip = e.target.closest('.qa-chip'); if (chip) { pickType(+chip.dataset.ft); return; }
      if (e.target.closest('.qa-add')) add();
      else if (e.target.closest('.qa-undo')) undo();
      else if (e.target.closest('.qa-cancel')) close();
      else if (e.target.closest('.qa-compare')) { close(); ctx.compare(); }
    });
    el.addEventListener('input', (e) => {
      if (!cur) return;
      if (e.target.matches('.qa-price')) { cur.edited.price = true; q('.qa-err').hidden = true; }
      if (e.target.matches('.qa-sqm')) cur.edited.sqm = true;
    });
    el.addEventListener('keydown', (e) => { // radio chips: ← / → move and pick; Enter in a field adds
      const chip = e.target.closest('.qa-chip');
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (chip && d) {
        e.preventDefault(); e.stopPropagation();
        const all = [...el.querySelectorAll('.qa-chip')], next = all[(all.indexOf(chip) + d + all.length) % all.length];
        next.focus(); pickType(+next.dataset.ft);
      } else if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); add(); }
      else if (e.key === 'Escape' && !ctx.phone()) { e.stopPropagation(); close(); }
    });
  }

  /** Open quick add for block bi; false = never sold here (the caller opens the full form). */
  function open(bi) {
    const { all, recent } = lists(bi);
    const types = quickTypes({ recent, all, ftOf });
    if (!types.length) return false;
    if (cur) close();
    const el = document.createElement('div');
    el.className = 'qa';
    cur = { bi, el, types, ft: firstType(types, { recent, all, ftOf, selected: ctx.getS().ft }), edited: {} };
    wire(el);
    paintForm();
    if (ctx.phone()) {
      // half shows type, price and [Add] at 375×812; a short screen or larger text needs the full sheet for the button
      const tall = innerHeight >= TALL_PX && !document.documentElement.classList.contains('ts-big');
      ctx.bus?.emit('sheet:push', { id: SHEET_ID, el, title: t('Add {0}', [D.blocks[bi].label]), size: tall ? 'half' : 'full' });
      if (el.isConnected) { q('.qa-chip.on')?.focus({ preventScroll: true }); return true; }
    }
    const card = document.querySelector(`#cardDock .bc-win[data-key="${bi}"] .bc-actions`);
    if (!card) { cur = null; return false; }
    card.after(el);
    el.scrollIntoView?.({ block: 'nearest' });
    q('.qa-chip.on')?.focus({ preventScroll: true });
    return true;
  }
  ctx.bus?.on?.('sheet:popped', (d) => { if (d?.id !== SHEET_ID) return; if (cur && cur.el.classList.contains('ms-view')) cur = null; });

  return { open, close };
}

/** Every English string here (zh coverage). */
export const quickAddStrings = () => ['1 sale', '{0} sales', 'Median {0} here, last {1} years — change it to the asking price.', 'Median {0} here, all years — change it to the asking price.',
  'More details (optional)', 'storey, windows face, size, nickname, link', 'Add a flat from this block', 'Asking price (S$)', 'Add to my choices', 'Cancel',
  'Added {0}, {1} · 1 flat in your choices.', 'Added {0}, {1} · {2} flats in your choices.', 'Compare them', 'Undo', 'Close', 'Add one more flat to compare.',
  'Or tap another block to add it.', 'Or click another block to add it.', 'Type the asking price.', 'Undone — that flat is no longer in your choices.', 'Add {0}',
  'Storey', 'Main windows face', 'Floor area (sqm)', 'Nickname', 'Listing URL (optional)', 'Flat type'];
