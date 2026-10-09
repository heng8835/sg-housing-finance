// "About you" page markup (spec phone-topbar-area-household.md §4.2, slice S3): the basics first in one open card,
// then four folded groups with one-line summaries (household/groups.js). Pure HTML builder (no DOM): index.js puts it
// in the dialog and handles the events. Same store paths and data-path values as before; help text only behind ⓘ
// (a button that shows one hidden line under its field). Phone and desktop share this markup (owner Q7).
import { grants } from '../../engine/grants.js';
import { atPayoutAge } from '../../engine/cpfbuy.js';
import { esc, money } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { flatTypeLabel } from '../../core/flattype.js';
import { grantNotesFor } from '../../core/grantnotes.js';
import { moneyInput, parseMoney } from '../../core/moneyinput.js';
import { loanChoice, loanSeg } from './loan.js';
import { GROUPS, summaries, statusLine, cpfBuyers } from './groups.js';

const CITIZEN = [['SC', 'Citizen'], ['PR', 'PR'], ['F', 'Foreigner']];
const PARENTS = [['none', 'No'], ['near', ['Within {0} km of parents / child', 'grant.phg.near_km']], ['with', 'Living with parents / child']];
const TIMER = [[true, 'First-timers'], ['mixed', 'One first-timer, one second-timer'], [false, 'Second-timers']];
const NATIONALITY = [['MY', 'Malaysian'], ['US', 'American (US)'], ['EFTA', 'Iceland / Liechtenstein / Norway / Switzerland'], ['other', 'Other']];
const PASS = [['EP', 'Employment Pass'], ['SP', 'S Pass'], ['WP', 'Work Permit'], ['DP', 'Dependant / Long-Term Visit Pass'], ['student', 'Student Pass']];
const SECTOR = [['services', 'Services'], ['manufacturing', 'Manufacturing'], ['cmp', 'Construction / marine / process']];
const OWNED = [[0, 'None'], [1, 'One'], [2, 'Two or more']];

/** The ⓘ lines (English = i18n key). */
export const HELP = {
  income: 'Gross pay a month, before CPF.',
  cpfOa: 'Ordinary Account — the CPF part used for housing.',
  cash: 'Cash you can put into the home.',
  citizenship: "Foreigners don't have CPF, can't buy HDB flats and pay ABSD on private homes — the Afford tab shows what applies.",
  otherDebts: 'Car, study and other loan repayments a month. Banks count them in the loan limit.',
  grantsOverride: 'The grant total in your HFE letter. It replaces the estimate.',
  cpfLifeMonthly: 'Only if your CPF LIFE payouts have started.',
};

const LOCK = '<svg class="hh-lock" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';

/** data-path → element id ("buyers.0.income" → "hh-buyers-0-income"). */
export const idFor = (path) => `hh-${String(path).replace(/[^\w-]/g, '-')}`;

/**
 * The whole page (inside form.drawer-body).
 * @param {object} x household  @param {object} policy
 * @param {{ phone?:boolean, sample?:boolean, pro?:boolean, folds?:{ attr:(key:string)=>string } }} [o]
 */
