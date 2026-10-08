// Explore — the block card (owner feedback G3/G4, hdb-data-pipeline/docs/specs/phase5-block-card-design.md §3–4;
// acceptance round 1, phase5-accept1-design.md §5.3–5.4): a one-line executive summary, header facts and warnings,
// "Prices · last N" (tiles), the trend chart (./trend.js), every sale in the sales-history years (selected types
// marked), folded rent and nearby sections, and the Afford / Rent / Add actions. Cards float in ./dock.js.
// Sev-1: presentation only. The tiles are the same numbers as before (blockAgg, else legacy statsFor over all types
// in the calculation window); Afford / Rent check get one flat type and its median from those sales (./handoff.js, A8).
// Pure parts are exported for node tests; createCard() wires the dock (browser).
import { t, currentLang } from '../../core/i18n.js';
import { esc, money } from '../../core/dom.js';
import { trendSpec, yearlyStats, rentYearly, drawTrend } from './trend.js';
import { createDock } from './dock.js';
import { createMarketCharts } from './marketcharts.js';
import { createSchoolCard } from './schoolcard.js'; // B3: school search → school card in this dock
import { shortSchool } from './familyrows.js';
import { schoolBands, schoolName, p1Band } from '../../core/schools.js';

export const ROWS_SHOWN = 8;
export const REFRESH_MS = 120;
const FT_SHORT = { '1 ROOM': '1-room', '2 ROOM': '2-room', '3 ROOM': '3-room', '4 ROOM': '4-room', '5 ROOM': '5-room', EXECUTIVE: 'Exec.', 'MULTI-GENERATION': 'Multi-gen' };

/** Short flat-type name: 4-room, Exec., Multi-gen. */
export const ftShort = (name) => t(FT_SHORT[name] || name);
/** "10 TO 12" → "10–12", "01 TO 03" → "1–3". */
export const storeyShort = (s) => { const m = String(s).match(/^(\d+) TO (\d+)$/); return m ? `${+m[1]}–${+m[2]}` : String(s); };
/** Today's tile format (unchanged): S$612k. */
export const kTile = (v) => (v == null ? '—' : 'S$' + (v / 1000).toFixed(0) + 'k');

/** Selected types: "All flat types", up to 4 short names, or "{0} flat types". */
export function typesText(ft, flatTypes) {
  const n = ft.length;
  return n === flatTypes.length ? t('All flat types') : n && n <= 4 ? [...ft].sort((a, b) => a - b).map((i) => ftShort(flatTypes[i])).join(', ') : t('{0} flat types', [n]);
}
/** "{types} · {period}{ · more filters on}". ft = selected flat-type indices into flatTypes. */
export function scopeText({ ft, flatTypes, mFrom, mTo, fmtMonth, filtOn }) {
  return `${typesText(ft, flatTypes)} · ${t('{0} – {1}', [fmtMonth(mFrom), fmtMonth(mTo)])}${filtOn ? ' · ' + t('more filters on') : ''}`;
}

/**
 * Card state. match: the block is coloured (blockAgg). fallback: not coloured but the window has sales
 * (tiles = all flat types in the window, as before). none: no sales in the window.
 * `outside`: matching rows exist but the town / lease / age filter excludes the block.
 */
export function cardState({ matchN, aggOk, periodN }) {
  const state = aggOk ? 'match' : periodN > 0 ? 'fallback' : 'none';
  return { state, outside: !aggOk && matchN > 0 };
}

/** Newest first: month descending, then transaction index descending. `m` = TX.m. */
export const sortSales = (idx, m) => idx.slice().sort((x, y) => m[y] - m[x] || y - x);

/**
 * Table rows for idx[from, to). cols: { month(i), type(i), storey(i) } → text; { sqm(i), price(i), psf(i) } → numbers;
 * optional sel(i) → true for the user's flat types (row class "sel": blue bar + bold type).
 */
