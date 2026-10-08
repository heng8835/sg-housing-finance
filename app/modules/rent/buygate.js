// Rent & Buy → "Rent or buy?": who may buy comes before which wins (Phase 7 A6). Never a "buying comes out
// ahead" line for a path the household can't take — HDB resale not open to it, or not affordable as things stand
// (plan verdict 'no', cash short). Markup only: the facts come from engine/plan.js (verdict, pathways, funding)
// and engine/eligibility.js (nextPaths). 7b B11: paths above "Most you can pay" are folded away ("Over your budget").
import { nextPaths } from '../../engine/eligibility.js';
import { esc, money } from '../../core/dom.js';
import { t } from '../../core/i18n.js';

/** Rule ids behind a path (Pro only — Simple mode hides policy ids). */
const ruleIds = (ids) => (ids && ids.length ? ` <small class="pro-only">(${esc(t('Rule'))}: ${ids.map(esc).join(', ')})</small>` : '');
const reasonsList = (list) => (list.length ? `<ul class="notes">${list.map((r) => `<li>${esc(t(r))}</li>`).join('')}</ul>` : '');

/**
 * @param {object} plan planPurchase() result for the flat being compared
 * @param {object} policy
 * @param {{ household:object, price:number, rent:number, rentIsAsking:boolean }} x rent = the rent compared
 * @returns {{ blocked:boolean, noWinner:boolean, html:string }}
 *   blocked = the household can't buy this flat type now: no comparison at all, the paths it can take instead;
 *   noWinner = it may buy, but not as things stand: the reasons first, then the comparison without a winner tag.
 */
export function buyGate(plan, policy, { household, price, rent, rentIsAsking, room = false }) {
  const resale = plan?.pathways?.buy?.resale || null;
  if (resale && resale.ok === false) {
    // 7b B11: each path against "Most you can pay"; the ones above it move into a fold with how far over they are
    const maxPrice = plan?.budget?.maxPrice ?? null;
    const paths = nextPaths(household, policy, { price, maxPrice }, plan.pathways);
    const rentNow = room ? t('{0}/month (your figure)', [money(rent)]) : rentIsAsking ? t('{0}/month (your asking rent)', [money(rent)]) : t('{0}/month (median rent here)', [money(rent)]);
    const within = (x) => (x.within === true ? ` <small class="pw-why">${t('within Most you can pay ({0})', [money(maxPrice)])}</small>` : '');
    const main = paths.filter((x) => x.within !== false), over = paths.filter((x) => x.within === false);
    const rows = [`<li><b>${t('Keep renting')}</b> — ${rentNow}</li>`, ...main.map((x) => `<li>${esc(t(x.text))}${ruleIds(x.ids)}${within(x)}</li>`)];
    const overFold = over.length ? `<details class="fold-inline rb-over"><summary>${t('Over your budget ({0})', [over.length])}</summary>
      <ul class="notes">${over.map((x) => `<li>${esc(t(x.text))}${ruleIds(x.ids)} <small class="pw-why">${t('{0} over Most you can pay ({1})', [money(x.over), money(maxPrice)])}</small></li>`).join('')}</ul></details>` : '';
    return {
      blocked: true, noWinner: true,
      html: `<p class="verdict"><span class="tag info">${t("Your household can't buy this flat type now")}</span></p>
      <p class="hint"><b>${t('Why')}:</b> ${resale.why.map((w) => esc(t(w))).join(' ')}</p>
      <h4 class="sub">${t('Paths you can take')}</h4>
      <ul class="notes rb-paths">${rows.join('')}</ul>${overFold}
      <p class="hint">${t('No rent-or-buy comparison is shown for a flat your household cannot buy now.')}</p>`,
    };
  }
  const v = plan?.verdict || { status: 'unknown', reasons: [] };
  // plan.cashShort is null until the household's cash is known (A11) — never "needs more cash" before that
  const short = plan?.cashShort > 0 ? plan.cashShort : 0;
  if (short > 0 || v.status === 'no') {
    const head = short > 0 ? t('Buying needs {0} more cash first', [money(short)]) : t('Buying this flat does not work as things stand');
    return {
      blocked: false, noWinner: true,
      html: `<p class="verdict"><span class="tag warn">${head}</span></p>
      ${reasonsList(v.reasons || [])}
      <p class="hint">${t('The comparison below assumes you could buy now — it is not a verdict.')}</p>`,
    };
  }
  if (resale && resale.ok === 'conditional') {
    return { blocked: false, noWinner: false, html: `<p class="hint"><b>${t('Check eligibility first')}:</b> ${resale.why.map((w) => esc(t(w))).join(' ')}</p>` };
  }
  return { blocked: false, noWinner: false, html: '' };
}

/** The winner tag — only when the household can take the buying path (gate.noWinner false). diff = buy − rent at the horizon. */
export function rbVerdict(diff, gate) {
  if (gate && gate.noWinner) return '';
  return `<p class="verdict"><span class="tag ${diff >= 0 ? 'good' : 'warn'}">${diff >= 0 ? t('Buying comes out ahead by {0}', [money(diff)]) : t('Renting comes out ahead by {0}', [money(-diff)])}</span></p>`;
}
