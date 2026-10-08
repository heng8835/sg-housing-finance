// Compare table money rows (Phase 7a A1 "one numbers engine"): every money cell of "Can we afford it?" and the
// At-a-glance money lines come from engine/plan.js planPurchase() — the same call the Afford tab makes for the same
// flat (household from the store, Plan's sale when "I own a home and will sell" is ticked, flat = the choice's price,
// type, remaining lease and the benchmark's COV scenario). Nothing is computed here; this file only formats.
// legacy.js hooks: createMoney(...) once; ROWS() → insert(rows); verdict() → glance(m, mode); ROW_TERMS ← terms.
// Simple mode (B10): each row also has `fs` — the same numbers in plain words (core/plain.js); `f` (Pro) is unchanged.
import { planPurchase } from '../../engine/plan.js';
import { saleInput } from '../../engine/salefunds.js';
import { money, esc } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { isSimple, incomeShareText, allLoansText, reasonText } from '../../core/plain.js';
import { parentsKm, parentsPlaceOf, withParents } from '../../core/parents.js';
import { phgNear } from '../../engine/grants.js';

/** Lookup keys (English, stable — SIMPLE_KEYS, ROW_TERMS, the brief); translated at render. */
export const ROW_KEYS = {
  loan: 'Loan', monthly: 'Monthly instalment', verdict: 'Can you afford it?', cash: 'Cash you must pay',
  upfront: 'Upfront incl. fees (cash + CPF)', most: 'Most you can pay',
};
/** B12 row key — only present once a daily place is tagged as the parents' home (not one of the always-on ROW_KEYS). */
export const PHG_KEY = 'Near your parents (PHG)';
export const SECTION = 'Can we afford it?';
/** Simple mode keeps these money rows. */
export const SIMPLE_MONEY_KEYS = [ROW_KEYS.monthly, ROW_KEYS.verdict, ROW_KEYS.cash, ROW_KEYS.most];
export const TERMS = { [ROW_KEYS.loan]: 'ltv', [ROW_KEYS.monthly]: 'msr', [ROW_KEYS.verdict]: 'msr', [ROW_KEYS.cash]: 'cov', [ROW_KEYS.upfront]: 'upfront-cost', [ROW_KEYS.most]: 'msr', [PHG_KEY]: 'phg' };
/** Afford's verdict words (modules/afford/index.js VERDICT) — same tag, icon and title. */
export const VERDICT = { ok: ['good', '✓', 'Within your limits'], tight: ['warn', '!', 'Possible, but tight'], no: ['critical', '✕', 'Not affordable as it stands'], unknown: ['neutral', '?', 'Need a few more details'] };
/** Which of the engine's reasons the compare cell shows first (the rest: "+N more in Afford"). */
export const REASON_ORDER = ['eligibility', 'no-loan', 'lease-cpf', 'cash-short', 'msr', 'tdsr', 'smaller-loan', 'smaller-loan-unknown',
  'income-unknown', 'funds-unknown', 'cash-unknown', 'eligibility-check', 'near-limit', 'short-lease'];
export const CACHE_MAX = 64;
/** B12 UI heuristic (not a rule): within this many metres of the PHG distance the cell says HDB checks the exact distance. */
export const PHG_MARGIN_M = 300;

// legacy number styles (the compare table's look): rates "2.6%", shares "27%", glance amounts "S$166k"
const pct = (x) => `${+(x * 100).toFixed(1)}%`;
const pct0 = (x) => `${(x * 100).toFixed(0)}%`;
const k = (v) => `S$${(v / 1000).toFixed(0)}k`;
const muted = (s) => `<span class="muted">${s}</span>`;

/**
 * The flat exactly as Afford gets it from My choices → Afford (legacy store focus: price, type, lease, cov), plus
 * parentsKm (B12) only when a daily place is tagged "Parents' or child's home" — otherwise the input is unchanged.
 */
export const flatInput = (m, flatTypes, km = null) => withParents({ price: m.c.price, flatType: flatTypes[m.c.ft] || '4 ROOM', remainingLease: m.leaseNow ?? null, cov: m.cov || 0 }, km);

