// Read-only access to the generated data files (window.HDB_* globals set by data/*.js).
// Modules other than explore use this instead of touching globals directly.
import { withinKm, nearest } from './geo.js';
import { feature } from './features.js';

const g = () => globalThis;
const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const resaleCache = new Map();

export const data = {
  get hdb() { return g().HDB_DATA || null; },
  get rents() { return g().HDB_RENTS || null; },
  get commute() { return g().HDB_COMMUTE || null; },
  get family() { return g().HDB_FAMILY || null; },
  get poi() { return g().HDB_POI || null; },
  /** HDB_BTO (data/bto.js); null when not loaded or the btoData switch is off (core/features.js, DEC-015). */
  get bto() { return feature('btoData') ? g().HDB_BTO || null : null; },
  /** HDB_MARKET (tools/fetch_market.py): RPI, MP2025 land use per block, town unit mix, catalysts; null when not loaded. */
  get market() { return g().HDB_MARKET || null; },
  /** Block record by data.js index, or null. */
  block(bid) { const d = this.hdb; return d && bid != null ? d.blocks[bid] || null : null; },
  /** Town name of a block. */
  townOf(bid) { const b = this.block(bid); return b ? this.hdb.towns[b.t] : null; },
  /** Index of the HDB block nearest to a point, with its distance: { bid, km } or null. */
  nearestBlock(pt) {
    const d = this.hdb; if (!d || !pt) return null;
    const r = nearest(d.blocks.keys(), pt, (i) => d.blocks[i]);
    return r ? { bid: r.item, km: r.km } : null;
  },
  /**
   * Resale prices of one flat type around a point: blocks within `km`, the last `months` months of data.
   * @returns {{ median:number|null, n:number, blocks:number, from:string, to:string }|null}
   */
  resaleNear(pt, flatType, { km, months }) {
    const d = this.hdb; if (!d || !pt) return null;
    const key = `${pt.lat.toFixed(5)},${pt.lon.toFixed(5)}|${flatType}|${km}|${months}`;
    if (resaleCache.has(key)) return resaleCache.get(key);
    const ft = d.flat_types.indexOf(flatType);
    const blocks = new Set(withinKm(d.blocks.keys(), pt, km, (i) => d.blocks[i]).map((x) => x.item));
    const minM = Math.max(0, d.months.length - months), prices = [];
    if (ft >= 0) for (let i = 0; i < d.tx.p.length; i++) if (d.tx.m[i] >= minM && d.tx.ft[i] === ft && blocks.has(d.tx.b[i])) prices.push(d.tx.p[i]);
    const out = { median: median(prices), n: prices.length, blocks: blocks.size, from: d.months[minM], to: d.months[d.months.length - 1] };
    resaleCache.set(key, out);
    return out;
  },
  /** Rent rows for a block (keyed by flat type) and its town, for engine/rent.js. */
  rentsFor(bid) {
    const r = this.rents; if (!r || bid == null) return { block: null, town: null };
    return { block: r.blocks[String(bid)] || null, town: r.towns[this.townOf(bid)] || null };
  },
};
