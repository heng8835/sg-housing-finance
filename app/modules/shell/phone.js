// Phone shell (≤ 767 px, phone overhaul §2; replaces the old one-sheet mobile.js). Two screens: the Map tab is the
// full map + the map sheet (#mapSheet, three heights); Afford / Rent / Plan / Choices are full-screen pages (#panel).
// The .tabs strip (same #tabbtn-* buttons) lives in the bottom tab bar (#tabbar) and Explore's settings are the
// sheet's base view on phones; both move back into #panel at ≥ 768 px, where nothing else changes.
//
// Bus API (other modules talk to the sheet only through these; call the sheet ones on phones only):
//   'phone:show-map' {size?}   → Map tab, sheet at peek (or size). Buttons that act on the map emit it. Desktop: no-op.
//   'sheet:size' 'peek'|'half'|'full'|{size}  → sheet height (compatible with the old phone sheet; tours use it).
//   'sheet:push' {id, el, title, size?}  → show el as the sheet's top view (same id replaces); opens at half unless
//                                          size is given. Opened from the map → it replaces every other view and shows
//                                          "Close"; opened by a tap inside the top view (drill-down) → it stacks with
//                                          "‹ Back to {title of the view below}" (R-14). A new view starts at its top.
//   'sheet:pop' {id?}           → remove that view (or the top one). The base view ('settings') stays; back to it =
//                                 sheet at peek, Map settings scrolled to its top.
//   emits 'sheet:changed' {size, view: 'map'|'page', top, push?} and 'sheet:popped' {id}.
// Page slots (index.html, phone only): .page-head (title + Tour button) and .page-ctx (reserved, empty) at the top of
// each page tab; #choicesView (List | Compare, shown once it has data-ready).
// Also: <html> --kb (keyboard height from visualViewport) + .kb-open; window.__phoneKb(px|null) fakes a keyboard.
import { t } from '../../core/i18n.js';

export const PHONE_QUERY = '(max-width: 767px)';
export const MAP_TAB = 'explore';
export const BASE_VIEW = 'settings';
export const SIZES = ['peek', 'half', 'full'];
export const PEEK_REM = 3;     // peek = 48 px handle + 3 rem summary row — the same as --sheet-peek (styles/base.css, slice A)
export const HALF_SHARE = 0.55; // half = 55 % of the MAP AREA (#mapwrap), not of the viewport (R-03) — the same as --sheet-half
export const DRILL_MS = 1000;  // a push this soon after a tap inside the top view is a drill-down (card → school): stacked
export const FLING = 0.5;      // px per ms: a quick flick moves one height in its direction
export const TAP_SLOP = 8;     // px: less movement than this is a tap, not a drag
export const KB_MIN = 120;     // px: a smaller visualViewport loss is a toolbar, not a keyboard
const HANDLE_LABEL = { peek: 'Make the sheet taller', half: 'Make the sheet full height', full: 'Make the sheet smaller' };

// ------------------------------------------------------------------ pure state machine (tests/shell/phone-sheet)
/** A tap on the handle cycles up only: peek → half → full, and from full one tap goes back to half. */
export const tapNext = (size) => (size === 'half' ? 'full' : 'half');
/** 'peek' or { size: 'peek' } → 'peek'; anything else → null. */
export const sizeOf = (d) => { const s = typeof d === 'string' ? d : d?.size; return SIZES.includes(s) ? s : null; };
/** Keyboard on the handle: dir +1 taller, -1 smaller, clamped. */
export const stepSize = (size, dir) => SIZES[Math.max(0, Math.min(SIZES.length - 1, SIZES.indexOf(sizeOf(size) || 'peek') + Math.sign(dir)))];

/** Where a drag ends. h = sheet height when let go, heights = { peek, half, full } px, v = px/ms (< 0 = moving up). */
export function snapSize(h, heights, v = 0) {
  const order = SIZES.filter((s) => Number.isFinite(heights?.[s])).sort((a, b) => heights[a] - heights[b]);
  if (!order.length) return 'peek';
  if (Math.abs(v) >= FLING) {
    if (v < 0) return order.find((s) => heights[s] > h + 1) ?? order[order.length - 1];
    return [...order].reverse().find((s) => heights[s] < h - 1) ?? order[0];
  }
  return order.reduce((best, s) => (Math.abs(heights[s] - h) < Math.abs(heights[best] - h) ? s : best), order[0]);
}

