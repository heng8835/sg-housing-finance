// Rent → "Rent or buy?" chart: net worth when buying vs renting and investing, year by year.
// Inline SVG drawn at the container's measured width (text stays 11 px), redrawn by a ResizeObserver.
// Same data as engine/rentbuy.js returns (series, breakEvenYear, mop.years) — presentation only.
import { esc, money } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { MC_OUTER_SHARE } from '../../core/mc.js';

const M = { top: 26, right: 12, bottom: 38, left: 52 };
const STEPS = [1, 2, 2.5, 5];
const MINUS = '−';
const MOP_LABEL_MIN = 70;      // px: narrower MOP band → no label inside it
const MARKER_GAP = 80;         // px: break-even label this close to the MOP label → MOP label moves to the bottom
const LABEL_SEP = 14;          // px: minimum gap between the two end labels
const GRID_ZERO = '#b5b4ae';
const CROSSHAIR = '#9e9d97';
const BAND_KEYS = ['P10', 'P25', 'P75', 'P90'];
// Monte-Carlo band fills (calm: light blue around Buy, light grey around Rent; lines stay on top)
const BAND_FILL = { buy: { outer: 0.12, inner: 0.2 }, rent: { outer: 0.1, inner: 0.16 } };

// ---- pure helpers (tests/rent/chart.test.js) ----

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

/** Signed full amount for the table and tooltip: S$23,400 / −S$5,000. */
export const signedMoney = (v) => (Number.isFinite(v) && v < 0 ? MINUS + money(-v) : money(v));

/** X ticks: every year up to 5 years, every 2 up to 10, every 5 beyond. */
export function xTicks(first, last) {
  const span = last - first, step = span <= 5 ? 1 : span <= 10 ? 2 : 5;
  const out = [];
  for (let y = first; y <= last + 1e-9; y += step) out.push(y);
  return out;
}

/** Rough text width in px (CJK ≈ 1 em, Latin ≈ 0.56 em) — used only to avoid label collisions. */
export function textWidth(s, size = 11) {
  let w = 0;
  for (const ch of String(s)) w += /[⺀-鿿＀-￯]/.test(ch) ? size : size * 0.56;
  return w;
}

/** Band values (P10…P90) of one series that are drawable for every year, else null. */
const bandRows = (bands, k, n) => {
  const b = bands && bands[k];
  return Array.isArray(b) && b.length === n && b.every((r) => r && BAND_KEYS.every((p) => Number.isFinite(r[p]))) ? b : null;
};

/**
 * Geometry for the chart (no DOM). `labels` holds the translated strings (see chartLabels()).
 * @param {{ series:{year:number,buyNetWorth:number,rentNetWorth:number}[], breakEvenYear:number|null, mop?:{years:number} }} res
 * @param {{ buy:object[], rent:object[] }|null} [bands] Monte-Carlo percentiles per year ({ P10, P25, P75, P90 }), or null
 *   (deterministic chart, unchanged)
 */
