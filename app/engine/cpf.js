// CPF contributions, allocation, interest, RA formation and a residency-aware projection to
// retirement (Phase 4). Pure: no DOM, no clock. `policy` is a resolved policy object, or — for
// multi-year projections — a function `(year) => policy` so effective-dated tables (e.g. the
// 1 Jan 2027 senior rates) apply in the year they take effect.
// Conventions / simplifications (surface as notes in the UI):
// - age = completed years, birthday on 1 Jan (CPF switches bands the month after the birthday).
// - interest computed monthly on the balance after the month's withdrawals and before its
//   contributions (contributions earn from next month), credited yearly (cpf.interest.method).
// - bonus (AW) paid in December; a PR's year of status advances every simulation year.
// - CPF LIFE premium deduction, payouts, the $5,000 set-aside and voluntary top-ups are not modelled.

const MONTHS = 12;
const ACCTS = ['oa', 'sa', 'ma', 'ra'];
const r2 = (x) => Math.round(x * 100) / 100;
const round100 = (x) => Math.round(x / 100) * 100;
const zero = () => ({ oa: 0, sa: 0, ma: 0, ra: 0 });
const resolve = (policy) => (typeof policy === 'function' ? policy : () => policy);
const band = (rows, age) => rows.find((r) => r.age_below == null || age < r.age_below);

/**
 * Contribution-table key for a residency, or null when CPF does not apply (foreigners).
 * @param {'SC'|'PR'|'PR1'|'PR2'|'PR3+'|'F'} residency
 * @param {'GG'|'FG'|'FF'} [prScheme] graduated/graduated, full employer/graduated, full/full
 */
export function schemeKey(residency, prScheme = 'GG') {
  if (residency === 'SC' || residency === 'PR3+' || residency === 'PR') return 'full';
  if (residency !== 'PR1' && residency !== 'PR2') return null;
  if (prScheme === 'FF') return 'full';
  return `${residency}_${prScheme === 'FG' ? 'FG' : 'GG'}`;
}

/** A PR's residency in the following year (1st → 2nd → 3rd year onwards). */
export const nextResidency = (r) => (r === 'PR1' ? 'PR2' : r === 'PR2' ? 'PR3+' : r);

/**
 * Split a total contribution into accounts: MA first, then SA (below 55) / RA (55+), OA the rest.
 * Caps (BHS, FRS) depend on balances and are applied by `simulate`.
 * @returns {{oa:number, sa:number, ma:number, ra:number}}
 */
export function allocate(total, age, policy) {
  const row = band(policy.get('cpf.alloc.ratios'), age);
  const ma = r2(total * row.ma), sr = r2(total * row.sa_ra);
  const senior = age >= policy.get('cpf.age.ra_formation');
  return { oa: r2(total - ma - sr), sa: senior ? 0 : sr, ma, ra: senior ? sr : 0 };
}

/**
 * Monthly CPF contribution (CPF rate tables, wage bands and rounding: total to the nearest
 * dollar, employee share rounded down, employer = total − employee).
 * @param {{ age:number, monthlyWage:number, additionalWage?:number, residency:string, prScheme?:string }} x
 *   additionalWage = AW paid this month, already within the yearly AW ceiling.
 * @returns {{ applicable:boolean, employee:number, employer:number, total:number,
 *   alloc:{oa:number, sa:number, ma:number, ra:number}, scheme:string|null }}
 */
export function contribution({ age, monthlyWage, additionalWage = 0, residency, prScheme = 'GG' }, policy) {
  const key = schemeKey(residency, prScheme);
  if (!key) return { applicable: false, employee: 0, employer: 0, total: 0, alloc: zero(), scheme: null };
  const row = band(policy.get('cpf.contrib.rates')[key], age);
  const b = policy.get('cpf.contrib.wage_bands');
  const ow = Math.min(Math.max(0, monthlyWage || 0), policy.get('cpf.contrib.ow_ceiling'));
  const aw = Math.max(0, additionalWage || 0);
  const tw = Math.max(0, monthlyWage || 0) + aw;
  let total = 0, employee = 0;
  if (tw <= b.nil_max) { /* nil */ } else if (tw <= b.employer_only_max) total = row.employer_only * tw;
  else if (tw <= b.phase_in_max) {
    employee = row.phase_in * (tw - b.employer_only_max);
    total = row.employer_only * tw + employee;
  } else { total = row.total * (ow + aw); employee = row.employee * (ow + aw); }
  total = Math.round(r2(total));
  employee = Math.min(total, Math.floor(r2(employee)));
  return { applicable: true, employee, employer: total - employee, total, alloc: allocate(total, age, policy), scheme: key };
}

