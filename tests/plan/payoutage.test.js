// Phase 7 A10 — CPF numbers for people already at the CPF LIFE payout age (cpf.age.life_payout): no work
// assumption, no "RA at 55", no projection from the payout age; the payout they enter is used instead — in
// Plan → CPF & retirement, engine/cpfpayout.js and the Compare "CPF LIFE at 65" row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lifePayoutDelta, payoutReadiness, PAYOUT_REASONS } from '../../app/engine/cpfpayout.js';
import { buyerProjection, atPayoutAge, enteredPayout } from '../../app/engine/cpfbuy.js';
import { cpfSection } from '../../app/modules/plan/cpf.js';
import { cellHtml, createCpfLife } from '../../app/modules/explore/cpflife.js';
import { CPF_DEFAULTS } from '../../app/core/cpf-defaults.js';
import { policy } from '../helpers.js';

const A65 = policy.get('cpf.age.life_payout');
const YEAR = 2026;
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const hh = (buyers) => ({ scheme: 'family', firstTimer: false, parents: 'none', propertiesOwned: 1, loan: 'hdb', tenure: 10, otherDebts: 0, cash: 150000, grantsOverride: null, buyers });
// P4 — Mr Lim (66) and Mrs Lim (63)
const mrLim = (o = {}) => ({ age: 66, income: 0, citizenship: 'SC', cpfOa: 30000, cpfRa: 190000, ...o });
const mrsLim = { age: 63, income: 0, citizenship: 'SC', cpfOa: 30000, cpfRa: 190000 };
const flat = { price: 450000, flatType: '3 ROOM', remainingLease: 70 };
const run = (household) => lifePayoutDelta({ household, flat, defaults: CPF_DEFAULTS, year: YEAR }, policy);
const plan = (h, f = { source: 'price', label: 'Sengkang 3-room', ...flat }) => cpfSection({ h, tf: f, plan: { cpf: {} }, policy, today: '2026-10-07' });

test('helpers: payout age from policy; entered payout optional', () => {
  assert.equal(atPayoutAge({ age: A65 }, policy), true);
  assert.equal(atPayoutAge({ age: A65 - 1 }, policy), false);
  assert.equal(atPayoutAge({ age: null }, policy), false);
  assert.equal(enteredPayout({ cpfLifeMonthly: '' }), null);
  assert.equal(enteredPayout({ cpfLifeMonthly: 1020 }), 1020);
});

test('engine: a 66-year-old alone — not projected; no payout entered → reason atpayout; entered → no change', () => {
  const none = run(hh([mrLim()]));
  assert.deepEqual([none.ok, none.reason, none.buyer, none.message], [false, 'atpayout', 0, PAYOUT_REASONS.atpayout]);
  const typed = run(hh([mrLim({ cpfLifeMonthly: 1020 })]));
  assert.equal(typed.ok, true); assert.equal(typed.allAtPayout, true);
  assert.deepEqual([typed.without.monthly, typed.withBuy.monthly, typed.delta], [1020, 1020, 0]);
  assert.deepEqual(typed.atPayout, [0]); assert.deepEqual(typed.payoutMissing, []);
  // balances are not needed at the payout age
  assert.equal(payoutReadiness(hh([mrLim({ cpfOa: null, cpfRa: null })]), policy), null);
  assert.equal(payoutReadiness(hh([mrLim({ cpfOa: null, cpfRa: null })])).reason, 'nobalances', 'old call without policy unchanged');
});

test('engine: mixed couple (66 + 63) — the 63-year-old is projected, the 66-year-old counts as entered (delta 0)', () => {
  const p63 = buyerProjection({ buyers: [mrLim(), mrsLim], i: 1, plan: null, settings: {}, defaults: CPF_DEFAULTS, year: YEAR }, policy);
  const missing = run(hh([mrLim(), mrsLim]));
  assert.equal(missing.ok, true); assert.equal(missing.allAtPayout, false);
  assert.deepEqual(missing.payoutMissing, [0]);
  assert.deepEqual(missing.buyers.map((b) => b.i), [1]);
  assert.equal(missing.without.monthly, p63.without.life.monthly);
  const both = run(hh([mrLim({ cpfLifeMonthly: 1020 }), mrsLim]));
  assert.deepEqual(both.payoutMissing, []);
  assert.equal(both.without.monthly, 1020 + p63.without.life.monthly);
  assert.equal(both.buyers.find((b) => b.i === 0).delta, 0);
  assert.equal(both.delta, missing.delta, 'only the projected buyer changes');
});