export function chartModel(res, width, labels = chartLabels(), bands = null) {
  const S = res.series, W = Math.max(200, Math.round(width)), H = W <= 340 ? 200 : 220;
  const x0 = M.left, x1 = W - M.right, y0 = M.top, y1 = H - M.bottom;
  const first = S[0].year, last = S.at(-1).year, span = last - first || 1;
  const bb = bandRows(bands, 'buy', S.length), br = bandRows(bands, 'rent', S.length);
  const vals = S.flatMap((r) => [r.buyNetWorth, r.rentNetWorth])
    .concat([bb, br].flatMap((b) => (b ? b.flatMap((r) => [r.P10, r.P90]) : [])))
    .filter(Number.isFinite);
  const yAxis = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 5);
  const x = (yr) => x0 + ((yr - first) / span) * (x1 - x0);
  const y = (v) => y1 - ((v - yAxis.lo) / (yAxis.hi - yAxis.lo || 1)) * (y1 - y0);
  const pts = (k) => S.map((r) => [x(r.year), y(r[k])]);

  // MOP band + its tick label (replaces that year's tick)
  const mopYears = res.mop && Number.isFinite(res.mop.years) ? res.mop.years : null;
  let mop = null;
  if (mopYears != null && mopYears > first) {
    const end = Math.min(mopYears, last), bw = x(end) - x0;
    const text = labels.mopBand, tw = textWidth(text);
    mop = { x: x0, w: bw, endX: x(end), line: mopYears <= last, year: mopYears,
      label: bw >= Math.max(MOP_LABEL_MIN, tw + 8) ? { text, x: x0 + 4, y: y0 + 13 } : null,
      tick: mopYears <= last ? { x: x(mopYears), text: labels.mopTick(mopYears) } : null };
  }

  // break-even marker
  let be = null;
  if (res.breakEvenYear != null) {
    const r = S.find((s) => s.year === res.breakEvenYear);
    if (r) {
      const bx = x(r.year), text = labels.breakEven(r.year), tw = textWidth(text);
      const lx = Math.min(Math.max(bx, x0 + tw / 2), x1 - tw / 2);
      be = { x: bx, y: y(r.buyNetWorth), year: r.year, label: { text, x: lx, y: y0 - 4 } };
      if (mop && mop.label && bx - (mop.label.x + textWidth(mop.label.text)) < MARKER_GAP) mop.label.y = y1 - 6;
    }
  }

  // x ticks; the MOP tick wins over regular ticks it would overlap
  let ticks = xTicks(first, last).map((yr) => ({ x: x(yr), text: yr === 0 ? labels.now : String(yr), year: yr }));
  if (mop && mop.tick) {
    const halfW = textWidth(mop.tick.text) / 2;
    mop.tick.labelX = Math.min(Math.max(mop.tick.x, halfW), W - halfW);
    ticks = ticks.filter((tk) => tk.year !== mop.year && Math.abs(tk.x - mop.tick.labelX) >= halfW + 6 + textWidth(tk.text) / 2);
  }

  // direct end labels: the higher line 8 px above its end, the lower 14 px below, ≥ 14 px apart
  const end = S.at(-1), buyUp = end.buyNetWorth >= end.rentNetWorth;
  const yb = y(end.buyNetWorth), yr = y(end.rentNetWorth);
  let upY = Math.min(yb, yr) - 8, loY = Math.max(yb, yr) + 14;
  loY = Math.min(loY, y1 - 4);
  if (loY - upY < LABEL_SEP) upY = loY - LABEL_SEP;
  const ends = { buy: { x: x1 - 2, y: buyUp ? upY : loY }, rent: { x: x1 - 2, y: buyUp ? loY : upY } };

  // Monte-Carlo bands: outer P10–P90, inner P25–P75 — polygons (upper edge forward, lower edge back)
  const area = (b, lo, hi) => [...S.map((r, i) => [x(r.year), y(b[i][hi])]), ...S.map((r, i) => [x(r.year), y(b[i][lo])]).reverse()];
  const band = (b) => (b ? { outer: area(b, 'P10', 'P90'), inner: area(b, 'P25', 'P75') } : null);
  const bandsM = bb || br ? { buy: band(bb), rent: band(br) } : null;

  return { W, H, x0, x1, y0, y1, yAxis, yTicks: yAxis.ticks.map((v) => ({ y: y(v), text: sgdShort(v), v })),
    zeroY: yAxis.lo < 0 ? y(0) : null, xTicks: ticks, mop, be, ends, bands: bandsM,
    buy: pts('buyNetWorth'), rent: pts('rentNetWorth'), xs: S.map((r) => x(r.year)) };
}

/** Translated strings for the chart (one place, so tests can pass English). mode 'simple': no "MOP" (B10). */
export function chartLabels(mode = 'pro') {
  const simple = mode === 'simple';
  return {
    yTitle: t('Net worth (S$)'), xTitle: t('Years from now'), now: t('Now'), buy: t('Buy'), rent: t('Rent and invest'),
    mopBand: simple ? t("Minimum stay: can't sell") : t("Before MOP: can't sell"), mopTick: (y) => (simple ? t('Can sell · yr {0}', [y]) : t('MOP · yr {0}', [y])),
    breakEven: (y) => t('Buying pulls ahead · yr {0}', [y]),
  };
}

const poly = (p) => p.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ');
const halo = 'paint-order:stroke;stroke:var(--surface);stroke-width:3px;stroke-linejoin:round';

