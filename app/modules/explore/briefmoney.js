// Flat brief → "Money for your household" box (Phase 7b B4, owner default O4). Every number comes from the same
// planPurchase() call as Afford and the Compare money rows (money.js planFor) and Afford's true monthly cost
// (engine/scenario costInput + engine/monthly-cost, market rent via core/typical as Afford). Nothing is computed here
// that those don't compute. The box replaces the "Can we afford it?" rows in Key numbers (brief.js drops that section);
// "Include my numbers" off → no box and no household money line anywhere on the page.
// Printed on paper only (local print) — privacy: no network, nothing stored.
import { t } from '../../core/i18n.js';
import { esc, money } from '../../core/dom.js';
import { reasonText } from '../../core/plain.js';
import { marketRentFor } from '../../core/typical.js';
import { costInput } from '../../engine/scenario.js';
import { monthlyCost } from '../../engine/monthly-cost.js';
import { VERDICT, REASON_ORDER, SECTION } from './money.js';

export const MONEY_SECTION = SECTION;
/** Pro grant names in the box (the brief is read on paper — full names for the less known ones). */
const GRANT_LABEL = { ehg: 'EHG', chg: 'CPF Housing Grant', phg: 'PHG', manual: 'your figure' };
const LOAN_LABEL = { hdb: 'HDB loan', bank: 'Bank loan' };

/** No income, no cash and no CPF typed: nothing household-specific to show. */
export const householdEmpty = (p) => p.summary.income == null && !p.fundsKnown;

/** Afford's true monthly cost for this flat (same input as Afford: focus = this flat, typed Annual Value when it is the focus). */
export function trueMonthly(p, { flat, household, policy, market }) {
  try {
    const cost = monthlyCost(costInput({ plan: p, focus: flat, household, market, policy }), policy);
    return { total: cost.total, noTax: cost.items.some((i) => i.id === 'property-tax' && i.monthly == null) };
  } catch { return null; } // a rule value missing → the line is left out (Afford says the same)
}

/**
 * Plain model of the box (pure).
 * @param {{ p:object, household:object, cost?:{total:number,noTax:boolean}|null, saleHome?:string|null, why?:string|null, date:string }} x
 */
export function moneyModel({ p, household, cost = null, saleHome = null, why = null, date }) {
  if (householdEmpty(p)) return { empty: true, date };
  const c = p.chosen, f = c.funding, { reasons, codes } = p.verdict;
  const top = REASON_ORDER.map((code) => codes.indexOf(code)).find((i) => i >= 0);
  const own = household.grantsOverride != null;
  return {
    empty: false, date, why,
    verdict: { status: p.verdict.status, reason: top == null ? null : reasonText(codes[top], reasons[top], 'pro') },
    monthly: { amount: c.monthly, loanType: c.loanType, tenure: c.tenure, upTo: !!(p.shortLease && p.shortLease.loanUpTo) },
    cash: { need: f.cashNeeded, have: p.cashKnown ? p.funds.cash : null, short: p.cashShort },
    cpf: f.cpfUsed,
    grants: { total: p.grants.total, own, items: p.grants.items.map((i) => ({ id: i.id, amount: i.amount, upTo: !!i.upTo })) },
    cost,
    most: { amount: p.budget.maxPrice, binding: p.budget.binding },
    sale: p.sale && p.sale.usable ? { home: saleHome, cash: p.sale.cash, cpf: p.sale.cpf } : null,
  };
}

const line = (label, value, note = '') => `<tr><th scope="row">${label}</th><td>${value}${note ? `<small>${note}</small>` : ''}</td></tr>`;

/** The box (HTML, brief.css pt / mm). */
export function moneyBoxHtml(md) {
  const head = `<h2>${t('Money for your household')}</h2>`;
  const foot = `<p class="bf-mfoot">${esc(t('From your details on this device, {0}. Educational estimate — not financial advice.', [md.date]))}</p>`;
  if (md.empty) return `<section class="bf-money">${head}<p>${t('Add your household in the app to see your money numbers here.')}</p>${foot}</section>`;
  const [, icon, title] = VERDICT[md.verdict.status];
  const m = md.monthly, cs = md.cash, g = md.grants;
  const cashNote = cs.short == null ? t('add your savings to check the cash part')
    : cs.short > 0 ? t('your cash {0} · short {1}', [money(cs.have), money(cs.short)]) : t('your cash {0} · covered', [money(cs.have)]);
  const grants = g.own ? t('the amount you entered in Household')
    : g.items.length ? g.items.map((i) => `${t(GRANT_LABEL[i.id] || i.id.toUpperCase())} ${i.upTo ? t('up to {0}', [money(i.amount)]) : money(i.amount)}`).join(' + ') : t('none');
  const most = md.most.amount == null ? t('set income') : money(md.most.amount);
  const why = md.most.binding === 'income' ? t('limited by income') : md.most.binding === 'funds' ? t('limited by your cash + CPF') : '';
  const left = [
    line(t('Can you afford it?'), `${esc(icon)} ${esc(t(title))}`, md.verdict.reason ? esc(md.verdict.reason) : ''),
    line(t('Cash you must pay'), money(cs.need), cashNote),
    line(t('From CPF OA and grants'), money(md.cpf)),
    line(t('Grants'), g.own ? money(g.total) : g.items.length ? money(g.total) : money(0), grants),
  ];
  const right = [
    line(t('Monthly instalment'), m.upTo ? t('up to {0}', [money(m.amount)]) : money(m.amount), `${t(LOAN_LABEL[m.loanType] || m.loanType)} · ${t('{0} years', [m.tenure])}`),
    md.cost ? line(t('True monthly cost'), t('{0} a month', [money(md.cost.total)]), md.cost.noTax ? t('loan, S&CC, utilities, insurance (est.) — excl. property tax') : t('loan, S&CC, property tax, utilities, insurance (est.)')) : '',
    line(t('Most you can pay'), most, why),
  ];
  const sale = md.sale ? `<p class="bf-msale">${esc(t('Includes selling {0}: {1} cash, {2} back to CPF.', [md.sale.home || t('your home'), money(md.sale.cash), money(md.sale.cpf)]))}</p>` : '';
  const lease = m.upTo ? `<p class="bf-mnote">${t("The lease doesn't reach 95 for the youngest buyer: HDB and CPF will lower the loan and the CPF you can use, so these are the most they could be.")}</p>` : '';
  const whyLine = md.why ? `<p class="bf-why"><b>${t('Why this flat (your ticks):')}</b> ${esc(md.why)}</p>` : '';
  return `<section class="bf-money">${head}${sale}<div class="bf-mcols"><table>${left.join('')}</table><table>${right.join('')}</table></div>${lease}${whyLine}${foot}</section>`;
}

/**
 * Everything for one flat (browser glue, kept here so brief.js stays small).
 * x: { p (planFor result), household, policy, c (choice), b (block), flatType, focus (store focus), plan (store plan), why, date }
 */
export function moneyFor({ p, household, policy, c, flatType, focus, plan, why, date }) {
  const flat = { flatType, bid: c.bid, ...(focus && focus.choiceId === c.id && focus.annualValue > 0 ? { annualValue: focus.annualValue } : {}) };
  const cost = householdEmpty(p) ? null : trueMonthly(p, { flat, household, policy, market: marketRentFor(flat, policy) });
  const cur = plan && plan.current;
  const saleHome = cur && cur.block && cur.block.label ? cur.block.label : null;
  return moneyModel({ p, household, cost, saleHome, why, date });
}
