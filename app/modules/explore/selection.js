// Explore → other tabs: what the map is showing (hdb-data-pipeline/docs/specs/phase5-accept1-design.md §2.3, §10).
// Emits on the app bus (no personal data):
//   'explore:area'      { kind:'circle'|'poly', label, blockIds:number[], town:'ANG MO KIO'|null, centre:{lat, lon}, n } | null
//   'explore:selection' { flatTypes:['4 ROOM',…], allTypes, towns:null|['ANG MO KIO',…], area:<explore:area>|null,
//                         window:{ from:'YYYY-MM', to:'YYYY-MM', months }, history:{ from, to } }
// An area is a place, not a filter: blockIds ignore the town / More filters. Pure builders are exported for tests.

export const SELECTION_DEBOUNCE_MS = 150;

/** Mean position of a polygon's points ([[lat, lon], …]), 5 decimals. */
export function centroid(pts) {
  let la = 0, lo = 0;
  for (const [a, b] of pts) { la += a; lo += b; }
  return { lat: +(la / pts.length).toFixed(5), lon: +(lo / pts.length).toFixed(5) };
}

/**
 * area: S.area ({ type:'circle', lat, lon, r } | { type:'poly', pts }) or null; blocks: D.blocks ({ t, lat, lon });
 * towns: D.towns; pred(b) → inside; label: display label ('800 m circle').
 */
export function areaPayload({ area, blocks, towns, pred, label }) {
  if (!area || !pred) return null;
  const blockIds = [], count = new Map();
  blocks.forEach((b, bi) => { if (pred(b)) { blockIds.push(bi); count.set(b.t, (count.get(b.t) || 0) + 1); } });
  let town = null;
  for (const [ti, c] of count) if (c * 2 >= blockIds.length) { town = towns[ti] ?? null; break; } // town holding ≥ 50 %
  const centre = area.type === 'circle' ? { lat: area.lat, lon: area.lon } : centroid(area.pts);
  return { kind: area.type === 'circle' ? 'circle' : 'poly', label, blockIds, town, centre, n: blockIds.length };
}

/** S: { ft, towns, mFrom, mTo, hist }; D: { flat_types, towns, months }; area: explore:area payload | null. */
export function selectionPayload({ S, D, area }) {
  const ft = [...S.ft].sort((a, b) => a - b);
  return {
    flatTypes: ft.map((i) => D.flat_types[i]),
    allTypes: ft.length === D.flat_types.length,
    towns: S.towns.length === D.towns.length ? null : [...S.towns].sort((a, b) => a - b).map((i) => D.towns[i]),
    area: area || null,
    window: { from: D.months[S.mFrom], to: D.months[S.mTo], months: S.mTo - S.mFrom + 1 },
    history: { from: S.hist.from, to: S.hist.to },
  };
}

// ------------------------------------------------------------------ browser
/** ctx: { bus, D, getS, areaPred() → pred | null, areaLabel() → string }. */
export function createSelection({ bus, D, getS, areaPred, areaLabel }) {
  let area = null, key = 'null', timer = null;
  const emit = () => bus?.emit('explore:selection', selectionPayload({ S: getS(), D, area }));
  const schedule = () => { clearTimeout(timer); timer = setTimeout(emit, SELECTION_DEBOUNCE_MS); };
  /** After every area set / clear (and at start when an area was saved). */
  function syncArea() {
    const S = getS(), k = JSON.stringify(S.area || null);
    if (k === key) return;
    key = k;
    area = areaPayload({ area: S.area, blocks: D.blocks, towns: D.towns, pred: areaPred(), label: S.area ? areaLabel() : null });
    bus?.emit('explore:area', area);
    schedule();
  }
  return { schedule, syncArea, area: () => area };
}
