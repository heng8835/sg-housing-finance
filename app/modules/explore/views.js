// Saved map views (roadmap PA-09): "Save this view" in the Explore panel keeps up to MAX_VIEWS named snapshots of the
// map — centre / zoom, colour mode, box labels, flat types, calculation window + sales-history years, More filters,
// towns, layers, drawn area, commute places + the commute filter (B8) — with Apply / Rename / Delete. Stored in the map's own save
// (localStorage 'hdb-comparer', S.views) so the sample sandbox and "Forget my data" cover it. A view never holds
// household data, the shortlist or daily places: captureView copies a fixed whitelist of map settings only.
// Also applies partial views from other tabs (bus 'explore:view' { view, fit } — Start here: flat types, towns, colour).
// Pure helpers (capture / clean / apply / list ops / markup) are node-tested; createViews() wires the browser part.
import { t } from '../../core/i18n.js';
import { esc } from '../../core/dom.js';
import { CALC_OPTIONS } from './period.js';
import { cleanMax } from './commute.js';

export const MAX_VIEWS = 10;
export const VIEW_NAME_MAX = 40;
export const VIEW_VERSION = 1;
export const FILT_KEYS = ['pmin', 'pmax', 'lmin', 'lmax', 'amin', 'amax', 'smin', 'smax', 'ymin', 'ymax'];
export const COLOR_MODES = ['price', 'psf', 'count', 'budget', 'rent', 'commute'];
const CHIP_LABELS = ['block', 'value'];
// sanity box around Singapore + Leaflet zoom range (map limits, not rules)
const GEO = { latMin: 1.1, latMax: 1.6, lonMin: 103.5, lonMax: 104.2 };
const ZOOM = { min: 8, max: 21 };
const POLY_MAX = 2000;           // freehand areas are thinned to ~4 px steps; more points than this = not ours
const YEAR = { min: 1960, max: 2100 };

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const r5 = (v) => Math.round(v * 1e5) / 1e5;
const inGeo = (lat, lon) => fin(lat) && fin(lon) && lat >= GEO.latMin && lat <= GEO.latMax && lon >= GEO.lonMin && lon <= GEO.lonMax;
const strList = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && x))] : null);

/** A drawn area { type: 'circle', lat, lon, r } | { type: 'poly', pts: [[lat, lon], …] }, cleaned; null if not one. */
export function cleanArea(A) {
  if (!isObj(A)) return null;
  if (A.type === 'circle' && inGeo(A.lat, A.lon) && fin(A.r) && A.r > 0) return { type: 'circle', lat: r5(A.lat), lon: r5(A.lon), r: Math.round(A.r) };
  if (A.type === 'poly' && Array.isArray(A.pts) && A.pts.length >= 3 && A.pts.length <= POLY_MAX
    && A.pts.every((p) => Array.isArray(p) && inGeo(p[0], p[1]))) return { type: 'poly', pts: A.pts.map(([a, b]) => [r5(a), r5(b)]) };
  return null;
}

/**
 * Snapshot of the map settings in S (legacy state) — only whitelisted map fields, never S.profile / choices /
 * workplaces. Flat types and towns are saved by name (indices can move when the data is rebuilt); towns = null = all.
 */
export function captureView(S, { flatTypes, towns, center, zoom }) {
  const allTowns = Array.isArray(S.towns) && S.towns.length === towns.length;
  return {
    v: VIEW_VERSION,
    center: center && inGeo(center.lat, center.lng ?? center.lon) ? [r5(center.lat), r5(center.lng ?? center.lon)] : null,
    zoom: fin(zoom) ? zoom : null,
    colorBy: COLOR_MODES.includes(S.colorBy) ? S.colorBy : 'price',
    chipLabel: CHIP_LABELS.includes(S.chipLabel) ? S.chipLabel : 'block',
    ft: (S.ft || []).map((i) => flatTypes[i]).filter(Boolean),
    calcM: S.calcM ?? null,
    hist: isObj(S.hist) ? { from: S.hist.from, to: S.hist.to } : null,
    filt: Object.fromEntries(FILT_KEYS.map((k) => [k, fin(S.filt && S.filt[k]) ? S.filt[k] : null])),
    towns: allTowns ? null : (S.towns || []).map((i) => towns[i]).filter(Boolean),
    layers: Object.fromEntries(Object.entries(S.layers || {}).filter(([, on]) => typeof on === 'boolean')),
    area: cleanArea(S.area),
    hubs: strList(S.commuteHubs) || [],
    commuteMax: cleanMax(S.commuteMax), // B8 "Only show blocks within N min" (null = Any)
  };
}

