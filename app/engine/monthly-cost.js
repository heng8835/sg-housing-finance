// True monthly cost of owning a home (phase 5): instalment + property tax + S&CC + utilities +
// HPS + fire insurance (+ private maintenance), and the floating-rate risk band from 3M SORA.
// Pure: every rate, band and table comes from `policy.get(id)` (ids cost.*).
import { pmt } from './mortgage.js';

/**
 * Canonical flat-type key used by the cost.* tables: '1 ROOM' … '5 ROOM', 'EXECUTIVE', 'PRIVATE'.
 * Multi-generation flats share the Executive rows (town councils, Etiqa and MSE group them so).
 * @param {string|null|undefined} flatType HDB label ('4 ROOM', 'EXECUTIVE', 'MULTI-GENERATION') or 'PRIVATE'
 * @returns {string}
 */
export function flatKey(flatType) {
  const t = String(flatType || '').toUpperCase().replace('-', ' ').trim();
  for (const k of ['1 ROOM', '2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM']) if (t.startsWith(k)) return k;
  if (t.startsWith('EXECUTIVE') || t.startsWith('MULTI')) return 'EXECUTIVE';
  return 'PRIVATE';
}

/** Progressive tax over `[[width, rate], ..., [null, topRate]]` bands (no rounding, no minimum). */
export function progressiveTax(amount, bands) {
  if (!(amount > 0)) return 0;
  let left = amount, tax = 0;
  for (const [width, rate] of bands) {
    const x = width == null ? left : Math.min(left, width);
    tax += x * rate; left -= x;
    if (left <= 0) break;
  }
  return tax;
}

/**
 * Annual property tax on `annualValue`. Owner-occupier or non-owner-occupier bands; the owner-occupier
 * rebate in force (cost.ptax.rebate) is applied — HDB: a flat %, private: % capped.
 * @returns {{ gross:number, rebate:number, net:number }}
 */
export function propertyTax({ annualValue, ownerOccupied = true, hdb = true }, policy) {
  const gross = progressiveTax(annualValue, policy.get(ownerOccupied ? 'cost.ptax.owner_occupied.bands' : 'cost.ptax.non_owner_occupied.bands'));
  let rebate = 0;
  if (ownerOccupied) {
    const r = policy.get('cost.ptax.rebate');
    rebate = hdb ? gross * r.hdb : Math.min(gross * r.private.rate, r.private.cap);
  }
  return { gross, rebate, net: gross - rebate };
}

const src = (policy, id) => (policy.meta ? policy.meta(id).source_url : null);
const mid = ([lo, hi]) => (lo + hi) / 2;

/**
 * Monthly cost lines for one home.
 * @param {{ flatType:string, price:number, loan:{amount:number, rate:number, years:number},
 *           annualValue?:number|null, marketMonthlyRent?:number|null, ownerOccupied?:boolean,
 *           sccRate?:'reduced'|'normal', hps?:boolean, maintenanceMonthly?:number, town?:string|null }} x
 *   annualValue wins over marketMonthlyRent × 12 (IRAS: AV = estimated annual rent, unfurnished).
 *   sccRate 'reduced' = citizen household without other property (town-council definition).
 * @param {{get:(id:string)=>any, meta?:(id:string)=>any}} policy
 * @returns {{ items:{id:string, monthly:number|null, basis:string, source:string|null, range?:number[]}[],
 *             total:number, notes:string[], avSource:'notice'|'estimate'|null, avUsed:number|null }}
 *   avSource 'notice' = the typed Annual Value; 'estimate' = marketMonthlyRent × 12 × cost.ptax.av_rent_factor.
 */