/** SVG markup for a model. */
export function chartSvg(m, labels, aria) {
  const L = labels;
  const grid = m.yTicks.map((tk) => `<line x1="${m.x0}" x2="${m.x1}" y1="${tk.y.toFixed(1)}" y2="${tk.y.toFixed(1)}" style="stroke:var(--border-subtle)" stroke-width="1"/>`).join('');
  const yLab = m.yTicks.map((tk) => `<text x="46" y="${(tk.y + 4).toFixed(1)}" text-anchor="end" style="fill:var(--text-2)">${esc(tk.text)}</text>`).join('');
  const xTick = (x, text, lx = x) => `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${m.y1}" y2="${m.y1 + 4}" style="stroke:var(--border-input)"/><text x="${lx.toFixed(1)}" y="${m.y1 + 16}" text-anchor="middle" style="fill:var(--text-2)">${esc(text)}</text>`;
  const mop = m.mop ? `<rect x="${m.mop.x}" y="${m.y0}" width="${Math.max(0, m.mop.w).toFixed(1)}" height="${m.y1 - m.y0}" style="fill:var(--band)"/>` : '';
  const mopLine = m.mop && m.mop.line ? `<line x1="${m.mop.endX.toFixed(1)}" x2="${m.mop.endX.toFixed(1)}" y1="${m.y0}" y2="${m.y1}" stroke="${GRID_ZERO}" stroke-width="1"/>` : '';
  const mopLabel = m.mop && m.mop.label ? `<text x="${m.mop.label.x}" y="${m.mop.label.y}" style="fill:var(--text-3);${halo}">${esc(m.mop.label.text)}</text>` : '';
  const mopTick = m.mop && m.mop.tick ? xTick(m.mop.tick.x, m.mop.tick.text, m.mop.tick.labelX) : '';
  const zero = m.zeroY != null ? `<line x1="${m.x0}" x2="${m.x1}" y1="${m.zeroY.toFixed(1)}" y2="${m.zeroY.toFixed(1)}" stroke="${GRID_ZERO}" stroke-width="1"/>` : '';
  const be = m.be ? `<line x1="${m.be.x.toFixed(1)}" x2="${m.be.x.toFixed(1)}" y1="${m.y0}" y2="${m.y1}" style="stroke:var(--accent-ink)" stroke-width="1" stroke-dasharray="3 3"/>
    <circle cx="${m.be.x.toFixed(1)}" cy="${m.be.y.toFixed(1)}" r="3.5" style="fill:var(--accent-ink)"/>
    <text class="rb-be" x="${m.be.label.x.toFixed(1)}" y="${m.be.label.y}" text-anchor="middle" style="fill:var(--accent-ink);${halo}">${esc(m.be.label.text)}</text>` : '';
  const end = (k, text, color) => `<text x="${m.ends[k].x}" y="${m.ends[k].y.toFixed(1)}" text-anchor="end" font-size="12" font-weight="600" style="fill:${color};${halo}">${esc(text)}</text>`;
  const bandK = (k, color) => (m.bands && m.bands[k] ? ['outer', 'inner'].map((w) => `<polygon class="rb-band ${k} ${w}" points="${poly(m.bands[k][w])}" style="fill:${color}" fill-opacity="${BAND_FILL[k][w]}" stroke="none"/>`).join('') : '');
  const bands = m.bands ? `<g class="rb-bands" aria-hidden="true">${bandK('rent', 'var(--chart-rent)')}${bandK('buy', 'var(--chart-buy)')}</g>` : '';
  return `<svg class="rb-svg" width="${m.W}" height="${m.H}" viewBox="0 0 ${m.W} ${m.H}" tabindex="0" role="img" aria-label="${esc(aria || '')}" font-size="11">
    ${mop}${grid}${zero}${mopLine}${bands}
    <text x="0" y="11" style="fill:var(--text-3)">${esc(L.yTitle)}</text>${yLab}
    ${m.xTicks.map((tk) => xTick(tk.x, tk.text)).join('')}${mopTick}
    <text x="${((m.x0 + m.x1) / 2).toFixed(1)}" y="${m.H - 4}" text-anchor="middle" style="fill:var(--text-3)">${esc(L.xTitle)}</text>
    ${mopLabel}
    <polyline fill="none" style="stroke:var(--chart-rent)" stroke-width="2" stroke-dasharray="6 4" stroke-linejoin="round" stroke-linecap="round" points="${poly(m.rent)}"/>
    <polyline fill="none" style="stroke:var(--chart-buy)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${poly(m.buy)}"/>
    ${be}${end('rent', L.rent, 'var(--chart-rent)')}${end('buy', L.buy, 'var(--accent-ink)')}
    <g class="rb-hover" visibility="hidden"><line y1="${m.y0}" y2="${m.y1}" stroke="${CROSSHAIR}" stroke-width="1"/>
      <circle class="rb-dr" r="4" style="fill:var(--chart-rent);stroke:var(--surface)" stroke-width="2"/><circle class="rb-db" r="4" style="fill:var(--chart-buy);stroke:var(--surface)" stroke-width="2"/></g>
    <rect class="rb-hit" x="${m.x0}" y="${m.y0}" width="${m.x1 - m.x0}" height="${m.y1 - m.y0}" fill="transparent"/>
  </svg>`;
}

/** Index of the year nearest to px (for hover). */
export function nearestIndex(xs, px) {
  let best = 0;
  for (let i = 1; i < xs.length; i += 1) if (Math.abs(xs[i] - px) < Math.abs(xs[best] - px)) best = i;
  return best;
}

