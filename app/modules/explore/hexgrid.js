// Explore map — zoomed-out hex grid (owner decision 2026-10-07): at zoom ≤ HEX_ZOOM_MAX the block dots give way
// to pointy-top hexagons ~HEX_M across, shaded on the SAME scale / bins the dots use for the colour mode, so the
// colours stay consistent when you zoom in. Zoom 14–16 dots and zoom ≥ 17 number boxes are unchanged (legacy.js).
// A hex aggregates exactly the blocks that would be drawn as dots (legacy `blockInfo`): blocks with a coloured dot
// ('sale') give the value; grey-only hexes ("no sales" / new blocks) are drawn as a light grey outline.
//   price / budget → median price over the matching TRANSACTIONS of those blocks (not a median of block medians)
//   psf            → median $psf over the matching transactions
//   count          → shade = median matching sales per block (the dots' scale is per block — a hex total would
//                    always land in the darkest bin); the tooltip gives the total
//   rent / commute → median of the block values (rent: block rent; commute: longer-of-two minutes per block)
//   budget colour  → the dots' within / near / over rule applied to the hex median; tooltip: "x of y blocks within"
// Pure helpers are exported for node tests (tests/explore/hexgrid.test.js); createHexGrid() is browser-only.

export const HEX_M = 500;             // flat-to-flat width = distance between neighbouring hex centres (UI choice)
export const HEX_ZOOM_MAX = 13;       // hexes at this zoom and below; dots from 14
export const HEX_CLICK_ZOOM = 15;     // clicking a hex zooms here, centred on it
export const HEX_FILL_OPACITY = 0.75;
export const HEX_GREY = '#c9c8c2';    // outline of hexes with blocks but no value (like the "no sales" dots)
export const SG_CENTRE = { lat: 1.3521, lon: 103.8198 };
const M_PER_DEG = 111320;
const KX = M_PER_DEG * Math.cos((SG_CENTRE.lat * Math.PI) / 180);
const SQRT3 = Math.sqrt(3);
/** Centre-to-corner radius of a pointy-top hex whose flat-to-flat width is `w`. */
export const hexSize = (w = HEX_M) => w / SQRT3;

/** Local equirectangular projection around the Singapore centre, metres (x east, y north). */
export const project = (lat, lon) => ({ x: (lon - SG_CENTRE.lon) * KX, y: (lat - SG_CENTRE.lat) * M_PER_DEG });
export const unproject = (x, y) => ({ lat: SG_CENTRE.lat + y / M_PER_DEG, lon: SG_CENTRE.lon + x / KX });

function cubeRound(fq, fr) {
  const fs = -fq - fr;
  let q = Math.round(fq), r = Math.round(fr);
  const s = Math.round(fs), dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
  return { q: q + 0, r: r + 0 }; // + 0 turns -0 into 0
}
/** Axial coordinates { q, r } of the pointy-top hex containing a point (deterministic). */
export function hexOf(lat, lon, w = HEX_M) {
  const { x, y } = project(lat, lon), size = hexSize(w);
  return cubeRound(((SQRT3 / 3) * x - y / 3) / size, ((2 / 3) * y) / size);
}
export const hexKey = (q, r) => `${q},${r}`;
/** Hex centre as { lat, lon }. */
export function hexCentre(q, r, w = HEX_M) {
  const size = hexSize(w);
  return unproject(size * SQRT3 * (q + r / 2), size * 1.5 * r);
}
/** The six corners as [lat, lon] (pointy-top: corners at −30°, 30°, 90°, …). */
export function hexCorners(q, r, w = HEX_M) {
  const size = hexSize(w), cx = size * SQRT3 * (q + r / 2), cy = size * 1.5 * r, out = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30), p = unproject(cx + size * Math.cos(a), cy + size * Math.sin(a));
    out.push([p.lat, p.lon]);
  }
  return out;
}
/** Distance in metres between two points on the local projection. */
export function metres(a, b) { const p = project(a.lat, a.lon), q = project(b.lat, b.lon); return Math.hypot(p.x - q.x, p.y - q.y); }

export function median(arr) {
  const a = arr.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const h = a.length >> 1;
  return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2;
}

/** Points by hex → Map(key → { q, r, points }). Points without a finite lat / lon are skipped. Holes allowed. */
export function binPoints(points, w = HEX_M) {
  const bins = new Map();
  for (const p of points || []) {
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const { q, r } = hexOf(p.lat, p.lon, w), k = hexKey(q, r);
    if (!bins.has(k)) bins.set(k, { q, r, points: [] });
    bins.get(k).points.push(p);
  }
  return bins;
}

