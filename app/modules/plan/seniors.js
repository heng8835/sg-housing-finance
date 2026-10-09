// Plan tab — options at 55 and above (Phase 7b B6 "retirement result card"): Stay, Right-size (Silver Housing Bonus),
// Lease Buyback, 2-room Flexi (+ "Other options": rent out a room, Community Care Apartment). Each option shows the
// same three money lines in the same order — cash freed now, Retirement Account top-up, CPF LIFE a month — and every
// "—" says why. Engines: engine/seniors.js (eligibility, top-ups, bonuses), engine/rightsize.js (cash freed, the sale
// counted as Plan → Sell then buy counts it), engine/cpfpayout.js lifePayoutTopUp (CPF LIFE before / after a top-up,
// estimated only below the payout age). Lease Buyback proceeds and new CPF LIFE amounts at the payout age are never
// guessed (O8): HDB and CPF work them out.
import { seniorOptions } from '../../engine/seniors.js';
import { summarise } from '../../engine/household.js';
import { saleInput } from '../../engine/salefunds.js';
import { rightSizeCash } from '../../engine/rightsize.js';
import { lifePayoutTopUp } from '../../engine/cpfpayout.js';
import { CPF_DEFAULTS } from '../../core/cpf-defaults.js';
import { esc, money } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { field, numIn, todayIso } from './ui.js';
import { missingFields, needPrompt } from '../../core/missing.js';
import { fillLink, householdField } from '../../core/filllink.js';
import { ftWord } from '../../core/typical.js';

const LABEL = {
  stay: 'Stay and age in place', 'rent-room': 'Rent out a room', lbs: 'Lease Buyback Scheme',
  shb: 'Right-size with the Silver Housing Bonus', cca: 'Community Care Apartment', flexi: 'Short-lease 2-room Flexi flat',
};
const SIMPLE_LABEL = { lbs: 'Lease Buyback' };
export const MAIN = ['stay', 'shb', 'lbs', 'flexi'];
export const OTHER = ['rent-room', 'cca'];
// the minimum-age rule behind "From {year}" per option (policy ids)
const AGE_RULE = { lbs: 'seniors.lbs.min_age', shb: 'seniors.shb.min_age', cca: 'seniors.cca.min_age', flexi: 'seniors.flexi.min_age' };
// engine/seniors.js note from before B6 — "Cash freed now" now includes the sale, so the note is left out here
const OLD_SHB_NOTE = 'Cash now is the bonus only';
const NEED_SALE = "Tick 'I own a home now' in Sell then buy and add its sale price.";

const owners = (buyers) => buyers.map(({ b }) => ({ age: +b.age, citizenship: b.citizenship, raBalance: b.cpfRa }));

/** Buyers with an age, with their index in household.buyers (the engines' owner order). */
export const agedBuyers = (h) => (h.buyers || []).map((b, i) => ({ b, i })).filter(({ b }) => b && +b.age > 0);

/**
 * Options that are closed now only because of age: the first year they open ("From {year}") and the buyer whose
 * birthday opens it. Same engine call with every age moved on k years (ages are whole years, so the year is approximate).
 * @returns {Object<string, { year:number, buyer:number, age:number }>}  buyer = index in household.buyers
 */
export function laterOptions(x, aged, policy, year) {
  const now = seniorOptions(x, policy);
  const closed = new Set(now.filter((o) => !o.eligible).map((o) => o.option));
  const out = {};
  const ages = aged.map(({ b }) => +b.age);
  const span = Math.max(0, ...Object.values(AGE_RULE).map((id) => policy.get(id))) - Math.min(...ages);
  for (let k = 1; k <= span && closed.size; k++) {
    const later = seniorOptions({ ...x, owners: x.owners.map((o) => ({ ...o, age: o.age + k })) }, policy);
    for (const o of later) {
      if (!closed.has(o.option) || !o.eligible) continue;
      closed.delete(o.option);
      const min = AGE_RULE[o.option] ? policy.get(AGE_RULE[o.option]) : null;
      const j = aged.findIndex(({ b }) => +b.age + k === min);
      if (j >= 0) out[o.option] = { year: year + k, buyer: aged[j].i, age: min };
    }
  }
  return out;
}

