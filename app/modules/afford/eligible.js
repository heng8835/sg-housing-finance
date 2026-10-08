// Afford tab — eligibility-aware lines (Phase 7b B11), pure string builders (node-testable): the bank-loan note when
// the HDB loan does not apply ("Bank loan — {reason}" + "Why?" → Learn hdb-loan), and the grants the household can't
// get now, folded, each with the grants engine's reason. Every fact comes from the planPurchase() result.
import { esc } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { grantName, isSimple } from '../../core/plain.js';
import { grantsMissing } from '../../core/grantnotes.js';

/** "Bank loan — An HDB loan needs at least one Singapore Citizen buyer … Why?" — only when Afford switched to a bank loan. */
export function bankLoanNote(p) {
  if (!p || !p.switchedToBank) return '';
  const why = p.hdbLoan.why.map((w) => esc(t(w))).join(' ');
  return `<p class="hint" id="afBankLoan">• ${t('Bank loan — {0}', [why])} <button type="button" class="link" id="afLoanWhy">${t('Why?')}</button></p>`;
}

/** "Grants you can't get now (n)" — closed fold under the KPIs; nothing with a grant override or when all apply. */
export function grantsMissingFold(p, h, mode = 'pro') {
  const list = p ? grantsMissing(p.grants, h) : [];
  if (!list.length) return '';
  const name = (id) => (isSimple(mode) ? esc(grantName(id)) : id.toUpperCase());
  return `<details class="fold-inline" id="afGrantsOff"><summary>${t("Grants you can't get now ({0})", [list.length])}</summary>
    <ul class="notes">${list.map((x) => `<li><b>${name(x.id)}</b> — ${esc(t(x.why))}</li>`).join('')}</ul></details>`;
}

export const eligibleStrings = () => ['Bank loan — {0}', 'Why?', "Grants you can't get now ({0})"];
