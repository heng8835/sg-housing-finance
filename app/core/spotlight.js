// DOM helpers for spotlighting a real control (guided tour in modules/guide, "Show me" in modules/guides):
// safe querySelector, "is it really on screen", the visible part of an element, scroll a panel target into view,
// and `locate(step)` — open the step's tab, try the target then the fallbacks, size the phone sheet, reveal.
import { intersect, PHONE_MAX } from './place.js';
import { targetOff } from './features.js';

export const SETTLE_MS = 240; // panel slide-in / phone sheet height transitions are .2s

export const isPhone = () => innerWidth <= PHONE_MAX;
/** Wide layout with the floating, resizable side panel (`when: 'desktop'` steps). */
export const isDesktop = () => matchMedia('(min-width: 901px)').matches;
export const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tour / guide target lookup. A target of a switched-off feature (core/features.js FEATURE_TARGETS) counts as missing,
 *  so the step falls back to its `fallback` + missing note. */
export function query(sel) {
  if (targetOff(sel)) return null;
  try { return document.querySelector(sel); } catch { return null; } // e.g. :has() unsupported
}

/** The part of `el` not clipped by scrolling / overflow ancestors or the viewport. */
export function visibleRect(el) {
  const b = el.getBoundingClientRect();
  let r = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
  for (let p = el.parentElement; p && p !== document.documentElement && r; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') r = intersect(r, p.getBoundingClientRect());
  }
  return r && intersect(r, { left: 0, top: 0, right: innerWidth, bottom: innerHeight });
}

/** Rendered, not visibility:hidden, non-empty (pro-only in Simple, a hidden panel, a popup that is not open → false). */
export function shown(el) {
  if (!el || !el.isConnected || !el.getClientRects().length) return false;
  if (getComputedStyle(el).visibility === 'hidden') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && !!visibleRect(el);
}

/** Scroll a panel target into view only when it is not already fully visible. */
export function revealInPanel(el) {
  const box = el.closest('.tab') || el.closest('#panel');
  if (!box) return;
  const br = box.getBoundingClientRect(), r = el.getBoundingClientRect();
  if (r.top >= br.top && r.bottom <= br.bottom) return;
  el.scrollIntoView({ block: r.height > br.height * 0.7 ? 'start' : 'center', inline: 'nearest' });
}

/**
 * Bring a step's control on screen, the same way the tour does: `nav:goto` its tab, try `target` then each
 * `fallback`, put the phone sheet at half height for panel targets, scroll it into view.
 * @param {{ target?:string, tab?:string, fallback?:string[] }} step
 * @param {{ bus?:object, stale?:() => boolean }} [opts]  stale() → true aborts (a newer request started)
 * @returns {Promise<{ el: Element|null, missing: boolean } | null>}  null when aborted
 */
export async function locate(step, { bus, stale = () => false } = {}) {
  const app = document.getElementById('app'), panel = document.getElementById('panel');
  const wasHidden = app?.classList.contains('panel-hidden');
  if (step.tab) bus?.emit('nav:goto', { tab: step.tab }); // also un-hides the side panel
  await frame(); await frame();
  if (stale()) return null;
  let el = step.target ? query(step.target) : null;
  const missing = !shown(el);
  if (missing) el = (step.fallback || []).map(query).find(shown) || null;
  let settle = step.tab && wasHidden && !app?.classList.contains('panel-hidden') ? SETTLE_MS : 0;
  const inPanel = !!(el && el.closest('#panel')) || !!step.tab;
  if (inPanel && isPhone() && panel?.dataset.size !== 'half') { bus?.emit('sheet:size', 'half'); settle = SETTLE_MS; }
  if (settle) { await wait(settle); if (stale()) return null; }
  if (el && !shown(el)) el = null; // e.g. clipped after the sheet resized
  if (el && el.closest('#panel')) revealInPanel(el);
  await frame();
  return stale() ? null : { el, missing };
}
