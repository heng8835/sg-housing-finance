// Rent → "Rent or buy?" Monte-Carlo range (Phase 6c, AC 11): the Pro toggle, the one-sentence summary and the
// note under the chart. The numbers come from engine/montecarlo.js (rentBuyRange) via core/mc.js (Web Worker);
// the deterministic lines, verdict and table are never changed by it. Pure string helpers (tests/rent/range.test.js).
import { esc, money, pct } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { MC_OUTER_SHARE } from '../../core/mc.js';

export { MC_FLAG } from '../../core/mc.js';

const count = (n) => Number(n).toLocaleString('en-SG');

// 7c C8 — UI assumptions for the range (illustrative, not rules; named here, never in the policy file):
/** Years left on the lease below which a flat is assumed to lose value in step with its lease in the simulated futures. */
export const LEASE_DRIFT_FROM = 60;
/** The range is hidden when its P10–P90 spread at the end is below this share of the larger median net worth. */
export const COLLAPSE_SHARE = 0.01;
/** Shares this close to 0 or 1 are said in words ("almost all"), never as "100%" or "0%". */
export const SHARE_EDGE = 0.005;

/**
 * Per-year value drift of an old lease (engine/montecarlo.js rentBuyDraws `leaseDrift`), or null when the lease is
 * unknown or stays at LEASE_DRIFT_FROM years or more over the horizon. Assumption: below LEASE_DRIFT_FROM years left,
 * value ∝ years left ÷ LEASE_DRIFT_FROM on top of the price outlook — e.g. 50 → 49 years left = about −2% that year.
 */
export function leaseDrift(lease, horizon) {
  const L = Number(lease), H = Math.max(1, Math.floor(Number(horizon) || 0));
  if (!Number.isFinite(L) || L <= 0) return null;
  const f = (r) => Math.min(1, Math.max(0, r) / LEASE_DRIFT_FROM);
  const out = Array.from({ length: H }, (_, i) => { const a = f(L - i), b = f(L - i - 1); return a > 0 ? b / a - 1 : 0; });
  return out.some((v) => v < 0) ? out : null;
}

/** True when the simulated futures barely differ (the band would be a line): the range is then not shown. */
export function rangeCollapsed(out) {
  const b = out && out.bands, last = (k) => b && b[k] && b[k][b[k].length - 1];
  const d = last('diff'), buy = last('buy'), rent = last('rent');
  if (!d || !Number.isFinite(d.P10) || !Number.isFinite(d.P90)) return false;
  const scale = Math.max(Math.abs(buy?.P50 || 0), Math.abs(rent?.P50 || 0), Math.abs(d.P50 || 0));
  return scale > 0 ? d.P90 - d.P10 < COLLAPSE_SHARE * scale : d.P90 === d.P10;
}

/** "Buying comes out ahead in 64% of them." — "almost all" / "almost none" at the edges (never "100%"). */
function aheadText(share) {
  if (!Number.isFinite(share)) return '';
  if (share >= 1 - SHARE_EDGE) return t('Buying comes out ahead in almost all of them.');
  if (share <= SHARE_EDGE) return t('Buying comes out ahead in almost none of them.');
  return t('Buying comes out ahead in {0} of them.', [pct(share)]);
}

/** The Pro-only switch above the chart. */
export function rangeToggle(on) {
  return `<label class="check pro-only rb-mc"><input type="checkbox" id="rbMc"${on ? ' checked' : ''}> ${t('Show range (Monte-Carlo)')}</label>`;
}

/**
 * One sentence: where buying ends relative to renting in the middle 80% of futures, and how often buying wins.
 * @param {{ n:number, horizon:number, bands:{ diff:{P10:number,P90:number}[] }, buyAheadShare:number }} out rentBuyRange() result
 */
export function rangeSentence(out) {
  const d = out && out.bands && out.bands.diff && out.bands.diff[out.bands.diff.length - 1];
  if (!d || !Number.isFinite(d.P10) || !Number.isFinite(d.P90)) return '';
  const share = MC_OUTER_SHARE, n = count(out.n), yrs = out.horizon;
  const main = d.P10 >= 0
    ? t('In {0}% of {1} simulated futures, buying ends between {2} and {3} ahead of renting after {4} years.', [share, n, money(d.P10), money(d.P90), yrs])
    : d.P90 < 0
      ? t('In {0}% of {1} simulated futures, renting ends between {2} and {3} ahead of buying after {4} years.', [share, n, money(-d.P90), money(-d.P10), yrs])
      : t('In {0}% of {1} simulated futures, the result after {2} years ranges from renting {3} ahead to buying {4} ahead.', [share, n, yrs, money(-d.P10), money(d.P90)]);
  return `${main} ${aheadText(out.buyAheadShare)}`.trim();
}

/** What varies, what the shading means, and that it is illustrative. */
export function rangeNote(out) {
  const s = (out && out.spread) || {};
  const what = s.rateStep > 0
    ? t('Each simulated future draws a different home-price growth, rent growth and investment return every year around the chosen outlook, and lets the bank loan rate drift.')
    : t('Each simulated future draws a different home-price growth, rent growth and investment return every year around the chosen outlook.');
  const lease = out && Array.isArray(out.leaseDrift) && out.leaseDrift.length
    ? ` ${t('Old lease: below {0} years left, the flat is assumed to lose value in step with its lease (an assumption).', [LEASE_DRIFT_FROM])}` : '';
  return `${what}${lease} ${t('Shaded: {0}% of futures; darker: the middle half. The spreads are illustrative assumptions, not a forecast.', [MC_OUTER_SHARE])}`;
}

/** The block under the chart: sentence + note, a "simulating" line while the worker runs, or a failure note. */
export function rangeBlock(state, out) {
  if (state === 'pending') return `<p class="hint pro-only rb-mc-out" aria-live="polite">${esc(t('Simulating futures…'))}</p>`;
  if (state === 'error') return `<p class="hint pro-only rb-mc-out">${esc(t('The range could not be calculated.'))}</p>`;
  if (state !== 'done' || !out) return '';
  if (rangeCollapsed(out)) return `<p class="hint pro-only rb-mc-out">${esc(t('The simulated futures barely differ here, so no range is shown.'))}</p>`;
  return `<p class="pro-only rb-mc-out" aria-live="polite">${esc(rangeSentence(out))}</p><p class="hint pro-only">${esc(rangeNote(out))}</p>`;
}
