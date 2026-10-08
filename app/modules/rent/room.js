// Rent & Buy → "Is this rent fair?" (Phase 7b B7): what you rent (whole flat · room) and, for a room, your own figure.
// Owner decision (DEC-016 Q3): there is no public data on room rents, so a room rent is never estimated, never
// compared with whole-flat rents and never judged "fair" — no median, no verdict, no chart, no yield. Pure markup.
import { esc, money, pct } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { monthLabel } from '../../core/typical.js';
import { rentToIncome } from '../../engine/rent.js';
import { moneyInput, formatMoney } from '../../core/moneyinput.js';

export const RENT_TYPES = [['whole', 'Whole flat'], ['room', 'Room']];
export const ROOM_NOTE = "Your figure. There's no public data on room rents, so we can't say if it's fair.";

/** "What are you renting?" — both choices open (Room was greyed before 7b). */
export function rentTypeField(type) {
  const btn = ([v, label]) => {
    const on = v === type;
    return `<button type="button" role="radio" data-rt="${v}" aria-checked="${on}" tabindex="${on ? 0 : -1}" class="${on ? 'on' : ''}">${esc(t(label))}</button>`;
  };
  return `<div class="seg-field">
      <span class="f-label" id="rtTypeLbl">${t('What are you renting?')}</span>
      <div class="seg" id="rtType" role="radiogroup" aria-labelledby="rtTypeLbl">${RENT_TYPES.map(btn).join('')}</div>
    </div>`;
}

/**
 * The amount field: "Asking rent" for a whole flat, "Your room rent" for a room (same shared figure, #rtAsk), with
 * separators (core/moneyinput.js). median = the whole-flat median here: the placeholder on desktop; on a phone
 * (P-42) no number in the box — it looked typed — but "Median here: S$3,300" under it.
 */
export function amountField(type, amount, median = null, phone = false) {
  const label = type === 'room' ? t('Your room rent (S$ a month)') : t('Asking rent (S$/month)');
  const med = type !== 'room' && median > 0 ? median : null;
  const help = med != null && phone ? `<small class="f-help rt-median">${esc(t('Median here: {0}', [money(med)]))}</small>` : '';
  return `<label class="f"><span>${label}</span>${moneyInput({ attrs: 'id="rtAsk"', value: amount ?? null, placeholder: med != null && !phone ? formatMoney(med) : '' })}${help}</label>`;
}

/** Room: the note and, when the income is known, the share of income — nothing estimated. */
export function roomBody(amount, income, needIncome) {
  const share = amount != null && income ? `<div class="kpis"><div class="kpi"><small>${t('Rent as share of income')}</small><b>${pct(rentToIncome({ rent: amount, income }))}</b><small>${t('your figure')} · ${t('household gross income')}</small></div></div>`
    : amount != null ? needIncome : '';
  return `<p class="default-note" role="note"><span class="dn-ic" aria-hidden="true">i</span><span>${esc(t(ROOM_NOTE))}</span></p>${share}`;
}

/** Whole flat: which window the comparison used, next to the verdict ("Last 12 months · to Sep 2026"). */
export function windowLine(comps, months) {
  if (!comps || !Array.isArray(months)) return '';
  const to = monthLabel(months[1]);
  return `<p class="f-help rt-window">${comps.months ? t('Last {0} months · to {1} (HDB rental approvals)', [comps.months, to]) : t('Latest quarterly median · to {0} (HDB rental approvals)', [to])}</p>`;
}

/**
 * The rent Rent or buy? compares: a room → only the rent you typed (never a median — no public room data, so no
 * rent at all until you type one); a whole flat → yours, else the median here. rt = core/rentshare sharedRent().
 * @returns {{ rent:number|null, typed:boolean }}
 */
export function rentToCompare(rt, comps) {
  if (rt && rt.type === 'room') return { rent: rt.amount > 0 ? rt.amount : null, typed: true };
  const mine = rt && rt.amount > 0 ? rt.amount : null;
  return { rent: mine ?? (comps && comps.med > 0 ? comps.med : null), typed: mine != null };
}

/** Rent or buy?: the rent compared, and whose figure it is. */
export function rentCompared(type, rent, typed) {
  if (type === 'room') return t('Rent: {0} a month (your figure)', [money(rent)]);
  return typed ? t('Rent: {0} a month (your asking rent)', [money(rent)]) : t('Rent: {0} a month (median rent here)', [money(rent)]);
}

/** Every English string here (zh coverage test). */
export const roomStrings = () => [...RENT_TYPES.map(([, l]) => l), ROOM_NOTE, 'What are you renting?', 'Your room rent (S$ a month)', 'Asking rent (S$/month)',
  'Median here: {0}', 'Rent as share of income', 'your figure', 'household gross income', 'Last {0} months · to {1} (HDB rental approvals)',
  'Latest quarterly median · to {0} (HDB rental approvals)', 'Rent: {0} a month (your figure)', 'Rent: {0} a month (your asking rent)', 'Rent: {0} a month (median rent here)'];
