// Landlord & tenant toolkit: HDB rent-out checks, tenant eligibility, lease stamp duty, yield.
// Pure; policy passed in. Rule logic lives here and cites the rule id; every value comes from
// policy (rental.*). Each answer carries the weakest `status` of the entries it relied on.

const ORDER = ['VERIFIED', 'CORROBORATED', 'ASSUMPTION', 'UNVERIFIED']; // strongest → weakest
const rank = (s) => (ORDER.includes(s) ? ORDER.indexOf(s) : ORDER.length - 1); // unknown counts as UNVERIFIED

/** Weakest of the given statuses (UNVERIFIED < ASSUMPTION < CORROBORATED < VERIFIED). */
export const weakest = (...statuses) => statuses.flat().filter(Boolean)
  .reduce((w, s) => (rank(s) > rank(w) ? s : w), 'VERIFIED');

/** Weakest status of policy entries `ids`; literal status names pass through unchanged. */
export const statusOf = (policy, ...ids) => weakest(ids.flat().filter(Boolean).map((id) => (ORDER.includes(id) ? id : policy.meta(id).status)));

/**
 * HDB flat type → rooms key used by the rental tables: '1' | '2' | '3' | '4+' (null if unknown).
 * Accepts HDB data labels ('4 ROOM', 'EXECUTIVE', 'MULTI-GENERATION') and '3-room' style input.
 */
export function roomsKey(flatType) {
  const t = String(flatType ?? '').toUpperCase();
  if (['EXEC', 'MULTI', 'JUMBO', 'GEN'].some((k) => t.includes(k))) return '4+';
  const m = t.match(/^\s*(\d+)/);
  if (!m) return null;
  return ['1', '2', '3'].includes(m[1]) ? m[1] : '4+';
}

const byRooms = (table, key) => (key == null ? undefined : (key in table ? table[key] : table['4+']));
/** 0.11 → '11%' (rounded to avoid float noise). */
export const pct = (v) => `${Math.round(v * 100 * 100) / 100}%`;
const isMalaysian = (p) => p.nationality === 'MY';
const isCitizen = (p) => (p.citizenship || 'SC') === 'SC';
/** Non-Malaysian non-citizen (SPR or foreigner) — triggers the NC quota and the 2-year cap. */
const nonMyNonCitizen = (p) => !isCitizen(p) && !isMalaysian(p);

