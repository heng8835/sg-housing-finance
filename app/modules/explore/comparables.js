// Explore — comparable sales + fair value v2, "is it over-priced?" (phase 6b, phase6-journeys.md AC 8).
// Owns the tiered "Recent sales benchmark" (moved verbatim from legacy.js: same tiers, minimums, windows
// and texts, so every existing number is unchanged), the compare-table row "Over-priced? (vs comparable
// sales)" and the "Show comparables" panel under the compare table (the sales behind the benchmark).
// Sev-1: the benchmark psf / n / tier are the same as before; the new row only reads them. When the
// benchmark's tier has fewer than MIN_COMPS sales, the row (and its list) widens to the next tier with
// enough sales and names it (owner default 2026-10-07); the benchmark, premium and COV rows do not.
// Pure parts are exported for node tests; createComparables() wires the compare drawer (browser).
import { t } from '../../core/i18n.js';
import { esc } from '../../core/dom.js';
import { fairValue } from '../../engine/fairvalue.js';
import { kTile, storeyShort } from './card.js';
import { percentileText, middleHalfText, tooFewText } from '../../core/plain.js';

// UI heuristics (not rules). MIN_COMPS (5, spec AC 8) and the benchmark tiers (unchanged from legacy.js:
// NEAR_M 400, LEASE_TOL 5, BLOCK_MIN 3, AREA_MIN 5) live in core/comps.js, shared with Plan → Sell then buy.
import { MIN_COMPS, NEAR_M, LEASE_TOL, BLOCK_MIN, AREA_MIN } from '../../core/comps.js';
export { MIN_COMPS, NEAR_M, LEASE_TOL, BLOCK_MIN, AREA_MIN };
export const LIST_MAX = 50;    // comparables listed before "Show all"
export const ROW_KEY = 'Over-priced? (vs comparable sales)';
/** Simple-mode row label (B10); the key and the Pro label stay as they are. */
export const SIMPLE_LABEL = 'Compared with similar sales';
// B13 UI heuristics (owner default O13, not rules): beyond ±UNUSUAL_PREMIUM vs recent sales the At-a-glance flag is a
// warning with what to check (no green tick); with fewer than RANK_TEXT_MAX_N comparables the row gives a plain rank.
export const UNUSUAL_PREMIUM = 0.20;
export const RANK_TEXT_MAX_N = 8;
// the premium flag's older bands (legacy verdict(), unchanged): above +8% "above", below −3% "below", else in line
export const PREMIUM_HIGH = 0.08, PREMIUM_LOW = -0.03;

const signedPct0 = (x) => `${x > 0 ? '+' : ''}${(x * 100).toFixed(0)}%`;
const absPct0 = (x) => `${(Math.abs(x) * 100).toFixed(0)}%`;

/**
 * At-a-glance premium flag [cls, icon, text] (legacy verdict(), B13): beyond ±UNUSUAL_PREMIUM it says what to check;
 * otherwise exactly the older flag. short = the benchmark's "where" (e.g. "this block").
 */
export function premiumFlag(premium, short) {
  if (premium == null) return null;
  if (premium > UNUSUAL_PREMIUM) return ['serious', '▲', t('Unusually high — {0} above recent sales ({1}). Check the listing, renovation and floor.', [absPct0(premium), short])];
  if (premium < -UNUSUAL_PREMIUM) return ['warn', '!', t('Unusually low — {0} below recent sales. Check the lease, the flat model (e.g. DBSS) and the listing.', [absPct0(premium)])];
  if (premium > PREMIUM_HIGH) return ['serious', '▲', t('{0} above recent sales ({1})', [signedPct0(premium), short])];
  if (premium < PREMIUM_LOW) return ['good', '▼', t('{0} below recent sales', [signedPct0(premium)])];
  return ['good', '≈', t('priced in line with recent sales')];
}

