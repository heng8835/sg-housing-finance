// Plan tab — CPF & retirement: per buyer, a projection to the CPF LIFE payout age with and without
// the focus purchase (OA used upfront + monthly instalments), RA at 55 vs BRS / FRS / ERS, CPF LIFE range.
import { buyerProjection, projectedBuyers, housingShares, atPayoutAge, enteredPayout } from '../../engine/cpfbuy.js';
import { lifePayoutDelta } from '../../engine/cpfpayout.js';
import { planPurchase } from '../../engine/plan.js';
import { esc, money } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { field, pctIn, numIn, moneyIn, selIn } from './ui.js';
import { defaultNote, ftWord } from '../../core/typical.js';
import { missingFields, needPrompt } from '../../core/missing.js';
import { householdLink } from '../../core/filllink.js';
import { DEFAULT_WAGE_GROWTH, DEFAULT_BONUS_MONTHS, CPF_DEFAULTS } from '../../core/cpf-defaults.js';
import { rangeOn, cpfRangeToggle, cpfRangeSlots, cpfRangeNote } from './cpfrange.js';

// modelling defaults, not rules (editable in the section) — shared with the scenario compare table
export { DEFAULT_WAGE_GROWTH, DEFAULT_BONUS_MONTHS };
const PR_YEARS = [['PR1', '1st year as PR'], ['PR2', '2nd year as PR'], ['PR3+', '3rd year or later']];

const metTag = (ok, label) => `<span class="tag ${ok ? 'good' : 'neutral'}">${ok ? '✓' : '✕'} ${label}</span>`;

function rowsTable(a, b, phone = false) {
  const pick = (rows) => rows.filter((r, i) => r.age % 5 === 0 || i === rows.length - 1);
  const byAge = new Map(b ? b.rows.map((r) => [r.age, r]) : []);
  // phone (AC1): five money columns do not fit 360 px — one block per age, the same figures as label / value pairs
  if (phone) {
    const pair = (label, v) => `<div><dt>${label}</dt><dd>${v}</dd></div>`;
    return `<div class="cpf-rows pro-only">${pick(a.rows).map((r) => `<div class="cpf-age"><h5>${t('Age {0}', [r.age])}</h5><dl>${pair('OA', money(r.oa))}${pair('SA / RA', money(r.sa + r.ra))}${pair(t('Total'), money(r.total))}${b ? pair(t('Total if you buy'), byAge.has(r.age) ? money(byAge.get(r.age).total) : '—') : ''}</dl></div>`).join('')}</div>`;
  }
  return `<table class="mini pro-only"><thead><tr><th>${t('Age')}</th><th>OA</th><th>SA / RA</th><th>${t('Total')}</th>${b ? `<th>${t('Total if you buy')}</th>` : ''}</tr></thead><tbody>
    ${pick(a.rows).map((r) => `<tr><td>${r.age}</td><td>${money(r.oa)}</td><td>${money(r.sa + r.ra)}</td><td>${money(r.total)}</td>${b ? `<td>${byAge.has(r.age) ? money(byAge.get(r.age).total) : '—'}</td>` : ''}</tr>`).join('')}
  </tbody></table>`;
}

// Buyer already at the CPF LIFE payout age (Phase 7 A10): payouts may have started — no work assumption, no
// "RA at 55", no projection; the payout they enter (household buyer.cpfLifeMonthly, optional) is shown instead.
const started = (b, policy) => b.citizenship !== 'F' && atPayoutAge(b, policy);

function payoutCard(b, i, { buyers, plan, mode = 'pro' }) {
  const name = t('Buyer {0}', [i + 1]);
  const v = enteredPayout(b), share = housingShares(buyers, i, plan);
  const shown = v == null ? '—' : money(v);
  return `<fieldset class="buyer"><legend>${name} · ${t('age {0}', [+b.age])}</legend>
    <p class="hint">${t('You may already receive CPF LIFE — enter your monthly payout (optional).')}</p>
    <div class="fields">${field(t('CPF LIFE payout you receive (S$ a month, optional)'), moneyIn(`household.buyers.${i}.cpfLifeMonthly`, b.cpfLifeMonthly))}</div>
    <div class="kpis">
      <div class="kpi"><small>${t('CPF LIFE you receive, per month')}</small><b>${shown}</b><small>${v == null ? t('not entered') : t('as you entered')}</small></div>
      ${share ? `<div class="kpi"><small>${t('CPF LIFE if you buy this flat')}</small><b>${shown}</b><small>${t('no change: payouts have started')}</small></div>` : ''}
    </div>
    ${share && share.oaUpfront > 0 ? `<p class="hint">${t(mode === 'simple' ? "This flat uses about {0} of this buyer's CPF Ordinary Account upfront; that does not change a CPF LIFE payout that has started." : 'This flat uses about {0} of OA upfront from this buyer; OA savings do not change a CPF LIFE payout that has started.', [money(share.oaUpfront)])}</p>` : ''}
  </fieldset>`;
}

