// Straight-line distances on the WGS84 sphere (good to a few metres at Singapore's scale).
// Points are { lat, lon } in degrees. Pure maths, no data access.

const R_KM = 6371.0088; // mean Earth radius
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in km. */
export function distanceKm(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Items within `km` of `center`, nearest first, each as { item, km }. */
export function withinKm(items, center, km, at = (x) => x) {
  const out = [];
  for (const item of items) {
    const p = at(item);
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const d = distanceKm(center, p);
    if (d <= km) out.push({ item, km: d });
  }
  return out.sort((x, y) => x.km - y.km);
}

/** The nearest item to `center`, as { item, km }, or null. */
export function nearest(items, center, at = (x) => x) {
  let best = null;
  for (const item of items) {
    const p = at(item);
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const d = distanceKm(center, p);
    if (!best || d < best.km) best = { item, km: d };
  }
  return best;
}
