// Phase 8 M-07 (owner Q6): goal steps — a foldable "Your steps" card for the Start here goal, ✓ worked out from what
// is already saved (never asked), each step a link, "Hide these steps" the only write, no progress bar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { GOALS, GOAL_LABEL, GOAL_PAGE, GOAL_TITLE, OPEN_BELOW, goalOf, hiddenGoal, comparerCounts, factsFrom, stepsFor,
  journeyModel, stepStrings } from '../../app/modules/journey/steps.js';
import { cardHtml, hiddenHtml, menuRowsHtml, learnLineHtml, goAttrs, nextText, viewStrings } from '../../app/modules/journey/view.js';
import { GOALS as START_GOALS } from '../../app/modules/start/answers.js';
import { knownFill } from '../../app/core/filllink.js';
import { defaults } from '../../app/core/store.js';

const app = new URL('../../app/', import.meta.url);
const src = (p) => readFileSync(new URL(p, app), 'utf8');
const buyer = (o = {}) => ({ ...defaults().household.buyers[0], ...o });
const state = (o = {}) => ({ ...defaults(), ...o });
const comparer = (choices = 0, places = 0) => JSON.stringify({ choices: Array.from({ length: choices }, (_, i) => ({ id: i + 1 })), workplaces: Array.from({ length: places }, () => ({})) });
const model = (goal, st = state(), raw = null, hidden = null) => journeyModel({ goal, facts: factsFrom(st, raw), household: st.household, hidden });

test('goals: the six Start here goals, same ids, labels and pages as Start here sends them to', () => {
  assert.deepEqual(GOALS, START_GOALS.map((g) => g.id));
  for (const g of START_GOALS) {
    assert.equal(GOAL_LABEL[g.id], g.label);
    assert.ok(GOAL_TITLE[g.id].startsWith('Your steps: '));
    assert.equal(GOAL_PAGE[g.id], g.id === 'explore' ? 'choices' : g.tab, g.id);
  }
  const html = src('index.html');
  for (const page of Object.values(GOAL_PAGE)) assert.match(html, new RegExp(`id="tab-${page}"`), page);
});

test('goalOf / hiddenGoal: only known goal ids; nothing saved → null', () => {
  assert.equal(goalOf(defaults().ui), null);
  assert.equal(goalOf({ start: { done: '2026-10-01', goal: 'rent' } }), 'rent');
  assert.equal(goalOf({ start: { skipped: '2026-10-01' } }), null);
  assert.equal(goalOf({ start: { goal: 'nope' } }), null);
  assert.equal(hiddenGoal({ journey: { hidden: 'retire' } }), 'retire');
  assert.equal(hiddenGoal({ journey: { hidden: null } }), null);
  assert.equal(hiddenGoal(null), null);
});

test('comparerCounts: shortlist and Daily places from the map save; unreadable → 0', () => {
  assert.deepEqual(comparerCounts(comparer(3, 1)), { choices: 3, places: 1 });
  assert.deepEqual(comparerCounts(null), { choices: 0, places: 0 });
  assert.deepEqual(comparerCounts('{oops'), { choices: 0, places: 0 });
});

test('3–4 steps per goal; nothing done on an empty app; every link goes somewhere the app can open', () => {
  const f = factsFrom(state());
  for (const g of GOALS) {
    const steps = stepsFor(g, f, defaults().household);
    assert.ok(steps.length >= 3 && steps.length <= 5, g);
    assert.ok(steps.every((s) => !s.done), g);
    for (const s of steps) {
      if (s.go.fill) assert.ok(knownFill({ target: s.go.fill, field: s.go.field || '' }), `${g}/${s.id}`);
      else assert.ok(s.go.compare || ['explore', 'afford', 'rent', 'plan', 'choices'].includes(s.go.tab), `${g}/${s.id}`);
    }
  }
  assert.deepEqual(stepsFor('nope', f), []);
  assert.equal(journeyModel({ goal: null, facts: f }), null);
});

test('buy a resale flat: done follows the saved state step by step', () => {
  let st = state();
  let m = model('buyResale', st);
  assert.deepEqual(m.steps.map((s) => s.id), ['about', 'flats', 'compare', 'afford']);
  assert.equal(m.next, 0); assert.equal(m.page, 'afford'); assert.ok(m.openByDefault);
  assert.deepEqual(m.steps[0].go, { fill: 'household', field: 'buyers.0.age' });
  st = state({ household: { ...defaults().household, buyers: [buyer({ age: 30 })] } });
  assert.deepEqual(model('buyResale', st).steps[0].go, { fill: 'household', field: 'buyers.0.income' }, 'age typed → the income field');
  st = state({ household: { ...defaults().household, buyers: [buyer({ age: 30, income: 5000 }), buyer({ age: 29, income: 0 })] } });
  m = model('buyResale', st, comparer(1));
  assert.ok(m.steps[0].done, 'every buyer has an age and an income (0 counts)');
  assert.equal(m.steps[1].text, 'Add 2–3 flats you like ({0} added)'); assert.deepEqual(m.steps[1].vals, [1]);
  assert.ok(!m.steps[1].done); assert.equal(m.next, 1); assert.ok(m.openByDefault, 'one step done → still open');
  m = model('buyResale', st, comparer(3));
  assert.ok(m.steps[1].done); assert.ok(!m.steps[2].done, 'two flats are not yet "compared"');
  assert.equal(m.next, 2); assert.ok(!m.openByDefault, `${OPEN_BELOW} done → starts folded (answer first)`);
  m = model('buyResale', { ...st, ui: { ...st.ui, priorities: ['price'] } }, comparer(3));
  assert.ok(m.steps[2].done, 'ticks in "What matters most to you?" = compared');
  m = model('buyResale', { ...st, focus: { source: 'choice', price: 600000, choiceId: 1 } }, comparer(3));
  assert.ok(m.steps[2].done && m.steps[3].done && m.allDone, '"Afford this" from My choices = compared + checked');
  assert.equal(m.next, -1); assert.ok(!m.openByDefault);
});

