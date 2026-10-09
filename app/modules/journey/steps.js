// Goal steps (Phase 8 M-07, mobile-revamp-ideas.md §3 "M-07 Goal steps", owner Q6): the Start here goal (store
// ui.start.goal) as 3–4 plain steps on the goal's page. The pure part: goal → page / title / steps, and "done" worked
// out from what is already saved (store + the map's own save 'hdb-comparer') — never asked, never stored. The only
// write of the whole module is "Hide these steps" (ui.journey.hidden = the goal id; a new goal shows its steps again).
// No DOM, no dates, node-testable. OPEN_BELOW is a UI heuristic, not a Singapore rule.
import { householdField } from '../../core/filllink.js';
import { rentAmount } from '../../core/rentshare.js';

/** Start here goal ids (modules/start/answers.js GOALS, same order); labels = the same English keys (same 中文). */
export const GOALS = ['buyResale', 'btoVsResale', 'sellUpgrade', 'rent', 'retire', 'explore'];
export const GOAL_LABEL = {
  buyResale: 'Buy a resale flat', btoVsResale: 'Choose between BTO and resale', sellUpgrade: 'Sell my flat and upgrade',
  rent: 'Rent a home', retire: 'Plan for retirement', explore: 'Just explore the map',
};
export const GOAL_TITLE = {
  buyResale: 'Your steps: buy a resale flat', btoVsResale: 'Your steps: BTO or resale', sellUpgrade: 'Your steps: sell and upgrade',
  rent: 'Your steps: rent a home', retire: 'Your steps: plan for retirement', explore: 'Your steps: explore the map',
};
/** The page the card sits on: the tab Start here sends the goal to; "Just explore" → My choices (the map has no page). */
export const GOAL_PAGE = { buyResale: 'afford', btoVsResale: 'plan', sellUpgrade: 'plan', rent: 'rent', retire: 'plan', explore: 'choices' };
/** The card starts open while fewer than this many steps are done; after that it starts folded (answer first). */
export const OPEN_BELOW = 2;
/** "Add 2–3 flats you like" is done from this many shortlisted flats (also when Compare has something to compare). */
export const FLATS_ENOUGH = 2;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);
const pos = (v) => (num(v) ?? 0) > 0;

/** The goal Start here saved (ui.start.goal), or null (skipped, never answered, "Start over"). */
export const goalOf = (ui) => (isObj(ui) && isObj(ui.start) && GOALS.includes(ui.start.goal) ? ui.start.goal : null);
/** The goal whose steps were hidden (ui.journey.hidden), or null. */
export const hiddenGoal = (ui) => (isObj(ui) && isObj(ui.journey) && GOALS.includes(ui.journey.hidden) ? ui.journey.hidden : null);

/** Shortlisted flats and Daily places in the map's own save (localStorage 'hdb-comparer' raw string). */
export function comparerCounts(raw) {
  try {
    const s = JSON.parse(raw || 'null');
    return { choices: Array.isArray(s?.choices) ? s.choices.length : 0, places: Array.isArray(s?.workplaces) ? s.workplaces.length : 0 };
  } catch { return { choices: 0, places: 0 }; }
}

/**
 * What is already done, from saved state only.
 * @param {{ household?:object, focus?:object, plan?:object, ui?:object }} state  store slices
 * @param {string|null} legacyRaw  localStorage 'hdb-comparer'
 */
export function factsFrom(state = {}, legacyRaw = null) {
  const h = isObj(state.household) ? state.household : {};
  const buyers = Array.isArray(h.buyers) ? h.buyers.filter(isObj) : [];
  const every = (k) => buyers.length > 0 && buyers.every((b) => num(b[k]) != null);
  const p = isObj(state.plan) ? state.plan : {}, cur = isObj(p.current) ? p.current : {};
  const f = isObj(state.focus) ? state.focus : null, ui = isObj(state.ui) ? state.ui : {};
  const { choices, places } = comparerCounts(legacyRaw);
  const rent = isObj(p.rent) && p.rent.amount != null ? p.rent.amount : p.rentNow;
  return {
    ages: every('age'),
    basics: every('age') && every('income'), // About you → The basics: every buyer's age and income (0 counts)
    // a CPF balance for every buyer who has CPF (foreigners have none)
    cpf: buyers.length > 0 && buyers.every((b) => b.citizenship === 'F' || ['cpfOa', 'cpfSa', 'cpfRa'].some((k) => num(b[k]) != null)),
    choices, places,
    focus: !!f && pos(f.price),
    focusChoice: !!f && f.source === 'choice' && pos(f.price), // "Afford this" from My choices
    ticks: Array.isArray(ui.priorities) && ui.priorities.length > 0, // Compare → "What matters most to you?"
    owns: cur.owns === true,
    salePrice: pos(cur.salePrice),
    bto: (p.btoId != null && p.btoId !== '') || pos(p.btoPrice) || (isObj(p.btoPrices) && Object.values(p.btoPrices).some(pos)),
    rent: (rentAmount(rent) ?? 0) > 0,
    order: !!cur.mode || !!cur.saleCompletion || !!(isObj(p.dates) && p.dates.nextCompletion),
  };
}

