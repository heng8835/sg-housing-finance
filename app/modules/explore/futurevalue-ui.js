// Explore — future-value scorecard UI (phase 6b task 4; phase6-journeys.md AC 9 + owner decision 2:
// per-driver scorecard ONLY, no overall number; drivers and caveats from comparer-future-value.md).
// Owns the compare-table section "Future-value outlook" (8 driver rows; Simple shows lease / catalysts /
// supply), the "How the future-value outlook is scored" panel under the table, the folded block-card
// section and the MOP-wave At-a-glance flag. Scores: engine/futurevalue.js (facts: futurevalue-facts.js);
// heuristics: ./futurevalue-params.js. Facts cost ~15–45 ms per flat, so they are computed lazily per
// shortlisted flat (or per opened card fold) and cached — never per block on the map.
// Rows carry no `v`: no "best in row" highlight, and "best in X of N measures" is unchanged.
// Pure parts are exported for node tests; createFutureValue() wires legacy.js (browser).
import { t } from '../../core/i18n.js';
import { esc } from '../../core/dom.js';
import { scorecard, RATIONALES, DRIVERS } from '../../engine/futurevalue.js';
import { futureValueFacts } from '../../engine/futurevalue-facts.js';
import { FUTURE_VALUE_PARAMS } from './futurevalue-params.js';
import { isSimple, scoreText } from '../../core/plain.js';

export const SEC = 'Future-value outlook';
/** Row keys (English; lookup keys like every compare row, translated at render). */
export const ROW_KEYS = {
  lease: 'Lease runway', momentum: 'Momentum vs market (RPI)', value: 'Relative value (similar lease)',
  catalysts: 'Catalysts nearby (MRT, projects, zoning)', supply: 'Supply risk (BTO + MOP wave)',
  yield: 'Rental yield (demand floor)', liquidity: 'Liquidity (resale activity)', scarcity: 'Scarcity of the flat type',
};
// Simple mode: the lease runway (the strongest, least disputed driver) and the two "what is coming nearby"
// signals buyers cannot easily see elsewhere. Momentum / value / yield / liquidity overlap existing price rows.
export const SIMPLE_DRIVERS = new Set(['lease', 'catalysts', 'supply']);
// Simple-mode words (B10, P6-6): labels without "MOP wave" / "zoning" / "RPI", a word after every score, and the
// rationales that named Master Plan zones or the MOP said plainly. Same args, same numbers; Pro keeps ROW_KEYS etc.
export const SIMPLE_LABELS = {
  lease: 'Lease left when you may sell', momentum: 'Price trend vs all HDB resale', value: 'Price vs similar-lease sales',
  catalysts: 'Planned amenities nearby (MRT, projects)', supply: 'New supply nearby', yield: 'Rent vs price (rental yield)',
  liquidity: 'How often flats here sell', scarcity: 'How rare this flat type is',
};
export const SIMPLE_BADGE = '~{0} flats within {1} km may come up for sale by {3}, when their {2}-year minimum stay ends — more flats for sale nearby';
export const SIMPLE_RATIONALES = {
  'fv.catalysts': 'Within reach: {0} future MRT station(s) (≤ {1} km), {2} major project(s) and {3} planned amenity area(s) within {5} m.',
  'fv.catalysts.no-landuse': 'Within reach: {0} future MRT station(s) (≤ {1} km) and {2} major project(s).',
  'fv.supply': 'About {0} flats within {1} km may come up for sale soon: {2} in new flats being built and {3} in blocks whose {4}-year minimum stay ends by {5} ({6} flats nearby now).',
  'fv.supply.no-bto': 'About {0} flats within {1} km may come up for sale by {3}, when their {2}-year minimum stay ends ({4} flats nearby now).',
  'fv.supply.bto-off': 'About {0} flats within {1} km may come up for sale by {3}, when their {2}-year minimum stay ends ({4} flats nearby now).',
};
/** Compare row → glossary term (merged into legacy ROW_TERMS). */
export const TERMS = Object.fromEntries(DRIVERS.map((id) => [ROW_KEYS[id], { lease: 'lease-decay', momentum: 'rpi', supply: 'mop' }[id] || 'future-value']));
const MARKET_REASONS = new Set(['no-rpi', 'no-mix']); // null because market.js is missing
export const CACHE_MAX = 64;

