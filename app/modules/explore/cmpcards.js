// Phone Compare = one card per flat (phone overhaul §3.4, P-32 to P-35, P-48, P-49; 7c C1). Phones only (≤ 767 px):
// desktop keeps the table and its bar, untouched. Compare lives inside My choices (List | Compare, #choicesView) and the
// Compare drawer is hidden on phones, so #cmpBody moves into #tab-choices here (and back at ≥ 768 px; the click
// handlers bound on #cmpBody — priorities, brief, comparables, CPF LIFE — keep working).
// Card values come from the SAME row definitions the desktop table renders (legacy ROWS() → simpleRows(): each cell is
// r.f(m), the flags are verdict(m), "best" is the table's rule) — nothing is computed here (tests/explore/cmpcards).
// legacy.js hooks: createCompareCards({ body, rerender }) once; renderCompare() → if (cards.on()) cards.render(...).
// Also lays out the Choices page on phones: Your shortlist first, then "Add a flat you found" and "Daily places" as
// folds (F6: details[data-fold] + keepFolds), "Share this list" / "Remove all" as buttons under the list.
import { t } from '../../core/i18n.js';
import { esc } from '../../core/dom.js';
import { flatTypeLabel, storeyLabel as storeyText, FLATTYPE_STRINGS } from '../../core/flattype.js';
import { keepFolds } from '../../core/fold.js';

export const PHONE_QUERY = '(max-width: 767px)';
/** The 8 key rows shown first on every card, in this order (row lookup keys, as in legacy ROWS()). A key row that is
 *  not in the rows (Simple mode, a switched-off source) is simply not shown; every other row goes into "All rows". */
export const KEY_ROWS = ['Asking price', 'Premium vs. recent sales', 'Monthly instalment', 'Cash you must pay', 'Remaining lease today',
  'Nearest MRT', 'Primary schools within 1 km', 'Floor area'];
export const VIEWS = ['list', 'compare'];
/** Phones in Simple mode (P-44): these row labels in plain words; Pro and the desktop table keep the table's label. */
export const PHONE_PLAIN_LABELS = { '$ per sqft': 'Price per sq ft' };
export const phoneLabel = (r, label, simple) => (simple && PHONE_PLAIN_LABELS[r.k] ? t(PHONE_PLAIN_LABELS[r.k]) : label(r));
/** R-16 / S1a: data codes in sentence case, like the block card ("4-room · storey 31–33"), via core/flattype.js;
 *  display only, the stored codes are unchanged. */
export const ftPhone = flatTypeLabel;
export const storeyPhone = storeyText;
/** Compare card sub line: "block · 4-room · storey 31–33" (label already escaped). */
export const headLine = (label, ft, storey) => [label, ftPhone(ft), storeyPhone(storey)].join(' · ');
/** "At a glance": this many flags show; the rest sit in a "Show N more" fold (R-15). */
export const GLANCE_SHOWN = 4;
/** List is the default with 0–1 flats, Compare from this many (until the user picks a view). */
export const COMPARE_FROM = 2;
/** ms after the last scroll event before "Flat N of M" follows a swipe. */
export const SCROLL_SETTLE_MS = 60;

/** The flats that are best on row r — the desktop table's rule (legacy renderCompare): only rows with a value, at
 *  least two flats with a number, and nobody is best when all of them tie. → Set of flat indexes. */
export function bestOf(r, ms) {
  let best = new Set();
  if (!r.v || ms.length < 2) return best;
  const valid = ms.map(r.v).map((v, i) => [v, i]).filter(([v]) => v != null && !isNaN(v));
  if (valid.length < 2) return best;
  const bv = r.best === 'min' ? Math.min(...valid.map(([v]) => v)) : Math.max(...valid.map(([v]) => v));
  valid.forEach(([v, i]) => { if (v === bv) best.add(i); });
  if (best.size === valid.length) best = new Set();
  return best;
}

/**
 * The table, read once (pure): rows = simpleRows(ROWS()) in table order; label(r) = the table's row label.
 * → { n, measures, wins: [per flat], glance: [[cls, icon, text]] per flat, rows: [{ sec } | { k, label, cells, best }] }
 */
