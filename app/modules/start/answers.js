// First-run "Start here" (roadmap X-09; Phase 7b B5) — the pure part: questions per goal, first-visit detection,
// answers → household (the same shape the household drawer writes) and → Plan inputs, goal → tab / tour / guide / map
// hand-off. No DOM, no dates, node-testable. Every number here is a UI heuristic (income bands, flat-type picks),
// never a Singapore rule.
import { defaults } from '../../core/store.js';
import { sharedRent, rentAmount } from '../../core/rentshare.js';

// "Just explore" (and no goal yet): the original six questions
export const QUESTIONS = ['goal', 'who', 'residency', 'income', 'firstTimer', 'towns'];
export const MAX_SCREENS = 7;
// 7b B5: one goal-specific screen per goal, still ≤ 7 (design phase7b B5 table)
export const GOAL_QUESTIONS = {
  buyResale: ['goal', 'who', 'residency', 'income', 'firstTimer', 'savings', 'towns'],
  btoVsResale: ['goal', 'who', 'residency', 'income', 'firstTimer', 'savings', 'towns'],
  sellUpgrade: ['goal', 'who', 'residency', 'income', 'home', 'firstTimer', 'towns'],
  rent: ['goal', 'who', 'residency', 'income', 'rentNow', 'travel', 'towns'],
  retire: ['goal', 'who', 'residency', 'income', 'home', 'cpfCash', 'towns'],
};
/** Goals whose "who" screen offers "Add a child (for Primary 1 dates)" (O6: no separate family goal). */
export const CHILD_GOALS = ['buyResale', 'btoVsResale', 'sellUpgrade'];

/** The screens for these answers. Sell and upgrade: an HDB flat owned now → second-timers, so no first-flat screen. */
export function questionsFor(a) {
  const list = GOAL_QUESTIONS[a && a.goal] || QUESTIONS;
  return a && a.goal === 'sellUpgrade' && a.home && a.home.type === 'hdb' ? list.filter((q) => q !== 'firstTimer') : list;
}

/** What you want to do → where to go next. tour = USE_CASES id (modules/guide/steps.js); guides = preferred guide
 *  ids in content/guides, then any guide with the same use_case; section = Plan card to scroll to (bus 'plan:show'). */
export const GOALS = [
  { id: 'buyResale', label: 'Buy a resale flat', blurb: 'Check a price against your budget and compare flats.', tab: 'afford', tour: 'firstResale', guides: ['buying-resale'] },
  { id: 'btoVsResale', label: 'Choose between BTO and resale', blurb: 'Waiting time, rent while you wait and cash needed.', tab: 'plan', section: 'planBto', tour: 'btoVsResale', guides: ['bto-vs-resale'] },
  { id: 'sellUpgrade', label: 'Sell my flat and upgrade', blurb: 'Sale proceeds, CPF refund and the next flat.', tab: 'plan', section: 'planSellBuy', tour: 'sellBuy', guides: [] },
  { id: 'rent', label: 'Rent a home', blurb: 'Is a rent fair, and would buying be better?', tab: 'rent', tour: 'renting', guides: ['renting-singles-prs'] },
  { id: 'retire', label: 'Plan for retirement', blurb: 'Your CPF at 55 and options for older owners.', tab: 'plan', section: 'planCpf', tour: 'retire', guides: [] },
  { id: 'explore', label: 'Just explore the map', blurb: 'Prices, schools and MRT around Singapore.', tab: 'explore', tour: 'map', guides: [] },
];
export const GOAL_IDS = GOALS.map((g) => g.id);
export const goalById = (id) => GOALS.find((g) => g.id === id) || null;

export const RESIDENCY = [['SC', 'Singapore Citizen'], ['PR', 'Permanent Resident'], ['F', 'Foreigner']];
export const SPLITS = ['even', 'one', 'each'];          // two buyers: split evenly · one of us works · type each
export const PARENTS = ['none', 'near', 'with'];        // household.parents (Proximity Housing Grant)
export const HOME_TYPES = ['hdb', 'private'];
export const HOME_FLAT_TYPES = ['2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE', 'MULTI-GENERATION'];

