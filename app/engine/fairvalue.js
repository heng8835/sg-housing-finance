// Fair value v2 — "is it over-priced?" (phase 6b, spec phase6-journeys.md AC 8).
// Pure: no DOM, no Date, no policy values. Input = the comparable sales the tiered benchmark already
// selected (explore/comparables.js: block → nearby similar lease → town; same flat type; no time
// adjustment), as $psf values. Output = the spread of those sales (P25 / P50 / P75, linear
// interpolation between order statistics, i.e. numpy's default) in $psf and in S$ for the flat's
// area, where the asking $psf sits among them (0–100) and a plain verdict band.
// The minimum number of sales is a UI heuristic and is passed in (minN), not a rule.
// Engines return English; the 中文 strings live in i18n/zh-engine.json.

// percentile anchors (0–100 scale)
const MED_PCT = 100 / 2;
const Q1_PCT = MED_PCT / 2;
const Q3_PCT = MED_PCT + Q1_PCT;

/** Verdict bands → plain English (translated in the UI with t()). */
export const VERDICT = {
  below: 'below most comparable sales',
  usual: 'in the usual range',
  above: 'above most comparable sales',
  thin: 'not enough sales',
};

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const ascending = (values) => (values || []).filter(finite).slice().sort((a, b) => a - b);

/**
 * p-th percentile (0–100) of an ascending array, linear interpolation between order statistics
 * (rank = p/100 · (n − 1)). p = 50 equals the usual median (mean of the two middle values when n is even).
 * @returns {number|null} null for an empty array
 */
export function quantile(sorted, p) {
  const n = sorted.length;
  if (!n) return null;
  const h = (Math.min(Math.max(p, 0), 100) / 100) * (n - 1);
  const lo = Math.floor(h), hi = Math.ceil(h);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
}

/**
 * Where x sits among the values, 0–100: the inverse of quantile(). Below the cheapest = 0, above the
 * dearest = 100; between two sales it is interpolated; equal to one or more sales (ties) = the middle
 * of the tied run. Consistent with the bands: x < P25 ⇒ percentile < 25, x > P75 ⇒ percentile > 75.
 * @param {number[]} values  any order
 * @returns {number|null} null when fewer than 2 values or x is not a number
 */
export function percentileOf(values, x) {
  const a = ascending(values), n = a.length;
  if (n < 2 || !finite(x)) return null;
  let lo = 0;
  while (lo < n && a[lo] < x) lo++;
  let hi = lo;
  while (hi < n && a[hi] === x) hi++;
  let rank;
  if (hi > lo) rank = (lo + hi - 1) / 2;          // ties: middle of the run a[lo..hi-1]
  else if (lo === 0) rank = 0;                    // below every sale
  else if (lo === n) rank = n - 1;                // above every sale
  else rank = lo - 1 + (x - a[lo - 1]) / (a[lo] - a[lo - 1]);
  return (rank / (n - 1)) * 100;
}

/** 'below' (x < p25) · 'usual' (p25 ≤ x ≤ p75) · 'above' (x > p75); null when anything is missing. */
export function verdictBand(x, p25, p75) {
  if (!finite(x) || !finite(p25) || !finite(p75)) return null;
  return x < p25 ? 'below' : x > p75 ? 'above' : 'usual';
}

/**
 * Fair value v2 for one flat.
 * @param {object} a
 * @param {number[]} a.psfs       $psf of the comparable sales (any order)
 * @param {number} a.sqft         the flat's floor area in sqft (S$ = $psf × sqft)
 * @param {number} a.askingPsf    asking price ÷ sqft
 * @param {number} a.minN         fewer sales than this → band 'thin' ("not enough sales"), no percentile
 * @param {*} [a.tier]            passed through (benchmark tier 1–6)
 * @param {*} [a.window]          passed through (e.g. { months: 12 })
 * @returns {{ n:number, enough:boolean, p25:number|null, p50:number|null, p75:number|null,
 *   price:{ p25:number|null, p50:number|null, p75:number|null }, percentile:number|null,
 *   band:'below'|'usual'|'above'|'thin', verdict:string, tier:*, window:* }}
 *   Quartiles are given whenever there is at least one sale (also when thin, for the list header).
 */
export function fairValue({ psfs, sqft, askingPsf, minN, tier = null, window = null }) {
  const a = ascending(psfs), n = a.length;
  const p25 = quantile(a, Q1_PCT), p50 = quantile(a, MED_PCT), p75 = quantile(a, Q3_PCT);
  const area = finite(sqft) && sqft > 0 ? sqft : null;
  const toPrice = (v) => (v == null || area == null ? null : v * area);
  const enough = n >= Math.max(minN, 2) && finite(askingPsf);
  const band = enough ? verdictBand(askingPsf, p25, p75) : 'thin';
  return {
    n, enough, p25, p50, p75,
    price: { p25: toPrice(p25), p50: toPrice(p50), p75: toPrice(p75) },
    percentile: enough ? percentileOf(a, askingPsf) : null,
    band, verdict: VERDICT[band], tier, window,
  };
}
