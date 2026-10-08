/* Family & health map layers (Phase 5, spec phase5-map-redesign AC 8): ECDA childcare vacancies,
   polyclinics, CHAS clinics from data/family.js (window.HDB_FAMILY) and PUB flood-prone points from data/flood.js
   (window.HDB_FLOOD, private build only — feature floodData), both built by tools/fetch_family_health.py and merged
   by familyData(). All layers are off by default (legacy.js `defaults().layers`).
   Pure helpers first (tests/explore/family.test.js); mountFamily() is browser-only (Leaflet, canvas). */
import { nearest, distanceKm } from '../../core/geo.js';
import { feature } from '../../core/features.js';
import { glyphScale } from './blocks.js';

// UI heuristics — not policy values
export const FLOOD_NEAR_M = 300;    // the block popup mentions a flood-prone point this close or closer
export const FLOOD_RING_M = 30;     // circle drawn around each flood-prone point…
export const FLOOD_RING_ZOOM = 14;  // …and the points themselves, from this zoom
export const FLOOD_AREA_ZOOM_MAX = 13; // at this zoom and below: shaded areas only (phase5-accept1-design §6)
export const FLOOD_AREA = { linkM: 400, padM: 200, minR: 250, maxR: 1200 }; // UI heuristic for the shaded areas
export const CLINIC_ZOOM = 15;      // CHAS clinics (~1,900 points) only at street zoom
export const CHAS_AS_OF = '2024';   // the MOH CHAS Clinics file on data.gov.sg is a 2024 extract
export const FAMILY_KEYS = ['childcare', 'polyclinics', 'clinics', 'flood'];
const FLOOD_SOURCES = ['flood', 'geocoding (flood junctions)']; // source rows that come with data/flood.js

/** true when the flood-prone points may be used (feature floodData, core/features.js). */
export const floodOn = () => feature('floodData');
/**
 * HDB_FAMILY with HDB_FLOOD's points + source rows merged in while floodOn — else without any flood points / PUB
 * source rows (an older family.js may still carry them). null when neither file is loaded.
 */
export function familyData(fam = globalThis.HDB_FAMILY || null, flood = globalThis.HDB_FLOOD || null, on = floodOn()) {
  const withFlood = on && flood && Array.isArray(flood.flood);
  if (!fam && !withFlood) return null;
  const base = fam || {}, out = { ...base };
  const sources = (Array.isArray(base.sources) ? base.sources : []).filter((s) => !FLOOD_SOURCES.includes(s && s.layer));
  if (withFlood) {
    out.flood = flood.flood;
    out.sources = sources.concat(Array.isArray(flood.sources) ? flood.sources : []);
  } else if (on && Array.isArray(base.flood)) {
    out.sources = base.sources; // older single-file family.js: unchanged
  } else {
    delete out.flood;
    out.sources = sources;
  }
  return out;
}

// vac strings (generator's VAC_CODE): one char per month, [0] = ECDA's current month.
// A available · L limited · F full · - not offered that month · ? unknown
export function centreStatus(vac) {
  const now = Object.values(vac || {}).map((s) => String(s || '')[0]).filter((c) => c && c !== '-');
  if (now.includes('A')) return 'available';
  if (now.includes('L')) return 'limited';
  if (now.includes('F')) return 'full';
  return 'unknown';
}
/** Full centres (no place in any offered level this month) are drawn faded. */
export const isFaded = (centre) => centreStatus(centre && centre.vac) === 'full';
/** Months from now until the first month with places (A or L) for one level, or -1. */
export function nextOpening(s) {
  const v = String(s || '');
  for (let i = 1; i < v.length; i++) if (v[i] === 'A' || v[i] === 'L') return i;
  return -1;
}
export const roundMetres = (m) => Math.max(10, Math.round(m / 10) * 10);
/** Nearest flood-prone point within maxM metres of `at` ({lat, lon}) → { p, m } (m rounded to 10 m), else null. */
export function nearestFlood(points, at, maxM = FLOOD_NEAR_M) {
  const n = nearest(points || [], at);
  if (!n) return null;
  const m = n.km * 1000;
  return m <= maxM ? { p: n.item, m: roundMetres(m) } : null;
}
/**
 * Shaded flood areas: single-linkage clusters of points ≤ linkM apart, a circle at each cluster's centroid with
 * r = clamp(farthest member + padM, minR, maxR) → [{ lat, lon, r, n }] (metres). Approximate — not flood extents.
 */