export function salesRows(idx, cols, from, to) {
  return idx.slice(from, to).map((i) => `<tr${cols.sel && cols.sel(i) ? ' class="sel"' : ''}><td>${esc(cols.month(i))}</td><td>${esc(cols.type(i))}</td><td>${esc(cols.storey(i))}</td><td class="r">${cols.sqm(i)}</td><td class="r">${Math.round(cols.price(i)).toLocaleString('en-SG')}</td><td class="r">${Math.round(cols.psf(i))}</td></tr>`).join('');
}

/** The sales table (first ROWS_SHOWN rows unless open). */
export function salesTable(idx, cols, open) {
  const head = ['Date', 'Type', 'Storey', 'sqm', 'Price (S$)', '$psf'].map((h, k) => `<th${k > 2 ? ' class="r"' : ''}>${t(h)}</th>`).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${salesRows(idx, cols, 0, open ? idx.length : ROWS_SHOWN)}</tbody></table>`;
}

/** "{n} sales · 2017–2026 · all flat types ({m} of your types)". s: { idx, mine, from, to }. */
export const salesScope = (s) => t('{0} sales · {1}–{2} · all flat types ({3} of your types)', [s.idx.length, s.from, s.to, s.mine]);
const moreText = (n, open) => (open ? t('Show fewer') : t('Show all {0}', [n]));

function salesSection(s, key) {
  if (!s.total) return `<section class="bc-sec"><h5 class="bc-h">${t('Sales in this block')}</h5><p class="bc-scope">${t('No sales in this block yet.')}</p></section>`;
  const hid = `bc-${key}-sales`;
  return `<section class="bc-sec bc-sales" aria-labelledby="${hid}"><h5 class="bc-h" id="${hid}">${t('Sales in this block')}</h5>
    <p class="bc-scope">${esc(salesScope(s))}</p>
    ${s.idx.length ? `<div class="bc-table${s.open ? ' open' : ''}">${salesTable(s.idx, s.cols, s.open)}</div><p class="bc-cap">${t('Blue bar = your flat types.')}</p>` : ''}
    <button type="button" class="link bc-more"${s.idx.length > ROWS_SHOWN ? '' : ' hidden'}>${moreText(s.idx.length, s.open)}</button></section>`;
}

export const SCHOOLS_IN_CARD = 8; // B3: schools listed in the fold before "+N more" (UI heuristic)
const dist = (km) => (km < 1 ? t('{0} m', [Math.round(km * 1000)]) : t('{0} km', [km.toFixed(1)]));
/** The header fact legacy writes for the school count (blockFacts) — same templates, so the card can make it a link. */
export const schoolsFact = (n) => (n === 1 ? t('{0} primary school within 1 km', [n]) : t('{0} primary schools within 1 km', [n]));

/**
 * B3 fold "Primary schools within 1 km (n)": s = core/schools schoolBands() for the block, bandsKm = policy
 * p1.distance.bands_km. Nearest first, SCHOOLS_IN_CARD names, "+N more", the 1–2 km count, MOE note; none in the first
 * band → "(none)" + the nearest school and its band.
 */
export function schoolsFold(s, bandsKm, open) {
  const [b0, b1] = bandsKm, n = s.near.length, name = (x) => esc(shortSchool(schoolName(x.item.n)));
  const title = n ? t('Primary schools within {0} km ({1})', [b0, n]) : t('Primary schools within {0} km (none)', [b0]);
  const nn = s.nearest, far = nn && p1Band(nn.km, bandsKm) > 1;
  const body = (n ? list(s.near.slice(0, SCHOOLS_IN_CARD).map((x) => `${name(x)} · ${dist(x.km)}`)) + (n > SCHOOLS_IN_CARD ? `<p class="bc-cap">${t('+{0} more within {1} km', [n - SCHOOLS_IN_CARD, b0])}</p>` : '')
    : nn ? `<p class="bc-cap">${far ? t('Nearest: {0} · {1} — outside the P1 bands', [name(nn), dist(nn.km)]) : t('Nearest: {0} · {1} ({2}–{3} km band)', [name(nn), dist(nn.km), b0, b1])}</p>` : '')
    + (n && s.second.length ? `<p class="bc-cap">${t('{0} more within {1}–{2} km', [s.second.length, b0, b1])}</p>` : '')
    + `<p class="bc-cap">${t("Straight-line from the block. MOE measures from the home address, so check MOE's tool.")}</p>`;
  return fold('schools', open, title, body);
}

const fold = (key, open, title, body) => `<details class="bc-sec bc-fold" data-fold="${key}"${open ? ' open' : ''}><summary class="bc-h">${title}</summary>${body}</details>`;
const list = (items) => `<ul class="bc-list">${items.map((x) => `<li>${x}</li>`).join('')}</ul>`;
/** First warning, short: tags stripped (the item HTML is already escaped), cut before " (". */
export const warnShort = (html) => String(html || '').replace(/<[^>]*>/g, '').split(' (')[0].trim();

/**
 * One-line executive summary (§5.4), prices first, only values the card already holds. x: { state: 'match' |
 * 'fallback' | 'none' | 'new', outside, price, n, types, win ('1 year'), lease (years left | null), mrt: { d, name } | null,
 * last: { month, price } | null, newYear, warn (short text) }. Numbers in <b>.
 */
export function execSummary(x) {
  const B = (v) => `<b>${v}</b>`, parts = [];
  const nSales = (n) => (n === 1 ? t('{0} sale in the last {1}', [B(1), x.win]) : t('{0} sales in the last {1}', [B(n), x.win]));
  if (x.state === 'new') parts.push(t('New block — first resales from ~{0}', [B(x.newYear)]));
  else if (x.state === 'match' || (x.state === 'fallback' && x.outside)) parts.push(t('{0} median for {1}', [B(kTile(x.price)), x.state === 'match' ? esc(x.types) : t('all flat types')]), nSales(x.n));
  else if (x.state === 'fallback') parts.push(t('No {0} sales in the last {1} — all types: {2} ({3} sales)', [esc(x.types), x.win, B(kTile(x.price)), B(x.n)]));
  else { parts.push(t('No sales in the last {0}', [x.win])); if (x.last) parts.push(t('last sale {0}, {1}', [B(esc(x.last.month)), B(kTile(x.last.price))])); }
  if (x.lease != null) parts.push(t('{0} lease left', [B(t('{0} y', [Math.round(x.lease)]))]));
  if (x.mrt) parts.push(t('{d} to {place} MRT', { d: B(esc(x.mrt.d)), place: esc(x.mrt.name) }));
  return parts.join(' · ') + (x.warn ? ` <span class="bc-exec-warn">· ⚠ ${x.warn}</span>` : '');
}

/**
 * Card body markup (the title sits in the dock's bar). model: { key, head: { sub, facts[], items[{ html, tone }], newYear },
 * st (cardState), tiles: { price, psf, n }, scope, period, win, trend: { heading, caption, enough },
 * sales: { idx, cols, total, mine, from, to, open }, rent: [{ ft, med, n }] | null, rentFirst, folds: { rent, near, fv }, affordPrice, ho ({ ft, price } | null),
 * fv (optional: flat type of the folded "Future-value outlook"; its body is filled on first open — see wire()),
 * mk (optional: { ft, rpi, lease, town } → folds "Town vs market" / "Lease and value", ./marketcharts.js; folds.mkt / folds.lease) }.
 * Facts and items are HTML (escaped by the caller). No element ids except the per-block `bc-{key}-sales`.
 */
export function cardHtml(model) {
  const { head: h, st, tiles: a } = model;
  const warn = h.items.filter((x) => x.tone === 'warn'), near = h.items.filter((x) => x.tone !== 'warn');
  const flags = (warn.length ? `<p class="bc-flags">${warn.map((x) => `<span class="tag serious">${x.html}</span>`).join('')}</p>` : '')
    + (h.newYear ? `<p class="bc-flags"><span class="tag info">${t(model.simple ? 'No resale yet — first resales from ~{0} (after the 5-year minimum stay)' : 'No resale yet — first resales from ~{0} (5-yr MOP)', [h.newYear])}</span></p>` : '');
  const none = st.state === 'none';
  const tile = (label, v) => `<div class="bc-tile"><small>${t(label)}</small><b>${v}</b></div>`;
  const scope = st.state === 'match' ? `${a.n === 1 ? t('{0} matching sale', [1]) : t('{0} matching sales', [a.n])} · ${model.scope}`
    : st.state === 'fallback' ? `${t('All flat types in your period')} · ${model.period}` : `${t('No sales in your period.')}<br>${model.scope}`;
  const prices = `<section class="bc-sec"><h5 class="bc-h">${t('Prices · last {0}', [model.win])}</h5>
    <div class="bc-tiles">${tile('Median price', none ? '—' : kTile(a.price))}${tile('Median $psf', !none && a.psf ? 'S$' + Math.round(a.psf) : '—')}${tile('Sales', none ? '—' : a.n)}</div>
    <p class="bc-scope">${scope}</p>${st.outside ? `<p class="bc-scope">${t('This block is outside your town or lease filters, so it is not coloured.')}</p>` : ''}</section>`;
  const tr = model.trend;
  const trend = `<section class="bc-sec"><h5 class="bc-h">${esc(tr.heading)}</h5>${tr.enough ? `<div class="bc-chart"></div><p class="bc-cap">${esc(tr.caption)}</p>` : `<p class="bc-cap">${t('Not enough sales for a trend.')}</p>`}</section>`;
  const rent = model.rent && model.rent.length ? fold('rent', model.folds.rent, t('Rent in this block'), list(model.rent.map((r) => {
    const s = `${esc(ftShort(r.ft))} ${money(r.med)}`;
    return r.n ? t('{0} ({1} rentals)', [s, r.n]) : s;
  }))) : '';
  const nearby = near.length ? fold('near', model.folds.near, t('Nearby'), list(near.map((x) => x.html))) : '';
  const sc = model.schools; // B3: fold + the header fact as a link to it (no poi.js → neither)
  const schools = sc ? schoolsFold(sc.bands, sc.bandsKm, model.folds.schools) : '';
  const pill = sc ? schoolsFact(sc.bands.near.length) : null;
  const facts = h.facts.map((x) => (x === pill ? `<button type="button" class="link" data-act="schools">${x}</button>` : x));
  const fv = model.fv ? fold('fv', model.folds.fv, t('Future-value outlook'), '<div class="bc-fv-body" data-fv></div>') : '';
  // market charts (./marketcharts.js), filled on first open; no market.js → one note instead of the fold
  const mk = model.mk;
  const town = !mk ? '' : mk.rpi ? fold('mkt', model.folds.mkt, t('Town vs market'), '<div class="mk-body" data-mk="town"></div>')
    : `<p class="bc-cap mk-none">${t('Town vs market is hidden: the HDB Resale Price Index (data/market.js) is not loaded.')}</p>`;
  const leaseFold = mk && mk.lease ? fold('lease', model.folds.lease, t('Lease and value'), '<div class="mk-body" data-mk="lease"></div>') : '';
  // model.ho (./handoff.js): the one flat type + its median that Afford / Rent check receive — said, so nothing is silent
  const ho = model.ho && model.ho.price ? `<p class="foot-note">${t('Afford this and Rent check use the {0} median: {1}.', [ftShort(model.ho.ft), kTile(model.ho.price)])}</p>` : '';
  const actions = `<div class="bc-actions"><button type="button" class="btn primary sm" data-act="add">${t('Add a flat from this block…')}</button><button type="button" class="btn sm" data-act="afford"${model.affordPrice ? '' : ' disabled'}>${t('Afford this →')}</button><button type="button" class="btn sm" data-act="rent">${t('Rent check →')}</button>${ho}</div>`;
  // never resold (new block, no sales in the slider years): one note instead of three empty sections
  const fresh = !!h.newYear && !(model.sales && model.sales.total);
  const body = fresh
    ? `<section class="bc-sec"><h5 class="bc-h">${t('Prices')}</h5><p class="bc-cap">${t('No resales yet, so there are no prices for this block. Nearby blocks on the map, or the "Prices in view" box, give a guide.')}</p></section>`
    : `${prices}${model.rentFirst ? rent : ''}${trend}${salesSection(model.sales, model.key)}`;
  return `<div class="bc"><header class="bc-head"><p class="bc-sub">${h.sub}</p>${model.commute ? `<p class="bc-commute">${model.commute}</p>` : ''}
    <ul class="bc-facts">${facts.map((x) => `<li>${x}</li>`).join('')}</ul>${flags}</header>
    ${body}${fresh || model.rentFirst ? '' : rent}${fresh ? rent : ''}${nearby}${schools}${town}${leaseFold}${fv}${actions}</div>`;
}

/** Radio-style seg: click / Space / Enter pick, ←/→ move and pick (roving tabindex); aria-disabled buttons are skipped. */
export function wireSeg(el, onPick) {
  if (!el) return;
  const btns = () => [...el.querySelectorAll('button[data-v]')];
  const ok = (b) => b.getAttribute('aria-disabled') !== 'true';
  const pick = (b) => {
    if (!ok(b)) return;
    for (const x of btns()) { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); x.tabIndex = on ? 0 : -1; }
    onPick(b.dataset.v);
  };
  el.addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (b) pick(b); });
  el.addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!d) return;
    const live = btns().filter(ok), i = live.indexOf(e.target.closest('button')); if (!live.length) return;
    e.preventDefault(); e.stopPropagation(); // keep the map from panning
    const next = live[(i + d + live.length) % live.length]; next.focus(); pick(next);
  });
}

// ------------------------------------------------------------------ browser
/**
 * ctx: { map, L, canvas, bus, D, TX, PSF, blockTx, txOk, filtActive, getS, getAgg, statsFor, median, fmtMonth, rents,
 *        facts(bi) → { title, sub, town, facts[], items[], newYear, lease, mrt }, panelCover, viewTo(ll, z),
 *        period() → { hist, histFrom, histTo, calc }, cardSize: { get(), set(size) }, onCards(bis),
 *        handoff?(bi) → { ft, price } (./handoff.js), onAdd(bi), onAfford(bi), onRent(bi), futureValue?(bi, flatType) → fold HTML (./futurevalue-ui.js),
 *        fvFacts?(bi, flatType) → future-value facts (the "Lease and value" chart reads facts.lease.curve) }
 */
export function createCard(ctx) {
  const { map, D, TX, PSF, blockTx, txOk, filtActive, getS, getAgg, statsFor, median, fmtMonth, rents, facts } = ctx;
  const folds = new Map();    // fold open state for this session only (not stored)
  const expanded = new Set(); // cards whose sales list shows every row
  const phone = () => innerWidth <= 767;
  const monthName = (mm) => new Date(2000, mm - 1, 1).toLocaleString(currentLang() === 'zh' ? 'zh-SG' : 'en-SG', { month: 'short' });
  const rentN = (row) => (row ? row[0] || row[5] || 0 : 0);
  // B3: school cards share the dock under string keys 's:<index into ctx.schools()>'; block cards keep numeric keys
  const isSchool = (k) => typeof k === 'string' && k.startsWith('s:'), si = (k) => +k.slice(2);
  const pos = (k) => (isSchool(k) ? sc?.at(si(k)) : D.blocks[k]);
  const dock = createDock({ map, L: ctx.L, canvas: ctx.canvas, bus: ctx.bus, root: document.getElementById('cardDock'), live: document.getElementById('cardLive'),
    panelCover: ctx.panelCover, getSize: () => ctx.cardSize.get(), setSize: (s) => ctx.cardSize.set(s), at: pos,
    onPick: (k) => (isSchool(k) ? dock.open(k) : open(k)), showOnMap: (k) => { const b = pos(k); if (b) ctx.viewTo([b.lat, b.lon], Math.max(map.getZoom(), 16)); }, onChange: (keys) => ctx.onCards(keys.filter((k) => !isSchool(k))) });
  const sc = ctx.schools ? createSchoolCard({ D, TX, blockTx, getS, median, bandsKm: ctx.p1Bands, schools: ctx.schools, period: ctx.period, budget: () => ctx.budget?.() ?? null,
    types: () => typesText(getS().ft, D.flat_types), bus: ctx.bus, wireSeg, openBlock: (bi) => { const b = D.blocks[bi]; ctx.viewTo([b.lat, b.lon], Math.max(map.getZoom(), 16)); open(bi); } }) : null;
  const contentFor = (k) => (isSchool(k) ? { ...sc.content(si(k), () => dock.update(k, contentFor(k))), pin: false } : content(k));
  const mkc = createMarketCharts({ D, TX, PSF, wireSeg, fvFacts: ctx.fvFacts });

  function trendFor(bi, S, f, P) {
    const b = D.blocks[bi], inYears = (y) => +y >= P.hist.from && +y <= P.hist.to;
    let src = null;
    if (S.colorBy === 'rent' && rents) {
      const town = (rents.towns || {})[D.towns[b.t]] || {}, row = (rents.blocks || {})[String(bi)] || {};
      const fts = S.ft.map((fi) => D.flat_types[fi]).filter((ft) => town[ft] && Array.isArray(town[ft].q) && town[ft].q.some((v) => v != null));
      const ft = fts.slice().sort((x, y) => rentN(row[y]) - rentN(row[x]))[0]; // most rentals here; ties keep the selection order
      if (ft) { const series = rentYearly(town[ft].q, rents.quarters).filter((p) => inYears(p.y)); if (series.length >= 2) src = { ft, series }; }
    }
    const mode = trendSpec(S.colorBy, !!src);
    const tail = [t('shaded = calculation window'), t('hollow dot = under 3 sales or part-year')];
    if (mode === 'rent') return { mode, series: src.series, enough: true, heading: t('Town median rent by year ({0})', [ftShort(src.ft)]), caption: [t('{0}, {1} (HDB)', [ftShort(src.ft), f.town]), ...tail].join(' · '), src: { ft: ftShort(src.ft), town: f.town } };
    const note = S.colorBy === 'commute' ? t('Commute time has no history — showing median price.') + ' ' : S.colorBy === 'rent' ? t('No rent history for this town and flat type — showing median price.') + ' ' : '';
    const ftSet = new Set(S.ft);
    const items = (types) => blockTx[bi].filter((i) => TX.m[i] >= P.histFrom && TX.m[i] <= P.histTo && (!types || types.has(TX.ft[i]))).map((i) => ({ y: D.months[TX.m[i]].slice(0, 4), v: mode === 'psf' ? PSF[i] : TX.p[i] }));
    let series = yearlyStats(items(ftSet), median), all = false; // selected flat types, slider years, no "More filters"
    if (series.length < 2) { series = yearlyStats(items(null), median); all = true; }
    const heading = t({ price: 'Median price by year', psf: 'Median $ per sqft by year', count: 'Sales per year' }[mode]);
    const yrs = [P.hist.from, P.hist.to];
    return { mode, series, enough: series.length >= 2, heading, caption: note + [all ? t('All flat types · {0}–{1}', yrs) : t('Selected flat types · {0}–{1}', yrs), ...tail].join(' · ') };
  }

  function content(bi) {
    const S = getS(), P = ctx.period(), b = D.blocks[bi], ftSet = new Set(S.ft);
    const matchN = blockTx[bi].reduce((n, i) => n + (ftSet.has(TX.ft[i]) && TX.m[i] >= S.mFrom && TX.m[i] <= S.mTo && txOk(i) ? 1 : 0), 0);
    const agg = getAgg()[bi];
    const a = agg || statsFor(blockTx[bi], null, S.mFrom, S.mTo); // tiles + Afford / Rent price: unchanged (legacy l.491)
    const st = cardState({ matchN, aggOk: !!agg, periodN: a.n });
    const f = facts(bi), tr = trendFor(bi, S, f, P);
    const idx = sortSales(blockTx[bi].filter((i) => TX.m[i] >= P.histFrom && TX.m[i] <= P.histTo), TX.m); // every type, slider years, no More filters
    const cols = { month: (i) => fmtMonth(TX.m[i]), type: (i) => ftShort(D.flat_types[TX.ft[i]]), storey: (i) => storeyShort(D.storeys[TX.s[i]]), sqm: (i) => TX.a[i], price: (i) => TX.p[i], psf: (i) => PSF[i], sel: (i) => ftSet.has(TX.ft[i]) };
    const r = rents && rents.blocks ? rents.blocks[String(bi)] : null;
    const rent = r ? Object.entries(r).map(([ft, row]) => ({ ft, med: row[2] ?? row[7], n: row[0] >= 3 ? row[0] : row[5] })).filter((x) => x.med) : null;
    const rentMode = S.colorBy === 'rent';
    const model = {
      key: bi, simple: ctx.mode?.() === 'simple', head: { sub: f.sub, facts: f.facts, items: f.items, newYear: f.newYear }, st, tiles: { price: a.price, psf: a.psf, n: a.n },
      scope: scopeText({ ft: S.ft, flatTypes: D.flat_types, mFrom: S.mFrom, mTo: S.mTo, fmtMonth, filtOn: filtActive() }), period: t('{0} – {1}', [fmtMonth(S.mFrom), fmtMonth(S.mTo)]), win: P.calc, trend: tr,
      sales: { idx, cols, total: blockTx[bi].length, mine: idx.filter((i) => ftSet.has(TX.ft[i])).length, from: P.hist.from, to: P.hist.to, open: expanded.has(bi) },
      rent, rentFirst: rentMode, folds: { rent: folds.get('rent') ?? rentMode, near: folds.get('near') ?? false, fv: folds.get('fv') ?? false, schools: folds.get('schools') ?? false },
      commute: ctx.commuteLine ? ctx.commuteLine(bi) : null, // B8: same minutes as the compare row
      schools: ctx.schools && ctx.p1Bands && ctx.schools().length ? { bands: schoolBands(ctx.schools(), { lat: b.lat, lon: b.lon }, ctx.p1Bands), bandsKm: ctx.p1Bands } : null, affordPrice: a.price, ho: ctx.handoff ? ctx.handoff(bi) : null,
      fv: ctx.futureValue && blockTx[bi].length ? fvType(bi, ftSet) : null,
      mk: blockTx[bi].length ? { ft: fvType(bi, ftSet), rpi: mkc.hasRpi(), lease: !!ctx.fvFacts, town: f.town } : null,
    };
    Object.assign(model.folds, { mkt: folds.get('mkt') ?? false, lease: folds.get('lease') ?? false });
    const last = sortSales(blockTx[bi], TX.m)[0], warn = f.items.find((x) => x.tone === 'warn');
    const exec = execSummary({ state: f.newYear && !blockTx[bi].length ? 'new' : st.state, outside: st.outside, price: a.price, n: a.n, types: S.ft.length === D.flat_types.length ? t('all flat types') : typesText(S.ft, D.flat_types), win: P.calc,
      lease: f.lease, mrt: f.mrt, last: last != null ? { month: fmtMonth(TX.m[last]), price: TX.p[last] } : null, newYear: f.newYear, warn: warn ? warnShort(warn.html) : '' });
    const lastM = D.months.at(-1), dataLast = +lastM.slice(0, 4);
    const partial = lastM.endsWith('-12') || P.hist.to !== dataLast ? null : { year: dataLast, label: `${monthName(1)}–${monthName(+lastM.slice(5))}` };
    return {
      title: b.label, exec, body: cardHtml(model),
      mount: (el) => {
        const kills = [];
        wire(el, model, a, bi, kills);
        const chart = el.querySelector('.bc-chart');
        const done = tr.enough ? drawTrend(chart, tr.series, { mode: tr.mode, period: { from: D.months[S.mFrom], to: D.months[S.mTo] }, partial, firstYear: P.hist.from, lastYear: P.hist.to, src: tr.src }) : () => {};
        return () => { done(); kills.forEach((k) => k()); };
      },
    };
  }

  // future-value fold: the selected flat type with the most sales in the block (else the most sold type)
  function fvType(bi, ftSet) {
    const c = new Map(), mine = new Map();
    for (const i of blockTx[bi]) { const f = TX.ft[i]; c.set(f, (c.get(f) || 0) + 1); if (ftSet.has(f)) mine.set(f, (mine.get(f) || 0) + 1); }
    const top = (m) => [...m.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0]?.[0];
    return D.flat_types[top(mine) ?? top(c)];
  }
  function wire(el, model, a, bi, kills) {
    const after = () => { if (phone()) dock.close(bi, { refocus: false }); }; // phone: the sheet shows the tab
    el.querySelector('[data-act="add"]')?.addEventListener('click', () => { ctx.onAdd(bi); after(); });
    el.querySelector('[data-act="afford"]')?.addEventListener('click', () => { ctx.onAfford(bi, a.price); after(); });
    el.querySelector('[data-act="rent"]')?.addEventListener('click', () => { ctx.onRent(bi, a.price); after(); });
    el.querySelector('[data-act="schools"]')?.addEventListener('click', () => { // B3: the fact opens the fold
      const d = el.querySelector('[data-fold="schools"]'); if (!d) return;
      d.open = true; d.scrollIntoView({ block: 'nearest' }); d.querySelector('summary').focus();
    });
    el.querySelector('.bc').addEventListener('toggle', (e) => { const d = e.target; if (d.dataset && d.dataset.fold) folds.set(d.dataset.fold, d.open); }, true);
    const fvBox = el.querySelector('[data-fv]'), fvFold = fvBox?.closest('details');
    const fvFill = () => { if (fvFold.open && !fvBox.childElementCount) fvBox.innerHTML = ctx.futureValue(bi, model.fv); }; // computed on first open only
    if (fvFold) { fvFold.addEventListener('toggle', fvFill); fvFill(); }
    for (const box of el.querySelectorAll('[data-mk]')) { // market charts: drawn on first open
      const d = box.closest('details'), m = model.mk;
      const fill = () => { if (d.open && !box.childElementCount) kills.push(box.dataset.mk === 'town' ? mkc.town(box, { bi, types: new Set(getS().ft), town: m.town }) : mkc.lease(box, { bi, ft: m.ft, town: m.town, type: ftShort(m.ft) })); };
      d.addEventListener('toggle', fill); fill();
    }
    const sec = el.querySelector('.bc-sales'); if (!sec) return;
    const s = model.sales, box = sec.querySelector('.bc-table'), more = sec.querySelector('.bc-more');
    more.addEventListener('click', () => { // focus stays on the button
      if (expanded.has(bi)) expanded.delete(bi); else expanded.add(bi);
      const on = expanded.has(bi);
      box.innerHTML = salesTable(s.idx, s.cols, on); box.classList.toggle('open', on); more.textContent = moreText(s.idx.length, on);
    });
  }

  function open(bi) { if (dock.has(bi)) { dock.open(bi); return; } expanded.delete(bi); dock.open(bi, content(bi)); } // open again → front + pulse
  /** B3: open the school card for a school of ctx.schools() (the map search); false when it is not on that list. */
  function openSchool(school) {
    const i = sc ? ctx.schools().indexOf(school) : -1; if (i < 0) return false;
    const k = `s:${i}`; if (dock.has(k)) dock.open(k); else dock.open(k, contentFor(k));
    return true;
  }
  let timer = null;
  /** Rebuild every open card (filters, period, window, flat types, colour mode, budget changed). */
  function refresh() {
    clearTimeout(timer);
    timer = setTimeout(() => { const keys = dock.list(); if (!keys.length) return; keys.forEach((k) => dock.update(k, contentFor(k))); dock.say(t('Cards updated for your filters.')); }, REFRESH_MS);
  }
  return { open, openSchool, refresh, chipsOn: dock.chipsOn, list: () => dock.list().filter((k) => !isSchool(k)) };
}
