// Explore block card — two folded market charts (roadmap PA-03, PA-05), filled on first open:
//  · "Town vs market": the block's town price index (median $psf per quarter of the selected flat types) against the
//    HDB Resale Price Index (market.js, data.gov.sg), both rebased to 100 at a common start; 5 y / 10 y / All.
//  · "Lease and value": median $psf by remaining-lease band for the town × flat type — the empirical lease-drag
//    curve that engine/futurevalue-facts.js already measures (facts.lease.curve) — with the block's band now and in
//    10 years marked. Cross-sectional (older vs newer blocks today), not a forecast.
// Presentation only: nothing feeds back into prices, tiles or the compare table. Pure parts are exported for node
// tests (tests/explore/marketcharts.test.js); createMarketCharts() draws inline SVG with a pointer / keyboard tooltip.
import { t } from '../../core/i18n.js';
import { esc, money } from '../../core/dom.js';
import { niceTicks, quarterTicks, parseQuarter } from '../../core/axis.js';
import { SQFT_PER_SQM } from '../../core/comps.js';

// UI heuristics (not rules)
export const MIN_Q = 5;                 // sales in a quarter needed for a town figure (fewer → gap)
export const RANGES = [['5', 20, '5 y'], ['10', 40, '10 y'], ['all', null, 'All']]; // [id, quarters, label]
export const DEFAULT_RANGE = '10';
const M = { top: 14, right: 12, bottom: 26, left: 40 };
const ML = { top: 22, right: 8, bottom: 26, left: 46 };
const CROSSHAIR = '#9e9d97';
const PHONE = '(max-width: 767px)';
const f1 = (n) => n.toFixed(1);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };

// ---------------------------------------------------------------- quarters + town index (pure)
/** '2024-05' → '2024-Q2'. */
export const quarterOf = (ym) => `${String(ym).slice(0, 4)}-Q${Math.floor((+String(ym).slice(5, 7) - 1) / 3) + 1}`;
/** Every quarter from a to b inclusive ('YYYY-Qn'). */
export function quarterSpan(a, b) {
  const p = parseQuarter(a), q = parseQuarter(b), out = [];
  if (!p || !q) return out;
  for (let k = p.year * 4 + p.q - 1; k <= q.year * 4 + q.q - 1; k++) out.push(`${Math.floor(k / 4)}-Q${(k % 4) + 1}`);
  return out;
}
/** 'Q2 2026' (中文 via the template). */
export const qLabel = (q) => { const p = parseQuarter(q); return p ? t('Q{0} {1}', [p.q, p.year]) : String(q || ''); };

/**
 * Median $psf per quarter for one town and a set of flat types (null = all), over every sale in data.js.
 * A quarter with fewer than MIN_Q sales has med = null; the last quarter is dropped when the data stop mid-quarter.
 * @param {{ D:object, TX:object, PSF:ArrayLike<number>, town:number, types?:Set<number>|null }} a
 * @returns {{ quarters:string[], med:(number|null)[], n:number[] }}
 */
export function townQuarterly({ D, TX, PSF, town, types = null }) {
  const by = new Map(), mq = D.months.map(quarterOf);
  for (let i = 0; i < TX.p.length; i++) {
    if (D.blocks[TX.b[i]]?.t !== town || (types && !types.has(TX.ft[i]))) continue;
    const q = mq[TX.m[i]]; if (!by.has(q)) by.set(q, []); by.get(q).push(PSF[i]);
  }
  if (!by.size) return { quarters: [], med: [], n: [] };
  const keys = [...by.keys()].sort(), lastM = D.months.at(-1);
  let quarters = quarterSpan(keys[0], keys.at(-1));
  if (+lastM.slice(5, 7) % 3 && quarters.at(-1) === quarterOf(lastM)) quarters = quarters.slice(0, -1); // part quarter
  const n = quarters.map((q) => (by.get(q) || []).length);
  return { quarters, med: quarters.map((q, k) => (n[k] >= MIN_Q ? median(by.get(q)) : null)), n };
}

/** values / values[k] × 100 (null stays null; null when the base is missing). */
export const rebase = (vals, k) => vals.map((v) => (finite(v) && finite(vals[k]) && vals[k] ? (v / vals[k]) * 100 : null));

