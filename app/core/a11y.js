// Accessibility helpers (autorun Stage 5a, hdb-data-pipeline/docs/specs/a11y-audit.md).
//   bindSkipLink(): the "Skip to content" link (index.html, first in the page) moves the keyboard focus to the open page
//     (the active tab panel) instead of only scrolling there.
//   bindCombobox(): the three type-ahead lists (map search, "Block & street", "Place") get the ARIA combobox pattern —
//     role combobox / listbox / option, aria-expanded and aria-activedescendant — from the DOM the existing code paints
//     (div[data-i] rows, .hi = highlighted, .open = shown). The code that paints and handles the keys is unchanged.
// Pure helpers (optionId, comboState) are exported for node tests.
import { t } from './i18n.js';

/** English keys used here (tests/a11y checks the 中文 entries exist). */
export const uiStrings = ['Skip to content', 'Suggestions'];

export const optionId = (listId, i) => `${listId}-o${i}`;

/**
 * What the input should say for a painted list: { expanded, active } — active is the id of the highlighted row or null.
 * rows: [{ i, hi }] in paint order; open: the list is shown.
 */
export function comboState(listId, rows, open) {
  const expanded = !!open && rows.length > 0;
  const hi = expanded ? rows.find((r) => r.hi) : null;
  return { expanded, active: hi ? optionId(listId, hi.i) : null };
}

export function bindCombobox(input, list) {
  if (!input || !list || !list.id || input.dataset.combo) return;
  input.dataset.combo = '1';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'false');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', t('Suggestions'));
  const sync = () => {
    const rows = [];
    for (const el of list.children) {
      if (el.matches('[data-i]')) {
        el.setAttribute('role', 'option'); el.id = optionId(list.id, el.dataset.i);
        const hi = el.classList.contains('hi'); el.setAttribute('aria-selected', String(hi));
        rows.push({ i: el.dataset.i, hi });
      } else el.setAttribute('aria-hidden', 'true'); // group headings ("Your flats" …): visual only inside the listbox
    }
    const s = comboState(list.id, rows, list.classList.contains('open') || rows.length > 0);
    input.setAttribute('aria-expanded', String(s.expanded));
    if (s.active) input.setAttribute('aria-activedescendant', s.active); else input.removeAttribute('aria-activedescendant');
  };
  // only class changes are watched (.hi / .open), so the attributes set here never re-trigger the observer
  new MutationObserver(sync).observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  sync();
}

/**
 * Next radio to focus for an arrow key in a radiogroup (wraps; skips disabled / hidden ones), or null.
 * radios: [{ disabled, hidden }] in DOM order; at: index of the focused one.
 */
export function arrowTarget(radios, at, key) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[key];
  if (!step || at < 0) return null;
  for (let k = 1; k < radios.length; k++) {
    const j = (at + step * k + radios.length * k) % radios.length;
    if (!radios[j].disabled && !radios[j].hidden) return j;
  }
  return null;
}

/**
 * Arrow keys move the focus between the buttons of a role="radiogroup" that has no key handler of its own (the
 * household form, Simple | Pro, EN | 中文, "Which flat?", Start here). The focus moves only — Space / Enter picks, as
 * before — so arrowing across EN | 中文 does not reload the page. Groups with their own roving handler
 * (calculation window, chart ranges …) call preventDefault and are left alone.
 */
export function bindRadioArrows(doc = document) {
  doc.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const me = e.target.closest?.('[role="radio"]'), group = me?.closest('[role="radiogroup"]');
    if (!group) return;
    const radios = [...group.querySelectorAll('[role="radio"]')].filter((r) => r.closest('[role="radiogroup"]') === group);
    const j = arrowTarget(radios.map((r) => ({ disabled: r.disabled, hidden: !r.getClientRects().length })), radios.indexOf(me), e.key);
    if (j == null) return;
    e.preventDefault();
    radios[j].focus();
  });
}

export function bindSkipLink(doc = document) {
  const link = doc.querySelector('.skip-link');
  if (!link) return;
  link.addEventListener('click', (e) => {
    const target = doc.querySelector('.tab.active') || doc.getElementById('panel');
    if (!target) return;
    e.preventDefault();
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: false });
  });
}