/**
 * Aggregate the dots into hexes.
 * points: [{ lat, lon, kind: 'sale'|'none'|'new', a: { n, prices[], psfs[], price } | null, v }] (sparse ok) —
 *   `a` = the block's matching transactions in the calculation window, `v` = the block's colour value (rent / commute).
 * @returns {Map<string, { key, q, r, lat, lon, value, sales, blocks, total, within }>} value null = grey outline
 */
export function aggregateHexes(points, mode, { budgetMax = null, w = HEX_M } = {}) {
  const out = new Map();
  for (const [key, bin] of binPoints(points, w)) {
    const sale = bin.points.filter((p) => p.kind === 'sale' && p.a);
    let value = null, within = null;
    if (sale.length) {
      if (mode === 'price' || mode === 'budget') value = median(sale.flatMap((p) => p.a.prices || []));
      else if (mode === 'psf') value = median(sale.flatMap((p) => p.a.psfs || []));
      else if (mode === 'count') value = median(sale.map((p) => p.a.n));
      else value = median(sale.map((p) => p.v)); // rent, commute
      if (mode === 'budget' && budgetMax) within = sale.filter((p) => p.a.price <= budgetMax).length;
    }
    const c = hexCentre(bin.q, bin.r, w);
    out.set(key, { key, q: bin.q, r: bin.r, lat: c.lat, lon: c.lon, value, sales: sale.reduce((s, p) => s + (p.a.n || 0), 0), blocks: sale.length, total: bin.points.length, within });
  }
  return out;
}

/**
 * Fill colour for a hex value: the dots' scale (`scale.color`), or for budget the dots' within / near / over rule.
 * null → no fill (grey outline).
 */
export function hexFill(value, { mode, scale, budget } = {}) {
  if (value == null || !Number.isFinite(value)) return null;
  if (mode === 'budget') {
    if (!budget || !budget.max) return null;
    return value <= budget.max ? budget.colors.within : value <= budget.max * (1 + budget.stretch) ? budget.colors.near : budget.colors.over;
  }
  return scale ? scale.color(value) : null;
}

const money = (v) => 'S$' + Math.round(v).toLocaleString('en-SG');
const kilo = (v) => 'S$' + (v / 1000).toFixed(0) + 'k';
const plural = (tr, n, one, many) => tr(n === 1 ? one : many, [n.toLocaleString('en-SG')]);

/** Tooltip parts, e.g. ['Median S$612k', '48 sales', '23 blocks']. `tr` = t() from core/i18n. */
export function hexTipParts(h, mode, tr) {
  const sales = plural(tr, h.sales, '{0} sale', '{0} sales'), blocks = plural(tr, h.blocks, '{0} block', '{0} blocks');
  if (h.value == null) return [tr('No sales match your filters'), plural(tr, h.total, '{0} block', '{0} blocks')];
  if (mode === 'price') return [tr('Median {0}', [kilo(h.value)]), sales, blocks];
  if (mode === 'budget') return [tr('Median {0}', [kilo(h.value)]), sales, blocks].concat(h.within != null ? [tr('{0} of {1} blocks within budget', [h.within, h.blocks])] : []);
  if (mode === 'psf') return [tr('Median {0}', [tr('{0} psf', [money(h.value)])]), sales, blocks];
  if (mode === 'count') return [sales, blocks, tr('median {0} per block', [+h.value.toFixed(1)])];
  if (mode === 'rent') return [tr('Median rent {0}', [money(h.value)]), blocks];
  if (mode === 'commute') return [tr('Median {0}', [tr('~{0} min', [Math.round(h.value)])]), blocks];
  return [blocks];
}
export const hexTipText = (h, mode, tr) => hexTipParts(h, mode, tr).join(' · ');

/** Legend hint line at hex zoom ('' otherwise). */
export function hexHint(zoom, tr) {
  return zoom <= HEX_ZOOM_MAX ? `<div class="hint">${tr('Zoomed out: each hexagon ≈ {0} m, shaded by the median of the blocks inside. Zoom in for blocks.', [HEX_M])}</div>` : '';
}

// ------------------------------------------------------------------ browser part (Leaflet global passed in)
const PANE = 'hexGrid';
const INK = '#1b1b19';
const DRAG_PX = 6; // a press that moved further than this is a drag / sketch, not a click