// combined gross monthly income bands (S$); `value` is what is saved when a band is picked (UI heuristic)
export const INCOME_BANDS = [
  { id: 'i1', lo: null, hi: 3000, value: 2500 },
  { id: 'i2', lo: 3000, hi: 5000, value: 4000 },
  { id: 'i3', lo: 5000, hi: 8000, value: 6500 },
  { id: 'i4', lo: 8000, hi: 11000, value: 9500 },
  { id: 'i5', lo: 11000, hi: 15000, value: 13000 },
  { id: 'i6', lo: 15000, hi: null, value: 16000 },
];
export const bandById = (id) => INCOME_BANDS.find((b) => b.id === id) || null;

export const AGE_MIN = 21; // drawer input range (household/index.js) — keeps typos out, not an eligibility rule
export const AGE_MAX = 99;

// flat types the map starts with (UI suggestion, B11 "Picked for you"; the user changes them under Flat type).
// One person, or two who are both SENIOR_HINT_AGE or older → the smaller types. A heuristic, never "allowed".
export const SENIOR_HINT_AGE = 55;
const FT_SMALLER = ['2 ROOM', '3 ROOM'];
const FT_SMALL = ['3 ROOM', '4 ROOM'];
const FT_FAMILY = ['4 ROOM', '5 ROOM', 'EXECUTIVE'];
const seniors = (ages, n) => n === 2 && Array.isArray(ages) && ages.length >= 2 && ages.slice(0, 2).every((x) => Number.isFinite(+x) && x != null && +x >= SENIOR_HINT_AGE);
export function flatTypesFor(goal, buyers, { ages = null } = {}) {
  const small = buyers === 1 || seniors(ages, buyers);
  if (goal === 'buyResale' || goal === 'btoVsResale') return small ? FT_SMALLER : FT_FAMILY;
  if (goal === 'sellUpgrade') return FT_FAMILY;
  if (goal === 'rent') return small ? FT_SMALLER : FT_SMALL;
  return null; // retire / explore / unknown: leave the map as it is
}
/** Who the flat-type pick was made for: 'one' | 'seniors' | 'two' | null (the hint line under the map's chips). */
export function pickedFor(a) {
  const n = a && (a.buyers === 1 || a.buyers === 2) ? a.buyers : null;
  if (n === 1) return 'one';
  if (n === 2) return seniors(a.ages, 2) ? 'seniors' : 'two';
  return null;
}

const num = (v) => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);
const money0 = (v) => { const x = num(v); return x == null || x < 0 ? null : Math.round(x); };
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
export const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const emptyBuyer = () => ({ age: null, income: null, citizenship: 'SC', prYears3Plus: null, nationality: null, pass: null, wpSector: null, cpfOa: null, cpfSa: null, cpfMa: null, cpfRa: null });

/** Shortlisted flats in the map's own save (localStorage 'hdb-comparer' raw string). */
export function choicesCount(legacyRaw) {
  try { const s = JSON.parse(legacyRaw || 'null'); return Array.isArray(s?.choices) ? s.choices.length : 0; } catch { return 0; }
}

/** Nothing typed into the household yet: no buyer with an age / income / CPF, no cash, no other debts. */
export function householdEmpty(h) {
  if (!isObj(h)) return true;
  const buyers = Array.isArray(h.buyers) ? h.buyers : [];
  const any = buyers.some((b) => isObj(b) && ['age', 'income', 'cpfOa', 'cpfSa', 'cpfMa', 'cpfRa'].some((k) => num(b[k]) != null));
  return !any && num(h.cash) == null && num(h.otherDebts) == null && num(h.grantsOverride) == null;
}

/** True first visit: no household, no shortlisted flats, Start here never finished or skipped, not inside a sample. */
export function isFirstVisit({ state, legacyRaw = null, inSample = false } = {}) {
  if (inSample || !isObj(state)) return false;
  const st = state.ui && state.ui.start;
  if (isObj(st) && (st.done || st.skipped)) return false;
  return householdEmpty(state.household) && choicesCount(legacyRaw) === 0;
}

