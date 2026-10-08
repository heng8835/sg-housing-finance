// Afford → "True monthly cost": what owning the focus flat costs in a typical month — instalment,
// property tax, S&CC, utilities, HPS, HDB fire insurance — as a list + one thin stacked bar, a total,
// and the floating-rate risk band from 3M SORA. Every number comes from engine/monthly-cost.js and
// policy values (cost.*); this file only picks inputs, adds lines up and lays them out. Property tax uses the
// Annual Value from the IRAS notice when typed, else an estimate from a typical rent (labelled "Estimated").
import { monthlyCost, propertyTax, rateRisk, flatKey } from '../../engine/monthly-cost.js';
import { sccRateFor, costInput } from '../../engine/scenario.js';
import { esc, money } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { ftWord } from '../../core/typical.js';
import { moneyInput, moneyValue } from '../../core/moneyinput.js';

// One calm hue family: the map's blue ramp for the large lines, greys for the small ones (tokens in styles/modules.css).
export const SWATCH = { mortgage: 'var(--mc-1)', 'property-tax': 'var(--mc-2)', scc: 'var(--mc-3)', utilities: 'var(--mc-4)', hps: 'var(--mc-5)', fire: 'var(--mc-6)', maintenance: 'var(--mc-6)' };
const LABEL = {
  mortgage: 'Loan instalment', 'property-tax': 'Property tax', scc: 'Service & conservancy charges (S&CC)',
  utilities: 'Electricity and water', hps: 'Home Protection Scheme (HPS)', fire: 'HDB fire insurance', maintenance: 'Maintenance',
};
const TERM = { mortgage: 'instalment', 'property-tax': 'property-tax', scc: 'scc', hps: 'hps' };
const SOURCE_IDS = ['cost.ptax.owner_occupied.bands', 'cost.ptax.rebate', 'cost.ptax.av_rent_factor', 'cost.scc.monthly', 'cost.scc.reduced_eligibility', 'cost.utilities.consumption', 'cost.utilities.electricity_tariff',
  'cost.utilities.water_price', 'cost.gst.rate', 'cost.hps.example', 'cost.fire.premium', 'cost.fire.term_years', 'cost.sora3m.band', 'cost.sora.spread'];

const term = (id, text) => `<span data-term="${id}">${text}</span>`;
const rate2 = (r) => `${(r * 100).toFixed(2)}%`;
const cents = (v) => `S$${v.toFixed(2)}`;
const fmt = (v) => (v == null ? '—' : v > 0 && v < 1 ? t('under {0}', ['S$1']) : money(v));
const label = (id) => t(LABEL[id] || id);

// ---- pure helpers (tests/afford/monthly.test.js) ----

// sccRateFor / costInput live in engine/scenario.js so the scenario compare table uses the very same input
export { sccRateFor, costInput };

/** Property-tax line tag: 'Estimated' (from a typical rent) / 'From your notice' (typed AV) / null. */
export function avTag(cost) {
  return cost.avSource === 'estimate' ? { cls: 'neutral', text: 'Estimated' } : cost.avSource === 'notice' ? { cls: 'info', text: 'From your notice' } : null;
}

/** Bar segments: the lines with a positive amount and their share of those lines' sum (shares add up to 1). */
export function segments(items) {
  const parts = items.filter((i) => i.monthly > 0);
  const sum = parts.reduce((s, i) => s + i.monthly, 0);
  return parts.map((i) => ({ id: i.id, monthly: i.monthly, share: sum > 0 ? i.monthly / sum : 0 }));
}

/**
 * Monthly total now and with the instalment at each end of the SORA band (every other line unchanged).
 * @returns {{ now:number, low:number, median:number, high:number, rises:boolean }|null}
 */
export function riskTotals(cost, risk) {
  if (!risk || !risk.current) return null;
  const loanLine = cost.items.find((i) => i.id === 'mortgage');
  const rest = cost.total - ((loanLine && loanLine.monthly) || 0);
  const now = cost.total, high = rest + risk.high.monthly;
  return { now, low: rest + risk.low.monthly, median: rest + risk.median.monthly, high, rises: high > now };
}

// ---- rendering ----

