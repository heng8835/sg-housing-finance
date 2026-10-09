// Keep folded sections and focus across innerHTML re-renders (Rent / Afford / Plan / Household rebuild
// their markup on every change, which would close every <details> and drop the keyboard focus).
// P8 M-14 (Q11): once main.js calls rememberFolds(localStorage), a fold the user opens or closes with a tap / key
// stays that way on the next visit (localStorage FOLDS_KEY: { key: true|false } — layout only, not personal data;
// "Forget my data" clears it). Defaults still apply to folds never touched; programmatic opens are not remembered.
import { FOLDS_KEY } from './store.js';

/** At most this many fold keys are kept (oldest dropped) — some keys are per flat (cmp-glance-<id>). */
export const FOLDS_MAX = 80;
const FOLD_KEY_RE = /^[\w.-]{1,60}$/;

/**
 * The stored { key: open } map. get(key) → true | false | undefined (never touched); set(key, open) moves the key
 * to the newest place and drops the oldest past `max`. Unreadable or hand-edited storage reads as empty.
 * @param {{ getItem: Function, setItem: Function }} storage
 */
export function foldMemory(storage, { key = FOLDS_KEY, max = FOLDS_MAX } = {}) {
  let map = null;
  const load = () => {
    if (map) return map;
    map = new Map();
    try {
      const raw = JSON.parse(storage.getItem(key) || 'null');
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [k, v] of Object.entries(raw)) if (FOLD_KEY_RE.test(k) && typeof v === 'boolean') map.set(k, v);
      }
    } catch { /* unreadable: start empty */ }
    while (map.size > max) map.delete(map.keys().next().value);
    return map;
  };
  return {
    get(k) { return load().get(k); },
    set(k, open) {
      if (typeof k !== 'string' || !FOLD_KEY_RE.test(k)) return false;
      const m = load();
      if (m.get(k) === !!open) return false;
      m.delete(k); m.set(k, !!open);
      while (m.size > max) m.delete(m.keys().next().value);
      try { storage.setItem(key, JSON.stringify(Object.fromEntries(m))); } catch { /* quota / private mode */ }
      return true;
    },
  };
}

let memory = null;
/** main.js, once: remember folds across visits in this storage (null: per visit only, as in tests). */
export function rememberFolds(storage) { memory = storage ? foldMemory(storage) : null; return memory; }

/**
 * Remember which `<details data-fold="key">` are open inside `root` for this session.
 * Call `snapshot()` right before replacing root's markup, and use `attr(key, defaultOpen)` in the
 * template: it yields ' open' or ''.
 * @param {Element} root
 */
export function keepFolds(root) {
  const open = new Map();
  let tapped = null; // the fold whose summary the user just clicked / pressed (Enter and Space click too)
  root.addEventListener('click', (e) => {
    const sum = e.target && e.target.closest ? e.target.closest('summary') : null;
    const d = sum && sum.parentElement;
    if (d && d.dataset && d.dataset.fold && root.contains(d)) tapped = d.dataset.fold;
  }, true);
  // `toggle` does not bubble → capture phase on the root
  root.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!d || !d.dataset || !d.dataset.fold) return;
    open.set(d.dataset.fold, d.open);
    if (tapped === d.dataset.fold) { tapped = null; if (memory) memory.set(d.dataset.fold, d.open); } // M-14: only the user's own taps
  }, true);
  const known = (key) => (open.has(key) ? open.get(key) : memory ? memory.get(key) : undefined);
  const state = (key, defaultOpen) => { const v = known(key); return v === undefined ? defaultOpen : v; };
  return {
    attr(key, defaultOpen = false) { return state(key, defaultOpen) ? ' open' : ''; },
    isOpen(key, defaultOpen = false) { return state(key, defaultOpen); },
    snapshot() { root.querySelectorAll('details[data-fold]').forEach((d) => open.set(d.dataset.fold, d.open)); },
    /** After a re-render: re-open / close folds whose markup could not use attr() (e.g. a shared panel). */
    apply() { root.querySelectorAll('details[data-fold]').forEach((d) => { const v = known(d.dataset.fold); if (v !== undefined && d.open !== v) d.open = v; }); },
  };
}

const KEYS = ['data-p', 'data-lo', 'data-path', 'data-rt'];
const cssStr = (v) => `"${String(v).replace(/["\\]/g, '\\$&')}"`;

/** A selector that finds "the same" control after a re-render, or null. Exported for tests. */
export function focusSelector(a) {
  if (!a || !a.getAttribute) return null;
  if (a.id) return `#${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(a.id) : a.id}`;
  for (const k of KEYS) if (a.hasAttribute(k)) return `[${k}=${cssStr(a.getAttribute(k))}]`;
  if (a.hasAttribute('data-act')) {
    const i = a.getAttribute('data-i'), v = a.getAttribute('data-v');
    return `[data-act=${cssStr(a.getAttribute('data-act'))}]${i != null ? `[data-i=${cssStr(i)}]` : ''}${v != null ? `[data-v=${cssStr(v)}]` : ''}`;
  }
  if (a.tagName === 'SUMMARY' && a.parentElement && a.parentElement.dataset.fold) return `details[data-fold=${cssStr(a.parentElement.dataset.fold)}] > summary`;
  return null;
}

/**
 * Before a re-render: remember the focused control inside `root` and the scroll position of the
 * scroll container. Returns `restore()` to call after the new markup is in place.
 * @param {Element} root
 * @param {Element|(() => Element|null)} [scroller] default: the enclosing `.tab`
 */
export function saveView(root, scroller) {
  const scrollEl = () => (typeof scroller === 'function' ? scroller() : scroller || root.closest('.tab') || root.parentElement);
  const a = document.activeElement;
  const sel = a && a !== root && root.contains(a) ? focusSelector(a) : null;
  const caret = sel && a.type === 'text' && typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null;
  const s0 = scrollEl();
  const top = s0 ? s0.scrollTop : null;
  return function restore() {
    const s = scrollEl();
    if (s && top != null && s.scrollTop !== top) s.scrollTop = top;
    if (!sel) return;
    const el = root.querySelector(sel);
    if (!el || el === document.activeElement) return;
    try { el.focus({ preventScroll: true }); if (caret) el.setSelectionRange(caret[0], caret[1]); } catch { /* not focusable */ }
  };
}