/** Where the asking $psf sits among the comparables, counted (B13): { n, dearer (sales it is above), cheaper, vsMedian }. */
export function rankOf(psfs, askingPsf, p50) {
  let dearer = 0, cheaper = 0;
  for (const v of psfs) { if (askingPsf > v) dearer++; else if (askingPsf < v) cheaper++; }
  return { n: psfs.length, dearer, cheaper, vsMedian: p50 ? askingPsf / p50 - 1 : null };
}

/** Plain rank instead of a percentile for a small set: "Dearer than all 5 recent sales (+2%)". */
export function rankText(r) {
  const vs = r.vsMedian == null ? '' : ` (${signedPct0(r.vsMedian)})`;
  if (r.dearer === r.n) return t('Dearer than all {0} recent sales', [r.n]) + vs;
  if (r.cheaper === r.n) return t('Cheaper than all {0} recent sales', [r.n]) + vs;
  return (r.dearer >= r.cheaper ? t('Dearer than {0} of {1} recent sales', [r.dearer, r.n]) : t('Cheaper than {0} of {1} recent sales', [r.cheaper, r.n])) + vs;
}
const useRank = (fv, rank) => !!rank && fv.enough && fv.n < RANK_TEXT_MAX_N;

/** Indices in `pool` that a benchmark tier counts: same flat type, month in [mFrom, mTo] (as statsFor). */
export function pickComps(pool, ft, mFrom, mTo, TX) {
  const out = [];
  for (const i of pool) if (TX.m[i] >= mFrom && TX.m[i] <= mTo && TX.ft[i] === ft) out.push(i);
  return out;
}

/** Newest first; same month → later record first (stable, deterministic). */
export const newestFirst = (idx, TX) => idx.slice().sort((a, b) => TX.m[b] - TX.m[a] || b - a);

/** "68th percentile" (rounded; English ordinal suffix, one 中文 template). */
export function ordinal(p) {
  const n = Math.round(p), m100 = n % 100, m10 = n % 10;
  if (m100 >= 11 && m100 <= 13) return t('{0}th percentile', [n]);
  return m10 === 1 ? t('{0}st percentile', [n]) : m10 === 2 ? t('{0}nd percentile', [n]) : m10 === 3 ? t('{0}rd percentile', [n]) : t('{0}th percentile', [n]);
}

/** The "Show comparables" toggle (label via CSS ::after so the table dump / TSV stay data only). */
export function openButton(id, expanded) {
  const label = esc(t('Show comparables'));
  return `<button type="button" class="link cc-open" data-comps="${id}" data-label="${label}" aria-label="${label}" aria-expanded="${expanded ? 'true' : 'false'}"></button>`;
}

/** Compare-table cell. fv = engine fairValue() result; scope = the wider tier's label when the pool was widened. */
export function overpricedCell(fv, { id = null, expanded = false, scope = null, rank = null } = {}) {
  const btn = id != null && fv.n > 0 ? openButton(id, expanded) : '';
  if (!fv.enough) return `<span class="muted">${t(fv.verdict)}</span><small>${t('n={0} (at least {1} needed)', [fv.n, MIN_COMPS])}</small>${btn}`;
  const where = scope ? `${esc(scope)} · ` : '';
  return `${useRank(fv, rank) ? rankText(rank) : ordinal(fv.percentile)}<small>${t(fv.verdict)} · ${t('P25–P75 {0}–{1}', [kTile(fv.price.p25), kTile(fv.price.p75)])} · ${where}${t('n={0}', [fv.n])}</small>${btn}`;
}

/**
 * Simple-mode cell (B10): the same percentile, range and count in plain words — "Cheaper than about 64% of similar
 * sales · Typical: S$713k–S$781k (middle half of 35 similar sales)". Pro keeps overpricedCell().
 */
