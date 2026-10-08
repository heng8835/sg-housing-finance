// Household chip (header) + drawer: who is buying, their money, loan choice, grants, and data controls.
// Writes only to the store; every other module reacts to the store.
import { summarise } from '../../engine/household.js';
import { grants } from '../../engine/grants.js';
import { esc, money, kilo, downloadJson } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { saveView } from '../../core/fold.js';
import { loanChoice, loanSeg } from './loan.js';
import { grantNotesFor } from '../../core/grantnotes.js';

const CITIZEN = [['SC', 'Singapore Citizen'], ['PR', 'Permanent Resident'], ['F', 'Foreigner']];
const PARENTS = [['none', 'No'], ['near', ['Within {0} km of parents / child', 'grant.phg.near_km']], ['with', 'Living with parents / child']];
const TIMER = [[true, 'First-timers'], ['mixed', 'One first-timer, one second-timer'], [false, 'Second-timers']];
const NATIONALITY = [['MY', 'Malaysian'], ['US', 'American (US)'], ['EFTA', 'Iceland / Liechtenstein / Norway / Switzerland'], ['other', 'Other']];
const PASS = [['EP', 'Employment Pass'], ['SP', 'S Pass'], ['WP', 'Work Permit'], ['DP', 'Dependant / Long-Term Visit Pass'], ['student', 'Student Pass']];
const SECTOR = [['services', 'Services'], ['manufacturing', 'Manufacturing'], ['cmp', 'Construction / marine / process']];
const YESNO = [['true', 'Yes'], ['false', 'No']];
const OWNED = [[0, 'None'], [1, 'One'], [2, 'Two or more']];
const FLASH_MS = 1600; // highlight on a field opened from a "Set in household →" link (styles/modules.css .flash)

