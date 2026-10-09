// Household page "About you" (the header entry is household/chip.js; the markup is household/form.js; groups and
// summaries household/groups.js): the basics first, then folded groups (spec phone-topbar-area-household.md §4).
// Writes only to the store; every other module reacts to the store.
import { downloadJson } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { saveView, keepFolds } from '../../core/fold.js';
import { loanChoice, loanSeg } from './loan.js';
import { isPhone } from '../../core/spotlight.js';
import { bindMoneyInputs } from '../../core/moneyinput.js';
import { mountChip } from './chip.js';
import { formHtml, grantsPreview, parseField } from './form.js';
import { pickTarget, foldOf, groupFor, summaries, statusLine } from './groups.js';

const FLASH_MS = 1600; // highlight on a field opened from a fill link (styles/modules.css .flash)
const HEAD_GAP = 12; // px between the sticky header and the label of a field opened from a link (§4.3 step 3)
const BUYER_ROW = /^buyers\.\d+\.(age|income)$/; // fields in a buyer's first row: the deep link scrolls to the buyer's legend
const FRAME_FALLBACK_MS = 50; // a page that is not being painted (background tab) gets no animation frame
/** fn once, after the next animation frame (or a short timeout when no frame comes). */
function nextFrame(fn) {
  let done = false;
  const go = () => { if (!done) { done = true; fn(); } };
  requestAnimationFrame(go); setTimeout(go, FRAME_FALLBACK_MS);
}