function basis(i, ctx) {
  const { x, policy, plan, key, cost } = ctx;
  if (i.id === 'mortgage') {
    if (!(x.loan.amount > 0)) return t('No loan in this plan.');
    return t('{0}: {1} at {2} a year over {3} years.', [plan.chosen.loanType === 'hdb' ? t('HDB loan') : t('Bank loan'), money(x.loan.amount), rate2(x.loan.rate), x.loan.years]);
  }
  if (i.id === 'property-tax') {
    if (i.monthly == null) return '';
    const pt = propertyTax({ annualValue: cost.avUsed, ownerOccupied: true, hdb: key !== 'PRIVATE' }, policy);
    return pt.rebate > 0
      ? t('Owner-occupier rates on an Annual Value of {0}: {1} a year, less a {2} rebate.', [money(cost.avUsed), money(pt.gross), money(pt.rebate)])
      : t('Owner-occupier rates on an Annual Value of {0}: {1} a year.', [money(cost.avUsed), money(pt.gross)]);
  }
  if (i.id === 'scc') {
    const [lo, hi] = i.range;
    return x.sccRate === 'normal'
      ? t('Mid-point of the normal rate (no Singapore Citizen buyer) across sampled town councils: {0} to {1} a month. Your town council sets the exact rate.', [cents(lo), cents(hi)])
      : t('Mid-point of the citizen (reduced) rate for this flat type across sampled town councils: {0} to {1} a month. Your town council sets the exact rate.', [cents(lo), cents(hi)]);
  }
  if (i.id === 'utilities') {
    const use = policy.get('cost.utilities.consumption')[key];
    return t('Average use for this flat type: {0} kWh electricity and {1} m³ water a month, at current tariffs incl. GST. Excludes gas and U-Save rebates.', [use.kwh, use.m3]);
  }
  if (i.id === 'hps') {
    const ex = policy.get('cost.hps.example');
    return t("Indicative only: CPF's example premium ({0} a year for {1} cover, age {2}, {3}-year loan) scaled to your loan. Real premiums depend on age, gender and term.", [cents(ex.annualPremium), money(ex.cover), ex.age, ex.years]);
  }
  if (i.id === 'fire') {
    return t('{0} per {1}-year term for this flat type, shown per month.', [cents(policy.get('cost.fire.premium')[key]), policy.get('cost.fire.term_years')]);
  }
  return '';
}

function row(i, ctx) {
  const name = TERM[i.id] ? term(TERM[i.id], label(i.id)) : label(i.id);
  const why = basis(i, ctx);
  const missing = i.id === 'property-tax' && i.monthly == null
    ? `<small>${t('Needs the Annual Value from your IRAS property tax notice — not estimated here.')}</small>` : '';
  const tag = i.id === 'property-tax' && i.monthly != null ? avTag(ctx.cost) : null;
  // the estimate's basis shows in Simple too: the number is ours, not IRAS's
  const est = tag && ctx.cost.avSource === 'estimate' && ctx.x.marketMonthlyRent
    ? `<small class="mc-est">${esc(t('Annual Value estimated as 12 × typical rent for a {0} here ({1} → {2}). IRAS sets the real figure on your notice.', [ftWord(ctx.x.flatType), money(ctx.x.marketMonthlyRent), money(ctx.cost.avUsed)]))}</small>` : '';
  return `<li><i class="sw" style="background:${SWATCH[i.id] || 'var(--mc-6)'}" aria-hidden="true"></i><span>${name}${tag ? ` <span class="tag ${tag.cls} mc-tag">${t(tag.text)}</span>` : ''}</span><b>${fmt(i.monthly)}</b>${missing}${est}${why ? `<small class="pro-only">${esc(why)}</small>` : ''}</li>`;
}

function bar(cost) {
  const segs = segments(cost.items);
  if (!segs.length) return '';
  const aria = t('Monthly cost split: {0}', [segs.map((s) => `${label(s.id)} ${fmt(s.monthly)}`).join(', ')]);
  return `<div class="mc-bar" role="img" aria-label="${esc(aria)}">${segs.map((s) => `<span style="flex-grow:${s.share};background:${SWATCH[s.id] || 'var(--mc-6)'}"></span>`).join('')}</div>`;
}

function riskBlock(cost, risk, plan, mode = 'pro') {
  const simple = mode === 'simple'; // B10: no "SORA" / "CPF OA" in Simple
  if (!risk) return '';
  const r = riskTotals(cost, risk);
  const line = r.rises
    ? `<b>${esc(t('{0} → {1}/mo if rates rise', [money(r.now), money(r.high)]))}</b>`
    : esc(t(simple ? 'Your rate is already at or above the highest recent bank rate.' : 'Your rate is already at or above the top of the recent SORA range.'));
  const hdb = plan.chosen.loanType === 'hdb'
    ? `<p class="hint">${t(simple ? 'HDB loan rates follow the CPF interest rate, not bank rates; this shows the same loan at floating bank rates.' : 'HDB loan rates follow the CPF OA rate, not SORA; this shows the same loan at floating bank rates.')}</p>` : '';
  const at = (name, x, total) => `<tr><td>${name}</td><td>${rate2(x.rate)}</td><td>${money(x.monthly)}</td><td>${money(total)}</td></tr>`;
  return `<p class="mc-risk">${line} ${term('sora', '')}</p>${hdb}
    <div class="pro-only">
      <p class="hint">${t('3-month compounded SORA from {0} to {1} ({2} daily readings), plus an assumed bank spread of {3}. Lowest SORA {4}, highest {5}.', [esc(risk.window.from), esc(risk.window.to), risk.window.observations, rate2(risk.spread), rate2(risk.sora.min), rate2(risk.sora.max)])}</p>
      <table class="mini"><thead><tr><th></th><th>${t('Rate')}</th><th>${t('Instalment')}</th><th>${t('Total a month')}</th></tr></thead><tbody>
        ${at(t('SORA low'), risk.low, r.low)}${at(t('SORA median'), risk.median, r.median)}${at(t('SORA high'), risk.high, r.high)}${at(t('Your rate now'), risk.current, r.now)}
      </tbody></table>
    </div>`;
}

