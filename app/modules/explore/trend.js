// Explore block card — the "… by year" trend chart (owner feedback G2,
// hdb-data-pipeline/docs/specs/phase5-block-card-design.md §2). One calm blue series that follows the
// colour mode and the selected flat types (owner: the chart must tally with the filters); x-domain = the
// sales-history slider years, the calculation window is shaded (phase5-accept1-design.md §5.3). Presentation only: medians use the same function as legacy.js, nothing feeds back.
// Inline SVG at the measured width (text stays 11 px). Pure parts are exported for node tests;
// drawTrend() wires pointer / keyboard / resize in the browser.
import { t } from '../../core/i18n.js';
import { esc, money } from '../../core/dom.js';
import { niceTicks, sgdShort } from '../../core/axis.js';

export const LOW_N = 3;              // UI heuristic: fewer sales than this → hollow dot, "rough guide" (as legacy trend())
const M = { top: 10, right: 10, bottom: 22, left: 46 };
const LABEL_PX = 34;                 // px: minimum room per year label
const CROSSHAIR = '#9e9d97';
const BAR_MAX = 16;

/** Median — identical to legacy.js l.33 (so "all types, psf" equals the old sparkline numbers). */
export const median = (arr) => { if (!arr.length) return null; const a = arr.slice().sort((x, y) => x - y); const h = a.length >> 1; return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; };

/** Which series the chart shows for a colour mode. Rent needs a town series; commute has no history. */
export function trendSpec(colorBy, hasRentSeries) {
  if (colorBy === 'psf') return 'psf';
  if (colorBy === 'count') return 'count';
  if (colorBy === 'rent' && hasRentSeries) return 'rent';
  return 'price';
}

/** items `{ y:'2024', v }` → `[{ y, v: median, n, lo, hi }]` sorted by year. */
export function yearlyStats(items, med = median) {
  const by = {};
  for (const { y, v } of items) (by[y] = by[y] || []).push(v);
  return Object.keys(by).sort().map((y) => {
    const a = by[y]; let lo = Infinity, hi = -Infinity;
    for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; }
    return { y, v: med(a), n: a.length, lo, hi };
  });
}

/** HDB town quarterly medians → one value per year: that year's latest published quarter (as published). */
export function rentYearly(q, quarters) {
  const by = new Map();
  (quarters || []).forEach((qs, i) => {
    const v = q ? q[i] : null;
    if (v == null) return;
    const [y, quarter] = String(qs).split('-');
    by.set(y, { y, v, n: null, quarter }); // quarters are ascending → the last write is the latest quarter
  });
  return [...by.values()].sort((a, b) => (a.y < b.y ? -1 : a.y > b.y ? 1 : 0));
}

/** Year labels: step 1, 2 or 5 (smallest giving ≥ 34 px each); the last year is always labelled. */
export function yearTicks(first, last, plotW) {
  const px = plotW / (last - first + 1);
  const step = [1, 2, 5, 10].find((s) => s * px >= LABEL_PX) || 10;
  const out = [];
  for (let y = first; y < last; y++) if (y % step === 0 && (last - y) * px >= LABEL_PX) out.push(y);
  out.push(last);
  return out;
}

const yLabel = (mode, v) => (mode === 'count' ? String(v) : mode === 'psf' ? 'S$' + Math.round(v) : sgdShort(v));
const ymFloat = (ym) => { const [y, m] = String(ym).split('-'); return +y + (+m - 1) / 12; };

/**
 * Geometry for a series. opts: { width, height, mode, period: { from:'YYYY-MM', to:'YYYY-MM' },
 * partial: { year, label } | null (the data's last, incomplete year), firstYear, lastYear } — first / last year of the x-domain.
 */