/**
 * Retirement Account top-up per buyer (household.buyers index) for the CPF LIFE line. Lease Buyback: each owner's
 * own requirement (engine). Silver Housing Bonus: the household's net RA increase, split evenly between the buyers
 * who have an RA (age ≥ cpf.age.ra_formation) — a display assumption, said in the note; CPF lets the owners choose.
 */
export function topUpsFor(o, aged, h, policy) {
  const out = (h.buyers || []).map(() => 0);
  if (o.option === 'lbs') aged.forEach(({ i }, j) => { out[i] = o.topUpPerOwner?.[j] || 0; });
  if (o.option === 'shb' && o.raTopUp > 0) {
    const ra = aged.filter(({ b }) => b.citizenship !== 'F' && +b.age >= policy.get('cpf.age.ra_formation'));
    ra.forEach(({ i }) => { out[i] = o.raTopUp / ra.length; });
  }
  return out;
}

const line = (label, value, note = '') => `<li><span>${label}</span><b>${value}</b>${note ? `<small>${note}</small>` : ''}</li>`;
const dash = (why) => ['—', why];

/** Cash freed now: [value, note]. */
function cashLine(o, x) {
  if (!o.eligible) return dash(esc(t('not available to you yet')));
  if (o.option === 'stay') return [money(0), esc(t('you keep your flat'))];
  if (o.option === 'rent-room') return [money(0), esc(t('no sale; room rent is not estimated here'))];
  if (o.option === 'cca') return dash(esc(t('the price depends on the BTO project — not estimated')));
  if (o.option === 'lbs') return dash(esc(t('HDB values the lease it buys — its formula is not published')));
  if (!x.sale) return dash(esc(t(NEED_SALE)));
  const flexi = o.option === 'flexi';
  if (flexi && !/^2 ROOM/.test(x.f?.flatType || '')) return dash(esc(t('Flexi prices depend on the project and lease — pick a 2-room flat to see this')));
  const r = rightSizeCash({ sale: x.sale, nextPrice: x.f?.price, nextResale: !flexi, raTopUp: flexi ? 0 : o.raTopUp, bonus: flexi ? 0 : o.bonus?.amount, household: x.h }, x.policy);
  if (!r.ok) return dash(esc(t('Pick the smaller flat on the map to see this')));
  if (r.cashFreed == null) return dash(esc(flexi ? t('The sale does not cover this flat: {0} short', [money(r.short)]) : t('The sale does not cover the smaller flat and the top-up: {0} short', [money(r.short)])));
  const how = flexi ? t('sale minus this 2-room flat and its buying costs, paid without a loan')
    : t('sale minus the smaller flat, its buying costs and the top-up, plus the bonus; paid without a loan');
  const kept = r.keptInCpf > 0 ? ` · ${t('{0} more stays in CPF', [money(r.keptInCpf)])}` : '';
  return [money(r.cashFreed), esc(how + kept)];
}

/** Retirement Account top-up: [value, note]. */
function raLine(o) {
  if (!o.eligible) return dash('');
  if (o.option === 'shb') return [esc(t('{0} → bonus {1}', [money(o.raTopUp || 0), money(o.bonus?.amount || 0)])), ''];
  if (o.option === 'lbs') return [esc(t('{0} needed → bonus {1}', [money(o.topUpRequired || 0), money(o.bonusAtRequiredTopUp || 0)])), o.retainOptions?.length ? esc(t('Keep {0} to {1} years of lease', [o.retainOptions[0], o.retainOptions.at(-1)])) : ''];
  if (o.option === 'flexi' && o.leaseYears) return [esc(t('none')), esc(t('Lease from {0} years', [o.leaseYears]))];
  return [esc(t('none')), ''];
}

