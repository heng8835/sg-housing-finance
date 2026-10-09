// Afford → "Scenarios" (Phase 6b, AC 6): save the current flat + household + loan + Plan CPF settings as A–D
// (store slot `scenarios`, localStorage only — never a URL), compare them side by side and load one back.
// Every number is recomputed from the saved inputs by engine/scenario.js — the same engine calls as the Afford,
// Rent & Buy and Plan tabs; nothing computed is stored. The card is this module's own element: the Afford tab
// leaves a `data-slot="scenarios"` placeholder after its verdict and emits 'afford:painted' after each paint.
import { scenarioResults, snapshotOf, focusFromSnapshot } from '../../engine/scenario.js';
import { defaults, MAX_SCENARIOS, cleanScenarios } from '../../core/store.js';
import { offerUndo } from '../../core/undo.js';
import { CPF_DEFAULTS } from '../../core/cpf-defaults.js';
import { parentsKmFor } from '../../core/parents.js';
import { effectiveFlat, marketRentFor, townOfFlat, onTypicalChange } from '../../core/typical.js';
import { saveView } from '../../core/fold.js';
import { t } from '../../core/i18n.js';
import { cardHtml, defaultName, saleOf, RENT_BUY_YEARS } from './view.js';
import { cardsHtml, bindCards, CARDS_FROM } from './cards.js';

const phoneMq = typeof matchMedia === 'function' ? matchMedia('(max-width: 767px)') : null; // phone overhaul §3.5
const isPhone = () => !!(phoneMq && phoneMq.matches);

const MEMO_MAX = 16;
const copy = (v) => JSON.parse(JSON.stringify(v ?? {}));

/**
 * Put a scenario's inputs back into the store (Load): household, Plan CPF settings, the sale with its order (B14:
 * a scenario saved without a sale unticks "I own a home now", so the numbers match what was saved) and the flat.
 */
export function applyScenario(store, s) {
  const d = defaults();
  store.set('household', { ...d.household, ...copy(s.household) });
  store.set('plan.cpf', { ...d.plan.cpf, ...copy(s.plan && s.plan.cpf) });
  if (s.plan && s.plan.current) store.set('plan.current', { ...d.plan.current, ...copy(s.plan.current) }); // the sale it was saved with (A2)
  else if (store.get('plan.current.owns')) store.set('plan.current.owns', false);
  store.set('focus', focusFromSnapshot(s));
}

/**
 * @param {{ store:object, policy:object, bus:object, root:Element }} x  root = the Afford tab's element (#affordRoot)
 */
