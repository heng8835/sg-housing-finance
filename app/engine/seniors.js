// Seniors' right-sizing options (55+): stay, rent out a room, Lease Buyback Scheme, Silver Housing
// Bonus, Community Care Apartment, short-lease 2-room Flexi. Pure; every rule via `policy.get(id)`.
// HDB does not publish the LBS proceeds formula or a CPF LIFE payout formula, so those figures are
// returned as null with a note — never guessed. All amounts are estimates for education only.

const optNum = (v) => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);
const upper = (t) => String(t || '').toUpperCase().replace(/-/g, ' ').trim();
const money = (v) => `S$${Math.round(v).toLocaleString('en-SG')}`;
const startsAny = (t, list) => list.some((p) => upper(t).startsWith(p));

/** Flat-size groups the schemes use. 'CCA' / 'COMMUNITY CARE' count as 2-room or smaller. */
export const isTwoRoomOrSmaller = (t) => startsAny(t, ['1 ROOM', '2 ROOM', 'CCA', 'COMMUNITY CARE']);
export const isThreeRoomOrSmaller = (t) => isTwoRoomOrSmaller(t) || startsAny(t, ['3 ROOM']);
const lbsSizeKey = (t) => (isThreeRoomOrSmaller(t) ? 'up_to_3_room' : startsAny(t, ['4 ROOM']) ? '4_room' : '5_room_plus');

/** Lease Buyback: lease lengths the household may keep, by the youngest owner's age. */
export function lbsRetainOptions(youngestAge, remainingLease, policy) {
  const age = optNum(youngestAge);
  if (age == null) return [];
  const bands = policy.get('seniors.lbs.retain_min_by_age');
  let min = null;
  for (const [fromAge, years] of bands) if (age >= fromAge) min = years;
  if (min == null) return [];
  const max = policy.get('seniors.lbs.retain_max'), step = policy.get('seniors.lbs.retain_step');
  const remaining = optNum(remainingLease);
  const out = [];
  for (let y = min; y <= max; y += step) if (remaining == null || y < remaining) out.push(y);
  return out;
}

/**
 * Lease Buyback: RA top-up each owner must make (to the age-based requirement), from the T&C table.
 * @returns {{ perOwner:(number|null)[], total:number, raAssumedZero:boolean }}
 */
export function lbsTopUp(owners, policy, householdRa = null) {
  const bands = policy.get('seniors.lbs.topup_requirement').bands;
  const sole = owners.length === 1;
  const known = owners.filter((o) => optNum(o.raBalance) != null).length;
  const split = optNum(householdRa) != null && owners.length ? optNum(householdRa) / owners.length : null;
  const perOwner = owners.map((o) => {
    const age = optNum(o.age);
    let row = null;
    for (const b of bands) if (age != null && age >= b[0]) row = b;
    if (!row) return null;
    const ra = optNum(o.raBalance) ?? split ?? 0;
    return Math.max(0, (sole ? row[1] : row[2]) - ra);
  });
  return { perOwner, total: perOwner.reduce((t, v) => t + (v || 0), 0), raAssumedZero: known < owners.length && split == null };
}

/** Lease Buyback bonus: full amount at the threshold top-up, pro-rated below it. */
export function lbsBonus(flatType, totalTopUp, policy) {
  const max = policy.get('seniors.lbs.bonus_max')[lbsSizeKey(flatType)];
  const full = policy.get('seniors.lbs.bonus_full_topup');
  return { max, amount: max * Math.min(full, Math.max(0, optNum(totalTopUp) || 0)) / full };
}

/** Silver Housing Bonus: RA-linked part (pro-rated to the net RA increase) + 2-room extra, capped. */
export function shbBonus({ raTopUp, nextFlatType }, policy) {
  const full = policy.get('seniors.shb.full_topup');
  const base = policy.get('seniors.shb.bonus_max') * Math.min(full, Math.max(0, optNum(raTopUp) || 0)) / full;
  const extra = isTwoRoomOrSmaller(nextFlatType) ? policy.get('seniors.shb.two_room_extra') : 0;
  return { base, extra, amount: Math.min(policy.get('seniors.shb.total_max'), base + extra) };
}

/** Short-lease 2-room Flexi: shortest lease (in HDB's steps) that covers the youngest owner to the cover age. */
export function flexiLease(youngestAge, policy) {
  const age = optNum(youngestAge);
  if (age == null) return null;
  const { min, max, step } = policy.get('seniors.flexi.lease');
  const need = Math.max(min, Math.ceil((policy.get('seniors.flexi.cover_to_age') - age) / step) * step);
  return need <= max ? need : null;
}

