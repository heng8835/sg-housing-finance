// Daily places search (workplace / school / parents' place): searched in the app's own loaded data only — blocks,
// streets, towns (incl. 中文 names), MRT/LRT stations, schools, malls, polyclinics, hawker centres and parks. Nothing
// typed here leaves the browser (OneMap's search API needs a per-owner token, so a public static site cannot use it).
// Pure: buildPlaceIndex() once from data.js / poi.js / family.js shapes, then searchPlaces() per keystroke.
import { zhTownSearch, zhTownRow } from './townalias.js';

export const PLACE_MAX = 8;   // suggestions shown (UI choice)
export const PLACE_MIN = 2;   // characters before searching
export const MISS_MIN = 3;    // characters before "Not found" is shown

// long word → the short form HDB street names use; applied to the query AND the index, so either spelling matches
const SHORT = {
  AVENUE: 'AVE', STREET: 'ST', ROAD: 'RD', DRIVE: 'DR', CRESCENT: 'CRES', CLOSE: 'CL', NORTH: 'NTH', SOUTH: 'STH',
  CENTRAL: 'CTRL', BUKIT: 'BT', JALAN: 'JLN', LORONG: 'LOR', UPPER: 'UPP', TANJONG: 'TG', KAMPONG: 'KG',
  COMMONWEALTH: 'CWEALTH', TERRACE: 'TER', HEIGHTS: 'HTS', GARDENS: 'GDNS', GARDEN: 'GDN', PLACE: 'PL', PARK: 'PK',
  MARKET: 'MKT',
};
const LONG = Object.fromEntries(Object.entries(SHORT).map(([l, s]) => [s, l])); // prefix typing: "buk" → BUKIT
const DROP = new Set(['BLK', 'BLOCK']);