/** How a saved pair of incomes reads back: equal → evenly; buyer 2 at 0 → one of us works; else typed each. */
function splitOf(incomes) {
  if (incomes.length < 2 || incomes.some((v) => v == null)) return 'even';
  if (incomes[0] === incomes[1] || Math.abs(incomes[0] - incomes[1]) <= 1) return 'even';
  return incomes[1] === 0 && incomes[0] > 0 ? 'one' : 'each';
}

/**
 * Answers prefilled from a household ("Edit answers" shows what is saved; "Start over" passes a cleared one) and the
 * Plan inputs (home owned, rent now). CPF OA starts unanswered (`cpfOa` null): the field shows the saved total and
 * only a typed total is split again.
 */
export function answersFrom(h, prev = {}, plan = null) {
  const x = isObj(h) ? h : {};
  const buyers = (Array.isArray(x.buyers) && x.buyers.length ? x.buyers : [emptyBuyer()]).slice(0, 2);
  const incomesRaw = buyers.map((b) => num(b && b.income));
  const incomes = incomesRaw.filter((v) => v != null);
  const empty = householdEmpty(x);
  const split = buyers.length === 2 ? splitOf(incomesRaw) : 'even';
  const cur = isObj(plan) && isObj(plan.current) ? plan.current : null;
  const rent = sharedRent(plan);
  return {
    goal: GOAL_IDS.includes(prev.goal) ? prev.goal : null,
    buyers: empty && !prev.buyers ? null : buyers.length,
    prefill: empty ? null : buyers.length, // buyer count already saved: keeping it does not change the scheme
    ages: buyers.map((b) => num(b && b.age)),
    residency: buyers.map((b) => (b && ['SC', 'PR', 'F'].includes(b.citizenship) ? b.citizenship : 'SC')),
    income: incomes.length ? incomes.reduce((a, v) => a + v, 0) : null,
    band: null,
    split,
    each: split === 'each' ? incomesRaw.slice(0, 2) : [null, null],
    noWork: false,
    firstTimer: empty ? null : x.firstTimer ?? null,
    towns: Array.isArray(prev.towns) ? prev.towns.slice() : [],
    // goal-specific screens (7b B5)
    child: null, childOpen: false,
    cpfOa: null, oaSaved: buyers.reduce((t, b) => t + (num(b && b.cpfOa) || 0), 0) || null,
    cash: num(x.cash), parents: PARENTS.includes(x.parents) ? x.parents : null,
    home: cur && cur.owns ? { type: cur.propertyType === 'private' ? 'private' : 'hdb', flatType: cur.flatType || null, block: isObj(cur.block) ? { ...cur.block } : null } : { type: null, flatType: null, block: null },
    rent: { type: rent.type, amount: rent.amount },
    hubs: [],
    ra: buyers.map((b) => num(b && b.cpfRa)),
    life: buyers.map((b) => num(b && b.cpfLifeMonthly)),
  };
}

/** Combined income from the answers: "no income from work" → 0; typed each (two buyers) → their sum; a typed number
 *  wins over a band; null when nothing was given. */
export function incomeOf(a) {
  if (a && a.noWork) return 0;
  if (a && a.buyers === 2 && a.split === 'each') {
    const each = (a.each || []).map(money0).filter((v) => v != null);
    return each.length ? each.reduce((t, v) => t + v, 0) : null;
  }
  const typed = num(a && a.income);
  if (typed != null && typed >= 0) return Math.round(typed);
  const b = bandById(a && a.band);
  return b ? b.value : null;
}

/** Split a combined income across n buyers in whole dollars (the parts add up exactly). */
export function splitIncome(total, n) {
  if (total == null || !(n > 0)) return Array(Math.max(0, n || 0)).fill(null);
  const each = Math.round(total / n);
  return Array.from({ length: n }, (_, i) => (i < n - 1 ? each : total - each * (n - 1)));
}

/** Income per buyer: evenly · all for buyer 1 ("one of us works") · as typed each · 0 with no income from work. */
export function incomesFor(a, n) {
  if (a && a.noWork) return Array(n).fill(0);
  if (n === 2 && a && a.split === 'each') return [0, 1].map((i) => money0((a.each || [])[i]));
  const total = incomeOf(a);
  if (total == null) return Array(n).fill(null);
  if (n === 2 && a && a.split === 'one') return [total, 0];
  return splitIncome(total, n);
}