/**
 * BRS / FRS / ERS for members turning 55 in `cohortYear`. Published years come from the table;
 * others are projected from the nearest published cohort at `cpf.retirement_sums.growth`.
 * @returns {{ year:number, brs:number, frs:number, ers:number, projected:boolean }}
 */
export function retirementSums(cohortYear, policy) {
  const table = policy.get('cpf.retirement_sums');
  const ers = policy.get('cpf.retirement_sums.ers_multiple');
  const hit = table[String(cohortYear)];
  if (hit) return { year: cohortYear, brs: hit.brs, frs: hit.frs, ers: hit.frs * ers, projected: false };
  const years = Object.keys(table).map(Number).sort((a, b) => a - b);
  const ref = cohortYear > years[years.length - 1] ? years[years.length - 1] : years[0];
  const brs = round100(table[String(ref)].brs * Math.pow(1 + policy.get('cpf.retirement_sums.growth'), cohortYear - ref));
  return { year: cohortYear, brs, frs: brs * 2, ers: brs * 2 * ers, projected: true };
}

/** Basic Healthcare Sum for a calendar year (members below 65), projected past the table. */
export function bhsForYear(year, policy) {
  const table = policy.get('cpf.bhs');
  if (table[String(year)] != null) return table[String(year)];
  const years = Object.keys(table).map(Number).sort((a, b) => a - b);
  const ref = year > years[years.length - 1] ? years[years.length - 1] : years[0];
  return round100(table[String(ref)] * Math.pow(1 + policy.get('cpf.bhs.growth'), year - ref));
}

/** The member's applicable BHS: the current one below 65, fixed at the age-65 year afterwards. */
export function bhsFor(year, age, policy) {
  const fixed = policy.get('cpf.bhs.fixed_age');
  return bhsForYear(age >= fixed ? year - (age - fixed) : year, policy);
}

// Extra interest on combined balances, tiered by cumulative balance; returns annual amount.
const tierAmount = (tiers, from, to) => {
  let lo = 0, sum = 0;
  for (const [upTo, rate] of tiers) { sum += Math.max(0, Math.min(to, upTo) - Math.max(from, lo)) * rate; lo = upTo; }
  return sum;
};

/**
 * One month's interest (not yet credited) on balances `b` for a member of `age`.
 * Extra interest on OA goes to SA (below 55) or RA (55+).
 * @returns {{oa:number, sa:number, ma:number, ra:number, extra:number}}
 */
export function monthlyInterest(b, age, policy) {
  const oaRate = policy.get('cpf.interest.oa'), sm = policy.get('cpf.interest.smra');
  const x = policy.get('cpf.interest.extra');
  const senior = age >= policy.get('cpf.age.ra_formation');
  const tiers = senior ? x.from_55 : x.below_55;
  const out = { oa: b.oa * oaRate / MONTHS, sa: b.sa * sm / MONTHS, ma: b.ma * sm / MONTHS, ra: b.ra * sm / MONTHS, extra: 0 };
  let used = 0;
  for (const acct of x.order) {
    const amt = Math.max(0, acct === 'oa' ? Math.min(b.oa, x.oa_cap) : b[acct]);
    const extra = tierAmount(tiers, used, used + amt) / MONTHS;
    used += amt;
    out.extra += extra;
    out[acct === 'oa' ? (senior ? 'ra' : 'sa') : acct] += extra;
  }
  return out;
}

/**
 * Accrued interest on OA money used for housing: what it would have earned at the accrued rate,
 * computed monthly (from the month of withdrawal) and compounded yearly from month 0.
 * @param {{month:number, amount:number}[]} withdrawals month index from 0
 * @param {number} months horizon (e.g. months until sale)
 * @returns {{ principal:number, accrued:number, refund:number }}
 */
export function accruedInterest(withdrawals, months, policy) {
  const rate = policy.get('cpf.housing.accrued_rate') / MONTHS;
  let value = 0, principal = 0, pending = 0;
  for (let m = 0; m < months; m++) {
    for (const w of withdrawals) if (w.month === m) { value += w.amount; principal += w.amount; }
    pending += value * rate;
    if ((m + 1) % MONTHS === 0) { value += pending; pending = 0; }
  }
  value += pending;
  return { principal: r2(principal), accrued: r2(value - principal), refund: r2(value) };
}

/** Grow an RA alone (no contributions) for `years` at 55+ interest — used for CPF LIFE anchors. */
export function projectRa(ra, years, policy) {
  const age = policy.get('cpf.age.ra_formation');
  const b = { oa: 0, sa: 0, ma: 0, ra };
  for (let y = 0; y < years; y++) {
    let acc = 0;
    for (let m = 0; m < MONTHS; m++) acc += monthlyInterest(b, age, policy).ra;
    b.ra += acc;
  }
  return b.ra;
}

