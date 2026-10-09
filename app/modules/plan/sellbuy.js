// Plan tab — sell then buy: what selling the current home releases, what the next flat (the focus
// flat) needs, the gap, the order of steps and the deadlines. Engine: engine/sellbuy.js.
import { sellThenBuy, defaultMode } from '../../engine/sellbuy.js';
import { esc, money } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { householdLink } from '../../core/filllink.js';
import { field, numIn, moneyIn, selIn, notesFold, todayIso } from './ui.js';
import { defaultNote } from '../../core/typical.js';
import { moveTimelineBlock } from './contra.js';
import { blockFields, rangeFor } from './salerange.js';

const FLAT_TYPES = [['2 ROOM', '2 ROOM'], ['3 ROOM', '3 ROOM'], ['4 ROOM', '4 ROOM'], ['5 ROOM', '5 ROOM'], ['EXECUTIVE', 'EXECUTIVE']];
const MODES = [['', 'Suggested order'], ['contra', 'Sell and buy at the same time (contra)'], ['sell-first', 'Sell first, then buy'], ['buy-first', 'Buy first, then sell']];

/** The move mode in force (chosen, or the engine's default for this pair of property types). */
export const moveMode = (cur) => cur.mode || defaultMode(cur.propertyType === 'private' ? 'private' : 'hdb', 'hdb');

function inputs(c, year, mode = 'pro') {
  const hdb = c.propertyType !== 'private';
  return `<div class="fields">
    ${field(t('Home you own now'), selIn('plan.current.propertyType', [['hdb', 'HDB flat'], ['private', 'Private property']], c.propertyType))}
    ${hdb ? field(t('Flat type'), selIn('plan.current.flatType', FLAT_TYPES, c.flatType)) : ''}
    ${hdb ? blockFields(c) : ''}
    ${field(t('Expected sale price (S$)'), moneyIn('plan.current.salePrice', c.salePrice))}
    ${hdb ? rangeFor(c, mode) : ''}
    ${field(t('Outstanding loan (S$)'), moneyIn('plan.current.outstandingLoan', c.outstandingLoan))}
    ${field(t('CPF used for it (S$)'), moneyIn('plan.current.cpfUsed', c.cpfUsed))}
    ${field(t('Accrued interest on that CPF (S$)'), moneyIn('plan.current.accruedInterest', c.accruedInterest, t('blank = estimate')))}
    ${field(t('Year you bought'), numIn('plan.current.boughtYear', c.boughtYear, `min="1960" max="${year}" step="1"`))}
    ${hdb ? field(t('Bought with a housing subsidy?'), selIn('plan.current.subsidised', [['', 'Not sure'], ['true', 'Yes'], ['false', 'No']], c.subsidised == null ? '' : String(c.subsidised), 'bool')) : field(t('Years held'), numIn('plan.current.yearsHeld', c.yearsHeld, 'min="0" step="1"'))}
    ${field(t('Order'), selIn('plan.current.mode', MODES, c.mode || ''), 'wide')}
  </div>
  <p class="hint">${t('CPF used and accrued interest are on your CPF housing withdrawal statement (CPF website → My Statement).')} ${t('Leave the interest blank to estimate it from the year you bought.')}</p>`;
}

/** Sub-line of "CPF back to your OA" and the breakdown row: never claims interest that is not counted (A5). */
export function cpfBackLabels(pr) {
  if (pr.accruedSource === 'estimate') {
    return { sub: t('principal + est. interest {0}', [money(pr.accruedInterest)]), row: t('CPF refund (principal + est. interest)'), estimate: true };
  }
  if (pr.accruedSource === 'unknown') {
    return { sub: t('principal + interest (enter the year you bought to estimate)'), row: t('CPF refund (principal only — interest not counted)'), estimate: false };
  }
  return { sub: t('principal + accrued interest'), row: t('CPF refund (principal + interest)'), estimate: false };
}

/** Warning under the KPIs when the accrued interest is estimated or unknown ('' when typed). */
export function accruedWarning(pr) {
  if (pr.accruedSource === 'unknown') return `<p class="notice">${t('Cash from the sale may be lower — check your CPF statement (My Statement).')}</p>`;
  if (pr.accruedSource === 'estimate') return `<p class="notice">${t('Accrued interest is an estimate — cash from the sale changes with it. Check your CPF statement (My Statement) for the exact amount.')}</p>`;
  return '';
}

