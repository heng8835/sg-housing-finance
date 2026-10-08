// The place tagged "Parents' or child's home" in My choices → Daily places (Phase 7b B12), as Afford, Compare and the
// brief need it: the Explore module mirrors it into the store as household.parentsPlace = { lat, lon, name } (local
// only, like every daily place). parentsKm() is the straight-line distance from a flat that planPurchase() takes as
// flat.parentsKm, so the Proximity Housing Grant "near" is decided per flat (engine/grants.js phgNear).
import { distanceKm } from './geo.js';
import { data } from './data.js';

/** The tagged place in a household slice, or null (malformed values count as none). */
export function parentsPlaceOf(h) {
  const p = h && h.parentsPlace;
  return p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? p : null;
}

/** Straight-line km from a point { lat, lon } to the household's tagged place; null without one. */
export function parentsKm(h, at) {
  const p = parentsPlaceOf(h);
  return p && at && Number.isFinite(at.lat) && Number.isFinite(at.lon) ? distanceKm(p, at) : null;
}

/** Same for a focus / effective flat (Afford): its block by `bid`; a typical flat has no place → null. */
export function parentsKmFor(h, flat) {
  const b = flat && flat.bid != null ? data.block(flat.bid) : null;
  return b ? parentsKm(h, b) : null;
}

/** planPurchase() flat input plus parentsKm — only when a place is tagged, so every other input stays identical. */
export const withParents = (flat, km) => (km == null ? flat : { ...flat, parentsKm: km });