/**
 * Validate a view (saved, imported or partial). Unknown / malformed fields are dropped, so applying it only changes
 * what it really holds. Returns the cleaned view (possibly {}), or null when it is not an object.
 */
export function cleanView(raw) {
  if (!isObj(raw)) return null;
  const v = {};
  if (Array.isArray(raw.center) && inGeo(raw.center[0], raw.center[1]) && fin(raw.zoom) && raw.zoom >= ZOOM.min && raw.zoom <= ZOOM.max) {
    v.center = [r5(raw.center[0]), r5(raw.center[1])]; v.zoom = raw.zoom;
  }
  if (COLOR_MODES.includes(raw.colorBy)) v.colorBy = raw.colorBy;
  if (CHIP_LABELS.includes(raw.chipLabel)) v.chipLabel = raw.chipLabel;
  if (strList(raw.ft)) v.ft = strList(raw.ft);
  if (CALC_OPTIONS.includes(raw.calcM)) v.calcM = raw.calcM;
  if (isObj(raw.hist) && [raw.hist.from, raw.hist.to].every((y) => Number.isInteger(y) && y >= YEAR.min && y <= YEAR.max) && raw.hist.from <= raw.hist.to) v.hist = { from: raw.hist.from, to: raw.hist.to };
  if (isObj(raw.filt)) v.filt = Object.fromEntries(FILT_KEYS.map((k) => [k, fin(raw.filt[k]) ? raw.filt[k] : null]));
  if (raw.towns === null) v.towns = null; else if (strList(raw.towns)) v.towns = strList(raw.towns);
  if (isObj(raw.layers)) v.layers = Object.fromEntries(Object.entries(raw.layers).filter(([k, on]) => typeof on === 'boolean' && /^[a-z]\w{0,30}$/i.test(k)));
  if ('area' in raw) v.area = cleanArea(raw.area);
  if (strList(raw.hubs)) v.hubs = strList(raw.hubs).slice(0, 2);
  if ('commuteMax' in raw) v.commuteMax = cleanMax(raw.commuteMax);
  return v;
}

/**
 * Put a (cleaned) view into S. Only the fields the view holds change; names that are no longer in the data are
 * skipped; layer keys S does not know are ignored. Returns { center, zoom } to move the map to, or null.
 */
export function applyView(S, raw, { flatTypes, towns }) {
  const v = cleanView(raw);
  if (!v) return null;
  if (v.colorBy) S.colorBy = v.colorBy;
  if (v.chipLabel) S.chipLabel = v.chipLabel;
  if (v.ft) S.ft = flatTypes.map((f, i) => (v.ft.includes(f) ? i : -1)).filter((i) => i >= 0);
  if (v.calcM) S.calcM = v.calcM;
  if (v.hist) S.hist = { ...v.hist };
  if (v.filt) S.filt = { ...v.filt };
  if ('towns' in v) S.towns = v.towns === null ? towns.map((_, i) => i) : towns.map((x, i) => (v.towns.includes(x) ? i : -1)).filter((i) => i >= 0);
  if (v.layers) { S.layers = { ...(S.layers || {}) }; for (const [k, on] of Object.entries(v.layers)) if (k in S.layers) S.layers[k] = on; }
  if ('area' in v) S.area = v.area;
  if (v.hubs) S.commuteHubs = v.hubs.slice();
  if ('commuteMax' in v) S.commuteMax = v.commuteMax;
  return v.center ? { center: v.center, zoom: v.zoom } : null;
}

// ---------------------------------------------------------------- the saved list: [{ id, name, savedAt, view }]
const cleanName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, VIEW_NAME_MAX);