export function cardsModel(ms, rows, { verdict, label = (r) => r.k } = {}) {
  const wins = ms.map(() => 0);
  const out = rows.map((r) => {
    if (r.sec) return { sec: r.sec };
    const best = bestOf(r, ms);
    best.forEach((i) => { wins[i]++; });
    return { k: r.k, label: label(r), cells: ms.map((m) => r.f(m)), best };
  });
  return { n: ms.length, measures: rows.filter((r) => r.v).length, wins, glance: ms.map((m) => (verdict ? verdict(m) : [])), rows: out };
}

/** Key rows of the model in KEY_ROWS order, and the other rows grouped under their table section (empty groups out). */
export function splitRows(model) {
  const byKey = new Map(model.rows.filter((r) => !r.sec).map((r) => [r.k, r]));
  const key = KEY_ROWS.map((k) => byKey.get(k)).filter(Boolean);
  const groups = []; let cur = null;
  for (const r of model.rows) {
    if (r.sec) { cur = { sec: r.sec, rows: [] }; groups.push(cur); continue; }
    if (KEY_ROWS.includes(r.k)) continue;
    if (!cur) { cur = { sec: null, rows: [] }; groups.push(cur); }
    cur.rows.push(r);
  }
  return { key, groups: groups.filter((g) => g.rows.length) };
}

const bestTag = (n) => ` <span class="tag good cc-best">${t('Best of {0}', [n])}</span>`;
const kv = (r, i, n, cls) => `<div class="${cls}"><dt>${r.label}</dt><dd>${r.cells[i]}${r.best.has(i) ? bestTag(n) : ''}</dd></div>`;

/** One flat's card (pure HTML). o: { head(m) (escaped sub line), color(i), note(i) → header note or null, open(key) } */
export function cardHtml(m, i, model, parts, o = {}) {
  const n = model.n, id = m.c.id, name = esc(m.c.name);
  const note = o.note?.(i) ?? (n > 1 ? t('best in {0} of {1} measures', [model.wins[i], model.measures]) : '');
  const flags = model.glance[i] || [], gk = `cmp-glance-${id}`;
  const flag = ([cls, ic, txt]) => `<li class="cc-g ${cls}"><span class="cc-ic" aria-hidden="true">${ic}</span><span class="cc-gt">${esc(txt)}</span></li>`;
  const more = flags.length > GLANCE_SHOWN ? `<details class="cc-more" data-fold="${gk}"${o.open?.(gk) ? ' open' : ''}><summary><span class="cc-more-c">${t('Show {0} more', [flags.length - GLANCE_SHOWN])}</span>`
    + `<span class="cc-more-o">${t('Show fewer')}</span></summary><ul class="cc-glance">${flags.slice(GLANCE_SHOWN).map(flag).join('')}</ul></details>` : '';
  const all = parts.groups.reduce((s, g) => s + g.rows.length, 0), fold = `cmp-all-${id}`;
  return `<article class="cc-card" role="listitem" data-i="${i}" aria-labelledby="ccName${i}">`
    + `<div class="cc-head"><span class="cc-num" style="background:${o.color ? o.color(i) : 'var(--accent)'}" aria-hidden="true">${i + 1}</span>`
    + `<div class="cc-title"><h3 class="cc-name" id="ccName${i}">${name}</h3><p class="cc-sub">${o.head ? o.head(m) : ''}</p>${note ? `<span class="tag good cc-note">${note}</span>` : ''}</div></div>`
    + (flags.length ? `<h4 class="cc-h">${t('At a glance')}</h4><ul class="cc-glance">${flags.slice(0, GLANCE_SHOWN).map(flag).join('')}</ul>${more}` : '')
    + (parts.key.length ? `<h4 class="cc-h">${t('Key numbers')}</h4><dl class="cc-keys">${parts.key.map((r) => kv(r, i, n, 'cc-kv')).join('')}</dl>` : '')
    + (all ? `<details class="cc-all" data-fold="${fold}"${o.open?.(fold) ? ' open' : ''}><summary>${t('All rows ({0})', [all])}</summary>`
      + parts.groups.map((g) => `${g.sec ? `<h5 class="cc-sec">${t(g.sec)}</h5>` : ''}<dl class="cc-list">${g.rows.map((r) => kv(r, i, n, 'cc-row-kv')).join('')}</dl>`).join('')
      + '</details>' : '')
    + `<div class="cc-acts"><button type="button" class="btn primary" data-cmp-afford="${id}">${t('Afford')}</button>`
    + `<button type="button" class="btn" data-brief="${id}" aria-label="${esc(t('Flat brief for {0}', [m.c.name]))}">${t('Brief')}</button></div>`
    + '</article>';
}

