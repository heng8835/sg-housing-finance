// Phase 8a M-08 (owner Q3): one-field quick edits from an answer. Any [data-qe] button (the "Based on your household"
// rows, core/focusflat.js basedOnHtml) opens a small sheet with that one figure — per buyer where it is per buyer —
// that writes the REAL household as you type (same store paths as the About you page, so every tab updates live
// behind the sheet) and says so: "This changes About you." Done keeps it; Cancel / Esc put the old figures back.
// Phones: a bottom sheet above the tab bar, the answer still visible above it. Desktop: a small dialog by the row.
// The fields and labels are a pure function (qeFields, node-tested in tests/household/quickedit.test.js).
// P8-04: the sheet's first line repeats the answer it changes (the card's verdict + first figure, picked by the
// .based-on block's data-live selectors, "a|b" → "A · B"), so it stays in view above a phone keyboard.
import { esc } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { qePaths } from '../../core/focusflat.js';
import { moneyInput, parseMoney, bindMoneyInputs } from '../../core/moneyinput.js';
import { placeQuickFill } from '../../core/quickfill.js';

const PHONE = '(max-width: 767px)';
const WIDTH = 340; // px, desktop dialog
const TITLE = { income: 'Income', cash: 'Cash', cpfOa: 'CPF Ordinary Account', age: 'Ages' };
const LABEL = { income: 'Income a month', cash: 'Cash savings for the home', cpfOa: 'CPF OA balance', age: 'Age' };

const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
/** The live line's text: each selector's first match in the answer card (data-qe-live wins over its text), joined by " · ". */
export function liveText(card, sels) {
  if (!card || !sels) return '';
  return String(sels).split('|').map((sel) => { const el = card.querySelector(sel.trim()); return el ? squash(el.dataset?.qeLive || el.textContent) : ''; })
    .filter(Boolean).join(' · ');
}

const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

/**
 * The sheet's fields for one key: [{ path, label, kind: 'money'|'age', value }]. One buyer: "Income a month"; two:
 * "Buyer 1 · Income a month", "Buyer 2 · Income a month" (each buyer's own figure — the total is never split).
 */
export function qeFields(household, key) {
  const h = household || {}, paths = qePaths(h, key), many = (h.buyers || []).length > 1;
  return paths.map((path) => {
    const m = /^buyers\.(\d+)\./.exec(path);
    const label = m && many ? `${t('Buyer {0}', [+m[1] + 1])} · ${t(LABEL[key])}` : t(LABEL[key]);
    return { path, label, kind: key === 'age' ? 'age' : 'money', value: getPath(h, path) ?? null };
  });
}

/** Sheet title for a key ("Ages" for one buyer reads "Age"). */
export const qeTitle = (household, key) => (key === 'age' && (household?.buyers || []).length < 2 ? t('Age') : t(TITLE[key] || key));

/** The value the store gets from a field: money → number | null | NaN (cannot be read yet); age → number | null. */
export function qeValue(kind, raw) {
  if (kind === 'money') return parseMoney(raw);
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const n = +s;
  return Number.isFinite(n) ? n : Number.NaN;
}

