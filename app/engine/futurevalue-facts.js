// Future-value scorecard, step 1: measure each driver for one flat from the generated data.
// Pure: every data object is passed in (window.HDB_* shapes, never read from globals), `asOf`
// ('YYYY-MM') is passed in, heuristics come from `params` (modules/explore/futurevalue-params.js)
// and rule values from `policy`. Scoring lives in engine/futurevalue.js.
//
// ctx shapes (see the generators' docstrings):
//   hdb    = HDB_DATA   (tools/build_data.py)   months, towns, flat_types, models, blocks[{b,s,t,lat,lon,yc?,u?}], tx{b,m,ft,a,mo,ly,p}
//   market = HDB_MARKET (tools/fetch_market.py) rpi, landuse{cats,n,ha}, town_mix, catalysts
//   future = HDB_FUTURE (tools/fetch_future_rail.py) stations[{n,lat,lon,future,year}]
//   bto    = HDB_BTO    (tools/fetch_bto.py, private build) projects[{n,lat,lon,approx,status,top,units}]
//   rents  = HDB_RENTS  (tools/fetch_rents.py)  blocks[bid][type] = [n,p25,med,p75,last,n24,...], towns[town][type]
import { distanceKm } from '../core/geo.js';
import { RENT_FIELDS } from './rent.js';

