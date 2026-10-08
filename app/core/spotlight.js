// DOM helpers for spotlighting a real control (guided tour in modules/guide, "Show me" in modules/guides):
// safe querySelector, "is it really on screen", the visible part of an element, scroll a panel target into view,
// and `locate(step)` — open the step's tab, try the target then the fallbacks, open its fold / view and size the map
// sheet on phones (phoneUnfold, phoneSheetFor), reveal.
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

const MAP_TAB = 'explore'; // the phone Map tab (modules/shell/phone.js MAP_TAB)
/**
 * Phones (phone overhaul §3.11): where the map sheet should be for a step. A page step (Afford, Rent, Plan, Choices —
 * its page is up after nav:goto) → null (leave the sheet alone); a target inside the map sheet (Map settings, Area
 * prices) → 'half'; a target on the map itself (search, map, zoom) → 'peek' on the Map tab; the top bar or the tab bar
 * → null.
 * @param {{ inSheet?: boolean, onMap?: boolean, tab?: string|null, found?: boolean }} x
 * @returns {'half'|'peek'|null}
 */
export function phoneSheetFor({ inSheet = false, onMap = false, tab = null, found = true } = {}) {
  if (tab && tab !== MAP_TAB) return null;
  if (inSheet) return 'half';
  if (onMap) return 'peek';
  if (!found && tab === MAP_TAB) return 'half'; // Map settings step whose control is missing: show the settings
  return null;
}

/** In the layout (not display:none / visibility:hidden), though perhaps scrolled out of its scroller. */
const rendered = (el) => !!el && el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

/**
 * Phones: open the place a step target lives in — a Plan card fold ('plan:show' opens and scrolls it), the Choices
 * List view (when Compare is showing) and its "Add a flat" / "Daily places" folds, Map settings under a sheet view
 * (pop the views on top), the parked "Prices in view" box (open the Area prices view). Any other closed fold around
 * the target in a page or the sheet is opened too. → true when something changed (wait, then look the target up again).
 */
export function phoneUnfold(el, bus) {
  if (!el || !el.isConnected) return false;
  const card = el.closest('#planRoot > details.fold[id]');
  if (card && !card.open) { bus?.emit('plan:show', { section: card.id }); return true; } // Plan re-renders: query again
  let did = false;
  const choices = el.closest('#tab-choices');
  if (choices && choices.dataset.cview === 'compare' && !el.closest('#cmpBody') && !shown(el)) {
    const b = document.querySelector('#choicesView button[data-v="list"]');
    if (b) { b.click(); did = true; }
  }
  const settings = document.getElementById('tab-explore');
  if (settings && settings.contains(el)) {
    for (let i = 0; i < 6 && settings.hasAttribute('data-under'); i++) { bus?.emit('sheet:pop', {}); did = true; }
  }
  if ((el.id === 'areaBox' || el.closest('#areaBox')) && !shown(el)) {
    const b = document.querySelector('.ms-area-btn');
    if (b) { b.click(); did = true; }
  }
  for (let d = el.parentElement?.closest('details:not([open])'); d; d = d.parentElement?.closest('details:not([open])')) {
    if (d.closest('#panel, #mapSheet')) { d.open = true; did = true; }
  }
  return did;
}

/**
 * Bring a step's control on screen — the guided tour (modules/guide) and "Show me" (modules/guides) both use it:
 * `nav:goto` its tab, try `target` then each `fallback`. Phones: open the fold / view the target is in first, then
 * size the map sheet only for Map steps (never for page steps), scroll a target in a page or the sheet into view.
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
  const phone = isPhone();
  let target = step.target ? query(step.target) : null;
  let settle = step.tab && wasHidden && !app?.classList.contains('panel-hidden') ? SETTLE_MS : 0;
  if (phone && target && phoneUnfold(target, bus)) {
    await wait(SETTLE_MS); if (stale()) return null;
    settle = 0; target = query(step.target);
  }
  let el = target, missing = !shown(el);
  if (missing) el = (step.fallback || []).map(query).find(shown) || null;
  if (phone) { // pages are full screen; only Map steps move the sheet. A hidden map target still tells where it lives
    const at = missing ? target : el;
    const size = phoneSheetFor({ inSheet: !!at?.closest('#mapSheet'), onMap: !!at?.closest('#mapwrap'), tab: step.tab || null, found: !!at });
    const onMapView = app?.dataset.phoneView === 'map';
    if (size && (panel?.dataset.size !== size || !onMapView)) {
      if (size === 'peek' || !onMapView) bus?.emit('phone:show-map', { size }); else bus?.emit('sheet:size', size);
      settle = SETTLE_MS;
    }
  }
  if (settle) { await wait(settle); if (stale()) return null; }
  if (phone && missing && rendered(target) && (target.closest('#mapSheet') || target.closest('#panel'))) {
    target.scrollIntoView({ block: 'center', inline: 'nearest' }); // scrolled out of the sheet / page
  }
  if (phone && missing && shown(target)) { el = target; missing = false; } // on screen now (Map tab up, scrolled)
  if (phone && missing && !el) { // a fallback scrolled out of the page / sheet (e.g. List | Compare at the top)
    const f = (step.fallback || []).map(query).find((x) => rendered(x) && (x.closest('#mapSheet') || x.closest('#panel')));
    if (f) { f.scrollIntoView({ block: 'center', inline: 'nearest' }); if (shown(f)) el = f; }
  }
  if (phone && el && el.closest('#mapSheet')) el.scrollIntoView({ block: 'center', inline: 'nearest' }); // inside the sheet's scroller
  if (el && !shown(el)) el = null; // e.g. clipped after the sheet resized
  if (el && (el.closest('#panel') || el.closest('#mapSheet'))) revealInPanel(el);
  await frame();
  return stale() ? null : { el, missing };
}