/** "Flat 2 of 3" (the number in bold). */
export const posHtml = (at, n) => t('Flat {0} of {1}', [`<b>${at + 1}</b>`, n]);

/** All cards: the "Flat 1 of 3" row with ‹ › (2+ flats), then the swipe row. at = the card in view. */
export function cardsHtml(ms, model, o = {}) {
  if (!ms.length) return `<div class="empty cc-empty">${t('No flats yet. Add one under List, or tap a block on the map.')}</div>`;
  const parts = splitRows(model), n = ms.length, at = Math.max(0, Math.min(n - 1, o.at || 0));
  const nav = n > 1 ? `<div class="cc-nav"><p class="cc-pos" aria-live="polite">${posHtml(at, n)}</p><span class="cc-btns">`
    + `<button type="button" class="btn cc-go" data-cc-go="-1" aria-label="${esc(t('Previous flat'))}"${at === 0 ? ' disabled' : ''}>‹</button>`
    + `<button type="button" class="btn cc-go" data-cc-go="1" aria-label="${esc(t('Next flat'))}"${at === n - 1 ? ' disabled' : ''}>›</button></span></div>` : '';
  return `<section class="cc" aria-label="${esc(t('Compare'))}">${nav}<div class="cc-row" role="list" data-n="${n}">${ms.map((m, i) => cardHtml(m, i, model, parts, o)).join('')}</div></section>`;
}

/** Every English string this module shows (zh coverage test). */
export const uiStrings = () => ['Best of {0}', 'best in {0} of {1} measures', 'At a glance', 'Key numbers', 'All rows ({0})', 'Afford', 'Brief',
  'Flat brief for {0}', 'Flat {0} of {1}', 'No flats yet. Add one under List, or tap a block on the map.', 'Previous flat', 'Next flat',
  'Compare', 'Share this list', 'Remove all', 'share link', 'remove all', 'Your shortlist', 'Your flats ({0})', ...Object.values(PHONE_PLAIN_LABELS),
  'Show {0} more', 'Show fewer', ...FLATTYPE_STRINGS];

// ------------------------------------------------------------------ DOM (phones)
/**
 * ctx: { body: #cmpBody, rerender: () => renderCompare() } → { on(), render(ms, rows, o), view(), head(label, ftCode,
 * storeyCode) (card sub line), ftLabel(code), storeyLabel(code) (phone: sentence case; desktop: the table's words) }
 * render o: { verdict, label, simple (Simple mode: PHONE_PLAIN_LABELS), head(m), color(i), note(i), before: html above
 * the cards, after: html below }
 */
