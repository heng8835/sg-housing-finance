// Map search shortcuts (Phase 8 M-13): focusing the EMPTY map search lists, one tap away, the user's own flats
// ("Your choices (3)"), daily places and the towns picked (Start here or the Towns filter). Typing replaces them with
// the normal results. Built from this browser's own data only — nothing is sent anywhere.
// Rows use the search's own kinds ('block' → open the block, 'place' → go there, 'town' → fit the town), so
// legacy.js mPick() handles them unchanged; `group` starts a heading row (groupHead).
import { t } from '../../core/i18n.js';
import { esc } from '../../core/dom.js';

/** At most this many rows per group (the list scrolls; the phone list ends above the sheet's peek). */
export const SHORTCUT_MAX = { choices: 8, places: 4, towns: 6 };

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * @param {{ choices?: object[], places?: object[], towns?: number[], townCount?: number,
 *   townName?: (i:number) => string, choiceSub?: (c:object) => string, hasBlock?: (bid:number) => boolean }} x
 *   towns = the selected town indexes; shown only when they are a real pick (some, not all of townCount).
 * @returns {{ group: string, kind: 'block'|'place'|'town', label: string, sub: string, i?: number, p?: object }[]}
 */
export function searchShortcuts({ choices = [], places = [], towns = [], townCount = 0, townName = String, choiceSub = () => '', hasBlock = () => true } = {}) {
  const out = [];
  const flats = (Array.isArray(choices) ? choices : []).filter((c) => c && Number.isInteger(c.bid) && hasBlock(c.bid));
  const g1 = t('Your choices ({0})', [flats.length]);
  flats.slice(0, SHORTCUT_MAX.choices).forEach((c) => out.push({ group: g1, kind: 'block', label: String(c.name || ''), sub: choiceSub(c) || '', i: c.bid }));
  const g2 = t('Your daily places');
  (Array.isArray(places) ? places : []).filter((w) => w && finite(w.lat) && finite(w.lon)).slice(0, SHORTCUT_MAX.places)
    .forEach((w) => out.push({ group: g2, kind: 'place', label: String(w.name || w.label || ''), sub: w.name && w.label ? String(w.label) : '', p: { lat: w.lat, lon: w.lon } }));
  const picked = (Array.isArray(towns) ? towns : []).filter((i) => Number.isInteger(i) && i >= 0 && i < townCount);
  if (picked.length && picked.length < townCount) {
    const g3 = t('Your towns');
    picked.slice(0, SHORTCUT_MAX.towns).forEach((i) => out.push({ group: g3, kind: 'town', label: townName(i), sub: '', i }));
  }
  return out;
}

/** Heading markup before row k when it starts a new group ('' otherwise). Not a div: rows are `div[data-i]`. */
export function groupHead(items, k) {
  const g = items[k] && items[k].group;
  if (!g || (k > 0 && items[k - 1].group === g)) return '';
  return `<p class="ac-group">${esc(g)}</p>`;
}