// ------------------------------------------------------------------ formatting
const titleCase = (s) => String(s).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const r1 = (v) => { const x = Math.round(v * 10) / 10; return x === 0 ? 0 : x; }; // no "-0.0"
const FMT = {
  y: (v) => r1(v).toFixed(1),                       // years, as the lease rows (59.3)
  i: (v) => String(Math.round(v)),                  // counts / years without grouping (2028)
  n: (v) => Math.round(v).toLocaleString('en-SG'),  // units / dollars (2,933)
  g: (v) => String(r1(v)),                          // up to 1 decimal (0.8, 1, 4.5)
  d1: (v) => r1(v).toFixed(1),                      // yields (6.1)
  sp: (v) => { const x = r1(v); return (x > 0 ? '+' : '') + x.toFixed(1); }, // signed % / pp (+15.9)
  town: (v) => titleCase(v), ft: (v) => t(String(v)), model: (v) => titleCase(v),
};
/** Format of each {n} placeholder per rationale template (engine args are raw numbers / codes). */
export const ARG_FORMATS = {
  'fv.lease': ['y', 'y', 'i'],
  'fv.lease.drag': ['y', 'y', 'i', 'town', 'sp', 'i'],
  'fv.momentum': ['town', 'ft', 'sp', 'i', 'sp'],
  'fv.momentum.thin': ['ft', 'town', 'i'],
  'fv.value.ask': ['sp', 'n', 'town', 'i'],
  'fv.value.block': ['sp', 'n', 'town', 'i'],
  'fv.value.thin-block': ['i', 'i'],
  'fv.catalysts': ['i', 'g', 'i', 'i', 'i', 'i'],
  'fv.catalysts.no-landuse': ['i', 'g', 'i'],
  'fv.supply': ['n', 'g', 'n', 'n', 'i', 'i', 'n'],
  'fv.supply.no-bto': ['n', 'g', 'i', 'i', 'n'],
  'fv.supply.bto-off': ['n', 'g', 'i', 'i', 'n'],
  'fv.yield': ['d1', 'n', 'd1', 'town', 'ft'],
  'fv.yield.no-town': ['d1', 'n'],
  'fv.yield.town-only': ['d1'],
  'fv.liquidity': ['i', 'i', 'g', 'g', 'n'],
  'fv.liquidity.no-units': ['i', 'i', 'g'],
  'fv.scarcity': ['ft', 'i', 'town'],
  'fv.scarcity.big': ['ft', 'i', 'town', 'i'],
  'fv.scarcity.rare': ['ft', 'i', 'town', 'model'],
  'fv.scarcity.big-rare': ['ft', 'i', 'town', 'i', 'model'],
};
export function formatArgs(id, args = []) {
  const f = ARG_FORMATS[id] || [];
  return args.map((a, k) => (a == null || a === '' ? '—' : FMT[f[k]] ? FMT[f[k]](a) : typeof a === 'number' ? FMT.g(a) : String(a)));
}
/** Translated rationale text (plain; escape before use in HTML). Simple mode: the plain variant when there is one. */
export const rationale = (r, mode = 'pro') => t((isSimple(mode) && SIMPLE_RATIONALES[r?.id]) || (RATIONALES[r?.id] ?? r?.id ?? ''), formatArgs(r?.id, r?.args));

