// Stable block identity across data refreshes (go-live plan F2).
//
// `bid` = index into HDB_DATA.blocks: compact and fast, but valid for ONE build of data.js only —
// tools/build_data.py sorts blocks by (block, street), so a block that first appears in a later refresh
// shifts every later index. So everything that is SAVED also carries a stable key:
//   bk  = "BLOCK|STREET" (normalised: trimmed, single spaces, upper case) — unique per data.js row
//   ftl / stl = flat-type / storey-range labels (D.flat_types / D.storeys are sorted lists too)
// Rule: in a session `bid` is the truth (bk is re-derived from it on every save); on load `bid` is looked
// up again from `bk` (items saved before this file existed have no bk: their bid is kept and stamped).
// An item whose block / label is gone from the new data is dropped (choices) or loses its block (focus) —
// never silently re-pointed at another block.
//
// Derived per-block files (rents.js, commute.js, market.js) carry `block_sig` = blockSig() of the data.js
// they were built from (tools/blockkey.py, same FNV-1a); checkDerived() drops their per-block part when it
// does not match, so a stale file shows "no data" instead of another block's numbers.
// Pure except attachBlockKeys (storage + globals injected). Privacy: localStorage only.
import { LEGACY_KEY } from './store.js';

export const normKey = (block, street) =>
  `${String(block ?? '').trim().toUpperCase()}|${String(street ?? '').trim().replace(/\s+/g, ' ').toUpperCase()}`;

const cache = new WeakMap();
function index(hdb) {
  let c = cache.get(hdb);
  if (!c) {
    const keys = hdb.blocks.map((b) => normKey(b.b, hdb.streets[b.s]));
    const map = new Map();
    keys.forEach((k, i) => { if (!map.has(k)) map.set(k, i); });
    c = { keys, map, sig: null };
    cache.set(hdb, c);
  }
  return c;
}

const isIndex = (i, list) => Number.isInteger(i) && i >= 0 && i < list.length;
const labelOf = (list, i) => (list && isIndex(i, list) ? list[i] : null);
const indexOfLabel = (list, label) => { const i = list ? list.indexOf(label) : -1; return i < 0 ? null : i; };

/** Stable key of block `bid` in this data.js, or null. */
export function blockKey(hdb, bid) {
  if (!hdb || bid == null || bid === '') return null;
  const { keys } = index(hdb);
  const i = Number(bid);
  return isIndex(i, keys) ? keys[i] : null;
}

/** Index of the block with stable key `key` in this data.js, or null. */
export function bidOf(hdb, key) {
  if (!hdb || typeof key !== 'string') return null;
  const i = index(hdb).map.get(key);
  return i == null ? null : i;
}

/** Number of keys shared by two or more blocks (should be 0: build_data groups by block + street). */
export function duplicateKeys(hdb) { const c = index(hdb); return c.keys.length - c.map.size; }

/** FNV-1a 32-bit (hex) over the UTF-8 of every block key joined by "\n" — identifies the block order of a data.js. */
export function blockSig(hdb) {
  const c = index(hdb);
  if (c.sig == null) {
    const bytes = new TextEncoder().encode(c.keys.join('\n'));
    let h = 0x811c9dc5;
    for (const x of bytes) { h ^= x; h = Math.imul(h, 0x01000193) >>> 0; }
    c.sig = h.toString(16).padStart(8, '0');
  }
  return c.sig;
}

// ---------------------------------------------------------------- shortlist (localStorage 'hdb-comparer')

/** A shortlisted flat with its stable keys (bk, ftl, stl) from the current bid / ft / storey. */
export function stampChoice(c, hdb) {
  if (!c || typeof c !== 'object') return c;
  return { ...c, bk: blockKey(hdb, c.bid) ?? c.bk, ftl: labelOf(hdb.flat_types, c.ft) ?? c.ftl, stl: labelOf(hdb.storeys, c.storey) ?? c.stl };
}