/**
 * Estimated CPF LIFE (Standard) monthly payout for an RA balance at the payout age. CPF's
 * published payouts for BRS/FRS/ERS at 55 are projected to the payout age to get payout-per-dollar
 * factors; the estimate interpolates between them and the range brackets it with the two
 * neighbouring factors. An estimate, not a CPF quote.
 * @returns {{ monthly:number, monthlyLow:number, monthlyHigh:number }}
 */
export function lifePayout(raAtPayoutAge, policy) {
  const a = policy.get('cpf.life.payout_anchors');
  const years = a.start_age - policy.get('cpf.age.ra_formation');
  const pts = a.points.map((p) => { const ra = projectRa(p.ra_at_55, years, policy); return { ra, f: p.monthly / ra }; });
  const ra = Math.max(0, raAtPayoutAge);
  const out = (lo, hi, mid) => ({ monthly: Math.round(mid), monthlyLow: Math.round(Math.min(lo, hi)), monthlyHigh: Math.round(Math.max(lo, hi)) });
  if (ra <= pts[0].ra) return out(ra * pts[0].f, ra * pts[0].f, ra * pts[0].f);
  for (let i = 1; i < pts.length; i++) {
    if (ra <= pts[i].ra) {
      const t = (ra - pts[i - 1].ra) / (pts[i].ra - pts[i - 1].ra);
      const mid = pts[i - 1].ra * pts[i - 1].f + t * (pts[i].ra * pts[i].f - pts[i - 1].ra * pts[i - 1].f);
      return out(ra * pts[i].f, ra * pts[i - 1].f, mid);
    }
  }
  const last = pts[pts.length - 1];
  return out(ra * last.f, ra * last.f, ra * last.f);
}

/** Annual SRS contribution cap for a residency (foreigners get the higher cap). */
export function srsCap(residency, policy) {
  const caps = policy.get('cpf.srs.cap');
  return residency === 'SC' ? caps.SC : schemeKey(residency) ? caps.PR : caps.F;
}

// Form the RA at 55: SA first, then OA, up to the cohort FRS; SA closed (remainder to OA).
function formRa(bal, cohortYear, policy, pledge) {
  const s = retirementSums(cohortYear, policy);
  const fromSa = Math.min(bal.sa, Math.max(0, s.frs - bal.ra));
  bal.ra += fromSa; bal.sa -= fromSa;
  const fromOa = Math.min(bal.oa, Math.max(0, s.frs - bal.ra));
  bal.ra += fromOa; bal.oa -= fromOa;
  bal.oa += bal.sa; bal.sa = 0;
  const ra = r2(bal.ra);
  return {
    cohortYear, raFormed: ra, fromSa: r2(fromSa), fromOa: r2(fromOa), brs: s.brs, frs: s.frs, ers: s.ers,
    metBRS: ra >= s.brs, metFRS: ra >= s.frs, metERS: ra >= s.ers,
    metFRSWithPledge: pledge ? ra >= s.brs : ra >= s.frs, projectedSums: s.projected,
  };
}

// Put `amount` into SA/RA up to `cap`, the rest into OA.
function spill(bal, key, cap, amount) {
  const put = Math.min(amount, Math.max(0, cap - bal[key]));
  bal[key] += put; bal.oa += amount - put;
}

/**
 * Year-by-year CPF projection. Foreigners → `{ applicable:false, srsAnnualCap }`.
 * @param {{ startAge:number, endAge:number, startYear:number,
 *   balances?:{oa?:number, sa?:number, ma?:number, ra?:number},
 *   wage?:{ monthly:number, growth?:number, bonusMonths?:number, untilAge?:number },
 *   residency?:'SC'|'PR'|'PR1'|'PR2'|'PR3+'|'F', prScheme?:'GG'|'FG'|'FF',
 *   housing?:{ oaUpfront?:number, monthlyFromOa?:number, untilAge?:number, pledge?:boolean } }} input
 *   rows run from startAge to endAge inclusive (balances at year end); wage stops at untilAge.
 * @param {object|function(number):object} policy
 * @returns {{ applicable:boolean, rows:{ age:number, year:number, residency:string, oa:number,
 *   sa:number, ma:number, ra:number, total:number, interest:number, contributions:number,
 *   employee:number, housingUsed:number, housingPrincipal:number, accruedInterest:number,
 *   cashShortfall:number }[], at55:object|null, life:object|null, srsAnnualCap:number }}
 */