/** Well-formed entries only (first of an id wins), at most MAX_VIEWS, oldest first. */
export function cleanViews(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.filter((x) => isObj(x) && typeof x.id === 'string' && /^v\d+$/.test(x.id) && !seen.has(x.id) && seen.add(x.id) && isObj(x.view))
    .map((x) => ({ id: x.id, name: cleanName(x.name) || x.id, savedAt: typeof x.savedAt === 'string' ? x.savedAt : '', view: cleanView(x.view) }))
    .slice(0, MAX_VIEWS);
}

export const nextViewId = (list) => `v${list.reduce((m, x) => Math.max(m, +String(x.id).slice(1) || 0), 0) + 1}`;
export const isFull = (list) => cleanViews(list).length >= MAX_VIEWS;

/** Add a view; returns { list, id }, or null when MAX_VIEWS are saved already. A blank name → "View n". */
export function addView(list, view, name, savedAt) {
  const cur = cleanViews(list);
  if (cur.length >= MAX_VIEWS) return null;
  const id = nextViewId(cur);
  return { list: [...cur, { id, name: cleanName(name) || defaultName(cur.length + 1), savedAt: String(savedAt || ''), view: cleanView(view) }], id };
}
export function renameView(list, id, name) {
  const n = cleanName(name), cur = cleanViews(list);
  return n ? cur.map((x) => (x.id === id ? { ...x, name: n } : x)) : cur;
}
export const deleteView = (list, id) => cleanViews(list).filter((x) => x.id !== id);
export const defaultName = (n) => t('View {0}', [n]);

const MODE_NAMES = { price: 'Median price', psf: '$ per sqft', count: 'Number of transactions', budget: 'Within my budget', rent: 'Median rent', commute: 'Commute time (public transport)' };

/** One line under a view's name: colour mode · flat types · towns · area · filters. */
export function viewSummary(v) {
  const parts = [];
  if (v.colorBy) parts.push(t(MODE_NAMES[v.colorBy]));
  if (v.ft) parts.push(v.ft.length ? v.ft.map((f) => t(f)).join(', ') : t('no flat types'));
  if ('towns' in v) parts.push(v.towns === null ? t('all towns') : v.towns.length === 1 ? t('1 town') : t('{0} towns', [v.towns.length]));
  if (v.area) parts.push(v.area.type === 'circle' ? t('circle') : t('drawn area'));
  if (v.filt && Object.values(v.filt).some((x) => x != null)) parts.push(t('filters'));
  return parts.join(' · ');
}

/** The section's inner HTML. ui = { saving, editing: id | null, msg }. */
export function viewsHtml(list, { saving = false, editing = null, msg = '' } = {}) {
  const cur = cleanViews(list), full = cur.length >= MAX_VIEWS;
  const nameForm = (act, value, label) => `<form class="vw-form" data-vform="${act}"><label class="f"><span>${esc(label)}</span>
      <input type="text" maxlength="${VIEW_NAME_MAX}" value="${esc(value)}" data-vname autocomplete="off"></label>
      <div class="actions"><button type="submit" class="btn sm primary">${esc(t('Save'))}</button><button type="button" class="btn sm" data-v="cancel">${esc(t('Cancel'))}</button></div></form>`;
  const rows = cur.map((x) => (x.id === editing
    ? `<li class="vw-row">${nameForm(`rename:${x.id}`, x.name, t('New name'))}</li>`
    : `<li class="vw-row"><div class="vw-text"><b>${esc(x.name)}</b><small>${esc(viewSummary(x.view))}</small></div>
      <div class="vw-acts"><button type="button" class="btn sm" data-v="apply" data-id="${x.id}">${esc(t('Apply'))}</button>
      <button type="button" class="link" data-v="rename" data-id="${x.id}">${esc(t('Rename'))}</button>
      <button type="button" class="link" data-v="del" data-id="${x.id}" aria-label="${esc(t('Delete {0}', [x.name]))}">${esc(t('Delete'))}</button></div></li>`)).join('');
  return `<h3>${esc(t('Saved views'))}</h3>
    <p class="sec-sub">${esc(t('Keep a map setup to come back to: position, colours, flat types, years, filters, towns, layers and area. Your household is not included.'))}</p>
    ${cur.length ? `<ul class="vw-list">${rows}</ul>` : ''}
    ${saving ? nameForm('save', '', t('Name this view'))
    : `<div class="actions"><button type="button" class="btn sm" data-v="save"${full ? ' disabled aria-describedby="vwFull"' : ''}>${esc(t('Save this view'))}</button></div>
      ${full ? `<p class="hint" id="vwFull">${esc(t('Up to {0} views — delete one to save another.', [MAX_VIEWS]))}</p>` : ''}`}
    <p class="hint" aria-live="polite">${esc(msg)}</p>`;
}

