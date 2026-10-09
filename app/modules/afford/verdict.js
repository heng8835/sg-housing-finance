// Afford tab — Phase 7a lines around the verdict (pure string builders, node-testable: tests/afford/verdict.test.js):
// the sale banner (A2), the short-lease "up to" note (A4) and the cash-short line that waits for the cash (A11).
// Every number comes from the planPurchase() result; nothing is computed here.
import { esc, money } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { ftWord } from '../../core/typical.js';
import { householdLink } from '../../core/filllink.js';

/** The home being sold, in a sentence: "your flat at 123 Bedok North St 3" / "your 4-room flat" / "your private home". */
export function saleHomeLabel(c) {
  if (!c) return t('your home');
  if (c.propertyType === 'private') return t('your private home');
  if (c.block && c.block.label) return t('your flat at {0}', [c.block.label]);
  return c.flatType ? t('your {0} flat', [ftWord(c.flatType)]) : t('your flat');
}

/**
 * One calm banner when the plan counts a sale: "Includes the sale of your … — change in Plan".
 * @param {object} p  planPurchase() result; @param {object|null} current  store plan.current
 */
export function saleBanner(p, current, mode = 'pro') {
  if (!p || !p.sale) return '';
  const home = esc(saleHomeLabel(current));
  const text = p.sale.usable
    ? t(mode === 'simple' ? 'Includes the sale of {0}: {1} cash and {2} back to your CPF.' : 'Includes the sale of {0}: {1} cash and {2} back to your CPF OA.', [home, money(p.sale.cash), money(p.sale.cpf)])
    : t('Buying first: the sale of {0} is not counted here — its money arrives after this purchase.', [home]);
  const absd = p.sale.absdRemitted ? ` ${esc(t(p.absd.note))}` : '';
  // accrued interest blank (A5): the CPF refund, and so the cash, is not exact
  const unsure = !p.sale.usable || !p.sale.cashUncertain ? ''
    : p.sale.accruedSource === 'unknown' ? ` ${t('Cash from the sale is uncertain — enter the year you bought in Plan.')}`
      : ` ${t('Cash from the sale uses an estimate of the accrued CPF interest.')}`;
  return `<p class="sale-banner" id="afSale"><span class="tag info">${text}</span>${unsure}${absd} <button type="button" class="link" id="afSalePlan">${t('Change in Plan →')}</button></p>`;
}

/** Short lease (A4): the loan, CPF and EHG shown are the most they could be — never called "pro-rated". */
export function shortLeaseNote(p) {
  if (!p || !p.shortLease) return '';
  return `<p class="f-help" id="afShortLease">${t("This lease doesn't reach age 95 for the youngest buyer, so HDB and CPF will lower the loan and the CPF you can use, and HDB will pro-rate the EHG. The figures here are the most they could be — the actual amounts are lower. Ask HDB at HFE.")}</p>`;
}

/** Grants KPI amount: "up to S$X" while the EHG waits for HDB's pro-ration. */
export const grantsAmount = (p) => (p.shortLease && p.shortLease.ehgUpTo ? t('up to {0}', [money(p.grants.total)]) : money(p.grants.total));

/** Upfront card line (A11): the cash shortfall only once the cash is known; before that, ask for it — the sentence is a
 *  fill link to the household's cash (core/filllink.js; h = the household). */
export function cashShortLine(p, h = null) {
  if (p.cashShort == null) return `<p class="hint">${householdLink(h, 'cash', { text: 'Add your savings to check the cash part.' })}</p>`;
  if (p.cashShort > 0) return `<p class="hint" style="color:var(--critical-ink)">${t('Short of {0} in cash.', [money(p.cashShort)])}</p>`;
  return '';
}