/** CPF LIFE a month: [value, note]. */
function cpfLine(o, x) {
  if (!o.eligible) return dash('');
  const tops = topUpsFor(o, x.aged, x.h, x.policy);
  let r;
  try { r = lifePayoutTopUp({ household: x.h, topUps: tops, settings: x.plan.cpf || {}, defaults: CPF_DEFAULTS, year: x.year }, x.policy); } catch { r = null; }
  const estimator = x.estimator ? ` <a href="${esc(x.estimator)}" target="_blank" rel="noopener">${t("CPF's payout estimates ↗")}</a>` : '';
  const atAge = x.policy.get('cpf.age.life_payout');
  const startedTop = x.aged.some(({ b, i }) => tops[i] > 0 && +b.age >= atAge && b.citizenship !== 'F');
  if (!r || !r.ok) {
    if (startedTop) return [esc(t('goes up')), `${esc(t('CPF works out the new amount.'))}${estimator}`];
    if (r && r.reason === 'atpayout') return dash(fillLink({ target: 'household', field: `buyers.${r.buyer ?? 0}.cpfLifeMonthly`, text: 'cpfLifeMonthly' }));
    if (r && r.reason === 'foreigner') return dash(esc(t('No CPF LIFE: foreigners do not contribute to CPF.')));
    return dash(fillLink({ target: 'household', field: r && r.buyer != null ? `buyers.${r.buyer}.cpfOa` : householdField(x.h, 'cpfOa'), text: 'cpfOa' })); // fill link (core/filllink.js)
  }
  const started = r.buyers.filter((b) => b.atPayout), projected = r.buyers.filter((b) => !b.atPayout);
  const before = money(r.before.monthly);
  const split = o.option === 'shb' && tops.filter((v) => v > 0).length > 1 ? ` · ${t('top-up split evenly between the owners aged {0} and above', [x.policy.get('cpf.age.ra_formation')])}` : '';
  const missing = r.payoutMissing.length ? ` · ${t("add Buyer {0}'s CPF LIFE payout to include it", [r.payoutMissing[0] + 1])}` : '';
  if (r.goesUp.length) {
    // a buyer at the payout age tops up: CPF works out their new payout (O8); a younger buyer's change is estimated
    const est = projected.filter((b) => b.after > b.before).map((b) => t('Buyer {0}: {1} → {2} at {3} (estimate).', [b.i + 1, money(b.before), money(b.after), r.atAge]));
    const value = projected.length ? t('goes up') : t('{0} now → goes up', [before]);
    const whose = projected.length ? t('CPF works out the new amount for Buyer {0}.', [r.goesUp[0] + 1]) : t('CPF works out the new amount.');
    return [esc(value), `${esc([whose, ...est].join(' ') + split)}${estimator}`];
  }
  if (!projected.length) return [esc(t('{0} now', [before])), esc(t('your figure · no change') + missing)];
  if (!started.length) {
    if (r.delta > 0) return [esc(t('{0} → {1} at {2}', [before, money(r.after.monthly), r.atAge])), esc(t('estimate') + split)];
    return [esc(t('{0} at {1}', [before, r.atAge])), esc(t('estimate · no change'))];
  }
  // mixed: payouts already received (your figure) + an estimate at the payout age for the younger buyer(s)
  const mix = t('your figure now + an estimate at {0} for the younger buyer', [r.atAge]);
  if (r.delta > 0) return [esc(t('{0} → {1}', [before, money(r.after.monthly)])), esc(mix + split + missing)];
  return [esc(before), esc(`${mix} · ${t('no change')}${missing}`)];
}

function optionHtml(o, x, later) {
  const simple = x.mode === 'simple';
  const name = t((simple && SIMPLE_LABEL[o.option]) || LABEL[o.option]);
  const when = !o.eligible && later[o.option];
  const tag = o.eligible ? `<span class="tag good pw-tag">✓ ${t('You can')}</span>`
    : when ? `<span class="tag info pw-tag">${t('From {0}', [when.year])}</span>` : `<span class="tag neutral pw-tag">${t('Not open now')}</span>`;
  const one = x.aged.length === 1;
  const why = when ? (one ? t('From {0}, when you turn {1}.', [when.year, when.age]) : t('From {0}, when Buyer {1} turns {2}.', [when.year, when.buyer + 1, when.age]))
    : o.why.map((w) => t(w)).join(' ');
  const [cv, cn] = cashLine(o, x), [rv, rn] = raLine(o), [lv, ln] = cpfLine(o, x);
  const notYet = !o.eligible ? esc(t('not available to you yet')) : '';
  return `<li class="pw" data-option="${o.option}"><span class="pw-name">${esc(name)}</span>${tag}${why ? `<p class="pw-why">${esc(why)}</p>` : ''}
    <ul class="ret-lines">${line(t('Cash freed now'), cv, cn)}${line(simple ? t('Retirement Account top-up') : t('RA top-up'), rv, rn || (o.eligible ? '' : notYet))}${line(t('CPF LIFE a month'), lv, ln || (o.eligible ? '' : notYet))}</ul></li>`;
}

