// "Area prices" on phones (spec phone-topbar-area-household.md §2; owner 2026-10-09: "I'd prefer hand-draw when I tap
// Area prices; the button is too big"). Desktop never changes: its floating box with circle / draw / clear stays.
//   · map control: one 48×48 icon button at the top of the + / − column (aria-label "Area prices"); states idle /
//     drawing (aria-pressed) / an area is on the map. A tap starts drawing at once (Q5); while drawing it cancels;
//     with an area it opens the result.
//   · Map settings row "Area prices ›" (the worded way in) opens the view: Prices in view, [Draw an area],
//     "Use a circle instead" (Q11: the tap-only way, WCAG 2.2 SC 2.5.7).
//   · finger drawing: the peek row is the hint + Cancel (no banner); one finger draws and the map does not pan; a
//     second finger drops the stroke (pinch still zooms); lifting closes the shape; too small → a peek row, still
//     drawing. The points are thinned to ≤ 200 before saving.
//   · the result at half: "Inside your shape", 2×2 grid (median, price per sq ft, sales, blocks), "More numbers",
//     [Draw again] [Clear], "Use a circle instead".
// SAME maths as desktop: legacy.js imports inPoly / polyAreaKm2 / tooSmall / roundPts from here, saves S.area through
// one commitPoly() and the view shows legacy's areaStats() (hooks.areaInfo) — nothing is recomputed here.
import { t } from '../../core/i18n.js';
import { keepFolds } from '../../core/fold.js';

export const MAX_PTS = 200;        // spec §2.2: a saved drawn area keeps at most this many points
export const MIN_STEP_PX = 4;      // desktop rule: a point closer than this to the last one is skipped
export const MIN_PTS = 8;          // desktop rule: fewer points → too small
export const MIN_KM2 = 0.005;      // desktop rule: a smaller shape → too small

/** Point-in-polygon (ray casting) on [[lat, lon], …] — the desktop test, moved here unchanged. */
export const inPoly = (lat, lon, pts) => { let inside = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [yi, xi] = pts[i], [yj, xj] = pts[j]; if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside; } return inside; };
/** Shoelace area in km² (local flat projection) — the desktop formula, moved here unchanged. */
export const polyAreaKm2 = (pts) => { const k = 111.32, kx = k * Math.cos(pts[0][0] * Math.PI / 180); let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][1] * kx) * (pts[i][0] * k) - (pts[i][1] * kx) * (pts[j][0] * k); return Math.abs(a) / 2; };
/** The desktop "too small" rule: fewer than 8 points or under 0.005 km². */
export const tooSmall = (pts) => !pts || pts.length < MIN_PTS || polyAreaKm2(pts) < MIN_KM2;
/** S.area points: 5 decimals (≈ 1 m), as desktop saves them. */
export const roundPts = (pts) => pts.map(([a, b]) => [+a.toFixed(5), +b.toFixed(5)]);