/**
 * Tooltip HTML for one year. `band` (optional) = that year's Monte-Carlo rows { buy, rent } → one 80%-range line each.
 */
export function tipHtml(r, labels = chartLabels(), band = null) {
  const d = r.buyNetWorth - r.rentNetWorth;
  const range = (k, name) => (band && band[k] && Number.isFinite(band[k].P10) ? `<small>${esc(t('{0}: {1}% of futures {2} to {3}', [name, MC_OUTER_SHARE, signedMoney(band[k].P10), signedMoney(band[k].P90)]))}</small>` : '');
  return `<b>${esc(r.year === 0 ? labels.now : t('Year {0}', [r.year]))}</b>
    <span><i class="rb-k buy" aria-hidden="true">●</i> ${esc(labels.buy)} ${signedMoney(r.buyNetWorth)}</span>
    <span><i class="rb-k rent" aria-hidden="true">┄</i> ${esc(labels.rent)} ${signedMoney(r.rentNetWorth)}</span>
    <small>${esc(d >= 0 ? t('Buy ahead by {0}', [money(d)]) : t('Rent ahead by {0}', [money(-d)]))}</small>${range('buy', labels.buy)}${range('rent', labels.rent)}`;
}

// ---- browser part ----

/**
 * Draw the chart into `box` (a `.rb-chart` div) and keep it sized; returns a disposer.
 * @param {HTMLElement} box
 * @param {object} res rentVsBuy() result
 * @param {string} aria one-sentence summary for screen readers
 * @param {{ buy:object[], rent:object[] }|null} [bands] Monte-Carlo percentiles per year (Pro "Show range"), else null
 */
export function drawChart(box, res, aria, bands = null, mode = 'pro') {
  if (!box || !res || !res.series || res.series.length < 2) return () => {};
  const labels = chartLabels(mode);
  let m = null, idx = null, timer = null, lastW = 0;
  const tip = () => box.querySelector('.rb-tip');

  function paint() {
    const w = box.clientWidth;
    if (!w || w === lastW) return;
    lastW = w;
    m = chartModel(res, w, labels, bands);
    box.innerHTML = chartSvg(m, labels, aria) + '<div class="rb-tip" aria-live="polite" hidden></div>';
    idx = null;
    wire();
  }

  function show(i) {
    if (!m) return;
    idx = Math.max(0, Math.min(res.series.length - 1, i));
    const g = box.querySelector('.rb-hover'), x = m.xs[idx];
    g.setAttribute('visibility', 'visible');
    const ln = g.querySelector('line'); ln.setAttribute('x1', x); ln.setAttribute('x2', x);
    const cb = g.querySelector('.rb-db'), cr = g.querySelector('.rb-dr');
    cb.setAttribute('cx', x); cb.setAttribute('cy', m.buy[idx][1]);
    cr.setAttribute('cx', x); cr.setAttribute('cy', m.rent[idx][1]);
    const el = tip();
    el.innerHTML = tipHtml(res.series[idx], labels, m.bands ? { buy: bands.buy && bands.buy[idx], rent: bands.rent && bands.rent[idx] } : null);
    el.hidden = false;
    const flip = x > m.W * 0.6;
    el.style.left = flip ? '' : `${Math.round(x + 12)}px`;
    el.style.right = flip ? `${Math.round(m.W - x + 12)}px` : '';
    el.style.top = `${m.y0}px`;
  }

  function hide() {
    idx = null;
    box.querySelector('.rb-hover')?.setAttribute('visibility', 'hidden');
    const el = tip(); if (el) el.hidden = true;
  }

  function wire() {
    const svg = box.querySelector('svg'), hit = box.querySelector('.rb-hit');
    const at = (e) => { const r = svg.getBoundingClientRect(); show(nearestIndex(m.xs, e.clientX - r.left)); };
    hit.addEventListener('pointermove', at);
    hit.addEventListener('pointerdown', at);
    hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const d = e.key === 'ArrowRight' ? 1 : -1;
        show(idx == null ? (d > 0 ? 0 : res.series.length - 1) : idx + d);
      } else if (e.key === 'Escape' && idx != null) { e.stopPropagation(); hide(); }
    });
    svg.addEventListener('blur', hide);
  }

  paint();
  if (typeof ResizeObserver === 'undefined') { if (!m) { box.style.width = '320px'; paint(); } return () => {}; }
  const ro = new ResizeObserver(() => {
    if (!m) { paint(); return; }           // first visible size (tab was hidden): draw at once
    clearTimeout(timer); timer = setTimeout(paint, 120);
  });
  ro.observe(box);
  return () => { ro.disconnect(); clearTimeout(timer); };
}
