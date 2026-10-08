// Plan tab — "When you pay for a BTO" (AF-12): Pro fold inside the BTO vs resale card. Stages (booking →
// Agreement for Lease → key collection) with amounts, cash / CPF split by the household's loan type, dates when the
// booking date / expected completion are known, and the source of each rule. Works from a typed BTO price too
// (the BTO dataset may be switched off in a public build). Engine: engine/btopay.js.
import { btoPaymentStages } from '../../engine/btopay.js';
import { summarise } from '../../engine/household.js';
import { esc, money } from '../../core/dom.js';
import { t, currentLang } from '../../core/i18n.js';
import { sourceHost } from '../../core/policyfmt.js';
import { field, dateIn, badge, fmtDate } from './ui.js';

const STAGE = { booking: 'At flat booking', afl: 'Signing of the Agreement for Lease', keys: 'Key collection' };
const ITEM = {
  'option-fee': 'Option fee', 'down-cash': 'Downpayment (cash)', down: 'Downpayment (cash or CPF)',
  bsd: "Buyer's Stamp Duty", legal: 'Legal fees (estimate)', loan: 'Loan paid out',
};
/** 'YYYY-MM' → "Mar 2030" / "2030年3月". */
const ym = (s) => { const [y, m] = s.split('-').map(Number); return new Intl.DateTimeFormat(currentLang() === 'zh' ? 'zh-SG' : 'en-SG', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1))); };

function whenText(s, policy) {
  if (s.id === 'booking') return s.when ? fmtDate(s.when) : t('the day you book');
  if (s.id === 'afl') return s.when ? t('by {0}', [fmtDate(s.when)]) : t('within {0} months of booking', [policy.get('bto.afl.within_months')]);
  return s.when ? t('expected {0}', [ym(s.when)]) : t('when the flat is completed');
}

function sources(ids, policy) {
  const seen = new Map();
  for (const id of ids) {
    const m = policy.meta(id);
    if (!/^https?:/.test(m.source_url || '')) { seen.set('assumption', `<span>${esc(t('estimate'))}</span>`); continue; }
    const host = sourceHost(m.source_url);
    if (!seen.has(m.source_url)) seen.set(m.source_url, `<a href="${esc(m.source_url)}" target="_blank" rel="noopener">${esc(host)} ↗</a>${badge(m.status)}`);
  }
  return [...seen.values()].join(' · ');
}

/**
 * @param {{ price:number|null, flatType:string, keyDate:string|null, h:object, plan:object, policy:object, fold:Function }} x
 */
export function btoPayFold({ price, flatType, keyDate, h, plan: p, policy, fold = () => '' }) {
  const open = fold('btoPay', false);
  const head = `<details class="fold-inline pro-only" data-fold="btoPay"${open}><summary>${t('When you pay for a BTO')}</summary>`;
  if (!(price > 0)) return `${head}<p class="hint">${t('Enter the BTO price above to see when each payment is due.')}</p></details>`;
  const s = summarise(h);
  const couple = h.scheme !== 'single' && s.buyers.length >= 2;
  const r = btoPaymentStages({
    price, flatType, loanType: h.loan, tenure: h.tenure, averageAge: s.averageAge,
    deferredIncome: !!p.btoDeferred, bookingDate: p.btoBooked || null, keyDate,
    youngestAge: s.youngestAge, firstTimer: h.firstTimer, couple,
  }, policy);
  const lines = (st) => st.items.map((i) => `<li><span>${esc(t(ITEM[i.id] || i.id))}${i.note ? `<br><small>${esc(t(i.note[0], i.note[1]))}</small>` : ''}</span><span>${money(i.amount)}${i.id !== 'loan' ? ` <small>${i.cash ? t('cash') : t('cash or CPF')}</small>` : ''}</span></li>`).join('');
  const stages = r.stages.map((st) => `<li${st.id === 'keys' ? ' class="tl-key"' : ''}>
      <div class="tl-when">${esc(whenText(st, policy))}</div>
      <div><b>${esc(t(STAGE[st.id]))}</b> · ${t('you pay {0}', [money(st.amount)])}${st.cashMin > 0 ? ` <small>(${t('at least {0} in cash', [money(st.cashMin)])})</small>` : ''}</div>
      <ul class="tl-lines">${lines(st)}</ul>
      <small class="tl-src">${t('Source')}: ${sources(st.ruleIds, policy)}</small>
    </li>`).join('');
  const loanName = r.loanType === 'hdb' ? t('HDB loan') : t('bank loan');
  const deferred = `<label class="check"><input type="checkbox" data-p="plan.btoDeferred" data-k="check"${p.btoDeferred ? ' checked' : ''}> ${t('Young couple on deferred income assessment (lower first payment)')}</label>`;
  return `${head}
    <p class="sec-sub">${t('Using your {0} from Household ({1} years) and a price of {2}.', [loanName, h.tenure, money(price)])}</p>
    <div class="fields">${field(t('Flat booking date (optional)'), dateIn('plan.btoBooked', p.btoBooked))}${deferred}</div>
    <ol class="tl">${stages}</ol>
    <p class="hint">${t('In total you pay {0} before the loan ({1} at least in cash; the rest cash or CPF OA). The loan of {2} is paid out at key collection.', [money(r.total), money(r.cashTotal), money(r.loan)])}</p>
    ${r.notes.length ? `<ul class="notes">${r.notes.map(([n, v]) => `<li>${esc(t(n, v))}</li>`).join('')}</ul>` : ''}
  </details>`;
}
