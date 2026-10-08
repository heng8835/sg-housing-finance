// Primary schools by MOE's P1 distance bands — shared by Plan → "Primary schools nearby (P1 priority)", the
// Compare / Brief "For the family" rows (modules/explore/familyrows.js) and the block card / school card (B3,
// modules/explore/card.js, schoolcard.js). Pure: no data access, no DOM.
// The bands come from policy `p1.distance.bands_km` (passed in); distances are straight-line (core/geo).
import { withinKm, nearest } from './geo.js';

/** Primary schools and mixed-level schools with a primary section count for P1 (same rule as the map). */
export const primaryLike = (s) => !!s && (s.lvl === 'PRIMARY' || /^PRIMARY|MIXED LEVEL \(P/.test(s.lvl || ''));

/** Band index of a distance: 0 = within the first band, 1 = between the first and second, … ; bands.length = outside. */
export function p1Band(km, bandsKm) {
  const i = bandsKm.findIndex((b) => km <= b);
  return i < 0 ? bandsKm.length : i;
}

/**
 * Schools around `at` by band → { near: [{ item, km }], second: [...], nearest: { item, km } | null }
 * near = within bandsKm[0], second = between bandsKm[0] and bandsKm[1] (each nearest first).
 */
export function schoolBands(schools, at, bandsKm) {
  const [b0, b1] = bandsKm;
  const all = withinKm(schools || [], at, b1);
  return { near: all.filter((x) => x.km <= b0), second: all.filter((x) => x.km > b0), nearest: nearest(schools || [], at) };
}

// Display name (same rule as Plan → Primary schools): the data is title-cased by tools/fetch_poi.py, which breaks
// acronyms ("Chij", "Acs") — put them back in capitals. Shared with the block card fold and the school card (B3).
const ACRONYMS = new Set(['CHIJ', 'ACS', 'SJI', 'MGS', 'SJC']);
export const schoolName = (s) => String(s ?? '').toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (m, a, c) => a + c.toUpperCase())
  .replace(/\b[A-Za-z]+\b/g, (w) => (ACRONYMS.has(w.toUpperCase()) ? w.toUpperCase() : w));

/**
 * HDB blocks within `km` of a point (a school) that have ever sold one of the user's flat types — nearest first (B3).
 * blocks: D.blocks ({ lat, lon }); blockTx[bi] = transaction ids; txFt[i] = flat-type index; ftSet = selected indices.
 * → [{ bi, km }]. Blocks with no resale yet are left out (their flat types are unknown).
 */
export function blocksNear(at, km, { blocks, blockTx, txFt, ftSet }) {
  const out = [];
  for (const { item, km: d } of withinKm(blocks.map((b, bi) => ({ b, bi })), at, km, (x) => x.b)) {
    if ((blockTx[item.bi] || []).some((i) => ftSet.has(txFt[i]))) out.push({ bi: item.bi, km: d });
  }
  return out;
}