export function trendModel(series, { width, height, mode, period, partial, firstYear, lastYear } = {}) {
  const W = width, H = height, x0 = M.left, x1 = W - M.right, y0 = M.top, y1 = H - M.bottom;
  const first = Math.min(+series[0].y, Number.isFinite(firstYear) ? firstYear : Infinity), last = Math.max(+series.at(-1).y, Number.isFinite(lastYear) ? lastYear : -Infinity);
  const px = (x1 - x0) / (last + 1 - first);
  const X = (yf) => x0 + (yf - first) * px;
  const val = (p) => (mode === 'count' ? p.n : p.v);
  const vs = series.map(val);
  const axis = mode === 'count' ? niceTicks(0, Math.max(...vs), 4) : niceTicks(Math.min(...vs), Math.max(...vs), 4);
  const Y = (v) => y1 - ((v - axis.lo) / (axis.hi - axis.lo || 1)) * (y1 - y0);
  const points = series.map((p) => {
    const year = +p.y, value = val(p);
    const part = mode === 'rent' ? p.quarter !== 'Q4' : !!(partial && partial.year === year);
    const low = mode !== 'rent' && mode !== 'count' && p.n < LOW_N;
    return { ...p, year, value, x: X(year + 0.5), cy: Y(value), partial: part, partialLabel: part ? (mode === 'rent' ? p.quarter : partial.label) : null, low, hollow: part || low, hit: { x: X(year), w: px } };
  });
  const segments = [];
  points.forEach((p, i) => { if (!i || p.year !== points[i - 1].year + 1) segments.push([]); segments.at(-1).push(p); }); // broken across years with no sales
  const bw = Math.min(BAR_MAX, 0.6 * px);
  const bars = mode === 'count' ? points.map((p) => ({ x: p.x - bw / 2, y: p.cy, w: bw, h: Y(axis.lo) - p.cy, hollow: p.partial })) : [];
  let band = null;
  if (period && period.from && period.to) {
    const a = Math.max(x0, X(ymFloat(period.from))), b = Math.min(x1, X(ymFloat(period.to) + 1 / 12));
    if (b > a) band = { x: a, w: b - a };
  }
  const xTicks = yearTicks(first, last, x1 - x0).map((y) => ({ y, x: X(y + 0.5), text: String(y) }));
  const yTicks = axis.ticks.map((v) => ({ v, y: Y(v), text: yLabel(mode, v) }));
  return { W, H, x0, x1, y0, y1, first, last, px, mode, axis, points, segments, bars, band, xTicks, yTicks };
}

const f1 = (n) => n.toFixed(1);
const DOT = 'fill:var(--accent);stroke:var(--surface)', HOLLOW = 'fill:var(--surface);stroke:var(--accent)';
const barPath = (b) => { const r = Math.min(4, b.w / 2, Math.max(0, b.h)), x = b.x, y = b.y, w = b.w, yb = b.y + b.h; return `M${f1(x)},${f1(yb)}V${f1(y + r)}Q${f1(x)},${f1(y)} ${f1(x + r)},${f1(y)}H${f1(x + w - r)}Q${f1(x + w)},${f1(y)} ${f1(x + w)},${f1(y + r)}V${f1(yb)}Z`; };

/** SVG markup for a model. */
export function trendSvg(m, aria) {
  const band = m.band ? `<rect x="${f1(m.band.x)}" y="${m.y0}" width="${f1(m.band.w)}" height="${m.y1 - m.y0}" style="fill:var(--accent-soft)"/>` : '';
  const grid = m.yTicks.map((tk) => `<line x1="${m.x0}" x2="${m.x1}" y1="${f1(tk.y)}" y2="${f1(tk.y)}" style="stroke:var(--border-subtle)" stroke-width="1"/>`).join('');
  const yLab = m.yTicks.map((tk) => `<text x="40" y="${f1(tk.y + 4)}" text-anchor="end" style="fill:var(--text-2)">${esc(tk.text)}</text>`).join('');
  const xLab = m.xTicks.map((tk) => `<line x1="${f1(tk.x)}" x2="${f1(tk.x)}" y1="${m.y1}" y2="${m.y1 + 4}" style="stroke:var(--border-input)"/><text x="${f1(tk.x)}" y="${m.y1 + 16}" text-anchor="middle" style="fill:var(--text-2)">${esc(tk.text)}</text>`).join('');
  const marks = m.mode === 'count'
    ? m.bars.map((b) => `<path d="${barPath(b)}" style="${b.hollow ? HOLLOW : 'fill:var(--accent);stroke:var(--surface)'}" stroke-width="${b.hollow ? 2 : 1}"/>`).join('')
    : m.segments.filter((s) => s.length > 1).map((s) => `<polyline fill="none" style="stroke:var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${s.map((p) => `${f1(p.x)},${f1(p.cy)}`).join(' ')}"/>`).join('')
      + m.points.map((p) => `<circle cx="${f1(p.x)}" cy="${f1(p.cy)}" r="4" style="${p.hollow ? HOLLOW : DOT}" stroke-width="2"/>`).join('');
  const hits = m.points.map((p, i) => `<rect class="tr-hit" data-i="${i}" x="${f1(p.hit.x)}" y="${m.y0}" width="${f1(p.hit.w)}" height="${m.y1 - m.y0}" fill="transparent"/>`).join('');
  return `<svg class="tr-svg" width="${m.W}" height="${m.H}" viewBox="0 0 ${m.W} ${m.H}" tabindex="0" role="img" aria-label="${esc(aria || '')}" font-size="11">
    ${band}${grid}${yLab}${xLab}${marks}
    <g class="tr-hover" visibility="hidden"><line y1="${m.y0}" y2="${m.y1}" stroke="${CROSSHAIR}" stroke-width="1"/><circle r="5" style="${DOT}" stroke-width="2"/></g>
    ${hits}
  </svg>`;
}