/** "Near your parents (PHG)" cell (B12). ph = engine phgNear(); p = the plan (grant used); own = household grant figure typed. */
export function phgCell(ph, p, own = false) {
  const km = ph.km == null ? null : t('{0} km', [ph.km.toFixed(1)]);
  let head;
  if (ph.basis === 'with') head = `<span class="tag good">✓ ${t('living with your parents')}</span><small>${t('"Living with" in Household counts, whatever the distance')}</small>`;
  else if (km == null) head = `<span class="muted">${t("tag a daily place as your parents' home")}</span>`;
  else if (ph.limitKm == null) head = `${km}<small>${t("the PHG distance is not in this app's rules yet — HDB checks it")}</small>`;
  else if (Math.abs(ph.km - ph.limitKm) * 1000 <= PHG_MARGIN_M) head = `<span class="tag warn">≈ ${km}</span><small>${t('close to the {0} km limit; HDB checks the exact distance', [ph.limitKm])}</small>`;
  else if (ph.within) head = `<span class="tag good">✓ ${km}</span><small>${t('within {0} km', [ph.limitKm])}</small>`;
  else head = `${km}<small>${t('over {0} km', [ph.limitKm])}</small>`;
  const g = (p.grants.items.find((i) => i.id === 'phg') || {}).amount;
  const tail = own ? t('your own grant figure in Household is used') : g ? t('PHG {0} in the grants', [money(g)]) : t('no PHG in the grants');
  return `${head}<small>${tail}</small>`;
}

/** Simple-mode names for the cash items (Pro: COV, BSD, ABSD, CPF OA). */
export const SIMPLE_CASH = { cov: 'cash over valuation {0}', bsd: 'stamp duty {0}', absd: 'additional stamp duty {0}', rest: '{0} not covered by your CPF and grants' };

/** Cash-only items + what CPF OA and grants can't cover — together = funding().cashNeeded. */
export function cashParts(f, loanType, mode = 'pro') {
  const label = { 'down-cash': loanType === 'bank' ? 'cash downpayment {0}' : 'option fee {0}', 'hdb-fees': 'HDB fees {0}', cov: 'COV {0}', bsd: 'BSD {0}', absd: 'ABSD {0}', fees: 'legal fees {0}' };
  if (isSimple(mode)) Object.assign(label, { cov: SIMPLE_CASH.cov, bsd: SIMPLE_CASH.bsd, absd: SIMPLE_CASH.absd });
  const parts = f.items.filter((i) => !i.cpf).map((i) => t(label[i.id] || '{0}', [money(i.amount)]));
  const cashOnly = f.items.filter((i) => !i.cpf).reduce((s, i) => s + i.amount, 0);
  const rest = f.cashNeeded - cashOnly;
  if (rest > 0.5) parts.push(t(isSimple(mode) ? SIMPLE_CASH.rest : '{0} not covered by CPF OA + grants', [money(rest)]));
  return parts;
}

/** Cell HTML per row (p = planPurchase() result; mode 'simple' = plain words, same numbers; default Pro). */
export const cells = {
  loan(p) {
    const c = p.chosen, up = p.shortLease && p.shortLease.loanUpTo;
    return `${up ? t('up to {0}', [money(c.loan)]) : money(c.loan)}<small>${t('{0} LTV', [pct(c.ltv)])} · ${pct(c.rate)} · ${t('{0} y', [c.tenure])}${c.tenureCapped ? ' ' + t('(max for this loan)') : ''}${c.loanType === 'bank' ? ' · ' + t('bank loan') : ''}</small>`
      + (up ? `<small>${t("lease doesn't reach 95 — HDB will lower it")}</small>` : '');
  },
  monthly(p, mode = 'pro') {
    const c = p.chosen;
    if (p.summary.income == null) return `${money(c.monthly)}<small>${t('enter income in Household (top right)')}</small>`;
    if (isSimple(mode)) return `${money(c.monthly)}<small>${incomeShareText(pct0(c.msr), pct0(c.msrAssessed), pct(c.assessRate), pct(c.msrCap))}${c.tdsr != null ? ' · ' + allLoansText(pct0(c.tdsr)) : ''}</small>`;
    return `${money(c.monthly)}<small>${t('{0} of income · MSR test {1} at {2} (cap {3})', [pct0(c.msr), pct0(c.msrAssessed), pct(c.assessRate), pct(c.msrCap)])}${c.tdsr != null ? ' · ' + t('TDSR {0}', [pct0(c.tdsr)]) : ''}</small>`;
  },
  verdict(p, mode = 'pro') {
    const [tone, icon, title] = VERDICT[p.verdict.status], { reasons, codes } = p.verdict;
    const top = REASON_ORDER.map((code) => codes.indexOf(code)).find((i) => i >= 0);
    const more = reasons.length - (top == null ? 0 : 1);
    return `<span class="tag ${tone}">${icon} ${t(title)}</span>${top != null ? `<small>${esc(reasonText(codes[top], reasons[top], mode))}</small>` : ''}${more > 0 ? `<small>${t('+{0} more in Afford', [more])}</small>` : ''}`;
  },
  cash(p, mode = 'pro') {
    const f = p.chosen.funding;
    // A11: "short" only once the cash is known (Afford's cashShortLine) — before that, ask for it
    const state = p.cashShort == null ? t('Add your savings to check the cash part.')
      : p.cashShort > 0 ? `<b style="color:var(--critical)">${t('short {0}', [k(p.cashShort)])}</b> · ${t('your cash {0}', [k(p.funds.cash)])}`
        : t('within your cash {0}', [k(p.funds.cash)]);
    return `${money(f.cashNeeded)}<small>${cashParts(f, p.chosen.loanType, mode).join(' + ')}</small><small>${state}</small>`;
  },
  upfront(p) {
    const c = p.chosen, f = c.funding, amt = (id) => f.items.filter((i) => i.id === id || (id === 'down' && i.id === 'down-cash')).reduce((s, i) => s + i.amount, 0);
    const down = amt('down'), fees = amt('fees') + amt('hdb-fees'), grantsUsed = f.total - f.net;
    let s = t('{0} down {1} + BSD {2}', [pct(p.price ? down / p.price : 0), k(down), k(amt('bsd'))]);
    if (amt('absd')) s += ' + ' + t('ABSD {0}', [k(amt('absd'))]);
    if (fees) s += ' + ' + t('fees {0}', [k(fees)]);
    if (amt('cov')) s += ' + ' + t('COV {0}', [k(amt('cov'))]);
    if (grantsUsed) s += ' − ' + (p.shortLease && p.shortLease.ehgUpTo ? t('grants up to {0}', [k(grantsUsed)]) : t('grants {0}', [k(grantsUsed)]));
    return `${money(f.net)}<small>${s}</small>`;
  },
  most(p) {
    const b = p.budget;
    if (b.maxPrice == null) return muted(t('set income'));
    const why = b.binding === 'income' ? 'limited by income (loan limit)' : b.binding === 'funds' ? 'limited by your cash + CPF' : null;
    return `${money(b.maxPrice)}${why ? `<small>${t(why)}</small>` : ''}`;
  },
};

