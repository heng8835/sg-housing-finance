// One search normaliser for every place / block search (Phase 7c C3): the map search, Daily places
// (core/placesearch.js), the block pickers (core/blocksearch.js → Start here, Rent & Buy, Plan → Sell then buy) and
// the Choices address box. Punctuation is ignored ("St. Hilda's" = "st hildas", "C'wealth" = "cwealth"), "Blk" is
// dropped, and long street words become the short forms HDB uses — on both the query AND the data, so either spelling
// matches. A word list per place also carries the long forms, so typing the start of one ("commonw", "buk") still hits.
// Pure, no DOM; the per-string word lists are memoised (the data never changes during a session).

/** Long word → the short form HDB street names use. "ST" is both Street and Saint (the data writes "ST." for Saint). */
export const SHORT = {
  AVENUE: 'AVE', STREET: 'ST', SAINT: 'ST', ROAD: 'RD', DRIVE: 'DR', CRESCENT: 'CRES', CLOSE: 'CL', NORTH: 'NTH',
  SOUTH: 'STH', CENTRAL: 'CTRL', CENTRE: 'CTR', BUKIT: 'BT', JALAN: 'JLN', LORONG: 'LOR', UPPER: 'UPP', TANJONG: 'TG',
  KAMPONG: 'KG', COMMONWEALTH: 'CWEALTH', TERRACE: 'TER', HEIGHTS: 'HTS', GARDENS: 'GDNS', GARDEN: 'GDN', PLACE: 'PL',
  PARK: 'PK', MARKET: 'MKT',
};
const LONG = {};
for (const [l, s] of Object.entries(SHORT)) (LONG[s] = LONG[s] || []).push(l);
const DROP = new Set(['BLK', 'BLOCK']);

/** "Blk 406 Ang Mo Kio Avenue 10" → "406 ANG MO KIO AVE 10"; "St. Hilda's" → "ST HILDAS"; "C'wealth" → "CWEALTH". */
export function canon(s) {
  return String(s || '').toUpperCase().replace(/['’‘`]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim()
    .split(' ').filter((w) => w && !DROP.has(w)).map((w) => SHORT[w] || w).join(' ');
}

/** The typed words, normalised (empty array for nothing searchable). */
export const tokens = (q) => { const c = canon(q); return c ? c.split(' ') : []; };

const CACHE = new Map();
const CACHE_MAX = 60000; // ≈ every block + street + place in data.js / poi.js; cleared (not grown) past this
/** { key: canon(s), words: canonical words + their long forms } for one data string (memoised). */
export function prep(s) {
  const k = String(s || '');
  let p = CACHE.get(k);
  if (p) return p;
  const key = canon(k), set = new Set(key ? key.split(' ') : []);
  for (const w of [...set]) for (const l of LONG[w] || []) set.add(l);
  p = { key, words: [...set] };
  if (CACHE.size >= CACHE_MAX) CACHE.clear();
  CACHE.set(k, p);
  return p;
}

/** Every token starts some word (numbers: the whole word only, so "40" never finds block 406). */
export const wordHit = (words, toks) => toks.length > 0 && toks.every((k) => words.some((w) => (/^\d+$/.test(k) ? w === k : w.startsWith(k))));

/** Does the data string `s` match the typed tokens? */
export const hits = (s, toks) => wordHit(prep(s).words, toks);

/** Does the data string start with the first typed word (ranks "Bishan St 12" above "12 Bishan St")? */
export const startsWithTok = (s, toks) => toks.length > 0 && prep(s).key.startsWith(toks[0]);

/** Display fix for names title-cased upstream (poi.js schools): "St. Hilda'S" → "St. Hilda's"; nothing else changes. */
export const tidyName = (s) => (!/[a-z]/.test(String(s ?? '')) ? String(s ?? '') : String(s).replace(/([A-Za-z])['’]S\b/g, "$1's")); // all-caps names stay as they are

/** Rank of a data string for the typed tokens (lower first): starts with the first word, then has the words in order. */
export const rankOf = (s, toks) => (startsWithTok(s, toks) ? 0 : 2) + (toks.length > 1 && prep(s).key.includes(toks.join(' ')) ? 0 : 1);

/** Title case for display: "ST. HILDA'S PRIMARY" → "St. Hilda's Primary", "C'WEALTH CRES" → "C'wealth Cres". */
export const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|[\s/(-])([a-z])/g, (_, a, c) => a + c.toUpperCase());
