// Rent → "Rent or buy?" Monte-Carlo range (Phase 6c, AC 11): the Pro toggle, the one-sentence summary and the
// note under the chart. The numbers come from engine/montecarlo.js (rentBuyRange) via core/mc.js (Web Worker);
// the deterministic lines, verdict and table are never changed by it. Pure string helpers (tests/rent/range.test.js).
import { esc, money, pct } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { MC_OUTER_SHARE } from '../../core/mc.js';

export { MC_FLAG } from '../../core/mc.js';

const count = (n) => Number(n).toLocaleString('en-SG');

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
  return `${main} ${t('Buying comes out ahead in {0} of them.', [pct(out.buyAheadShare)])}`;
}

/** What varies, what the shading means, and that it is illustrative. */
export function rangeNote(out) {
  const s = (out && out.spread) || {};
  const what = s.rateStep > 0
    ? t('Each simulated future draws a different home-price growth, rent growth and investment return every year around the chosen outlook, and lets the bank loan rate drift.')
    : t('Each simulated future draws a different home-price growth, rent growth and investment return every year around the chosen outlook.');
  return `${what} ${t('Shaded: {0}% of futures; darker: the middle half. The spreads are illustrative assumptions, not a forecast.', [MC_OUTER_SHARE])}`;
}

/** The block under the chart: sentence + note, a "simulating" line while the worker runs, or a failure note. */
export function rangeBlock(state, out) {
  if (state === 'pending') return `<p class="hint pro-only rb-mc-out" aria-live="polite">${esc(t('Simulating futures…'))}</p>`;
  if (state === 'error') return `<p class="hint pro-only rb-mc-out">${esc(t('The range could not be calculated.'))}</p>`;
  if (state !== 'done' || !out) return '';
  return `<p class="pro-only rb-mc-out" aria-live="polite">${esc(rangeSentence(out))}</p><p class="hint pro-only">${esc(rangeNote(out))}</p>`;
}