export function overpricedCellSimple(fv, { id = null, expanded = false, scope = null, rank = null } = {}) {
  const btn = id != null && fv.n > 0 ? openButton(id, expanded) : '';
  if (!fv.enough) return `<span class="muted">${t(fv.verdict)}</span><small>${tooFewText(fv.n, MIN_COMPS)}</small>${btn}`;
  const where = scope ? ` · ${esc(scope)}` : '';
  return `${useRank(fv, rank) ? rankText(rank) : percentileText(fv.percentile)}<small>${t(fv.verdict)} · ${middleHalfText(kTile(fv.price.p25), kTile(fv.price.p75), fv.n)}${where}</small>${btn}`;
}

/** One line under the panel heading: where the asking price sits. */
export function summaryText(fv, askingPsf, rank = null) {
  const ask = t('asking S${0} psf', [Math.round(askingPsf).toLocaleString('en-SG')]);
  if (!fv.enough) return `${ask} · ${t(fv.verdict)}`;
  return `${ask} · ${useRank(fv, rank) ? rankText(rank) : ordinal(fv.percentile)} · ${t(fv.verdict)} · ${t('P25–P75 S${0}–{1} psf', [Math.round(fv.p25).toLocaleString('en-SG'), Math.round(fv.p75).toLocaleString('en-SG')])}`;
}

/** Table rows. cols: { month, block, storey, sqm, price, psf } (index → value). */
export function compsRows(idx, cols) {
  return idx.map((i) => `<tr><td>${esc(cols.month(i))}</td><td>${esc(cols.block(i))}</td><td>${esc(cols.storey(i))}</td><td class="r">${cols.sqm(i)}</td><td class="r">${Math.round(cols.price(i)).toLocaleString('en-SG')}</td><td class="r">${Math.round(cols.psf(i))}</td></tr>`).join('');
}

/** The panel under the compare table. s: { id, name, src, note?, summary, idx (newest first), all }. */
export function panelHtml(s, cols) {
  const n = s.idx.length, shown = s.all ? s.idx : s.idx.slice(0, LIST_MAX);
  const head = ['Date', 'Block', 'Storey', 'sqm', 'Price (S$)', '$psf'].map((h, k) => `<th${k > 2 ? ' class="r"' : ''}>${t(h)}</th>`).join('');
  const more = n > LIST_MAX ? `<button type="button" class="link cc-more" data-comps-all>${s.all ? t('Show fewer') : t('Show all {0}', [n])}</button>` : '';
  const body = n ? `<div class="cc-table"><table><thead><tr>${head}</tr></thead><tbody>${compsRows(shown, cols)}</tbody></table></div>${more}` : `<p class="cc-sub">${t('No comparable sales in this window.')}</p>`;
  return `<section class="cmp-comps" aria-labelledby="ccHead"><div class="cc-head"><h4 id="ccHead" tabindex="-1">${t('Comparable sales · {0}', [esc(s.name)])}</h4><button type="button" class="link" data-comps-close>${t('Close')}</button></div>`
    + `<p class="cc-sub">${esc(t('{0}, same flat type · newest first', [s.src]))}</p>${s.note ? `<p class="cc-sub">${esc(s.note)}</p>` : ''}<p class="cc-sub">${esc(s.summary)}</p>${body}`
    + `<p class="cc-note">${t('Storey, renovation and view are not adjusted. A sale price is not a valuation.')}</p></section>`;
}

/**
 * ctx: { D, TX, PSF, blockTx, statsFor, townTx, haversine, title, lastMonthIdx, fmtMonth, body?, rerender? }
 * → { benchmark(c, b), compsOf(m), fairOf(m), row(), panel(ms) }
 */
