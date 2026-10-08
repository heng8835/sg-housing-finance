// Rent & Buy → "Is this rent fair?" trend: HDB quarterly median rent for one town + flat type on a continuous
// quarter axis (year labels, last quarter labelled), range 5 y / 10 y / All, optional asking-rent line, and a
// pointer / touch / keyboard tooltip. Inline SVG at the measured width (ResizeObserver, like chart.js).
import { esc, money } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { niceTicks, sgdShort, quarterTicks, parseQuarter } from '../../core/axis.js';
import { ftWord } from '../../core/typical.js';

const M = { top: 14, right: 12, bottom: 26, left: 46 };
export const RANGES = [['5', 20, '5 y'], ['10', 40, '10 y'], ['all', null, 'All']]; // [id, quarters, label]
export const DEFAULT_RANGE = '10';
const CROSSHAIR = '#9e9d97';
const PHONE = '(max-width: 767px)';
const halo = 'paint-order:stroke;stroke:var(--surface);stroke-width:3px;stroke-linejoin:round';

// ---- pure helpers (tests/rent/rentchart.test.js) ----

/** 'Q3 2024' (中文 via the template). */
export const qLabel = (q) => { const p = parseQuarter(q); return p ? t('Q{0} {1}', [p.q, p.year]) : String(q || ''); };

/**
 * Geometry for the chart. `q` = median per quarter (null = no figure), `quarters` = labels ('2005-Q2'…).
 * The window ends at the last quarter with a figure and spans the range (All = from the first figure).
 * @returns {null | { W, H, x0, x1, y0, y1, first, last, pts:{i, q, v, x, y}[], segs:number[][][], yTicks, ticks, ask }}
 */
export function rentChartModel({ q, quarters, range = DEFAULT_RANGE, width = 320, phone = false, asking = null }) {
  const n = Math.min((q || []).length, (quarters || []).length);
  let end = n - 1;
  while (end >= 0 && !(q[end] > 0)) end--;
  if (end < 0) return null;
  let start = 0;
  while (start < end && !(q[start] > 0)) start++;
  const span = (RANGES.find((r) => r[0] === range) || RANGES[1])[1];
  if (span) start = Math.max(start, end - span + 1);
  const vals = [];
  for (let i = start; i <= end; i++) if (q[i] > 0) vals.push(q[i]);
  if (vals.length < 2) return null;
  const W = Math.max(220, Math.round(width)), H = phone ? 160 : 180;
  const x0 = M.left, x1 = W - M.right, y0 = M.top, y1 = H - M.bottom, count = end - start + 1;
  const ask = asking > 0 ? asking : null;
  const axis = niceTicks(Math.min(...vals, ask ?? Infinity), Math.max(...vals, ask ?? -Infinity), 4);
  const x = (k) => x0 + (count > 1 ? k / (count - 1) : 0) * (x1 - x0);
  const y = (v) => y1 - ((v - axis.lo) / (axis.hi - axis.lo || 1)) * (y1 - y0);
  const pts = [], segs = [];
  let cur = null;
  for (let k = 0; k < count; k++) {
    const v = q[start + k] > 0 ? q[start + k] : null;
    const p = { i: k, q: quarters[start + k], v, x: x(k), y: v == null ? null : y(v) };
    pts.push(p);
    if (v == null) { cur = null; continue; }
    if (!cur) { cur = []; segs.push(cur); }
    cur.push([p.x, p.y]);
  }
  return { W, H, x0, x1, y0, y1, first: quarters[start], last: quarters[end], pts, segs,
    yTicks: axis.ticks.map((v) => ({ v, y: y(v), text: sgdShort(v) })), ticks: quarterTicks(quarters[start], quarters[end], x1 - x0),
    ask: ask == null ? null : { v: ask, y: y(ask) } };
}

/** Index of the nearest quarter with a figure to px (or to index `from` stepped by `dir`). */
export function nearestPoint(pts, px) {
  let best = -1;
  for (const p of pts) if (p.v != null && (best < 0 || Math.abs(p.x - px) < Math.abs(pts[best].x - px))) best = p.i;
  return best;
}
export function stepPoint(pts, from, dir) {
  for (let i = from + dir; i >= 0 && i < pts.length; i += dir) if (pts[i].v != null) return i;
  return from;
}
/** Jump `delta` quarters from index `from` (clamped); lands on the nearest figure back toward `from`. */
export function jumpPoint(pts, from, delta) {
  const dir = Math.sign(delta) || 1;
  const to = Math.max(0, Math.min(pts.length - 1, from + delta));
  for (let i = to; i !== from; i -= dir) if (pts[i].v != null) return i;
  return from;
}