export function mountHousehold({ store, policy, bus }) {
  const chip = document.createElement('button');
  chip.id = 'hhChip'; chip.className = 'hh-chip'; chip.type = 'button';
  chip.setAttribute('aria-haspopup', 'dialog');
  document.querySelector('header .spacer').after(chip);

  const dlg = document.createElement('dialog');
  dlg.id = 'hhDialog'; dlg.className = 'drawer'; dlg.setAttribute('aria-labelledby', 'hhTitle');
  document.body.appendChild(dlg);

  const h = () => store.get('household');
  const set = (path, v) => store.set(`household.${path}`, v);

  function renderChip() {
    const s = summarise(h()), n = s.buyers.length;
    chip.innerHTML = s.income == null
      ? `👪 <b>${t('Set up your household')}</b>`
      : `👪 ${t(n === 1 ? '{0} buyer' : '{0} buyers', [n])}<span class="hh-more"> · ${t('{0}/mo', [kilo(s.income)])}${s.youngestAge ? ` · ${s.youngestAge}` : ''}</span> <span aria-hidden="true">▾</span>`;
    chip.title = t('Your household — used by every calculation. Stays in this browser.');
  }

  const opt = (list, cur) => list.map(([v, l]) => `<option value="${esc(String(v))}"${String(v) === String(cur) ? ' selected' : ''}>${esc(Array.isArray(l) ? t(l[0], [policy.get(l[1])]) : t(l))}</option>`).join('');
  const num = (path, val, label, attrs = '', cls = '') => `<label class="f${cls ? ` ${cls}` : ''}"><span>${t(label)}</span><input type="number" inputmode="numeric" data-path="${path}" value="${val ?? ''}" ${attrs}></label>`;
  const sel = (path, label, list, cur, extra = '') => `<label class="f"><span>${t(label)}</span><select data-path="${path}" ${extra}>${opt(list, cur)}</select></label>`;

  function buyerRow(b, i, n) {
    return `<fieldset class="buyer"><legend>${t('Buyer {0}', [i + 1])}${n > 1 ? ` <button type="button" class="link" data-act="remove-buyer" data-i="${i}">${t('remove')}</button>` : ''}</legend>
      <div class="fields">
        ${num(`buyers.${i}.age`, b.age, 'Age', 'min="21" max="99"')}${num(`buyers.${i}.income`, b.income, 'Gross monthly income (S$)', 'step="100" min="0"')}
        ${sel(`buyers.${i}.citizenship`, 'Residency', CITIZEN, b.citizenship, 'data-restructure')}
        ${b.citizenship === 'F' ? '' : num(`buyers.${i}.cpfOa`, b.cpfOa, 'CPF Ordinary Account (S$)', 'step="1000" min="0"')}
        ${b.citizenship === 'F' ? '' : `${num(`buyers.${i}.cpfSa`, b.cpfSa, 'Special Account (S$)', 'step="1000" min="0"', 'pro-only')}${num(`buyers.${i}.cpfMa`, b.cpfMa, 'MediSave (S$)', 'step="1000" min="0"', 'pro-only')}${num(`buyers.${i}.cpfRa`, b.cpfRa, 'Retirement Account (S$)', 'step="1000" min="0"', 'pro-only')}`}
        ${b.citizenship !== 'F' && +b.age >= policy.get('cpf.age.life_payout') ? num(`buyers.${i}.cpfLifeMonthly`, b.cpfLifeMonthly, 'CPF LIFE payout you receive (S$ a month, optional)', 'step="10" min="0"') : ''}
        ${b.citizenship === 'PR' ? sel(`buyers.${i}.prYears3Plus`, 'PR for 3 years or more?', [['', '—'], ...YESNO], b.prYears3Plus == null ? '' : String(b.prYears3Plus), 'data-type="bool"') : ''}
        ${b.citizenship !== 'SC' ? sel(`buyers.${i}.nationality`, 'Nationality', [['', '—'], ...NATIONALITY], b.nationality || '') : ''}
        ${b.citizenship === 'F' ? sel(`buyers.${i}.pass`, 'Pass', [['', '—'], ...PASS], b.pass || '', 'data-restructure') : ''}
        ${b.citizenship === 'F' && b.pass === 'WP' ? sel(`buyers.${i}.wpSector`, 'Work Permit sector', [['', '—'], ...SECTOR], b.wpSector || '') : ''}
      </div>
      ${b.citizenship === 'F' ? `<p class="hint">${t("Foreigners don't have CPF, can't buy HDB flats and pay ABSD on private homes — the Afford tab shows what applies.")}</p>` : ''}
      </fieldset>`;
  }

  function grantsPreview() {
    const out = ['4 ROOM', '5 ROOM'].map((ft) => `${t(ft)} ${money(grants({ household: h(), flatType: ft }, policy).total)}`);
    const notes = grantNotesFor(grants({ household: h(), flatType: '4 ROOM' }, policy)); // B11: notes only when they apply
    return `<p class="hint">${t('Estimated')}: ${out.join(' · ')}.</p>${notes.map((n) => `<p class="hint">• ${esc(t(n))}</p>`).join('')}`;
  }

  const seg = (label, act, items, cur, labelledBy = '') => `<div class="seg" role="radiogroup" ${labelledBy ? `aria-labelledby="${labelledBy}"` : `aria-label="${esc(t(label))}"`}>${items.map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === cur}" data-act="${act}" data-v="${v}" class="${v === cur ? 'on' : ''}">${t(l)}</button>`).join('')}</div>`;

  function renderForm() {
    const restore = saveView(dlg, () => dlg.querySelector('.drawer-body'));
    paintForm();
    restore();
  }

  function paintForm() {
    const x = h(), single = x.scheme === 'single', sample = store.inSample();
    dlg.innerHTML = `<form method="dialog" class="drawer-body" autocomplete="off">
      <div class="drawer-head"><h2 id="hhTitle">${t('Your household')}</h2><button class="btn sm" value="close" aria-label="${esc(t('Close'))}">✕</button></div>
      <p class="hint">${t('Used by every number in the app.')} <b>${t('Stays in this browser')}</b> — ${t('nothing is sent anywhere.')}</p>
      ${sample ? `<div class="notice" role="note">${t('This is a sample household. You can change anything here — the changes are discarded when you exit the sample.')} <button type="button" class="link" data-act="sample-exit">${t('Exit sample')}</button></div>`
    : `<p class="hint"><button type="button" class="link" data-act="samples">${t('Try a sample household →')}</button> · <button type="button" class="link" data-act="edit-answers">${t('Edit answers')}</button> · <button type="button" class="link" data-act="start">${t('Start over with a few quick questions')}</button></p>`}
      ${x.needsReview ? `<div class="notice" role="note">${t('Your old “Cash + CPF” figure was put into Cash. Move your CPF OA balance into the buyer rows so the cash checks are right.')} <button type="button" class="link" data-act="reviewed">${t('Done')}</button></div>` : ''}
      <div class="section"><h3>${t('Buying as')}</h3>
        ${seg('Scheme', 'scheme', [['family', 'Family / couple'], ['single', 'Single']], x.scheme === 'single' ? 'single' : 'family')}
        ${x.buyers.map((b, i) => buyerRow(b, i, x.buyers.length)).join('')}
        ${!single && x.buyers.length < 2 ? `<div class="actions"><button type="button" class="btn sm" data-act="add-buyer">+ ${t('Add second buyer')}</button></div>` : ''}
      </div>
      <div class="section"><h3>${t('Money for the purchase')}</h3>
        <div class="fields">
          ${num('cash', x.cash, 'Cash savings you can put in (S$)', 'step="1000" min="0"')}
          ${num('otherDebts', x.otherDebts, 'Other monthly loan repayments (car, study…) (S$)', 'step="50" min="0"')}
        </div>
      </div>
      <div class="section"><h3>${t('Situation')}</h3>
        <div class="fields">
          ${sel('firstTimer', 'First-time buyers?', single ? TIMER.filter(([v]) => v !== 'mixed') : TIMER, x.firstTimer, 'data-type="timer"')}
          ${sel('propertiesOwned', 'Homes you already own', OWNED, x.propertiesOwned, 'data-type="int"')}
          ${sel('parents', 'Close to parents / married child?', PARENTS, x.parents)}
        </div>
      </div>
      <div class="section"><h3>${t('Loan')}</h3>
        <div class="fields">
          <div class="seg-field" id="hhLoan"><span class="f-label" id="hhLoanLbl">${t('Loan type')}</span>${loanSeg(loanChoice(x, policy))}</div>
          ${num('tenure', x.tenure, 'Loan tenure (years)', 'min="5" max="30"')}
        </div>
      </div>
      <div class="section"><h3>${t('Grants')}</h3>
        <div id="hhGrants">${grantsPreview()}</div>
        <div class="fields">${num('grantsOverride', x.grantsOverride, 'Override with your HFE letter amount (S$, optional)', 'step="1000" min="0"', 'wide')}</div>
      </div>
      <div class="section"><h3>${t('Your data')}</h3>
        <div class="actions">
          <button type="button" class="btn sm" data-act="export">${t('Export (.json)')}</button>
          <label class="btn sm file">${t('Import')}<input type="file" accept="application/json,.json" data-act="import" hidden></label>
          <button type="button" class="btn sm danger" data-act="forget">${t('Forget my data')}</button>
        </div>
        <p class="hint" id="hhDataMsg" aria-live="polite"></p>
      </div>
    </form>`;
  }

  const parse = (el) => {
    if (el.dataset.type === 'timer') return el.value === 'true' ? true : el.value === 'false' ? false : 'mixed';
    if (el.dataset.type === 'int') return +el.value;
    if (el.dataset.type === 'bool') return el.value === '' ? null : el.value === 'true';
    if (el.type === 'number') return el.value === '' ? null : +el.value;
    return el.value;
  };

  dlg.addEventListener('input', (e) => {
    const el = e.target.closest('[data-path]'); if (!el) return;
    set(el.dataset.path, parse(el));
    if (el.hasAttribute('data-restructure')) { renderForm(); return; } // renderForm restores focus + scroll
    dlg.querySelector('#hhGrants').innerHTML = grantsPreview();
    const loan = dlg.querySelector('#hhLoan'); // B11: income above the ceiling greys the HDB loan as you type
    if (loan) loan.innerHTML = `<span class="f-label" id="hhLoanLbl">${t('Loan type')}</span>${loanSeg(loanChoice(h(), policy))}`;
  });

  dlg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    // in a sample household the live data is the sample's: Export / Import / Forget act on the user's own data only
    if (store.inSample() && ['export', 'import', 'forget'].includes(b.dataset.act)) { e.preventDefault(); sampleBlocked(); return; }
    if (b.tagName === 'INPUT') return;
    const x = h();
    switch (b.dataset.act) {
      case 'samples': dlg.close(); bus.emit('samples:open', {}); return;
      // modules/start: "Edit answers" keeps cash / CPF / grants; "Start over" clears the household first (A9)
      case 'edit-answers': dlg.close(); bus.emit('start:open', { opener: chip }); return;
      case 'start': if (!confirm(t('Start over? This clears your household in this browser.'))) return; dlg.close(); bus.emit('start:open', { opener: chip, fresh: true }); return;
      case 'sample-exit': bus.emit('samples:exit', {}); return;
      case 'scheme': set('scheme', b.dataset.v); if (b.dataset.v === 'single') set('buyers', x.buyers.slice(0, 1)); if (b.dataset.v === 'single' && x.firstTimer === 'mixed') set('firstTimer', true); break;
      case 'loan': if (b.getAttribute('aria-disabled') === 'true') return; set('loan', b.dataset.v); break; // B11: greyed HDB loan
      case 'add-buyer': set('buyers', [...x.buyers, { age: null, income: null, citizenship: 'SC', prYears3Plus: null, nationality: null, pass: null, wpSector: null, cpfOa: null, cpfSa: null, cpfMa: null, cpfRa: null }]); break;
      case 'remove-buyer': set('buyers', x.buyers.filter((_, i) => i !== +b.dataset.i)); break;
      case 'reviewed': set('needsReview', false); break;
      case 'export': downloadJson(store.export(), 'sg-housing-household.json'); break;
      case 'forget':
        if (confirm(t('Forget your household, shortlist and settings in this browser? This cannot be undone.'))) { store.reset(); location.reload(); }
        return;
      default: return;
    }
    renderForm();
  });

  function sampleBlocked() {
    dlg.querySelector('#hhDataMsg').textContent = t('Exit the sample first — Export, Import and Forget my data work on your own household, not on the sample.');
  }

  dlg.addEventListener('change', async (e) => {
    if (e.target.dataset.act !== 'import' || !e.target.files[0]) return;
    if (store.inSample()) { e.target.value = ''; sampleBlocked(); return; }
    try { store.import(JSON.parse(await e.target.files[0].text())); renderForm(); dlg.querySelector('#hhDataMsg').textContent = t('Imported.'); }
    catch (err) { dlg.querySelector('#hhDataMsg').textContent = t('Not imported: {0}. Nothing was changed.', [err.message]); }
  });

  chip.addEventListener('click', () => { renderForm(); dlg.showModal(); });
  // { field: 'buyers.0.income' } (from a "Set in household →" prompt) → open, then focus and flash that input
  bus.on('household:open', ({ field } = {}) => {
    renderForm();
    if (!dlg.open) dlg.showModal();
    if (!field) return;
    const el = dlg.querySelector(`[data-path="${CSS.escape(field)}"]`) || dlg.querySelector('[data-path^="buyers.0."]');
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.focus();
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), FLASH_MS);
  });
  store.subscribe('household', renderChip);
  renderChip();
}