function buyerCard(b, i, { buyers, plan, settings, policy, year, mcOn, mode = 'pro', phone = false }) {
  if (started(b, policy)) return payoutCard(b, i, { buyers, plan, mode });
  const simple = mode === 'simple'; // B10: Retirement Account / Ordinary Account spelled out in Simple
  const age = +b.age;
  // same calls as the scenario compare table (engine/cpfbuy.js)
  const { residency, without, withBuy, share } = buyerProjection({ buyers, i, plan, settings, defaults: CPF_DEFAULTS, year }, policy);
  const name = t('Buyer {0}', [i + 1]);
  const prSel = b.citizenship === 'PR' ? field(t('Year as PR'), selIn(`plan.cpf.prYear.${i}`, PR_YEARS, residency)) : '';
  const A65 = policy.get('cpf.age.life_payout');
  if (!without.applicable) {
    return `<fieldset class="buyer"><legend>${name} · ${t('Foreigner')}</legend>
      <p class="hint">${esc(t(without.reason))} ${t('SRS contributions up to {0} a year get tax relief.', [money(without.srsAnnualCap)])}</p></fieldset>`;
  }
  const short = withBuy ? withBuy.rows.reduce((s, r) => s + r.cashShortfall, 0) : 0;
  const k55 = (r) => r.at55;
  const lifeTxt = (r) => (!r.life ? '—' : r.life.monthlyLow === r.life.monthlyHigh ? money(r.life.monthly) : `${money(r.life.monthlyLow)}–${money(r.life.monthlyHigh)}`);
  // phone (P-47): the sums spelled out — "✓ Basic (BRS)" — on their own lines; desktop keeps the short tags
  const [brs, frs, ers] = phone ? [t('Basic (BRS)'), t('Full (FRS)'), t('Enhanced (ERS)')] : ['BRS', 'FRS', 'ERS'];
  const at55 = (r) => (k55(r) ? `${money(r.at55.raFormed)}<small${phone ? ' class="cpf-sums"' : ''}>${metTag(r.at55.metBRS, brs)} ${metTag(r.at55.metFRS, frs)} ${metTag(r.at55.metERS, ers)}${r.at55.projectedSums ? ` · ${t('sums projected')}` : ''}</small>` : `<small>${t('already past 55')}</small>`);
  // Monte-Carlo range lines (Pro switch; '' when off — the KPIs above them are unchanged)
  const mc = cpfRangeSlots(mcOn, { buyers, i, plan, settings, defaults: CPF_DEFAULTS, year }, policy);
  const rng = (r, k) => (r && (k.startsWith('ra') ? k55(r) : r.life) ? mc.slot(k) : '');
  return `<fieldset class="buyer"><legend>${name} · ${t('age {0}', [age])}</legend>
    ${prSel ? `<div class="fields">${prSel}</div>` : ''}
    <div class="kpis">
      <div class="kpi"><small>${t('Retirement Account at 55')}</small><b>${at55(without)}</b>${rng(without, 'ra55')}</div>
      <div class="kpi"><small>${t('CPF LIFE from {0}, per month (estimate)', [A65])}</small><b>${lifeTxt(without)}</b>${rng(without, 'life')}</div>
      ${withBuy ? `<div class="kpi"><small>${simple ? t('Retirement Account at 55 if you buy this flat') : t('RA at 55 if you buy this flat')}</small><b>${at55(withBuy)}</b>${rng(withBuy, 'ra55Buy')}</div>
      <div class="kpi"><small>${t('CPF LIFE if you buy this flat')}</small><b>${lifeTxt(withBuy)}</b>${rng(withBuy, 'lifeBuy')}</div>` : ''}
    </div>
    ${share ? `<p class="hint">${t(simple ? "This flat uses about {0} of this buyer's CPF Ordinary Account upfront and {1} a month for {2} years." : 'This flat uses about {0} of OA upfront and {1} a month for {2} years from this buyer.', [money(share.oaUpfront), money(share.monthlyFromOa), share.tenure])}${short > 0 ? ` <b>${t(simple ? 'The CPF Ordinary Account runs short by {0} in total — that part is paid in cash.' : 'OA runs short by {0} in total — that part is paid in cash.', [money(short)])}</b>` : ''}</p>` : ''}
    ${rowsTable(without, withBuy, phone)}
  </fieldset>`;
}