/** The flat with bid / ft / storey looked up again from its keys, or null when its block or labels are not in this data. */
export function remapChoice(c, hdb) {
  if (!c || typeof c !== 'object') return null;
  const bid = typeof c.bk === 'string' ? bidOf(hdb, c.bk) : (isIndex(c.bid, hdb.blocks) ? c.bid : null);
  const ft = typeof c.ftl === 'string' ? indexOfLabel(hdb.flat_types, c.ftl) : (isIndex(c.ft, hdb.flat_types) ? c.ft : null);
  const storey = typeof c.stl === 'string' ? indexOfLabel(hdb.storeys, c.stl) : c.storey;
  if (bid == null || ft == null || storey == null) return null;
  return bid === c.bid && ft === c.ft && storey === c.storey ? c : { ...c, bid, ft, storey };
}

/** Saved comparer state with stable keys: choices, town filter (townsL / townsAll) and flat-type filter (ftL). */
export function stampComparer(S, hdb) {
  if (!S || typeof S !== 'object' || !hdb) return S;
  const out = { ...S };
  if (Array.isArray(S.choices)) out.choices = S.choices.map((c) => stampChoice(c, hdb));
  if (Array.isArray(S.towns)) { out.townsL = S.towns.map((i) => labelOf(hdb.towns, i)).filter((x) => x != null); out.townsAll = S.towns.length >= hdb.towns.length; }
  if (Array.isArray(S.ft)) out.ftL = S.ft.map((i) => labelOf(hdb.flat_types, i)).filter((x) => x != null);
  return out;
}

const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);

/** → { saved, changed, dropped }: saved comparer state with every index looked up again for this data.js. */
export function remapComparer(saved, hdb) {
  if (!saved || typeof saved !== 'object' || !hdb) return { saved, changed: false, dropped: 0 };
  const out = { ...saved };
  let changed = false, dropped = 0;
  if (Array.isArray(saved.choices)) {
    const next = [];
    for (const c of saved.choices) { const r = remapChoice(c, hdb); if (r) { next.push(r); if (r !== c) changed = true; } else { dropped++; changed = true; } }
    out.choices = next;
  }
  if (Array.isArray(saved.townsL)) {
    const towns = saved.townsAll ? hdb.towns.map((_, i) => i) : saved.townsL.map((l) => indexOfLabel(hdb.towns, l)).filter((i) => i != null);
    if (!sameList(towns, saved.towns)) { out.towns = towns; changed = true; }
  }
  if (Array.isArray(saved.ftL)) {
    const ft = saved.ftL.map((l) => indexOfLabel(hdb.flat_types, l)).filter((i) => i != null);
    if (!sameList(ft, saved.ft)) { out.ft = ft; changed = true; }
  }
  return { saved: out, changed, dropped };
}

// ---------------------------------------------------------------- share link rows (#shortlist=)

/** Share-link row: [blockKey, flatTypeLabel, storeyLabel, sqm, price, facing] (no names, URLs or household data). */
export const shareRow = (c, hdb) => [blockKey(hdb, c.bid), labelOf(hdb.flat_types, c.ft), labelOf(hdb.storeys, c.storey), c.sqm, c.price, c.facing || ''];

/**
 * A shared row → { bid, ft, storey, sqm, price, facing } or null. Rows starting with a string are the stable form
 * (shareRow); rows starting with a number are links made before stable keys (index form, read as before).
 */
export function readShareRow(r, hdb) {
  if (!Array.isArray(r) || !hdb || !(r[4] > 0)) return null;
  const [k, f, s, sqm, price, facing] = r;
  if (typeof k === 'string') {
    const bid = bidOf(hdb, k), ft = indexOfLabel(hdb.flat_types, f), storey = indexOfLabel(hdb.storeys, s);
    return bid == null || ft == null || storey == null ? null : { bid, ft, storey, sqm, price, facing: facing || '' };
  }
  return hdb.blocks[k] && hdb.flat_types[f] ? { bid: k, ft: f, storey: s, sqm, price, facing: facing || '' } : null;
}

// ---------------------------------------------------------------- shared store (sghf:v2): focus + scenarios

/** Focus flat with bk from its bid (no bid → no bk). */
export function stampFocus(f, hdb) {
  if (!f || typeof f !== 'object') return f;
  const { bk: _old, ...rest } = f;
  const bk = blockKey(hdb, f.bid);
  return bk ? { ...rest, bk } : (f.bid == null ? rest : f);
}