export function floodAreas(points, { linkM, padM, minR, maxR } = FLOOD_AREA) {
  const pts = (points || []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon));
  const up = pts.map((_, i) => i);
  const root = (i) => { while (up[i] !== i) { up[i] = up[up[i]]; i = up[i]; } return i; };
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (distanceKm(pts[i], pts[j]) * 1000 <= linkM) { const a = root(i), b = root(j); if (a !== b) up[Math.max(a, b)] = Math.min(a, b); }
    }
  }
  const groups = new Map();
  pts.forEach((p, i) => { const r = root(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(p); });
  return [...groups.values()].map((g) => {
    const c = { lat: g.reduce((s, p) => s + p.lat, 0) / g.length, lon: g.reduce((s, p) => s + p.lon, 0) / g.length };
    const far = Math.max(...g.map((p) => distanceKm(c, p) * 1000));
    return { lat: c.lat, lon: c.lon, r: Math.round(Math.min(maxR, Math.max(minR, far + padM))), n: g.length };
  });
}

/** Family layers with no data (the whole file missing → all of them). */
export function missingLayers(fam) {
  if (!fam) return FAMILY_KEYS.slice();
  return FAMILY_KEYS.filter((k) => !Array.isArray(fam[k]) || !fam[k].length);
}
// which generator source rows (`sources[].layer`) back each map layer; positions/geocoding go in a shared footnote
const MAIN_SRC = { childcare: ['childcare'], polyclinics: ['polyclinics'], clinics: ['clinics'], flood: ['flood'] };
const POS_SRC = { childcare: ['childcare (positions)', 'geocoding'], polyclinics: ['geocoding'], clinics: [], flood: ['geocoding (flood junctions)', 'geocoding'] };
/** Source rows for the layers that are on: { main: [{ key, s }], pos: [s] } (pos deduplicated, in data order). */
export function sourcesFor(sources, keys) {
  const list = Array.isArray(sources) ? sources : [];
  const main = [], posWant = new Set(), pos = [];
  for (const k of keys) {
    for (const s of list) if ((MAIN_SRC[k] || []).includes(s.layer)) main.push({ key: k, s });
    (POS_SRC[k] || []).forEach((l) => posWant.add(l));
  }
  for (const s of list) if (posWant.has(s.layer) && !pos.some((x) => x.url === s.url)) pos.push(s);
  return { main, pos };
}

// ------------------------------------------------------------------ browser part
const LEVELS = { inf: 'Infant (2–18 months)', pg: 'Playgroup', n1: 'Nursery 1', n2: 'Nursery 2', k1: 'Kindergarten 1', k2: 'Kindergarten 2' };
const KINDS = { cc: 'Child care centre', kg: 'Kindergarten', ds: 'Child care + kindergarten', eyc: 'Early Years Centre' };
const CODES = { A: 'Available', L: 'Limited', F: 'Full', '-': 'Not offered this month', '?': 'Unknown' };
const NOW = { available: 'Places available now', limited: 'Limited places now', full: 'Full now', unknown: 'Vacancy not reported' };
const NAMES = { childcare: 'Childcare vacancies', polyclinics: 'Polyclinics', clinics: 'CHAS clinics', flood: 'Flood-prone points' };
const CROSS = 'M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5z';
const DROP = 'M12 2.5c-4.9 4.4-7.4 8.2-7.4 11.4a7.4 7.4 0 0 0 14.8 0c0-3.2-2.5-7-7.4-11.4z';
const KID = 'M12 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm-2 4.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm4 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM9 9.5h6a3 3 0 0 1-6 0zM4 21a8 8 0 0 1 16 0v1H4v-1z';
// calm, muted colours; only the polyclinic cross is crimson (spec)
const G = {
  childcare: { d: KID, color: '#3f8a6f', r: 6.5 },
  ccFull: { d: KID, color: '#8f9893', r: 6, alpha: 0.5 },
  polyclinics: { d: CROSS, color: '#b0203a', r: 8.5, inverse: true },
  clinics: { d: CROSS, color: '#9c5f6b', r: 5 },
  flood: { d: DROP, color: '#56677a', r: 6.5 },
};
const SLATE = G.flood.color;