/**
 * @param {{ owners:{age:number, citizenship?:'SC'|'PR'|'F', raBalance?:number}[], income?:number|null, flatType?:string,
 *           remainingLease?:number|null, marketValue?:number|null, raBalance?:number|null, nextFlatType?:string|null,
 *           nextFlatPrice?:number|null, outstandingLoan?:number|null, raTopUp?:number|null,
 *           currentIsPrivate?:boolean, annualValue?:number|null }} x
 * @param {{get:(id:string)=>any}} policy
 * @returns {{ option:'stay'|'rent-room'|'lbs'|'shb'|'cca'|'flexi', eligible:boolean, why:string[], cashNow:number|null,
 *             monthlyIncomeEstimate:number|null, notes:string[] }[]}
 */
export function seniorOptions(x = {}, policy) {
  const owners = (x.owners || []).filter(Boolean).map((o) => ({ age: optNum(o.age), citizenship: o.citizenship || 'SC', raBalance: optNum(o.raBalance) }));
  const ages = owners.map((o) => o.age).filter((a) => a != null);
  const youngest = ages.length ? Math.min(...ages) : null;
  const allAgesKnown = owners.length > 0 && ages.length === owners.length;
  const hasSC = owners.some((o) => o.citizenship === 'SC');
  const income = optNum(x.income), remaining = optNum(x.remainingLease);
  const allAtLeast = (age) => allAgesKnown && owners.every((o) => o.age >= age);
  const incomeCheck = (ceilingId, why) => {
    const ceiling = policy.get(ceilingId);
    if (income == null) return `Income not entered — assumed within the ${money(ceiling)} ceiling.`;
    if (income > ceiling) { why.push(`Household income is above the ${money(ceiling)} ceiling.`); return null; }
    return null;
  };
  const noOwners = owners.length ? null : 'Add the owners (age and citizenship) to check eligibility.';
  const opt = (option, why, extra) => ({ option, eligible: why.length === 0, why, cashNow: null, monthlyIncomeEstimate: null, notes: [], ...extra });

  // Stay put
  const stay = opt('stay', [], { cashNow: 0 });
  if (remaining != null && youngest != null) stay.notes.push(`The lease runs out when the youngest owner is about ${Math.floor(youngest + remaining)}.`);
  stay.notes.push('Monthly CPF LIFE payouts depend on your plan and balances — use the CPF LIFE estimator.');

  // Rent out a room
  const rent = opt('rent-room', [], { cashNow: 0 });
  rent.notes.push('Allowed after the Minimum Occupation Period, with HDB registration; owners must keep living in the flat.');
  rent.notes.push('Rent depends on the market — not estimated here.');

  // Lease Buyback Scheme
  const lbsWhy = [];
  const lbsMin = policy.get('seniors.lbs.min_age');
  if (noOwners) lbsWhy.push(noOwners);
  else if (!allAgesKnown) lbsWhy.push('Enter every owner\'s age.');
  else if (!allAtLeast(lbsMin)) lbsWhy.push(`All owners must be ${lbsMin} or older.`);
  if (owners.length && !hasSC) lbsWhy.push('At least one owner must be a Singapore Citizen.');
  const lbsAssumed = incomeCheck('seniors.lbs.income_ceiling', lbsWhy);
  const retainOptions = lbsRetainOptions(youngest, remaining, policy);
  if (!lbsWhy.length && !retainOptions.length) lbsWhy.push('Not enough lease left to sell after the minimum lease you must keep.');
  const topUp = lbsTopUp(owners, policy, x.raBalance);
  const bonus = lbsBonus(x.flatType, topUp.total, policy);
  const lbs = opt('lbs', lbsWhy, { retainOptions, topUpRequired: topUp.total, topUpPerOwner: topUp.perOwner, bonusMax: bonus.max, bonusAtRequiredTopUp: bonus.amount });
  if (lbsAssumed) lbs.notes.push(lbsAssumed);
  lbs.notes.push('Proceeds depend on HDB\'s valuation of the lease sold (formula not published) — cash now is not estimated.');
  lbs.notes.push(`Proceeds first top up each owner's RA (${money(topUp.total)} needed in total); any surplus is paid in cash, but above ${money(policy.get('seniors.lbs.cash_retention'))} the excess first tops owners up to the Full Retirement Sum.`);
  lbs.notes.push(`Bonus up to ${money(bonus.max)} for this flat type, pro-rated below ${money(policy.get('seniors.lbs.bonus_full_topup'))} of top-ups.`);
  if (topUp.raAssumedZero) lbs.notes.push('RA balance missing for some owners — assumed 0, so the top-up shown is the most it could be.');
  lbs.notes.push(`Owners below ${policy.get('seniors.lbs.cpf_life_below_age')} with at least ${money(policy.get('seniors.lbs.cpf_life_min_ra'))} in the RA join CPF LIFE; payouts not estimated.`);

  // Silver Housing Bonus
  const shbWhy = [];
  const shbMin = policy.get('seniors.shb.min_age');
  if (noOwners) shbWhy.push(noOwners);
  else if (!owners.some((o) => o.citizenship === 'SC' && o.age != null && o.age >= shbMin)) shbWhy.push(`At least one owner must be a Singapore Citizen aged ${shbMin} or older.`);
  const shbAssumed = incomeCheck('seniors.shb.income_ceiling', shbWhy);
  const avMax = policy.get('seniors.shb.private_av_max');
  if (x.currentIsPrivate && optNum(x.annualValue) != null && optNum(x.annualValue) > avMax) shbWhy.push(`The private property's Annual Value is above ${money(avMax)}.`);
  if (x.nextFlatType && !isThreeRoomOrSmaller(x.nextFlatType)) shbWhy.push('The next flat must be 3-room or smaller.');
  let raTopUp = optNum(x.raTopUp), topUpNote = null;
  if (raTopUp == null && optNum(x.marketValue) != null && optNum(x.nextFlatPrice) != null) {
    raTopUp = Math.min(policy.get('seniors.shb.full_topup'), Math.max(0, optNum(x.marketValue) - optNum(x.nextFlatPrice) - (optNum(x.outstandingLoan) || 0)));
    topUpNote = 'RA top-up estimated from the price difference (fees and CPF refunds not counted).';
  } else if (raTopUp == null) {
    raTopUp = policy.get('seniors.shb.full_topup');
    topUpNote = `Assumes the full ${money(raTopUp)} net RA increase is committed.`;
  }
  const shbAmt = shbBonus({ raTopUp, nextFlatType: x.nextFlatType }, policy);
  const shb = opt('shb', shbWhy, { cashNow: shbWhy.length ? 0 : shbAmt.amount, raTopUp, bonus: shbAmt });
  if (shbAssumed) shb.notes.push(shbAssumed);
  if (topUpNote) shb.notes.push(topUpNote);
  if (!x.nextFlatType) shb.notes.push('Assumes the next flat is 3-room (not terrace) or smaller.');
  if (x.currentIsPrivate && optNum(x.annualValue) == null) shb.notes.push(`Private property: its Annual Value must not exceed ${money(avMax)}.`);
  shb.notes.push(`Buy before selling or within ${policy.get('seniors.shb.purchase_window_months')} months of completing the sale; you must join CPF LIFE. CPF housing refunds count towards the RA increase.`);
  shb.notes.push('Cash now is the bonus only — see the sell-then-buy planner for the sale proceeds you keep.');

  // Community Care Apartment
  const ccaWhy = [];
  const ccaMin = policy.get('seniors.cca.min_age');
  if (noOwners) ccaWhy.push(noOwners);
  else if (!allAtLeast(ccaMin)) ccaWhy.push(`All applicants (and spouse) must be ${ccaMin} or older.`);
  if (owners.length && !hasSC) ccaWhy.push('At least one applicant must be a Singapore Citizen (HDB new-flat rule).');
  const cca = opt('cca', ccaWhy, {});
  cca.notes.push('Sold in BTO exercises; price, lease options and the compulsory Basic Service Package fee are not modelled.');
  cca.notes.push(`Counts as 2-room or smaller for the Silver Housing Bonus extra ${money(policy.get('seniors.shb.two_room_extra'))}.`);

  // Short-lease 2-room Flexi
  const flexiWhy = [];
  const flexiMin = policy.get('seniors.flexi.min_age');
  if (noOwners) flexiWhy.push(noOwners);
  else if (!allAtLeast(flexiMin)) flexiWhy.push(`All buyers and spouses must be ${flexiMin} or older.`);
  if (owners.length && !hasSC) flexiWhy.push('At least one buyer must be a Singapore Citizen (HDB new-flat rule).');
  const flexiAssumed = incomeCheck('seniors.flexi.income_ceiling', flexiWhy);
  const leaseYears = flexiLease(youngest, policy);
  if (!flexiWhy.length && leaseYears == null) flexiWhy.push('No lease option covers the youngest owner to the required age.');
  const flexi = opt('flexi', flexiWhy, { leaseYears });
  if (flexiAssumed) flexi.notes.push(flexiAssumed);
  if (leaseYears != null) flexi.notes.push(`Shortest lease that covers the youngest owner to ${policy.get('seniors.flexi.cover_to_age')}: ${leaseYears} years (longer options allowed).`);
  flexi.notes.push('Price depends on the project and lease chosen — not estimated.');

  return [stay, rent, lbs, shb, cca, flexi];
}
