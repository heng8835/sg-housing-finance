// Future-value scorecard, step 2: score drivers 1-8 (comparer-future-value.md) for one flat.
// Each driver -> { id, metric, unit, score 1-5 | null, parts, rationale: { id, args }, reason }.
// Per-driver only — there is deliberately NO overall score (owner decision 2026-10-07).
// Pure: facts come from engine/futurevalue-facts.js, heuristics from `params`
// (modules/explore/futurevalue-params.js). Educational signals, not a price forecast or advice.
import { futureValueFacts } from './futurevalue-facts.js';

export const DRIVERS = ['lease', 'momentum', 'value', 'catalysts', 'supply', 'yield', 'liquidity', 'scarcity'];

/** English rationale templates ({0} placeholders; translated by the UI with t()). */
export const RATIONALES = {
  'fv.nodata': 'Not enough data for this flat.',
  'fv.lease': '{0} years of lease left now; {1} years in {2} years.',
  'fv.lease.drag': '{0} years of lease left now; {1} years in {2} years. In {3}, flats with that much lease left sold for {4}% per m² compared with this lease band (last {5} months).',
  'fv.lease.unknown': 'Lease start year unknown.',
  'fv.momentum': '{0} {1} prices changed {2}% over {3} years; all HDB resale (Resale Price Index) changed {4}%.',
  'fv.momentum.no-rpi': 'Resale Price Index not loaded, so the town trend cannot be compared with the market.',
  'fv.momentum.thin': 'Not enough {0} sales in {1} to measure a {2}-year trend.',
  'fv.value.ask': 'The asking price is {0}% vs the median price per m² of {1} similar-lease sales in {2} (last {3} months).',
  'fv.value.block': 'This block sold at {0}% vs the median price per m² of {1} similar-lease sales in {2} (last {3} months).',
  'fv.value.thin': 'Not enough comparable sales (same town and type, similar lease) to compare.',
  'fv.value.thin-block': 'Fewer than {0} sales of this type in the block in the last {1} months; enter an asking price to compare.',
  'fv.value.unknown': 'Lease start year unknown, so similar-lease sales cannot be picked.',
  'fv.catalysts': 'Within reach: {0} future MRT station(s) (≤ {1} km), {2} major project(s), {3} Master Plan {4} zone(s) of the tracked kinds within {5} m.',
  'fv.catalysts.no-landuse': 'Within reach: {0} future MRT station(s) (≤ {1} km) and {2} major project(s); Master Plan land use not loaded.',
  'fv.catalysts.none': 'No future MRT, project or land-use data loaded.',
  'fv.supply': 'About {0} units within {1} km may reach the market soon: {2} in upcoming BTO projects and {3} in blocks whose {4}-year MOP ends by {5} ({6} existing units nearby).',
  'fv.supply.no-bto': 'About {0} units within {1} km in blocks whose {2}-year MOP ends by {3} ({4} existing units nearby); BTO projects not loaded.',
  'fv.supply.bto-off': 'About {0} units within {1} km in blocks whose {2}-year MOP ends by {3} ({4} existing units nearby). BTO supply not included in this version.',
  'fv.yield': 'Gross rental yield about {0}% (median rent ${1} a month) vs {2}% for {4} flats in {3}.',
  'fv.yield.no-town': 'Gross rental yield about {0}% (median rent ${1} a month); no town figure to compare with.',
  'fv.yield.no-rent': 'No rental records for this flat type here.',
  'fv.yield.no-price': 'No recent price to work out a yield.',
  'fv.yield.town-only': 'Only town-wide rent and price are known here (about {0}% gross), so this flat cannot be compared with its town.',
  'fv.liquidity': 'Sales in the last {1} months: {0} (about {2} a year) — {3}% of the block\'s {4} flats a year.',
  'fv.liquidity.no-units': 'Sales in the last {1} months: {0} (about {2} a year); the block\'s unit count is unknown.',
  'fv.scarcity': '{0} flats are {1}% of the sold flats in {2}.',
  'fv.scarcity.big': '{0} flats are {1}% of the sold flats in {2}; this one is {3}% larger than the town median.',
  'fv.scarcity.rare': '{0} flats are {1}% of the sold flats in {2}; {3} is a rare model.',
  'fv.scarcity.big-rare': '{0} flats are {1}% of the sold flats in {2}; this one is {3}% larger than the town median and {4} is a rare model.',
  'fv.scarcity.no-mix': 'Town unit mix not loaded.',
};

/** Fill a template's {0}, {1}... with args (UI passes the translated template). */
export const fillTemplate = (tpl, args = []) => String(tpl).replace(new RegExp('\\{(\\d+)\\}', 'g'), (m, i) => (args[i] ?? m));
/** English text of a driver's rationale. */
export const rationaleText = (r) => fillTemplate(RATIONALES[r?.id] ?? r?.id ?? '', r?.args);