const cleanAge = (v) => { const a = num(v); return a == null ? null : Math.round(Math.min(AGE_MAX, Math.max(AGE_MIN, a))); };

/**
 * Answers → the household slice (same shape as the drawer writes). Only answered questions change anything; the
 * rest of `base` (CPF balances, cash, loan, grants…) is kept, buyer by buyer. Screens that are not part of the
 * goal's list are ignored (an answer left over from another goal is not written).
 */
export function householdFrom(a, base) {
  const h = isObj(base) ? JSON.parse(JSON.stringify(base)) : {};
  const old = Array.isArray(h.buyers) && h.buyers.length ? h.buyers : [emptyBuyer()];
  const n = a && (a.buyers === 1 || a.buyers === 2) ? a.buyers : Math.min(2, old.length);
  const buyers = Array.from({ length: n }, (_, i) => ({ ...emptyBuyer(), ...(old[i] || {}) }));
  const qs = questionsFor(a);
  if (a && (a.buyers === 1 || a.buyers === 2) && a.buyers !== a.prefill) h.scheme = n === 1 ? 'single' : 'family';
  buyers.forEach((b, i) => {
    const age = cleanAge(a && a.ages ? a.ages[i] : null);
    if (age != null) b.age = age;
    const r = a && a.residency ? a.residency[i] : null;
    if (['SC', 'PR', 'F'].includes(r)) b.citizenship = r;
  });
  incomesFor(a, n).forEach((v, i) => { if (v != null) buyers[i].income = v; });
  if (a && qs.includes('savings')) {
    const oa = money0(a.cpfOa);
    const cpfIdx = buyers.map((b, i) => (b.citizenship === 'F' ? -1 : i)).filter((i) => i >= 0); // foreigners have no CPF
    if (oa != null && cpfIdx.length) {
      const parts = a.split === 'one' && n === 2 ? [oa, 0] : splitIncome(oa, cpfIdx.length);
      cpfIdx.forEach((bi, k) => { buyers[bi].cpfOa = parts[k] ?? 0; });
    }
    if (money0(a.cash) != null) h.cash = money0(a.cash);
    if (PARENTS.includes(a.parents)) h.parents = a.parents;
  }
  if (a && qs.includes('cpfCash')) {
    buyers.forEach((b, i) => {
      if (b.citizenship === 'F') return;
      const ra = money0((a.ra || [])[i]); if (ra != null) b.cpfRa = ra;
      const life = money0((a.life || [])[i]); if (life != null) b.cpfLifeMonthly = life;
    });
    if (money0(a.cash) != null) h.cash = money0(a.cash);
  }
  h.buyers = buyers;
  const ft = a ? a.firstTimer : null;
  // Sell and upgrade with an HDB flat owned now: second-timers (said on "You're set"; change it in Your household)
  if (a && a.goal === 'sellUpgrade' && a.home && a.home.type === 'hdb') h.firstTimer = false;
  else if (qs.includes('firstTimer') && (ft === true || ft === false || (ft === 'mixed' && n === 2))) h.firstTimer = ft;
  if (n === 1 && h.firstTimer === 'mixed') h.firstTimer = true; // the drawer does the same when switching to Single
  return h;
}

/**
 * Answers → Plan inputs as [store path, value] pairs: the home you own (plan.current: owns ✓, HDB / private, flat
 * type, block), the rent you pay now (plan.rent, shared — B7) and a child's date of birth (plan.dates.children, for
 * the Primary 1 dates). Only what was answered; nothing when it would not change.
 */