/** At most max points: every k-th point, the first and the last always kept, order kept. */
export function thinPoints(pts, max = MAX_PTS) {
  if (pts.length <= max) return pts.slice();
  const k = Math.ceil((pts.length - 1) / (max - 1)), out = [];
  for (let i = 0; i < pts.length - 1; i += k) out.push(pts[i]);
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * The finger-stroke state machine (pure). s: { mode: 'idle'|'stroke'|'pinch', id, down: [pointer ids], last: [x, y] };
 * ev: { type: 'down'|'move'|'up'|'cancel', id, x, y, primary }. → { s, act } with act:
 *   'begin' a stroke starts at (x, y) · 'add' a point (≥ 4 px from the last) · 'end' the finger lifted (close it) ·
 *   'drop' the stroke is thrown away (a second finger: pinch; or the browser cancelled the pointer) · null.
 * A primary 'down' always starts clean (a lost 'up' never leaves it stuck in 'pinch').
 */
export const STROKE0 = Object.freeze({ mode: 'idle', id: null, down: [], last: null });
export function strokeStep(s, ev) {
  const down = ev.type === 'down' && ev.primary ? [] : s.down.filter((i) => i !== ev.id);
  if (ev.type === 'down') {
    down.push(ev.id);
    if (down.length === 1) return { s: { mode: 'stroke', id: ev.id, down, last: [ev.x, ev.y] }, act: 'begin' };
    return { s: { mode: 'pinch', id: null, down, last: null }, act: s.mode === 'stroke' ? 'drop' : null };
  }
  if (ev.type === 'move') {
    if (s.mode !== 'stroke' || ev.id !== s.id) return { s, act: null };
    if (s.last && Math.hypot(ev.x - s.last[0], ev.y - s.last[1]) < MIN_STEP_PX) return { s, act: null };
    return { s: { ...s, last: [ev.x, ev.y] }, act: 'add' };
  }
  if (s.mode === 'stroke' && ev.id === s.id) return { s: { mode: 'idle', id: null, down, last: null }, act: ev.type === 'up' ? 'end' : 'drop' };
  return { s: { ...s, down, mode: s.mode === 'pinch' && !down.length ? 'idle' : s.mode }, act: null };
}

/** Peek rows (the sheet's one line while drawing / circling), each with a 44 px Cancel. */
export const DRAW_ROW = 'Draw around an area with your finger';
export const SMALL_ROW = 'Too small — draw a bigger shape';
export const CIRCLE_ROW = 'Tap the centre, then the edge'; // R-13
const LABEL = 'Area prices';

/**
 * The Area prices view as data (pure). info (legacy hooks.areaInfo): { kind: 'poly'|'circle'|'view'|'out', title
 * (circle), km2 (poly), st (areaStats: medP, avgP, medPsf, avgPsf, n, blocks, yoy), types, period }; k / pct: the
 * desktop money formats (fmt.k, fmt.pct) so the figures read exactly as in the desktop box.
 * → { title, sub, cells: [[label, value]], more: [[label, value]], note, acts: ['draw'] | ['again', 'clear'] }
 */
export function areaView(info, { tr = t, k, pct }) {
  const area = info.kind === 'poly' || info.kind === 'circle', st = info.st;
  const title = info.kind === 'poly' ? tr('Inside your shape') : info.kind === 'circle' ? circleTitle(info, tr) : tr('Prices in view');
  const sub = info.kind === 'out' ? '' : [info.kind === 'poly' ? tr('{0} km²', [info.km2.toFixed(2)]) : null, typesText(info, tr), info.period ? tr('last {0}', [info.period]) : null].filter(Boolean).join(' · ');
  const acts = area ? ['again', 'clear'] : ['draw'];
  if (info.kind === 'out') return { title, sub, cells: [], more: [], note: tr('Zoom in, or draw an area, to see prices.'), acts };
  if (!st || !st.n) return { title, sub, cells: [], more: [], note: tr('No sales here for the flat types and period you picked.'), acts };
  return {
    title, sub, note: '', acts,
    cells: [[tr('Median price'), k(st.medP)], [tr('Price per sq ft'), `S$${Math.round(st.medPsf)}`], [tr('Sales'), st.n.toLocaleString()], [tr('Blocks'), String(st.blocks)]],
    more: [[tr('Average price'), k(st.avgP)], [tr('Average per sq ft'), `S$${Math.round(st.avgPsf)}`], [tr('Price per sq ft vs a year ago'), st.yoy == null ? '—' : pct(st.yoy, 0)]],
  };
}

/** The picked flat types by name (review nice-to-have 4): "4-room, 5-room", or the first two + the rest as "+2".
 *  info.names: the picked types' display names (sorted); info.all: every type picked → info.types ("All flat types"). */
export function typesText(info, tr = t) {
  const n = info.names;
  if (info.all || !n?.length) return info.types;
  return n.length > 2 ? tr('{0}, {1} +{2}', [n[0], n[1], n.length - 2]) : n.join(', ');
}
/** Circle title rounded to 10 m (review nice-to-have 5): "Within 740 m of the centre"; no radius → the desktop title. */
export function circleTitle(info, tr = t) {
  if (!(info.r > 0)) return info.title;
  const m = Math.max(10, Math.round(info.r / 10) * 10);
  return tr('Within {0} of the centre', [m < 1000 ? tr('{0} m', [m]) : tr('{0} km', [(m / 1000).toFixed(1)])]);
}

/** Lasso icon (24 px, currentColor): a wide dashed loop with a rope tail at the lower left (A-1: no straight handle and
 *  no dot, so it does not read as a search magnifier under the search box). */
export const LASSO = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 4.5c4.7 0 8.5 2.4 8.5 5.4S16.7 15.2 12 15.2 3.5 12.9 3.5 9.9 7.3 4.5 12 4.5z" stroke-dasharray="3 2.4"/><path d="M7.4 14.4c-1.6 1-2.1 2.8-1.1 3.9 1 1.1 2.8.7 3.3-.6.4-1.2-.5-2.1-1.5-1.8"/></svg>';
const SKETCH = { color: '#0b0b0b', weight: 2.5, dashArray: '6 4', interactive: false }; // the desktop sketch line

// ------------------------------------------------------------------ DOM (browser)
/**
 * ctx: { bus, map, phone() → bool, size(s), repaint() — mapsheet repaints the peek slot, hooks: { hasArea(), area(),
 * areaInfo(), draw: { start(), stop(), commit(pts) → bool } } }. #abCircle / #abClear (the desktop box's links) run
 * the circle and Clear, as before.
 */
export function createAreaSheet({ bus, map, phone, size, repaint, hooks }) {
  const $ = (id) => document.getElementById(id);
  const L = globalThis.L, mapEl = map?.getContainer?.(), sheet = $('mapSheet');
  const st = { mode: null, size: 'peek', g: STROKE0, pts: [], line: null, timer: 0, fitNext: false }; // mode: null | 'draw' | 'small' | 'circle'
  const circling = () => !!$('map')?.classList.contains('circling');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---- the view (#areaBox moves in, so tours that target it still find it; only .ms-av shows inside it on phones)
  const box = $('areaBox'), view = document.createElement('div'), av = document.createElement('div');
  view.className = 'ms-area'; av.className = 'ms-av';
  const folds = keepFolds(av);
  const parkBox = () => { if (box && sheet && box.nextElementSibling !== sheet) sheet.before(box); }; // renderArea needs it in the document
  function render() {
    if (!view.isConnected) return;
    const info = hooks.areaInfo?.(); if (!info) return;
    const A = info.kind === 'circle' ? hooks.area?.() : null;
    const v = areaView(A?.r ? { ...info, r: A.r } : info, { k: info.k, pct: info.pct });
    folds.snapshot();
    const cell = ([l, x]) => `<div><small>${esc(l)}</small><b>${esc(x)}</b></div>`;
    av.innerHTML = `<h3 class="ms-av-t">${esc(v.title)}</h3>${v.sub ? `<p class="ms-av-sub">${esc(v.sub)}</p>` : ''}`
      + (v.note ? `<p class="ms-av-note">${esc(v.note)}</p>` : `<div class="ms-av-grid">${v.cells.map(cell).join('')}</div>`)
      + (v.more.length ? `<details class="ms-av-more" data-fold="area-more"${folds.attr('area-more')}><summary>${t('More numbers')}</summary><div class="ms-av-grid">${v.more.map(cell).join('')}</div></details>` : '')
      + `<div class="ms-av-acts">${v.acts.map((a) => `<button type="button" class="btn" data-av="${a}">${t(a === 'clear' ? 'Clear' : a === 'again' ? 'Draw again' : 'Draw an area')}</button>`).join('')}</div>`
      + `<button type="button" class="ms-av-circ" data-av="circle">${t('Use a circle instead')}</button>`;
  }
  const refresh = () => { if (!view.isConnected || st.timer) return; st.timer = setTimeout(() => { st.timer = 0; render(); }, 0); }; // once per burst of changes
  function openView() {
    if (!phone()) return;
    if (box) { box.append(av); view.append(box); }
    bus?.emit('sheet:push', { id: 'area', el: view, title: t(LABEL), size: 'half' });
    render();
  }
  view.addEventListener('click', (e) => {
    const b = e.target.closest('[data-av]'); if (!b) return;
    const a = b.dataset.av;
    if (a === 'draw' || a === 'again') startDraw();
    else if (a === 'circle') startCircle();
    else { st.mode = null; $('abClear')?.click(); bus?.emit('sheet:pop', { id: 'area' }); } // R-14: Clear closes the view (sheet → peek)
  });

  // ---- map control (48×48, top of the + / − column) and the worded Map settings row
  let btn = null;
  const ctl = L?.Control ? new (L.Control.extend({ options: { position: 'bottomright' }, onAdd() {
    const c = L.DomUtil.create('div', 'leaflet-bar ms-area-ctl');
    btn = L.DomUtil.create('button', 'ms-area-go', c);
    btn.type = 'button'; btn.innerHTML = LASSO; btn.setAttribute('aria-label', t(LABEL)); btn.title = t(LABEL);
    L.DomEvent.disableClickPropagation(c);
    btn.addEventListener('click', onControl);
    syncCtl();
    return c;
  } }))() : null;
  function syncCtl() {
    if (!btn) return;
    const drawing = st.mode === 'draw' || st.mode === 'small';
    btn.setAttribute('aria-pressed', String(drawing));
    btn.classList.toggle('has-area', !drawing && !!hooks.hasArea?.());
  }
  function onControl() {
    if (st.mode === 'draw' || st.mode === 'small') return cancel();
    if (st.mode === 'circle') stopCircle(false);
    if (hooks.hasArea?.()) { if (view.isConnected) size('half'); else openView(); setTimeout(fitArea, 0); return; }
    startDraw();
  }
  const row = document.createElement('button');
  row.type = 'button'; row.className = 'ms-arow ms-area-btn'; // .ms-area-btn: core/spotlight opens the view for tours
  row.innerHTML = `${LASSO}<span>${t(LABEL)}</span><span class="ms-arow-go" aria-hidden="true">›</span>`;
  row.addEventListener('click', openView);

  // ---- drawing (phones; desktop keeps legacy's mouse sketch)
  function startDraw() {
    if (!phone()) return;
    if (st.mode === 'circle' || circling()) stopCircle(false);
    hooks.draw.start(); // legacy: drawing on (block taps ignored), #map.drawing (touch-action none), panning off; old area kept
    st.mode = 'draw'; st.g = STROKE0; dropStroke();
    syncCtl(); size('peek'); repaint();
  }
  /** Cancel / Esc / a tap on the control: drawing ends, the old area (if any) stays; back to the view if it is open. */
  function cancel() {
    if (st.mode === 'circle') return stopCircle(true);
    if (!st.mode) return;
    dropStroke(); hooks.draw.stop(); st.mode = null; st.g = STROKE0;
    syncCtl(); repaint();
    if (view.isConnected) size('half');
  }
  function dropStroke() { if (st.line) { map.removeLayer(st.line); st.line = null; } st.pts = []; }
  function onPtr(type, e) {
    if (st.mode !== 'draw' && st.mode !== 'small') return;
    if (type === 'down' && (e.button !== 0 || e.target.closest?.('.leaflet-control-container'))) return; // + / − and the area button stay buttons
    const r = strokeStep(st.g, { type, id: e.pointerId, x: e.clientX, y: e.clientY, primary: e.isPrimary });
    st.g = r.s;
    if (!r.act) return;
    if (r.act === 'drop') { dropStroke(); return; }
    if (r.act === 'end') { const pts = st.pts; st.line && map.removeLayer(st.line); st.line = null; st.pts = []; finish(pts); return; }
    const ll = map.mouseEventToLatLng(e);
    if (r.act === 'begin') {
      dropStroke(); try { mapEl.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
      st.line = L.polyline([], SKETCH).addTo(map); e.preventDefault();
      if (st.mode === 'small') { st.mode = 'draw'; repaint(); }
    }
    st.pts.push([ll.lat, ll.lng]); st.line.addLatLng(ll);
  }
  function finish(pts) {
    if (tooSmall(pts)) { st.mode = 'small'; repaint(); return; } // still drawing: try again or Cancel
    st.mode = null; st.g = STROKE0; syncCtl(); repaint();
    hooks.draw.commit(thinPoints(pts)); // legacy: the same S.area / drawArea / renderArea / save as desktop
    st.fitNext = true; // A-3: the fit follows the sheet's snap to half ('sheet:changed' below)
    if (view.isConnected) size('half'); else openView();
    // drawing ends after the click a mouse release sends (openBlock ignores it while drawing); the fit here is the
    // fallback for when the sheet did not move (it was at half already)
    setTimeout(() => { hooks.draw.stop(); syncCtl(); if (st.fitNext) { st.fitNext = false; fitArea(); } }, 0);
  }
  if (mapEl) {
    mapEl.addEventListener('pointerdown', (e) => onPtr('down', e));
    mapEl.addEventListener('pointermove', (e) => onPtr('move', e));
    mapEl.addEventListener('pointerup', (e) => onPtr('up', e));
    mapEl.addEventListener('pointercancel', (e) => onPtr('cancel', e));
  }

  // ---- circle (R-13, unchanged): the peek row says what to tap; the result shows in the view
  function startCircle() {
    if (st.mode === 'draw' || st.mode === 'small') cancel();
    if (circling()) return;
    st.mode = 'circle'; size('peek'); $('abCircle')?.click(); repaint();
  }
  function stopCircle(back) {
    if (circling()) $('abCircle')?.click();
    st.mode = null; $('banner')?.classList.remove('show'); repaint();
    if (back && view.isConnected) size('half');
  }

  /** Fit the area into the map above the (half) sheet (R-13). */
  function fitArea() {
    const A = hooks.area?.(); if (!A || !L || !map || !phone()) return;
    const b = A.type === 'circle' ? L.latLng(A.lat, A.lon).toBounds(A.r * 2) : A.pts ? L.latLngBounds(A.pts) : null;
    if (b) map.fitBounds(b, { paddingTopLeft: [16, 72], paddingBottomRight: [16, sheetTarget() + 16], animate: !matchMedia('(prefers-reduced-motion: reduce)').matches });
  }
  /** The sheet's height once its snap ends: half = --sheet-half (55 %) of the map area; else its height now. */
  function sheetTarget() {
    const w = $('mapwrap'); if (!w || !sheet) return 0;
    const half = parseFloat(getComputedStyle(w).getPropertyValue('--sheet-half')) || 55;
    return st.size === 'half' ? Math.round(w.clientHeight * half / 100) : sheet.offsetHeight;
  }

  bus?.on('sheet:changed', (d) => {
    st.size = d?.size || st.size; if (d?.top === 'area') refresh();
    if (st.fitNext && d?.size === 'half') { st.fitNext = false; setTimeout(fitArea, 0); } // A-3: fit once the sheet snaps to half
  });
  bus?.on('sheet:popped', (d) => { if (d?.id === 'area') { parkBox(); if (st.mode === 'circle') stopCircle(false); } });
  bus?.on('explore:area', (a) => {
    syncCtl(); refresh();
    if (a && st.mode === 'circle' && phone()) {
      st.mode = null; $('banner')?.classList.remove('show'); repaint();
      if (!view.isConnected) openView(); else size('half');
      setTimeout(fitArea, 0); // after the circle is drawn; pads by the height the sheet is snapping to
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !st.mode) return;
    if (st.mode === 'circle') setTimeout(() => { if (!circling()) stopCircle(true); }, 0); // legacy.js stops the circle
    else cancel();
  });

  /** The peek row while drawing / circling (mapsheet paints it), or ''. Its Cancel is data-ms="area-cancel". */
  function peek() {
    if (!phone() || !st.mode || (st.mode === 'circle' && !circling())) return '';
    const text = st.mode === 'circle' ? CIRCLE_ROW : st.mode === 'small' ? SMALL_ROW : DRAW_ROW;
    return `<div class="ms-poi ms-circ ms-draw"><p aria-live="polite">${t(text)}</p><button type="button" class="btn" data-ms="area-cancel">${t('Cancel')}</button></div>`;
  }
  /** Breakpoint: on phones the control sits above + / − (add it after the zoom control: Leaflet stacks bottom
   *  corners upwards) and the view shows .ms-av; back at ≥ 768 px everything returns to the desktop box. */
  function place(on) {
    if (!on) {
      if (st.mode === 'circle') stopCircle(false); else cancel();
      if (view.isConnected) bus?.emit('sheet:pop', { id: 'area' });
      av.remove(); parkBox(); row.remove();
    }
    if (ctl && map) { if (on) ctl.addTo(map); else ctl.remove(); }
  }
  return { row, peek, cancel, place, refresh, open: openView };
}

/** Every English string this module shows (zh coverage). */
export const uiStrings = () => [LABEL, DRAW_ROW, SMALL_ROW, CIRCLE_ROW, 'Cancel', 'Inside your shape', 'Prices in view', '{0} km²', 'last {0}', '{0}, {1} +{2}', 'Within {0} of the centre', '{0} m', '{0} km',
  'Zoom in, or draw an area, to see prices.', 'No sales here for the flat types and period you picked.', 'Median price', 'Price per sq ft', 'Sales',
  'Blocks', 'Average price', 'Average per sq ft', 'Price per sq ft vs a year ago', 'More numbers', 'Clear', 'Draw again', 'Draw an area', 'Use a circle instead'];