/**
 * The two series on common quarters for a range: the window ends at the last quarter where both have a figure and
 * spans the range (All = from the first quarter where both do); both are rebased to 100 at the window's first quarter
 * with both figures. rpi = market.rpi { quarters, index }.
 * @returns {null | { quarters, town:(number|null)[], rpi:(number|null)[], psf, n, base:string, change:{ town, rpi } }}
 */
export function alignIndex(townQ, rpi, range = DEFAULT_RANGE) {
  if (!townQ?.quarters?.length || !rpi?.quarters?.length) return null;
  const rp = new Map(rpi.quarters.map((q, i) => [q, finite(rpi.index[i]) ? rpi.index[i] : null]));
  const both = (k) => finite(townQ.med[k]) && finite(rp.get(townQ.quarters[k]));
  let end = townQ.quarters.length - 1;
  while (end >= 0 && !both(end)) end--;
  let start = 0;
  while (start < end && !both(start)) start++;
  if (end < 1 || start >= end) return null;
  const span = (RANGES.find((r) => r[0] === range) || RANGES[1])[1];
  if (span) { start = Math.max(start, end - span + 1); while (start < end && !both(start)) start++; }
  if (start >= end) return null;
  const qs = townQ.quarters.slice(start, end + 1), psf = townQ.med.slice(start, end + 1), n = townQ.n.slice(start, end + 1);
  const town = rebase(psf, 0), idx = rebase(qs.map((q) => rp.get(q)), 0);
  return { quarters: qs, town, rpi: idx, psf, n, base: qs[0], change: { town: town.at(-1) - 100, rpi: idx.at(-1) - 100 } };
}

// ---------------------------------------------------------------- lease bands (pure)
/**
 * Bars for the lease chart from facts.lease.curve ([{ from, to, n, psm }], ascending): contiguous bands from the most
 * lease left to the least (empty bands kept as gaps), median $psf, thin when n < minN, the block's band now / in 10 y.
 */
export function leaseSlots(curve, { now = null, later = null, minN = MIN_Q } = {}) {
  if (!curve?.length) return [];
  const bw = curve[0].to - curve[0].from, by = new Map(curve.map((c) => [c.from, c]));
  const inBand = (v, a) => finite(v) && v >= a && v < a + bw;
  const out = [];
  for (let a = curve.at(-1).from; a >= curve[0].from; a -= bw) {
    const c = by.get(a);
    out.push({ from: a, to: a + bw, n: c ? c.n : 0, psf: c && finite(c.psm) ? c.psm / SQFT_PER_SQM : null, thin: !c || c.n < minN, now: inBand(now, a), later: inBand(later, a) });
  }
  return out;
}

// ---------------------------------------------------------------- town chart geometry + markup
export function indexModel(al, { width = 320, phone = false } = {}) {
  if (!al) return null;
  const W = Math.max(220, Math.round(width)), H = phone ? 150 : 170;
  const x0 = M.left, x1 = W - M.right, y0 = M.top, y1 = H - M.bottom, count = al.quarters.length;
  const vals = [...al.town, ...al.rpi].filter(finite);
  const axis = niceTicks(Math.min(...vals, 100), Math.max(...vals, 100), 4);
  const X = (k) => x0 + (count > 1 ? k / (count - 1) : 0) * (x1 - x0);
  const Y = (v) => y1 - ((v - axis.lo) / (axis.hi - axis.lo || 1)) * (y1 - y0);
  const segs = (vs) => { const out = []; let cur = null; vs.forEach((v, k) => { if (!finite(v)) { cur = null; return; } if (!cur) out.push(cur = []); cur.push([X(k), Y(v)]); }); return out; };
  const pts = al.quarters.map((q, k) => ({ i: k, q, town: al.town[k], rpi: al.rpi[k], psf: al.psf[k], n: al.n[k], x: X(k), y: finite(al.town[k]) ? Y(al.town[k]) : finite(al.rpi[k]) ? Y(al.rpi[k]) : null, yr: finite(al.rpi[k]) ? Y(al.rpi[k]) : null, ok: finite(al.town[k]) || finite(al.rpi[k]) }));
  return { kind: 'index', W, H, x0, x1, y0, y1, pts, segT: segs(al.town), segR: segs(al.rpi), base: { y: Y(100) },
    yTicks: axis.ticks.map((v) => ({ v, y: Y(v), text: String(+v.toFixed(1)) })), ticks: quarterTicks(al.quarters[0], al.quarters.at(-1), x1 - x0), first: al.quarters[0], last: al.quarters.at(-1) };
}