// Household headline (roadmap CPF-11): the same lifePayoutDelta() as the compare table's "CPF LIFE at 65" row
function payoutDelta({ h, plan, settings, policy, year }) {
  if (!plan) return '';
  let r;
  try { r = lifePayoutDelta({ household: h, plan, settings, defaults: CPF_DEFAULTS, year }, policy); } catch { return ''; }
  if (!r.ok) return r.reason === 'nobalances' ? `<p class="hint">${esc(t(r.message))} ${householdLink(h, 'cpfOa', { field: `buyers.${r.buyer ?? 0}.cpfOa` })}</p>` : '';
  const missing = (r.payoutMissing || []).length
    ? `<small>${t('Not counted: the payout of {0} (not entered).', [r.payoutMissing.map((i) => t('Buyer {0}', [i + 1])).join(', ')])}</small>` : '';
  if (r.allAtPayout) {
    return `<div class="kpis"><div class="kpi"><small>${t('Household CPF LIFE you receive')}</small><b>${t('{0} a month', [money(r.without.monthly)])}<small>${t('no change: payouts have started')}</small></b>${missing}</div></div>`;
  }
  const v = r.delta === 0 ? t('no change') : t('≈ {0} a month', [`${r.delta < 0 ? '−' : '+'}${money(Math.abs(r.delta))}`]);
  return `<div class="kpis"><div class="kpi"><small>${t('Household CPF LIFE from {0} if you buy this flat (estimate)', [r.atAge])}</small><b>${v}<small>${t('{0} → {1} a month vs not buying', [money(r.without.monthly), money(r.withBuy.monthly)])}</small></b>${missing}</div></div>`;
}

/** @param {{ h:object, f:object|null, tf:object|null, plan:object, policy:object, today:string }} ctx  tf = focus or typical flat */
export function cpfSection({ h, tf: f, plan: p, policy, today, mode = 'pro', phone = false }) {
  const head = `<div class="section" id="planCpf"><h3>${t('CPF & retirement')}</h3>`;
  const buyers = projectedBuyers(h);
  if (!buyers.length) return `${head}${needPrompt(missingFields(h, ['age', 'income', 'cpfOa']), 'planCpf')}</div>`;
  const year = +today.slice(0, 4);
  const plan = f && f.price > 0 ? planPurchase({ household: h, flat: { price: f.price, flatType: f.flatType || '4 ROOM', remainingLease: f.remainingLease ?? null } }, policy) : null;
  const settings = p.cpf || {};
  const all = h.buyers || [];
  const mcOn = rangeOn(p);
  const A65 = policy.get('cpf.age.life_payout');
  const working = buyers.filter(({ b }) => !started(b, policy));
  const someAtPayout = working.length < buyers.length;
  const foot = !working.length
    ? t('CPF LIFE payouts that have started do not change when you buy; OA savings can still go into the flat. Not a CPF quote — use the CPF planners for decisions.')
    : someAtPayout
      ? t('Estimates for buyers below {0}: income stays employed until {0}, rises by the pay rise above; CPF LIFE premiums, top-ups and the CPF LIFE set-aside are not modelled. Not a CPF quote — use the CPF planners for decisions.', [A65])
      : t('Estimates: income stays employed until {0}, rises by the pay rise above; CPF LIFE premiums, top-ups and the CPF LIFE set-aside are not modelled. Not a CPF quote — use the CPF planners for decisions.', [A65]);
  const sub = !plan ? t('Pick a flat (Afford this → on the map) to see what buying does to CPF.')
    : f.isDefault ? esc(t('With and without buying a typical {0} in {1} at {2}.', [ftWord(f.flatType), f.scope.label, money(f.price)]))
      : t('With and without buying {0} at {1}.', [esc(f.label || t('this flat')), money(f.price)]);
  return `${head}
    <p class="sec-sub">${sub}</p>${defaultNote(f)}
    ${payoutDelta({ h, plan, settings, policy, year })}
    ${working.length ? `<div class="fields pro-only">${field(t('Pay rise per year (%)'), pctIn('plan.cpf.wageGrowth', settings.wageGrowth, DEFAULT_WAGE_GROWTH * 100))}${field(t('Bonus (months of pay)'), numIn('plan.cpf.bonusMonths', settings.bonusMonths, `min="0" max="6" step="0.5" placeholder="${DEFAULT_BONUS_MONTHS}"`))}</div>
    ${cpfRangeToggle(mcOn)}` : ''}
    ${buyers.map(({ b, i }) => buyerCard(b, i, { buyers: all, plan, settings, policy, year, mcOn, mode, phone })).join('')}
    ${working.length ? cpfRangeNote(mcOn) : ''}
    <p class="hint">${foot}</p>
  </div>`;
}
