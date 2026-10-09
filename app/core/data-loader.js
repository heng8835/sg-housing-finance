// Loads the generated data files (classic scripts that set window.HDB_* globals).
// Resolves when all have run; rejects naming the first file that failed.
// Lazy data (S1b, hdb-data-pipeline/docs/specs/lazy-data.md): main.js loads MAP_FILES before the map starts and the
// rest (lateFiles) right after the first map paint; every file is fetched at most once (loadData memoises).
import { feature } from './features.js';

const loading = new Map(); // src → Promise (one <script> per file, shared by every caller)

const loadScript = (src) => {
  if (!loading.has(src)) loading.set(src, new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = false; // keep execution order stable
    el.onload = () => resolve(src);
    el.onerror = () => reject(new Error(`could not load ${src}`));
    document.head.appendChild(el);
  }));
  return loading.get(src);
};

export function loadScripts(srcs, onProgress = () => {}) {
  let done = 0;
  onProgress(done, srcs.length);
  return Promise.all(srcs.map((src) => loadData(src)
    .then(() => onProgress(++done, srcs.length, src))));
}

const settled = new Set(); // files whose <script> has loaded or failed
/** One data file (memoised). Optional files resolve even when missing — the feature hides itself with a note. */
export const loadData = (src) => loadScript(src)
  .finally(() => settled.add(src))
  .catch((err) => { if (OPTIONAL_FILES.has(src)) return src; throw err; });
/** true once the file has loaded or failed (a feature waiting for it can stop showing "Loading…"). */
export const isSettled = (src) => settled.has(src);

/**
 * Request all of `srcs` at once (they run in list order) and call onFile(src, ok) as each one settles — main.js
 * re-checks derived files and tells the views (bus 'data:more'). Resolves with [ok…] once all have settled; never rejects.
 */
export function loadLate(srcs, onFile = () => {}) {
  return Promise.all(srcs.map((src) => loadScript(src)
    .then(() => true, () => false)
    .then((ok) => { settled.add(src); onFile(src, ok); return ok; })));
}

// Phase 5 data: when missing, the app still starts (commute mode / family layers show a note instead).
// Phase 6 data (market.js: RPI, land use, catalysts for the future-value scorecard) is optional too.
// data/flood.js (PUB flood-prone points, split out of family.js — private build only) is optional as well.
// poi.js / bus_routes.js / rents.js are loaded after the first map paint; a missing one is shown as "missing".
export const OPTIONAL_FILES = new Set(['data/commute.js', 'data/family.js', 'data/flood.js', 'data/market.js']);

export const DATA_FILES_ALL = ['data/data.js', 'data/poi.js', 'data/bus_routes.js', 'data/future_rail.js', 'data/bto.js', 'data/rents.js', 'data/commute.js', 'data/family.js', 'data/flood.js', 'data/market.js'];
// Data that belongs to a feature switch (core/features.js, DEC-015): not loaded — and not in the offline copy
// (tools/build_sw_manifest.py reads this map + app/config.js) — when the feature is off.
export const FEATURE_FILES = { 'data/bto.js': 'btoData', 'data/flood.js': 'floodData' };
/** The files to load with these switches. */
export const dataFilesFor = (on = feature) => DATA_FILES_ALL.filter((f) => !FEATURE_FILES[f] || on(FEATURE_FILES[f]));
export const DATA_FILES = dataFilesFor();

// ---- what the first map screen needs (S1b): blocks + MRT (data.js), future MRT (default layer), and the small
// files whose map code is built once at start (BTO layer, family & flood layers: ~75 KB gzipped together).
export const MAP_FILES_ALL = ['data/data.js', 'data/future_rail.js', 'data/bto.js', 'data/family.js', 'data/flood.js'];
/** Loaded after the first map paint, in this order: primary schools (a default layer) first, bus routes last. */
export const LATE_ORDER = ['data/poi.js', 'data/rents.js', 'data/market.js', 'data/commute.js', 'data/bus_routes.js'];
/** First-screen files with these switches (a subset of dataFilesFor). */
export const mapFilesFor = (on = feature) => dataFilesFor(on).filter((f) => MAP_FILES_ALL.includes(f));
/** Every other file with these switches, LATE_ORDER first (a file added to DATA_FILES_ALL later lands here too). */
export const lateFilesFor = (on = feature) => {
  const rest = dataFilesFor(on).filter((f) => !MAP_FILES_ALL.includes(f));
  return [...LATE_ORDER.filter((f) => rest.includes(f)), ...rest.filter((f) => !LATE_ORDER.includes(f))];
};
export const MAP_FILES = mapFilesFor();
export const LATE_FILES = lateFilesFor();
