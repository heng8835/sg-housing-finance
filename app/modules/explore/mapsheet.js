// Map sheet content on phones (≤ 767 px; phone overhaul §2.3, §3.2, P-17 to P-26, P-41; designer fold-ins F4, F5).
// The shell (modules/shell/phone.js) owns the sheet itself (#mapSheet, peek / half / full, 'sheet:push' views). This
// file fills it for the map, and moves things back when the window grows to ≥ 768 px (desktop never changes):
//   · peek slot: ONE row "▮▮▮ Price · last 1 year · 4 flat types … Change ›" that opens Map settings (F4); it stays
//     as the settings' header at half / full (no re-layout when snapping). A tapped school / mall / … shows a one-line
//     row there instead of a hover tooltip (P-23).
//   · map first (owner): pan / pinch / wheel / + − / a tap on empty map drop the sheet to peek.
//   · "Area prices" map button (owner request): the "Prices in view" box as a sheet view, never on the map (P-17 /
//     P-19; circle stays, freehand draw is desktop-only).
//   · Map settings (= #tab-explore, the sheet's base view): [Zoom to my choices] [All of Singapore] (were floating,
//     P-17), sections named by the question they answer and the layers under 5 small headings (F5; markup order only —
//     `data-l` and every saved setting are unchanged), "tap" wording in the layer notes (P-22).
//   · station / bus stop / future line / BTO popups open as a sheet view at half (P-23); "Blocks here" list when more
//     than 3 blocks sit within 30 px of a tap (P-20); + / − bottom-right, 48 px (P-18).
// Pure helpers are exported for tests (tests/explore/mapsheet.test.js).
import { t } from '../../core/i18n.js';

export const PHONE_QUERY = '(max-width: 767px)';
export const NEAR_PX = 30;        // P-20: blocks within this many px of a tap …
export const NEAR_MORE_THAN = 3;  // … more than this → "Blocks here" list instead of guessing
export const NEAR_ROWS = 12;      // rows shown at most (nearest first)
export const PHONE_TOLERANCE = 6; // px added to the canvas hit-test on phones (desktop keeps Leaflet's 0)

/** Search-result kinds as plain words (P-21). Desktop shows them upper-case through CSS, so 'Block' = 'BLOCK' there. */
export const KIND_LABEL = { block: 'Block', mrt: 'MRT', school: 'School', town: 'Town', place: 'Place' };
export const kindLabel = (k) => KIND_LABEL[k] || k;

const MODE_SHORT = { price: 'Price', psf: '$ per sqft', count: 'Number of sales', budget: 'Within my budget', rent: 'Median rent', commute: 'Commute time' };

/**
 * The peek summary line (F4): "Price · last 1 year · 4 ROOM, 5 ROOM +2 more".
 * types: display names of the picked flat types; allTypes: every type picked; period: calcLabel ('1 year').
 */
export function peekSummary({ mode, period, types = [], allTypes = false, tr = t, maxTypes = 2 }) {
  const parts = [tr(MODE_SHORT[mode] || MODE_SHORT.price)];
  if (period && mode !== 'rent' && mode !== 'commute') parts.push(tr('last {0}', [period]));
  if (allTypes) parts.push(tr('All flat types'));
  else if (!types.length) parts.push(tr('No flat types picked'));
  else parts.push(types.length > maxTypes ? tr('{0} flat types', [types.length]) : types.join(', ')); // one line at 360 px
  return parts.join(' · ');
}

/**
 * Peek colour key: the ramp as a small inline strip at the start of the summary row (the peek is one line, owner
 * 2026-10-09; the full legend with values is in Map settings). scale from blocks.js; budget = { colors } in the
 * "Within my budget" mode. No scale → ''.
 */
export function peekLegend({ mode, scale, budget }) {
  const cols = mode === 'budget' && budget ? [budget.colors.within, budget.colors.near, budget.colors.over] : scale?.ramp;
  return cols?.length ? `<span class="ms-ramp" aria-hidden="true">${cols.map((x) => `<i style="background:${x}"></i>`).join('')}</span>` : '';
}