/** @param {{ h:object, tf:object|null, plan:object, policy:object, fold?:Function, mode?:string, today?:string }} ctx */
export function seniorsSection({ h, tf: f, plan: p, policy, fold = () => '', mode = 'pro', today }) {
  const minAge = policy.get('seniors.shb.min_age');
  const year = +(today || todayIso()).slice(0, 4);
  const aged = agedBuyers(h);
  const any = aged.some(({ b }) => +b.age >= minAge);
  const c = p.current || {};
  const input = {
    owners: owners(aged), income: summarise(h).income, flatType: c.flatType, remainingLease: c.remainingLease, marketValue: c.salePrice,
    nextFlatType: f?.flatType || null, nextFlatPrice: f?.price || null, outstandingLoan: c.outstandingLoan,
    currentIsPrivate: c.propertyType === 'private',
  };
  const opts = seniorOptions(input, policy);
  const later = aged.length ? laterOptions(input, aged, policy, year) : {};
  const sale = saleInput(p, year);
  let estimator = null;
  try { estimator = policy.meta('cpf.life.payout_anchors').source_url; } catch { estimator = null; }
  const x = { h, f, plan: p, policy, mode, year, aged, sale, estimator: /^https?:/.test(estimator || '') ? estimator : null };
  const html = (ids) => ids.map((id) => opts.find((o) => o.option === id)).filter(Boolean).map((o) => optionHtml(o, x, later)).join('');
  const notes = opts.flatMap((o) => o.notes.filter((n) => !n.startsWith(OLD_SHB_NOTE)).map((n) => `<li><b>${esc(t(LABEL[o.option]))}:</b> ${esc(t(n))}</li>`)).join('');
  const salePart = sale ? t('It uses your sale price ({0}) and the smaller flat you picked.', [money(sale.current.salePrice)]) : t('It uses your sale price and the smaller flat you picked.');
  return `<div class="section${any ? '' : ' pro-only'}" id="planSeniors"><h3>${t('Options at {0} and above', [minAge])}</h3>
    <p class="sec-sub">${esc(t('What each option would mean for your money.'))} ${esc(salePart)}</p>
    ${aged.length ? '' : needPrompt(missingFields(h, ['age']), 'planSeniors')}
    ${any ? '' : `<p class="hint">${t('Shown in Pro mode — no buyer is {0} or older yet.', [minAge])}</p>`}
    ${sale ? '' : `<div class="need" role="note"><span class="need-ic" aria-hidden="true">ⓘ</span><p>${esc(t(NEED_SALE))}</p><div class="need-act"><button type="button" class="link" data-act="goto-sellbuy">${t('Go to Sell then buy →')}</button></div></div>`}
    <div class="fields">${field(t('Remaining lease of the flat you own (years)'), numIn('plan.current.remainingLease', c.remainingLease, 'min="0" max="99" step="1"'))}</div>
    ${f && f.isDefault ? `<p class="hint">${esc(t('No flat picked yet: using a typical {0} in {1} at {2}.', [ftWord(f.flatType), f.scope.label, money(f.price)]))}</p>` : ''}
    <ul class="pw-list ret-card">${html(MAIN)}</ul>
    <details class="fold-inline" data-fold="seniorOther"${fold('seniorOther', false)}><summary>${t('Other options ({0}): rent out a room, Community Care Apartment', [OTHER.length])}</summary><ul class="pw-list ret-card">${html(OTHER)}</ul></details>
    <details class="fold-inline pro-only" data-fold="seniorNotes"${fold('seniorNotes', false)}><summary>${t('Details and assumptions')}</summary><ul class="notes">${notes}</ul></details>
    <p class="hint">${t('Lease Buyback proceeds and CPF LIFE payouts depend on HDB and CPF calculations that are not published — use their estimators.')}</p>
  </div>`;
}
