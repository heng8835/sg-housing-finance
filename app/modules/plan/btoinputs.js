// Plan tab — BTO vs resale inputs that keep the answer honest (Phase 7 A7): the flat types this household may
// buy new (engine/eligibility.js btoFlatTypes, with the reason), how long the wait is (the project's expected
// completion, a typed key month, or a future launch whose wait the user confirms — DEC-016 Q4), the user's own
// rent while waiting (default: the nearby median, labelled), and typed prices kept per project + flat type.
import { btoFlatTypes } from '../../engine/eligibility.js';
import { esc, money } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { ftWord } from '../../core/typical.js';
import { field, numIn, badge } from './ui.js';

// UI assumption (not a rule): the wait prefilled for a future launch — no verdict until the user confirms or edits it
export const FUTURE_WAIT_GUESS_YEARS = 4;
export const BTO_FLAT_TYPES = ['2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM'];
export const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const DEFAULT_FT = '4 ROOM';
const TYPED = 'typed'; // price key when there is no project list (btoData switch off)
const FLEXI = '2 ROOM';

/** Key of a typed price: '<project name>|<flat type>' ('typed|…' without a project list). */
export const priceKey = (project, ft) => `${project ?? TYPED}|${ft}`;

/** The price typed for this project + flat type (null = none). Older saves: the single btoPrice until it is filed. */
export function typedPrice(p, key) {
  const map = p.btoPrices || {};
  if (Object.prototype.hasOwnProperty.call(map, key)) return map[key] > 0 ? map[key] : null;
  return p.btoPrice > 0 ? p.btoPrice : null;
}

export const priceInput = (key, price) => `<input type="number" inputmode="decimal" data-bto-key="${esc(key)}" value="${price ?? ''}" min="0" step="5000">`;

/**
 * Flat type for a new flat. wanted = the stored choice or the map flat's type; explicit = the user picked it here.
 * @returns {{ gate:object, ft:string, ok:(ft:string)=>boolean, restricted:boolean, swapped:string|null }}
 */
export function flatTypeChoice(h, policy, { wanted = null, explicit = false, paths = null } = {}) {
  const gate = btoFlatTypes(h, policy, paths);
  const allowed = gate.allowed && gate.allowed.length ? gate.allowed.filter((x) => BTO_FLAT_TYPES.includes(x)) : [];
  const restricted = allowed.length > 0;
  const ok = (ft) => !restricted || allowed.includes(ft);
  const want = BTO_FLAT_TYPES.includes(wanted) ? wanted : DEFAULT_FT;
  const ft = ok(want) ? want : allowed[0];
  return { gate, ft, ok, restricted, swapped: explicit && !ok(want) ? want : null };
}

const ftName = (ft, restricted) => (restricted && ft === FLEXI ? t('2-room Flexi') : t(ft));

export function flatTypeSelect(choice) {
  const opts = BTO_FLAT_TYPES.map((v) => {
    const on = choice.ok(v);
    const label = on ? ftName(v, choice.restricted) : t('{0} — not open to your household', [t(v)]);
    return `<option value="${v}"${v === choice.ft ? ' selected' : ''}${on ? '' : ' disabled'}>${esc(label)}</option>`;
  });
  return `<select data-p="plan.btoFt" data-k="text">${opts.join('')}</select>`;
}

/** Who may buy new, first: can't at all (no verdict), or which flat types (with the rule). paths = pathways(). */
export function eligStrip(choice, paths) {
  const g = choice.gate, why = g.why.map((w) => esc(t(w))).join(' ');
  if (g.ok === false) {
    return `<p class="verdict"><span class="tag info">${t("Your household can't buy a new HDB flat now")}</span></p>
      <p class="hint"><b>${t('Why')}:</b> ${why}${paths?.nextBest ? ` ${esc(t(paths.nextBest))}` : ''}</p>
      <p class="hint">${t('No BTO-or-resale verdict is shown — the numbers below are for reference only.')}</p>`;
  }
  if (!choice.restricted) return '';
  const rule = g.ids.length ? ` <small class="pro-only">(${esc(t('Rule'))}: ${g.ids.map(esc).join(', ')})</small>${badge(g.status)}` : '';
  return `<p class="hint"><b>${t('Flat types for you')}:</b> ${why}${rule}</p>
    ${choice.swapped ? `<p class="notice">${t('{0} is not open to your household for a new flat — showing {1}.', [t(choice.swapped), ftName(choice.ft, true)])}</p>` : ''}`;
}

/**
 * How long until the keys. Modes: 'project' (the project's expected completion), 'month' (a typed key month, no
 * project list), 'future' (a future launch: the years the user confirmed; the prefilled guess alone counts as unknown).
 * @returns {{ mode:string, modes:string[], keyDate:string|null, waitMonths:number|null, confirmed:boolean, done:boolean }}
 */