export function mountQuickEdit({ store, bus }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'bsheet qe-dlg';
  dlg.setAttribute('aria-labelledby', 'qeT');
  document.body.append(dlg);
  bindMoneyInputs(dlg);
  let before = null, opener = null; // the household when the sheet opened (Cancel), the row that opened it
  let live = null; // { id, sel }: the .based-on block that opened the sheet and its answer selectors (P8-04)
  function paintLive() {
    const p = dlg.querySelector('.qe-live');
    if (!p || !live) return;
    const bo = (live.id && document.getElementById(live.id)) || (opener && opener.isConnected ? opener.closest('.based-on') : null);
    const text = liveText(bo && bo.parentElement, live.sel);
    if (p.textContent !== text) p.textContent = text;
    p.hidden = !text;
  }

  function open(key, anchor) {
    const h = store.get('household');
    const fields = qeFields(h, key);
    if (!fields.length) return;
    before = JSON.parse(JSON.stringify(h));
    opener = anchor;
    const bo = anchor && anchor.closest ? anchor.closest('.based-on[data-live]') : null;
    live = bo ? { id: bo.id, sel: bo.dataset.live } : null;
    const input = (f, i) => (f.kind === 'money'
      ? moneyInput({ value: f.value, attrs: `id="qeF${i}" data-qe-path="${esc(f.path)}" data-qe-kind="money"` })
      : `<input type="number" inputmode="numeric" min="21" max="99" id="qeF${i}" data-qe-path="${esc(f.path)}" data-qe-kind="age" value="${f.value ?? ''}">`);
    dlg.innerHTML = `<div class="bs-head"><h2 id="qeT">${esc(qeTitle(h, key))}</h2></div>
      <form class="bs-body" method="dialog" novalidate>${live ? '<p class="qe-live" aria-live="polite" hidden></p>' : ''}
        <div class="fields">${fields.map((f, i) => `<label class="f wide" for="qeF${i}"><span>${esc(f.label)}</span>${input(f, i)}</label>`).join('')}</div>
        <p class="qe-note">${t('This changes About you.')} <button type="button" class="link" data-qe-act="about">${t('Open About you')}</button></p>
        <div class="bs-foot"><button type="button" class="btn" data-qe-act="cancel">${t('Cancel')}</button><button type="submit" class="btn primary" data-qe-act="done">${t('Done')}</button></div>
      </form>`;
    const phone = matchMedia(PHONE).matches;
    dlg.classList.toggle('qe-near', !phone);
    dlg.style.left = ''; dlg.style.top = '';
    paintLive();
    dlg.showModal();
    if (!phone && anchor) {
      const p = placeQuickFill(anchor.getBoundingClientRect(), Math.min(WIDTH, innerWidth - 24), dlg.offsetHeight, innerWidth, innerHeight);
      dlg.style.left = `${p.left}px`; dlg.style.top = `${p.top}px`;
    }
    const first = dlg.querySelector('[data-qe-path]');
    first?.focus();
    if (first && first.value) first.select?.();
  }

  function close(keep) {
    if (!dlg.open) return;
    if (!keep && before) store.set('household', before); // Cancel: the figures as they were
    before = null;
    dlg.close();
  }

  // live: every valid keystroke writes the household (the answer behind the sheet follows)
  dlg.addEventListener('input', (e) => {
    const x = e.target.closest('[data-qe-path]');
    if (!x) return;
    const v = qeValue(x.dataset.qeKind, x.value);
    if (Number.isNaN(v)) { x.setAttribute('aria-invalid', 'true'); return; }
    x.removeAttribute('aria-invalid');
    store.set(`household.${x.dataset.qePath}`, v);
    paintLive(); setTimeout(paintLive, 0); // the card re-renders on the store change
  });
  dlg.addEventListener('submit', (e) => { e.preventDefault(); close(true); });
  dlg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-qe-act]');
    if (!b) { if (e.target === dlg) close(true); return; } // a tap on the backdrop keeps what you typed
    if (b.dataset.qeAct === 'cancel') close(false);
    else if (b.dataset.qeAct === 'about') { const path = dlg.querySelector('[data-qe-path]')?.dataset.qePath; close(true); bus.emit('household:open', path ? { field: path } : {}); }
  });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(false); }); // Esc = Cancel
  dlg.addEventListener('close', () => { if (opener && opener.isConnected) opener.focus({ preventScroll: true }); else focusSame(); opener = null; });
  // the row re-renders with its tab: focus the new row for the same key
  let lastKey = null;
  const focusSame = () => { const r = lastKey && document.querySelector(`.tab.active [data-qe="${lastKey}"]`); if (r) r.focus({ preventScroll: true }); };

  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-qe]');
    if (!b || dlg.contains(b)) return;
    e.preventDefault();
    lastKey = b.dataset.qe;
    open(b.dataset.qe, b);
  });
  return { open };
}

/** Every English string this module shows (zh coverage test). */
export const uiStrings = () => [...Object.values(TITLE), ...Object.values(LABEL), 'Buyer {0}', 'This changes About you.', 'Open About you', 'Cancel', 'Done'];
