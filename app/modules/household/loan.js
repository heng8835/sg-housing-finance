// Household drawer → Loan type, eligibility-aware (Phase 7b B11): when the household can't take an HDB loan the
// drawer shows Bank loan selected and HDB loan greyed with the reason — the same rule Afford uses
// (engine/plan.js hdbLoanEligibility → planPurchase switches to a bank loan), so the two never disagree.
// The stored choice is not changed: add a citizen buyer (or lower the income) and the HDB loan comes back.
import { hdbLoanEligibility } from '../../engine/plan.js';
import { summarise } from '../../engine/household.js';
import { esc } from '../../core/dom.js';
import { t } from '../../core/i18n.js';

/**
 * @returns {{ value:'hdb'|'bank', hdbOff:boolean, why:string[], ids:string[] }} value = the loan shown as selected;
 *   hdbOff = HDB loan greyed (only once a buyer has been entered — an empty household is not judged).
 */
export function loanChoice(h, policy) {
  const stored = h && h.loan === 'bank' ? 'bank' : 'hdb';
  const s = summarise(h || {});
  if (!s.buyers.length) return { value: stored, hdbOff: false, why: [], ids: [] };
  const e = hdbLoanEligibility(h, policy);
  if (e.ok) return { value: stored, hdbOff: false, why: [], ids: [] };
  const ids = [];
  if (!s.citizenships.includes('SC')) ids.push('elig.hdb_loan');
  const ceilingId = h.scheme === 'single' ? 'eligibility.income_ceiling.single' : 'eligibility.income_ceiling.family';
  if (s.income != null && s.income > policy.get(ceilingId)) ids.push(ceilingId);
  return { value: 'bank', hdbOff: true, why: e.why, ids };
}

/** The Loan type switch: HDB loan greyed (aria-disabled, still focusable) with the reason when it does not apply. */
export function loanSeg(choice) {
  const btn = (v, label) => {
    const on = v === choice.value, off = v === 'hdb' && choice.hdbOff;
    return `<button type="button" role="radio" aria-checked="${on}" data-act="loan" data-v="${v}" class="${on ? 'on' : ''}${off ? ' is-off' : ''}"${off ? ' aria-disabled="true" aria-describedby="hhLoanWhy"' : ''}>${t(label)}</button>`;
  };
  const help = choice.hdbOff ? `<p class="f-help" id="hhLoanWhy">${choice.why.map((w) => esc(t(w))).join(' ')}${choice.ids.length ? ` <small class="pro-only">(${esc(t('Rule'))}: ${choice.ids.map(esc).join(', ')})</small>` : ''} ${t('Bank loan selected for you.')}</p>` : '';
  return `<div class="seg" role="radiogroup" aria-labelledby="hhLoanLbl">${btn('hdb', 'HDB loan')}${btn('bank', 'Bank loan')}</div>${help}`;
}
