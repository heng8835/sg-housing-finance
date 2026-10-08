// Tiered comparable sales over HDB_DATA (pure: the data object is passed in, no DOM, no globals).
// The tier constants are shared with Explore's "Recent sales benchmark" (modules/explore/comparables.js
// re-exports them), so both use the same rules: this block 12 m / 24 m (≥ BLOCK_MIN) → blocks within
// NEAR_M with a lease start within ±LEASE_TOL years, 12 m / 24 m (≥ AREA_MIN) → the town with a similar
// lease, 12 m → the town overall. Like the "Over-priced?" row, a tier with fewer than MIN_COMPS sales
// widens to the next wider tier that has at least MIN_COMPS. UI heuristics, not Singapore rules.
// Used by Plan → Sell then buy ("Similar recent sales" for the flat you own now).
import { distanceKm } from './geo.js';

export const MIN_COMPS = 5;     // fewer comparable sales → "not enough sales"
export const NEAR_M = 400, LEASE_TOL = 5, BLOCK_MIN = 3, AREA_MIN = 5;
export const SQFT_PER_SQM = 10.7639;
const NEAR_BOX = 0.006;         // degrees: quick box before the distance check (as legacy nearBlocks)

/** Lease start year of a block: legacy's `b.lease` when set, else the most common lease year of its sales, else `yc`. */
export function blockLease(hdb, bid) {
  const b = hdb.blocks[bid];
  if (b.lease) return b.lease;
  const c = {}; let best = 0, bl = 0;
  const tx = hdb.tx;
  for (let i = 0; i < tx.b.length; i++) {
    if (tx.b[i] !== bid) continue;
    const y = tx.ly[i]; c[y] = (c[y] || 0) + 1;
    if (c[y] > best) { best = c[y]; bl = y; }
  }
  return bl || b.yc || 0;
}

/** Block indices within NEAR_M metres of `bid` (itself excluded). */
export function nearBlocks(hdb, bid, metres = NEAR_M) {
  const b = hdb.blocks[bid], out = [];
  hdb.blocks.forEach((x, i) => {
    if (i === bid || Math.abs(x.lat - b.lat) >= NEAR_BOX || Math.abs(x.lon - b.lon) >= NEAR_BOX) return;
    if (distanceKm(b, x) * 1000 <= metres) out.push(i);
  });
  return out;
}

/**
 * The comparable sales for one flat (block `bid`, flat-type index `ft`), as the "Over-priced?" row picks them.
 * @param {object} hdb  HDB_DATA shape { months, blocks[{lat,lon,t,lease?,yc?}], tx{b,m,ft,ly,p,a} }
 * @param {{ bid:number, ft:number, last?:number }} q  last = index of the last data month (default: the newest)
 * @returns {{ idx:number[], tier:number, months:number, n:number }|null}  idx ascending; null for an unknown block / type
 */
export function tieredComps(hdb, { bid, ft, last = hdb?.months?.length - 1 }) {
  const b = hdb?.blocks?.[bid];
  if (!b || !(ft >= 0)) return null;
  const tx = hdb.tx, lease = blockLease(hdb, bid), near = new Set(nearBlocks(hdb, bid));
  const L12 = last - 11, L24 = last - 23;
  const own = [], nearL = [], town = [], townL = [];
  for (let i = 0; i < tx.p.length; i++) {
    if (tx.ft[i] !== ft || tx.m[i] < L24 || tx.m[i] > last) continue; // every tier counts this type in the last 24 m at most
    const bb = tx.b[i], similar = Math.abs(tx.ly[i] - lease) <= LEASE_TOL;
    if (bb === bid) own.push(i);
    if (near.has(bb) && similar) nearL.push(i);
    if (hdb.blocks[bb]?.t === b.t) { town.push(i); if (similar) townL.push(i); }
  }
  const since = (pool, from) => pool.filter((i) => tx.m[i] >= from);
  const tiers = [
    { tier: 1, min: BLOCK_MIN, pool: own, mFrom: L12, months: 12 }, { tier: 2, min: BLOCK_MIN, pool: own, mFrom: L24, months: 24 },
    { tier: 3, min: AREA_MIN, pool: nearL, mFrom: L12, months: 12 }, { tier: 4, min: AREA_MIN, pool: nearL, mFrom: L24, months: 24 },
    { tier: 5, min: AREA_MIN, pool: townL, mFrom: L12, months: 12 }, { tier: 6, min: 0, pool: town, mFrom: L12, months: 12 },
  ].map((x) => ({ ...x, idx: since(x.pool, x.mFrom) }));
  // benchmark = first tier with enough sales (town overall whatever its count); then widen below MIN_COMPS
  const k = tiers.findIndex((x, j) => x.idx.length >= x.min || j === tiers.length - 1);
  let use = tiers[k];
  if (use.idx.length < MIN_COMPS) use = tiers.slice(k + 1).find((x) => x.idx.length >= MIN_COMPS) || use;
  return { idx: use.idx, tier: use.tier, months: use.months, n: use.idx.length };
}