const poly = (s) => s.map(([a, b]) => `${f1(a)},${f1(b)}`).join(' ');
const lineSegs = (segs, style) => segs.map((s) => (s.length > 1 ? `<polyline fill="none" style="${style}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${poly(s)}"/>` : `<circle cx="${f1(s[0][0])}" cy="${f1(s[0][1])}" r="2" style="fill:var(--accent)"/>`)).join('');
const RPI_STYLE = 'stroke:var(--text-2)';

export function indexSvg(m, aria) {
  const grid = m.yTicks.map((k) => `<line x1="${m.x0}" x2="${m.x1}" y1="${f1(k.y)}" y2="${f1(k.y)}" style="stroke:var(--border-subtle)" stroke-width="1"/><text x="${m.x0 - 6}" y="${f1(k.y + 4)}" text-anchor="end" style="fill:var(--text-2)">${esc(k.text)}</text>`).join('');
  const X = (i) => f1(m.pts[i].x), tk = m.ticks;
  const major = tk ? tk.major.map((j) => `<line x1="${X(j.i)}" x2="${X(j.i)}" y1="${m.y1}" y2="${m.y1 + 4}" style="stroke:var(--border-input)"/>${j.label ? `<text x="${X(j.i)}" y="${m.y1 + 16}" text-anchor="middle" style="fill:var(--text-2)">${j.year}</text>` : ''}`).join('') : '';
  const endLbl = `<text x="${m.x1}" y="${m.y1 + 16}" text-anchor="end" style="fill:var(--text-2)">${esc(qLabel(m.last))}</text>`;
  const base = `<line x1="${m.x0}" x2="${m.x1}" y1="${f1(m.base.y)}" y2="${f1(m.base.y)}" style="stroke:var(--border-input)" stroke-width="1" stroke-dasharray="2 3"/>`;
  return `<svg width="${m.W}" height="${m.H}" viewBox="0 0 ${m.W} ${m.H}" tabindex="0" role="img" aria-label="${esc(aria)}" font-size="11">
    ${grid}${base}<line x1="${m.x0}" x2="${m.x1}" y1="${m.y1}" y2="${m.y1}" style="stroke:var(--border-input)"/>${major}${endLbl}
    ${lineSegs(m.segR, `${RPI_STYLE};stroke-dasharray:5 3`)}${lineSegs(m.segT, 'stroke:var(--accent)')}
    <g class="mk-hover" visibility="hidden"><line y1="${m.y0}" y2="${m.y1}" stroke="${CROSSHAIR}" stroke-width="1"/><circle class="mk-hr" r="4" style="fill:var(--surface);stroke:var(--text-2)" stroke-width="2"/><circle class="mk-ht" r="5" style="fill:var(--accent);stroke:var(--surface)" stroke-width="2"/></g>
    <rect class="mk-hit" x="${m.x0}" y="${m.y0}" width="${m.x1 - m.x0}" height="${m.y1 - m.y0}" fill="transparent"/></svg>`;
}