export function mountFamily({ L, map, canvas, t, esc, fam = familyData(), flood = floodOn() }) {
  const has = (k) => !!fam && Array.isArray(fam[k]) && fam[k].length > 0;
  const missing = missingLayers(fam).filter((k) => flood || k !== 'flood'); // switched off: hidden, not "missing"
  const ecda = has('childcare');
  const layers = { polyclinics: L.layerGroup(), clinics: L.layerGroup(), flood: L.layerGroup() };
  if (!flood) { delete layers.flood; document.querySelector('#layers input[data-l="flood"]')?.closest('label')?.remove(); } // layer + legend row
  if (ecda) layers.childcare = L.layerGroup(); // replaces the vacancy-less POI childcare layer

  Object.values(G).forEach((g) => { g.path = g.path || new Path2D(g.d); });
  if (!L.Canvas.prototype._updateFamGlyph) {
    L.Canvas.include({
      _updateFamGlyph(layer) {
        if (!this._drawing || layer._empty()) return;
        const ctx = this._ctx, p = layer._point, r = layer._radius, g = layer.options.glyph, col = g.color;
        ctx.save(); ctx.globalAlpha = g.alpha || 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 1, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); // white ring / disc
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        if (g.inverse) { ctx.lineWidth = 1.5; ctx.strokeStyle = col; ctx.stroke(); } else { ctx.fillStyle = col; ctx.fill(); }
        const k = (r * 1.55) / 24; ctx.translate(p.x - r * 0.775, p.y - r * 0.775); ctx.scale(k, k);
        ctx.fillStyle = g.inverse ? col : '#fff'; ctx.fill(g.path);
        ctx.restore();
      },
    });
  }
  const FamMarker = L.CircleMarker.extend({
    _project() { this._radius = this.options.radius * glyphScale(this._map.getZoom()); L.CircleMarker.prototype._project.call(this); }, // bigger when zoomed in
    _updatePath() { this._renderer._updateFamGlyph(this); },
  });
  const mark = (g, p) => new FamMarker([p.lat, p.lon], { renderer: canvas, radius: g.r, glyph: g, interactive: true });
  const tip = (html) => `<div class="poi-tip">${html}</div>`;
  const pop = (title, sub, body = '') => `<div class="pop"><h4>${esc(title)}</h4><div class="sub">${sub}</div>${body}</div>`;

  // childcare: one row per offered level — this month + when places next open
  function childcarePopup(c) {
    const st = centreStatus(c.vac);
    const sub = [t(KINDS[c.kind] || KINDS.cc), c.spark ? t('SPARK-certified') : '', t(NOW[st])].filter(Boolean).join(' · ');
    const rows = Object.keys(LEVELS).filter((lv) => c.vac && c.vac[lv]).map((lv) => {
      const s = c.vac[lv], now = s[0], nx = nextOpening(s);
      const later = now === 'A' ? '' : nx === 1 ? t('places next month') : nx > 1 ? t('places in {0} months', [nx]) : '—';
      return `<tr><td>${t(LEVELS[lv])}</td><td>${t(CODES[now] || CODES['?'])}</td><td>${later}</td></tr>`;
    }).join('');
    const table = rows ? `<table><tr><th>${t('Level')}</th><th>${t('This month')}</th><th>${t('Later (next 6 months)')}</th></tr>${rows}</table>` : '';
    const note = c.upd ? t('Vacancies as reported to ECDA (updated {0}). Please check with the centre.', [esc(c.upd)]) : t('Vacancies as reported to ECDA. Please check with the centre.');
    return pop(c.n, sub, `${table}<div class="hint" style="margin-top:6px">${note}</div>`);
  }

  if (ecda) {
    const cc = fam.childcare.slice().sort((a, b) => isFaded(b) - isFaded(a)); // full (faded) underneath
    cc.forEach((c) => mark(isFaded(c) ? G.ccFull : G.childcare, c)
      .bindTooltip(() => tip(`<b>${esc(c.n)}</b><br>${t(NOW[centreStatus(c.vac)])}`))
      .bindPopup(() => childcarePopup(c), { maxWidth: 340 }).addTo(layers.childcare));
  }
  if (has('polyclinics')) fam.polyclinics.forEach((p) => mark(G.polyclinics, p)
    .bindTooltip(() => tip(`<b>${esc(p.n)}</b><br>${t('Polyclinic')}`))
    .bindPopup(() => pop(p.n, t('Polyclinic — government primary care (subsidised)'))).addTo(layers.polyclinics));
  if (has('clinics')) fam.clinics.forEach((p) => mark(G.clinics, p)
    .bindTooltip(() => tip(`<b>${esc(p.n)}</b><br>${t('CHAS GP clinic')}`))
    .bindPopup(() => pop(p.n, t('CHAS GP clinic') + (p.cdmp ? ' · ' + t('also in the Chronic Disease Management Programme') : ''),
      `<div class="hint" style="margin-top:6px">${t('Clinic list as of {0} — check with the clinic before visiting.', [CHAS_AS_OF])}</div>`)).addTo(layers.clinics));

  // flood: shaded areas up to zoom 13 (own SVG pane under the block dots, never takes clicks);
  // from zoom 14 the slate drops + 30 m circles (drops stay on top)
  const drops = L.layerGroup(), rings = L.layerGroup(), areas = L.layerGroup();
  if (has('flood')) {
    if (!map.getPane('floodAreas')) { const pane = map.createPane('floodAreas'); pane.style.zIndex = 390; pane.style.pointerEvents = 'none'; }
    const svg = L.svg({ pane: 'floodAreas' });
    floodAreas(fam.flood).forEach((a) => L.circle([a.lat, a.lon], { pane: 'floodAreas', renderer: svg, radius: a.r, color: SLATE, opacity: 0.8, weight: 1.5, dashArray: '5 4', fillColor: SLATE, fillOpacity: 0.16, interactive: false }).addTo(areas));
    fam.flood.forEach((p) => {
      L.circle([p.lat, p.lon], { renderer: canvas, radius: FLOOD_RING_M, color: SLATE, weight: 1, fillColor: SLATE, fillOpacity: 0.12, interactive: false }).addTo(rings);
      mark(G.flood, p).bindTooltip(() => tip(`<b>${esc(p.n)}</b><br>${t('Flood-prone area (PUB)')}`))
        .bindPopup(() => pop(p.n, p.asOf ? t('PUB flood-prone area (list as of {0})', [esc(p.asOf)]) : t('Flood-prone area (PUB)'),
          `<div class="hint" style="margin-top:6px">${t('Approximate road / junction position — not the extent of flooding.')}</div>`)).addTo(drops);
    });
  }
  const show = (g, on) => { if (on && !layers.flood.hasLayer(g)) layers.flood.addLayer(g); if (!on && layers.flood.hasLayer(g)) layers.flood.removeLayer(g); };
  function syncFlood() {
    const z = map.getZoom(), pts = z >= FLOOD_RING_ZOOM, hadDrops = layers.flood.hasLayer(drops);
    show(areas, z <= FLOOD_AREA_ZOOM_MAX); show(rings, pts); show(drops, pts);
    if (pts && hadDrops) drops.eachLayer((m) => m.bringToFront());
  }
  if (flood) { map.on('zoomend', syncFlood); syncFlood(); }

  const swatch = (g) => `<svg width="14" height="14" viewBox="0 0 24 24" style="vertical-align:middle;flex:none" aria-hidden="true">${g.inverse
    ? `<circle cx="12" cy="12" r="11" fill="#fff" stroke="${g.color}" stroke-width="2"/><g transform="translate(3 3) scale(.75)"><path d="${g.d}" fill="${g.color}"/></g>`
    : `<circle cx="12" cy="12" r="12" fill="${g.color}"/><g transform="translate(3 3) scale(.75)"><path d="${g.d}" fill="#fff"/></g>`}</svg>`;
  const labelOf = (k) => { const i = document.querySelector(`#layers input[data-l="${k}"]`); return i && i.closest('label'); };

  /** Layer-list swatches + hide layers without data. Call after legacy has drawn its own swatches. */
  function decorate() {
    for (const k of ['polyclinics', 'clinics'].concat(flood ? ['flood'] : [], ecda ? ['childcare'] : [])) {
      const lbl = labelOf(k), sw = lbl && lbl.querySelector('.sw, svg');
      if (sw) sw.outerHTML = swatch(G[k]);
    }
    for (const k of missing) { if (k !== 'childcare') { const lbl = labelOf(k); if (lbl) lbl.style.display = 'none'; } } // .check sets display, so [hidden] alone loses
    const hint = document.getElementById('ccVacHint'); if (hint) hint.hidden = !ecda;
  }

  const fmtSrc = (s, asOf) => [esc(s.publisher || ''), asOf ? t('as of {0}', [esc(asOf)]) : '',
    s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.licence || s.url)}</a>` : esc(s.licence || '')].filter(Boolean).join(' · ');
  /** Sources / licences for the family layers that are on, plus the missing-data note. */
  function sync(state) {
    const el = document.getElementById('familySrc'); if (!el) return;
    const parts = [];
    const gone = missing.filter((k) => k !== 'childcare');
    if (gone.length) parts.push(`<div>${t('Family & health data not available — hidden: {0}.', [gone.map((k) => t(NAMES[k])).join(', ')])}${ecda ? '' : ' ' + t('Childcare shows centres without vacancies.')}</div>`);
    const on = FAMILY_KEYS.filter((k) => state && state[k] && has(k));
    if (on.includes('flood')) parts.push(`<div>${t('Shaded areas are drawn around PUB flood-prone points — approximate, not flood extents.')}</div>`);
    if (on.length) {
      const { main, pos } = sourcesFor(fam.sources, on);
      const lines = main.map(({ key, s }) => `<div><b>${t(NAMES[key])}</b>: ${fmtSrc(s, key === 'clinics' ? CHAS_AS_OF : s.asOf)}</div>`);
      if (pos.length) lines.push(`<div><b>${t('Positions')}</b>: ${pos.map((s) => fmtSrc(s)).join('; ')}</div>`);
      parts.push(`<div style="margin-top:4px"><b>${t('Sources')}</b></div>${lines.join('')}`);
    }
    el.innerHTML = parts.join('');
    el.hidden = !parts.length;
  }

  /** Block popup line, or '' when no flood-prone point is within FLOOD_NEAR_M. */
  function floodLine(b) {
    const f = has('flood') && nearestFlood(fam.flood, b);
    return f ? `<span style="color:${SLATE}">${t('Flood-prone point {0} m away', [f.m])} (${esc(f.p.n)}, ${t('PUB')})</span>` : '';
  }

  return { layers, ecdaChildcare: ecda, zoomGated: { clinics: CLINIC_ZOOM }, layerNames: { clinics: 'CHAS clinics' }, decorate, sync, floodLine, data: fam }; // data = familyData() (compare rows)
}