export function createComparables(ctx) {
  const { D, TX, PSF, blockTx, statsFor, townTx, haversine, title, lastMonthIdx, fmtMonth } = ctx;

  // Comparable-sales benchmark, most specific first. Each tier needs enough sales to be
  // meaningful; lease-age matching stops a 2010s block being valued against 1980s flats.
  const nearCache = {};
  function nearBlocks(bi, r) { const k = bi + ':' + r; if (!nearCache[k]) { const b = D.blocks[bi]; nearCache[k] = D.blocks.map((x, i) => i).filter((i) => { const x = D.blocks[i]; return i !== bi && Math.abs(x.lat - b.lat) < 0.006 && Math.abs(x.lon - b.lon) < 0.006 && haversine(b.lat, b.lon, x.lat, x.lon) <= r; }); } return nearCache[k]; }
  // The tiers, most specific first: min = sales the benchmark needs; pool() is lazy (built once, only
  // when reached); src = full description; short = its first part (the "where"), used in the verdict
  // flag; scope = the short label the "Over-priced?" row shows when it had to widen to this tier.
  function tiersOf(c, b) {
    const L12 = lastMonthIdx - 11, L24 = lastMonthIdx - 23, lease = b.lease;
    const leaseOk = (i) => Math.abs(TX.ly[i] - lease) <= LEASE_TOL;
    const town = title(D.towns[b.t]);
    const once = (f) => { let v = null; return () => v || (v = f()); };
    const own = () => blockTx[c.bid];
    const near = once(() => nearBlocks(c.bid, NEAR_M).flatMap((i) => blockTx[i]).filter(leaseOk));
    const tt = once(() => townTx(b.t)), ttLease = once(() => tt().filter(leaseOk));
    return [
      { tier: 1, min: BLOCK_MIN, pool: own, mFrom: L12, months: 12, src: (n) => t('this block, {0} sales, last 12 m', [n]), short: () => t('this block'), scope: () => t('this block') },
      { tier: 2, min: BLOCK_MIN, pool: own, mFrom: L24, months: 24, src: (n) => t('this block, {0} sales, last 24 m', [n]), short: () => t('this block'), scope: () => t('this block, last 24 m') },
      { tier: 3, min: AREA_MIN, pool: near, mFrom: L12, months: 12, src: (n) => t('blocks within 400 m, similar lease, {0} sales, last 12 m', [n]), short: () => t('blocks within 400 m'), scope: () => t('nearby blocks, similar lease') },
      { tier: 4, min: AREA_MIN, pool: near, mFrom: L24, months: 24, src: (n) => t('blocks within 400 m, similar lease, {0} sales, last 24 m', [n]), short: () => t('blocks within 400 m'), scope: () => t('nearby blocks, similar lease, last 24 m') },
      { tier: 5, min: AREA_MIN, pool: ttLease, mFrom: L12, months: 12, src: (n) => t('{0}, similar lease (±5 y), {1} sales, last 12 m', [town, n]), short: () => town, scope: () => t('{0}, similar lease', [town]) },
      { tier: 6, min: 0, pool: tt, mFrom: L12, months: 12, src: (n) => t('{0} overall, {1} sales, last 12 m — rough', [town, n]), short: () => t('{0} overall', [town]), scope: () => t('{0} overall', [town]) },
    ];
  }
  // pool + mFrom + months: the sales a tier counted (for the comparables list and fair value v2).
  // The first tier with enough sales wins; the town overall is the last resort whatever its count.
  function benchmark(c, b) {
    const ts = tiersOf(c, b);
    for (let k = 0; k < ts.length; k++) {
      const x = ts[k], st = statsFor(x.pool(), c.ft, x.mFrom, lastMonthIdx);
      if (st.n >= x.min || k === ts.length - 1) return { psf: st.psf, n: st.n, src: x.src(st.n), short: x.short(), tier: x.tier, pool: x.pool(), mFrom: x.mFrom, months: x.months };
    }
  }

  // The "Over-priced?" pool: the benchmark's own sales; with fewer than MIN_COMPS, the next wider tier
  // that has at least MIN_COMPS (the benchmark itself is not changed). wide = null when not widened.
  function poolOf(m) {
    const bn = m.bench, idx = pickComps(bn.pool, m.c.ft, bn.mFrom, lastMonthIdx, TX);
    if (idx.length >= MIN_COMPS) return { idx, wide: null };
    for (const x of tiersOf(m.c, m.b)) {
      if (x.tier <= bn.tier) continue;
      const w = pickComps(x.pool(), m.c.ft, x.mFrom, lastMonthIdx, TX);
      if (w.length >= MIN_COMPS) return { idx: w, wide: { tier: x.tier, months: x.months, scope: x.scope(), src: x.src(w.length) } };
    }
    return { idx, wide: null };
  }

  const cache = new WeakMap(); // metrics object → { idx, fv, wide }
  function of(m) {
    let x = cache.get(m);
    if (!x) {
      const bn = m.bench, { idx, wide } = poolOf(m), use = wide || bn;
      const psfs = idx.map((i) => PSF[i]);
      const fv = fairValue({ psfs, sqft: m.sqft, askingPsf: m.psf, minN: MIN_COMPS, tier: use.tier, window: { months: use.months } });
      x = { idx, fv, wide, rank: rankOf(psfs, m.psf, fv.p50) }; cache.set(m, x);
    }
    return x;
  }
  const compsOf = (m) => of(m).idx, fairOf = (m) => of(m).fv;

  let open = null; // { id, all } — which flat's comparables are listed (not persisted)
  const row = () => ({
    k: ROW_KEY, simple: true, slbl: t(SIMPLE_LABEL),
    f: (m) => overpricedCell(fairOf(m), { id: m.c.id, expanded: open?.id === m.c.id, scope: of(m).wide?.scope, rank: of(m).rank }),
    fs: (m) => overpricedCellSimple(fairOf(m), { id: m.c.id, expanded: open?.id === m.c.id, scope: of(m).wide?.scope, rank: of(m).rank }),
    tip: t('Where the asking $psf sits among the comparable sales behind the benchmark above (same flat type, same tier and window): 0 = cheaper than all of them, 100 = dearer than all. If that tier has fewer than {0} sales, the next wider tier with at least {0} is used instead (this block over 24 m → nearby blocks with a similar lease → the town with a similar lease → the town overall) and the cell names it; the benchmark above stays as it is. The usual range is the middle half of those sales (P25–P75), shown in S$ for this flat\'s size. If even the town has fewer than {0} sales, there are not enough to judge. Storey, renovation and view are not adjusted, so a high floor or a new kitchen can explain a higher percentile.', [MIN_COMPS]),
  });

  const cols = {
    month: (i) => fmtMonth(TX.m[i]), block: (i) => D.blocks[TX.b[i]].label, storey: (i) => storeyShort(D.storeys[TX.s[i]]),
    sqm: (i) => TX.a[i], price: (i) => TX.p[i], psf: (i) => PSF[i],
  };
  function panel(ms) {
    const m = open && ms.find((x) => x.c.id === open.id);
    if (!m) { open = null; return ''; }
    const { idx, fv, wide, rank } = of(m), bn = m.bench;
    const note = wide ? t('Widened: the benchmark above has only {0} sales ({1}); at least {2} are needed for a percentile.', [bn.n, bn.short, MIN_COMPS]) : '';
    return panelHtml({ id: m.c.id, name: m.c.name, src: wide ? wide.src : bn.src, note, summary: summaryText(fv, m.psf, rank), idx: newestFirst(idx, TX), all: open.all }, cols);
  }

  const body = ctx.body;
  if (body && ctx.rerender) {
    body.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-comps], button[data-comps-close], button[data-comps-all]');
      if (!btn) return;
      let back = null;
      if (btn.dataset.comps != null) { const id = +btn.dataset.comps; open = open?.id === id ? null : { id, all: false }; if (!open) back = id; }
      else if (btn.hasAttribute('data-comps-close')) { back = open?.id ?? null; open = null; }
      else if (open) open.all = !open.all;
      ctx.rerender();
      if (open) { const h = body.querySelector('#ccHead'); if (h) { h.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); if (!btn.hasAttribute('data-comps-all')) h.focus({ preventScroll: true }); } }
      else if (back != null) body.querySelector(`button[data-comps="${back}"]`)?.focus();
    });
  }

  return { benchmark, compsOf, fairOf, row, panel };
}
