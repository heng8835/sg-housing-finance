// Undo line (Phase 8 M-17, Q7): after a removal the app acts at once and shows one calm line — "Removed Fernvale
// 4-room. [Undo] [✕]" — instead of a browser confirm() box. Confirm stays only for "Forget my data" and "Start over".
// One line at a time (a new removal replaces it; the earlier removal simply stays done). No timer (P8-07, spec M-17):
// it ends at the next action (a new line), ✕ / Escape, or a page change (another tab becomes active). A caller may still
// pass ms > 0 to the controller; then it holds while the pointer or focus is on it (WCAG 2.2.1). Phones: just above the tab bar;
// desktop: bottom left — the same spot as the "A new version is ready" toast (toastHost(), shared with
// modules/offline). Screen readers hear the message (a polite live region); the Undo button takes the focus when the
// removed control had it, so keyboard users land on it; Escape closes the line. Memory only — nothing is stored.
import { t } from './i18n.js';

/** How long the line stays when nobody touches it (ms); 0 = until the next action or page change (P8-07). */
export const UNDO_MS = 0;

/**
 * Pure controller (no DOM — tested in node): one pending undo at a time.
 * show(message, opts) / hide(reason) are called on open / close; reason is 'undo' | 'dismiss' | 'timeout' | 'replaced'.
 * @param {{ show: Function, hide: Function, ms?: number, setTimer?: Function, clearTimer?: Function }} o
 */
export function undoController({ show, hide, ms = UNDO_MS, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let cur = null, seq = 0;
  const stop = () => { if (cur && cur.timer != null) { clearTimer(cur.timer); cur.timer = null; } };
  const arm = () => {
    stop();
    if (!(ms > 0)) return;
    const id = cur.id;
    cur.timer = setTimer(() => { if (cur && cur.id === id && !cur.paused) close('timeout'); }, ms);
  };
  function close(reason) {
    if (!cur) return null;
    stop();
    const was = cur;
    cur = null;
    hide(reason, was.opts);
    return was;
  }
  return {
    /** Show the line for an action that is already done; undo() puts it back. Returns the offer id. */
    offer(message, undo, opts = {}) {
      if (typeof undo !== 'function') throw new TypeError('undo must be a function');
      close('replaced');
      cur = { id: ++seq, message: String(message), undo, opts, paused: false, timer: null };
      show(cur.message, opts);
      arm();
      return cur.id;
    },
    /** Run the pending undo (once). false when there is none. */
    undo() {
      if (!cur) return false;
      stop();
      const was = cur;
      cur = null;
      try { was.undo(); } finally { hide('undo', was.opts); } // put back first: hide() may focus the restored item
      return true;
    },
    dismiss() { return !!close('dismiss'); },
    /** Hover / focus on the line: hold the timer. */
    pause() { if (cur) { cur.paused = true; stop(); } },
    /** Pointer / focus left: a fresh full period starts. */
    resume() { if (cur && cur.paused) { cur.paused = false; arm(); } },
    get open() { return !!cur; },
    get message() { return cur ? cur.message : null; },
    get id() { return cur ? cur.id : 0; },
  };
}

// ---------------------------------------------------------------- browser binding

/** The one fixed spot for small notices (update toast, Undo line): inside #app so it can follow --cover. */
export function toastHost(doc = globalThis.document) {
  let h = doc.getElementById('toastHost');
  if (!h) {
    h = doc.createElement('div');
    h.id = 'toastHost'; h.className = 'toast-host';
    (doc.getElementById('app') || doc.body).append(h);
  }
  return h;
}

let line = null, ctl = null, autoFocus = false; // autoFocus: our own focus() call — not a reason to hold the timer

// the control that was used is gone (re-rendered away) or hidden → the focus is lost
const focusLost = (doc) => { const a = doc.activeElement; return !a || a === doc.body || a === doc.documentElement || !a.isConnected || !a.getClientRects().length; };

function build(doc) {
  const el = doc.createElement('div');
  el.className = 'sw-toast undo-line'; el.hidden = true;
  el.innerHTML = `<span class="undo-msg" role="status" aria-live="polite" aria-atomic="true"></span>
    <button type="button" class="btn sm" data-undo="undo"></button>
    <button type="button" class="sw-toast-x" data-undo="dismiss">✕</button>`;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-undo]');
    if (b?.dataset.undo === 'undo') ctl.undo();
    else if (b?.dataset.undo === 'dismiss') ctl.dismiss();
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); ctl.dismiss(); } });
  el.addEventListener('pointerenter', () => ctl.pause());
  el.addEventListener('pointerleave', () => { if (!el.contains(doc.activeElement)) ctl.resume(); });
  el.addEventListener('focusin', () => { if (!autoFocus) ctl.pause(); });
  el.addEventListener('focusout', (e) => { if (!el.contains(e.relatedTarget)) ctl.resume(); });
  toastHost(doc).append(el);
  return el;
}

// a page change ends the line (P8-07): watch which .tab is active — the same class observer journey uses
let tabWatch = null;
function watchTabs(doc) {
  if (tabWatch || typeof MutationObserver === 'undefined') return;
  const activeTab = () => doc.querySelector('.tab.active');
  let was = activeTab();
  tabWatch = new MutationObserver(() => { const now = activeTab(); if (now !== was) { was = now; if (ctl) ctl.dismiss(); } });
  doc.querySelectorAll('.tab').forEach((el) => tabWatch.observe(el, { attributes: true, attributeFilter: ['class'] }));
}

function ensure(doc) {
  watchTabs(doc);
  if (line && line.isConnected) return;
  line = build(doc);
  ctl ||= undoController({
    show(message, opts) {
      const msg = line.querySelector('.undo-msg'), btn = line.querySelector('[data-undo="undo"]'), x = line.querySelector('[data-undo="dismiss"]');
      btn.textContent = t('Undo');
      x.setAttribute('aria-label', t('Dismiss')); x.title = t('Dismiss');
      const lost = focusLost(doc);
      line.hidden = false;
      msg.textContent = '';
      const id = ctl.id;
      setTimeout(() => { if (ctl.id === id) msg.textContent = message; }, 40); // a live region announces changes, not first paint
      if (lost || opts.focus) { autoFocus = true; try { btn.focus({ preventScroll: true }); } catch { /* not focusable */ } autoFocus = false; }
    },
    hide(reason, opts) {
      const had = line.contains(doc.activeElement);
      line.hidden = true;
      line.querySelector('.undo-msg').textContent = '';
      if (!had) return;
      const next = typeof opts.focusAfter === 'function' ? opts.focusAfter(reason) : opts.focusAfter;
      if (next && next.isConnected) { try { next.focus({ preventScroll: true }); } catch { /* ignore */ } }
    },
  });
}

/**
 * Show the Undo line for a removal that has already happened.
 * @param {string} message translated text, e.g. t('Removed {0}.', [name])
 * @param {() => void} undo puts the removed thing back (and re-renders)
 * @param {{ focus?: boolean, focusAfter?: Element|((reason: string) => Element|null) }} [opts]
 *   focus: move the focus to Undo even when it was not lost; focusAfter: where the focus goes when the line closes
 *   while it holds the focus (after Undo: e.g. the restored item's button).
 */
export function offerUndo(message, undo, opts = {}) {
  const doc = globalThis.document;
  if (!doc) return { dismiss() {} };
  ensure(doc);
  const id = ctl.offer(message, undo, opts);
  return { dismiss() { if (ctl.id === id) ctl.dismiss(); } };
}

/** Close the line if one is open (e.g. the list it refers to was replaced). */
export function dismissUndo() { if (ctl) ctl.dismiss(); }