test('BTO vs resale, sell and upgrade, rent, retire, explore: done from their own inputs', () => {
  const h = { ...defaults().household, buyers: [buyer({ age: 62, income: 0, cpfOa: 20000 })] };
  const plan = (o) => ({ ...defaults().plan, ...o });
  // BTO vs resale
  let m = model('btoVsResale', state({ household: h, focus: { source: 'block', price: 500000 }, plan: plan({ btoPrices: { 'typed|4 ROOM': 400000 } }) }));
  assert.ok(m.allDone, 'household, a resale flat in focus and a BTO price → result ready');
  assert.ok(!model('btoVsResale', state({ plan: plan({ btoPrices: { 'typed|4 ROOM': null } }) })).steps[2].done);
  assert.ok(model('btoVsResale', state({ plan: plan({ btoId: 'Tengah Grove' }) })).steps[2].done, 'a project picked');
  // sell and upgrade
  m = model('sellUpgrade', state({ plan: plan({ current: { ...defaults().plan.current, owns: true } }) }));
  assert.deepEqual(m.steps[1].go, { tab: 'plan', section: 'planSellBuy', focus: 'plan.current.salePrice' });
  assert.equal(model('sellUpgrade').steps[1].go.focus, 'plan.current.owns', 'not ticked yet → the tick box');
  m = model('sellUpgrade', state({ focus: { price: 700000 }, plan: plan({ current: { ...defaults().plan.current, owns: true, salePrice: 550000 } }) }));
  assert.ok(m.steps[1].done && m.steps[2].done && m.steps[3].done, 'sale + next flat → the timeline shows');
  // rent: the one rent figure (plan.rent.amount, else plan.rentNow)
  m = model('rent', state({ plan: plan({ rent: { ...defaults().plan.rent, amount: 2800 } }) }));
  assert.ok(m.steps[0].done && !m.steps[1].done); assert.equal(m.page, 'rent');
  assert.deepEqual(m.steps[2].go, { fill: 'household', field: 'buyers.0.age' }, 'household empty → About you');
  assert.ok(model('rent', state({ plan: plan({ rentNow: 2500 }) })).steps[0].done);
  // retire: ages + a CPF balance (foreigners have none)
  m = model('retire', state({ household: { ...defaults().household, buyers: [buyer({ age: 62 }), buyer({ age: 60, citizenship: 'F' })] } }));
  assert.ok(!m.steps[0].done, 'buyer 1 has no CPF balance yet');
  assert.deepEqual(m.steps[0].go, { fill: 'household', field: 'buyers.0.cpfOa' });
  m = model('retire', state({ household: h }));
  assert.ok(m.steps[0].done && m.steps[1].done && !m.steps[3].done);
  assert.equal(m.steps[3].go.section, 'planSeniors');
  // explore: on My choices
  m = model('explore', state(), comparer(1, 1));
  assert.deepEqual(m.steps.map((s) => s.id), ['flats', 'places', 'compare', 'about']);
  assert.ok(m.steps[1].done && !m.steps[0].done); assert.equal(m.page, 'choices');
});

test('the Plan sections and Rent anchors the steps scroll to exist', () => {
  const plan = ['cpf', 'sellbuy', 'seniors', 'bto', 'contra'].map((f) => src(`modules/plan/${f}.js`)).join('\n');
  const rent = src('modules/rent/index.js') + src('modules/rent/rules.js');
  const all = GOALS.flatMap((g) => stepsFor(g, factsFrom(state()), defaults().household));
  for (const s of all) {
    if (s.go.section) assert.match(plan, new RegExp(`id="${s.go.section}"`), s.go.section);
    if (s.go.anchor && s.go.tab === 'rent') assert.match(rent, new RegExp(`id="${s.go.anchor}"`), s.go.anchor);
    if (s.go.anchor && s.go.tab === 'plan') assert.match(plan, new RegExp(`id="${s.go.anchor}"`), s.go.anchor);
    if (s.go.focus) assert.match(src('modules/plan/sellbuy.js'), new RegExp(`data-p="${s.go.focus.replace(/\./g, '\\.')}"`), s.go.focus);
  }
  assert.match(src('index.html'), /id="affordRoot"/);
});