test('Plan → CPF, 66-year-old: no "employed until 65", no "from 65", no RA at 55; asks for the payout', () => {
  const html = plan(hh([mrLim()]));
  const txt = strip(html);
  assert.doesNotMatch(txt, new RegExp(`until ${A65}`));
  assert.doesNotMatch(txt, new RegExp(`from ${A65}`));
  assert.doesNotMatch(txt, /Retirement Account at 55|RA at 55|already past 55/);
  assert.doesNotMatch(html, /<table class="mini pro-only"><thead><tr><th>Age/, 'no year-by-year projection');
  assert.doesNotMatch(html, /plan\.cpf\.wageGrowth/, 'no pay-rise assumption');
  assert.match(txt, /You may already receive CPF LIFE — enter your monthly payout \(optional\)/);
  assert.match(html, /data-p="household\.buyers\.0\.cpfLifeMonthly"/);
  const typed = strip(plan(hh([mrLim({ cpfLifeMonthly: 1020 })])));
  assert.match(typed, /CPF LIFE you receive, per month S\$1,020/);
  assert.match(typed, /Household CPF LIFE you receive S\$1,020 a month/);
  assert.match(typed, /no change: payouts have started/);
});

test('Plan → CPF, mixed couple: the 63-year-old keeps the projection; work assumption only for buyers below the payout age', () => {
  const txt = strip(plan(hh([mrLim(), mrsLim])));
  assert.match(txt, new RegExp(`Estimates for buyers below ${A65}: income stays employed until ${A65}`));
  assert.doesNotMatch(txt, /^Estimates: income stays/);
  assert.match(txt, /Not counted: the payout of Buyer 1 \(not entered\)/);
  assert.equal((txt.match(/You may already receive CPF LIFE/g) || []).length, 1);
});

test('Compare "CPF LIFE at 65" row: no projection for a 66-year-old', () => {
  assert.match(cellHtml({ ok: false, reason: 'atpayout', buyer: 0 }), /data-fill="household" data-field="buyers\.0\.cpfLifeMonthly"/);
  const store = (household) => ({ get: (k) => ({ household, plan: { cpf: {} } }[k]), subscribe: () => () => {} });
  const D = { flat_types: ['1 ROOM', '2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE'] };
  const m = { c: { price: 450000, ft: 2 }, leaseNow: 70 };
  const rowOf = (h) => createCpfLife({ policy, store: store(h), bus: { emit() {} }, D, year: () => YEAR }).row();
  const none = rowOf(hh([mrLim()]));
  assert.match(strip(none.f(m)), /— Add your CPF LIFE payout →/);
  assert.equal(none.v(m), null);
  const typed = rowOf(hh([mrLim({ cpfLifeMonthly: 1020 })]));
  assert.match(strip(typed.f(m)), /no change: payouts have started S\$1,020\/mo you entered/);
  assert.equal(typed.v(m), 0);
});

test('中文: every A10 string has an entry with the same placeholders', () => {
  const read = (f) => JSON.parse(readFileSync(new URL(`../../app/i18n/${f}`, import.meta.url), 'utf8'));
  const ph = (s) => (s.match(/\{\d\}/g) || []).sort().join();
  const want = {
    'zh.json': ['You may already receive CPF LIFE — enter your monthly payout (optional).', 'CPF LIFE payout you receive (S$ a month, optional)', 'CPF LIFE you receive, per month',
      'not entered', 'as you entered', 'no change: payouts have started', 'Household CPF LIFE you receive', 'Not counted: the payout of {0} (not entered).',
      'This flat uses about {0} of OA upfront from this buyer; OA savings do not change a CPF LIFE payout that has started.',
      'CPF LIFE payouts that have started do not change when you buy; OA savings can still go into the flat. Not a CPF quote — use the CPF planners for decisions.',
      'Estimates for buyers below {0}: income stays employed until {0}, rises by the pay rise above; CPF LIFE premiums, top-ups and the CPF LIFE set-aside are not modelled. Not a CPF quote — use the CPF planners for decisions.'],
    'zh-explore.json': ['no change: payouts have started', '{0}/mo you entered'],
    'zh-engine.json': [PAYOUT_REASONS.atpayout],
  };
  for (const [file, keys] of Object.entries(want)) {
    const d = read(file);
    for (const k of keys) {
      assert.ok(d[k], `${file} missing: ${k}`);
      assert.equal(ph(d[k]), ph(k), `${file} placeholders: ${k}`);
    }
  }
});
