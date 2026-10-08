// Explore → Afford / Rent check / My choices hand-offs (Phase 7a A8, phase7-user-feedback.md §3). The flat type handed
// over is always the type of the sales behind the price handed over — one type, never a default 4-room or "the first
// selected type". When a block's sales mix types, the most-sold of the user's selected types is used and the label
// says so. Block card "Add a flat from this block…": the user's flat type here with its median price / size; added
// directly when only one flat type is selected and the block has sales of it, else the My choices form is prefilled
// and highlighted. Pure parts first (node tests: tests/explore/handoff.test.js); createHandoff() reads legacy's data.
// Every number here is a UI heuristic (RECENT_M), never a Singapore rule.
import { t } from '../../core/i18n.js';
import { ftWord } from '../../core/typical.js';

export const RECENT_M = 24;     // "Add a flat…" prefills from the last 24 months of sales, else all years (as before)
export const FLASH_MS = 1600;   // form highlight (styles/card.css .ho-flash)

/** Transactions per flat-type index: Map(ft → n). */
export function typeCounts(idx, ftOf) {
  const c = new Map();
  for (const i of idx) { const f = ftOf(i); c.set(f, (c.get(f) || 0) + 1); }
  return c;
}

/** Most common type in `counts`, only among `only` when given; a tie goes to the larger type (higher index). null if none. */
export function topType(counts, only = null) {
  const ok = only ? new Set(only) : null;
  let best = null, bn = 0;
  for (const [f, n] of counts) {
    if (ok && !ok.has(f)) continue;
    if (n > bn || (n === bn && f > best)) { best = f; bn = n; }
  }
  return best;
}

/**
 * The one flat type behind a hand-off price. idx = the transactions behind the card's median (the same set as the
 * "Prices" tiles); selected = the user's flat-type indices. Price = median of the sales of that type only, so the
 * price and the type always match.
 * @returns {{ ft:number, price:number|null, n:number, mixed:boolean, mine:boolean } | null} null = no sales in idx.
 *   mixed: idx has more than one type; mine: ft is one of the selected types.
 */
export function handoffFlat({ idx, ftOf, priceOf, selected, median }) {
  const c = typeCounts(idx, ftOf);
  if (!c.size) return null;
  const mineFt = topType(c, selected), ft = mineFt ?? topType(c);
  const prices = idx.filter((i) => ftOf(i) === ft).map(priceOf);
  return { ft, price: median(prices), n: prices.length, mixed: c.size > 1, mine: mineFt != null };
}

/** Flat type for a hand-off without a price (no sales in the window): the user's most-sold type here, else the only
 *  selected type, else the block's most-sold type; null for a block that was never sold with several types selected. */
export function typeWithoutPrice({ all, ftOf, selected }) {
  const c = typeCounts(all, ftOf);
  return topType(c, selected) ?? (selected.length === 1 ? selected[0] : null) ?? topType(c);
}

/**
 * "Add a flat from this block…": the user's flat type here = most sales among the selected types (last RECENT_M
 * months, else all years); `same` = that type's sales to take the medians from. direct = only one type selected and
 * the block has sales of it (add without the form).
 * @returns {{ ft:number|null, same:number[], mine:boolean, direct:boolean }}
 */
export function addPlan({ recent, all, ftOf, selected }) {
  let ft = topType(typeCounts(recent, ftOf), selected);
  if (ft == null) ft = topType(typeCounts(all, ftOf), selected);
  const mine = ft != null;
  if (ft == null) ft = selected.length === 1 ? selected[0] : topType(typeCounts(all, ftOf));
  if (ft == null && selected.length) ft = Math.max(...selected); // never sold, several types: the largest selected
  let same = recent.filter((i) => ftOf(i) === ft);
  if (!same.length) same = all.filter((i) => ftOf(i) === ft);
  return { ft, same, mine, direct: selected.length === 1 && mine };
}