const idx1 = (v) => (finite(v) ? v.toFixed(1) : '—');
const pctText = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(0)}%`;
/** Tooltip for one quarter. */
export function indexTip(p, town) {
  const tl = finite(p.town) ? t('{0}: {1} (median {2} psf, {3} sales)', [town, idx1(p.town), money(p.psf), p.n]) : t('{0}: fewer than {1} sales', [town, MIN_Q]);
  return `<b>${esc(qLabel(p.q))}</b><span>${esc(tl)}</span><span>${esc(t('HDB RPI: {0}', [idx1(p.rpi)]))}</span>`;
}
/** One line under the chart (also the screen-reader summary's core). */
export const indexSummary = (al, town) => t('Since {0}: {1} {2}, HDB Resale Price Index {3}.', [qLabel(al.base), town, pctText(al.change.town), pctText(al.change.rpi)]);
const legend = (town) => `<p class="mk-legend"><span><i class="mk-sw"></i>${esc(t('{0} (your flat types)', [town]))}</span><span><i class="mk-sw rpi"></i>${esc(t('HDB Resale Price Index'))}</span></p>`;

// ---------------------------------------------------------------- lease chart geometry + markup
export function leaseModel(slots, { width = 320, phone = false } = {}) {
  const vals = slots.map((s) => s.psf).filter(finite);
  if (vals.length < 2) return null;
  const W = Math.max(220, Math.round(width)), H = phone ? 150 : 168;
  const x0 = ML.left, x1 = W - ML.right, y0 = ML.top, y1 = H - ML.bottom, px = (x1 - x0) / slots.length;
  const axis = niceTicks(0, Math.max(...vals), 4);
  const Y = (v) => y1 - ((v - axis.lo) / (axis.hi - axis.lo || 1)) * (y1 - y0);
  const bw = Math.min(28, px * 0.62), every = px >= 40 ? 1 : 2;
  const pts = slots.map((s, k) => {
    const cx = x0 + px * (k + 0.5), top = finite(s.psf) ? Y(s.psf) : null;
    return { ...s, i: k, x: cx, y: top, ok: finite(s.psf), bar: top == null ? null : { x: cx - bw / 2, y: top, w: bw, h: y1 - top }, label: k % every === 0 || s.now || s.later };
  });
  return { kind: 'lease', W, H, x0, x1, y0, y1, px, pts, yTicks: axis.ticks.map((v) => ({ v, y: Y(v), text: `S$${Math.round(v)}` })) };
}

const BAR = { base: 'fill:var(--accent-soft);stroke:var(--accent)', now: 'fill:var(--accent);stroke:var(--accent)', later: 'fill:var(--accent-soft);stroke:var(--accent-ink);stroke-dasharray:4 2', thin: 'fill:var(--surface);stroke:var(--accent);stroke-dasharray:2 2' };
export function leaseSvg(m, aria) {
  const grid = m.yTicks.map((k) => `<line x1="${m.x0}" x2="${m.x1}" y1="${f1(k.y)}" y2="${f1(k.y)}" style="stroke:var(--border-subtle)" stroke-width="1"/><text x="${m.x0 - 6}" y="${f1(k.y + 4)}" text-anchor="end" style="fill:var(--text-2)">${esc(k.text)}</text>`).join('');
  const bars = m.pts.filter((p) => p.bar).map((p) => `<rect x="${f1(p.bar.x)}" y="${f1(p.bar.y)}" width="${f1(p.bar.w)}" height="${f1(Math.max(0, p.bar.h))}" rx="2" style="${BAR[p.now ? 'now' : p.later ? 'later' : p.thin ? 'thin' : 'base']}" stroke-width="${p.later ? 2 : 1}"/>`).join('');
  const marks = m.pts.filter((p) => (p.now || p.later) && p.bar).map((p) => `<text x="${f1(p.x)}" y="${f1(p.bar.y - 5)}" text-anchor="middle" style="fill:var(--text);font-weight:600">${esc(p.now ? t('Now') : t('In 10 y'))}</text>`).join('');
  const xLab = m.pts.filter((p) => p.label).map((p) => `<text x="${f1(p.x)}" y="${m.y1 + 15}" text-anchor="middle" style="fill:var(--text-2)">${p.from}–${p.to}</text>`).join('');
  return `<svg width="${m.W}" height="${m.H}" viewBox="0 0 ${m.W} ${m.H}" tabindex="0" role="img" aria-label="${esc(aria)}" font-size="11">
    ${grid}<line x1="${m.x0}" x2="${m.x1}" y1="${m.y1}" y2="${m.y1}" style="stroke:var(--border-input)"/>${bars}${marks}${xLab}
    <g class="mk-hover" visibility="hidden"><line y1="${m.y0}" y2="${m.y1}" stroke="${CROSSHAIR}" stroke-width="1"/></g>
    <rect class="mk-hit" x="${m.x0}" y="${m.y0}" width="${m.x1 - m.x0}" height="${m.y1 - m.y0}" fill="transparent"/></svg>`;
}
/** Tooltip for one band. */
export function leaseTip(p, months) {
  const head = `<b>${esc(t('{0}–{1} years of lease left', [p.from, p.to]))}${p.now ? ` · ${esc(t('this block now'))}` : p.later ? ` · ${esc(t('this block in 10 years'))}` : ''}</b>`;
  if (!p.ok) return `${head}<span>${esc(t('No sales in the last {0} months', [months]))}</span>`;
  return `${head}<span>${esc(t('Median {0} psf', [money(p.psf)]))}</span><span>${esc(p.n === 1 ? t('{0} sale', [1]) : t('{0} sales', [p.n]))}</span>${p.thin ? `<small>${esc(t('Few sales — a rough guide'))}</small>` : ''}`;
}
/** Plain-text reading of the lease drag (facts.lease.drag), or ''. */
export function dragText(drag, { town, type }) {
  if (!drag || !finite(drag.pct)) return '';
  const pct = `${Math.abs(drag.pct).toFixed(0)}%`;
  return t(drag.pct < 0 ? 'In {0}, {1} flats with {2}–{3} years left sold for {4} less per sqft than those with {5}–{6} years left.' : 'In {0}, {1} flats with {2}–{3} years left sold for {4} more per sqft than those with {5}–{6} years left.',
    [town, type, drag.to[0], drag.to[1], pct, drag.from[0], drag.from[1]]);
}

// ---------------------------------------------------------------- browser
/** Interactive chart in `plot`: model(width, phone) → m | null; svg(m); tip(p). Returns a disposer. */
function mountChart(plot, { model, svg, tip, empty }) {
  let m = null, idx = null, timer = null, lastW = 0;
  const phone = () => typeof matchMedia === 'function' && matchMedia(PHONE).matches;
  function paint(force = false) {
    const w = plot.clientWidth;
    if (!w || (!force && w === lastW)) return;
    lastW = w; m = model(w, phone()); idx = null;
    plot.innerHTML = m ? `${svg(m)}<div class="bc-tip" aria-live="polite" hidden></div>` : `<p class="bc-cap">${esc(empty)}</p>`;
    if (m) wire();
  }
  const okIdx = () => m.pts.filter((p) => p.ok).map((p) => p.i);
  function show(i) {
    if (!m || i == null || i < 0) return;
    idx = i;
    const p = m.pts[i], g = plot.querySelector('.mk-hover'), ln = g.querySelector('line');
    g.setAttribute('visibility', 'visible'); ln.setAttribute('x1', p.x); ln.setAttribute('x2', p.x);
    const ht = g.querySelector('.mk-ht'), hr = g.querySelector('.mk-hr');
    if (ht) { ht.setAttribute('cx', p.x); ht.setAttribute('cy', finite(p.town) ? p.y : -99); }
    if (hr) { hr.setAttribute('cx', p.x); hr.setAttribute('cy', p.yr ?? -99); }
    const el = plot.querySelector('.bc-tip');
    el.innerHTML = tip(p); el.hidden = false;
    const flip = p.x > m.W * 0.6;
    el.style.left = flip ? '' : `${Math.round(p.x + 12)}px`; el.style.right = flip ? `${Math.round(m.W - p.x + 12)}px` : ''; el.style.top = `${m.y0}px`;
  }
  function hide() { idx = null; plot.querySelector('.mk-hover')?.setAttribute('visibility', 'hidden'); const el = plot.querySelector('.bc-tip'); if (el) el.hidden = true; }
  function wire() {
    const s = plot.querySelector('svg'), hit = s.querySelector('.mk-hit');
    const near = (e) => { const x = e.clientX - s.getBoundingClientRect().left; let best = null; for (const i of okIdx()) if (best == null || Math.abs(m.pts[i].x - x) < Math.abs(m.pts[best].x - x)) best = i; return best; };
    hit.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') show(near(e)); });
    hit.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; const i = near(e); if (i === idx) hide(); else show(i); });
    hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
    s.addEventListener('keydown', (e) => {
      const ok = okIdx(); if (!ok.length) return;
      const at = ok.indexOf(idx);
      const go = { ArrowRight: () => ok[at < 0 ? 0 : Math.min(ok.length - 1, at + 1)], ArrowLeft: () => ok[at < 0 ? ok.length - 1 : Math.max(0, at - 1)], Home: () => ok[0], End: () => ok.at(-1) }[e.key];
      if (go) { e.preventDefault(); e.stopPropagation(); show(go()); } else if (e.key === 'Escape' && idx != null) { e.stopPropagation(); hide(); }
    });
    s.addEventListener('blur', hide);
  }
  const outside = (e) => { if (idx != null && !plot.contains(e.target)) hide(); };
  document.addEventListener('pointerdown', outside, true);
  paint();
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => { if (!m) { paint(); return; } clearTimeout(timer); timer = setTimeout(paint, 120); }); ro.observe(plot); }
  return { repaint: () => paint(true), dispose: () => { ro?.disconnect(); clearTimeout(timer); document.removeEventListener('pointerdown', outside, true); } };
}

const rangeSeg = (range) => `<div class="seg mk-range" role="radiogroup" aria-label="${esc(t('Period'))}">${RANGES.map(([id, , label]) => {
  const on = id === range;
  return `<button type="button" role="radio" data-v="${id}" aria-checked="${on}" tabindex="${on ? 0 : -1}" class="${on ? 'on' : ''}">${esc(t(label))}</button>`;
}).join('')}</div>`;

/**
 * ctx: { D, TX, PSF, wireSeg (card.js; passed in to keep the import one-way), fvFacts?(bi, flatType) → futurevalue facts,
 *        market?() → HDB_MARKET | null }
 * → { hasRpi(), town(box, { bi, types:Set|null, town }) → dispose, lease(box, { bi, ft, town, type }) → dispose }
 */
export function createMarketCharts(ctx) {
  const market = ctx.market || (() => globalThis.HDB_MARKET || null);
  const cache = new Map();
  let range = DEFAULT_RANGE; // this session only
  const hasRpi = () => !!market()?.rpi?.quarters?.length;
  function townQ(ti, types) {
    const key = `${ti}|${types ? [...types].sort((a, b) => a - b).join(',') : '*'}|${ctx.TX.p.length}`;
    if (!cache.has(key)) { if (cache.size > 24) cache.clear(); cache.set(key, townQuarterly({ D: ctx.D, TX: ctx.TX, PSF: ctx.PSF, town: ti, types })); }
    return cache.get(key);
  }
  function town(box, { bi, types, town: name }) {
    const tq = townQ(ctx.D.blocks[bi].t, types && types.size && types.size < ctx.D.flat_types.length ? types : null);
    box.innerHTML = `${rangeSeg(range)}${legend(name)}<div class="bc-chart mk-plot"></div><p class="bc-cap mk-sum"></p>
      <p class="bc-cap">${esc(t('Town = median $psf of your selected flat types in {0} each quarter (quarters with fewer than {1} sales are left out); both lines start at 100 in the first quarter shown. RPI from data.gov.sg (HDB, quarterly).', [name, MIN_Q]))}</p>`;
    const sum = box.querySelector('.mk-sum');
    const chart = mountChart(box.querySelector('.mk-plot'), {
      model: (w, phone) => { const al = alignIndex(tq, market()?.rpi, range); sum.textContent = al ? indexSummary(al, name) : ''; return indexModel(al, { width: w, phone }); },
      svg: (m) => indexSvg(m, `${t('{0} price index vs HDB Resale Price Index', [name])}. ${sum.textContent}`),
      tip: (p) => indexTip(p, name), empty: t('Not enough quarterly sales in this town for an index.'),
    });
    ctx.wireSeg(box.querySelector('.mk-range'), (v) => { range = v; chart.repaint(); });
    return chart.dispose;
  }
  function lease(box, { bi, ft, town: name, type }) {
    const f = ctx.fvFacts ? ctx.fvFacts(bi, ft) : null, L = f?.lease;
    const slots = leaseSlots(L?.curve, { now: L?.now, later: L?.later, minN: L?.minN });
    const here = finite(L?.now) ? t('This block: about {0} years of lease left now, {1} in 10 years.', [Math.round(L.now), Math.max(0, Math.round(L.later))]) : t('Lease start of this block is unknown.');
    box.innerHTML = `<div class="bc-chart mk-plot"></div><p class="bc-cap">${esc(here)} ${esc(dragText(L?.drag, { town: name, type }))}</p>
      <p class="bc-cap">${esc(t('Each bar = median $psf of {0} sales in {1} over the last {2} months, by years of lease left at the time of sale. It compares older and newer blocks today (cross-sectional) — it is not a forecast for this flat.', [type, name, L?.windowMonths ?? '—']))}</p>`;
    const months = L?.windowMonths ?? '—';
    const chart = mountChart(box.querySelector('.mk-plot'), {
      model: (w, phone) => leaseModel(slots, { width: w, phone }),
      svg: (m) => leaseSvg(m, `${t('Median $psf by years of lease left, {0} {1}', [name, type])}. ${here}`),
      tip: (p) => leaseTip(p, months), empty: t('Not enough sales by lease left in this town for a chart.'),
    });
    return chart.dispose;
  }
  return { hasRpi, town, lease };
}
