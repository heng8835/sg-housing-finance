// Keep folded sections and focus across innerHTML re-renders (Rent / Afford / Plan / Household rebuild
// their markup on every change, which would close every <details> and drop the keyboard focus).
// Memory only — nothing is stored.

/**
 * Remember which `<details data-fold="key">` are open inside `root` for this session.
 * Call `snapshot()` right before replacing root's markup, and use `attr(key, defaultOpen)` in the
 * template: it yields ' open' or ''.
 * @param {Element} root
 */
export function keepFolds(root) {
  const open = new Map();
  // `toggle` does not bubble → capture phase on the root
  root.addEventListener('toggle', (e) => {
    const d = e.target;
    if (d && d.dataset && d.dataset.fold) open.set(d.dataset.fold, d.open);
  }, true);
  return {
    attr(key, defaultOpen = false) { return (open.has(key) ? open.get(key) : defaultOpen) ? ' open' : ''; },
    isOpen(key, defaultOpen = false) { return open.has(key) ? open.get(key) : defaultOpen; },
    snapshot() { root.querySelectorAll('details[data-fold]').forEach((d) => open.set(d.dataset.fold, d.open)); },
    /** After a re-render: re-open / close folds whose markup could not use attr() (e.g. a shared panel). */
    apply() { root.querySelectorAll('details[data-fold]').forEach((d) => { const k = d.dataset.fold; if (open.has(k) && d.open !== open.get(k)) d.open = open.get(k); }); },
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