/** "Blk 406 Ang Mo Kio Avenue 10" → "406 ANG MO KIO AVE 10" (upper case, punctuation out, long words shortened). */
export function canon(s) {
  return String(s || '').toUpperCase().replace(/['’`.]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim()
    .split(' ').filter((w) => w && !DROP.has(w)).map((w) => SHORT[w] || w).join(' ');
}

const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|[\s/(-])([a-z])/g, (_, a, c) => a + c.toUpperCase());
const stationName = (n) => titleCase(String(n).replace(/\s*(MRT|LRT)\s+STATION\s*$/i, ''));
const isLrt = (n) => /LRT\s+STATION\s*$/i.test(String(n));

// kind order inside one match tier (towns and stations are the usual anchors)
const RANK = { town: 0, mrt: 1, street: 2, school: 3, mall: 4, polyclinic: 5, hawker: 6, park: 7, block: 8 };

function entry(rank, { label, sub, lat, lon, kind }, key, base, extra = '') {
  const k = canon(key), b = canon(base);
  const words = new Set(`${k} ${b} ${canon(extra)}`.split(' ').filter(Boolean));
  for (const w of [...words]) if (LONG[w]) words.add(LONG[w]);
  return { label, sub, lat: +lat, lon: +lon, kind, rank, key: k, base: b, words: [...words] };
}
const okPos = (p) => p && Number.isFinite(+p.lat) && Number.isFinite(+p.lon);

/**
 * Index of every searchable place. hdb = window.HDB_DATA shape ({ towns, zones?, streets, blocks: [{ b, s, t, lat, lon }],
 * mrt: { stations: [{ n, codes, lat, lon }] } }); poi = window.HDB_POI ({ schools: [{ n, lvl }], malls, hawkers, parks:
 * [{ n, lat, lon }] }); family = window.HDB_FAMILY ({ polyclinics: [{ n, lat, lon }] }) or null. t translates the
 * small English sub-lines; lang picks 中文 town labels (core/townalias.js).
 */
export function buildPlaceIndex({ hdb, poi = null, family = null, t = (s) => s, lang } = {}) {
  const out = [];
  const towns = hdb?.towns || [], streets = hdb?.streets || [], blocks = hdb?.blocks || [];
  // towns + streets at the centre of their blocks
  const acc = (m, k) => m.get(k) || m.set(k, { lat: 0, lon: 0, n: 0, t: null }).get(k);
  const tAcc = new Map(), sAcc = new Map();
  for (const b of blocks) {
    if (!okPos(b)) continue;
    for (const a of [acc(tAcc, b.t), acc(sAcc, b.s)]) { a.lat += +b.lat; a.lon += +b.lon; a.n++; }
    acc(sAcc, b.s).t = b.t;
  }
  towns.forEach((tn, i) => {
    const a = tAcc.get(i); if (!a) return;
    const row = zhTownRow(titleCase(tn), tn, hdb.zones?.[i] ? t(hdb.zones[i]) : '', lang);
    out.push(entry(RANK.town, { ...row, lat: a.lat / a.n, lon: a.lon / a.n, kind: 'town' }, tn, tn, 'TOWN'));
    out[out.length - 1].town = i;
  });
  sAcc.forEach((a, si) => {
    const st = streets[si]; if (st == null) return;
    out.push(entry(RANK.street, { label: titleCase(st), sub: titleCase(towns[a.t]), lat: a.lat / a.n, lon: a.lon / a.n, kind: 'place' }, st, st));
  });
  for (const st of hdb?.mrt?.stations || []) {
    if (!okPos(st)) continue;
    const name = stationName(st.n), line = isLrt(st.n) ? 'LRT' : 'MRT', codes = (st.codes || []).join(' ');
    out.push(entry(RANK.mrt, { label: `${name} ${line}`, sub: (st.codes || []).join(' · '), lat: st.lat, lon: st.lon, kind: 'mrt' }, `${name} ${line}`, name, `${codes} STATION MRT LRT`));
  }
  for (const sc of poi?.schools || []) {
    if (!okPos(sc)) continue;
    out.push(entry(RANK.school, { label: sc.n, sub: String(sc.lvl || '').toLowerCase(), lat: sc.lat, lon: sc.lon, kind: 'school' }, sc.n, sc.n, 'SCHOOL SCH'));
  }
  const simple = (list, rank, sub, extra) => { for (const p of list || []) if (okPos(p) && p.n) out.push(entry(rank, { label: p.n, sub, lat: p.lat, lon: p.lon, kind: 'place' }, p.n, p.n, extra)); };
  simple(poi?.malls, RANK.mall, t('shopping mall'), 'MALL SHOPPING');
  simple(family?.polyclinics, RANK.polyclinic, t('Polyclinic'), 'POLYCLINIC CLINIC');
  simple(poi?.hawkers, RANK.hawker, t('Hawker centre'), 'HAWKER CENTRE FOOD');
  simple(poi?.parks, RANK.park, t('Park'), 'PARK');
  blocks.forEach((b, i) => {
    if (!okPos(b) || streets[b.s] == null) return;
    const addr = `${b.b} ${streets[b.s]}`;
    out.push(entry(RANK.block, { label: `${b.b} ${titleCase(streets[b.s])}`, sub: titleCase(towns[b.t]), lat: b.lat, lon: b.lon, kind: 'block' }, addr, addr, `BLK ${towns[b.t] || ''}`));
    out[out.length - 1].bid = i;
  });
  return { entries: out, towns };
}

// every typed word starts some word of the place (numbers: whole word only, so "40" never finds block 406)
const wordHit = (words, toks) => toks.every((k) => words.some((w) => (/^\d+$/.test(k) ? w === k : w.startsWith(k))));
// looser: every typed word (3+ letters) sits inside some word ("point" → Northpoint)
const inside = (words, toks) => toks.every((k) => (/^\d+$/.test(k) || k.length < 3 ? words.includes(k) : words.some((w) => w.includes(k))));

/** Tier of one entry for the canonical query: 0 exact, 1 prefix, 2 every word starts a word, 3 inside words, -1 no. */
export function matchTier(e, nq, toks) {
  if (e.key === nq || e.base === nq) return 0;
  if (!wordHit(e.words, toks)) return inside(e.words, toks) ? 3 : -1;
  return e.key.startsWith(nq) || e.base.startsWith(nq) ? 1 : 2;
}

/**
 * Up to `max` places for the typed text: [{ label, sub, lat, lon, kind }] (the shape the Daily places list uses).
 * Exact > prefix > word match > inside a word; then towns, stations, streets, schools, malls, clinics, hawkers,
 * parks, blocks; then the shorter label. A 中文 town name finds that town (and works inside "宏茂桥 ave 10").
 */
export function searchPlaces(index, q, { max = PLACE_MAX, zhMap } = {}) {
  if (!index?.entries?.length) return [];
  const zh = zhMap ? zhTownSearch(q, index.towns, zhMap) : zhTownSearch(q, index.towns);
  const nq = canon(zh.rest), toks = nq ? nq.split(' ') : [];
  const zhTowns = new Set(zh.towns);
  if (nq.length < PLACE_MIN && !zhTowns.size) return [];
  const hits = [];
  for (const e of index.entries) {
    let tier = toks.length && nq.length >= PLACE_MIN ? matchTier(e, nq, toks) : -1;
    if (tier < 0 && e.town != null && zhTowns.has(e.town)) tier = toks.length ? 2 : 0; // "宏茂桥 ave 10": the street first
    if (tier >= 0) hits.push([tier, e]);
  }
  hits.sort((x, y) => x[0] - y[0] || x[1].rank - y[1].rank || x[1].label.length - y[1].label.length || (x[1].label < y[1].label ? -1 : x[1].label > y[1].label ? 1 : 0));
  const seen = new Set(), res = [];
  for (const [, e] of hits) {
    const id = `${e.kind}|${e.key}`; if (seen.has(id)) continue; seen.add(id);
    res.push({ label: e.label, sub: e.sub, lat: e.lat, lon: e.lon, kind: e.kind });
    if (res.length >= max) break;
  }
  return res;
}
