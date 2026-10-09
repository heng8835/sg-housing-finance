// Plan → Sell then buy: "Similar recent sales" for the flat you own now — the middle half (P25–P75) of the
// comparable sales' $psf × your floor area, with n, and a "Use median" button that fills Expected sale price.
// Comparables = the same tiers as Explore's "Over-priced?" row (core/comps.js: this block → nearby blocks with a
// similar lease → the town), percentiles from engine/fairvalue.js. Sev-1: this only suggests — nothing in the
// store changes unless the user clicks "Use median". The block picker searches data.js through core/data.js.
// Privacy: the picked block and size stay in the store (localStorage), like every Plan input.
import { esc, money } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { data } from '../../core/data.js';
import { tieredComps, MIN_COMPS, SQFT_PER_SQM } from '../../core/comps.js';
import { fairValue } from '../../engine/fairvalue.js';
import { normQuery, blockName, townTitle as titleCase, searchBlocks as coreSearchBlocks } from '../../core/blocksearch.js';

export const ROUND_TO = 1000;   // S$: suggested prices are rounded to the nearest thousand (UI choice)
export const AC_MAX = 8;        // block suggestions shown
const LIST_ID = 'sbBlockList';

const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };

// same matching as every block / place search (core/searchnorm.js via core/blocksearch.js, 7c C3)
export { normQuery, blockName };
/** Up to `max` block indices whose "number street" matches every word of q (numbers exactly); street-first matches first. */
export const searchBlocks = (hdb, q, max = AC_MAX) => coreSearchBlocks(hdb, q, { max });

/** The saved block ({ bid, label }) if it still names the same block in this data.js, else null. */
export function resolveBlock(hdb, saved) {
  if (!hdb || !saved || !(saved.bid >= 0)) return null;
  return blockName(hdb, saved.bid) === saved.label ? saved.bid : null;
}

/** Median floor area (sqm) of this block's sales of the flat type, all years; null when none. */
export function typicalSqm(hdb, bid, ft) {
  const tx = hdb.tx, a = [];
  for (let i = 0; i < tx.p.length; i++) if (tx.b[i] === bid && tx.ft[i] === ft) a.push(tx.a[i]);
  return a.length ? Math.round(median(a)) : null;
}

const roundTo = (v) => (v == null ? null : Math.round(v / ROUND_TO) * ROUND_TO);

/**
 * Value range for the flat you own. q: { bid, flatType ('4 ROOM'), sqm (your floor area, optional) }.
 * @returns {null | { n, enough, tier, months, sqm, sqmTypical:boolean, low, mid, high (S$, rounded), psf:{p25,p50,p75}, town }}
 *   null when the block or flat type is unknown or no floor area can be found.
 */
export function saleRange(hdb, { bid, flatType, sqm = null }) {
  const ft = hdb?.flat_types?.indexOf(flatType) ?? -1;
  const c = tieredComps(hdb, { bid, ft });
  if (!c) return null;
  const own = sqm > 0 ? sqm : typicalSqm(hdb, bid, ft) ?? (c.idx.length ? Math.round(median(c.idx.map((i) => hdb.tx.a[i]))) : null);
  if (!own) return { n: c.n, enough: false, tier: c.tier, months: c.months, sqm: null, sqmTypical: true, low: null, mid: null, high: null, psf: null, town: hdb.towns[hdb.blocks[bid].t] };
  const fv = fairValue({ psfs: c.idx.map((i) => hdb.tx.p[i] / (hdb.tx.a[i] * SQFT_PER_SQM)), sqft: own * SQFT_PER_SQM, askingPsf: null, minN: MIN_COMPS });
  const enough = fv.n >= MIN_COMPS;
  return {
    n: fv.n, enough, tier: c.tier, months: c.months, sqm: own, sqmTypical: !(sqm > 0),
    low: enough ? roundTo(fv.price.p25) : null, mid: enough ? roundTo(fv.price.p50) : null, high: enough ? roundTo(fv.price.p75) : null,
    psf: enough ? { p25: fv.p25, p50: fv.p50, p75: fv.p75 } : null, town: hdb.towns[hdb.blocks[bid].t],
  };
}

/** Where the comparables came from (same labels as the Explore "Over-priced?" row). */
export function scopeText(r) {
  const town = titleCase(r.town);
  return {
    1: t('this block, last 12 m'), 2: t('this block, last 24 m'), 3: t('nearby blocks, similar lease, last 12 m'), 4: t('nearby blocks, similar lease, last 24 m'),
    5: t('{0}, similar lease, last 12 m', [town]), 6: t('{0} overall, last 12 m', [town]),
  }[r.tier] || '';
}
const kShort = (v) => `S$${Math.round(v / ROUND_TO).toLocaleString('en-SG')}k`;

/** The line under "Expected sale price". r = saleRange() result, null (nothing found) or undefined (no block picked).
 *  mode 'simple' (B10): "middle half of 12 sales" instead of "middle half, n=12". */