/**
 * Sub-score 1..(cuts.length + 1) from ascending cut-offs.
 * higher-is-better: 1 + #(cut <= value); lower-is-better: 1 + #(cut >= value). null value -> null.
 */
export function band(value, cuts, higherIsBetter = true) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return 1 + cuts.filter((c) => (higherIsBetter ? value >= c : value <= c)).length;
}

const PRICE_LABEL = { asking: 'Asking price', block: 'Block median price', town: 'Town median price' };
const driver = (id, metric, unit, score, parts, rid, args = [], reason = null) => ({ id, metric, unit, score, parts, rationale: { id: rid, args }, reason });
const nul = (id, rid, args = [], reason = 'no-data', parts = []) => driver(id, null, null, null, parts, rid, args, reason);
const part = (label, value, unit = null, args = []) => ({ label, value, unit, args }); // label: English template

export function scoreLease(f, p, windowMonths) {
  if (!f || f.now == null) return nul('lease', 'fv.lease.unknown', [], 'no-lease');
  const parts = [part('Lease left now', f.now, 'years'), part('Lease left in {0} years', f.later, 'years', [f.horizon]), part('Lease start', f.start, 'year')];
  const score = band(f.later, p.bands, true);
  if (f.drag?.pct != null) {
    parts.push(part('Price per m² with that lease vs now', f.drag.pct, '%'));
    return driver('lease', f.later, 'years', score, parts, 'fv.lease.drag', [f.now, f.later, f.horizon, f.town ?? '', f.drag.pct, windowMonths]);
  }
  return driver('lease', f.later, 'years', score, parts, 'fv.lease', [f.now, f.later, f.horizon]);
}

export function scoreMomentum(f, p, flatType) {
  if (!f?.rpi) return nul('momentum', 'fv.momentum.no-rpi', [], 'no-rpi');
  const s = f.series.find((x) => x.years === p.scoreYears);
  const parts = f.series.flatMap((x) => [part('Town change over {0} years', x.town, '%', [x.years]), part('RPI change over {0} years', x.rpi, '%', [x.years])]);
  if (!s || s.excess == null) return nul('momentum', 'fv.momentum.thin', [flatType, f.town, p.scoreYears], 'thin', parts);
  return driver('momentum', s.excess, 'pp', band(s.excess, p.bands, true), parts, 'fv.momentum', [f.town, flatType, s.town, s.years, s.rpi]);
}

export function scoreValue(f, p, leaseKnown, months) {
  if (!leaseKnown) return nul('value', 'fv.value.unknown', [], 'no-lease');
  const basis = f.askPsm != null ? 'ask' : 'block', mine = f.askPsm ?? f.blockPsm;
  const parts = [part('Asking price per m²', f.askPsm, '$/m²'), part('Block median per m²', f.blockPsm, '$/m²'), part('Similar-lease median per m²', f.peerPsm, '$/m²')];
  if (mine == null) return nul('value', 'fv.value.thin-block', [f.minN, months], 'thin', parts);
  if (f.peerPsm == null) return nul('value', 'fv.value.thin', [], 'thin', parts);
  const gap = (mine / f.peerPsm - 1) * 100;
  return driver('value', gap, '%', band(gap, p.bands, false), parts, `fv.value.${basis}`, [gap, f.nPeer, f.town, months]);
}

export function scoreCatalysts(f, p) {
  if (!f || (!f.hasFuture && !f.projects?.length && !f.landuse)) return nul('catalysts', 'fv.catalysts.none');
  const lu = p.landuse;
  let zones = 0, luPts = 0;
  for (const [cat, v] of Object.entries(f.landuse || {})) {
    zones += v.n;
    luPts += (lu.weights[cat] ?? 0) * Math.min(v.n, lu.cap);
  }
  const pts = (f.mrt ? p.points.mrt : 0) + f.projects.length * p.points.project + luPts;
  const parts = [
    part('Nearest future MRT', f.mrt ? `${f.mrt.name}${f.mrt.year ? ` (${f.mrt.year})` : ''}` : null),
    part('Distance to it', f.mrt?.km ?? null, 'km'),
    part('Major projects', f.projects.map((x) => x.name).join(', ') || null),
    part('Land-use points', f.landuse ? luPts : null),
  ];
  return f.landuse
    ? driver('catalysts', pts, 'points', band(pts, p.bands, true), parts, 'fv.catalysts', [f.stations, p.mrtKm, f.projects.length, zones, f.landuseYear, f.radiusM])
    : driver('catalysts', pts, 'points', band(pts, p.bands, true), parts, 'fv.catalysts.no-landuse', [f.stations, p.mrtKm, f.projects.length]);
}