export function mountHousehold({ store, policy, bus }) {
  const chip = mountChip({ store }); // header entry: desktop chip / phone "You" (household/chip.js)

  const dlg = document.createElement('dialog');
  dlg.id = 'hhDialog'; dlg.className = 'drawer phone-full'; dlg.setAttribute('aria-labelledby', 'hhTitle'); // phones: full-screen page, sticky head + Done (styles/household.css)
  document.body.appendChild(dlg);
  const folds = keepFolds(dlg); // open / closed groups remembered for the session (F6)

  const h = () => store.get('household');
  const set = (path, v) => store.set(`household.${path}`, v);
  const pro = () => (store.get('ui') || {}).mode === 'pro';

  function renderForm() {
    const restore = saveView(dlg, () => dlg.querySelector('.drawer-body'));
    folds.snapshot();
    dlg.innerHTML = `<form method="dialog" class="drawer-body" autocomplete="off">${formHtml(h(), policy, { phone: isPhone(), sample: store.inSample(), pro: pro(), folds })}</form>`;
    restore();
  }

  /** After typing: the parts that depend on other fields (grants estimate, loan switch, summaries, status line). */
  function refreshLive() {
    const x = h();
    const g = dlg.querySelector('#hhGrants'); if (g) g.innerHTML = grantsPreview(x, policy);
    const loan = dlg.querySelector('#hhLoan'); // B11: income above the ceiling greys the HDB loan as you type
    if (loan) loan.innerHTML = `<span class="f-label" id="hhLoanLbl">${t('Loan type')}</span>${loanSeg(loanChoice(x, policy))}`;
    const sums = summaries(x, policy, { pro: pro() });
    dlg.querySelectorAll('[data-sum]').forEach((el) => { el.textContent = sums[el.dataset.sum] ?? ''; });
    const line = dlg.querySelector('#hhLine'); if (line) line.textContent = statusLine(x, { sample: store.inSample() });
  }

  dlg.addEventListener('input', (e) => {
    const el = e.target.closest('[data-path]'); if (!el) return;
    const v = parseField(el); // household/form.js: the value the store gets
    if (Number.isNaN(v)) return; // e.g. "12.5" or "-3" in a money field: marked aria-invalid, the saved value stays
    set(el.dataset.path, v);
    if (el.hasAttribute('data-restructure')) { renderForm(); return; } // renderForm restores focus + scroll
    refreshLive();
  });

  dlg.addEventListener('click', (e) => {
    const i = e.target.closest('.hh-i'); // ⓘ: show / hide the one help line under the field
    if (i) { const p = dlg.querySelector(`#${CSS.escape(i.getAttribute('aria-controls'))}`); if (p) { p.hidden = !p.hidden; i.setAttribute('aria-expanded', String(!p.hidden)); } return; }
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
      case 'cit': set(`buyers.${b.dataset.i}.citizenship`, b.dataset.v); break; // was a select: same value SC / PR / F, same re-render
      case 'pr': { const p = `buyers.${b.dataset.i}.prYears3Plus`, v = b.dataset.v === 'true'; set(p, x.buyers[+b.dataset.i]?.prYears3Plus === v ? null : v); break; } // tap the chosen one again = not answered (the old "—")
      case 'loan': if (b.getAttribute('aria-disabled') === 'true') return; set('loan', b.dataset.v); break; // B11: greyed HDB loan
      case 'add-buyer': set('buyers', [...x.buyers, { age: null, income: null, citizenship: 'SC', prYears3Plus: null, nationality: null, pass: null, wpSector: null, cpfOa: null, cpfSa: null, cpfMa: null, cpfRa: null }]); break;
      case 'remove-buyer': set('buyers', x.buyers.filter((_, k) => k !== +b.dataset.i)); break;
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

  bindMoneyInputs(dlg); // after the listener above: it saves first, then the field is re-grouped (same digits)
  chip.addEventListener('click', () => { renderForm(); dlg.showModal(); });

  // open at a field (§4.3): its group opens (and stays open on re-render), the field's label sits just under the
  // sticky header, focus + the 1.6 s flash. Not on the page → buyer 1's field → the group's title row → the first basics field.
  const shown = (el) => !!el && el.getClientRects().length > 0;
  function landOn(field) {
    const key = foldOf(groupFor(field));
    const d = key && dlg.querySelector(`details[data-fold="${key}"]`);
    if (d && !d.open) { d.open = true; folds.snapshot(); }
    const find = (c) => (c.path ? (c.path === 'forget' ? dlg.querySelector('[data-act="forget"]') : dlg.querySelector(`[data-path="${CSS.escape(c.path)}"]`))
      : c.group ? dlg.querySelector(`details[data-fold="${foldOf(c.group)}"] > summary`)
        : dlg.querySelector('.hh-basics [data-path]'));
    const c = pickTarget(field, (x) => shown(find(x)));
    return c && find(c);
  }
  bus.on('household:open', ({ field } = {}) => {
    renderForm();
    if (!dlg.open) dlg.showModal();
    if (!field) return;
    const el = landOn(field);
    if (!el) return;
    const target = el.matches('[role="radiogroup"]') ? el.querySelector('[aria-checked="true"]') || el.querySelector('button') : el;
    nextFrame(() => {
      const head = dlg.querySelector('.drawer-head');
      // a buyer's first row (age / income): the buyer's legend goes to the top so "Buyer 1" / "Buyer 2" stays in view (review H-5)
      const legend = BUYER_ROW.test(el.dataset.path || '') && el.closest('fieldset.buyer')?.querySelector(':scope > legend');
      const top = (head ? head.offsetHeight : 0) + HEAD_GAP, box = legend || el.closest('.hh-f') || el, body = dlg.querySelector('.drawer-body');
      dlg.style.setProperty('--hh-head', `${top}px`); // scroll-margin-top (styles/household.css)
      // a field near the end cannot scroll up to the header: room below it until the next re-render
      const margin = parseFloat(getComputedStyle(box).scrollMarginTop) || top; // legend / Forget: their own scroll-margin-top
      const need = box.getBoundingClientRect().top - body.getBoundingClientRect().top - margin - (body.scrollHeight - body.clientHeight - body.scrollTop);
      if (need > 0) {
        const sp = document.createElement('div'); sp.className = 'hh-room'; sp.setAttribute('aria-hidden', 'true'); sp.style.height = `${Math.ceil(need)}px`;
        body.insertBefore(sp, body.querySelector('.drawer-foot'));
      }
      box.scrollIntoView({ block: 'start' });
      target.focus({ preventScroll: true });
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), FLASH_MS);
    });
  });
}
