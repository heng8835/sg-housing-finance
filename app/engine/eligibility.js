// "What can I do?" — residency-aware buy / rent pathways (elig.*, rental.*). Pure; policy passed in.
// Rule logic lives here and cites the rule id; values come from policy. Every answer carries the
// weakest `status` of the entries it relied on (or UNVERIFIED where no rule was checked), so the
// UI can badge unverified answers. Educational only — HDB's HFE letter is the real answer.
// Not modelled: widowed / orphaned singles from 21, divorcees, second-timer and resale-levy rules,
// 3Gen / Plus / Prime specifics, extended-family ceilings, the NCS 2-room Flexi income ceiling.
import { summarise } from './household.js';
import { absdRate } from './grants.js';
import { absd } from './stamp-duty.js';
import { statusOf, tenantCheck, pct } from './landlord.js';

const money = (v) => `S$${Number(v).toLocaleString('en-SG')}`;
const uniq = (list) => [...new Set(list.filter(Boolean))];

/**
 * Household → residency profile.
 * kind: 'sc_family' (SC + SC/PR) | 'sc_single' | 'ncs' (SC + foreigner) | 'pr_family' | 'pr_single'
 *     | 'pr_foreign' (PR + foreigner, no SC) | 'foreigner' | 'unknown' (no buyers)
 */
export function classify(h) {
  const buyers = (h.buyers || []).filter((b) => b && typeof b === 'object');
  const cits = buyers.map((b) => b.citizenship || 'SC');
  const has = (c) => cits.includes(c);
  const single = h.scheme === 'single';
  let kind = 'unknown';
  if (buyers.length) {
    if (has('SC')) kind = has('F') ? 'ncs' : single ? 'sc_single' : 'sc_family';
    else if (has('PR')) kind = has('F') ? 'pr_foreign' : single ? 'pr_single' : 'pr_family';
    else kind = 'foreigner';
  }
  const agesOf = (c) => buyers.filter((b) => (b.citizenship || 'SC') === c).map((b) => +b.age).filter((a) => Number.isFinite(a) && a > 0);
  const scAges = agesOf('SC');
  const prs = buyers.filter((b) => b.citizenship === 'PR');
  const prYears = !prs.length ? null : prs.some((b) => b.prYears3Plus === false) ? false : prs.every((b) => b.prYears3Plus === true) ? true : null;
  return { kind, buyers, cits, single, scAges, prs, prYears };
}

/**
 * Buy / borrow / rent pathways for a household.
 * @param {object} h household ({ scheme, buyers:[{age, income, citizenship, prYears3Plus, nationality, pass, wpSector}], propertiesOwned, ownsPrivate? })
 * @returns {{ profile:string, buy:{bto,resale,ecNew,ecResale,condo,landed}, loan:{hdb}, rent:{hdbWhole,hdbRoom,privateHome},
 *   notes:string[], nextBest:string|null }} each answer is { ok: true|false|'conditional', why: string[], status }
 */