/** Headline of a measured driver: "49 y left in 10 y". */
const HEAD = {
  lease: (d, p) => t('{0} y left in {1} y', [Math.round(d.metric), p.lease.horizonYears]),
  momentum: (d, p) => t('{0} pp vs RPI over {1} y', [FMT.sp(d.metric), p.momentum.scoreYears]),
  value: (d) => t('{0}% vs similar-lease sales', [FMT.sp(d.metric)]),
  catalysts: (d) => t('{0} points', [FMT.g(d.metric)]),
  supply: (d, p) => t('~{0} flats within {1} km', [FMT.n(d.metric), FMT.g(p.supply.radiusKm)]),
  yield: (d) => t('{0}% gross yield', [FMT.d1(d.metric)]),
  liquidity: (d) => (d.unit === '%' ? t('turnover {0}% a year', [FMT.g(d.metric)]) : t('{0} sales a year', [FMT.g(d.metric)])),
  scarcity: (d) => t('{0}% of the town\'s sold flats', [FMT.i(d.metric)]),
};
/** Simple-mode headlines that differ: "pp vs RPI" spelled out; catalyst "points" dropped (the score word says it). */
const HEAD_SIMPLE = {
  momentum: (d, p) => t('{0} percentage points vs all HDB resale over {1} y', [FMT.sp(d.metric), p.momentum.scoreYears]),
  catalysts: () => '',
};
export const headline = (d, p = FUTURE_VALUE_PARAMS, mode = 'pro') => {
  if (d.metric == null) return '';
  if (isSimple(mode) && HEAD_SIMPLE[d.id]) return HEAD_SIMPLE[d.id](d, p);
  return HEAD[d.id] ? HEAD[d.id](d, p) : '';
};
/** Row / card label of a driver: Pro = ROW_KEYS, Simple = SIMPLE_LABELS (translated). */
export const driverLabel = (id, mode = 'pro') => t(isSimple(mode) ? SIMPLE_LABELS[id] : ROW_KEYS[id]);
/** 5 pips, visual only (aria-hidden): the text "3/5" carries the value for the table dump, TSV and screen readers. */
export const pips = (s) => `<span class="fv-pips" aria-hidden="true">${[1, 2, 3, 4, 5].map((k) => `<i${k <= s ? ' class="on"' : ''}></i>`).join('')}</span>`;

/** 'ok' | 'missing' (no market.js) | 'stale' (land use built for another data.js — the engine ignores it). */
export function marketState(market, hdb) {
  if (!market) return 'missing';
  return market.landuse && hdb && market.landuse.blocks !== hdb.blocks.length ? 'stale' : 'ok';
}

/** One driver cell: "3/5 · 49 y left in 10 y" + rationale; null score → "—" + the reason. Simple: "3/5 — average". */
export function cellHtml(d, { params = FUTURE_VALUE_PARAMS, market = 'ok', mode = 'pro' } = {}) {
  const missing = market === 'missing', partial = missing && d.id === 'catalysts'; // MRT only: projects + zoning live in market.js
  let why = missing && MARKET_REASONS.has(d.reason) ? t('Market data not loaded') : rationale(d.rationale, mode);
  if (partial) why += ' · ' + t('Market data not loaded');
  const head = headline(d, params, mode);
  if (d.score == null || partial) return `<span class="muted">${head ? `— · ${esc(head)}` : '—'}</span><small>${esc(why)}</small>`;
  const score = isSimple(mode) ? scoreText(d.score, d.partial)
    : d.partial ? t('{0}/5 (partial)', [d.score]) : t('{0}/5', [d.score]); // partial: supply without BTO (DEC-015)
  return `${pips(d.score)}${score}${head ? ` · ${esc(head)}` : ''}<small>${esc(why)}</small>`;
}

