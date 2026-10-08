// HDB rents: comparable rentals for a block + flat type, "Is this rent fair?", yield helpers.
// Pure; policy passed in. Input shapes are those of window.HDB_RENTS (see tools/fetch_rents.py):
//   blockRents = HDB_RENTS.blocks[bid]  -> { '4 ROOM': [n, p25, med, p75, last, n24?, p25_24?, med24?, p75_24?] }
//   townRents  = HDB_RENTS.towns[town]  -> { '4 ROOM': { q:[median|null per quarter], n?, p25?, med?, p75? } }
// Educational estimate from HDB rental approvals, not a valuation or advice.

/** Field order of a block entry (HDB_RENTS.block_fields). */
export const RENT_FIELDS = ['n', 'p25', 'med', 'p75', 'last', 'n24', 'p25_24', 'med24', 'p75_24'];

// percentile anchors of the stored statistics
const MED_PCT = 100 / 2;
const Q1_PCT = MED_PCT / 2;
const Q3_PCT = MED_PCT + Q1_PCT;

// data windows of HDB_RENTS (months)
const WINDOW = 12;
const WINDOW_LONG = WINDOW * 2;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pos = (v) => { const x = num(v); return x != null && x > 0 ? x : null; };

/** Array (RENT_FIELDS order) or object -> object with every field (null when absent). */
const decode = (rec) => {
  if (!rec) return null;
  const out = {};
  RENT_FIELDS.forEach((f, i) => { out[f] = Array.isArray(rec) ? rec[i] ?? null : rec[f] ?? null; });
  return out;
};

const quartiles = (n, p25, med, p75, minN) => {
  const [a, m, b] = [pos(p25), pos(med), pos(p75)];
  return (num(n) ?? 0) >= minN && a != null && m != null && b != null && a <= m && m <= b ? { n, p25: a, med: m, p75: b } : null;
};

/**
 * Comparable rents for one block + flat type, falling back block 12 months -> block 24 months -> town.
 * @param {object|null} blockRents  HDB_RENTS.blocks[bid] (may be undefined: no rentals)
 * @param {string} flatType         HDB_DATA label, e.g. '4 ROOM'
 * @param {{get:(id:string)=>any}} policy
 * @param {object|null} [townRents] HDB_RENTS.towns[town] for the town fallback
 * @returns {null | { tier:'block12'|'block24'|'town', n:number|null, p25:number|null, med:number,
 *   p75:number|null, last:string|null, months:12|24|null, source:'transactions'|'median-series',
 *   quarterIndex?:number }}  null when nothing usable exists.
 */
export function rentComps(blockRents, flatType, policy, townRents = null) {
  const minN = policy.get('rent.comps.min_n');
  const b = decode(blockRents?.[flatType]);
  if (b) {
    const q12 = quartiles(b.n, b.p25, b.med, b.p75, minN);
    if (q12) return { tier: 'block12', ...q12, last: b.last, months: WINDOW, source: 'transactions' };
    const q24 = quartiles(b.n24, b.p25_24, b.med24, b.p75_24, minN);
    if (q24) return { tier: 'block24', ...q24, last: b.last, months: WINDOW_LONG, source: 'transactions' };
  }
  const t = townRents?.[flatType];
  if (!t) return null;
  const qt = quartiles(t.n, t.p25, t.med, t.p75, minN);
  if (qt) return { tier: 'town', ...qt, last: null, months: WINDOW, source: 'transactions' };
  const series = Array.isArray(t.q) ? t.q : [];
  for (let i = series.length - 1; i >= 0; i--) {
    const m = pos(series[i]);
    if (m != null) return { tier: 'town', n: null, p25: null, med: m, p75: null, last: null, months: null, source: 'median-series', quarterIndex: i };
  }
  return null;
}

/**
 * Comparable rents for a drawn area: the block figures of every block inside it, n-weighted.
 * Per block row (same read as the map's block rent): n = 12-month count, else the 24-month count;
 * med = 12-month median, else the 24-month one; p25 / p75 likewise. Quartiles are averaged only over
 * blocks that have all three, and dropped when the averages are out of order.
 * @param {object[]} rows  HDB_RENTS.blocks[bid] of the blocks in the area (missing ones may be omitted)
 * @param {string} flatType
 * @param {{get:(id:string)=>any}} policy  'rent.comps.min_n' = minimum total rentals
 * @returns {null | { tier:'area', n:number, med:number, p25:number|null, p75:number|null, months:12|24,
 *   blocks:number, last:null, source:'transactions' }}
 */
export function areaRentComps(rows, flatType, policy) {
  const minN = policy.get('rent.comps.min_n');
  let n = 0, medSum = 0, qn = 0, p25Sum = 0, p75Sum = 0, blocks = 0, long = false;
  for (const row of rows || []) {
    const b = decode(row?.[flatType]);
    if (!b) continue;
    const n12 = pos(b.n), w = n12 ?? pos(b.n24), med = pos(b.med) ?? pos(b.med24);
    if (w == null || med == null) continue;
    if (n12 == null) long = true;
    n += w; medSum += med * w; blocks += 1;
    const a = pos(b.p25) ?? pos(b.p25_24), z = pos(b.p75) ?? pos(b.p75_24);
    if (a != null && z != null && a <= med && med <= z) { qn += w; p25Sum += a * w; p75Sum += z * w; }
  }
  if (!(n >= minN)) return null;
  const med = medSum / n;
  let p25 = qn > 0 ? p25Sum / qn : null, p75 = qn > 0 ? p75Sum / qn : null;
  if (p25 == null || !(p25 <= med && med <= p75)) { p25 = null; p75 = null; }
  return { tier: 'area', n, med, p25, p75, months: long ? WINDOW_LONG : WINDOW, blocks, last: null, source: 'transactions' };
}