export function pathways(h, policy) {
  const c = classify(h), s = summarise(h);
  const out = (ok, why, ids) => ({ ok, why: uniq([].concat(why)), status: statusOf(policy, ids) });
  const owns = (+h.propertiesOwned || 0) > 0;
  const ppo = policy.get('elig.ppo');
  const minSingle = policy.get('eligibility.single.min_age');
  const youngest = c.scAges.length ? Math.min(...c.scAges) : null;
  const oldestSc = c.scAges.length ? Math.max(...c.scAges) : null;
  const noBuyers = out('conditional', 'Add the buyers in Household to check eligibility.', ['UNVERIFIED']);
  const spr = policy.get('elig.sc_spr');
  const sprNote = c.cits.includes('PR') && c.kind === 'sc_family'
    ? `SC + PR households pay a ${money(spr.bto_premium)} premium on a new flat, refunded as a ${money(spr.citizen_top_up)} Citizen Top-Up when the PR becomes a citizen.` : null;
  const ownerNote = owns ? `Any flat or private property owned must be sold within ${ppo.dispose_within_months} months of completing the purchase.` : null;
  const privateWait = `Private-property owners face a ${ppo.wait_out_months}-month wait-out after selling before a subsidised flat, CPF grant, HDB loan or new EC.`;

  // ---- new flat from HDB (BTO / SBF)
  const bto = (() => {
    switch (c.kind) {
      case 'sc_family': { // elig.rule.family_nucleus + BTO income ceiling; elig.sc_spr premium
        const ids = ['elig.rule.family_nucleus', 'eligibility.income_ceiling.family', sprNote && 'elig.sc_spr'];
        const ceiling = policy.get('eligibility.income_ceiling.family');
        if (s.income == null) return out('conditional', [`Enter income: new flats need household income within ${money(ceiling)} a month.`, sprNote], ids);
        if (s.income > ceiling) return out(false, `Household income is above the ${money(ceiling)} ceiling for new HDB flats.`, ids);
        if (owns) return out('conditional', ['Current owners must meet extra conditions (sell first; second-timer rules).', h.ownsPrivate ? privateWait : null, sprNote], [...ids, 'elig.ppo']);
        return out(true, ['SC family nucleus within the income ceiling.', sprNote], ids);
      }
      case 'sc_single': { // elig.rule.single — 2-room Flexi only, from the singles minimum age
        const ids = ['elig.rule.single', 'eligibility.single.min_age', 'eligibility.income_ceiling.single'];
        const ceiling = policy.get('eligibility.income_ceiling.single');
        if (youngest == null) return out('conditional', `Singles can buy a new 2-room Flexi flat from age ${minSingle} — add ages.`, ids);
        if (youngest < minSingle) return out(false, `Singles can buy from HDB only from age ${minSingle}.`, ids);
        if (s.income != null && s.income > ceiling) return out(false, `Income is above the ${money(ceiling)} singles ceiling for new flats.`, ids);
        return out('conditional', ['New 2-room Flexi flats only (any location).', s.income == null ? `Income must be within ${money(ceiling)} a month.` : null], ids);
      }
      case 'ncs': { // elig.ncs — SC from the NCS minimum age with a non-resident spouse
        const n = policy.get('elig.ncs');
        if (oldestSc == null) return out('conditional', `The citizen spouse must be at least ${n.sc_min_age} — add ages.`, ['elig.ncs']);
        if (oldestSc < n.sc_min_age) return out(false, `Under the Non-Citizen Spouse scheme the citizen must be at least ${n.sc_min_age}.`, ['elig.ncs']);
        return out('conditional', ['Non-Citizen Spouse scheme: new 2-room Flexi flats only.', `The foreign spouse needs an LTVP or work pass valid at least ${n.spouse_pass_min_months} months.`, 'An income ceiling applies (not modelled).'], ['elig.ncs']);
      }
      case 'pr_family': case 'pr_foreign': // elig.spr_household — no new flats for SPR households
        return out(false, 'SPR households (no citizen) cannot buy a new flat from HDB.', ['elig.spr_household']);
      case 'pr_single': // elig.rule.single — singles scheme is for citizens
        return out(false, 'Only Singapore Citizen singles can buy HDB flats.', ['elig.rule.single']);
      case 'foreigner': // elig.rule.foreigner
        return out(false, 'Foreigners cannot buy HDB flats.', ['elig.rule.foreigner']);
      default: return noBuyers;
    }
  })();

  // ---- resale HDB flat
  const resale = (() => {
    const eip = 'Subject to the block and neighbourhood Ethnic Integration Policy quota.';
    switch (c.kind) {
      case 'sc_family': // elig.rule.family_nucleus — no income ceiling to buy (only for grants / HDB loan)
        return out(true, [eip, ownerNote, sprNote && 'CPF grants for SC + PR couples are lower than for SC couples.'], ['elig.rule.family_nucleus', 'elig.eip', owns && 'elig.ppo']);
      case 'sc_single': { // elig.rule.single
        const ids = ['elig.rule.single', 'eligibility.single.min_age'];
        if (youngest == null) return out('conditional', `Singles can buy a resale flat from age ${minSingle} — add ages.`, ids);
        if (youngest < minSingle) return out(false, `Singles can buy a resale flat only from age ${minSingle}.`, ids);
        return out(true, ['All flat types except 3Gen; Plus and Prime resale flats carry extra conditions.', eip, ownerNote], [...ids, 'elig.eip', owns && 'elig.ppo']);
      }
      case 'ncs': { // elig.ncs — resale excluding 3Gen and Prime
        const n = policy.get('elig.ncs');
        if (oldestSc == null) return out('conditional', `The citizen spouse must be at least ${n.sc_min_age} — add ages.`, ['elig.ncs']);
        if (oldestSc < n.sc_min_age) return out(false, `Under the Non-Citizen Spouse scheme the citizen must be at least ${n.sc_min_age}.`, ['elig.ncs']);
        return out(true, ['Non-Citizen Spouse scheme: resale flats except 3Gen and Prime flats.', eip, ownerNote], ['elig.ncs', 'elig.eip', owns && 'elig.ppo']);
      }
      case 'pr_family': { // elig.spr_household (3 years of PR) + elig.spr_quota (non-Malaysian)
        const r = policy.get('elig.spr_household'), q = policy.get('elig.spr_quota');
        const ids = ['elig.spr_household', 'elig.spr_quota', 'elig.eip'];
        if (c.prYears === false) return out(false, `Every SPR buyer and family member must have held PR for at least ${r.min_pr_years} years.`, ids);
        const allMy = c.prs.every((b) => b.nationality === q.exempt_nationality);
        const quota = allMy ? null : `Non-Malaysian SPR households must also fit the SPR quota (${pct(q.block)} block, ${pct(q.neighbourhood)} neighbourhood).`;
        const why = [quota, eip, 'No HDB loan (needs a citizen) — bank loan only.', ownerNote];
        if (c.prYears == null) return out('conditional', [`Only once every SPR has held PR for at least ${r.min_pr_years} years.`, ...why], ids);
        return out(true, why, [...ids, owns && 'elig.ppo']);
      }
      case 'pr_foreign': // no rule checked for SPR + foreigner households
        return out('conditional', 'An SPR + foreigner household is not a standard HDB household — confirm with HDB (HFE letter).', ['UNVERIFIED']);
      case 'pr_single': return out(false, 'Only Singapore Citizen singles can buy HDB flats.', ['elig.rule.single']);
      case 'foreigner': return out(false, 'Foreigners cannot buy HDB flats.', ['elig.rule.foreigner']);
      default: return noBuyers;
    }
  })();

  // ---- new EC from the developer (elig.ec.new + elig.ec.income_ceiling)
  const ecNew = (() => {
    const ids = ['elig.ec.new', 'elig.ec.income_ceiling'];
    const ceiling = policy.get('elig.ec.income_ceiling');
    const incomeFail = s.income != null && s.income > ceiling;
    const privateRule = h.ownsPrivate ? out(false, `No private property may be owned or sold in the ${ppo.wait_out_months} months before applying.`, ids) : null;
    if (c.kind === 'sc_family') {
      if (incomeFail) return out(false, `Household income is above the ${money(ceiling)} EC ceiling.`, ids);
      if (privateRule) return privateRule;
      return out(s.income == null ? 'conditional' : true, [s.income == null ? `Household income must be within ${money(ceiling)} a month.` : null, owns ? 'Current HDB owners must meet second-timer conditions.' : null], ids);
    }
    if (c.kind === 'sc_single') {
      const jss = c.buyers.length >= 2 && c.cits.every((x) => x === 'SC') && youngest != null && youngest >= minSingle;
      if (!jss) return out(false, `Singles can buy a new EC only together (Joint Singles Scheme), all citizens aged ${minSingle}+.`, [...ids, 'eligibility.single.min_age']);
      if (incomeFail) return out(false, `Combined income is above the ${money(ceiling)} EC ceiling.`, ids);
      return out(privateRule ? false : 'conditional', ['Joint Singles Scheme only.', privateRule && privateRule.why[0]], [...ids, 'eligibility.single.min_age']);
    }
    if (c.kind === 'unknown') return noBuyers;
    return out(false, 'New ECs need a citizen applicant with at least one other citizen or SPR.', ['elig.ec.new']);
  })();

  // ---- resale EC (elig.ec.transfer: SPRs after MOP, anyone after a further period)
  const ecResale = (() => {
    const t = policy.get('elig.ec.transfer'), allAfter = t.mop_years + t.open_to_all_after_mop_years;
    const foreignNote = `Foreign buyers can only buy ECs at least ${allAfter} years past TOP (fully privatised).`;
    switch (c.kind) {
      case 'sc_family': case 'pr_family': case 'pr_single':
        return out(true, `Resale ECs (past the ${t.mop_years}-year MOP) may be sold to citizens and SPRs.`, ['elig.ec.transfer']);
      case 'sc_single': // age conditions for singles on resale ECs not checked
        return out('conditional', 'Resale ECs can be sold to citizens; whether singles face extra conditions was not verified.', ['elig.ec.transfer', 'UNVERIFIED']);
      case 'ncs': case 'pr_foreign':
        return out('conditional', [foreignNote, 'Otherwise the citizen / SPR buys without the foreign spouse.'], ['elig.ec.transfer']);
      case 'foreigner': return out('conditional', foreignNote, ['elig.ec.transfer']);
      default: return noBuyers;
    }
  })();

  // ---- private property (elig.rpa — Residential Property Act)
  const rpa = policy.get('elig.rpa');
  const allSc = c.buyers.length > 0 && c.cits.every((x) => x === 'SC');
  const condo = c.kind === 'unknown' ? noBuyers : out(true, rpa.non_landed_restricted ? null : 'Condominiums and other non-landed homes are open to all buyers (ABSD varies).', ['elig.rpa']);
  const landed = c.kind === 'unknown' ? noBuyers : allSc
    ? out(true, 'Citizens can buy landed property freely.', ['elig.rpa'])
    : out('conditional', ['Non-citizens need SLA approval to buy landed property.', `SPRs generally need at least ${rpa.pr_landed_min_years} years of PR and an exceptional economic contribution.`], ['elig.rpa']);

  // ---- HDB loan (elig.hdb_loan — at least one citizen, income within ceiling)
  const loanHdb = (() => {
    const l = policy.get('elig.hdb_loan');
    const scCount = c.cits.filter((x) => x === 'SC').length;
    const ids = ['elig.hdb_loan', c.single ? 'eligibility.income_ceiling.single' : 'eligibility.income_ceiling.family'];
    if (c.kind === 'unknown') return noBuyers;
    if (scCount < l.min_sc_buyers) return out(false, 'HDB loans need at least one Singapore Citizen buyer — use a bank loan.', ['elig.hdb_loan']);
    if (resale.ok === false && bto.ok === false) return out(false, 'Not eligible to buy an HDB flat, so no HDB loan.', [...ids, ...[bto, resale].map((a) => a.status)]);
    const ceiling = policy.get(ids[1]);
    if (s.income != null && s.income > ceiling) return out(false, `Income is above the ${money(ceiling)} ceiling for an HDB loan — bank loan only.`, ids);
    return out(s.income == null || h.ownsPrivate ? 'conditional' : true, [
      s.income == null ? `Income must be within ${money(ceiling)} a month.` : null,
      `Not available after ${l.max_prior_hdb_loans} previous HDB loans.`,
      h.ownsPrivate ? privateWait : null,
    ], [...ids, h.ownsPrivate && 'elig.ppo']);
  })();

  // ---- renting a home
  const rentAs = (mode) => {
    if (!c.buyers.length) return noBuyers;
    const checks = c.buyers.map((b) => tenantCheck(b, mode, policy));
    const ok = checks.some((x) => x.ok === false) ? false : checks.some((x) => x.ok === 'conditional') ? 'conditional' : true;
    const why = checks.flatMap((x) => x.why), ids = checks.flatMap((x) => x.ids);
    const nonMyNc = c.buyers.some((b) => (b.citizenship || 'SC') !== 'SC' && b.nationality !== 'MY');
    const p = policy.get('rental.period');
    if (mode === 'whole' && nonMyNc) {
      const q = policy.get('rental.nc_quota');
      why.push(`The landlord's block must be under the Non-Citizen quota (${pct(q.block)} block, ${pct(q.neighbourhood)} neighbourhood); leases are approved ${p.max_months_other} months at a time.`);
      ids.push('rental.nc_quota');
    }
    why.push(`Minimum rental period ${p.min_months} months.`); ids.push('rental.period');
    return out(ok, why, ids);
  };
  const privateHome = out(true, `Open to everyone; minimum stay ${policy.get('rental.private.min_months')} consecutive months.`, ['rental.private.min_months']);

  // ---- notes and next best route
  const notes = [];
  const absd = c.buyers.length ? absdRate({ household: h }, policy) : null;
  if (absd && absd.rate > 0) notes.push(`ABSD on this household's next purchase: ${pct(absd.rate)}.`);
  if (absd && absd.note) notes.push(absd.note);
  if (c.kind === 'pr_family' || c.kind === 'pr_single') notes.push('Becoming a citizen opens new flats, CPF grants and the HDB loan.');
  notes.push('Educational guide only — HDB confirms eligibility through the HDB Flat Eligibility (HFE) letter.');

  const buy = { bto, resale, ecNew, ecResale, condo, landed };
  const labels = { resale: 'an HDB resale flat', ecNew: 'a new EC', ecResale: 'a resale EC', condo: 'a private condo' };
  const order = Object.keys(labels);
  const pick = order.find((k) => buy[k].ok === true) || order.find((k) => buy[k].ok === 'conditional');
  const nextBest = c.kind === 'unknown' || bto.ok === true ? null : pick ? `Consider ${labels[pick]}.` : 'Consider renting.';

  return { profile: c.kind, buy, loan: { hdb: loanHdb }, rent: { hdbWhole: rentAs('whole'), hdbRoom: rentAs('room'), privateHome }, notes, nextBest };
}