/** Pro → Simple wording of the At-a-glance money lines (same placeholders, same numbers). */
export const SIMPLE_GLANCE = {
  'instalment over the {0} MSR at the full loan — possible with a smaller loan of {1}': 'the monthly payment on the full loan would be over the {0} limit — a smaller loan of {1} could work',
  'instalment {0} of income; {1} at the {2} test rate — over the {3} MSR': 'monthly payment {0} of your income; {1} when tested at {2} interest — over the {3} limit',
  'instalment {0} of income ({1} at the {2} test rate) — near the {3} cap': 'monthly payment {0} of your income ({1} when tested at {2} interest) — close to the {3} limit',
  'instalment {0} of income': 'monthly payment {0} of your income',
  'upfront {0} within funds even with est. COV': 'upfront {0}: your cash and CPF cover it, even with a possible cash over valuation',
  'upfront {0} within funds': 'upfront {0}: your cash and CPF cover it',
};

/** At-a-glance money lines [cls, icon, text] — instalment share and the cash check, from the same plan. */
export function glanceFlags(p, policy, mode = 'pro') {
  const c = p.chosen, flags = [], sl = p.smallerLoan;
  const w = (en, vals) => t(isSimple(mode) && SIMPLE_GLANCE[en] ? SIMPLE_GLANCE[en] : en, vals);
  if (c.msrAssessed != null) {
    if (!c.msrOk && sl && sl.fits === true) flags.push(['warn', '!', w('instalment over the {0} MSR at the full loan — possible with a smaller loan of {1}', [pct(c.msrCap), k(sl.loan)])]);
    else if (!c.msrOk) flags.push(['critical', '✕', w('instalment {0} of income; {1} at the {2} test rate — over the {3} MSR', [pct0(c.msr), pct0(c.msrAssessed), pct(c.assessRate), pct(c.msrCap)])]);
    else if (c.msrAssessed > policy.get('assumption.msr.comfortable')) flags.push(['warn', '!', w('instalment {0} of income ({1} at the {2} test rate) — near the {3} cap', [pct0(c.msr), pct0(c.msrAssessed), pct(c.assessRate), pct(c.msrCap)])]);
    else flags.push(['good', '✓', w('instalment {0} of income', [pct0(c.msr)])]);
  }
  const f = c.funding, cov = (f.items.find((i) => i.id === 'cov') || {}).amount || 0;
  if (p.cashShort == null) { if (p.fundsKnown) flags.push(['neutral', '•', t('add your savings to check the cash part')]); }
  else if (p.cashShort > 0) flags.push(['critical', '✕', t('upfront {0} — short {1} in cash', [k(f.net), k(p.cashShort)])]);
  else flags.push(['good', '✓', cov ? w('upfront {0} within funds even with est. COV', [k(f.net)]) : w('upfront {0} within funds', [k(f.net)])]);
  return flags;
}