export function scoreSupply(f, p, asOfYear) {
  if (!f) return nul('supply', 'fv.nodata');
  const units = f.btoUnits + f.mopUnits, by = asOfYear + p.mopWindowYears;
  const parts = [part('Upcoming BTO units', f.hasBto ? f.btoUnits : null), part('MOP-wave units', f.mopUnits), part('Existing units', f.stock)];
  if (f.btoOff) { // btoData switch off (DEC-015): MOP wave only, capped (half the supply is unknown) and marked partial
    const s = band(f.mopUnits, p.bands, false), score = s == null ? null : Math.min(s, p.capWhenPartial);
    return { ...driver('supply', f.mopUnits, 'units', score, parts.slice(1), 'fv.supply.bto-off', [f.mopUnits, p.radiusKm, f.mopYears, by, f.stock]), partial: true };
  }
  return f.hasBto
    ? driver('supply', units, 'units', band(units, p.bands, false), parts, 'fv.supply', [units, p.radiusKm, f.btoUnits, f.mopUnits, f.mopYears, by, f.stock])
    : driver('supply', units, 'units', band(units, p.bands, false), parts, 'fv.supply.no-bto', [units, p.radiusKm, f.mopYears, by, f.stock]);
}

export function scoreYield(f, p, flatType) {
  if (!f || f.rent == null) return nul('yield', 'fv.yield.no-rent', [], 'no-rent');
  if (f.pct == null) return nul('yield', 'fv.yield.no-price', [], 'no-price');
  const parts = [part('Median rent', f.rent, '$/month'), part(PRICE_LABEL[f.priceSource] ?? 'Price used', f.price, '$'), part('Gross yield', f.pct, '%'), part('Town gross yield', f.townPct, '%')];
  if (f.rentTier === 'town' && f.priceSource === 'town') return driver('yield', f.pct, '%', null, parts, 'fv.yield.town-only', [f.pct], 'town-only');
  if (f.townPct == null) return driver('yield', f.pct, '%', null, parts, 'fv.yield.no-town', [f.pct, f.rent], 'no-town');
  const rel = (f.pct / f.townPct - 1) * 100;
  return driver('yield', f.pct, '%', band(rel, p.bands, true), parts, 'fv.yield', [f.pct, f.rent, f.townPct, f.town, flatType]);
}

export function scoreLiquidity(f, p) {
  if (!f) return nul('liquidity', 'fv.nodata');
  const parts = [part('Sales in the block', f.sales), part('Sales a year', f.perYear), part('Turnover a year', f.turnoverPct, '%')];
  if (f.turnoverPct == null) return driver('liquidity', f.perYear, 'sales/year', band(f.perYear, p.salesBands, true), parts, 'fv.liquidity.no-units', [f.sales, f.months, f.perYear]);
  return driver('liquidity', f.turnoverPct, '%', band(f.turnoverPct, p.turnoverBands, true), parts, 'fv.liquidity', [f.sales, f.months, f.perYear, f.turnoverPct, f.units]);
}

export function scoreScarcity(f, p) {
  if (!f || f.sharePct == null) return nul('scarcity', 'fv.scarcity.no-mix', [], 'no-mix');
  const big = f.sizePct != null && f.sizePct >= p.bigPct;
  const score = Math.min(p.shareBands.length + 1, band(f.sharePct, p.shareBands, false) + (big ? 1 : 0) + (f.rare ? 1 : 0));
  const parts = [part('Share of the town\'s flats', f.sharePct, '%'), part('Size vs town median', f.sizePct, '%'), part('Model', f.model)];
  const rid = big && f.rare ? 'fv.scarcity.big-rare' : big ? 'fv.scarcity.big' : f.rare ? 'fv.scarcity.rare' : 'fv.scarcity';
  const args = [f.flatType, f.sharePct, f.town, ...(big ? [f.sizePct] : []), ...(f.rare ? [f.model] : [])];
  return driver('scarcity', f.sharePct, '%', score, parts, rid, args);
}

/** Score measured facts (from futureValueFacts) -> { asOf, bid, town, flatType, drivers[8] }. */
export function scorecard(facts, params) {
  if (!facts) return { asOf: null, drivers: DRIVERS.map((id) => nul(id, 'fv.nodata')) };
  const asOfYear = Number(String(facts.asOf).split('-')[0]);
  const lease = { ...facts.lease, town: facts.town };
  return {
    asOf: facts.asOf, bid: facts.bid, town: facts.town, flatType: facts.flatType,
    drivers: [
      scoreLease(lease, params.lease, params.lease.dragWindowMonths),
      scoreMomentum(facts.momentum, params.momentum, facts.flatType),
      scoreValue(facts.value, params.value, facts.lease.start != null, params.longWindowMonths),
      scoreCatalysts(facts.catalysts, params.catalysts),
      scoreSupply(facts.supply, params.supply, asOfYear),
      scoreYield(facts.yield, params.yield, facts.flatType),
      scoreLiquidity(facts.liquidity, params.liquidity),
      scoreScarcity(facts.scarcity, params.scarcity),
    ],
  };
}

/** Measure + score one flat. See futureValueFacts for ctx / flat shapes. */
export function futureValue(ctx, flat, params, policy) {
  return scorecard(futureValueFacts(ctx, flat, params, policy), params);
}
