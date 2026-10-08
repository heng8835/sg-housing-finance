// Plan → CPF & retirement: Monte-Carlo range (Phase 6c, AC 11) under "RA at 55" and "CPF LIFE from 65" — the
// P10–P90 of engine/montecarlo.js cpfRange (pay rise and bonus drawn per future; CPF rules fixed). Pro switch,
// off by default (store `plan.mcRange`, shared with the Rent chart). The deterministic KPIs are not changed:
// the range is an extra line under them. Runs in the Web Worker (core/mc.js); when it finishes, the placeholders
// on the page are filled in place (the next render reads the cached result directly).
import { esc, money } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { runMc, mcResult, MC_DRAWS_CPF, MC_FLAG, MC_OUTER_SHARE } from '../../core/mc.js';

const BUYER_KEYS = ['age', 'income', 'citizenship', 'prYears3Plus', 'cpfOa', 'cpfSa', 'cpfMa', 'cpfRa'];
const tokens = new Map();
const failed = new Set();
let tok = 0;

/** Is the range switched on (plan slice)? */
export const rangeOn = (plan) => !!(plan && plan[MC_FLAG.split('.')[1]] === true);

/** The Pro switch (bound by the Plan tab's data-p / data-k change handler). */
export const cpfRangeToggle = (on) => `<label class="check pro-only"><input type="checkbox" data-p="${MC_FLAG}" data-k="check"${on ? ' checked' : ''}> ${t('Show range (Monte-Carlo)')}</label>`;

/**
 * Plain, cloneable worker inputs for one buyer — only what cpfbuy.buyerProjection reads (the plan slimmed to the
 * fields housingShares uses), so the same inputs give the same deterministic numbers.
 */
export function cpfRangeArgs({ buyers, i, plan, settings, defaults, year }) {
  const slimPlan = plan && plan.chosen ? { chosen: { funding: { cpfUsed: plan.chosen.funding.cpfUsed }, monthly: plan.chosen.monthly, tenure: plan.chosen.tenure } } : null;
  const slim = (b) => Object.fromEntries(BUYER_KEYS.filter((k) => b && b[k] !== undefined).map((k) => [k, b[k]]));
  return { buyers: buyers.map(slim), i, plan: slimPlan, settings: { ...(settings || {}) }, defaults: { ...defaults }, year };
}

/** "80% of simulated futures: S$X to S$Y" (or one value when they round to the same). */
export function rangeText(band, monthly = false) {
  if (!band || !Number.isFinite(band.P10) || !Number.isFinite(band.P90)) return '';
  const lo = money(band.P10), hi = money(band.P90), suf = monthly ? t('a month') : '';
  const v = lo === hi ? lo : t('{0} to {1}', [lo, hi]);
  return t('{0}% of simulated futures: {1}', [MC_OUTER_SHARE, suf ? `${v} ${suf}` : v]);
}

const KEYS = { ra55: false, life: true, ra55Buy: false, lifeBuy: true };
const fillHtml = (out, k) => (out && out.bands && out.bands[k] ? esc(rangeText(out.bands[k][0], KEYS[k])) : '');

function fill(token, out) {
  if (typeof document === 'undefined') return;
  document.querySelectorAll(`[data-mc="${token}"]`).forEach((el) => { el.innerHTML = fillHtml(out, el.dataset.mcK); el.removeAttribute('aria-busy'); });
}

/**
 * Range state for one buyer card: `slot(k)` gives the line under a KPI (k = ra55 | life | ra55Buy | lifeBuy).
 * Starts the worker job when needed; returns '' slots when the switch is off.
 */
export function cpfRangeSlots(on, x, policy) {
  if (!on) return { slot: () => '' };
  const args = cpfRangeArgs(x), opts = { n: MC_DRAWS_CPF }, key = JSON.stringify(args);
  if (!tokens.has(key)) tokens.set(key, `cpfmc${++tok}`);
  const token = tokens.get(key), out = mcResult('cpf', args, opts);
  if (!out && !failed.has(key)) {
    runMc('cpf', args, policy, opts).then((r) => fill(token, r), (err) => { console.warn('Monte-Carlo range', err); failed.add(key); fill(token, null); });
  }
  const slot = (k) => {
    const body = out ? fillHtml(out, k) : failed.has(key) ? '' : esc(t('Simulating futures…'));
    return `<small class="pro-only mc-range" data-mc="${token}" data-mc-k="${k}"${out ? '' : ' aria-busy="true"'}>${body}</small>`;
  };
  return { slot };
}

/** The note under the section when the range is on. */
export const cpfRangeNote = (on) => (on
  ? `<p class="hint pro-only">${esc(t('Ranges: {0} simulated futures, each with its own career-average pay rise and bonus around the values above. CPF interest and contribution rules are fixed by rule and not varied. Illustrative, not a forecast.', [MC_DRAWS_CPF.toLocaleString('en-SG')]))}</p>`
  : '');