export function formHtml(x, policy, { phone = false, sample = false, pro = false, folds = { attr: () => '' } } = {}) {
  const single = x.scheme === 'single';
  const opt = (list, cur) => list.map(([v, l]) => `<option value="${esc(String(v))}"${String(v) === String(cur) ? ' selected' : ''}>${esc(Array.isArray(l) ? t(l[0], [policy.get(l[1])]) : t(l))}</option>`).join('');
  // a field: label (+ ⓘ) above the control, the ⓘ line hidden under it; the label is a <label for>, never around the ⓘ
  const info = (path, label, help) => (help ? `<button type="button" class="hh-i" aria-expanded="false" aria-controls="${idFor(path)}-help" aria-label="${esc(t('About {0}', [t(label)]))}"><span aria-hidden="true">i</span></button>` : '');
  const helpLine = (path, help) => (help ? `<p class="hh-help" id="${idFor(path)}-help" hidden>${esc(t(help))}</p>` : '');
  // below = false: the caller renders the ⓘ line itself (in .hh-row it spans the whole row, review nice-to-have 3)
  const field = (path, label, control, help, cls = '', below = true) => `<div class="f hh-f${cls ? ` ${cls}` : ''}"><span class="f-label"><label for="${idFor(path)}">${t(label)}</label>${info(path, label, help)}</span>${control}${below ? helpLine(path, help) : ''}</div>`;
  const num = (path, val, label, attrs = '', help = '') => field(path, label, `<input type="number" inputmode="numeric" id="${idFor(path)}" data-path="${path}" value="${val ?? ''}" ${attrs}>`, help);
  // money: a text field with thousands separators (core/moneyinput.js); index.js parse() reads it with parseMoney
  const amt = (path, val, label, help = '', cls = '', below = true) => field(path, label, moneyInput({ value: val, attrs: `id="${idFor(path)}" data-path="${path}"` }), help, cls, below);
  const sel = (path, label, list, cur, extra = '', help = '') => field(path, label, `<select id="${idFor(path)}" data-path="${path}" ${extra}>${opt(list, cur)}</select>`, help);
  // a switch for one store path: the radiogroup carries data-path (open-at-field lands on it), buttons data-act / data-i / data-v
  const pick = (path, label, act, i, items, cur, help = '') => `<div class="f hh-f seg-field"><span class="f-label"><span id="${idFor(path)}-l">${t(label)}</span>${info(path, label, help)}</span>
    <div class="seg hh-seg" role="radiogroup" aria-labelledby="${idFor(path)}-l" data-path="${path}">${items.map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === cur}" data-act="${act}" data-i="${i}" data-v="${v}" class="${v === cur ? 'on' : ''}">${t(l)}</button>`).join('')}</div>${helpLine(path, help)}</div>`;

  function buyerBasics(b, i, n) {
    const F = b.citizenship === 'F';
    // Remove: a quiet text button in the last buyer's heading row (review H-2); the fieldset is named by the title only
    const remove = n > 1 && i === n - 1 ? `<button type="button" class="hh-remove" data-act="remove-buyer" data-i="${i}" aria-label="${esc(t('Remove buyer {0}', [i + 1]))}">${t('Remove')}</button>` : '';
    return `<fieldset class="buyer" data-buyer="${i}" aria-labelledby="hh-buyer-${i}"><legend><span id="hh-buyer-${i}">${t('Buyer {0}', [i + 1])}</span>${remove}</legend>
      <div class="hh-row">${num(`buyers.${i}.age`, b.age, 'Age', 'min="21" max="99"')}${amt(`buyers.${i}.income`, b.income, 'Income a month', HELP.income, '', false)}${helpLine(`buyers.${i}.income`, HELP.income)}</div>
      ${pick(`buyers.${i}.citizenship`, 'Citizenship', 'cit', i, CITIZEN, b.citizenship || 'SC', HELP.citizenship)}
      ${b.citizenship === 'PR' ? pick(`buyers.${i}.prYears3Plus`, 'PR for 3 years or more?', 'pr', i, [['true', 'Yes'], ['false', 'No']], b.prYears3Plus == null ? '' : String(b.prYears3Plus)) : ''}
      ${b.citizenship !== 'SC' ? sel(`buyers.${i}.nationality`, 'Nationality', [['', '—'], ...NATIONALITY], b.nationality || '') : ''}
      ${F ? sel(`buyers.${i}.pass`, 'Pass', [['', '—'], ...PASS], b.pass || '', 'data-restructure') : ''}
      ${F && b.pass === 'WP' ? sel(`buyers.${i}.wpSector`, 'Work Permit sector', [['', '—'], ...SECTOR], b.wpSector || '') : ''}
      ${F ? '' : amt(`buyers.${i}.cpfOa`, b.cpfOa, 'CPF OA balance', HELP.cpfOa)}
      </fieldset>`;
  }

  const sums = summaries(x, policy, { pro });
  const fold = (id, body, cls = '') => {
    const g = GROUPS.find((y) => y.id === id);
    return `<details class="section fold hh-fold${cls ? ` ${cls}` : ''}" data-fold="${g.fold}" data-group="${id}"${folds.attr(g.fold)}>
      <summary><span class="fold-t">${t(g.title)}</span><span class="fold-s" data-sum="${id}">${esc(sums[id])}</span></summary>
      <div class="fold-body">${body}</div></details>`;
  };

  const cpfWho = cpfBuyers(x);
  const cpfBody = cpfWho.map(({ b, i }) => {
    const payout = atPayoutAge(b, policy);
    return `<div class="hh-cpfb${payout ? '' : ' pro-only'}">${cpfWho.length > 1 ? `<h4 class="hh-sub">${t('Buyer {0}', [i + 1])}</h4>` : ''}
      ${payout ? amt(`buyers.${i}.cpfLifeMonthly`, b.cpfLifeMonthly, 'CPF LIFE payout a month', HELP.cpfLifeMonthly) : ''}
      <div class="pro-only">${amt(`buyers.${i}.cpfSa`, b.cpfSa, 'Special Account')}${amt(`buyers.${i}.cpfMa`, b.cpfMa, 'MediSave')}${amt(`buyers.${i}.cpfRa`, b.cpfRa, 'Retirement Account')}</div></div>`;
  }).join('');
  // Simple: the CPF group shows only when it has a field there (a buyer at the CPF LIFE payout age; owner Q8)
  const cpfSimple = cpfWho.some(({ b }) => atPayoutAge(b, policy));

  const close = phone ? `<button class="btn sm" value="close">${t('Close')}</button>` : `<button class="btn sm" value="close" aria-label="${esc(t('Close'))}">✕</button>`;
  return `<div class="drawer-head"><h2 id="hhTitle">${t('About you')}</h2>${close}</div>
      <p class="hh-line">${LOCK}<span id="hhLine">${esc(statusLine(x, { sample }))}</span>${sample ? `<button type="button" class="link hh-exit" data-act="sample-exit">${t('Exit sample')}</button>` : ''}</p>
      ${x.needsReview ? `<div class="notice" role="note">${t('Your old “Cash + CPF” figure was put into Cash. Move your CPF OA balance into the buyer rows so the cash checks are right.')} <button type="button" class="link" data-act="reviewed">${t('Done')}</button></div>` : ''}
      <div class="section hh-basics" data-group="basics"><h3>${t('The basics')}</h3>
        <div class="f hh-f seg-field"><span class="f-label" id="hhSchemeLbl">${t('Buying as')}</span>
          <div class="seg hh-seg" role="radiogroup" aria-labelledby="hhSchemeLbl" data-path="scheme">${[['family', 'Family / couple'], ['single', 'Single']].map(([v, l]) => {
    const on = (single ? 'single' : 'family') === v;
    return `<button type="button" role="radio" aria-checked="${on}" data-act="scheme" data-v="${v}" class="${on ? 'on' : ''}">${t(l)}</button>`;
  }).join('')}</div></div>
        ${x.buyers.map((b, i) => buyerBasics(b, i, x.buyers.length)).join('')}
        ${!single && x.buyers.length < 2 ? `<div class="actions"><button type="button" class="btn sm" data-act="add-buyer">+ ${t('Add second buyer')}</button></div>` : ''}
        <div class="hh-cash">${amt('cash', x.cash, 'Cash savings for the home', HELP.cash)}</div>
      </div>
      ${fold('grants', `${sel('firstTimer', 'First-time buyers?', single ? TIMER.filter(([v]) => v !== 'mixed') : TIMER, x.firstTimer, 'data-type="timer"')}
        ${sel('propertiesOwned', 'Homes you already own', OWNED, x.propertiesOwned, 'data-type="int"')}
        ${sel('parents', 'Close to parents / married child?', PARENTS, x.parents)}
        <div id="hhGrants">${grantsPreview(x, policy)}</div>
        ${amt('grantsOverride', x.grantsOverride, 'Grant from your HFE letter (optional)', HELP.grantsOverride)}`)}
      ${fold('loan', `<div class="f hh-f seg-field" id="hhLoan"><span class="f-label" id="hhLoanLbl">${t('Loan type')}</span>${loanSeg(loanChoice(x, policy))}</div>
        ${num('tenure', x.tenure, 'Loan tenure (years)', 'min="5" max="30"')}
        ${amt('otherDebts', x.otherDebts, 'Other loans a month (car, study…)', HELP.otherDebts)}`)}
      ${cpfWho.length ? fold('cpf', cpfBody, cpfSimple ? '' : 'pro-only') : ''}
      ${fold('data', `<div class="actions">
          <button type="button" class="btn sm" data-act="export">${t('Export (.json)')}</button>
          <label class="btn sm file">${t('Import')}<input type="file" accept="application/json,.json" data-act="import" hidden></label>
          <button type="button" class="btn sm danger" data-act="forget">${t('Forget my data')}</button>
        </div>
        <p class="hint" id="hhDataMsg" aria-live="polite"></p>
        ${sample ? '' : `<div class="hh-links"><button type="button" class="link" data-act="samples">${t('Try a sample household')}</button>
          <button type="button" class="link" data-act="edit-answers">${t('Edit answers')}</button>
          <button type="button" class="link" data-act="start">${t('Start over')}</button></div>`}`, 'hh-data')}
      ${phone ? `<div class="drawer-foot"><button class="btn primary" value="close">${t('Done')}</button></div>` : ''}`;
}

/** A field's value as the store gets it (input / select element, or anything with dataset, value and type). */
export function parseField(el) {
  if (el.dataset.type === 'timer') return el.value === 'true' ? true : el.value === 'false' ? false : 'mixed';
  if (el.dataset.type === 'int') return +el.value;
  if (el.dataset.type === 'bool') return el.value === '' ? null : el.value === 'true';
  if ('money' in el.dataset) return parseMoney(el.value); // NaN = cannot be read yet (the input handler skips it)
  if (el.type === 'number') return el.value === '' ? null : +el.value;
  return el.value;
}

/** Grants estimate inside "Grants and first home": the engine's totals as they are + the notes that apply (B11). */
export function grantsPreview(x, policy) {
  const out = ['4 ROOM', '5 ROOM'].map((ft) => `${flatTypeLabel(ft)} ${money(grants({ household: x, flatType: ft }, policy).total)}`);
  const notes = grantNotesFor(grants({ household: x, flatType: '4 ROOM' }, policy));
  return `<p class="hint">${t('Estimated')}: ${out.join(' · ')}.</p>${notes.map((n) => `<p class="hint">• ${esc(t(n))}</p>`).join('')}`;
}

/** Every English string this file shows (zh coverage test; option lists included). */
export const uiStrings = () => [...Object.values(HELP), ...[CITIZEN, TIMER, NATIONALITY, PASS, SECTOR, OWNED].flatMap((l) => l.map(([, v]) => v)),
  'No', 'Living with parents / child', 'Within {0} km of parents / child', 'About {0}', 'Buyer {0}', 'Age', 'Income a month', 'Citizenship',
  'PR for 3 years or more?', 'Yes', 'Nationality', 'Pass', 'Work Permit sector', 'CPF OA balance', 'Remove buyer {0}', 'Remove', 'CPF LIFE payout a month',
  'Special Account', 'MediSave', 'Retirement Account', 'Close', 'About you', 'Exit sample',
  'The basics', 'Buying as', 'Family / couple', 'Single', 'Add second buyer', 'Cash savings for the home', 'First-time buyers?',
  'Homes you already own', 'Close to parents / married child?', 'Grant from your HFE letter (optional)', 'Loan type', 'Loan tenure (years)',
  'Other loans a month (car, study…)', 'Export (.json)', 'Import', 'Forget my data', 'Try a sample household', 'Edit answers', 'Start over', 'Done',
  'Estimated', '4 ROOM', '5 ROOM'];