/** @param {{ h:object, f:object|null, plan:object, policy:object }} ctx */
export function sellBuySection({ h, tf: f, plan: p, policy, fold = () => '', today, mode = 'pro' }) {
  const simple = mode === 'simple'; // B10: no "OA" / "ABSD" without words in Simple
  const c = p.current || {};
  const year = +(today || todayIso()).slice(0, 4);
  const own = `<label class="check"><input type="checkbox" data-p="plan.current.owns" data-k="check"${c.owns ? ' checked' : ''}> ${t('I own a home now and will sell it')}</label>`;
  const head = `<div class="section" id="planSellBuy"><h3>${t('Sell then buy')}</h3>${own}`;
  if (!c.owns) return `${head}<p class="hint">${t('Tick this to plan selling your current home and buying the next one.')}</p></div>`;
  if (!(f && f.price > 0)) return `${head}${inputs(c, year, mode)}<p class="hint">${t('Pick the next flat on the map (Afford this →) to see the funding.')}</p></div>`;
  if (!(c.salePrice > 0)) return `${head}${inputs(c, year, mode)}<p class="hint">${t('Enter the expected sale price.')}</p></div>`;

  const r = sellThenBuy({
    current: { salePrice: c.salePrice, outstandingLoan: c.outstandingLoan, cpfPrincipalUsed: c.cpfUsed, accruedInterest: c.accruedInterest, boughtYear: c.boughtYear, asOfYear: year, flatType: c.flatType, propertyType: c.propertyType, subsidised: c.subsidised, holdingYears: c.yearsHeld },
    next: { price: f.price, flatType: f.flatType || '4 ROOM', propertyType: 'hdb', loanType: h.loan, tenure: h.tenure, remainingLease: f.remainingLease ?? null, subsidised: false },
    household: h, mode: c.mode || null,
  }, policy);
  const pr = r.proceeds, nf = r.nextFunding, gap = r.gap;
  const cb = cpfBackLabels(pr);
  const unsure = pr.cashUncertain ? ` <span class="tag warn">${pr.accruedSource === 'estimate' ? t('estimate') : t('uncertain')}</span>` : '';
  const line = (label, v, sign = '−') => (v ? `<tr><td>${label}</td><td>${sign} ${money(v)}</td></tr>` : '');
  // A11: never "short" before the household's own savings are known (the sale money alone isn't the whole picture)
  const savingsKnown = h.cash != null && h.cash !== '';
  const verdict = !savingsKnown && (gap.fundsShort > 0 || gap.cashShort > 0) ? ['neutral', t('Add your savings in About you to check whether the sale covers the next flat')]
    : gap.fundsShort > 0 ? ['critical', t('Short of {0} for the next flat', [money(gap.fundsShort)])]
    : gap.cashShort > 0 ? ['warn', t('Enough in total, but {0} more must be cash', [money(gap.cashShort)])]
      : ['good', t('Covered, with {0} to spare', [money(gap.surplus)])];
  return `${head}${inputs(c, year, mode)}${defaultNote(f)}
    ${h.firstTimer ? `<p class="notice">${t('Your household is set up as first-timers. If you have bought an HDB flat before, change this in About you — grants and loans differ for second-timers.')}</p>` : ''}
    <p class="verdict"><span class="tag ${verdict[0]}">${verdict[1]}</span>${!savingsKnown && verdict[0] === 'neutral' ? ` ${householdLink(h, 'cash')}` : ''} <small>${t('next: {0} at {1}', [esc(f.label || t('this flat')), money(f.price)])}</small></p>
    <div class="kpis">
      <div class="kpi"><small>${t('Cash from the sale')}</small><b>${money(pr.cashAfterTaxes)}${unsure}</b><small>${t('after loan, CPF refund and fees')}</small></div>
      <div class="kpi"><small>${simple ? t('CPF back to your CPF account') : t('CPF back to your OA')}</small><b>${money(pr.cpfRefund)}${cb.estimate ? ` <span class="tag warn">${t('estimate')}</span>` : ''}</b><small>${cb.sub}</small></div>
      <div class="kpi"><small>${t('Next loan')} (${nf.loanType === 'hdb' ? t('HDB') : t('bank')})</small><b>${money(nf.loan)}</b><small>${nf.loanReducedBy > 0 ? t('{0} less: sale proceeds go in first', [money(nf.loanReducedBy)]) : t('{0}/month over {1} years', [money(nf.monthly), nf.tenure])}</small></div>
      <div class="kpi"><small>${t('Available for the next flat')}</small><b>${money(nf.cashAvailable + nf.cpfOaAvailable)}</b><small>${t('cash {0} + CPF {1}', [money(nf.cashAvailable), money(nf.cpfOaAvailable)])}</small></div>
    </div>
    ${accruedWarning(pr)}
    <table class="mini pro-only"><tbody>
      <tr><td>${t('Sale price')}</td><td>${money(pr.gross)}</td></tr>
      ${line(t('Outstanding loan'), pr.loanRedemption)}${line(cb.row, pr.cpfRefund)}
      ${line(t('Agent commission'), pr.agentFee)}${line(t('Legal fees'), pr.legalFees)}
      ${line(t("Seller's Stamp Duty"), pr.ssd.amount)}${line(t('Resale levy'), pr.resaleLevy)}
      <tr><td><b>${t('Cash left')}</b></td><td><b>${money(pr.cashAfterTaxes)}</b></td></tr>
    </tbody></table>
    ${r.absdRefundDeadline ? `<p class="notice">${t(simple ? 'Additional stamp duty (ABSD) of {0} is refundable only if you sell the first home within {1} months of buying ({2}).' : 'ABSD of {0} is refundable only if you sell the first home within {1} months of buying ({2}).', [money(r.absdRefundDeadline.amount), r.absdRefundDeadline.sellWithinMonths, esc(t(r.absdRefundDeadline.from))])}</p>` : ''}
    ${notesFold([...r.notes, ...r.assumptions], 'sbNotes', fold)}
    ${moveTimelineBlock({ r, c, h, plan: p, policy, fromType: c.propertyType === 'private' ? 'private' : 'hdb', modeLabel: t(MODES.find(([v]) => v === r.mode)?.[1] || r.mode) })}
  </div>`;
}
