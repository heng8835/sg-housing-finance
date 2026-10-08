// Loads the generated data files (classic scripts that set window.HDB_* globals).
// Resolves when all have run; rejects naming the first file that failed.
import { feature } from './features.js';

const loadScript = (src) => new Promise((resolve, reject) => {
  const el = document.createElement('script');
  el.src = src;
  el.async = false; // keep execution order stable
  el.onload = () => resolve(src);
  el.onerror = () => reject(new Error(`could not load ${src}`));
  document.head.appendChild(el);
});

export function loadScripts(srcs, onProgress = () => {}) {
  let done = 0;
  onProgress(done, srcs.length);
  return Promise.all(srcs.map((src) => loadScript(src)
    .catch((err) => { if (OPTIONAL_FILES.has(src)) return src; throw err; }) // optional layer data: feature hides itself with a note
    .then(() => onProgress(++done, srcs.length, src))));
}

// Phase 5 data: when missing, the app still starts (commute mode / family layers show a note instead).
// Phase 6 data (market.js: RPI, land use, catalysts for the future-value scorecard) is optional too.
// data/flood.js (PUB flood-prone points, split out of family.js — private build only) is optional as well.
export const OPTIONAL_FILES = new Set(['data/commute.js', 'data/family.js', 'data/flood.js', 'data/market.js']);

export const DATA_FILES_ALL = ['data/data.js', 'data/poi.js', 'data/bus_routes.js', 'data/future_rail.js', 'data/bto.js', 'data/rents.js', 'data/commute.js', 'data/family.js', 'data/flood.js', 'data/market.js'];
// Data that belongs to a feature switch (core/features.js, DEC-015): not loaded — and not in the offline copy
// (tools/build_sw_manifest.py reads this map + app/config.js) — when the feature is off.
export const FEATURE_FILES = { 'data/bto.js': 'btoData', 'data/flood.js': 'floodData' };
/** The files to load with these switches. */
export const dataFilesFor = (on = feature) => DATA_FILES_ALL.filter((f) => !FEATURE_FILES[f] || on(FEATURE_FILES[f]));
export const DATA_FILES = dataFilesFor();