/** Sheet heights in px: full = the map area (#mapwrap), rem = root font size. Peek is the handle + one row; half is a
 *  share of the map area, so small phones and Larger text still show map above it (R-03). */
export function sheetHeights({ full, rem = 16 }) {
  return { peek: Math.min(48 + rem * PEEK_REM, full), half: Math.min(Math.round(full * HALF_SHARE), full), full };
}

/**
 * The view stack after a push (R-14). ids: the stack now (ids[0] = the base view). A view opened from the map (not a
 * drill-down) takes the one map slot: every other view goes. A drill-down (a tap inside the top view, e.g. card →
 * school) stacks on top. The same id always replaces its old entry. → { stack, drop } (drop = ids removed, top first).
 */
export function stackPush(ids, id, drill = false) {
  const keep = drill ? ids.filter((x, i) => i === 0 || x !== id) : ids.slice(0, 1);
  const drop = ids.slice(1).filter((x) => x === id || !keep.includes(x)).reverse();
  return { stack: [...keep, id], drop };
}
/** The row above a stacked view: none (base on top), 'close' (straight over the base: back to the map) or 'back'. */
export const backKind = (ids) => (ids.length < 2 ? null : ids.length === 2 ? 'close' : 'back');

export const initialState = () => ({ tab: MAP_TAB, view: 'map', size: 'peek' });

/** state { tab, view: 'map' | 'page', size } × event → state. */
export function reduce(state, ev = {}) {
  switch (ev.type) {
    case 'tab': { const tab = ev.tab || MAP_TAB; return { ...state, tab, view: tab === MAP_TAB ? 'map' : 'page' }; }
    case 'tap': return { ...state, size: tapNext(state.size) };
    case 'step': return { ...state, size: stepSize(state.size, ev.dir) };
    case 'size': { const s = sizeOf(ev.size); return s ? { ...state, size: s } : state; }
    case 'drag': return { ...state, size: snapSize(ev.h, ev.heights, ev.v) };
    case 'show-map': return { ...state, tab: MAP_TAB, view: 'map', size: sizeOf(ev.size) || 'peek' };
    default: return state;
  }
}

/** Keyboard height: the part of the layout viewport the visual viewport lost at the bottom (iOS; Chrome with
 *  interactive-widget=resizes-content shrinks the layout instead, so this stays 0 there). */
export const keyboardHeight = ({ innerHeight, vvHeight, vvTop = 0 }) => Math.max(0, Math.round(innerHeight - vvHeight - vvTop));