export function simulate(input, policy) {
  const pol = resolve(policy);
  const { startAge, endAge, startYear, balances = {}, wage = {}, residency = 'SC', prScheme = 'GG', housing = {} } = input;
  const P0 = pol(startYear);
  const srsAnnualCap = srsCap(residency, P0);
  if (!schemeKey(residency, prScheme)) {
    return { applicable: false, reason: 'Foreigners do not contribute to CPF; SRS is the tax-advantaged retirement track.', rows: [], at55: null, life: null, srsAnnualCap };
  }
  const A55 = P0.get('cpf.age.ra_formation'), A65 = P0.get('cpf.age.life_payout');
  const bal = Object.fromEntries(ACCTS.map((k) => [k, Math.max(0, +balances[k] || 0)]));
  const monthly = Math.max(0, +wage.monthly || 0), growth = +wage.growth || 0, bonusMonths = +wage.bonusMonths || 0;
  const wageUntil = wage.untilAge ?? endAge + 1;
  const houseUntil = housing.untilAge ?? endAge + 1;
  let res = residency, formed = startAge > A55 && !(bal.sa > 0), at55 = null, raAtPayout = null;
  let cohortFrs = startAge > A55 ? retirementSums(startYear - (startAge - A55), P0).frs : null;
  const ledger = { principal: 0, value: 0, pending: 0 };
  const rows = [];
  for (let age = startAge, year = startYear; age <= endAge; age++, year++) {
    const P = pol(year);
    if (age >= A55 && !formed) {
      at55 = formRa(bal, year - (age - A55), P, !!housing.pledge);
      cohortFrs = at55.frs; formed = true;
    }
    if (age === A65) raAtPayout = bal.ra;
    const senior = age >= A55;
    const wageM = age < wageUntil ? monthly * Math.pow(1 + growth, year - startYear) : 0;
    const owYear = Math.min(wageM, P.get('cpf.contrib.ow_ceiling')) * MONTHS;
    const aw = Math.min(bonusMonths * wageM, Math.max(0, P.get('cpf.contrib.annual_ceiling') - owYear));
    const bhs = bhsFor(year, age, P);
    const cap = senior ? cohortFrs : retirementSums(year, P).frs;
    const acc = zero();
    let contributions = 0, employee = 0, used = 0, shortfall = 0;
    for (let m = 0; m < MONTHS; m++) {
      let want = age < houseUntil ? +housing.monthlyFromOa || 0 : 0;
      if (age === startAge && m === 0) want += +housing.oaUpfront || 0;
      const take = Math.min(want, bal.oa);
      bal.oa -= take; used += take; shortfall += want - take;
      ledger.principal += take; ledger.value += take;
      ledger.pending += ledger.value * P.get('cpf.housing.accrued_rate') / MONTHS;
      const i = monthlyInterest(bal, age, P);
      for (const k of ACCTS) acc[k] += i[k];
      if (wageM > 0) {
        const c = contribution({ age, monthlyWage: wageM, additionalWage: m === MONTHS - 1 ? aw : 0, residency: res, prScheme }, P);
        contributions += c.total; employee += c.employee;
        const toMa = Math.min(c.alloc.ma, Math.max(0, bhs - bal.ma));
        bal.ma += toMa; bal.oa += c.alloc.oa;
        spill(bal, senior ? 'ra' : 'sa', cap, c.alloc.sa + c.alloc.ra + c.alloc.ma - toMa);
      }
    }
    let interest = 0;
    for (const k of ACCTS) { bal[k] += acc[k]; interest += acc[k]; }
    if (bal.ma > bhs) { const over = bal.ma - bhs; bal.ma = bhs; spill(bal, senior ? 'ra' : 'sa', cap, over); }
    ledger.value += ledger.pending; ledger.pending = 0;
    rows.push({
      age, year, residency: res, oa: r2(bal.oa), sa: r2(bal.sa), ma: r2(bal.ma), ra: r2(bal.ra),
      total: r2(bal.oa + bal.sa + bal.ma + bal.ra), interest: r2(interest), contributions, employee,
      housingUsed: r2(used), housingPrincipal: r2(ledger.principal), accruedInterest: r2(ledger.value - ledger.principal),
      cashShortfall: r2(shortfall),
    });
    res = nextResidency(res);
  }
  if (raAtPayout == null && rows.length) {
    const last = rows[rows.length - 1];
    raAtPayout = last.age < A65 ? projectRa(last.ra, A65 - last.age - 1, pol(last.year)) : (startAge > A65 ? +balances.ra || 0 : null);
  }
  const life = raAtPayout == null ? null : { atAge: A65, raAtPayoutAge: r2(raAtPayout), ...lifePayout(raAtPayout, pol(startYear + (A65 - startAge))), estimate: true };
  return { applicable: true, rows, at55, life, srsAnnualCap };
}