/**
 * @param {{ policy:object, store:object, D:object, rerender?:()=>void, year?:()=>number }} x
 *   D = window.HDB_DATA (flat-type names); year = this calendar year (the sale's accrued-interest estimate, as Afford)
 * → { planFor(m), rows(), insert(rows), glance(m), terms, size() }
 */
export function createMoney({ policy, store, D, rerender = null, year = () => new Date().getFullYear() }) {
  const cache = new Map();
  if (rerender) store.subscribe('plan.current', rerender); // the home being sold (A2) — household changes re-render already

  /** The planPurchase() result Afford shows for this flat; cached by the exact inputs (LRU, CACHE_MAX). */
  function planFor(m) {
    const household = store.get('household'), sale = saleInput(store.get('plan'), year()), flat = flatInput(m, D.flat_types, parentsKm(household, m.b));
    const key = JSON.stringify([household, sale, flat]);
    let p = cache.get(key);
    if (p) { cache.delete(key); cache.set(key, p); return p; }
    p = planPurchase({ household, flat, sale }, policy);
    cache.set(key, p);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return p;
  }
  const MSR_CAP = policy.get('ratio.msr.cap');
  const row = (key, f, extra = {}) => ({ k: ROW_KEYS[key], f: (m) => f(planFor(m)), fs: (m) => f(planFor(m), 'simple'), ...extra });
  function rows() {
    return [
      row('loan', cells.loan, { tip: t('HDB loan: up to {0} of the lower of price and valuation at {1}, max {2} y. Bank loan: {3} for up to {4} y, {5} beyond; the {6} bank rate is illustrative.', [pct(policy.get('loan.hdb.ltv')), pct(policy.get('rate.hdb.concessionary')), policy.get('tenure.hdb.max'), pct(policy.get('loan.bank.ltv')), policy.get('loan.bank.hdb_flat.full_ltv_max_tenure'), pct(policy.get('loan.bank.ltv.lower_tier')), pct(policy.get('assumption.rate.bank'))]) }),
      row('monthly', cells.monthly, { v: (m) => planFor(m).chosen.monthly, best: 'min', tip: t('Mortgage Servicing Ratio: instalments may not exceed {0} of gross monthly income for HDB flats. HDB and banks test this at a floor rate (HDB {1}, banks {2}) that can be higher than the rate you pay.', [pct(MSR_CAP), pct(policy.get('rate.floor.hdb')), pct(policy.get('rate.floor.bank'))]) }),
      row('verdict', cells.verdict, { tip: t('The same verdict as the Afford tab for this flat: your income tested at the floor rate, the cash part, the lease and who can buy. Use Afford on the flat in My choices for the full picture.') }),
      row('cash', cells.cash, { v: (m) => planFor(m).chosen.funding.cashNeeded, best: 'min', tip: t('What must be paid in cash: the option and exercise fees, HDB fees and any cash-over-valuation (COV), plus any part of the upfront that your CPF OA and grants cannot cover. Checked against your cash savings only — never CPF.') }),
      row('upfront', cells.upfront, { v: (m) => planFor(m).chosen.funding.net, best: 'min', tip: t("Everything due at purchase — downpayment, Buyer's Stamp Duty (and ABSD if any), legal and HDB fees and the estimated COV — less grants, paid from cash and CPF OA together. Same total as Afford.") }),
      row('most', cells.most, { v: (m) => planFor(m).budget.maxPrice, best: 'max', tip: t('The highest price your income and your cash + CPF support for this flat type and lease — the loan can be below the full LTV when your income limits it. Same as Afford.') }),
      ...(parentsPlaceOf(store.get('household')) ? [phgRow()] : []), // B12: only once a daily place is tagged as the parents' home
    ];
  }
  /** "Near your parents (PHG)": straight-line distance per flat vs the policy distance; the grant is planFor()'s. */
  function phgRow() {
    const f = (m) => { const h = store.get('household'), p = planFor(m); return phgCell(phgNear({ household: h, parentsKm: p.flat.parentsKm ?? null }, policy), p, h.grantsOverride != null); };
    return { k: PHG_KEY, simple: true, f, fs: f, tip: t('Proximity Housing Grant: buying a resale flat near your parents or married child (or living with them) adds a grant. With a daily place tagged as their home, each flat is checked against the distance in the rules, in a straight line; HDB checks the exact distance. "Living with" in Household still counts first.') };
  }
  /** Money rows go first in "Can we afford it?" (right after the section header). */
  function insert(r) {
    const s = r.findIndex((x) => x.sec === SECTION);
    r.splice(s < 0 ? r.length : s + 1, 0, ...rows());
    return r;
  }
  return { planFor, rows, insert, glance: (m, mode = 'pro') => glanceFlags(planFor(m), policy, mode), terms: TERMS, size: () => cache.size };
}