// ------------------------------------------------------------------ explanations
const cuts = (a) => a.join(' · ');
/** Row tip per driver (also the driver list in the "How this is scored" panel). */
export const TIPS = {
  lease: (p) => t('Years of lease left {0} years from now, when you might sell. Scored 1–5 on cut-offs {1} years (more lease left scores higher). Short leases narrow the pool of buyers who can use CPF and HDB loans in full, so prices tend to fall faster.', [p.lease.horizonYears, cuts(p.lease.bands)]),
  momentum: (p) => t('Change in this town\'s median price per m² for the flat type over {0} years, minus the change in HDB\'s Resale Price Index over the same window, in percentage points. Cut-offs {1} pp. Past momentum is not a guide to future returns.', [p.momentum.scoreYears, cuts(p.momentum.bands)]),
  value: (p) => t('Asking price per m² (or the block\'s median) vs the median of sales in the same town and flat type with a lease start within ±{0} years, last {1} months. Cheaper than its peers scores higher; cut-offs {2}%. Storey, renovation and view are not adjusted.', [p.value.leaseBandYears / 2, p.longWindowMonths, cuts(p.value.bands)]),
  catalysts: (p) => t('Points: a future MRT station within {0} km = {1}, each curated major project within reach = {2}, Master Plan zones of the tracked kinds (commercial, white, business park, civic, health, sports, reserve) within 800 m = small weights, capped. Cut-offs {3} points. Zoning is not a committed project.', [FMT.g(p.catalysts.mrtKm), p.catalysts.points.mrt, p.catalysts.points.project, cuts(p.catalysts.bands)]),
  supply: (p, policy, btoOff = false) => (btoOff
    ? t('Flats within {0} km that may reach the resale market soon: blocks whose {1}-year MOP ends within {2} years. Fewer scores higher; cut-offs {3} units. BTO supply not included in this version, so the score is at most {4}/5 and marked partial.', [FMT.g(p.supply.radiusKm), policy.get('rentbuy.mop.years').standard, p.supply.mopWindowYears, cuts(p.supply.bands), p.supply.capWhenPartial])
    : t('Flats within {0} km that may reach the resale market soon: upcoming BTO projects plus blocks whose {1}-year MOP ends within {2} years. Fewer scores higher; cut-offs {3} units. BTO positions and unit counts are approximate.', [FMT.g(p.supply.radiusKm), policy.get('rentbuy.mop.years').standard, p.supply.mopWindowYears, cuts(p.supply.bands)])),
  yield: (p) => t('Median monthly rent × 12 ÷ price (the asking price, else the block\'s recent median), compared with the town\'s yield for this flat type: cut-offs {0}% relative to the town. Rents are declared rents and may lag the market.', [cuts(p.yield.bands)]),
  liquidity: (p) => t('Resales in the block over the last {0} months (all flat types) as a share of its flats, per year. Busier blocks are easier to value and to resell. Cut-offs {1}% a year ({2} sales a year when the unit count is unknown).', [p.longWindowMonths, cuts(p.liquidity.turnoverBands), cuts(p.liquidity.salesBands)]),
  scarcity: (p) => t('The flat type\'s share of the flats sold in the town (HDB property information). Rarer types score higher; +1 if the flat is at least {0}% larger than the town median, +1 for a rare model (maisonette, DBSS, terrace…), at most 5. Cut-offs {1}%.', [p.scarcity.bigPct, cuts(p.scarcity.shareBands)]),
};

/** The "How the future-value outlook is scored" panel under the compare table. btoOff: the btoData switch is off (DEC-015). */
export function howHtml({ open = false, params = FUTURE_VALUE_PARAMS, policy, market, hdb, asOfLabel = '', btoOff = false }) {
  const st = marketState(market, hdb), li = (x) => `<li>${x}</li>`;
  const status = st === 'missing' ? t('Market data not loaded (data/market.js), so momentum, major projects, Master Plan zones and scarcity show —. Run python tools/fetch_market.py to add them.')
    : st === 'stale' ? t('Market data was built for a different data.js, so Master Plan zones are ignored until python tools/fetch_market.py is run again.')
    : t('Market data built {0}.', [String(market.generated_at || '').slice(0, 10)]);
  const drivers = DRIVERS.map((id) => li(`<b>${esc(t(ROW_KEYS[id]))}</b> — ${esc(TIPS[id](params, policy, btoOff))}`)).join('');
  const src = [esc(t('HDB resale transactions (data.gov.sg), sales to {0}.', [asOfLabel]))]; // items are HTML
  for (const s of market?.sources || []) src.push(`${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)}${s.asOf ? ` (${esc(s.asOf)})` : ''}`);
  const lu = market?.landuse;
  if (lu) src.push(esc(t('Master Plan {0} land use: zones of the tracked kinds within {1} m of the block.', [lu.year, lu.radius_m])));
  const cat = market?.catalysts || [];
  if (cat.length) src.push(esc(`${t('Curated major projects (positions approximate):')} ${cat.map((c) => `${c.name} (${c.year ?? t('long-term')})`).join(', ')}`));
  src.push(...['Future MRT stations: URA Master Plan positions; lines and years from LTA announcements.', btoOff ? null : 'Upcoming BTO projects: external BTO listing scrape; positions and unit counts approximate.', 'Rents: HDB renting-out records (data.gov.sg), declared rents.'].filter(Boolean).map((x) => esc(t(x))));
  const caveats = [
    'No driver predicts prices: these are signals that have tended to matter, not a forecast.',
    'Scores are relative signals for comparing flats, not absolute ratings, and there is deliberately no overall score — weigh the drivers yourself.',
    'Master Plan zoning is not a committed project, and the plan cannot tell a built plot from an empty one.',
    btoOff ? 'Curated project positions are approximate.' : 'BTO and curated project positions are approximate.',
    'Rents are declared rents and may lag the market.',
    'Past momentum is not a guide to future returns.',
  ].map((c) => li(esc(t(c)))).join('');
  return `<details class="cmp-fv-how" data-fv-how${open ? ' open' : ''}><summary>${t('How the future-value outlook is scored')}</summary>`
    + `<p>${esc(t('Each driver gets a 1–5 sub-score from fixed cut-offs; a missing input shows — with the reason. Educational signals, not a valuation or advice.'))}</p>`
    + `<p class="fv-status">${esc(status)}</p><h5>${t('Drivers')}</h5><ul>${drivers}</ul>`
    + `<h5>${t('Sources')}</h5><ul>${src.map(li).join('')}</ul>`
    + `<h5>${t('Caveats')}</h5><ul>${caveats}</ul></details>`;
}

