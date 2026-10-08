// Explore — the block card on phones (≤ 767 px; phone-overhaul.md §3.3, P-27 to P-31, P-63; owner feedback 2026-10-09:
// "neat, calm, scannable — not one big chunk"). The card is the map sheet's content (./dock.js 'sheet:push'):
//   first view  — header (number, street, "town · flat types", ✕; built by the dock), ONE row of four key tiles
//                 (median price · $psf · lease left · nearest MRT); two 48 px buttons (Add to my choices · Afford this)
//                 after the rows, in a sticky footer pinned to the bottom of the sheet view (review R-06);
//   below       — one-line collapsed rows with a chevron and a short summary ("Recent sales · 12 in 2017–2026"), each a
//                 details[data-fold] remembered with core/fold keepFolds (F6): Good to know, Prices (scope, hand-off note,
//                 trend), Recent sales (3 columns: month · storey · price), Rent (Rent check first), Primary schools
//                 (rows → school card), Nearby, Commute, Town vs market, Lease and value, Future-value outlook.
// Sev-1: presentation only — every figure is the one the desktop card shows (same model, same kTile / money / median).
// Pure (node tests: tests/explore/phonecard.test.js); ./card.js calls phoneCardHtml() when model.phone is set.
import { t } from '../../core/i18n.js';
import { esc, money } from '../../core/dom.js';
import { kTile, ftShort, warnShort, schoolsBody, moreText, salesScope, ROWS_SHOWN } from './card.js';

const strip = (html) => String(html || '').replace(/<[^>]*>/g, '').trim();