/** Focus label: "334B Ang Mo Kio Ave 1 — median of recent 3-room sales", plus which type when the sales mix types. */
export function focusLabel(blockLabel, ftName, h) {
  if (!h) return t('{0} — no recent sales', [blockLabel]);
  if (h.mixed && h.mine) return `${t('{0} — median of recent sales', [blockLabel])} · ${t('Using {0} — the type of the recent sales here; change it', [ftWord(ftName)])}`;
  if (!h.mine) return `${t('{0} — median of recent sales', [blockLabel])} · ${t('Using {0} — none of your flat types sold here recently; change it', [ftWord(ftName)])}`;
  return t('{0} — median of recent {1} sales', [blockLabel, ftWord(ftName)]);
}

/** Nearest storey option (3-storey band) to a median storey index. storeyMid[s] = band middle; choices = [{ i }]. */
export function nearestStorey(medianS, storeyMid, choices) {
  if (medianS == null || !choices.length) return null;
  const want = storeyMid[Math.round(medianS)];
  return choices.reduce((p, c) => (Math.abs(storeyMid[c.i] - want) < Math.abs(storeyMid[p.i] - want) ? c : p), choices[0]).i;
}

/** Scroll the form into view, focus `el`, flash the form briefly. */
export function flashForm(form, el) {
  if (!form) return;
  form.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  el?.focus({ preventScroll: true });
  form.classList.remove('ho-flash'); void form.offsetWidth; form.classList.add('ho-flash');
  setTimeout(() => form.classList.remove('ho-flash'), FLASH_MS);
}

// ------------------------------------------------------------------ browser (legacy data)
/**
 * ctx: { D, TX, blockTx, getS, getAgg, txOk, median, lastMonthIdx, storeyMid, storeyChoices }
 * → { flat(bi), focus(bi, remainingLease), add(bi) }
 */
export function createHandoff(ctx) {
  const { D, TX, blockTx, getS, getAgg, txOk, median, lastMonthIdx, storeyMid, storeyChoices } = ctx;
  const ftOf = (i) => TX.ft[i];

  // the transactions behind the card's "Prices" tiles (card.js content(): blockAgg, else all types in the window)
  function behind(bi) {
    const S = getS(), ftSet = new Set(S.ft), inWin = (i) => TX.m[i] >= S.mFrom && TX.m[i] <= S.mTo;
    return getAgg()[bi] ? blockTx[bi].filter((i) => inWin(i) && ftSet.has(TX.ft[i]) && txOk(i)) : blockTx[bi].filter(inWin);
  }

  /** { ft: name, price, n, mixed, mine } of the Afford / Rent hand-off, or null (no sales in the window). */
  function flat(bi) {
    const h = handoffFlat({ idx: behind(bi), ftOf, priceOf: (i) => TX.p[i], selected: getS().ft, median });
    return h && { ...h, ft: D.flat_types[h.ft] };
  }

  /** The focus object for Afford / Rent check. */
  function focus(bi, remainingLease) {
    const b = D.blocks[bi], h = flat(bi);
    const ft = h ? h.ft : D.flat_types[typeWithoutPrice({ all: blockTx[bi], ftOf, selected: getS().ft })] || null;
    return { source: 'block', bid: bi, label: focusLabel(b.label, ft, h), price: h && h.price ? Math.round(h.price) : null, flatType: ft, remainingLease };
  }

  /** "Add a flat from this block…" → { direct, row: { ft, storey, sqm, price }, n } (sqm / price null = no sales). */
  function add(bi) {
    const all = blockTx[bi], recent = all.filter((i) => TX.m[i] >= lastMonthIdx - (RECENT_M - 1));
    const p = addPlan({ recent, all, ftOf, selected: getS().ft });
    const s = p.same, n = s.length;
    const row = {
      ft: p.ft ?? 0,
      storey: nearestStorey(median(s.map((i) => TX.s[i])), storeyMid, storeyChoices),
      sqm: n ? Math.round(median(s.map((i) => TX.a[i]))) : null,
      price: n ? Math.round(median(s.map((i) => TX.p[i])) / 1000) * 1000 : null,
    };
    return { direct: p.direct && n > 0, row, n };
  }

  return { flat, focus, add };
}