/**
 * New HDB flat (BTO): the flat types this household may pick (Phase 7 A7). Singles and Non-Citizen Spouse
 * applicants: `bto_flat_types` of elig.rule.single / elig.ncs (2-room Flexi). Families: no limit modelled.
 * @param {object} [paths] pathways(h, policy), when the caller already has it
 * @returns {{ ok:true|false|'conditional', allowed:string[]|null, why:string[], ids:string[], status:string }}
 *   allowed: null = no flat-type limit; [] = no new flat at all (ok false; why = the BTO pathway's reasons)
 */
export function btoFlatTypes(h, policy, paths = null) {
  const p = paths || pathways(h, policy), bto = p.buy.bto, kind = p.profile;
  if (bto.ok === false) return { ok: false, allowed: [], why: bto.why, ids: [], status: bto.status };
  const id = kind === 'sc_single' ? 'elig.rule.single' : kind === 'ncs' ? 'elig.ncs' : null;
  if (!id) return { ok: bto.ok, allowed: null, why: [], ids: [], status: bto.status };
  const why = kind === 'sc_single' ? 'Singles can buy a new 2-room Flexi flat only.' : 'Under the Non-Citizen Spouse scheme, new flats are 2-room Flexi only.';
  return { ok: bto.ok, allowed: [...policy.get(id).bto_flat_types], why: [why], ids: [id], status: statusOf(policy, [id]) };
}