export function waitChoice({ p, projectKey = null, typed = false, today }) {
  const now = today.slice(0, 7);
  const keys = YM.test(p.btoKeys || '') ? p.btoKeys : null;
  const modes = typed ? ['month', 'future'] : projectKey ? ['project', 'future'] : ['future'];
  const auto = typed ? (keys ? 'month' : 'future') : projectKey && projectKey > now ? 'project' : 'future';
  const mode = modes.includes(p.btoWait) ? p.btoWait : auto;
  const keyDate = mode === 'project' ? projectKey : mode === 'month' ? keys : null;
  const yrs = p.btoWaitYears;
  const confirmed = mode === 'future' && yrs != null && yrs !== '' && Number.isFinite(+yrs) && +yrs >= 0;
  return { mode, modes, keyDate, waitMonths: confirmed ? Math.round(+yrs * 12) : null, confirmed, done: keyDate != null && keyDate <= now };
}

/** "How long do you expect to wait?" + the month or years input. projectTop = the project's completion text. */
export function waitFields(p, w, projectTop = null) {
  const label = { project: t('This project: keys expected {0}', [projectTop || '']), month: t('I know the month (from HDB)'), future: t("A future launch — I'd apply later") };
  const sel = `<select data-p="plan.btoWait" data-k="text">${w.modes.map((m) => `<option value="${m}"${m === w.mode ? ' selected' : ''}>${esc(label[m])}</option>`).join('')}</select>`;
  let more = '';
  if (w.mode === 'month') more = field(t('Expected key collection (month)'), `<input type="month" data-p="plan.btoKeys" data-k="text" value="${esc(p.btoKeys ?? '')}" placeholder="YYYY-MM">`);
  if (w.mode === 'future') {
    const years = `<input type="number" inputmode="decimal" data-p="plan.btoWaitYears" data-k="num" min="0" step="0.5" value="${w.confirmed ? +p.btoWaitYears : FUTURE_WAIT_GUESS_YEARS}">`;
    const ok = w.confirmed ? '' : ` <button type="button" class="link" data-act="bto-wait-ok">${t('Use this wait')}</button>`;
    more = field(t('Years until you get the keys'), `${years}<small class="f-help">${t('Your guess — HDB shows the wait per project.')}${ok}</small>`);
  }
  return `${field(t('How long do you expect to wait?'), sel)}${more}`;
}

/** The rent paid while waiting: your rent now when typed (0 allowed), else the nearby median (null = none). */
export const rentNowOf = (p, median) => (p.rentNow != null && p.rentNow !== '' && Number.isFinite(+p.rentNow) && +p.rentNow >= 0 ? +p.rentNow : median ?? null);

export function rentField(p, median, ft) {
  const help = median != null ? t('Blank = the nearby median for a whole {0} flat, {1}/month.', [ftWord(ft), money(median)]) : t('No rent data nearby — type your rent (0 if you pay none).');
  return field(t('Your rent now (S$/month)'), `${numIn('plan.rentNow', p.rentNow, `min="0" step="50" placeholder="${median != null ? Math.round(median) : ''}"`)}<small class="f-help">${help}</small>`);
}

/** Small line under "Rent while waiting": whose figure it is. */
export function rentInfo(p, median) {
  if (rentNowOf(p, null) != null) return t('your rent now: {0}/month', [money(+p.rentNow)]);
  return median != null ? t('{0}/month nearby median', [money(median)]) : t('no rent figure — enter your rent now');
}

/** Prompt when a typed price can't be compared yet (wait or rent unknown). */
export function askFor(r, w) {
  if (r.missing.includes('wait')) return w.mode === 'month' ? t('Enter the expected key collection month to see a comparison.') : t('Confirm or change the wait (your guess) to see a comparison.');
  if (r.missing.includes('rent')) return t('Enter your rent now to see a comparison.');
  return '';
}

/**
 * Events the generic Plan handler can't do: typed prices (per key) and the wait confirmation. Capture phase, so an
 * older save's single price is filed under the key it was shown with before the flat type or project changes.
 */
export function bindBto(el, { store }) {
  const file = (key, v) => store.set('plan.btoPrices', { ...(store.get('plan.btoPrices') || {}), [key]: v });
  el.addEventListener('change', (e) => {
    const x = e.target;
    if (x.dataset && x.dataset.btoKey != null) {
      if (store.get('plan.btoPrice') != null) store.set('plan.btoPrice', null);
      file(x.dataset.btoKey, x.value === '' || !(+x.value > 0) ? null : +x.value);
      return;
    }
    if ((x.dataset?.p === 'plan.btoFt' || x.dataset?.p === 'plan.btoId') && store.get('plan.btoPrice') != null) {
      const shown = el.querySelector('[data-bto-key]'), old = store.get('plan.btoPrice');
      store.set('plan.btoPrice', null);
      if (shown) file(shown.dataset.btoKey, old);
    }
  }, true);
  el.addEventListener('click', (e) => {
    if (!e.target.closest?.('button[data-act="bto-wait-ok"]')) return;
    const inp = el.querySelector('[data-p="plan.btoWaitYears"]');
    const v = inp && inp.value !== '' && Number.isFinite(+inp.value) && +inp.value >= 0 ? +inp.value : FUTURE_WAIT_GUESS_YEARS;
    store.set('plan.btoWaitYears', v);
  });
}
