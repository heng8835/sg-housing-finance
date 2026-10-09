// Plan tab — Sell then buy → "Timeline" block (AF-11): a vertical timeline of the HDB resale steps for selling the
// current flat and buying the next, where the contra fits (sell and buy at the same time, the sale paying for the
// purchase), and — from the two completion dates the user expects — the gap / overlap and the cash bridge.
// Rendered as its own block at the bottom of the Sell then buy card. Engine: engine/contra.js.
import { moveSteps, completionGap } from '../../engine/contra.js';
import { summarise } from '../../engine/household.js';
import { esc, money } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { sourceHost } from '../../core/policyfmt.js';
import { field, dateIn, fmtDate } from './ui.js';

const LANE = { sell: 'Sell', buy: 'Buy', both: 'Sell + buy' };
// [title, note template]; note values come from the step (days / months) or the plan (amounts)
const STEP = {
  'sell-intent': ['Register your Intent to Sell', 'At least {0} days before you grant an Option to Purchase (HDB Flat Portal).'],
  'buy-hfe': ['Have a valid HFE letter', 'You need it when the seller grants you an Option to Purchase, and it must still be valid when you submit the resale application.'],
  'sell-otp': ['Grant your buyer an Option to Purchase', 'Your buyer has up to {0} calendar days to exercise it.'],
  'buy-otp': ['Get an Option to Purchase from your seller', 'If you use CPF or a loan, submit the Request for Value by the next working day.'],
  'sell-exercise': ['Your buyer exercises the option', 'From then on the sale is a binding contract.'],
  'buy-exercise': ['Exercise the option', 'Within {0} calendar days; a bank loan needs its Letter of Offer by then.'],
  'sell-application': ['Resale application for the sale', 'You and your buyer agree when to submit your portions; HDB accepts it once it is complete.'],
  'buy-application': ['Resale application for the purchase', 'You and your seller agree when to submit your portions; HDB accepts it once it is complete.'],
  contra: ['Contra: line up the two completions', 'Each completion is set within {0} days of HDB accepting its application. Aim for the sale to complete on or before the purchase, so its proceeds ({1} cash and {2} CPF back to your OA) pay for the next flat.'],
  'sell-complete': ['Sale completes', 'Within {0} days of HDB accepting the application: the loan is redeemed, {1} goes back to your CPF OA and {2} in cash comes to you (after fees).'],
  'buy-complete': ['Purchase completes', 'Within {0} days of HDB accepting the application: you pay the rest of the price and the loan is paid out. The Minimum Occupation Period starts.'],
  'extension-of-stay': ['Extension of stay (optional)', 'Up to {0} months after the sale completes, if your buyer agrees — only once you have committed to buy a completed home.'],
  'dispose-old': ['Sell the old home', 'Within {0} months of completing the purchase (HDB condition).'],
  'sell-private': ['Private sale completes', 'Option and completion periods are set in the contract (not modelled).'],
  'buy-private': ['Private purchase', 'Option, exercise and completion periods are set by the developer or seller.'],
  'buy-new-flat': ['New flat: key collection', 'Timing follows the sales exercise and construction (not modelled).'],
};

// 7c C12: steps whose title is a sell-buy glossary term (an ⓘ via learn:decorate)
const TERM = { 'sell-intent': 'intent-to-sell', contra: 'contra', 'extension-of-stay': 'extension-of-stay' };

const isoText = (v) => (typeof v === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v) ? fmtDate(v) : v);