/** Block-card fold body: the 8 drivers compactly. */
export function cardListHtml(card, { ftName, asOfLabel = '', params = FUTURE_VALUE_PARAMS, market = 'ok', mode = 'pro' }) {
  const items = DRIVERS.map((id, k) => `<li><span class="bc-fv-k">${esc(driverLabel(id, mode))}</span>${cellHtml(card.drivers[k], { params, market, mode })}</li>`).join('');
  return `<p class="bc-scope">${esc(t('{0} in this block · sales to {1}', [t(ftName), asOfLabel]))}</p><ul class="bc-fv">${items}</ul>`
    + `<p class="bc-cap">${esc(t('1–5 per driver, no overall score: relative signals, not a price forecast. Add the flat to your choices to compare it; the scoring notes are under the comparison table.'))}</p>`;
}

/** The block's most common model among sales of `flatType` (choices have no model field), or null. */
export function blockModel(hdb, bid, flatType) {
  const tx = hdb?.tx, fi = hdb?.flat_types?.indexOf(flatType) ?? -1, c = new Map();
  if (!tx || fi < 0) return null;
  let best = null;
  for (let i = 0; i < tx.b.length; i++) if (tx.b[i] === bid && tx.ft[i] === fi) { const k = tx.mo[i]; c.set(k, (c.get(k) || 0) + 1); if (best == null || c.get(k) > c.get(best)) best = k; }
  return best == null ? null : hdb.models?.[best] ?? null;
}

/** Cache key: everything the facts depend on (block, type, data month, lease, asking area + price, market build). */
export const cacheKey = (f, stamp = '') => [f.bid, f.flatType, f.asOf, f.leaseYear ?? '', f.area ?? '', f.price ?? '', stamp].join('|');

// ------------------------------------------------------------------ browser wiring
/**
 * mode() → 'simple' | 'pro' (the block card's fold wording; the compare rows get both and pickRows chooses).
 * ctx(): { hdb, market, future, bto, btoOff, rents } (window.HDB_* objects or null; btoOff = btoData switch off); asOf() → 'YYYY-MM' (last data month);
 * asOfLabel() → 'Sep 2026'; modelOf(bid, flatType) → model for the scarcity bonus (default: blockModel);
 * body: #cmpBody (keeps the panel's open state across re-renders).
 * → { of(flat), rows(), insert(rows), badges(m), panel(ms), cardHtml(bi, flatType), factsFor(bi, flatType), terms, size() }
 */