/**
 * ctx: { L, map, t, esc, tip (the shared hover L.tooltip), parent (layers.blocks), busy() → true while picking /
 * circling / drawing, zoomTo(latlng), hovering() → true while the canvas has a hovered layer (POI glyphs win) }.
 * Hexes live in their own SVG pane under the shared canvas (z 385, below the flood areas at 390), never take
 * pointer events; hover / click are resolved from map events by axial rounding (hexOf), so POIs, pins and the
 * area tool on the canvas above keep working.
 * @returns {{ build(points, opts), show(zoom) → boolean, hint(zoom) → string }}
 */
export function createHexGrid({ L, map, t, esc, tip, parent, busy = () => false, zoomTo, hovering = () => false }) {
  if (!map.getPane(PANE)) { const p = map.createPane(PANE); p.style.zIndex = 385; p.style.pointerEvents = 'none'; }
  const svg = L.svg({ pane: PANE, padding: 0.5 });
  const group = L.layerGroup();
  let input = null, hexes = new Map(), dirty = false, on = false, hot = null, mode = 'price';
  let pointer = 'mouse', down = null;

  function draw() {
    dirty = false; unhover(); group.clearLayers();
    const { points, opts } = input; mode = opts.mode;
    hexes = aggregateHexes(points, mode, { budgetMax: opts.budget && opts.budget.max });
    const grey = [], filled = [];
    for (const h of hexes.values()) { h.fill = hexFill(h.value, opts); (h.fill ? filled : grey).push(h); }
    for (const h of grey.concat(filled)) { // grey under colour, like the dots
      h.style = h.fill
        ? { pane: PANE, renderer: svg, interactive: false, color: '#ffffff', weight: 1, opacity: 1, fillColor: h.fill, fillOpacity: HEX_FILL_OPACITY }
        : { pane: PANE, renderer: svg, interactive: false, color: HEX_GREY, weight: 1, opacity: 0.9, fill: false };
      h.layer = L.polygon(hexCorners(h.q, h.r), h.style).addTo(group);
    }
  }
  /** Once per renderBlocks: keep the dots' inputs; aggregation + polygons happen when the hexes are on screen. */
  function build(points, opts) { input = { points, opts }; dirty = true; if (on) draw(); }
  /** Per renderView: hexes on at zoom ≤ HEX_ZOOM_MAX (inside the blocks layer, so its switch hides them too). */
  function show(zoom) {
    const want = zoom <= HEX_ZOOM_MAX && !!input;
    if (want && dirty) draw();
    if (want && !parent.hasLayer(group)) parent.addLayer(group);
    if (!want && parent.hasLayer(group)) { unhover(); parent.removeLayer(group); }
    on = want;
    return want;
  }
  const live = () => on && map.hasLayer(group);
  const at = (ll) => { const { q, r } = hexOf(ll.lat, ll.lng); return hexes.get(hexKey(q, r)) || null; };
  function setHot(h) {
    if (h === hot) return;
    unhover();
    if (!h) return;
    hot = h;
    h.layer.setStyle({ color: INK, weight: 2, opacity: 1 }); h.layer.bringToFront();
    const [first, ...rest] = hexTipParts(h, mode, t);
    tip.setLatLng([h.lat, h.lon]).setContent(`<div class="poi-tip"><b>${esc(first)}</b>${rest.map((s) => ' · ' + esc(s)).join('')}</div>`);
    map.openTooltip(tip);
    map.getContainer().classList.add('hex-hot');
  }
  function unhover() {
    if (!hot) return;
    hot.layer.setStyle(hot.style); hot = null;
    map.closeTooltip(tip); map.getContainer().classList.remove('hex-hot');
  }

  const box = map.getContainer();
  box.addEventListener('pointerdown', (e) => { pointer = e.pointerType || 'mouse'; down = [e.clientX, e.clientY]; });
  box.addEventListener('pointermove', (e) => { if (e.pointerType) pointer = e.pointerType; });
  map.on('mousemove', (e) => {
    if (!live() || pointer !== 'mouse') return; // touch: compat mouse events must not pre-select (tap = tooltip)
    setHot(hovering() || busy() ? null : at(e.latlng));
  });
  box.addEventListener('mouseleave', unhover); map.on('zoomstart', unhover);
  map.on('click', (e) => {
    if (!live() || busy()) return;
    const o = e.originalEvent;
    if (down && o && Math.hypot(o.clientX - down[0], o.clientY - down[1]) > DRAG_PX) return;
    const h = at(e.latlng);
    if (!h) { unhover(); return; }
    if (pointer !== 'mouse' && hot !== h) { setHot(h); return; } // first tap: tooltip; second tap: zoom
    unhover();
    zoomTo([h.lat, h.lon], HEX_CLICK_ZOOM);
  });

  return { build, show, hint: (zoom) => (input ? hexHint(zoom, t) : ''), get hexes() { return hexes; } };
}
