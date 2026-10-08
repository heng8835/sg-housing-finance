// Feature switches (DEC-015): the build default from ../config.js, narrowed at runtime by
// `?features=-btoData` (comma list; testing only). A URL can only switch a feature OFF — a public build has no
// data behind a switched-off feature, so turning it on from a URL would break the app.
// Every consumer asks feature(name) at use time; tests may set FEATURES[name] and restore it.
import { BUILD_FEATURES } from '../config.js';

/** '?features=-btoData,-x' → { btoData: false, x: false }. Tokens without a leading '-' are ignored. */
export function parseFeatureOverrides(search) {
  let raw = '';
  try { raw = new URLSearchParams(search || '').get('features') || ''; } catch { raw = ''; }
  const out = {};
  for (const tok of raw.split(',')) { const m = /^\s*-([A-Za-z]\w*)\s*$/.exec(tok); if (m) out[m[1]] = false; }
  return out;
}

/** Build switches with the runtime overrides applied (unknown names ignored; off stays off). */
export function resolveFeatures(build, search = '') {
  const out = { ...build };
  for (const k of Object.keys(parseFeatureOverrides(search))) if (k in out) out[k] = false;
  return out;
}

const pageSearch = () => { try { return globalThis.location?.search || ''; } catch { return ''; } };
/** The switches in force for this page load (mutable for tests only). */
export const FEATURES = resolveFeatures(BUILD_FEATURES, pageSearch());
/** true when the feature is on. Unknown names are off. */
export const feature = (name) => FEATURES[name] === true;

/**
 * Guide / tour targets that only make sense with a feature: when it is off the target counts as missing, so the
 * step's `fallback` and `if_missing` / `ifMissing` note apply (core/spotlight.js `locate`).
 */
// 7b B5 (K6 / O7): only the BTO project picker — the BTO card itself also exists with btoData off (typed price), so
// the BTO tour and guides can still point at it in the public build
export const FEATURE_TARGETS = { '[data-p="plan.btoId"]': 'btoData' };
export const targetOff = (sel) => !!sel && FEATURE_TARGETS[sel] != null && !feature(FEATURE_TARGETS[sel]);