export function createFutureValue({ ctx, policy, asOf, asOfLabel = () => '', params = FUTURE_VALUE_PARAMS, modelOf = (bid, ft) => blockModel(ctx().hdb, bid, ft), body = null, mode = () => 'pro' }) {
  const cache = new Map();
  const stamp = () => { const c = ctx(), m = c.market; return (m ? `${m.generated_at || 'm'}:${m.landuse?.blocks ?? ''}` : '-') + (c.btoOff ? ':nobto' : ''); };
  function of(flat) {
    const key = cacheKey(flat, stamp());
    let x = cache.get(key);
    if (x) { cache.delete(key); cache.set(key, x); return x; } // most recently used last
    const c = ctx(), f = { ...flat, model: flat.model ?? (modelOf ? modelOf(flat.bid, flat.flatType) : undefined) };
    const facts = futureValueFacts(c, f, params, policy);
    x = { facts, card: scorecard(facts, params) };
    cache.set(key, x);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return x;
  }
  const leaseOf = (bid) => ctx().hdb.blocks[bid]?.lease || undefined;
  const flatOf = (c) => ({ bid: c.bid, flatType: ctx().hdb.flat_types[c.ft], asOf: asOf(), leaseYear: leaseOf(c.bid), area: c.sqm, price: c.price });
  const cardOf = (m) => of(flatOf(m.c)).card;

  function rows() {
    const market = marketState(ctx().market, ctx().hdb);
    return [{ sec: SEC }, ...DRIVERS.map((id, k) => ({
      k: ROW_KEYS[id], simple: SIMPLE_DRIVERS.has(id), slbl: driverLabel(id, 'simple'), tip: TIPS[id](params, policy, !!ctx().btoOff),
      f: (m) => cellHtml(cardOf(m).drivers[k], { params, market }),
      fs: (m) => cellHtml(cardOf(m).drivers[k], { params, market, mode: 'simple' }),
    }))];
  }
  /** Put the section right after "Lease & future value" (before the next section); at the end if missing. */
  function insert(r) {
    const lf = r.findIndex((x) => x.sec === 'Lease & future value');
    let at = lf < 0 ? -1 : r.findIndex((x, i) => i > lf && x.sec);
    if (at < 0) at = r.length;
    r.splice(at, 0, ...rows());
    return r;
  }
  /** At-a-glance flag: MOP wave above params.badges.mopUnits (Simple: no "MOP"). */
  function badges(m, mode = 'pro') {
    const { facts } = of(flatOf(m.c)), s = facts?.supply;
    if (!s || !(s.mopUnits > params.badges.mopUnits)) return [];
    const by = Number(String(facts.asOf).slice(0, 4)) + params.supply.mopWindowYears;
    const en = isSimple(mode) ? SIMPLE_BADGE : '~{0} flats within {1} km reach their {2}-year MOP by {3} — more resale supply nearby';
    return [['warn', '!', t(en, [FMT.n(s.mopUnits), FMT.g(params.supply.radiusKm), s.mopYears, by])]];
  }
  let howOpen = false;
  if (body) body.addEventListener('toggle', (e) => { if (e.target?.dataset && 'fvHow' in e.target.dataset) howOpen = e.target.open; }, true);
  const panel = (ms) => (ms && ms.length ? howHtml({ open: howOpen, params, policy, market: ctx().market, hdb: ctx().hdb, asOfLabel: asOfLabel(), btoOff: !!ctx().btoOff }) : '');
  function cardHtml(bi, flatType) {
    const { card } = of({ bid: bi, flatType, asOf: asOf(), leaseYear: leaseOf(bi) });
    return cardListHtml(card, { ftName: flatType, asOfLabel: asOfLabel(), params, market: marketState(ctx().market, ctx().hdb), mode: mode() });
  }
  /** The facts behind the card fold (same cache entry) — the block card's "Lease and value" chart reads facts.lease.curve. */
  const factsFor = (bi, flatType) => of({ bid: bi, flatType, asOf: asOf(), leaseYear: leaseOf(bi) }).facts;
  return { of, rows, insert, badges, panel, cardHtml, factsFor, terms: TERMS, size: () => cache.size };
}