function sourceLink(ids, policy) {
  const urls = [...new Set(ids.map((id) => policy.meta(id).source_url).filter((u) => /^https?:/.test(u || '')))];
  return urls.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(sourceHost(u))} ↗</a>`).join(' · ');
}

function noteFor(s, r, policy) {
  const [, tpl] = STEP[s.id] || [s.id, ''];
  const done = policy.get('sellbuy.resale.completion_days');
  const vals = {
    'sell-intent': [s.days], 'sell-otp': [s.days], 'buy-exercise': [s.days],
    contra: [done, money(Math.max(0, r.proceeds.cashAfterTaxes)), money(r.proceeds.cpfRefund)],
    'sell-complete': [s.days, money(r.proceeds.cpfRefund), money(Math.max(0, r.proceeds.cashAfterTaxes))],
    'buy-complete': [s.days], 'extension-of-stay': [s.maxMonths], 'dispose-old': [s.maxMonths],
  }[s.id];
  if (s.id === 'dispose-old' && !s.maxMonths) return t('Sell the old property later; ABSD paid on the second property is refundable only under IRAS conditions.');
  return t(tpl, vals);
}

/**
 * @param {{ r:object, c:object, h:object, plan:object, policy:object, fromType:'hdb'|'private', modeLabel:string }} x
 *   r = sellThenBuy() result, c = plan.current, modeLabel = the order in force (translated)
 */
export function moveTimelineBlock({ r, c, h, plan: p, policy, fromType = 'hdb', modeLabel = '' }) {
  const steps = moveSteps({ mode: r.mode, fromType, toType: 'hdb', nextSubsidised: false }, policy);
  const items = steps.map((s) => {
    const [title] = STEP[s.id] || [s.id];
    const cls = [`lane-${s.lane}`, s.id === 'contra' ? 'tl-key' : ''].filter(Boolean).join(' ');
    const src = s.ruleIds.length ? `<br><small class="tl-src">${t('Source')}: ${sourceLink(s.ruleIds, policy)}</small>` : '';
    return `<li class="${cls}"><div class="tl-when"><span class="tag ${s.lane === 'both' ? 'info' : 'neutral'}">${esc(t(LANE[s.lane]))}</span></div><b>${TERM[s.id] ? `<span data-term="${TERM[s.id]}">${esc(t(title))}</span>` : esc(t(title))}</b><br><small>${esc(noteFor(s, r, policy))}</small>${src}</li>`;
  }).join('');

  const hs = summarise(h);
  const nf = r.nextFunding;
  const sale = c.saleCompletion || null, buy = p.dates?.nextCompletion || null;
  const g = completionGap({
    saleCompletion: sale, purchaseCompletion: buy, mode: r.mode, toType: 'hdb', nextSubsidised: false,
    funding: nf.funding, grants: nf.grants?.total || 0, ownCash: hs.cash, ownCpf: hs.cpfOa, loanType: nf.loanType,
  }, policy);
  const verdict = g.disposeOk === false ? ['critical', t('The sale completes after the {0} deadline', [fmtDate(g.disposeBy)])]
    : g.order === 'same-day' ? ['good', t('Same-day completion: the sale pays for the purchase')]
      : g.order === 'sale-first' ? (g.stayCovered ? ['good', t('The sale completes {0} days first — an extension of stay can cover it', [g.days])]
        : ['warn', t('The sale completes {0} days first — plan where to stay', [g.days])])
        : g.order === 'purchase-first' ? (g.bridge > 0 ? ['warn', t('The purchase completes {0} days first — about {1} in cash to bridge', [-g.days, money(g.bridge)])]
          : ['good', t('The purchase completes {0} days first — your savings cover it', [-g.days])])
          : null;
  const notes = g.notes.filter(([n]) => !(verdict && n.startsWith('Enter both')));
  return `<div class="tl-block" id="planMoveTimeline">
    <h4 class="sub">${t('Timeline')}${modeLabel ? ` — ${esc(modeLabel)}` : ''}</h4>
    <ol class="tl">${items}</ol>
    <h4 class="sub">${t('Gap between the two completions')}</h4>
    <div class="fields">
      ${field(t('Sale completes (expected)'), dateIn('plan.current.saleCompletion', sale))}
      ${field(t('Purchase completes (expected)'), dateIn('plan.dates.nextCompletion', buy))}
    </div>
    ${verdict ? `<p class="verdict"><span class="tag ${verdict[0]}">${esc(verdict[1])}</span></p>` : ''}
    ${g.order === 'purchase-first' && g.bridge > 0 ? `<p class="hint">${t('A bank bridging loan can cover this gap until the sale money comes in.')} <span data-term="bridging-loan"></span></p>` : ''}
    ${notes.length ? `<ul class="notes">${notes.map(([n, v]) => `<li>${esc(t(n, v.map(isoText)))}</li>`).join('')}</ul>` : ''}
  </div>`;
}