test('card: a fold with numbered steps, ✓ as text when done, one Next button, Hide; no progress bar or %', () => {
  const st = state({ household: { ...defaults().household, buyers: [buyer({ age: 30, income: 5000 })] } });
  const m = model('buyResale', st, comparer(3));
  const html = cardHtml(m, { open: true });
  assert.match(html, /^<details class="section fold jr-card" data-fold="journey" open>/);
  assert.match(html, /<span class="fold-t">Your steps: buy a resale flat<\/span>/);
  assert.equal((html.match(/<li class="jr-step/g) || []).length, 4);
  assert.equal((html.match(/>✓</g) || []).length, 2);
  assert.match(html, /<span class="jr-sr"> \(done\)<\/span>/);
  assert.match(html, /<li class="jr-step next"><button type="button" class="jr-go" data-jr-step="2"><span class="jr-k" aria-hidden="true">3<\/span>/);
  assert.match(html, /Add 2–3 flats you like \(3 added\)/);
  assert.match(html, /class="btn primary jr-next" data-jr-step="2">Next step: Compare them</);
  assert.match(html, /data-fill="household" data-field="buyers\.0\.age"|data-fill="household" data-field="buyers\.0\.income"/);
  assert.match(html, /data-jr="hide">Hide these steps</);
  assert.doesNotMatch(html, /progress|%|<meter/i);
  assert.doesNotMatch(cardHtml(m), / open>/);
  const done = model('buyResale', { ...st, focus: { source: 'choice', price: 600000 } }, comparer(3));
  const h2 = cardHtml(done, { open: true });
  assert.doesNotMatch(h2, /jr-next/); assert.match(h2, /<p class="jr-all">All steps done\.<\/p>/);
  assert.equal(nextText(done), 'All steps done.');
  assert.equal(goAttrs({ fill: 'places' }, 1), 'data-fill="places"');
  assert.equal(goAttrs({ tab: 'plan' }, 2), 'data-jr-step="2"');
});

test('hidden line, Menu rows and Learn line', () => {
  assert.match(hiddenHtml({ phone: true }), /Menu → My goal\. <button type="button" class="link" data-jr="unhide">Show them again</);
  assert.match(hiddenHtml(), /Learn → My goal/);
  const rows = menuRowsHtml('rent');
  assert.match(rows, /^<ul class="pm-list jr-menu">/);
  assert.match(rows, /data-jr="show"><span class="pm-l">My goal: Rent a home<small>Show my steps<\/small>/);
  assert.match(rows, /data-jr="change">Change my goal</);
  assert.doesNotMatch(rows, /data-act=/, 'the Menu\'s own click handler ignores these rows');
  assert.match(menuRowsHtml(null), /data-jr="change"><span class="pm-l">My goal<small>Not chosen yet — choose one/);
  assert.doesNotMatch(menuRowsHtml(null), /data-jr="show"/);
  assert.match(learnLineHtml('retire'), /^My goal: Plan for retirement · <button[^>]*data-jr="show">Show my steps<\/button> · <button[^>]*data-jr="change">/);
});

test('the only write is ui.journey (Hide / Show my steps); no localStorage write, no request', () => {
  const code = ['index.js', 'steps.js', 'view.js'].map((f) => src(`modules/journey/${f}`)).join('\n');
  const writes = [...code.matchAll(/store\.set\(\s*'([^']+)'/g)].map((x) => x[1]);
  assert.deepEqual([...new Set(writes)], ['ui.journey']);
  assert.doesNotMatch(code, /setItem|removeItem|fetch\(|XMLHttpRequest|sendBeacon|console\./);
  assert.doesNotMatch(code, /from '\.\.\/(?!\.\.\/)(?!journey)/, 'imports only core/ (and its own files)');
  for (const f of ['index.js', 'steps.js', 'view.js']) assert.ok(src(`modules/journey/${f}`).split('\n').length < 400, f);
});

test('CSS: the P8 8e block has no transition / animation and phone rules sit in the phone media query', () => {
  const css = src('styles/modules.css');
  const block = css.slice(css.indexOf('/* P8 8e'));
  assert.ok(block.length > 100);
  const end = block.indexOf('\n/* ', 10);
  const own = (end > 0 ? block.slice(0, end) : block).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(own, /transition|animation/);
  assert.match(own, /@media screen and \(max-width: 767px\)/);
  for (const m of own.matchAll(/font-size:\s*([^;}]+)/g)) assert.match(m[1].trim(), /^[\d.]+rem$/);
});

test('中文: every goal-steps string has an entry', () => {
  const read = (p) => JSON.parse(readFileSync(new URL(p, app), 'utf8'));
  const staged = (existsSync(new URL('i18n/staging/', app)) ? readdirSync(new URL('i18n/staging/', app)) : []).filter((f) => f.endsWith('.json')).map((f) => read(`i18n/staging/${f}`));
  const dict = Object.assign({}, ...['zh', 'zh-explore', 'zh-engine', 'zh-guide'].map((n) => read(`i18n/${n}.json`)), ...staged);
  assert.deepEqual([...stepStrings(), ...viewStrings()].filter((k) => !dict[k]), []);
});
