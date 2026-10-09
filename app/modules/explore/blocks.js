// Explore map — how HDB blocks are drawn (UI/UX review 2026-10-07, docs/specs/phase5-map-redesign.md):
// one calm blue scale (lighter = less, darker = more), overview dots sized by zoom, and from CHIP_ZOOM each
// block as a box with its number inside, on the shared canvas, with greedy collision placement.
// The pure helpers are exported for node tests; the canvas parts need Leaflet (global L) and run in the browser.

// ≥ 2:1 vs the grey tiles; RAMP[1] darkened #3f84d1 → #3077c7 (go-live D9, a11y audit 5a): its box label is white at
// 4.58:1 (was near-black ink at 4.46:1); the other steps are unchanged
export const RAMP = ['#6aa3dc', '#3077c7', '#2a66ad', '#1a4a8a', '#0e2d5c'];
export const CHIP_ZOOM = 17;
export const COLOR = { noSales: '#b5b4ae', newRing: '#6b6a65', ink: '#1b1b19', muted: '#6b6a65', noSalesChip: '#f1f0ec', newText: '#52514e' };

/** Equal-count bins over the values shown (each shade ≈ 1 in 5 blocks). */
export function quantileScale(values, ramp = RAMP) {
  const v = values.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  const breaks = ramp.slice(1).map((_, i) => q((i + 1) / ramp.length));
  return { ramp, breaks, min: v[0], max: v[v.length - 1], mid: q(0.5), color: (x) => ramp[binOf(breaks, x)] };
}

/** Fixed bins (e.g. commute minutes ≤20 / 21–30 / …): breaks are inclusive upper edges. */
export function fixedScale(breaks, ramp = RAMP) {
  return { ramp, breaks, fixed: true, min: null, max: null, mid: null, color: (x) => ramp[binOf(breaks, x)] };
}
const binOf = (breaks, x) => { let i = 0; while (i < breaks.length && x > breaks[i]) i++; return i; };

/** Round a legend tick for display: price to S$10k, $psf to S$10, rent to S$50, counts to 1. */
export function roundTick(v, mode) {
  const step = { price: 10000, psf: 10, rent: 50 }[mode] || 1;
  return Math.round(v / step) * step;
}

/**
 * Short box label for a value (zoomed-in "value" labels, G1): 612k · 1.05m · $540 · 19 · $2.9k · 35 min; no data → "–".
 * `tr` = t() from core/i18n (only the commute template is translated).
 */
export function shortValue(mode, v, tr) {
  if (v == null || !Number.isFinite(v)) return '–';
  if (mode === 'price' || mode === 'budget') { const k = Math.round(v / 1000); return k < 1000 ? `${k}k` : `${+(v / 1e6).toFixed(2)}m`; }
  if (mode === 'psf') return '$' + Math.round(v).toLocaleString('en-SG');
  if (mode === 'rent') return '$' + (v / 1000).toFixed(1) + 'k';
  if (mode === 'commute') return tr('{0} min', [Math.round(v)]);
  return String(Math.round(v));
}

/** The value-label button text for a colour mode (English key for t()). */
export const chipMetric = (mode) => ({ price: 'Price', budget: 'Price', psf: 'Price per sq ft', count: 'Sales', rent: 'Rent', commute: 'Minutes' }[mode] || 'Price');

/** Text colour on a fill: near-black on light fills, white on dark. The cut (relative luminance 0.203) is where both
 *  give the same contrast, so the label always gets the better of the two (a11y audit 5a; was 0.18). */
export const TEXT_ON_CUT = 0.203;
export function textOn(hex) {
  const n = parseInt(hex.slice(1), 16), ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2] > TEXT_ON_CUT ? COLOR.ink : '#ffffff';
}

/** Dot size by zoom band (Leaflet radii are pixels). kind: 'sale' | 'none' | 'new'. */
/** Dot size band: ≤ 12 · 13–14 · 15 · 16 (owner 2026-10-07: grow as you zoom in). */
export const dotBand = (zoom) => (zoom <= 12 ? 0 : zoom <= 14 ? 1 : zoom === 15 ? 2 : 3);

export function dotStyle(zoom, kind) {
  const band = dotBand(zoom);
  if (kind === 'none') return { radius: [1.5, 2.2, 3, 4][band], weight: 0, fillOpacity: [0.45, 0.5, 0.55, 0.6][band] };
  if (kind === 'new') return { radius: [2.5, 3.5, 4, 5.5][band], weight: [1.2, 1.5, 1.5, 2][band], fillOpacity: 0.9 };
  return { radius: [3, 4.5, 6.5, 9][band], weight: [0.5, 0.8, 1.2, 1.5][band], fillOpacity: [0.9, 0.92, 0.95, 0.95][band] };
}

/** Map icons (MRT, bus stop, schools, family layers…) grow with zoom: × this on their base radius. */
export function glyphScale(zoom) {
  return zoom <= 13 ? 0.9 : zoom === 14 ? 1.15 : zoom === 15 ? 1.4 : zoom === 16 ? 1.7 : zoom === 17 ? 2 : zoom === 18 ? 2.3 : 2.5;
}