/** Every English string this file shows (zh coverage test). */
export const viewStrings = () => [...Object.values(MODE_NAMES), 'View {0}', 'no flat types', 'all towns', '1 town', '{0} towns',
  'circle', 'drawn area', 'filters', 'Save', 'Cancel', 'New name', 'Apply', 'Rename', 'Delete {0}', 'Delete', 'Saved views',
  'Keep a map setup to come back to: position, colours, flat types, years, filters, towns, layers and area. Your household is not included.',
  'Name this view', 'Save this view', 'Up to {0} views — delete one to save another.', 'Showing “{0}”.', 'Saved “{0}”.',
  'Delete the saved view “{0}”?'];

// ---------------------------------------------------------------- browser
/**
 * ctx (from legacy.js): { S, D, map, bus, save, per (period: refresh()), fitTo(bounds), refresh() — redraw chips, towns,
 * layers, colour radios, filters, area, blocks }. Appends #secViews to the Explore tab.
 */
export function createViews({ S, D, map, bus, save, per, fitTo, refresh, doc = globalThis.document }) {
  const pane = doc.getElementById('tab-explore');
  if (!pane) return null;
  const sec = doc.createElement('div');
  sec.className = 'section'; sec.id = 'secViews';
  pane.append(sec);
  const ui = { saving: false, editing: null, msg: '' };
  S.views = cleanViews(S.views);
  const ctxData = () => ({ flatTypes: D.flat_types, towns: D.towns });

  function render(focusSel) {
    sec.innerHTML = viewsHtml(S.views, ui);
    if (focusSel) sec.querySelector(focusSel)?.focus();
  }

  function applyNow(view, { fit = false } = {}) {
    const to = applyView(S, view, ctxData());
    per?.refresh?.();
    refresh();
    if (to) map.setView(to.center, to.zoom, { animate: false });
    else if (fit && view && Array.isArray(view.towns)) {
      const on = new Set(S.towns), pts = D.blocks.filter((b) => on.has(b.t)).map((b) => [b.lat, b.lon]);
      if (pts.length) fitTo(globalThis.L.latLngBounds(pts).pad(0.05));
    }
    save();
  }

  sec.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    const id = b.dataset.id, item = S.views.find((x) => x.id === id);
    ui.msg = '';
    switch (b.dataset.v) {
      case 'save': ui.saving = true; ui.editing = null; return render('[data-vname]');
      case 'cancel': ui.saving = false; ui.editing = null; return render('[data-v="save"]');
      case 'rename': ui.editing = id; ui.saving = false; return render('[data-vname]');
      case 'apply': if (item) { applyNow(item.view); ui.msg = t('Showing “{0}”.', [item.name]); } return render();
      case 'del':
        if (item && confirm(t('Delete the saved view “{0}”?', [item.name]))) { S.views = deleteView(S.views, id); save(); }
        return render('[data-v="save"]');
      default: return undefined;
    }
  });
  sec.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target.closest('[data-vform]'), name = form.querySelector('[data-vname]').value;
    if (form.dataset.vform === 'save') {
      const view = captureView(S, { ...ctxData(), center: map.getCenter(), zoom: map.getZoom() });
      const r = addView(S.views, view, name, new Date().toISOString());
      if (r) { S.views = r.list; save(); ui.msg = t('Saved “{0}”.', [r.list.find((x) => x.id === r.id).name]); }
      ui.saving = false;
    } else {
      S.views = renameView(S.views, form.dataset.vform.slice('rename:'.length), name); save();
      ui.editing = null;
    }
    render('[data-v="save"]');
  });
  sec.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (ui.saving || ui.editing)) { e.preventDefault(); e.stopPropagation(); ui.saving = false; ui.editing = null; render('[data-v="save"]'); } });

  bus?.on('explore:view', ({ view, fit } = {}) => applyNow(view, { fit }));
  render();
  return { render, apply: applyNow };
}