/** Tooltip lines for one quarter: title, median, series, and the asking comparison when an asking rent is set. */
export function rentTip(p, { flatType, town, asking = null }) {
  const lines = [`<b>${esc(qLabel(p.q))}</b>`, `<span>${esc(t('Median rent {0}', [money(p.v)]))}</span>`,
    `<span>${esc(t('{0}, {1} (HDB)', [ftWord(flatType), town]))}</span>`];
  if (asking > 0) {
    const d = Math.round(asking - p.v);
    lines.push(`<small>${esc(d === 0 ? t('Asking equals the median') : d > 0 ? t('Asking is {0} above', [money(d)]) : t('Asking is {0} below', [money(-d)]))}</small>`);
  }
  return lines.join('');
}

/** Screen-reader summary: "Town median rent, Q3 2016 to Q2 2026: from S$2,100 to S$3,400." */
export function rentAria(m) {
  const vs = m.pts.filter((p) => p.v != null);
  return t('Town median rent, {0} to {1}: from {2} to {3}.', [qLabel(m.first), qLabel(m.last), money(vs[0].v), money(vs.at(-1).v)]);
}

const poly = (seg) => seg.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ');

/** SVG markup for a model. */
export function rentChartSvg(m, aria) {
  const grid = m.yTicks.map((k) => `<line x1="${m.x0}" x2="${m.x1}" y1="${k.y.toFixed(1)}" y2="${k.y.toFixed(1)}" style="stroke:var(--border-subtle)" stroke-width="1"/>
    <text x="${m.x0 - 6}" y="${(k.y + 4).toFixed(1)}" text-anchor="end" style="fill:var(--text-2)">${esc(k.text)}</text>`).join('');
  // ticks come from the quarter labels; a gap in HDB's quarter list can put one past the last point — skip it (7b)
  const X = (i) => m.pts[i].x.toFixed(1), tk = m.ticks && { minor: m.ticks.minor.filter((i) => m.pts[i]), major: m.ticks.major.filter((j) => m.pts[j.i]) };
  const minor = tk ? tk.minor.map((i) => `<line x1="${X(i)}" x2="${X(i)}" y1="${m.y1}" y2="${m.y1 + 2}" style="stroke:var(--border-input)"/>`).join('') : '';
  const major = tk ? tk.major.map((j) => `<line x1="${X(j.i)}" x2="${X(j.i)}" y1="${m.y1}" y2="${m.y1 + 4}" style="stroke:var(--border-input)"/>${j.label
    ? `<text x="${X(j.i)}" y="${m.y1 + 16}" text-anchor="middle" style="fill:var(--text-2)">${j.year}</text>` : ''}`).join('') : '';
  const endLbl = `<text x="${m.x1}" y="${m.y1 + 16}" text-anchor="end" style="fill:var(--text-2)">${esc(qLabel(m.last))}</text>`;
  const lines = m.segs.map((s) => (s.length > 1 ? `<polyline fill="none" style="stroke:var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${poly(s)}"/>`
    : `<circle cx="${s[0][0].toFixed(1)}" cy="${s[0][1].toFixed(1)}" r="1.5" style="fill:var(--accent)"/>`)).join('');
  const lastPt = [...m.pts].reverse().find((p) => p.v != null);
  const ask = m.ask ? `<line x1="${m.x0}" x2="${m.x1}" y1="${m.ask.y.toFixed(1)}" y2="${m.ask.y.toFixed(1)}" style="stroke:var(--text-2)" stroke-width="1" stroke-dasharray="4 3"/>
    <text x="${m.x1 - 2}" y="${(m.ask.y - 5).toFixed(1)}" text-anchor="end" font-size="12" style="fill:var(--text-2);${halo}">${esc(t('Asking {0}', [money(m.ask.v)]))}</text>` : '';
  return `<svg class="rt-svg" width="${m.W}" height="${m.H}" viewBox="0 0 ${m.W} ${m.H}" tabindex="0" role="img" aria-label="${esc(aria)}" font-size="11">
    ${grid}<line x1="${m.x0}" x2="${m.x1}" y1="${m.y1}" y2="${m.y1}" style="stroke:var(--border-input)"/>${minor}${major}${endLbl}
    ${lines}<circle cx="${lastPt.x.toFixed(1)}" cy="${lastPt.y.toFixed(1)}" r="4" style="fill:var(--accent);stroke:var(--surface)" stroke-width="1.5"/>${ask}
    <g class="rt-hover" visibility="hidden"><line y1="${m.y0}" y2="${m.y1}" stroke="${CROSSHAIR}" stroke-width="1"/><circle r="5" style="fill:var(--accent);stroke:var(--surface)" stroke-width="2"/></g>
    <rect class="rt-hit" x="${m.x0}" y="${m.y0}" width="${m.x1 - m.x0}" height="${m.y1 - m.y0}" fill="transparent"/></svg>`;
}

