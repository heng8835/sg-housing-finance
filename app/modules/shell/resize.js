// Drag-resizable side panel (desktop ≥ 901 px). A role="separator" strip on the panel's right edge sets
// `--panel-w` on #app; everything that follows the panel edge reads `--cover = var(--panel-w)`, so map
// controls, the toggle tab, the compare drawer and the prices box move with no extra code. The panel
// overlays the map, so the map itself never resizes.
// Width lives in the store (`ui.panelWidth`, number | null) → localStorage `sghf:v2` only; it is
// covered by Export and "Forget my data". Saved on pointerup / 300 ms after the last key, never per move.
// Events: emits 'panel:resized' { width } after a drag, key change or reset.

import { t } from '../../core/i18n.js';

// UI layout constants (not policy values)
export const PANEL_MIN = 360;
export const PANEL_DEFAULT = 420;
export const PANEL_MAX = 680;
export const MAP_MIN = 360;      // always leave this much map uncovered
export const DESKTOP_MIN = 901;  // ≤ 900 px: stacked layout / bottom sheet, no resizer
export const KEY_STEP = 16;
export const KEY_STEP_BIG = 64;
const SAVE_DELAY = 300;

/** Largest panel width for a viewport: min(680, viewport − 360), never below the minimum. */
export function maxWidth(viewportW) {
  const vw = Number.isFinite(viewportW) ? viewportW : PANEL_MAX + MAP_MIN;
  return Math.max(PANEL_MIN, Math.min(PANEL_MAX, Math.floor(vw - MAP_MIN)));
}

/** Clamp a width to [360, maxWidth(viewport)]; null / junk → the default (420, itself clamped). */
export function clampWidth(w, viewportW) {
  const n = typeof w === 'number' && Number.isFinite(w) ? Math.round(w) : PANEL_DEFAULT;
  return Math.min(maxWidth(viewportW), Math.max(PANEL_MIN, n));
}

/**
 * Keyboard on the focused separator. Returns { width, reset } or null if the key is not handled.
 * ←/→ ∓/± 16 px (Shift ± 64), Home = min, End = max, Enter = reset to the default (saved value removed).
 */
export function keyWidth(key, shiftKey, current, viewportW) {
  const step = shiftKey ? KEY_STEP_BIG : KEY_STEP;
  switch (key) {
    case 'ArrowLeft': return { width: clampWidth(current - step, viewportW), reset: false };
    case 'ArrowRight': return { width: clampWidth(current + step, viewportW), reset: false };
    case 'Home': return { width: PANEL_MIN, reset: false };
    case 'End': return { width: maxWidth(viewportW), reset: false };
    case 'Enter': return { width: clampWidth(null, viewportW), reset: true };
    default: return null;
  }
}

/** Mount the separator inside #panel. Returns { set(width|null), destroy() } or null without the shell. */
export function mountPanelResize({ store, bus } = {}) {
  const app = document.getElementById('app');
  const panel = document.getElementById('panel');
  if (!app || !panel || document.getElementById('panelResizer')) return null;

  const sep = document.createElement('div');
  sep.id = 'panelResizer';
  sep.setAttribute('role', 'separator');
  sep.setAttribute('aria-orientation', 'vertical');
  sep.setAttribute('aria-controls', 'panel');
  sep.tabIndex = 0;
  sep.setAttribute('aria-label', t('Resize side panel'));
  sep.title = t('Drag to resize · double-click to reset');
  sep.setAttribute('aria-valuemin', String(PANEL_MIN));
  panel.append(sep);

  const desktop = window.matchMedia(`(min-width: ${DESKTOP_MIN}px)`);
  const saved = () => store?.get('ui.panelWidth') ?? null;
  let width = PANEL_DEFAULT;

  // show a width (not saved); off desktop the inline value is removed so CSS defaults rule
  function apply(w) {
    width = w;
    if (desktop.matches) app.style.setProperty('--panel-w', `${w}px`);
    else app.style.removeProperty('--panel-w');
    sep.setAttribute('aria-valuemax', String(maxWidth(window.innerWidth)));
    sep.setAttribute('aria-valuenow', String(w));
  }
  const fromStore = () => apply(clampWidth(saved(), window.innerWidth));
  const announce = () => bus?.emit('panel:resized', { width });
  function save(value) { // value: number or null (= back to default)
    if (store && saved() !== value) store.set('ui.panelWidth', value);
    announce();
  }

  // ---- drag ----
  let drag = null; // { id, startX, startW, next, raf }
  const onEsc = (e) => { if (e.key === 'Escape' && drag) { e.preventDefault(); e.stopPropagation(); end(false); } };
  function end(commit) {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.raf) cancelAnimationFrame(d.raf);
    try { if (sep.hasPointerCapture(d.id)) sep.releasePointerCapture(d.id); } catch { /* already released */ }
    app.classList.remove('resizing');
    document.removeEventListener('keydown', onEsc, true);
    if (!commit) { apply(d.startW); return; }
    apply(d.next);
    if (d.next !== d.startW) save(d.next);
  }
  sep.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !desktop.matches || drag) return;
    e.preventDefault();
    try { sep.setPointerCapture(e.pointerId); } catch { /* synthetic event */ }
    drag = { id: e.pointerId, startX: e.clientX, startW: width, next: width, raf: 0 };
    app.classList.add('resizing');
    document.addEventListener('keydown', onEsc, true);
  });
  sep.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.next = clampWidth(drag.startW + (e.clientX - drag.startX), window.innerWidth);
    if (!drag.raf) drag.raf = requestAnimationFrame(() => { if (drag) { drag.raf = 0; apply(drag.next); } });
  });
  sep.addEventListener('pointerup', (e) => { if (drag && e.pointerId === drag.id) end(true); });
  sep.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.id) end(false); });
  sep.addEventListener('lostpointercapture', () => { if (drag) end(true); });

  // ---- double-click: reset and forget ----
  function reset() { apply(clampWidth(null, window.innerWidth)); save(null); }
  sep.addEventListener('dblclick', (e) => { e.preventDefault(); reset(); });

  // ---- keyboard ----
  let keyTimer = 0;
  sep.addEventListener('keydown', (e) => {
    if (drag || !desktop.matches) return;
    const r = keyWidth(e.key, e.shiftKey, width, window.innerWidth);
    if (!r) return;
    e.preventDefault();
    apply(r.width);
    clearTimeout(keyTimer);
    keyTimer = setTimeout(() => save(r.reset ? null : width), SAVE_DELAY);
  });

  // ---- viewport changes: clamp (clamped value is not saved) ----
  let rz = 0;
  const onResize = () => { if (!rz) rz = requestAnimationFrame(() => { rz = 0; if (!drag) fromStore(); }); };
  window.addEventListener('resize', onResize);
  desktop.addEventListener?.('change', () => { end(false); fromStore(); });

  // import / "Forget my data" / another writer → follow the store
  const unsub = store?.subscribe('ui.panelWidth', () => { if (!drag) fromStore(); });

  fromStore();
  return {
    /** set(px) saves a clamped width; set(null) resets to the default and forgets it. */
    set(value) { if (value == null) { reset(); return; } const w = clampWidth(value, window.innerWidth); apply(w); save(w); },
    destroy() { end(false); window.removeEventListener('resize', onResize); unsub?.(); sep.remove(); app.style.removeProperty('--panel-w'); },
  };
}
