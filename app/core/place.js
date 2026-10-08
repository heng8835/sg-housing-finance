// Coach-mark geometry (pure — no DOM, node-testable), shared by the guided tour (modules/guide) and the guides
// "Show me" spotlight (modules/guides). Rects are { left, top, right, bottom } in viewport px.

export const HOLE_PAD = 6;   // spotlight padding around the target
export const EDGE = 12;      // min distance from the viewport edges
export const GAP = 14;       // target ↔ popover (room for the 10 px arrow)
export const PHONE_MAX = 767;
const ARROW_INSET = 18;      // keep the arrow off the popover's rounded corners

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Intersection of two rects, or null when they do not overlap. */
export function intersect(a, b) {
  const r = { left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) };
  return r.right > r.left && r.bottom > r.top ? r : null;
}

/** Spotlight rect: the visible part of the target + padding, kept inside the viewport. */
export function holeRect(visible, vw, vh, pad = HOLE_PAD) {
  if (!visible) return null;
  return intersect({ left: visible.left - pad, top: visible.top - pad, right: visible.right + pad, bottom: visible.bottom + pad },
    { left: 2, top: 2, right: vw - 2, bottom: vh - 2 });
}

/**
 * Desktop popover position. Tries right of the target (panel targets → over the map), then below, above, left;
 * centred when nothing fits or there is no target. Returns { left, top, side, arrow } — arrow = px along the edge.
 */
export function placePop(hole, pw, ph, vw, vh, { edge = EDGE, gap = GAP } = {}) {
  const centre = { left: Math.max(edge, (vw - pw) / 2), top: Math.max(edge, (vh - ph) / 2), side: 'center', arrow: null };
  if (!hole) return centre;
  const cx = (hole.left + hole.right) / 2, cy = (hole.top + hole.bottom) / 2;
  const maxL = Math.max(edge, vw - edge - pw), maxT = Math.max(edge, vh - edge - ph);
  const tries = [
    ['right', () => hole.right + gap + pw <= vw - edge, () => ({ left: hole.right + gap, top: clamp(cy - ph / 2, edge, maxT) })],
    ['below', () => hole.bottom + gap + ph <= vh - edge, () => ({ left: clamp(cx - pw / 2, edge, maxL), top: hole.bottom + gap })],
    ['above', () => hole.top - gap - ph >= edge, () => ({ left: clamp(cx - pw / 2, edge, maxL), top: hole.top - gap - ph })],
    ['left', () => hole.left - gap - pw >= edge, () => ({ left: hole.left - gap - pw, top: clamp(cy - ph / 2, edge, maxT) })],
  ];
  for (const [side, fits, pos] of tries) {
    if (!fits()) continue;
    const p = pos();
    const arrow = side === 'right' || side === 'left' ? clamp(cy - p.top, ARROW_INSET, ph - ARROW_INSET) : clamp(cx - p.left, ARROW_INSET, pw - ARROW_INSET);
    return { ...p, side, arrow };
  }
  return centre;
}

/** Phone: the popover is a docked card — at the top (below the header) when the target is in the lower half. */
export function dockSide(hole, vh) {
  if (!hole) return 'bottom';
  return (hole.top + hole.bottom) / 2 > vh / 2 ? 'top' : 'bottom';
}

/** Local calendar date as YYYY-MM-DD (completion memory). */
export function isoDay(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