/** Leaflet circleMarker options for a dot (moved from legacy.js): sale = colour + white ring, new = white + grey ring, none = faint grey. */
export function dotOptions(kind, fill, z, renderer) {
  const s = dotStyle(z, kind);
  if (kind === 'sale') return { renderer, radius: s.radius, color: '#fff', weight: s.weight, fillColor: fill, fillOpacity: s.fillOpacity };
  if (kind === 'new') return { renderer, radius: s.radius, color: COLOR.newRing, weight: s.weight, fillColor: '#fff', fillOpacity: s.fillOpacity }; // completed, no resale yet (MOP)
  return { renderer, radius: s.radius, stroke: false, fillColor: COLOR.noSales, fillOpacity: s.fillOpacity }; // no matching sales: faint but clickable
}

/** Box size for a label at a zoom. */
export function chipSize(textWidth, zoom) {
  const big = zoom >= CHIP_ZOOM + 1;
  const pad = big ? 5 : 4, h = big ? 18 : 16;
  return { w: Math.max(18, Math.ceil(textWidth) + pad * 2), h, font: big ? 12 : 11 };
}

/**
 * Greedy placement: items in priority order (highest first) get a full box unless it overlaps a box
 * already placed (inflated by `gap`); the rest become mini squares. `force` items always get a box.
 * @param {{ id:any, x:number, y:number, w:number, h:number, force?:boolean }[]} items screen px, centred
 * @returns {Map<any, 'chip'|'mini'>}
 */
export function placeChips(items, { gap = 2, cell = 32 } = {}) {
  const grid = new Map(), out = new Map();
  const keys = (r) => { const ks = []; for (let gx = Math.floor(r.x0 / cell); gx <= Math.floor(r.x1 / cell); gx++) for (let gy = Math.floor(r.y0 / cell); gy <= Math.floor(r.y1 / cell); gy++) ks.push(`${gx},${gy}`); return ks; };
  for (const it of items) {
    const r = { x0: it.x - it.w / 2 - gap, x1: it.x + it.w / 2 + gap, y0: it.y - it.h / 2 - gap, y1: it.y + it.h / 2 + gap };
    const ks = keys(r);
    const hit = !it.force && ks.some((k) => (grid.get(k) || []).some((o) => r.x0 < o.x1 && o.x0 < r.x1 && r.y0 < o.y1 && o.y0 < r.y1));
    if (hit) { out.set(it.id, 'mini'); continue; }
    out.set(it.id, 'chip');
    for (const k of ks) { if (!grid.has(k)) grid.set(k, []); grid.get(k).push(r); }
  }
  return out;
}

// ------------------------------------------------------------------ canvas (browser only)
let measureCtx = null;
const widths = new Map();
/** Text width in px for the chip font (cached per label + size). */
export function textWidth(text, font) {
  const key = `${font}|${text}`;
  if (widths.has(key)) return widths.get(key);
  measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
  measureCtx.font = `600 ${font}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const w = measureCtx.measureText(text).width; widths.set(key, w);
  return w;
}

const roundRect = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };

/**
 * Install the box marker on Leaflet's canvas renderer. Options: text, fill, kind ('sale'|'none'|'new'),
 * mode ('chip'|'mini'), font, w, h, selected, hover.
 * @returns {function(L.LatLng, object): L.CircleMarker} factory
 */
export function installChipMarker(L) {
  L.Canvas.include({
    _updateChip(layer) {
      if (!this._drawing || layer._empty()) return;
      const ctx = this._ctx, p = layer._point, o = layer.options;
      ctx.save();
      if (o.mode === 'mini') {
        const s = o.kind === 'sale' ? 8 : 5;
        roundRect(ctx, p.x - s / 2, p.y - s / 2, s, s, 2);
        ctx.globalAlpha = o.kind === 'sale' ? 1 : 0.6;
        ctx.fillStyle = o.kind === 'sale' ? o.fill : COLOR.noSales; ctx.fill();
        if (o.kind === 'sale') { ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.strokeStyle = o.hover ? COLOR.newText : '#fff'; ctx.stroke(); }
        ctx.restore(); return;
      }
      const scale = o.selected ? 1.15 : 1, w = o.w * scale, h = o.h * scale, x = p.x - w / 2, y = p.y - h / 2;
      if (o.selected) { roundRect(ctx, x - 3, y - 3, w + 6, h + 6, 6); ctx.lineWidth = 2; ctx.strokeStyle = COLOR.ink; ctx.stroke(); }
      roundRect(ctx, x, y, w, h, 4);
      ctx.fillStyle = o.kind === 'none' ? COLOR.noSalesChip : o.kind === 'new' ? '#ffffff' : o.fill; ctx.fill();
      ctx.lineWidth = o.kind === 'new' ? 1.5 : o.hover ? 1.5 : 1;
      ctx.strokeStyle = o.hover ? COLOR.newText : o.kind === 'none' ? COLOR.noSales : o.kind === 'new' ? COLOR.newRing : '#ffffff'; ctx.stroke();
      ctx.fillStyle = o.kind === 'none' ? COLOR.muted : o.kind === 'new' ? COLOR.newText : textOn(o.fill);
      ctx.font = `${o.selected ? 700 : o.kind === 'none' ? 500 : 600} ${Math.round(o.font * scale)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(o.text, p.x, p.y + 0.5);
      ctx.restore();
    },
  });
  const ChipMarker = L.CircleMarker.extend({
    _updatePath() { this._renderer._updateChip(this); },
    _containsPoint(pt) { // rectangle hit-test (a little larger than the mark)
      const o = this.options, w = (o.mode === 'mini' ? 10 : o.w * (o.selected ? 1.15 : 1)) / 2 + 2, h = (o.mode === 'mini' ? 10 : o.h * (o.selected ? 1.15 : 1)) / 2 + 2;
      return Math.abs(pt.x - this._point.x) <= w && Math.abs(pt.y - this._point.y) <= h;
    },
  });
  // radius only sizes the canvas redraw region — half the widest box side plus the selection outline
  return (latlng, o) => new ChipMarker(latlng, { ...o, radius: Math.max(o.w || 10, o.h || 10) * 0.6 + 6, weight: 0, interactive: true });
}

