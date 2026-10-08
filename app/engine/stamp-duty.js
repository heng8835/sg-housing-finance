// Buyer's Stamp Duty (BR-T1). Bands come from policy `stamp.bsd.bands`:
// [[bandWidth, rate], ..., [null, topRate]] — null width = "the remainder".
// IRAS: rounded down to the nearest dollar, minimum duty $1.

export function bsd(price, bands) {
  if (!(price > 0)) return 0;
  let left = price, tax = 0;
  for (const [width, rate] of bands) {
    const x = width == null ? left : Math.min(left, width);
    tax += x * rate; left -= x;
    if (left <= 0) break;
  }
  return Math.max(1, Math.floor(tax));
}

/** Additional Buyer's Stamp Duty at `rate` (from policy `stamp.absd.*`, BR-T2); rounded down to the dollar. */
export function absd(price, rate) {
  return price > 0 && rate > 0 ? Math.floor(price * rate) : 0;
}