/** Rent at percentile pct (clamped to the stored 25..75), linear between p25 / median / p75. */
const rentAt = (c, pct) => {
  const p = Math.min(Q3_PCT, Math.max(Q1_PCT, pct));
  return p <= MED_PCT
    ? c.p25 + (c.med - c.p25) * (p - Q1_PCT) / (MED_PCT - Q1_PCT)
    : c.med + (c.p75 - c.med) * (p - MED_PCT) / (Q3_PCT - MED_PCT);
};

/** Percentile-ish position of `asking` in the comps (piecewise linear, clamped 0..100); monotone. */
const positionOf = (c, asking) => {
  const lo = c.med - c.p25, hi = c.p75 - c.med;
  const below = lo > 0 ? lo : hi, above = hi > 0 ? hi : lo; // slope fallback for flat segments
  let p;
  if (asking === c.med) p = MED_PCT;
  else if (asking < c.med) p = below > 0 ? MED_PCT - Q1_PCT * (c.med - asking) / below : 0;
  else p = above > 0 ? MED_PCT + Q1_PCT * (asking - c.med) / above : 100;
  return Math.round(Math.min(100, Math.max(0, p)));
};

const TIER_LABEL = {
  block12: (c) => `${c.n} rentals of this flat type in this block, last 12 months`,
  block24: (c) => `${c.n} rentals of this flat type in this block, last 24 months`,
  town: (c) => (c.source === 'median-series'
    ? 'HDB quarterly median rent for this town and flat type'
    : `${c.n} rentals of this flat type in this town, last 12 months`),
  area: (c) => (c.months === WINDOW
    ? `${c.n} rentals in this area, last 12 months (average of block figures)`
    : `${c.n} rentals in this area, last 12–24 months (average of block figures)`),
};

/**
 * Is this asking rent fair against the comps?
 * Bands from policy: 'rent.fair.band_percentiles' (fair), 'rent.verdict.well_above_margin',
 * 'rent.fair.median_only_halfwidth' (when only a median is known).
 * @param {{ asking:number, comps:ReturnType<typeof rentComps> }} x  asking = S$ per month
 * @param {{get:(id:string)=>any}} policy
 * @returns {{ position:number|null, verdict:'below'|'fair'|'above'|'well-above'|'unknown',
 *   band:[number,number]|null, wellAbove:number|null, ratio:number|null,
 *   basis:{ tier:string|null, n:number|null, med:number|null, source:string|null, label:string } }}
 *   position = 0..100 (50 = median; null when only a median is known); ratio = asking / median.
 */
export function fairRent({ asking, comps }, policy) {
  const c = comps && pos(comps.med) != null ? comps : null;
  const basis = c
    ? { tier: c.tier, n: num(c.n), med: c.med, source: c.source, label: TIER_LABEL[c.tier] ? TIER_LABEL[c.tier](c) : '' }
    : { tier: null, n: null, med: null, source: null, label: 'No comparable rentals found' };
  if (!c) return { position: null, verdict: 'unknown', band: null, wellAbove: null, ratio: null, basis };

  const hasQ = pos(c.p25) != null && pos(c.p75) != null && c.p25 <= c.med && c.med <= c.p75;
  let band;
  if (hasQ) {
    const [lo, hi] = policy.get('rent.fair.band_percentiles');
    band = [Math.round(rentAt(c, Math.min(lo, hi))), Math.round(rentAt(c, Math.max(lo, hi)))];
  } else {
    const hw = policy.get('rent.fair.median_only_halfwidth');
    band = [Math.round(c.med * (1 - hw)), Math.round(c.med * (1 + hw))];
  }
  const wellAbove = Math.round(band[1] * (1 + policy.get('rent.verdict.well_above_margin')));

  const a = pos(asking);
  if (a == null) return { position: null, verdict: 'unknown', band, wellAbove, ratio: null, basis };
  const verdict = a < band[0] ? 'below' : a <= band[1] ? 'fair' : a <= wellAbove ? 'above' : 'well-above';
  return { position: hasQ ? positionOf(c, a) : null, verdict, band, wellAbove, ratio: a / c.med, basis };
}

/**
 * Gross rental yield = annual rent / price (before costs, vacancy, tax).
 * @param {{ annualRent:number, price:number }} x
 * @returns {number|null} fraction (0.045 = 4.5%), null on missing / non-positive inputs
 */
export function grossYield({ annualRent, price }) {
  const r = num(annualRent), p = pos(price);
  return r != null && r >= 0 && p != null ? r / p : null;
}

/**
 * Rent as a share of gross monthly household income.
 * @param {{ rent:number, income:number }} x  both monthly S$
 * @returns {number|null} fraction (0.3 = 30%), null on missing / non-positive income
 */
export function rentToIncome({ rent, income }) {
  const r = num(rent), i = pos(income);
  return r != null && r >= 0 && i != null ? r / i : null;
}