/** Lease end (exclusive) as 'YYYY-MM-DD' from an ISO start date and a month count. No Date objects. */
export function leaseEnd(startDate, months) {
  const m = String(startDate ?? '').match(/^(\d+)-(\d+)-(\d+)/);
  if (!m || !Number.isFinite(+months)) return null;
  const [, year, month, day] = m;
  const total = +year * 12 + (+month - 1) + Math.round(+months);
  const pad = (v) => String(v).padStart(2, '0');
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}-${day}`;
}

/**
 * Can this person rent an HDB flat ('whole') or a bedroom ('room')?
 * @param {{citizenship?:string, nationality?:string|null, pass?:string|null, wpSector?:string|null, passMonthsLeft?:number|null}} t
 * @returns {{ ok: true|false|'conditional', why: string[], ids: string[] }}
 */
export function tenantCheck(t, mode, policy) {
  // rental.tenant — SC / SPR, or an eligible pass valid long enough
  const rule = policy.get('rental.tenant'), ids = ['rental.tenant'];
  const c = t.citizenship || 'SC';
  if (rule.citizenships.includes(c)) return { ok: true, why: [], ids };
  const passes = 'EP, S Pass, Work Permit, Student Pass, Dependant Pass or LTVP';
  if (!t.pass) return { ok: 'conditional', why: [`A non-resident needs an eligible pass (${passes}) valid for at least ${rule.pass_min_validity_months} months.`], ids };
  if (!rule.passes.includes(t.pass)) return { ok: false, why: [`HDB flats can be rented only by SC, SPR or holders of an ${passes}.`], ids };
  if (t.passMonthsLeft != null && +t.passMonthsLeft < rule.pass_min_validity_months) {
    return { ok: false, why: [`The pass must be valid for at least ${rule.pass_min_validity_months} months when the owner applies.`], ids };
  }
  const why = [`The pass must be valid for at least ${rule.pass_min_validity_months} months when the owner applies.`];
  if (t.pass !== 'WP' || isMalaysian(t)) return { ok: true, why, ids };
  // rental.wp.sectors — Work Permit holders: services any; manufacturing rooms only; CMP Malaysians only
  ids.push('rental.wp.sectors');
  const sector = policy.get('rental.wp.sectors')[t.wpSector];
  if (!sector) return { ok: 'conditional', why: [...why, 'Work Permit rules depend on the sector (services, manufacturing, or construction / marine / process).'], ids };
  if (sector[mode] === 'MY') {
    if (t.nationality == null) return { ok: 'conditional', why: [...why, `Only Malaysian ${t.wpSector} Work Permit holders may rent ${mode === 'whole' ? 'a whole flat' : 'here'} — add the nationality.`], ids };
    return { ok: false, why: [`Non-Malaysian Work Permit holders in ${t.wpSector === 'cmp' ? 'construction / marine / process' : t.wpSector} cannot rent ${mode === 'whole' ? 'a whole HDB flat' : 'HDB flats or bedrooms'}.`], ids };
  }
  return { ok: true, why, ids };
}

/**
 * Check a planned HDB rental (or a private one with propertyType 'private').
 * @param {{ ownerCitizenship?:'SC'|'PR', flatClass?:'standard'|'unclassified'|'plus'|'prime', mopMet?:boolean|null,
 *   flatType?:string, mode?:'whole'|'room', roomsLet?:number, occupants?:number, tenants?:object[], months?:number,
 *   startDate?:string, propertyType?:'hdb'|'private', sqm?:number }} x
 * @returns {{ ok:boolean, issues:{rule:string, msg:string, status:string, level:'block'|'check'}[], ncQuotaApplies:boolean,
 *   maxOccupants:number|null, minPeriodMonths:number, maxPeriodMonths:number|null, status:string, linkOut:{label:string,url:string}[] }}
 */
export function rentOutCheck(x, policy) {
  const issues = [], used = new Set(), linkOut = [];
  const add = (rule, msg, level = 'block', extra = []) => {
    issues.push({ rule, msg, level, status: statusOf(policy, rule, extra) });
    used.add(rule); extra.forEach((r) => used.add(r));
  };
  const tenants = (x.tenants || []).filter((t) => t && typeof t === 'object');
  const occupants = x.occupants != null ? +x.occupants : tenants.length || null;
  const finish = (r) => ({ ...r, ok: !issues.some((i) => i.level === 'block'), issues, linkOut, status: statusOf(policy, [...used]) });

  if (x.propertyType === 'private') {
    // rental.private.min_months — URA minimum stay
    const min = policy.get('rental.private.min_months'); used.add('rental.private.min_months');
    if (x.months != null && +x.months < min) add('rental.private.min_months', `Private homes must be let for at least ${min} consecutive months.`);
    // rental.occupancy.private — unrelated persons; relaxed cap for large units until the end date
    const cap = policy.get('rental.occupancy.private'); used.add('rental.occupancy.private');
    const end = leaseEnd(x.startDate, x.months);
    const relaxedOk = x.sqm != null && +x.sqm >= cap.relaxed_min_sqm && (end == null || end <= cap.relaxed_ends_before);
    const maxOccupants = relaxedOk ? cap.relaxed : cap.base;
    if (relaxedOk) add('rental.occupancy.private', `The higher cap of ${cap.relaxed} needs registration with URA and ends before ${cap.relaxed_ends_before}.`, 'check');
    if (occupants != null && occupants > maxOccupants) add('rental.occupancy.private', `At most ${maxOccupants} unrelated persons may live in this home.`);
    return finish({ ncQuotaApplies: false, maxOccupants, minPeriodMonths: min, maxPeriodMonths: null });
  }

  const mode = x.mode === 'room' ? 'room' : 'whole';
  const key = roomsKey(x.flatType);
  if (key == null) add('rental.occupancy.hdb', 'Choose the flat type to check bedroom and occupancy limits.', 'check');

  if (mode === 'whole') {
    // rental.whole.owner — SC owners only, after MOP, Standard / unclassified flats only
    const w = policy.get('rental.whole.owner');
    if ((x.ownerCitizenship || 'SC') !== w.citizenship) add('rental.whole.owner', 'SPR owners can never rent out the whole flat — bedrooms only.');
    if (x.flatClass && !w.flat_classes.includes(x.flatClass)) add('rental.whole.owner', 'Plus and Prime flats can never be rented out whole — bedrooms only.');
    if (x.mopMet === false) add('rental.whole.owner', 'The whole flat can be rented out only after the Minimum Occupation Period.');
    else if (x.mopMet == null) add('rental.whole.owner', 'Confirm the Minimum Occupation Period has been met.', 'check');
    used.add('rental.whole.owner');
  } else {
    // rental.room.owner — any owner of a 3-room or bigger flat, MOP not required
    const r = policy.get('rental.room.owner'); used.add('rental.room.owner');
    if (key != null && !byRooms(r, key)) add('rental.room.owner', 'Bedrooms cannot be rented out in 1- and 2-room flats.');
  }

  // tenants: eligibility, Work Permit sector and bedroom limits
  tenants.forEach((t, i) => {
    const c = tenantCheck(t, mode, policy);
    if (c.ok === false) add(c.ids[c.ids.length - 1], `Tenant ${i + 1}: ${c.why[0]}`, 'block', c.ids);
    else if (c.ok === 'conditional') add(c.ids[c.ids.length - 1], `Tenant ${i + 1}: ${c.why[c.why.length - 1]}`, 'check', c.ids);
    else c.ids.forEach((r) => used.add(r));
  });
  if (mode === 'room' && key != null && tenants.some((t) => t.pass === 'WP')) {
    // rental.wp.max_bedrooms — bedrooms rentable to Work Permit holders by flat size
    const maxRooms = byRooms(policy.get('rental.wp.max_bedrooms'), key);
    if (x.roomsLet != null && +x.roomsLet > maxRooms) add('rental.wp.max_bedrooms', `At most ${maxRooms} bedroom(s) in this flat may be rented to Work Permit holders.`);
    else used.add('rental.wp.max_bedrooms');
  }

  // rental.nc_quota — whole flat with any non-Malaysian SPR / foreign tenant
  const nc = policy.get('rental.nc_quota'); used.add('rental.nc_quota');
  const ncQuotaApplies = mode === nc.applies_to && tenants.some(nonMyNonCitizen);
  if (ncQuotaApplies) {
    add('rental.nc_quota', `The block / neighbourhood must be under the Non-Citizen quota (${pct(nc.block)} block, ${pct(nc.neighbourhood)} neighbourhood) — check before signing.`, 'check');
    linkOut.push({ label: 'HDB Non-Citizen quota check', url: policy.get('rental.link.nc_quota') });
    used.add('rental.link.nc_quota');
  }

  // rental.period — min 6 months; max 3 years (SC / Malaysian tenants) else 2 years
  const p = policy.get('rental.period'); used.add('rental.period');
  const maxPeriodMonths = tenants.some(nonMyNonCitizen) ? p.max_months_other : p.max_months_sc_my;
  if (x.months != null && +x.months < p.min_months) add('rental.period', `HDB rentals must be at least ${p.min_months} months.`);
  if (x.months != null && +x.months > maxPeriodMonths) add('rental.period', `Each approval covers at most ${maxPeriodMonths} months for these tenants — renew afterwards.`);

  // rental.occupancy.hdb — counts owners and occupiers too; relaxed 4-room+ cap ends before a date
  const cap = policy.get('rental.occupancy.hdb'); used.add('rental.occupancy.hdb');
  let maxOccupants = null;
  if (key != null) {
    const k = key in cap.base ? key : '4+';
    const end = leaseEnd(x.startDate, x.months);
    const relaxed = cap.relaxed[k];
    maxOccupants = relaxed != null && (end == null || end <= cap.relaxed_ends_before) ? relaxed : cap.base[k];
    if (relaxed != null && end == null) add('rental.occupancy.hdb', `The cap of ${relaxed} is temporary: rental periods running past ${cap.relaxed_ends_before} fall back to ${cap.base[k]}.`, 'check');
    if (occupants != null && occupants > maxOccupants) add('rental.occupancy.hdb', `At most ${maxOccupants} people (owners and occupiers included) may live in this flat.`);
  }
  return finish({ ncQuotaApplies, maxOccupants, minPeriodMonths: p.min_months, maxPeriodMonths });
}

/**
 * Stamp duty on a lease / tenancy (IRAS, rental.stamp_duty.lease). Uses the contract rent;
 * IRAS charges on the higher of contract and market rent.
 * @returns {{ duty:number, base:number, aar:number, exempt:boolean, status:string }}
 */
export function tenancyStampDuty({ monthlyRent, months }, policy) {
  const r = policy.get('rental.stamp_duty.lease'), status = statusOf(policy, 'rental.stamp_duty.lease');
  const rent = +monthlyRent || 0, n = +months || 0;
  if (rent <= 0 || n <= 0) return { duty: 0, base: 0, aar: 0, exempt: true, status };
  const total = rent * n, aar = total / (n / 12);
  if (aar <= r.exempt_aar_max) return { duty: 0, base: total, aar, exempt: true, status };
  // leases up to the short-lease limit: rate on total rent; longer: rate on AAR x multiple
  const base = n <= r.short_lease_max_months ? total : aar * r.long_lease_aar_multiple;
  const duty = Math.max(r.min_duty, Math.floor(Math.round(base * r.rate * 100) / 100));
  return { duty, base, aar, exempt: false, status };
}

/**
 * Gross and net rental yield as fractions of the price (null when price is missing).
 * @returns {{ gross:number|null, net:number|null }}
 */
export function rentalYield({ price, monthlyRent, annualCosts = 0 }) {
  const p = +price, annual = (+monthlyRent || 0) * 12;
  if (!(p > 0)) return { gross: null, net: null };
  return { gross: annual / p, net: (annual - (+annualCosts || 0)) / p };
}