export function rangeHtml(r, picked, mode = 'pro') {
  if (!picked) return `<p class="hint wide sb-range">${t('Pick your current block above to see what similar flats sold for recently.')}</p>`;
  if (!r) return `<p class="hint wide sb-range">${t('No sales of this flat type found for your block.')}</p>`;
  if (!r.enough) return `<p class="hint wide sb-range">${r.n ? t('Only {0} similar sales recently — too few for a range (at least {1} needed).', [r.n, MIN_COMPS]) : t('No similar sales in the last 24 months.')}</p>`;
  const size = r.sqmTypical ? t('for {0} sqm, typical for this block — add your floor area under "Make it more accurate" for a closer range', [r.sqm]) : t('for your {0} sqm', [r.sqm]);
  return `<p class="hint wide sb-range"><span>${t(mode === 'simple' ? 'Similar recent sales: {0}–{1} (middle half of {2} sales)' : 'Similar recent sales: {0}–{1} (middle half, n={2})', [kShort(r.low), kShort(r.high), r.n])} · ${esc(scopeText(r))} · ${esc(size)}.</span>
    <button type="button" class="link" id="sbMedian" data-sb-median="${r.mid}">${t('Use median ({0})', [money(r.mid)])}</button><br>
    <small>${t('A guide from past sales, not a valuation: storey, condition and renovation are not adjusted. Nothing changes until you click.')}</small></p>`;
}

/** Block picker (an essential of Sell then buy, Phase 8 M-16: it gives the "Use median" range). */
export function blockPickField(c, hdb = data.hdb) {
  if (!hdb) return '';
  const bid = resolveBlock(hdb, c.block), name = bid != null ? blockName(hdb, bid) : '';
  return `<label class="f"><span>${t('Your current block (optional)')}</span><span class="ac"><input type="text" id="sbBlock" class="sb-block" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${LIST_ID}" autocomplete="off" value="${esc(name)}" placeholder="${esc(t('Search block or street'))}"><span class="ac-list" id="${LIST_ID}" role="listbox"></span></span></label>`;
}

/** Floor area (refines the range; in the "Make it more accurate" fold). Placeholder = the block's typical size. */
export function areaField(c, hdb = data.hdb) {
  if (!hdb) return '';
  const bid = resolveBlock(hdb, c.block);
  const typical = bid != null ? typicalSqm(hdb, bid, hdb.flat_types.indexOf(c.flatType)) : null;
  return `<label class="f"><span>${t('Floor area (sqm, optional)')}</span><input type="number" inputmode="decimal" data-p="plan.current.sqm" data-k="num" value="${c.sqm ?? ''}" min="0" step="1"${typical ? ` placeholder="${typical}"` : ''}></label>`;
}

/** Block picker + floor area fields together (older layout; kept for callers that want both). */
export const blockFields = (c, hdb = data.hdb) => blockPickField(c, hdb) + areaField(c, hdb);

/** Range line for the current inputs (cached per block / type / size / data). */
const cache = new Map();
export function rangeFor(c, mode = 'pro') {
  const hdb = data.hdb;
  if (!hdb || c.propertyType === 'private') return '';
  const bid = resolveBlock(hdb, c.block);
  if (bid == null) return rangeHtml(null, false, mode);
  const key = [bid, c.flatType, c.sqm ?? '', hdb.months.length, hdb.tx.p.length].join('|');
  if (!cache.has(key)) { if (cache.size > 32) cache.clear(); cache.set(key, saleRange(hdb, { bid, flatType: c.flatType, sqm: c.sqm })); }
  return rangeHtml(cache.get(key), true, mode);
}

// ------------------------------------------------------------------ browser
/** Delegated wiring on the Plan tab root: block autocomplete (keyboard + mouse) and "Use median". */
export function bindSaleRange(el, { store }) {
  let items = [], hi = -1;
  const input = () => el.querySelector('.sb-block'), list = () => el.querySelector(`#${LIST_ID}`);
  function paint() {
    const box = list(), inp = input(); if (!box || !inp) return;
    const hdb = data.hdb;
    box.innerHTML = items.map((bi, k) => `<span role="option" id="${LIST_ID}-${k}" data-i="${k}" aria-selected="${k === hi}" class="${k === hi ? 'hi' : ''}">${esc(blockName(hdb, bi))}<small>${esc(titleCase(hdb.towns[hdb.blocks[bi].t]))}</small></span>`).join('');
    box.classList.toggle('open', items.length > 0);
    inp.setAttribute('aria-expanded', String(items.length > 0));
    if (hi >= 0) inp.setAttribute('aria-activedescendant', `${LIST_ID}-${hi}`); else inp.removeAttribute('aria-activedescendant');
  }
  function pick(k) {
    const bi = items[k]; if (bi == null) return;
    items = []; hi = -1; paint();
    store.set('plan.current.block', { bid: bi, label: blockName(data.hdb, bi) });
  }
  el.addEventListener('input', (e) => {
    if (!e.target.classList?.contains('sb-block')) return;
    items = searchBlocks(data.hdb, e.target.value); hi = items.length ? 0 : -1; paint();
    if (!e.target.value.trim() && store.get('plan.current.block')) store.set('plan.current.block', null);
  });
  el.addEventListener('keydown', (e) => {
    if (!e.target.classList?.contains('sb-block') || !items.length) return;
    if (e.key === 'ArrowDown') { hi = (hi + 1) % items.length; paint(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { hi = (hi - 1 + items.length) % items.length; paint(); e.preventDefault(); }
    else if (e.key === 'Enter') { pick(hi); e.preventDefault(); }
    else if (e.key === 'Escape') { items = []; hi = -1; paint(); }
  });
  el.addEventListener('mousedown', (e) => { const d = e.target.closest?.(`#${LIST_ID} [data-i]`); if (d) { e.preventDefault(); pick(+d.dataset.i); } });
  el.addEventListener('focusout', (e) => { if (e.target.classList?.contains('sb-block')) setTimeout(() => { items = []; hi = -1; paint(); }, 150); });
  el.addEventListener('click', (e) => {
    const b = e.target.closest?.('button[data-sb-median]');
    if (b && +b.dataset.sbMedian > 0) store.set('plan.current.salePrice', +b.dataset.sbMedian);
  });
}