/** Tooltip HTML for one year. `src` = { ft, town } for the rent series. */
export function trendTip(p, mode, src = {}) {
  const head = `<b>${p.year}${p.partialLabel ? ` (${esc(p.partialLabel)})` : ''}</b>`;
  const nSales = p.n === 1 ? t('{0} sale', [1]) : t('{0} sales', [p.n]);
  if (mode === 'count') return `${head}<span>${nSales}</span>`;
  if (mode === 'rent') {
    const main = p.quarter === 'Q4' ? t('Q4 median rent {0}', [money(p.v)]) : t('Latest-quarter median rent {0}', [money(p.v)]);
    return `${head}<span>${main}</span><small>${esc(t('{0}, {1} (HDB)', [src.ft || '', src.town || '']))}</small>`;
  }
  const main = mode === 'psf' ? t('Median {0} psf', [money(p.v)]) : t('Median price {0}', [money(p.v)]);
  const range = p.n > 1 ? ' · ' + t('range {0} – {1}', [money(p.lo), money(p.hi)]) : '';
  return `${head}<span>${main}</span><span>${nSales}${range}</span>${p.n < LOW_N ? `<small>${t('Few sales — a rough guide')}</small>` : ''}`;
}

const METRIC = { price: 'Median price', psf: 'Median $psf', count: 'Sales', rent: 'Rent' };
/** One-sentence screen-reader summary. */
export function trendAria(series, mode) {
  const fmtV = (p) => (mode === 'count' ? String(p.n) : money(p.v));
  return t('{0} by year, {1} to {2}: from {3} to {4}.', [t(METRIC[mode]), series[0].y, series.at(-1).y, fmtV(series[0]), fmtV(series.at(-1))]);
}

// ------------------------------------------------------------------ browser
/**
 * Draw into `box` (`.bc-chart`) at its measured width and keep it sized; returns a disposer.
 * opts: { mode, period, partial, firstYear, lastYear, src }.
 */
export function drawTrend(box, series, opts) {
  if (!box || !series || series.length < 2) return () => {};
  const aria = trendAria(series, opts.mode);
  let m = null, idx = null, timer = null, lastW = 0;
  const tip = () => box.querySelector('.bc-tip');
  const height = () => (globalThis.matchMedia && matchMedia('(max-width: 767px)').matches ? 140 : 156);

  function paint() {
    const w = box.clientWidth;
    if (!w || w === lastW) return;
    lastW = w;
    m = trendModel(series, { ...opts, width: w, height: height() });
    box.innerHTML = trendSvg(m, aria) + '<div class="bc-tip" aria-live="polite" hidden></div>';
    idx = null;
    wire();
  }
  function show(i) {
    if (!m) return;
    idx = Math.max(0, Math.min(m.points.length - 1, i));
    const p = m.points[idx], g = box.querySelector('.tr-hover');
    g.setAttribute('visibility', 'visible');
    const ln = g.querySelector('line'); ln.setAttribute('x1', p.x); ln.setAttribute('x2', p.x);
    const c = g.querySelector('circle'); c.setAttribute('cx', p.x); c.setAttribute('cy', p.cy);
    const el = tip();
    el.innerHTML = trendTip(p, opts.mode, opts.src);
    el.hidden = false;
    const flip = p.x > m.W * 0.6;
    el.style.left = flip ? '' : `${Math.round(p.x + 12)}px`;
    el.style.right = flip ? `${Math.round(m.W - p.x + 12)}px` : '';
    el.style.top = `${m.y0}px`;
  }
  function hide() {
    idx = null;
    box.querySelector('.tr-hover')?.setAttribute('visibility', 'hidden');
    const el = tip(); if (el) el.hidden = true;
  }
  function wire() {
    const svg = box.querySelector('svg');
    const at = (e) => { const r = e.target.closest('.tr-hit'); return r ? +r.dataset.i : null; };
    svg.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; const i = at(e); if (i != null && i !== idx) show(i); });
    svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
    svg.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; const i = at(e); if (i == null) return; if (i === idx) hide(); else show(i); });
    svg.addEventListener('keydown', (e) => {
      const n = m.points.length;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); const d = e.key === 'ArrowRight' ? 1 : -1; show(idx == null ? (d > 0 ? 0 : n - 1) : idx + d); }
      else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); e.stopPropagation(); show(e.key === 'Home' ? 0 : n - 1); }
      else if (e.key === 'Escape' && idx != null) { e.stopPropagation(); hide(); }
    });
    svg.addEventListener('blur', hide);
  }
  // a tap outside the chart closes a touch tooltip
  const outside = (e) => { if (idx != null && !box.contains(e.target)) hide(); };
  document.addEventListener('pointerdown', outside, true);

  paint();
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => { if (!m) { paint(); return; } clearTimeout(timer); timer = setTimeout(paint, 120); });
    ro.observe(box);
  }
  return () => { ro?.disconnect(); clearTimeout(timer); document.removeEventListener('pointerdown', outside, true); };
}