const Q_END = { Q1: '03', Q2: '06', Q3: '09', Q4: '12' };
const MED = RENT_FIELDS.indexOf('med');
const MED24 = RENT_FIELDS.indexOf('med24');

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const median = (a) => {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y), h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};
const ym = (s) => { const [y, m] = String(s).split('-').map(Number); return { y, m }; };
export const yearOf = (s) => ym(s).y;
/** 'YYYY-MM' + k months. */
export function addMonths(s, k) {
  const { y, m } = ym(s);
  const t = y * 12 + (m - 1) + k, yy = Math.floor(t / 12);
  return `${yy}-${String(t - yy * 12 + 1).padStart(2, '0')}`;
}
/** RPI quarter label ('2026-Q2') -> its last month ('2026-06'), or null. */
export function quarterEnd(q) {
  const [y, k] = String(q).split('-');
  return Q_END[k] ? `${y}-${Q_END[k]}` : null;
}
/** First 4-digit year in a free-text date ('2Q 2027', 'Dec 2028', '2027'), or null. */
export function firstYear(text) {
  const m = String(text ?? '').match(new RegExp('(\\d{4})'));
  return m ? Number(m[1]) : null;
}
/** Years of lease left at month `at` ('YYYY-MM') for a lease starting in January of `start`. */
export function leaseLeft(start, at, termYears) {
  if (!num(start) || start <= 0) return null;
  const { y, m } = ym(at);
  return termYears - (y - start) - (m - 1) / 12;
}
/** Mean RPI over the quarters ending inside (from, to] — null when none. */
export function rpiMean(rpi, from, to) {
  if (!rpi?.quarters) return null;
  const v = [];
  rpi.quarters.forEach((q, i) => { const e = quarterEnd(q); if (e && e > from && e <= to && num(rpi.index[i]) != null) v.push(rpi.index[i]); });
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
const pctChange = (now, then) => (num(now) != null && num(then) ? (now / then - 1) * 100 : null);
const typeKey = (ft) => (ft === 'EXECUTIVE' ? 'E' : ft === 'MULTI-GENERATION' ? 'M' : String(ft).split(' ')[0]);

/** One pass over the transactions: rows of the flat's town x type, its block (all types) and block x type. */
function scan(hdb, bid, ft, asOf, earliest) {
  const tx = hdb.tx, town = hdb.blocks[bid].t, fti = hdb.flat_types.indexOf(ft);
  const townType = [], blockAll = [], blockType = [];
  for (let i = 0; i < tx.p.length; i++) {
    const m = hdb.months[tx.m[i]];
    if (m > asOf || m <= earliest) continue;
    const b = tx.b[i], same = tx.ft[i] === fti;
    const row = { m, b, ly: tx.ly[i], a: tx.a[i], p: tx.p[i], psm: tx.a[i] > 0 ? tx.p[i] / tx.a[i] : null };
    if (b === bid) { blockAll.push(row); if (same) blockType.push(row); }
    if (same && hdb.blocks[b]?.t === town) townType.push(row);
  }
  return { townType, blockAll, blockType };
}
const within = (rows, from, to) => rows.filter((r) => r.m > from && r.m <= to);
const medOf = (rows, f) => median(rows.map(f).filter((x) => num(x) != null));
const modeOf = (vals) => {
  const c = new Map(); let best = null;
  for (const v of vals) { c.set(v, (c.get(v) || 0) + 1); if (best == null || c.get(v) > c.get(best)) best = v; }
  return best;
};

/**
 * Measure drivers 1-8 for one flat.
 * @param {{hdb:object, market?:object|null, future?:object|null, bto?:object|null, btoOff?:boolean, rents?:object|null}} ctx
 *   btoOff = the btoData feature switch is off: the supply driver leaves BTO out (not shown as missing)
 * @param {{bid:number, flatType:string, asOf:string, leaseYear?:number, area?:number, model?:string, price?:number}} flat
 * @param {object} params  FUTURE_VALUE_PARAMS shape
 * @param {{get:(id:string)=>any}} policy  uses 'lease.term.years', 'rentbuy.mop.years'
 * @returns {object|null} facts per driver (null when the block is unknown)
 */
export function futureValueFacts(ctx, flat, params, policy) {
  const { hdb } = ctx, market = ctx.market || null;
  const block = hdb?.blocks?.[flat?.bid];
  if (!block) return null;
  const { asOf, flatType: ft, bid } = flat;
  const asOfY = yearOf(asOf), term = policy.get('lease.term.years'), mop = policy.get('rentbuy.mop.years').standard;
  const W = params.windowMonths, LW = params.longWindowMonths, minN = params.minN;
  const maxYears = Math.max(...params.momentum.years);
  const lookback = Math.max(LW, params.lease.dragWindowMonths, maxYears * 12 + W);
  const { townType, blockAll, blockType } = scan(hdb, bid, ft, asOf, addMonths(asOf, -lookback));
  const townName = hdb.towns[block.t];
  const at = { lat: block.lat, lon: block.lon };

  // 1 lease runway + empirical drag (town x type, remaining-lease bands)
  const start = num(flat.leaseYear) ?? modeOf((blockType.length ? blockType : blockAll).map((r) => r.ly));
  const now = leaseLeft(start, asOf, term), H = params.lease.horizonYears;
  const bw = params.lease.dragBandYears, bandOf = (rem) => Math.floor(rem / bw);
  const groups = new Map();
  for (const r of within(townType, addMonths(asOf, -params.lease.dragWindowMonths), asOf)) {
    const rem = leaseLeft(r.ly, r.m, term);
    if (rem == null || r.psm == null) continue;
    const k = bandOf(rem); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r.psm);
  }
  // the whole curve (block card "Lease and value" chart): median $/m2 per band, ascending lease left
  const curve = [...groups.entries()].sort((x, y) => x[0] - y[0]).map(([k, v]) => ({ from: k * bw, to: k * bw + bw, n: v.length, psm: median(v) }));
  let drag = null;
  if (now != null) {
    const bNow = bandOf(now), bLater = bandOf(now - H), g0 = groups.get(bNow) || [], g1 = groups.get(bLater) || [];
    drag = bNow !== bLater && g0.length >= minN && g1.length >= minN
      ? { pct: pctChange(median(g1), median(g0)), from: [bNow * bw, bNow * bw + bw], to: [bLater * bw, bLater * bw + bw], n: [g0.length, g1.length] }
      : { pct: null, n: [g0.length, g1.length] };
  }
  const lease = { start, now, later: now == null ? null : now - H, horizon: H, drag, curve, windowMonths: params.lease.dragWindowMonths, minN };

  // 2 momentum: town x type median $/m2 change vs RPI change, windows aligned to the last RPI quarter
  const rpi = market?.rpi || null;
  const lastQ = rpi?.quarters?.length ? quarterEnd(rpi.quarters[rpi.quarters.length - 1]) : null;
  const end = lastQ && lastQ < asOf ? lastQ : asOf;
  const momentum = { town: townName, end, rpi: !!rpi, series: params.momentum.years.map((years) => {
    const thenEnd = addMonths(end, -years * 12);
    const a = within(townType, addMonths(end, -W), end), b = within(townType, addMonths(thenEnd, -W), thenEnd);
    const town = a.length >= minN && b.length >= minN ? pctChange(medOf(a, (r) => r.psm), medOf(b, (r) => r.psm)) : null;
    const index = rpi ? pctChange(rpiMean(rpi, addMonths(end, -W), end), rpiMean(rpi, addMonths(thenEnd, -W), thenEnd)) : null;
    return { years, town, rpi: index, excess: town != null && index != null ? town - index : null, n: [a.length, b.length] };
  }) };

  // 3 relative value: block (or asking) $/m2 vs same town + type + similar lease start, last LW months
  const lwFrom = addMonths(asOf, -LW), half = params.value.leaseBandYears / 2;
  const own = within(blockType, lwFrom, asOf);
  const peers = start == null ? [] : within(townType, lwFrom, asOf).filter((r) => r.b !== bid && Math.abs(r.ly - start) <= half);
  const askPsm = num(flat.price) && num(flat.area) ? flat.price / flat.area : null;
  const value = {
    blockPsm: own.length >= minN ? medOf(own, (r) => r.psm) : null, nBlock: own.length,
    peerPsm: peers.length >= minN ? medOf(peers, (r) => r.psm) : null, nPeer: peers.length, askPsm, town: townName, minN,
  };

  // 4 catalysts: future MRT, curated projects, MP land-use zones near the block
  const oldest = asOfY - params.catalysts.recentYears;
  const live = (y) => y == null || y >= oldest;
  const stations = (ctx.future?.stations || []).filter((s) => s.future && live(num(s.year)))
    .map((s) => ({ name: s.n, year: num(s.year), km: distanceKm(at, s) })).filter((s) => s.km <= params.catalysts.mrtKm)
    .sort((x, y) => x.km - y.km);
  const projects = (market?.catalysts || []).filter((p) => live(num(p.year)))
    .map((p) => ({ id: p.id, name: p.name, year: num(p.year), status: p.status, approx: !!p.approx, km: distanceKm(at, p), reach: num(p.km) ?? params.catalysts.projectKm }))
    .filter((p) => p.km <= p.reach)
    .sort((x, y) => x.km - y.km);
  const lu = market?.landuse && market.landuse.blocks === hdb.blocks.length ? market.landuse : null; // stale after a data.js rebuild
  const landuse = lu ? Object.fromEntries(lu.cats.map((c, i) => [c, { n: lu.n[i][bid] ?? 0, ha: lu.ha[i][bid] ?? 0 }])) : null;
  const catalysts = { mrt: stations[0] || null, stations: stations.length, projects, landuse, landuseYear: lu?.year ?? null, radiusM: lu?.radius_m ?? null, hasFuture: !!ctx.future };

  // 5 supply: upcoming BTO + blocks whose MOP ends in the next few years, within radiusKm
  const R = params.supply.radiusKm;
  const btoOff = !!ctx.btoOff; // btoData switch off (DEC-015): MOP-wave part only, even if HDB_BTO is around
  const btos = (btoOff ? [] : ctx.bto?.projects || []).map((p) => ({ name: p.n, top: firstYear(p.top), units: num(p.units), approx: !!p.approx, km: distanceKm(at, p) }))
    .filter((p) => p.km <= R && (p.top == null || p.top >= asOfY));
  let mopUnits = 0, mopBlocks = 0, stock = 0;
  for (const b of hdb.blocks) {
    if (!num(b.yc) || !num(b.u) || distanceKm(at, b) > R) continue;
    if (b.yc <= asOfY) stock += b.u;
    const ends = b.yc + mop;
    if (ends >= asOfY && ends <= asOfY + params.supply.mopWindowYears) { mopUnits += b.u; mopBlocks += 1; }
  }
  const btoUnits = btos.reduce((s, p) => s + (p.units ?? 0), 0);
  const supply = { btoUnits, btoProjects: btos.length, btoUnknown: btos.filter((p) => p.units == null).length, mopUnits, mopBlocks, stock, hasBto: !btoOff && !!ctx.bto, btoOff, mopYears: mop };

  // 6 rental yield: block (12 m, else 24 m) or town median rent vs price; town yield for comparison
  const wFrom = addMonths(asOf, -W);
  const br = ctx.rents?.blocks?.[String(bid)]?.[ft], tr = ctx.rents?.towns?.[townName]?.[ft];
  const townRent = num(tr?.med) ?? (Array.isArray(tr?.q) ? [...tr.q].reverse().find((x) => num(x) != null) ?? null : null);
  const rent = num(br?.[MED]) ?? num(br?.[MED24]) ?? townRent;
  const rentTier = num(br?.[MED]) != null ? 'block12' : num(br?.[MED24]) != null ? 'block24' : rent != null ? 'town' : null;
  const ownW = within(blockType, wFrom, asOf);
  const townW = within(townType, wFrom, asOf), townPrice = townW.length >= minN ? medOf(townW, (r) => r.p) : null;
  const blockPrice = ownW.length >= minN ? medOf(ownW, (r) => r.p) : own.length >= minN ? medOf(own, (r) => r.p) : null;
  const price = num(flat.price) ?? blockPrice ?? townPrice;
  const priceSource = num(flat.price) ? 'asking' : blockPrice != null ? 'block' : townPrice != null ? 'town' : null;
  const gy = (r, p) => (r != null && p ? (r * 12 / p) * 100 : null);
  const yieldF = { rent, rentTier, price, priceSource, pct: gy(rent, price), townPct: gy(townRent, townPrice), town: townName };

  // 7 liquidity: block sales (all types) per year over LW months; turnover vs dwelling units
  const sales = within(blockAll, lwFrom, asOf).length, perYear = (sales * 12) / LW;
  const liquidity = { sales, months: LW, perYear, units: num(block.u), turnoverPct: num(block.u) ? (perYear / block.u) * 100 : null };

  // 8 scarcity: type share of the town's sold units, size vs town median, rare model
  const mix = market?.town_mix?.[townName] || null;
  const total = mix ? Object.values(mix).reduce((s, v) => s + (num(v) ?? 0), 0) : 0;
  const townArea = medOf(within(townType, lwFrom, asOf), (r) => r.a);
  const model = String(flat.model ?? '').toUpperCase();
  const scarcity = {
    sharePct: mix && total ? ((num(mix[typeKey(ft)]) ?? 0) / total) * 100 : null, town: townName, flatType: ft,
    area: num(flat.area), townArea, sizePct: num(flat.area) && townArea ? (flat.area / townArea - 1) * 100 : null,
    model: flat.model ?? null, rare: !!model && params.scarcity.rareModels.some((k) => model.includes(k)),
  };

  return { asOf, bid, flatType: ft, town: townName, lease, momentum, value, catalysts, supply, yield: yieldF, liquidity, scarcity };
}