/** Focus flat with bid looked up again from bk; a block missing from this data → bid null (price etc. kept). */
export function remapFocus(f, hdb) {
  if (!f || typeof f !== 'object' || f.bid == null) return f;
  const bid = typeof f.bk === 'string' ? bidOf(hdb, f.bk) : (isIndex(f.bid, hdb.blocks) ? f.bid : null);
  if (bid === f.bid) return f;
  if (bid == null) { const { bk: _gone, ...rest } = f; return { ...rest, bid: null }; }
  return { ...f, bid };
}

const mapScenarios = (list, fn) => (Array.isArray(list) ? list.map((s) => (s && typeof s === 'object' && s.focus ? { ...s, focus: fn(s.focus) } : s)) : list);

/** Store state ready to persist: focus + every scenario's focus carry bk. */
export const stampState = (st, hdb) => (st && hdb ? { ...st, focus: stampFocus(st.focus, hdb), scenarios: mapScenarios(st.scenarios, (f) => stampFocus(f, hdb)) } : st);

/** Store state with saved bids looked up again; returns `st` itself when nothing changed. */
export function remapState(st, hdb) {
  if (!st || !hdb) return st;
  const focus = remapFocus(st.focus, hdb);
  let changed = focus !== st.focus;
  const scenarios = Array.isArray(st.scenarios) ? st.scenarios.map((s) => {
    if (!s || typeof s !== 'object' || !s.focus) return s;
    const f = remapFocus(s.focus, hdb);
    if (f === s.focus) return s;
    changed = true;
    return { ...s, focus: f };
  }) : st.scenarios;
  return changed ? { ...st, focus, scenarios } : st;
}

// ---------------------------------------------------------------- derived per-block files

/**
 * Drop the per-block part of derived files built for another data.js (mutates the globals):
 * HDB_RENTS.blocks → {} (town series kept), HDB_COMMUTE → null (whole file is per block),
 * HDB_MARKET.landuse.blocks → null (engine/futurevalue-facts ignores land use on a count mismatch; UI says "stale").
 * Files without block_sig (built before it existed) are checked by count only. Call again after lazy-loading one.
 * @returns {{ file:string, reason:string }[]} what was dropped
 */
export function checkDerived(hdb, g = globalThis) {
  const out = [];
  if (!hdb) return out;
  const sig = blockSig(hdb), n = hdb.blocks.length;
  const off = (x) => x && typeof x.block_sig === 'string' && x.block_sig !== sig;
  const r = g.HDB_RENTS;
  if (r && off(r)) { r.blocks = {}; out.push({ file: 'rents.js', reason: 'block_sig' }); }
  const c = g.HDB_COMMUTE;
  if (c && (off(c) || (c.block_count != null && c.block_count !== n))) { g.HDB_COMMUTE = null; out.push({ file: 'commute.js', reason: off(c) ? 'block_sig' : 'block_count' }); }
  const m = g.HDB_MARKET;
  if (m && m.landuse && off(m)) { m.landuse.blocks = null; out.push({ file: 'market.js', reason: 'block_sig' }); }
  return out;
}

/** Re-point saved shortlist ids in storage (before the map code reads them). → { changed, dropped } */
export function migrateComparerStorage(storage, hdb) {
  let raw = null;
  try { raw = storage ? storage.getItem(LEGACY_KEY) : null; } catch { return { changed: false, dropped: 0 }; }
  if (!raw || !hdb) return { changed: false, dropped: 0 };
  let saved;
  try { saved = JSON.parse(raw); } catch { return { changed: false, dropped: 0 }; }
  const { saved: next, changed, dropped } = remapComparer(saved, hdb);
  const text = JSON.stringify(stampComparer(next, hdb));
  if (text !== raw) { try { storage.setItem(LEGACY_KEY, text); } catch { /* quota / private mode */ } }
  return { changed, dropped };
}

/**
 * Boot step once HDB_DATA is loaded (main.js, before the map code starts): derived-file check, shortlist
 * migration, store hook (remap now, stamp bk on every save / export).
 */
export function attachBlockKeys({ hdb, store, storage, g = globalThis }) {
  if (!hdb || !Array.isArray(hdb.blocks)) return null;
  const derived = checkDerived(hdb, g);
  const comparer = migrateComparerStorage(storage, hdb);
  if (store && typeof store.useBlockKeys === 'function') store.useBlockKeys({ stamp: (st) => stampState(st, hdb), remap: (st) => remapState(st, hdb) });
  return { derived, comparer, duplicates: duplicateKeys(hdb) };
}