/** Map first (owner): a pan / pinch / wheel / zoom button / tap on empty map drops the sheet to peek — unless the
 *  same tap changed the sheet itself (a card, a list, a circle that just closed) or a view was pushed less than
 *  PUSH_GRACE ms ago (the tap that opened "Blocks here" / a station reaches the map after the push, R-04). */
export const PUSH_GRACE = 400;
export const collapseOnMap = ({ changedSince, busy, sincePush = Infinity }) => !changedSince && !busy && sincePush >= PUSH_GRACE;

/** Ids of the items ({ id, x, y } in screen px) within r px of pt, nearest first. */
export function blocksNear(items, pt, r = NEAR_PX) {
  return items.map((it) => ({ id: it.id, d: Math.hypot(it.x - pt.x, it.y - pt.y) })).filter((x) => x.d <= r)
    .sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1)).map((x) => x.id);
}

/** F5: the layer rows under small headings. Rows without a heading come first; ids not listed stay in the first group. */
export const LAYER_GROUPS = [
  { h: null, keys: ['blocks', 'bto', 'parks', 'work', 'choices'] },
  { h: 'Transport', keys: ['mrt', 'futmrt', 'bus'] },
  { h: 'Schools and children', keys: ['schools', 'secondary', 'childcare', 'rings'] },
  { h: 'Shops and food', keys: ['malls', 'supermarkets', 'hawkers', 'food'] },
  { h: 'Health and care', keys: ['polyclinics', 'clinics', 'eldercare'] },
  { h: 'Places some avoid', keys: ['funeral', 'sites', 'flood'] },
];
/** present: the data-l keys in the list (any order) → [{ h, keys }] in F5 order, empty groups dropped. */
export function groupLayers(present) {
  const known = new Set(LAYER_GROUPS.flatMap((g) => g.keys)), has = new Set(present);
  const out = LAYER_GROUPS.map((g, i) => ({ h: g.h, keys: [...g.keys.filter((k) => has.has(k)), ...(i ? [] : present.filter((k) => !known.has(k)))] }));
  return out.filter((g) => g.keys.length);
}

/** F5 section headings (phone only), placed before the section that matches `before`. The first section's card says
 *  it itself: its title is "What the colours show" on phones (index.html .on-phone span, R-11) — no second heading. */
export const QUESTIONS = [
  { h: 'Which flats', before: '#ftChips' },
  { h: 'What else to show', before: '#secLayers' },
];

/** P-22: layer notes that say "click" on desktop → "tap" on phones (data-l → [desktop key, phone key]). */
export const TAP_NOTES = {
  futmrt: ['(CRL, JRL, TEL/DTL ext… click for lines & year)', '(CRL, JRL, TEL/DTL ext… tap for lines & year)'],
  mrt: ['(click a station for its lines)', '(tap a station for its lines)'],
  bus: ['(street zoom · click a stop for its bus routes)', '(street zoom · tap a stop for its bus routes)'],
};

/** A POI tooltip ("<div class=poi-tip><b>Name</b><br>kind</div>") as one line of HTML: "<b>Name</b> · kind". */
export const tipLine = (html) => String(html || '').replace(/<br\s*\/?>/gi, ' · ').replace(/<\/?div[^>]*>/gi, '').trim();

/** R-13: the peek row while circling an area (with a 44 px Cancel). */
export const CIRCLE_ROW = 'Tap the centre, then the edge';

/** Map search placeholder: the desktop one (index.html) and a shorter one for phones. */
export const SEARCH_PH = { desktop: 'Search block, street, town, MRT or school…', phone: 'Search block, street, MRT…' };

