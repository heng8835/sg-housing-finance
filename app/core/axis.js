// Chart axis helpers shared by the inline-SVG charts (niceTicks / sgdShort copied verbatim from modules/rent/chart.js, which
// keeps its own copy for now — moving Rent onto this file is a later step). Pure: no DOM.

const STEPS = [1, 2, 2.5, 5];
const MINUS = '−';

/**
 * "Nice" axis ticks covering [lo, hi]: step from {1, 2, 2.5, 5}×10ⁿ, at most n ticks.
 * @returns {{ lo:number, hi:number, step:number, ticks:number[] }}
 */
export function niceTicks(lo, hi, n = 5) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: 0, hi: 1, step: 1, ticks: [0, 1] };
  if (hi < lo) [lo, hi] = [hi, lo];
  if (hi === lo) { const d = Math.abs(hi) || 1; lo -= d / 2; hi += d / 2; }
  const raw = (hi - lo) / Math.max(1, n - 1);
  let mag = 10 ** Math.floor(Math.log10(raw));
  for (let guard = 0; guard < 8; guard += 1, mag *= 10) {
    for (const s of STEPS) {
      const step = s * mag;
      if (step < raw * (1 - 1e-9)) continue;
      const a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step;
      const count = Math.round((b - a) / step) + 1;
      if (count <= n) {
        const ticks = Array.from({ length: count }, (_, i) => +(a + i * step).toPrecision(12));
        return { lo: ticks[0], hi: ticks.at(-1), step, ticks };
      }
    }
  }
  return { lo, hi, step: hi - lo, ticks: [lo, hi] };
}

const trim = (x) => String(+x.toFixed(1));

/** Short S$ axis label: S$0, S$250k, S$1.2m, −S$50k (same in 中文). */
export function sgdShort(v) {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v), sign = v < 0 ? MINUS : '';
  if (a < 0.5) return 'S$0';
  if (a >= 1e6) return `${sign}S$${trim(a / 1e6)}m`;
  if (a >= 1e3) return `${sign}S$${trim(a / 1e3)}k`;
  return `${sign}S$${Math.round(a)}`;
}

// ---- quarter axis (Rent & Buy trend chart) ----
const YEAR_LABEL_PX = 34;   // px: minimum room per year label (same rule as the explore trend's yearTicks)
const END_LABEL_PX = 52;    // px: room kept clear for the last-quarter label ("Q2 2026")
const MINOR_PX = 6;         // px: quarter ticks only when at least this far apart

/** '2019-Q3' → { year: 2019, q: 3 } (null when malformed). */
export function parseQuarter(s) {
  const m = /^(\d{4})-Q([1-4])$/.exec(String(s || ''));
  return m ? { year: +m[1], q: +m[2] } : null;
}

/**
 * Ticks for a continuous quarter axis from firstQ to lastQ ('YYYY-Qn'), plotW px wide.
 * Index i = quarters after firstQ (x = i / (count − 1) × plotW).
 * @returns {{ count:number, px:number, step:number, minor:number[], major:{i:number, year:number, label:boolean}[],
 *   end:{i:number, year:number, q:number} } | null}
 *   minor = every quarter (only when ≥ 6 px apart); major = each year's Q1 inside the range;
 *   label = that year is labelled (year step 1/2/5/10, the smallest giving ≥ 34 px, clear of the end label);
 *   end = the last quarter, always labelled ("Q2 2026") by the caller.
 * room (optional, phones with bigger labels): { yearPx, endPx } replace the 34 / 52 px rules.
 */
export function quarterTicks(firstQ, lastQ, plotW, { yearPx: yearRoom = YEAR_LABEL_PX, endPx = END_LABEL_PX } = {}) {
  const a = parseQuarter(firstQ), b = parseQuarter(lastQ);
  if (!a || !b) return null;
  const idx = (y, q) => (y - a.year) * 4 + (q - 1) - (a.q - 1);
  const count = idx(b.year, b.q) + 1;
  if (count < 1) return null;
  const px = count > 1 ? plotW / (count - 1) : plotW;
  const yearPx = px * 4;
  const step = [1, 2, 5, 10].find((s) => s * yearPx >= yearRoom) || 10;
  const minor = px >= MINOR_PX ? Array.from({ length: count }, (_, i) => i) : [];
  const major = [];
  for (let y = a.q === 1 ? a.year : a.year + 1; y <= b.year; y++) {
    const i = idx(y, 1);
    if (i < 0 || i >= count) continue;
    major.push({ i, year: y, label: y % step === 0 && (count - 1 - i) * px >= endPx });
  }
  return { count, px, step, minor, major, end: { i: count - 1, year: b.year, q: b.q } };
}