export function createCompareCards({ body, rerender } = {}) {
  const $ = (id) => document.getElementById(id);
  const tab = $('tab-choices'), seg = $('choicesView'), bar = $('drawerBar'), list = $('choiceList');
  if (!body || !tab || !seg || !bar || !list || typeof matchMedia !== 'function') return { on: () => false, render() {}, view: () => 'list', head: headLine, ftLabel: ftPhone, storeyLabel: storeyPhone, reveal: () => null };
  const mq = matchMedia(PHONE_QUERY), folds = keepFolds(body), pageFolds = keepFolds(tab);
  const addSec = $('choiceForm')?.closest('.section'), listSec = list.closest('.section'), daySec = $('workForm')?.closest('.section');
  const share = $('shareChoices'), clear = $('clearChoices'), clearStyle = clear?.getAttribute('style');
  const listHead = () => listSec?.querySelector(':scope > h3 > span'); // "Your shortlist" (desktop) ↔ "Your flats (n)" (phone)
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let at = 0, n = 0, chosen = null, addAuto = true, wasPhone = null;
  const view = () => chosen || (n >= COMPARE_FROM ? 'compare' : 'list');

  // ---- page layout
  function fold(sec, key) { // section → <details data-fold> with its h3 as the summary (phone); undo on desktop
    if (!sec || sec.querySelector(':scope > details.ch-fold')) return;
    const d = document.createElement('details'), s = document.createElement('summary'), h = sec.querySelector(':scope > h3');
    d.className = 'ch-fold'; d.dataset.fold = key; d.open = pageFolds.isOpen(key, false);
    if (h) s.append(h);
    d.append(s, ...[...sec.childNodes]);
    sec.append(d); sec.classList.add('ch-folded');
  }
  function unfold(sec) {
    const d = sec?.querySelector(':scope > details.ch-fold');
    if (!d) return;
    const h = d.querySelector(':scope > summary > h3');
    d.remove(); sec.append(...[...d.childNodes].filter((x) => x.tagName !== 'SUMMARY'));
    if (h) sec.prepend(h);
    sec.classList.remove('ch-folded');
  }
  function place(phone) {
    if (phone) {
      if (body.parentElement !== tab) seg.after(body);
      if (addSec && listSec && addSec.compareDocumentPosition(listSec) & Node.DOCUMENT_POSITION_FOLLOWING) addSec.before(listSec);
      fold(addSec, 'choices-add'); fold(daySec, 'choices-daily');
      if (share && clear && !list.nextElementSibling?.classList.contains('ch-acts')) {
        const acts = document.createElement('div'); acts.className = 'ch-acts';
        list.after(acts); acts.append(share, clear);
        clear.removeAttribute('style');
        for (const [b, s] of [[share, 'Share this list'], [clear, 'Remove all']]) { b.classList.replace('link', 'btn'); b.textContent = t(s); }
      }
      seg.dataset.ready = '';
    } else {
      if (body.parentElement !== bar.parentElement) bar.after(body);
      unfold(addSec); unfold(daySec);
      if (addSec && listSec && listSec.compareDocumentPosition(addSec) & Node.DOCUMENT_POSITION_FOLLOWING) addSec.after(listSec);
      const acts = list.nextElementSibling?.classList.contains('ch-acts') ? list.nextElementSibling : null;
      if (acts) {
        const h = listSec.querySelector(':scope > h3');
        h.append(share, clear); acts.remove();
        if (clearStyle != null) clear.setAttribute('style', clearStyle);
        for (const [b, s] of [[share, 'share link'], [clear, 'remove all']]) { b.classList.replace('btn', 'link'); b.textContent = t(s); }
      }
      tab.removeAttribute('data-cview');
      if (listHead()) listHead().textContent = t('Your shortlist');
    }
  }

  // ---- List | Compare
  function paintView() {
    if (!mq.matches) return;
    const v = view();
    tab.dataset.cview = v;
    seg.querySelectorAll('button[data-v]').forEach((b) => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
    const add = addSec?.querySelector(':scope > details.ch-fold');
    if (add && addAuto) add.open = n === 0; // open while there is nothing to compare, closed once flats exist
    if (v === 'compare') restore();
  }
  function setView(v, focus = false) {
    if (!VIEWS.includes(v)) return;
    chosen = v; paintView();
    if (focus) seg.querySelector(`button[data-v="${v}"]`)?.focus();
  }
  seg.addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (b) setView(b.dataset.v); });
  seg.addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault(); setView(VIEWS[(VIEWS.indexOf(view()) + d + VIEWS.length) % VIEWS.length], true);
  });
  tab.addEventListener('click', (e) => { if (e.target.closest('details.ch-fold[data-fold="choices-add"] > summary')) addAuto = false; });
  // Edit (list) fills the form: open its fold and bring it into view
  list.addEventListener('click', (e) => {
    if (!mq.matches || !e.target.closest('button[data-a="edit"]')) return;
    const d = addSec?.querySelector(':scope > details.ch-fold');
    if (d) { d.open = true; addAuto = false; }
    setView('list');
    setTimeout(() => addSec?.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }), 0);
  });

  /** Fill links (core/filllink.js → legacy 'fill:open'): phones show List with that fold open ('choices-add' = the flat
   *  form, 'choices-daily' = Daily places); desktop: no-op. → the section, or null. */
  function reveal(key) {
    if (!mq.matches) return null;
    const sec = key === 'choices-add' ? addSec : key === 'choices-daily' ? daySec : null;
    const d = sec?.querySelector(':scope > details.ch-fold');
    if (d) d.open = true;
    if (key === 'choices-add') addAuto = false;
    setView('list');
    return sec || null;
  }

  // ---- swipe row: "Flat N of M" follows the scroll; ‹ › move one card
  const row = () => body.querySelector('.cc-row');
  const cards = () => [...(row()?.children || [])];
  const leftOf = (i) => { const c = cards(); return c[i] && c[0] ? c[i].offsetLeft - c[0].offsetLeft : 0; };
  function mark(i) {
    at = Math.max(0, Math.min(Math.max(0, n - 1), i));
    const pos = body.querySelector('.cc-pos');
    if (pos) pos.innerHTML = posHtml(at, n);
    body.querySelectorAll('[data-cc-go]').forEach((b) => { b.disabled = +b.dataset.ccGo < 0 ? at === 0 : at === n - 1; });
  }
  function restore() { const r = row(); if (r && r.clientWidth) { r.scrollLeft = leftOf(at); mark(at); } }
  function go(i) {
    const r = row(); if (!r) return;
    mark(i);
    r.scrollTo({ left: leftOf(at), behavior: reduced() ? 'auto' : 'smooth' });
  }
  body.addEventListener('click', (e) => {
    const g = e.target.closest('button[data-cc-go]');
    if (g) { go(at + +g.dataset.ccGo); return; }
    const a = e.target.closest('button[data-cmp-afford]');
    if (a) list.querySelector(`button[data-a="afford"][data-id="${CSS.escape(a.dataset.cmpAfford)}"]`)?.click(); // same action as the list's Afford
  });
  let tick = 0;
  body.addEventListener('scroll', (e) => {
    if (!e.target.classList?.contains('cc-row')) return;
    clearTimeout(tick);
    tick = setTimeout(() => {
      const c = cards(); if (c.length < 2) return;
      const step = c[1].offsetLeft - c[0].offsetLeft;
      if (step > 0) { const i = Math.round(e.target.scrollLeft / step); if (i !== at) mark(i); }
    }, SCROLL_SETTLE_MS);
  }, true);
  // the row can only scroll while it is visible: put the card back when the page shows again
  new MutationObserver(() => { if (tab.classList.contains('active')) restore(); }).observe(tab, { attributes: true, attributeFilter: ['class'] });

  function relayout() {
    if (mq.matches === wasPhone) return;
    const first = wasPhone == null;
    wasPhone = mq.matches; place(wasPhone);
    if (!first && rerender) rerender(); // table ↔ cards (the first render is legacy's own renderChoices())
  }
  mq.addEventListener?.('change', relayout);
  addEventListener('resize', relayout);
  relayout();

  function render(ms, rows, o = {}) {
    n = ms.length; at = Math.max(0, Math.min(Math.max(0, n - 1), at));
    folds.snapshot();
    const label = o.label || ((r) => r.k);
    body.innerHTML = (o.before || '') + cardsHtml(ms, cardsModel(ms, rows, { ...o, label: (r) => phoneLabel(r, label, o.simple) }), { ...o, at, open: (k) => folds.isOpen(k, false) }) + (o.after || '');
    if (listHead()) listHead().textContent = t('Your flats ({0})', [n]);
    paintView(); restore();
  }
  // R-16 / S1a: the list's flat type / storey in sentence case (phone and desktop, core/flattype.js)
  return { on: () => mq.matches, render, view, head: headLine, ftLabel: ftPhone, storeyLabel: storeyPhone, reveal };
}