export function planPatches(a, plan = {}) {
  const out = [], qs = questionsFor(a), p = isObj(plan) ? plan : {};
  if (!a) return out;
  const cur = isObj(p.current) ? p.current : {};
  const home = isObj(a.home) ? a.home : {};
  const answered = qs.includes('home') && HOME_TYPES.includes(home.type);
  if (a.goal === 'sellUpgrade' || answered) {
    const next = { ...cur, owns: true };
    if (answered) {
      next.propertyType = home.type;
      if (home.type === 'hdb' && HOME_FLAT_TYPES.includes(home.flatType)) next.flatType = home.flatType;
      if (home.type === 'hdb' && isObj(home.block) && Number.isInteger(home.block.bid)) next.block = { bid: home.block.bid, label: String(home.block.label || '') };
    }
    if (JSON.stringify(next) !== JSON.stringify(cur)) out.push(['plan.current', next]);
  }
  if (qs.includes('rentNow') && isObj(a.rent)) {
    const was = sharedRent(p), amount = rentAmount(a.rent.amount), type = a.rent.type === 'room' ? 'room' : 'whole';
    if (amount !== was.amount || type !== was.type) out.push(['plan.rent', { ...(isObj(p.rent) ? p.rent : {}), type, amount }]);
  }
  if (CHILD_GOALS.includes(a.goal) && isIsoDate(a.child)) {
    const kids = Array.isArray(p.dates && p.dates.children) ? p.dates.children : [];
    if (!kids.includes(a.child)) out.push(['plan.dates.children', [...kids, a.child]]);
  }
  return out;
}

/**
 * "Start over" (A9): a cleared household — the store's empty one (cash, CPF, loan, grants override, parents all
 * back to the defaults), so householdEmpty() is true. "Edit answers" uses householdFrom(), which keeps them.
 */
export const clearedHousehold = () => defaults().household;

/** Would the answers change the saved household (who, ages, residency, income, first-timer, money)? */
export function touchesHousehold(a, base) {
  if (!a) return false;
  return JSON.stringify(householdFrom(a, base)) !== JSON.stringify(isObj(base) ? base : {});
}

/** Guide for a goal from the loaded guides list ([{ id, use_case, title }]): preferred id, else same tour use case. */
export function guideFor(goalId, guides) {
  const g = goalById(goalId), list = Array.isArray(guides) ? guides : [];
  if (!g) return null;
  return g.guides.map((id) => list.find((x) => x.id === id)).find(Boolean) || list.find((x) => x.use_case === g.tour) || null;
}

/**
 * Where Start here sends the user: { tab, section, tour, guide, view, picked } — view is the partial map view for
 * the explore hand-off (bus 'explore:view'): flat types, towns, colour mode, commute places; null fields are left
 * alone. picked = who the flat types were picked for (B11 hint), null when none were picked.
 */
export function routeFor(a, guides = []) {
  const g = goalById(a && a.goal) || goalById('explore');
  const n = a && (a.buyers === 1 || a.buyers === 2) ? a.buyers : null;
  const ft = flatTypesFor(g.id, n, { ages: a && a.ages });
  const towns = Array.isArray(a && a.towns) ? a.towns.filter((x) => typeof x === 'string' && x) : [];
  const hubs = questionsFor(a).includes('travel') && Array.isArray(a.hubs) ? [...new Set(a.hubs.filter((x) => typeof x === 'string' && x))].slice(0, 2) : [];
  const view = {};
  if (ft) view.ft = ft.slice();
  if (towns.length) view.towns = towns;
  if (hubs.length) view.hubs = hubs;
  if (g.id === 'rent') view.colorBy = 'rent';
  return { goal: g.id, tab: g.tab, section: g.section || null, tour: g.tour, guide: guideFor(g.id, guides), view: Object.keys(view).length ? view : null, picked: ft ? pickedFor(a) : null };
}

/** Record kept in the store (ui.start): what was finished or skipped, on which day — no answers. */
export const startRecord = (kind, day, goal = null) => (kind === 'done' ? { done: day, goal } : { skipped: day });

/** The language-switch draft (ui.startDraft, O5): { i, a } when well formed, else null. Local only; cleared on finish / skip. */
export function cleanDraft(raw) {
  if (!isObj(raw) || !isObj(raw.a) || !Number.isInteger(raw.i) || raw.i < 0 || raw.i >= MAX_SCREENS) return null;
  const a = raw.a;
  if (a.goal != null && !GOAL_IDS.includes(a.goal)) return null;
  if (!Array.isArray(a.ages) || !Array.isArray(a.residency) || !Array.isArray(a.towns)) return null;
  return { i: Math.min(raw.i, questionsFor(a).length - 1), a };
}