export function monthlyCost(x, policy) {
  const key = flatKey(x.flatType), hdb = key !== 'PRIVATE';
  const ownerOccupied = x.ownerOccupied !== false;
  const items = [], notes = [];
  const loan = x.loan || { amount: 0, rate: 0, years: 0 };

  // 1. mortgage instalment
  const instalment = loan.amount > 0 && loan.years > 0 ? pmt(loan.amount, loan.rate, loan.years) : 0;
  items.push({ id: 'mortgage', monthly: instalment, basis: `Instalment on ${Math.round(loan.amount || 0)} at ${(loan.rate * 100).toFixed(2)}% over ${loan.years || 0} years.`, source: null });

  // 2. property tax on Annual Value: the IRAS notice figure, else an estimate from a market rent
  //    (AV ≈ rent × 12 × cost.ptax.av_rent_factor — an ASSUMPTION, see the policy note)
  const avSource = x.annualValue != null ? 'notice' : x.marketMonthlyRent != null ? 'estimate' : null;
  const av = avSource === 'notice' ? x.annualValue
    : avSource === 'estimate' ? x.marketMonthlyRent * 12 * policy.get('cost.ptax.av_rent_factor') : null;
  const ptaxId = ownerOccupied ? 'cost.ptax.owner_occupied.bands' : 'cost.ptax.non_owner_occupied.bands';
  if (av == null) {
    items.push({ id: 'property-tax', monthly: null, basis: 'Enter the Annual Value (from the IRAS notice) or a market rent to estimate property tax.', source: src(policy, ptaxId) });
  } else {
    const t = propertyTax({ annualValue: av, ownerOccupied, hdb }, policy);
    const rates = ownerOccupied ? 'Owner-occupier' : 'Non-owner-occupier';
    const from = x.annualValue != null ? '' : ' (market rent × 12)';
    items.push({
      id: 'property-tax', monthly: t.net / 12, source: src(policy, ptaxId),
      basis: `${rates} rates on an Annual Value of ${Math.round(av)}${from}: ${Math.round(t.gross)}/yr, less rebate ${Math.round(t.rebate)}.`,
    });
    if (hdb) notes.push('IRAS sets an HDB flat\'s Annual Value from market rents of comparable flats (unfurnished), not the rent actually received; your IRAS notice is the exact figure.');
  }

  // 3. service & conservancy charges (HDB) or condo maintenance (private, user input)
  if (hdb) {
    const table = policy.get('cost.scc.monthly')[x.sccRate === 'normal' ? 'normal' : 'reduced'];
    const range = table[key];
    const kind = x.sccRate === 'normal' ? 'normal' : 'reduced (citizen)';
    const townHint = x.town ? '; check the ' + x.town + ' town council for the exact rate' : '';
    items.push({ id: 'scc', monthly: mid(range), range, source: src(policy, 'cost.scc.monthly'),
      basis: `Mid-point of ${kind} S&CC for a ${key.toLowerCase()} flat across sampled town councils${townHint}.` });
  }
  if (x.maintenanceMonthly > 0) items.push({ id: 'maintenance', monthly: x.maintenanceMonthly, basis: 'Maintenance and sinking fund (your input).', source: null });

  // 4. utilities: average electricity + water use for the dwelling type × current prices, plus GST
  const use = policy.get('cost.utilities.consumption')[key];
  const gst = policy.get('cost.gst.rate');
  const power = use.kwh * policy.get('cost.utilities.electricity_tariff'), water = use.m3 * policy.get('cost.utilities.water_price');
  items.push({ id: 'utilities', monthly: (power + water) * (1 + gst), source: src(policy, 'cost.utilities.consumption'),
    basis: `Average ${use.kwh} kWh electricity + ${use.m3} m³ water a month for this dwelling type, at current tariffs incl. GST; excludes gas and U-Save rebates.` });

  // 5. Home Protection Scheme (HDB flats serviced with CPF) — indicative, scaled from CPF's example
  if (hdb && x.hps !== false && loan.amount > 0) {
    const ex = policy.get('cost.hps.example');
    items.push({ id: 'hps', monthly: ex.annualPremium * (loan.amount / ex.cover) / 12, source: src(policy, 'cost.hps.example'),
      basis: `Indicative: CPF's example premium (${ex.annualPremium}/yr for ${ex.cover} cover, age ${ex.age}, ${ex.years} years) scaled to your loan. Real premiums depend on age, gender and term.` });
  }

  // 6. HDB fire insurance (compulsory with an HDB loan), premium spread over its term
  if (hdb) {
    const years = policy.get('cost.fire.term_years');
    items.push({ id: 'fire', monthly: policy.get('cost.fire.premium')[key] / years / 12, source: src(policy, 'cost.fire.premium'),
      basis: `HDB fire insurance premium for a ${key.toLowerCase()} flat, paid once per ${years}-year term.` });
  }

  const total = items.reduce((t, i) => t + (i.monthly || 0), 0);
  return { items, total, notes, avSource, avUsed: av };
}

/**
 * Floating-rate band: 3M Compounded SORA min / median / max over the stated MAS window, plus the
 * assumed bank spread, and the instalment at each. `rate` (optional) is the current rate for comparison.
 * @param {{ loan:number|{amount:number}, years:number, rate?:number|null }} x
 * @returns {{ window:{from:string, to:string, observations:number}, spread:number, sora:{min:number, median:number, max:number, latest:number},
 *             low:{rate:number, monthly:number}, median:{rate:number, monthly:number}, high:{rate:number, monthly:number},
 *             current:{rate:number, monthly:number}|null, swing:number }}
 */
export function rateRisk({ loan, years, rate = null }, policy) {
  const amount = typeof loan === 'object' && loan ? loan.amount : loan;
  const band = policy.get('cost.sora3m.band'), spread = policy.get('cost.sora.spread');
  const at = (r) => ({ rate: r, monthly: amount > 0 && years > 0 ? pmt(amount, r, years) : 0 });
  const low = at(band.min + spread), median = at(band.median + spread), high = at(band.max + spread);
  return {
    window: { from: band.from, to: band.to, observations: band.observations }, spread,
    sora: { min: band.min, median: band.median, max: band.max, latest: band.latest },
    low, median, high, current: rate == null ? null : at(rate), swing: high.monthly - low.monthly,
  };
}
