// Commute estimates: block -> hub public-transport minutes from the build-time table
// (tools/build_commute.py -> window.HDB_COMMUTE). Pure: the caller passes the data object.
// The minutes are a model ESTIMATE (walk / feeder bus + MRT/LRT graph), not a journey planner.
//
// Data shape: { block_count, na, encoding: 'base64-uint8', hubs: [{ id, name, cat, lat, lon }],
//   minutes: { hubId: base64 string, one byte per HDB_DATA.blocks index } }.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const RADIX = ALPHABET.length;             // bits per char = log2(RADIX)
const BYTE = RADIX * 2 * 2;                // 256 values per byte
const CHARS_PER_GROUP = 2 * 2;             // base64: 4 chars ...
const BYTES_PER_GROUP = CHARS_PER_GROUP - 1; // ... carry 3 bytes
const INDEX = Object.fromEntries([...ALPHABET].map((c, i) => [c, i]));

const BANDS = ['short', 'ok', 'long', 'very-long'];

function encoded(data, hubId) {
  const s = data && data.minutes ? data.minutes[hubId] : undefined;
  return typeof s === 'string' ? s : null;
}

/** Value of base64 group g as an integer (padding '=' counts as 0). */
function groupValue(s, g) {
  let n = 0;
  for (let j = 0; j < CHARS_PER_GROUP; j++) n = n * RADIX + (INDEX[s[g * CHARS_PER_GROUP + j]] ?? 0);
  return n;
}

function byteAt(s, k) {
  const g = Math.floor(k / BYTES_PER_GROUP);
  const pos = k % BYTES_PER_GROUP;
  const n = groupValue(s, g);
  return Math.floor(n / BYTE ** (BYTES_PER_GROUP - 1 - pos)) % BYTE;
}

/** Hub metadata by id, or null. */
export function commuteHub(data, hubId) {
  return (data && data.hubs || []).find((h) => h.id === hubId) || null;
}

/** All minutes for one hub as a Uint8Array in HDB_DATA.blocks order (data.na = not available), or null for an unknown hub. */
export function decodeMinutes(data, hubId) {
  const s = encoded(data, hubId);
  if (s == null) return null;
  const n = data.block_count;
  const out = new Uint8Array(n);
  for (let g = 0; g * BYTES_PER_GROUP < n; g++) {
    const v = groupValue(s, g);
    for (let pos = 0; pos < BYTES_PER_GROUP && g * BYTES_PER_GROUP + pos < n; pos++) {
      out[g * BYTES_PER_GROUP + pos] = Math.floor(v / BYTE ** (BYTES_PER_GROUP - 1 - pos)) % BYTE;
    }
  }
  return out;
}

/** Estimated minutes from block `blockIndex` (HDB_DATA.blocks index) to hub, or null when unknown / not available. */
export function commuteMinutes(data, blockIndex, hubId) {
  const s = encoded(data, hubId);
  if (s == null || !Number.isInteger(blockIndex) || blockIndex < 0 || blockIndex >= data.block_count) return null;
  const v = byteAt(s, blockIndex);
  return v === data.na ? null : v;
}

/** 'short' | 'ok' | 'long' | 'very-long' using policy commute.band.edges_min; null for missing minutes. */
export function commuteBand(minutes, policy) {
  if (minutes == null || !Number.isFinite(minutes)) return null;
  const edges = policy.get('commute.band.edges_min');
  const i = edges.findIndex((e) => minutes <= e);
  return BANDS[i < 0 ? edges.length : i];
}

/**
 * Household view for several commuters (e.g. two workers): per-hub minutes, the longest
 * (max) and the total (sum). max/sum are null unless every hub has a value.
 */
export function combinedCommute(data, blockIndex, hubIds) {
  const perHub = (hubIds || []).map((hubId) => ({ hubId, minutes: commuteMinutes(data, blockIndex, hubId) }));
  const complete = perHub.length > 0 && perHub.every((h) => h.minutes != null);
  const vals = perHub.map((h) => h.minutes);
  return {
    perHub,
    complete,
    max: complete ? Math.max(...vals) : null,
    sum: complete ? vals.reduce((a, b) => a + b, 0) : null,
  };
}
