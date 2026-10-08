// Chinese town names for the map search (Phase 7b B15). The names live in a data file the owner reviews
// (i18n/towns.zh.json: { towns: { 'ANG MO KIO': ['宏茂桥'], ... } }); this module turns a typed query that
// contains them into the English town name the existing search understands, and labels town results in 中文.
// Pure apart from the one same-origin fetch in loadTownAliases (fixed path, no user data).
import { currentLang } from './i18n.js';

let aliases = {}; // 'ANG MO KIO' → ['宏茂桥', ...]
let loading = null;

const CJK = /[㐀-䶿一-鿿豈-﫿]+/g;
const CJK_PUNCT = /[　-〿＀-￯·]/g;
export const MIN_PARTIAL = 2; // a partial Chinese name needs at least two characters ("裕廊" → Jurong East + West)

/** Use these aliases (tests; the browser loads the file). Returns the map in use. */
export function setTownAliases(doc) {
  const towns = (doc && doc.towns) || {};
  aliases = Object.fromEntries(Object.entries(towns).filter(([, v]) => Array.isArray(v) && v.length).map(([k, v]) => [k.toUpperCase(), v.map(String)]));
  return aliases;
}

/** Load i18n/towns.zh.json once (a missing file just means no Chinese town search). */
export function loadTownAliases(fetchFn = globalThis.fetch) {
  if (!loading) {
    loading = typeof fetchFn !== 'function' ? Promise.resolve(aliases)
      : fetchFn('i18n/towns.zh.json').then((r) => (r.ok ? r.json() : {})).then(setTownAliases).catch(() => aliases);
  }
  return loading;
}

/** First Chinese name of a town ('ANG MO KIO' → '宏茂桥'), or null. */
export const zhTownName = (town) => (aliases[String(town || '').toUpperCase()] || [])[0] || null;

/**
 * A query with Chinese town names → { rest, towns }:
 * rest  = the query with each full Chinese name replaced by the English town name (so "宏茂桥 ave 10" finds blocks
 *         too) and leftover Chinese / full-width punctuation removed;
 * towns = indexes (in `towns`, the data's town list) of towns named in full, or partly (≥ MIN_PARTIAL characters).
 * A query without Chinese characters comes back unchanged with no towns.
 */
export function zhTownSearch(q, towns, map = aliases) {
  const text = String(q || '');
  if (!text.match(CJK)) return { rest: text, towns: [] };
  const index = new Map((towns || []).map((tn, i) => [String(tn).toUpperCase(), i]));
  const hits = new Set();
  const pairs = Object.entries(map).flatMap(([town, names]) => names.map((n) => [n, town])).sort((a, b) => b[0].length - a[0].length);
  let rest = text;
  for (const [name, town] of pairs) {
    if (!index.has(town) || !rest.includes(name)) continue;
    hits.add(index.get(town));
    rest = rest.split(name).join(` ${town} `);
  }
  for (const run of rest.match(CJK) || []) {
    if (run.length < MIN_PARTIAL) continue;
    for (const [name, town] of pairs) if (index.has(town) && name.includes(run)) hits.add(index.get(town));
  }
  rest = rest.replace(CJK, ' ').replace(CJK_PUNCT, ' ').replace(/\s+/g, ' ').trim();
  return { rest, towns: [...hits].sort((a, b) => a - b) };
}

/**
 * Label + sub-line of a town search result. 中文: label = the Chinese name (short, so it sorts first), sub-line =
 * "Ang Mo Kio · 中区"; otherwise the English label and the region as before.
 */
export function zhTownRow(label, town, region, lang = currentLang()) {
  const zh = lang === 'zh' ? zhTownName(town) : null;
  return zh ? { label: zh, sub: region ? `${label} · ${region}` : label } : { label, sub: region };
}