function sources(policy) {
  const rows = SOURCE_IDS.map((id) => { try { return policy.meta(id); } catch { return null; } }).filter(Boolean);
  const flag = (p) => (p.status === 'VERIFIED' ? '' : ` <span class="tag ${p.status === 'ASSUMPTION' ? 'neutral' : 'warn'}">${t(p.status.toLowerCase())}</span>`);
  return `<details class="fold-inline sources pro-only" data-fold="mcSources"><summary>${t('Sources for these costs ({0}/{1} verified)', [rows.filter((p) => p.status === 'VERIFIED').length, rows.length])}</summary>
    <ul>${rows.map((p) => `<li>${esc(p.id)}${flag(p)} — ${String(p.source_url).startsWith('http') ? `<a href="${esc(p.source_url)}" target="_blank" rel="noopener">${t('source')}</a>` : t('modelling assumption')}, ${t('from')} ${esc(p.effective_from)}</li>`).join('')}</ul></details>`;
}

/**
 * HTML for the panel. Call bindMonthly(root, setFocus) after inserting it.
 * @param {{ plan:object, focus:object, household:object, policy:object }} x
 */
export function monthlyPanel({ plan, focus, household, policy, market = null, mode = 'pro' }) {
  const head = `<h3>${t('True monthly cost')}</h3>`;
  let x, cost, risk = null, body;
  try {
    x = costInput({ plan, focus, household, market, policy });
    cost = monthlyCost(x, policy);
    if (x.loan.amount > 0) risk = rateRisk({ loan: x.loan.amount, years: x.loan.years, rate: x.loan.rate }, policy);
    const ctx = { x, policy, plan, key: flatKey(x.flatType), cost };
    body = cost.items.map((i) => row(i, ctx)).join('');
  } catch {
    return `<div class="section">${head}<p class="hint">${t('Monthly running costs are unavailable: a rule value is missing.')}</p></div>`;
  }
  const noTax = cost.items.some((i) => i.id === 'property-tax' && i.monthly == null);
  return `<div class="section monthly" id="affordMonthly">${head}
    <p class="sec-sub">${t('What owning this flat costs in a typical month, not just the loan.')}</p>
    <p class="mc-head"><b>${esc(t('{0}/mo', [money(cost.total)]))}</b>${noTax ? ` <span>${t('excl. property tax')}</span>` : ''}</p>
    ${bar(cost)}
    <ul class="mc-list">${body}</ul>
    ${avField(x, policy)}
    ${riskBlock(cost, risk, plan, mode)}
    <ul class="hint mc-assume pro-only">
      <li>${t('Assumes you live in the flat (owner-occupier property tax rates).')}</li>
      <li>${t('IRAS sets an HDB flat\'s Annual Value from market rents of similar flats (unfurnished); your notice has the exact figure.')}</li>
      <li>${t('Excludes renovation, furniture, gas, home contents insurance and Government rebates. Lines are rounded, so they may not add up exactly to the total.')}</li>
    </ul>
    ${sources(policy)}
  </div>`;
}

/** Annual Value override: placeholder = the estimate; "Use the estimate" clears a typed value when one exists. */
function avField(x, policy) {
  const est = x.marketMonthlyRent ? monthlyCost({ ...x, annualValue: null }, policy).avUsed : null;
  const ph = est != null ? t('est. {0}', [Math.round(est).toLocaleString('en-SG')]) : t('from your IRAS notice');
  const back = x.annualValue != null && est != null ? `<p class="hint mc-back"><button type="button" class="link" id="mcAvClear">${t('Use the estimate')}</button></p>` : '';
  return `<div class="fields"><label class="f mc-av wide"><span>${t('Annual Value from your IRAS notice (S$ a year, optional)')}</span>${moneyInput({ attrs: 'id="mcAv"', value: x.annualValue ?? null, placeholder: ph })}</label></div>${back}`;
}

/** Wire the Annual Value input; setFocus(patch) merges into the store's focus flat (stays in the browser). */
export function bindMonthly(root, setFocus) {
  root.querySelector('#mcAv')?.addEventListener('change', (e) => {
    const v = moneyValue(e.target); // separators allowed (core/moneyinput.js); not valid → nothing changes
    if (Number.isNaN(v)) return;
    setFocus({ annualValue: Number.isFinite(v) && v > 0 ? v : null });
  });
  root.querySelector('#mcAvClear')?.addEventListener('click', () => setFocus({ annualValue: null }));
}