/**
 * Rent & Buy (Phase 7 A6): when the household can't buy an HDB resale flat now, the routes it can take, with the
 * numbers the rules give (years until the singles age, ABSD on a private home at this price). Renting is listed by
 * the UI with the user's own rent. Empty while resale is open (ok true or 'conditional').
 * Phase 7b B11: with `maxPrice` ("Most you can pay", budget().maxPrice for this household) each path also says
 * whether a home at `price` is within it — `within` true / false (null when either is unknown) and `over` (S$ above).
 * @param {{ price?:number|null, maxPrice?:number|null }} [x] price = the flat being compared (ABSD amount on a home at that price)
 * @returns {{ id:'age'|'citizenship'|'pr_years'|'ec_resale'|'condo', text:string, ids:string[], status:string,
 *   within:boolean|null, over:number|null }[]}
 */
export function nextPaths(h, policy, { price = null, maxPrice = null } = {}, paths = null) {
  const p = paths || pathways(h, policy), c = classify(h), out = [];
  if (p.buy.resale.ok !== false) return out;
  const known = price > 0 && maxPrice != null && Number.isFinite(maxPrice);
  const over = known ? Math.max(0, Math.round(price - maxPrice)) : null;
  const add = (id, text, ids) => out.push({ id, text, ids, status: statusOf(policy, ids), within: known ? over === 0 : null, over });
  const minSingle = policy.get('eligibility.single.min_age');
  const ages = c.buyers.map((b) => +b.age).filter((a) => Number.isFinite(a) && a > 0);
  const youngest = ages.length ? Math.min(...ages) : null;
  const inYears = (n) => (n === 1 ? 'in 1 year' : `in ${n} years`);
  const singleIds = ['elig.rule.single', 'eligibility.single.min_age'];
  if (c.kind === 'sc_single' && youngest != null && youngest < minSingle) add('age', `An HDB resale flat from age ${minSingle} — ${inYears(minSingle - youngest)}.`, singleIds);
  if (c.kind === 'pr_single') {
    add('citizenship', youngest != null && youngest < minSingle
      ? `An HDB resale flat once you are a Singapore Citizen and at least ${minSingle} (${inYears(minSingle - youngest)} at the earliest).`
      : `An HDB resale flat once you are a Singapore Citizen (singles from age ${minSingle}).`, singleIds);
  }
  if (c.kind === 'pr_family' && c.prYears === false) add('pr_years', `An HDB resale flat once every SPR has held PR for at least ${policy.get('elig.spr_household').min_pr_years} years.`, ['elig.spr_household']);
  if (c.kind === 'ncs') {
    const n = policy.get('elig.ncs'), sc = c.scAges.length ? Math.max(...c.scAges) : null;
    if (sc != null && sc < n.sc_min_age) add('age', `An HDB resale flat under the Non-Citizen Spouse scheme once the citizen is ${n.sc_min_age} — ${inYears(n.sc_min_age - sc)}.`, ['elig.ncs']);
  }
  if (p.buy.ecResale.ok === true) add('ec_resale', `A resale EC past its ${policy.get('elig.ec.transfer').mop_years}-year MOP.`, ['elig.ec.transfer']);
  if (p.buy.condo.ok === true) {
    const rate = absdRate({ household: h }, policy).rate;
    const amount = price > 0 ? absd(price, rate) : null;
    add('condo', !(rate > 0) ? 'A private condo — no ABSD on this household\'s next purchase.'
      : amount != null ? `A private condo — ABSD ${pct(rate)} applies (${money(Math.round(amount))} on a ${money(Math.round(price))} home).`
        : `A private condo — ABSD ${pct(rate)} applies.`, ['elig.rpa', 'stamp.absd.rates']);
  }
  return out;
}