// ------------------------------------------------------------------ DOM (browser)
/**
 * ctx: { bus, map, canvas, hooks: { fitChoices(), fitSg(), inView() → [{ id, lat, lon }], blockRow(id) → { label,
 * value }, openBlock(id), hasArea(), area() → S.area ({ type:'circle', lat, lon, r } | { pts }), relayout() — redraw
 * the legend + area note on a breakpoint change } }.
 * Call start() once the static layers exist.
 */
export function createMapSheet({ bus, map, canvas, hooks }) {
  const $ = (id) => document.getElementById(id);
  const mq = matchMedia(PHONE_QUERY);
  const sheet = $('mapSheet'), slot = sheet?.querySelector('[data-slot="peek"]'), pane = $('tab-explore');
  const state = { size: 'peek', top: 'settings', poi: null, legend: null, awaitCircle: false, started: false };
  const phone = () => mq.matches && !!sheet;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const size = (s) => { if (phone()) bus?.emit('sheet:size', s); };
  const circling = () => !!$('map')?.classList.contains('circling');

  // ---- peek slot
  function paintPeek() {
    if (!slot) return;
    const circ = state.awaitCircle && circling();
    if (circ) {
      slot.innerHTML = `<div class="ms-poi ms-circ"><p>${t(CIRCLE_ROW)}</p><button type="button" class="btn" data-ms="circle-cancel">${t('Cancel')}</button></div>`;
    } else if (state.poi) {
      slot.innerHTML = `<div class="ms-poi"><p>${state.poi}</p><button type="button" class="btn" data-ms="poi-close">${t('Close')}</button></div>`;
    } else if (state.legend) {
      const L = state.legend;
      slot.innerHTML = `<button type="button" class="ms-sum" data-ms="settings" aria-label="${esc(t('Map settings: {0}', [L.summary]))}">${L.html}<span class="ms-sum-t">${esc(L.summary)}</span><span class="ms-sum-go" aria-hidden="true">${t('Change')}</span></button>`;
    }
    // shown at every height while Map settings is on top (a header there), so snapping never re-lays the sheet out
    slot.hidden = !phone() || !(circ || state.poi || state.top === 'settings');
  }
  slot?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ms]'); if (!b) return;
    if (b.dataset.ms === 'settings') size('half');
    else if (b.dataset.ms === 'poi-close') { state.poi = null; paintPeek(); }
    else if (b.dataset.ms === 'circle-cancel') stopCircling(true);
  });
  // back on Map settings (a view closed): the shell scrolls it to its top and drops the sheet to peek (R-14)
  let changes = 0, pushedAt = -Infinity; // a map tap collapses only when the same tap did not change the sheet
  bus?.on('sheet:changed', (d) => {
    const was = { ...state };
    changes++;
    if (d?.push) pushedAt = performance.now();
    state.size = d?.size || state.size; state.top = d?.top || state.top;
    if (state.poi && (state.size !== was.size || state.top !== was.top)) state.poi = null; // the row lasts until the sheet moves
    paintPeek();
  });
  // ---- map first (owner): pan, pinch, wheel, + / −, or a tap on empty map → peek
  const mapEl = map?.getContainer?.();
  const busy = () => !!mapEl?.matches('.picking, .circling, .drawing');
  const collapse = () => { if (phone() && state.size !== 'peek' && collapseOnMap({ changedSince: false, busy: busy() })) size('peek'); };
  map?.on?.('dragstart', collapse);
  mapEl?.addEventListener('wheel', collapse, { passive: true });
  mapEl?.addEventListener('touchstart', (e) => { if (e.touches.length > 1) collapse(); }, { passive: true });
  mapEl?.addEventListener('click', (e) => { if (e.target.closest('.leaflet-control-zoom')) collapse(); }, true); // capture: Leaflet stops it at the control
  map?.on?.('click', () => { const at = changes; setTimeout(() => { if (phone() && state.size !== 'peek' && collapseOnMap({ changedSince: changes !== at, busy: busy(), sincePush: performance.now() - pushedAt })) size('peek'); }, 0); });

  /** From renderLegend: { summary, html } (pure helpers above build both). */
  function legend(L) { state.legend = L; paintPeek(); }
  /** One-line row at peek (tapped POI, search result). html is ours (already escaped). */
  function row(html) {
    if (!phone()) return false;
    // Map settings on top: drop to peek (map visible); a card / list on top: at least half, the row sits above it
    const want = state.top === 'settings' ? 'peek' : state.size === 'peek' ? 'half' : state.size;
    if (want !== state.size) size(want); // before the row: a size change clears it
    state.poi = html; paintPeek();
    return true;
  }
  /** A popup's content as a sheet view at half (phone) → its root element; desktop → null (caller opens L.popup). */
  function pop(html, title) {
    if (!phone()) return null;
    const el = document.createElement('div');
    el.className = 'ms-pop'; el.innerHTML = html;
    bus?.emit('sheet:push', { id: 'map-pop', el, title: title || '', size: 'half' });
    return el;
  }

  // ---- "Blocks here" (P-20): a tap with more than 3 blocks within 30 px lists them instead of guessing
  function blocksHere(e) {
    if (!phone() || !e?.containerPoint) return false;
    const items = hooks.inView().map((b) => { const p = map.latLngToContainerPoint([b.lat, b.lon]); return { id: b.id, x: p.x, y: p.y }; });
    const ids = blocksNear(items, e.containerPoint);
    if (ids.length <= NEAR_MORE_THAN) return false;
    const el = document.createElement('div');
    el.className = 'ms-blocks';
    el.innerHTML = `<h3 class="ms-h">${t('Blocks here ({0})', [ids.length])}</h3><p class="ms-note">${t('Several blocks are close together here. Tap one to open it.')}</p><ul class="ms-list">${ids.slice(0, NEAR_ROWS).map((id) => { const r = hooks.blockRow(id); return `<li><button type="button" data-bi="${id}"><span class="ms-l-t">${esc(r.label)}</span><span class="ms-l-v">${esc(r.value)}</span></button></li>`; }).join('')}</ul>`;
    el.addEventListener('click', (ev) => { const b = ev.target.closest('button[data-bi]'); if (b) hooks.openBlock(+b.dataset.bi); });
    bus?.emit('sheet:push', { id: 'blocks-here', el, title: t('Blocks here'), size: 'half' });
    return true;
  }

  /** Tap on a school / mall / hawker … (tooltip only on desktop) → one-line row at peek. */
  function tapRows(groups) {
    const onTap = (e) => { if (!phone()) return; const m = e.target; m.closeTooltip?.(); const tip = m.getTooltip?.(); if (!tip) return; const c = tip.getContent(); row(tipLine(typeof c === 'function' ? c(m) : c)); }; // content may be a function (family.js)
    groups.filter(Boolean).forEach((g) => g.eachLayer((m) => m.on('click', onTap)));
  }

  // ---- Map settings additions (phone only; removed again at ≥ 768 px)
  const top = document.createElement('div');
  top.className = 'ms-top';
  top.innerHTML = `<button type="button" class="btn" data-ms="fit-choices">${t('Zoom to my choices')}</button><button type="button" class="btn" data-ms="fit-sg">${t('All of Singapore')}</button>`;
  top.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ms]'); if (!b) return;
    size('peek');
    if (b.dataset.ms === 'fit-choices') hooks.fitChoices(); else hooks.fitSg();
  });
  // ---- "Area prices" (owner, P-17 / P-19): on phones the floating "Prices in view" box never sits on the map. A 48 px
  // map button (above + / −) opens it as a sheet view at half: the same stats + [Circle an area] (freehand draw is
  // desktop-only, Q8). Circle drops the sheet to peek so the map can be tapped; the result shows back in the view.
  const box = $('areaBox'), boxHome = sheet; // #areaBox lives right before #mapSheet in #mapwrap (desktop + parked on phones)
  const area = document.createElement('div');
  area.className = 'ms-area';
  area.innerHTML = `<div class="ms-ab"></div><div class="ms-ab-acts"><button type="button" class="btn" data-ms="circle">${t('Circle an area')}</button><button type="button" class="btn" data-ms="clear" hidden>${t('Clear')}</button></div>`;
  const clearBtn = area.querySelector('[data-ms="clear"]'), circleBtn = area.querySelector('[data-ms="circle"]');
  const parkBox = () => { if (box && boxHome && box.nextElementSibling !== boxHome) boxHome.before(box); }; // renderArea needs it in the document
  function openArea() {
    if (!phone()) return;
    if (box) area.querySelector('.ms-ab').append(box);
    bus?.emit('sheet:push', { id: 'area', el: area, title: t('Area prices'), size: 'half' });
  }
  const hideBanner = () => $('banner')?.classList.remove('show'); // the circle's "Tap the centre…" instruction (R-13)
  /** Stop circling (Cancel, Esc, a second tap on the button). back: return to the Area prices view at half. */
  function stopCircling(back) {
    if (circling()) $('abCircle')?.click();
    state.awaitCircle = false; circleBtn.textContent = t('Circle an area'); hideBanner(); paintPeek();
    if (back && area.isConnected) size('half');
  }
  /** R-13: after the second tap, fit the drawn circle into the map above the (half) sheet. */
  function fitArea() {
    const A = hooks.area?.(), L = globalThis.L; if (!A || !L || !map) return;
    const b = A.type === 'circle' ? L.latLng(A.lat, A.lon).toBounds(A.r * 2) : A.pts ? L.latLngBounds(A.pts) : null;
    if (b) map.fitBounds(b, { paddingTopLeft: [16, 72], paddingBottomRight: [16, sheetTarget() + 16], animate: !matchMedia('(prefers-reduced-motion: reduce)').matches });
  }
  /** The sheet's height once its snap ends: half = --sheet-half (55 %) of the map area; else its height now. */
  function sheetTarget() {
    const w = $('mapwrap'); if (!w || !sheet) return 0;
    const half = parseFloat(getComputedStyle(w).getPropertyValue('--sheet-half')) || 55;
    return state.size === 'half' ? Math.round(w.clientHeight * half / 100) : sheet.offsetHeight;
  }
  area.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ms]'); if (!b) return;
    if (b.dataset.ms === 'circle') {
      if (circling()) { stopCircling(false); return; } // second tap: stop
      state.awaitCircle = true; size('peek'); $('abCircle')?.click(); circleBtn.textContent = t('Stop circling'); paintPeek();
    } else { state.awaitCircle = false; $('abClear')?.click(); bus?.emit('sheet:pop', { id: 'area' }); } // R-14: Clear closes the view
  });
  bus?.on('sheet:changed', () => { circleBtn.textContent = t(circling() ? 'Stop circling' : 'Circle an area'); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.awaitCircle) setTimeout(() => { if (!circling()) stopCircling(true); }, 0); }); // Esc stops (legacy.js)
  bus?.on('sheet:popped', (d) => { if (d?.id === 'area') { parkBox(); if (circling() || state.awaitCircle) stopCircling(false); } });
  bus?.on('explore:area', (a) => {
    if (clearBtn) clearBtn.hidden = !a;
    if (a && state.awaitCircle && phone()) {
      state.awaitCircle = false; circleBtn.textContent = t('Circle an area'); hideBanner(); paintPeek();
      if (!area.isConnected) openArea(); else size('half');
      setTimeout(fitArea, 0); // after the circle is drawn; pads by the height the sheet is snapping to
    }
  });
  const areaCtl = globalThis.L?.Control ? new (globalThis.L.Control.extend({ options: { position: 'bottomright' }, onAdd() {
    const b = globalThis.L.DomUtil.create('button', 'ms-area-btn leaflet-bar');
    b.type = 'button'; b.textContent = t('Area prices');
    globalThis.L.DomEvent.disableClickPropagation(b); b.addEventListener('click', openArea);
    return b;
  } }))() : null;

  const heads = QUESTIONS.map((q) => { const h = document.createElement('h3'); h.className = 'ms-q'; h.textContent = t(q.h); return { el: h, before: q.before }; });
  const layerList = $('layers');
  let layerOrder = null; // desktop order of #layers' children, kept to put them back
  const groupHeads = [];
  function groupLayersOn(on) {
    if (!layerList) return;
    if (on) {
      if (!layerOrder) layerOrder = [...layerList.children];
      const rows = new Map([...layerList.querySelectorAll(':scope > label.check')].map((l) => [l.querySelector('input')?.dataset.l, l]));
      const extra = [...layerList.children].filter((c) => !c.matches('label.check') && !c.matches('.ms-lg'));
      groupLayers([...rows.keys()]).forEach((g) => {
        if (g.h) { const h = document.createElement('h4'); h.className = 'ms-lg'; h.textContent = t(g.h); groupHeads.push(h); layerList.append(h); }
        g.keys.forEach((k) => layerList.append(rows.get(k)));
      });
      extra.forEach((c) => layerList.append(c)); // the family-layer sources note goes last
    } else if (layerOrder) {
      groupHeads.splice(0).forEach((h) => h.remove());
      layerOrder.forEach((c) => layerList.append(c));
      layerOrder = null;
    }
    for (const [k, [desk, tap]] of Object.entries(TAP_NOTES)) {
      const note = layerList.querySelector(`input[data-l="${k}"]`)?.closest('label')?.querySelector('.xs');
      if (note) note.textContent = t(on ? tap : desk);
    }
  }

  function place(on) {
    if (!pane) return;
    const search = $('mSearch'); // the long placeholder is cut at 360 px / Larger
    if (search) search.placeholder = t(on ? SEARCH_PH.phone : SEARCH_PH.desktop);
    if (on) {
      pane.prepend(top);
      heads.forEach(({ el, before }) => { const at = pane.querySelector(before)?.closest('.section'); if (at) at.before(el); });
    } else {
      top.remove(); heads.forEach(({ el }) => el.remove());
      if (area.isConnected) bus?.emit('sheet:pop', { id: 'area' });
      parkBox(); // desktop: the floating box exactly as before
    }
    groupLayersOn(on);
    map?.zoomControl?.setPosition(on ? 'bottomright' : 'topleft'); // 48 px + / − above the sheet (P-18)
    if (areaCtl && map) { if (on) areaCtl.addTo(map); else areaCtl.remove(); } // "Area prices" sits above + / −
    if (canvas?.options) canvas.options.tolerance = on ? PHONE_TOLERANCE : 0;
    hooks.relayout?.(); // legend + area note wording (tap / click)
    paintPeek();
  }

  let was = null;
  const relayout = () => { if (!state.started || mq.matches === was) return; was = mq.matches; place(was); };
  function start() {
    state.started = true;
    if (clearBtn) clearBtn.hidden = !hooks.hasArea();
    mq.addEventListener?.('change', relayout); addEventListener('resize', relayout);
    relayout();
  }
  return { phone, start, legend, row, pop, blocksHere, tapRows };
}

/** Every English string this module shows (zh coverage). */
export const uiStrings = () => [...Object.values(KIND_LABEL), ...Object.values(MODE_SHORT), 'last {0}', 'All flat types', 'No flat types picked', '{0} flat types',
  'Close', SEARCH_PH.phone,
  'Map settings: {0}', 'Change', 'Blocks here ({0})', 'Blocks here', 'Several blocks are close together here. Tap one to open it.',
  'Zoom to my choices', 'All of Singapore', 'Area prices', 'Circle an area', 'Stop circling', 'Clear', 'What the colours show',
  CIRCLE_ROW, 'Cancel',
  ...LAYER_GROUPS.map((g) => g.h).filter(Boolean), ...QUESTIONS.map((q) => q.h), ...Object.values(TAP_NOTES).map((x) => x[1])];