/** Range seg HTML (5 y / 10 y / All). */
export const rangeSeg = (range) => `<div class="seg rt-range" role="radiogroup" aria-label="${esc(t('Period'))}">${RANGES.map(([id, , label]) => {
  const on = id === range;
  return `<button type="button" role="radio" data-rr="${id}" aria-checked="${on}" tabindex="${on ? 0 : -1}" class="${on ? 'on' : ''}">${esc(t(label))}</button>`;
}).join('')}</div>`;

// ---- browser part ----

/**
 * Draw into `box` (a `.rt-chart` div); `state.range` keeps the chosen range across re-renders. Returns a disposer.
 * @param {HTMLElement} box
 * @param {{ q:(number|null)[], quarters:string[], flatType:string, town:string, asking?:number|null, state:{range?:string} }} spec
 */
export function drawRentChart(box, spec) {
  if (!box) return () => {};
  const st = spec.state || {};
  st.range = st.range || DEFAULT_RANGE;
  let m = null, idx = null, timer = null, lastW = 0;
  const plot = () => box.querySelector('.rt-plot');

  function paint(force = false) {
    const w = plot()?.clientWidth || box.clientWidth;
    if (!w || (!force && w === lastW)) return;
    lastW = w;
    m = rentChartModel({ ...spec, range: st.range, width: w, phone: typeof matchMedia === 'function' && matchMedia(PHONE).matches });
    plot().innerHTML = m ? `${rentChartSvg(m, rentAria(m))}<div class="rt-tip" aria-live="polite" hidden></div>` : `<p class="hint">${t('Not enough quarterly figures for a chart.')}</p>`;
    idx = null;
    if (m) wire();
  }
  function show(i) {
    if (!m || i < 0) return;
    idx = i;
    const p = m.pts[i], g = plot().querySelector('.rt-hover'), ln = g.querySelector('line'), c = g.querySelector('circle');
    g.setAttribute('visibility', 'visible');
    ln.setAttribute('x1', p.x); ln.setAttribute('x2', p.x); c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
    const tip = plot().querySelector('.rt-tip');
    tip.innerHTML = rentTip(p, spec);
    tip.hidden = false;
    const flip = p.x > m.W * 0.6;
    tip.style.left = flip ? '' : `${Math.round(p.x + 12)}px`;
    tip.style.right = flip ? `${Math.round(m.W - p.x + 12)}px` : '';
    tip.style.top = `${m.y0}px`;
  }
  function hide() {
    idx = null;
    plot()?.querySelector('.rt-hover')?.setAttribute('visibility', 'hidden');
    const tip = plot()?.querySelector('.rt-tip'); if (tip) tip.hidden = true;
  }
  function wire() {
    const svg = plot().querySelector('svg'), hit = svg.querySelector('.rt-hit');
    const at = (e) => show(nearestPoint(m.pts, e.clientX - svg.getBoundingClientRect().left));
    hit.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') at(e); });
    hit.addEventListener('pointerdown', at); // touch / pen: sticky until the next tap
    hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
    svg.addEventListener('keydown', (e) => {
      const last = m.pts.length - 1, cur = idx ?? -1;
      const end = () => stepPoint(m.pts, last + 1, -1);
      const go = { ArrowRight: () => (cur < 0 ? stepPoint(m.pts, -1, 1) : stepPoint(m.pts, cur, 1)), ArrowLeft: () => (cur < 0 ? end() : stepPoint(m.pts, cur, -1)),
        PageUp: () => (cur < 0 ? end() : jumpPoint(m.pts, cur, 4)), PageDown: () => (cur < 0 ? end() : jumpPoint(m.pts, cur, -4)),
        Home: () => stepPoint(m.pts, -1, 1), End: end }[e.key];
      if (go) { e.preventDefault(); show(go()); } else if (e.key === 'Escape' && idx != null) { e.stopPropagation(); hide(); }
    });
    svg.addEventListener('blur', hide);
  }

  box.innerHTML = `${rangeSeg(st.range)}<div class="rt-plot"></div>`;
  box.querySelector('.rt-range').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rr]');
    if (!b || b.dataset.rr === st.range) return;
    st.range = b.dataset.rr;
    box.querySelectorAll('[data-rr]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); x.tabIndex = on ? 0 : -1; });
    paint(true);
  });
  paint();
  if (typeof ResizeObserver === 'undefined') { if (!m) paint(true); return () => {}; }
  const ro = new ResizeObserver(() => { if (!m) { paint(); return; } clearTimeout(timer); timer = setTimeout(paint, 120); });
  ro.observe(box);
  return () => { ro.disconnect(); clearTimeout(timer); };
}