export function mountScenarios({ store, policy, bus, root }) {
  const node = document.createElement('div');
  node.className = 'section scenarios';
  node.id = 'affordScenarios';
  node.innerHTML = '<div class="sc-body"></div><p class="hint sc-msg" role="status" aria-live="polite"></p>';
  const body = node.querySelector('.sc-body'), status = node.querySelector('.sc-msg');
  const memo = new Map();
  let editing = null;
  const say = (m) => { status.textContent = m || ''; };
  const list = () => store.get('scenarios') || [];
  const byId = (id) => list().find((s) => s.id === id);

  /** Results for one snapshot (memoised on its inputs + the year; the name does not change any number). */
  function resultsFor(s) {
    const year = new Date().getFullYear();
    const key = JSON.stringify([year, s.focus, s.household, s.plan, s.market]);
    if (!memo.has(key)) {
      let r = null;
      try { r = scenarioResults(s, policy, { year, horizonYears: RENT_BUY_YEARS, cpfDefaults: CPF_DEFAULTS, parentsKm: parentsKmFor(s.household, s.focus) }); } catch (err) { console.warn('Scenario not calculated:', err.message); }
      if (memo.size >= MEMO_MAX) memo.clear();
      memo.set(key, r);
    }
    return memo.get(key);
  }

  function render() {
    const items = list(), tf = effectiveFlat(store, undefined, { prefer: store.get('plan.current.owns') ? 'largest' : null });
    const full = items.length >= MAX_SCENARIOS;
    const why = full ? t('All four scenarios are used — delete one to save another.') : !tf ? t('Enter a price or pick a flat first.') : '';
    const restore = saveView(node);
    const phone = isPhone(), layout = phone && items.length >= CARDS_FROM ? cardsHtml : null; // phone: 3–4 → swipe cards
    body.innerHTML = cardHtml({ list: items, results: items.map(resultsFor), canSave: !full && !!tf, why, editing, max: MAX_SCENARIOS, sale: saleOf(store.get('plan')), phone, layout });
    restore();
    bus.emit('learn:decorate', { root: node });
  }

  /** Put the card into the Afford tab's slot (after every Afford repaint). */
  function place(r = root) {
    const slot = r && r.querySelector('[data-slot="scenarios"]');
    if (slot) slot.replaceWith(node);
  }

  function save() {
    const tf = effectiveFlat(store, undefined, { prefer: store.get('plan.current.owns') ? 'largest' : null });
    if (!tf) return;
    const town = townOfFlat(tf), rent = marketRentFor(tf, policy);
    const id = store.saveScenario((sid) => snapshotOf({
      id: sid, name: defaultName(sid, tf, town, saleOf(store.get('plan'))), savedAt: new Date().toISOString(), flat: tf, town,
      household: store.get('household'), plan: store.get('plan'), marketRent: rent ? rent.rent : null,
    }));
    say(id ? t('Saved as scenario {0}.', [id]) : t('All four scenarios are used — delete one to save another.'));
  }

  function load(s) {
    const sells = !!(s.plan && s.plan.current);
    const what = sells ? t('This loads the flat, household, loan, CPF settings and sale saved in "{0}".', [s.name]) : t('This loads the flat, household, loan and CPF settings saved in "{0}".', [s.name]);
    if (!confirm(`${t('Replace your current inputs?')} ${what}`)) return;
    applyScenario(store, s);
    say(t('Loaded {0}.', [s.name]));
  }

  function finishRename(id, keep) {
    const input = node.querySelector('#scName');
    editing = null;
    if (keep && input && store.renameScenario(id, input.value)) return; // the store change re-renders
    render();
    node.querySelector(`[data-act="sc-rename"][data-i="${id}"]`)?.focus();
  }

  node.addEventListener('click', (e) => {
    if (e.target.closest('#scSave')) return save();
    const b = e.target.closest('button[data-act]');
    if (!b || !b.dataset.act.startsWith('sc-')) return;
    const s = byId(b.dataset.i);
    if (!s) return;
    switch (b.dataset.act) {
      case 'sc-load': load(s); break;
      case 'sc-rename': editing = s.id; render(); node.querySelector('#scName')?.select(); break;
      case 'sc-rename-save': finishRename(s.id, true); break;
      case 'sc-rename-cancel': finishRename(s.id, false); break;
      case 'sc-delete':
        // M-17 / Q7: deleted at once, with an Undo line instead of a confirm() box (the same id comes back
        // unless a new scenario took it meanwhile — cleanScenarios keeps the first)
        if (editing === s.id) editing = null;
        store.deleteScenario(s.id);
        say('');
        offerUndo(t('Deleted {0}.', [s.name]), () => store.set('scenarios', cleanScenarios([...list(), s])),
          { focusAfter: () => node.querySelector(`[data-act="sc-delete"][data-i="${s.id}"]`) });
        break;
      default:
    }
  });
  node.addEventListener('keydown', (e) => {
    if (e.target.id !== 'scName' || !editing) return;
    if (e.key === 'Enter') { e.preventDefault(); finishRename(editing, true); }
    else if (e.key === 'Escape') { e.preventDefault(); finishRename(editing, false); }
  });

  bindCards(node);
  bus.on('afford:painted', ({ root: r }) => place(r));
  phoneMq?.addEventListener?.('change', render);
  for (const k of ['scenarios', 'household', 'focus', 'plan.current']) store.subscribe(k, render);
  bus.on('data:ready', render);
  onTypicalChange(render);
  render();
  place();
}
