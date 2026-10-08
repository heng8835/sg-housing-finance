// Afford → "The flat": changing the flat type of a block hand-off (Phase 7a, integrator note on A8). The price handed
// over is the median of that block's sales of one type, so a new type must bring its own median (same block, same
// window) and label — or no price at all, never the old type's median under the new type's name. Pure apart from
// the lookup passed in (tests/afford/flattype.test.js); the browser lookup reads core/typical.js over core/data.js.
import { t } from '../../core/i18n.js';
import { ftWord, typicalPrice, lastSelection } from '../../core/typical.js';
import { data } from '../../core/data.js';

/** A focus that came from a block hand-off (its price is that block's median for its type). */
export const isBlockHandoff = (f) => !!(f && f.source === 'block' && f.bid != null);

/**
 * Focus patch for a new flat type.
 * @param {object|null} f  the focus; @param {string} flatType  the new type
 * @param {(bid:number, flatType:string) => ({ price:number, n:number }|null)} lookup  the block's median for a type
 * @param {string} blockLabel  e.g. '334B Ang Mo Kio Ave 1'
 * @returns {object}  { flatType } for any other focus; for a block hand-off also price (null = no sales) and label
 */
export function retypePatch(f, flatType, lookup, blockLabel) {
  if (!isBlockHandoff(f) || flatType === f.flatType) return { flatType };
  const r = lookup(f.bid, flatType);
  if (r && r.price > 0) return { flatType, price: Math.round(r.price), label: t('{0} — median of recent {1} sales', [blockLabel, ftWord(flatType)]) };
  return { flatType, price: null, label: t('{0} — no recent sales', [blockLabel]) };
}

/** Hint under the flat form when a block hand-off has no price for its type ('' otherwise). */
export function noSalesHint(f) {
  if (!isBlockHandoff(f) || f.price > 0 || !f.flatType) return '';
  return `<p class="hint" id="afNoSales">${t('No recent {0} sales in this block — type a price', [ftWord(f.flatType)])}</p>`;
}

/** Browser lookup: the block's median resale price for a type in the map's calculation window (core/typical.js). */
export function blockMedian(bid, flatType) {
  const r = typicalPrice({ flatType, scope: { kind: 'area', blockIds: [bid], label: '' }, window: (lastSelection() || {}).window || null });
  return r ? { price: r.price, n: r.n } : null;
}

/** Label of a block for the focus label. */
export const blockLabelOf = (bid) => (data.block(bid) || {}).label || '';