// where a step's link goes: { fill, field } = core/filllink.js data-fill (household → About you on that field,
// places → My choices → Daily places, rent → Rent & Buy's rent field); { tab, section, anchor, focus } = nav:goto
// (+ plan:show section, then scroll to #anchor / focus [data-p=focus]); { compare: true } = My choices → Compare
const aboutGo = (h, f, second) => ({ fill: 'household', field: householdField(h, f.ages ? second : 'age') });
const saleGo = (f) => ({ tab: 'plan', section: 'planSellBuy', focus: f.owns ? 'plan.current.salePrice' : 'plan.current.owns' });
const MAP = { tab: 'explore' };

/** The steps for a goal: [{ id, text (English key), vals, done, go }]. */
export function stepsFor(goal, f, household = {}) {
  const h = isObj(household) ? household : {};
  const about = { id: 'about', text: 'Your ages and income', done: f.basics, go: aboutGo(h, f, 'income') };
  const flats = { id: 'flats', text: f.choices > 0 ? 'Add 2–3 flats you like ({0} added)' : 'Add 2–3 flats you like', vals: f.choices > 0 ? [f.choices] : null, done: f.choices >= FLATS_ENOUGH, go: MAP };
  const compare = { id: 'compare', text: 'Compare them', done: f.choices >= FLATS_ENOUGH && (f.ticks || f.focusChoice), go: { compare: true } };
  const sale = { id: 'sale', text: 'Your flat and sale price', done: f.owns && f.salePrice, go: saleGo(f) };
  switch (goal) {
    case 'buyResale': return [about, flats, compare,
      { id: 'afford', text: 'Check you can afford the top one', done: f.basics && f.focus, go: { tab: 'afford', anchor: 'affordRoot' } }];
    case 'btoVsResale': return [about,
      { id: 'resale', text: 'A resale flat to compare with', done: f.focus, go: MAP },
      { id: 'bto', text: 'BTO price and wait', done: f.bto, go: { tab: 'plan', section: 'planBto' } },
      { id: 'result', text: 'Read the result', done: f.basics && f.focus && f.bto, go: { tab: 'plan', section: 'planBto' } }];
    case 'sellUpgrade': return [about, sale,
      { id: 'next', text: 'The next flat', done: f.focus, go: MAP },
      { id: 'order', text: 'Order and timeline', done: f.order || (f.owns && f.salePrice && f.focus), go: { tab: 'plan', section: 'planSellBuy', anchor: 'planMoveTimeline' } }];
    case 'rent': return [
      { id: 'rentAsk', text: 'Asking rent and place', done: f.rent, go: { fill: 'rent' } },
      { id: 'rentBuy', text: 'Rent or buy?', done: f.rent && f.basics, go: { tab: 'rent', anchor: 'rentBuy' } },
      { id: 'paths', text: 'What your household can do', done: f.basics, go: f.basics ? { tab: 'rent', anchor: 'rentPathways' } : about.go }];
    case 'retire': {
      const cpfDone = f.ages && f.cpf;
      return [
        { id: 'aboutCpf', text: 'Your ages and CPF', done: cpfDone, go: aboutGo(h, f, 'cpfOa') },
        { id: 'cpf', text: 'CPF at 55 and from 65', done: cpfDone, go: { tab: 'plan', section: 'planCpf' } },
        sale,
        { id: 'seniors', text: 'Options at 55 and above', done: cpfDone && f.owns && f.salePrice, go: { tab: 'plan', section: 'planSeniors' } }];
    }
    case 'explore': return [flats,
      { id: 'places', text: 'Add a daily place', done: f.places > 0, go: { fill: 'places' } },
      compare, about];
    default: return [];
  }
}

/**
 * The card for the saved goal, or null when there is no goal.
 * → { goal, page, title, steps, next (index of the first step not done, -1 = all done), allDone, doneCount, hidden,
 *    openByDefault }
 */
export function journeyModel({ goal, facts, household = {}, hidden = null }) {
  if (!GOALS.includes(goal)) return null;
  const steps = stepsFor(goal, facts, household);
  const next = steps.findIndex((s) => !s.done), doneCount = steps.filter((s) => s.done).length;
  return { goal, page: GOAL_PAGE[goal], title: GOAL_TITLE[goal], steps, next, allDone: next < 0, doneCount, hidden: hidden === goal,
    openByDefault: next >= 0 && doneCount < OPEN_BELOW };
}

/** Every English string here (zh coverage test). */
export const stepStrings = () => [...Object.values(GOAL_LABEL), ...Object.values(GOAL_TITLE), 'Your ages and income',
  'Add 2–3 flats you like', 'Add 2–3 flats you like ({0} added)', 'Compare them', 'Your flat and sale price',
  'Check you can afford the top one', 'A resale flat to compare with', 'BTO price and wait', 'Read the result', 'The next flat',
  'Order and timeline', 'Asking rent and place', 'Rent or buy?', 'What your household can do', 'Your ages and CPF',
  'CPF at 55 and from 65', 'Options at 55 and above', 'Add a daily place'];