/**
 * Sync the "Labels on the boxes" switch (index.html #chipLabel): value button text follows the colour mode;
 * `off` (commute without a place) disables it and the boxes keep block numbers (the saved choice is kept).
 */
export function syncChipLabel(doc, { value, metric, off, zoomedIn, offText, helpText }) {
  const seg = doc && doc.getElementById('chipLabel'); if (!seg) return;
  const vb = doc.getElementById('chipLabelValue'), help = doc.getElementById('chipLabelHelp');
  vb.textContent = metric; vb.classList.toggle('is-off', !!off); vb.title = off ? offText : '';
  if (off) vb.setAttribute('aria-disabled', 'true'); else vb.removeAttribute('aria-disabled');
  const eff = off ? 'block' : value === 'value' ? 'value' : 'block';
  seg.querySelectorAll('button[data-v]').forEach((b) => { const on = b.dataset.v === eff; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
  if (help) { help.textContent = off ? offText : helpText; help.hidden = !off && zoomedIn; }
}

/**
 * Legend HTML for the current scale. `fmt` formats a value; `t` translates; `simple` hides inner ticks;
 * `chipLabel` = the metric name when the boxes show values (G1), else null. `tap` = phone wording ("Tap", no hover; P-22).
 */
export function legendHtml({ scale, mode, label, fmt, t, simple, zoomedIn, chipLabel, tap = false }) {
  const sw = `<div class="ramp ramp5">${scale.ramp.map((c) => `<i style="background:${c}"></i>`).join('')}</div>`;
  const lo = mode === 'count' ? t('Fewer') : mode === 'commute' ? t('Shorter trip') : t('Cheaper');
  const hi = mode === 'count' ? t('More') : mode === 'commute' ? t('Longer trip') : t('Pricier');
  const ticks = simple
    ? `<div class="ticks"><span>${lo}${scale.min != null ? ' ' + fmt(scale.min) : ''}</span><span>${hi}${scale.max != null ? ' ' + fmt(scale.max) : ''}</span></div>`
    : `<div class="ticks5">${scale.breaks.map((b, i) => `<span style="left:${((i + 1) * 100) / scale.ramp.length}%">${fmt(mode === 'commute' ? b : roundTick(b, mode))}</span>`).join('')}</div>`;
  const caption = simple
    ? (mode === 'count' ? t('Darker blue = more sales') : mode === 'commute' ? t('Lighter = quicker') : t('Darker blue = pricier'))
    : mode === 'count' ? t('Lighter = fewer sales · Darker = more · each shade ≈ 1 in 5 blocks shown')
      : mode === 'commute' ? t('Lighter = quicker · Darker = longer trip (model estimate)')
        : t('Lighter = cheaper · Darker = pricier · each shade ≈ 1 in 5 blocks shown');
  const key = zoomedIn
    ? `<span class="chipkey none">${chipLabel ? '–' : '221'}</span> ${t('No sales match your filters')} · <span class="chipkey new">${chipLabel ? '–' : '229'}</span> ${t('New block, no resale yet')}`
    : `<span class="dotkey none"></span> ${t('No sales match your filters')} · <span class="dotkey new"></span> ${t('New block, no resale yet')}`;
  const valueHint = zoomedIn && chipLabel ? `<div class="hint">${t(tap ? 'Box labels show {0}, rounded. Tap a block for the exact value.' : 'Box labels show {0}, rounded. Hover for the exact value.', [chipLabel])}</div>` : '';
  return `<div class="key">${label}</div>${sw}${ticks}<div class="hint">${caption}</div><div class="hint">${key} · ${t(tap ? 'Tap any block.' : 'Click any block.')}</div>${valueHint}`;
}