// ------------------------------------------------------------------ DOM
export function mountPhone({ bus } = {}) {
  const $ = (id) => document.getElementById(id);
  const app = $('app'), panel = $('panel'), wrap = $('mapwrap'), sheet = $('mapSheet'), bar = $('tabbar');
  const tabs = panel?.querySelector('.tabs'), explore = $('tab-explore');
  if (!app || !panel || !wrap || !sheet || !bar || !tabs || !explore) return null;
  const handle = sheet.querySelector('.ms-handle'), back = sheet.querySelector('.ms-back');
  const host = sheet.querySelector('[data-slot="views"]');
  const mq = matchMedia(PHONE_QUERY), root = document.documentElement;
  const views = [{ id: BASE_VIEW, el: explore, title: '' }];
  let state = initialState();

  const activeTab = () => (document.querySelector('.tab.active')?.id || '').replace(/^tab-/, '') || MAP_TAB;
  const titleOf = (v) => (v.id === BASE_VIEW ? t('Map settings') : v.title || '');
  let pushing = false; // 'sheet:changed' says push: true when a view was just pushed (the map-tap collapse waits, R-04)
  const changed = () => bus?.emit('sheet:changed', { size: state.size, view: state.view, top: views[views.length - 1].id, ...(pushing ? { push: true } : {}) });

  function paint() {
    app.dataset.phoneView = state.view;
    sheet.dataset.size = state.size; panel.dataset.size = state.size; wrap.dataset.sheet = state.size; // panel: tour compat
    handle.setAttribute('aria-label', t(HANDLE_LABEL[state.size]));
    handle.setAttribute('aria-expanded', String(state.size !== 'peek'));
  }
  function dispatch(ev) {
    const prev = state;
    state = reduce(state, ev);
    if (state.size === prev.size && state.view === prev.view && state.tab === prev.tab) return;
    paint();
    if (state.size !== prev.size || state.view !== prev.view) changed();
  }

  // ---- layout: tab strip + Explore's settings move between #panel (≥ 768 px) and the tab bar / sheet (phone)
  function place(phone) {
    if (phone) {
      if (tabs.parentElement !== bar) bar.append(tabs);
      if (explore.parentElement !== host) host.prepend(explore);
    } else {
      if (tabs.parentElement !== panel) panel.prepend(tabs);
      if (explore.parentElement !== panel) tabs.after(explore);
      root.style.removeProperty('--kb'); root.classList.remove('kb-open');
    }
    dispatch({ type: 'tab', tab: activeTab() });
  }
  const watch = new MutationObserver(() => dispatch({ type: 'tab', tab: activeTab() }));
  document.querySelectorAll('.tab').forEach((el) => watch.observe(el, { attributes: true, attributeFilter: ['class'] }));

  // ---- sheet: tap / keys / drag on the 48 px handle row
  let drag = null, endedAt = -1;
  const heights = () => sheetHeights({ full: wrap.clientHeight, rem: parseFloat(getComputedStyle(root).fontSize) || 16 });
  // --map-h: the map area's height, for the search list (it ends above the peek, R-07)
  const mapH = () => wrap.style.setProperty('--map-h', `${wrap.clientHeight}px`);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(mapH).observe(wrap);
  handle.addEventListener('click', () => { if (performance.now() - endedAt > 350) dispatch({ type: 'tap' }); });
  handle.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault(); dispatch({ type: 'step', dir: e.key === 'ArrowUp' ? 1 : -1 });
  });
  handle.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    drag = { y0: e.clientY, h0: sheet.offsetHeight, y: e.clientY, at: e.timeStamp, v: 0, moved: false };
    handle.setPointerCapture?.(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.y0;
    if (!drag.moved && Math.abs(dy) < TAP_SLOP) return;
    if (!drag.moved) { drag.moved = true; sheet.classList.add('dragging'); }
    const dt = e.timeStamp - drag.at;
    if (dt > 0) drag.v = (e.clientY - drag.y) / dt;
    drag.y = e.clientY; drag.at = e.timeStamp;
    sheet.style.height = `${Math.round(Math.max(handle.offsetHeight, Math.min(wrap.clientHeight, drag.h0 - dy)))}px`;
  });
  const endDrag = () => {
    const d = drag; drag = null;
    if (!d?.moved) return; // a tap: the click handler cycles
    endedAt = performance.now();
    const h = sheet.offsetHeight;
    sheet.classList.remove('dragging'); sheet.style.height = '';
    const before = state.size;
    dispatch({ type: 'drag', h, heights: heights(), v: d.v });
    if (state.size === before) paint(); // snapped back to the same height
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);

  // ---- views (R-14): a view opened from the map takes the one map slot and shows "Close" (back to the map at peek);
  // a drill-down inside a view (card → school, Blocks here → card) stacks with "‹ Back to …"
  function renderViews() {
    views.forEach((v, i) => v.el.toggleAttribute('data-under', i < views.length - 1));
    const kind = backKind(views.map((v) => v.id)), below = views[views.length - 2];
    back.hidden = !kind;
    back.classList.toggle('ms-close', kind === 'close');
    back.textContent = kind === 'close' ? t('Close') : kind ? t('‹ Back to {0}', [titleOf(below)]) : '';
  }
  let tapIn = null; // the last tap inside the top view: a push right after it is a drill-down
  host.addEventListener('click', (e) => {
    const topEl = views[views.length - 1].el;
    tapIn = topEl.contains(e.target) ? { el: topEl, at: performance.now() } : null;
  }, true);
  /** Remove view i without moving the sheet; tells its owner ('sheet:popped'). keepEl: the same element is re-pushed. */
  function drop(i, keepEl) {
    const [v] = views.splice(i, 1);
    if (v.el === keepEl) return; // the same view pushed again: it only moves to the top
    v.el.remove(); v.el.classList.remove('ms-view');
    bus?.emit('sheet:popped', { id: v.id });
  }
  function push({ id, el, title = '', size } = {}) {
    if (!id || !el || id === BASE_VIEW) return;
    const drill = !!tapIn && performance.now() - tapIn.at < DRILL_MS && tapIn.el !== el && views.some((v) => v.el === tapIn.el);
    tapIn = null;
    const old = views.find((v) => v.id === id), fresh = !old || old.el !== el;
    for (const x of stackPush(views.map((v) => v.id), id, drill).drop) { const i = views.findIndex((v) => v.id === x); if (i > 0) drop(i, el); }
    el.classList.add('ms-view');
    host.append(el);
    views.push({ id, el, title });
    if (fresh) el.scrollTop = 0; // R-05: a new card opens at its top, never at the last card's scroll position
    for (const s of [sheet, sheet.querySelector('.ms-body'), host]) if (s) s.scrollTop = 0; // scrollIntoView can scroll these
    renderViews();
    const before = state.size;
    pushing = true;
    dispatch({ type: 'size', size: sizeOf(size) || (state.size === 'peek' ? 'half' : state.size) });
    if (state.size === before) changed(); // else dispatch already told
    pushing = false;
  }
  function pop({ id } = {}) {
    const i = id ? views.findIndex((v) => v.id === id) : views.length - 1;
    if (i < 1) return;
    const wasTop = i === views.length - 1;
    drop(i);
    renderViews();
    if (wasTop && views.length === 1) { // back to the map: peek, Map settings from its top (R-14)
      explore.scrollTop = 0;
      if (state.size !== 'peek') { dispatch({ type: 'size', size: 'peek' }); return; }
    }
    changed();
  }
  back.addEventListener('click', () => pop());

  // ---- keyboard: --kb for sticky footers / full-screen dialogs, focused field kept in view
  let fakeKb = null;
  const kbNow = () => {
    if (fakeKb != null) return fakeKb;
    const vv = globalThis.visualViewport;
    return vv ? keyboardHeight({ innerHeight, vvHeight: vv.height, vvTop: vv.offsetTop }) : 0;
  };
  function keepInView(el = document.activeElement) {
    if (!mq.matches || !el?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
    const vv = globalThis.visualViewport, r = el.getBoundingClientRect();
    const top = vv ? vv.offsetTop : 0, bottom = Math.min(vv ? vv.offsetTop + vv.height : innerHeight, innerHeight - kbNow());
    if (r.top < top + 8 || r.bottom > bottom - 8) el.scrollIntoView({ block: 'center', inline: 'nearest' });
  }
  function kb() {
    if (!mq.matches) return;
    const px = kbNow();
    root.style.setProperty('--kb', `${px}px`);
    root.classList.toggle('kb-open', px >= KB_MIN);
    if (px >= KB_MIN) setTimeout(() => keepInView(), 0);
  }
  globalThis.visualViewport?.addEventListener('resize', kb);
  globalThis.visualViewport?.addEventListener('scroll', kb);
  document.addEventListener('focusin', (e) => { if (mq.matches) setTimeout(() => { if (document.activeElement === e.target) keepInView(e.target); }, 300); });
  globalThis.__phoneKb = (px) => { fakeKb = px == null ? null : Math.max(0, Number(px) || 0); kb(); return kbNow(); };

  // ---- page title row: "Tour" starts this page's tour through the tab's own tour line (modules/guide; hidden on
  // phone pages — "All tours" is in the Menu). No tour line (guide not loaded) → the button is hidden by CSS.
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('.page-tour');
    if (b) b.closest('.tab')?.querySelector('.tour-link button[data-uc]')?.click();
  });

  // ---- bus
  bus?.on('sheet:size', (d) => dispatch({ type: 'size', size: d }));
  bus?.on('sheet:push', (d) => push(d));
  bus?.on('sheet:pop', (d) => pop(d || {}));
  bus?.on('phone:show-map', (d) => {
    if (!mq.matches) return; // desktop: the map is always beside the panel
    if (activeTab() !== MAP_TAB) bus.emit('nav:goto', { tab: MAP_TAB });
    dispatch({ type: 'show-map', size: d?.size });
  });

  let wasPhone = null; // matchMedia 'change' + a resize check (some emulators only fire resize)
  const relayout = () => { if (mq.matches === wasPhone) return; wasPhone = mq.matches; place(wasPhone); kb(); };
  mq.addEventListener?.('change', relayout);
  addEventListener('resize', relayout);
  relayout();
  renderViews(); paint();
  return { push, pop, size: (s) => dispatch({ type: 'size', size: s }), state: () => ({ ...state }), isPhone: () => mq.matches };
}

/** Every English string this module shows (zh coverage test). */
export const uiStrings = () => [...Object.values(HANDLE_LABEL), 'Map settings', '‹ Back to {0}', 'Close'];