/** Phone sales list: 3 columns (month · storey · price), newest first; your flat types keep the blue bar. */
export function phoneSalesTable(idx, cols, open) {
  const head = ['Date', 'Storey', 'Price (S$)'].map((h, k) => `<th${k > 1 ? ' class="r"' : ''}>${t(h)}</th>`).join('');
  const rows = idx.slice(0, open ? idx.length : ROWS_SHOWN).map((i) => `<tr${cols.sel && cols.sel(i) ? ' class="sel"' : ''}><td>${esc(cols.month(i))}</td><td>${esc(cols.storey(i))}</td><td class="r">${Math.round(cols.price(i)).toLocaleString('en-SG')}</td></tr>`).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

/** One collapsed row: label + one-line summary + chevron; the body opens in place. */
const row = (key, open, label, sum, body) => `<details class="pc-row" data-fold="${key}"${open ? ' open' : ''}><summary><span class="pc-l">${label}</span>`
  + `<span class="pc-s">${sum}</span></summary><div class="pc-body">${body}</div></details>`;

/**
 * The phone card body. model = card.js cardHtml model plus { lease (years | null), mrt ({ d, name } | null),
 * pfold(key, defaultOpen) → open?, schoolPick?(item) → index }. No element ids.
 */
export function phoneCardHtml(m) {
  const { head: h, st, tiles: a } = m, none = st.state === 'none', open = (k, d = false) => (m.pfold ? m.pfold(k, d) : d);
  const fresh = !!h.newYear && !(m.sales && m.sales.total);
  const tile = (label, v) => `<div class="pc-tile"><small>${t(label)}</small><b${strip(v).length > 6 ? ' class="pc-long"' : ''}>${v}</b></div>`;
  const tiles = `<div class="pc-tiles">${tile('Median price', none ? '—' : kTile(a.price))}${tile('Per sq ft', !none && a.psf ? 'S$' + Math.round(a.psf) : '—')}`
    + `${tile('Lease left', m.lease == null ? '—' : t('{0} y', [Math.round(m.lease)]))}${tile('Nearest MRT', m.mrt ? esc(m.mrt.d) : '—')}</div>`;
  const acts = `<div class="pc-acts"><button type="button" class="btn primary" data-act="add">${t('Add to my choices')}</button>`
    + `<button type="button" class="btn" data-act="afford"${m.affordPrice ? '' : ' disabled'}>${t('Afford this')}</button></div>`;

  const warn = h.items.filter((x) => x.tone === 'warn'), near = h.items.filter((x) => x.tone !== 'warn');
  const newNote = h.newYear ? t(m.simple ? 'No resale yet — first resales from ~{0} (after the 5-year minimum stay)' : 'No resale yet — first resales from ~{0} (5-yr MOP)', [h.newYear]) : '';
  const outside = st.outside ? t('This block is outside your town or lease filters, so it is not coloured.') : '';
  const notes = [...warn.map((x) => `<li class="pc-warn">${x.html}</li>`), ...(newNote ? [`<li>${newNote}</li>`] : []), ...(outside ? [`<li>${outside}</li>`] : [])];
  const good = notes.length ? row('pc-warn', open('pc-warn'), t('Good to know'), warn.length ? `<span class="pc-warn">⚠ ${esc(warnShort(warn[0].html))}</span>` : esc(strip(newNote || outside)), `<ul class="pc-list">${notes.join('')}</ul>`) : '';

  const scope = st.state === 'match' ? `${a.n === 1 ? t('{0} matching sale', [1]) : t('{0} matching sales', [a.n])} · ${m.scope}`
    : st.state === 'fallback' ? `${t('All flat types in your period')} · ${m.period}` : `${t('No sales in your period.')} ${m.scope}`;
  const sumPrices = st.state === 'match' ? (a.n === 1 ? t('{0} matching sale', [1]) : t('{0} matching sales', [a.n])) : st.state === 'fallback' ? t('All flat types in your period') : t('No sales in your period.');
  const ho = m.ho && m.ho.price ? `<p class="pc-note">${t('Afford this and Rent check use the {0} median: {1}.', [ftShort(m.ho.ft), kTile(m.ho.price)])}</p>` : '';
  const tr = m.trend;
  const trend = `<h4 class="pc-h">${esc(tr.heading)}</h4>${tr.enough ? `<div class="bc-chart"></div><p class="pc-note">${esc(tr.caption)}</p>` : `<p class="pc-note">${t('Not enough sales for a trend.')}</p>`}`;
  const prices = fresh
    ? row('pc-prices', open('pc-prices'), t('Prices'), '—', `<p class="pc-note">${t('No resales yet, so there are no prices for this block. Nearby blocks on the map, or the "Prices in view" box, give a guide.')}</p>`)
    : row('pc-prices', open('pc-prices'), t('Prices · last {0}', [m.win]), sumPrices, `<p class="pc-note">${scope}</p>${ho}${trend}`);

  const s = m.sales;
  const sales = fresh ? '' : row('pc-sales', open('pc-sales'), t('Recent sales'), s.total ? t('{0} in {1}–{2}', [s.idx.length, s.from, s.to]) : t('No sales in this block yet.'),
    s.total ? `<div class="bc-sales"><p class="pc-note">${esc(salesScope(s))}</p>${s.idx.length ? `<div class="bc-table${s.open ? ' open' : ''}">${phoneSalesTable(s.idx, s.cols, s.open)}</div><p class="pc-note">${t('Blue bar = your flat types.')}</p>` : ''}`
      + `<button type="button" class="link bc-more"${s.idx.length > ROWS_SHOWN ? '' : ' hidden'}>${moreText(s.idx.length, s.open)}</button></div>` : `<p class="pc-note">${t('No sales in this block yet.')}</p>`);

  const rentBtn = `<button type="button" class="btn" data-act="rent">${t('Rent check →')}</button>`;
  const rl = (r) => { const x = `${esc(ftShort(r.ft))} ${money(r.med)}`; return r.n ? t('{0} ({1} rentals)', [x, r.n]) : x; };
  const rent = m.rent && m.rent.length ? row('pc-rent', open('pc-rent', !!m.rentFirst), t('Rent'), `${esc(ftShort(m.rent[0].ft))} ${money(m.rent[0].med)}`, `<p class="pc-line">${rentBtn}</p><ul class="pc-list">${m.rent.map((r) => `<li>${rl(r)}</li>`).join('')}</ul>`)
    : `<div class="pc-row pc-plain"><span class="pc-l">${t('Rent')}</span>${rentBtn}</div>`;

  const sc = m.schools, b0 = sc && sc.bandsKm[0], n = sc ? sc.bands.near.length : 0;
  const schools = sc ? row('pc-schools', open('pc-schools'), t('Primary schools'), n ? t('{0} within {1} km', [n, b0]) : t('none within {0} km', [b0]), schoolsBody(sc.bands, sc.bandsKm, m.schoolPick)) : '';
  const nearby = near.length ? row('pc-near', open('pc-near'), t('Nearby'), esc(near.slice(0, 2).map((x) => strip(x.html)).join(', ')), `<ul class="pc-list">${near.map((x) => `<li>${x.html}</li>`).join('')}</ul>`) : '';
  const commute = m.commute ? `<div class="pc-row pc-plain pc-wrap"><span class="pc-l">${t('Commute')}</span><span class="pc-s">${m.commute}</span></div>` : '';

  const mk = m.mk;
  const town = !mk ? '' : mk.rpi ? row('pc-mkt', open('pc-mkt'), t('Town vs market'), '', '<div class="mk-body" data-mk="town"></div>')
    : `<p class="pc-note pc-pad">${t('Town vs market is hidden: the HDB Resale Price Index (data/market.js) is not loaded.')}</p>`;
  const lease = mk && mk.lease ? row('pc-lease', open('pc-lease'), t('Lease and value'), '', '<div class="mk-body" data-mk="lease"></div>') : '';
  const fv = m.fv ? row('pc-fv', open('pc-fv'), t('Future-value outlook'), '', '<div class="bc-fv-body" data-fv></div>') : '';

  // R-06: the two buttons come after the rows and are pinned to the bottom of the sheet view (sticky footer, card.css)
  return `<div class="bc bc-phone">${tiles}<div class="pc-rows">${good}${prices}${sales}${rent}${schools}${nearby}${commute}${town}${lease}${fv}</div>${acts}</div>`;
}

/** Every English string this file adds (zh staging check). */
export const phoneStrings = () => ['Per sq ft', 'Add to my choices', 'Afford this', 'Good to know', 'Recent sales', '{0} in {1}–{2}', '{0} within {1} km', 'none within {0} km'];
