// Named scenarios (Phase 6b, AC 6) — Sev-1: a scenario saved from the current state must recompute to exactly
// the numbers the Afford, Rent & Buy and Plan tabs show for that state (same engine calls, no stored results).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scenarioResults, snapshotOf, focusFromSnapshot, rentBuyFor, flatInput, costInput } from '../../app/engine/scenario.js';
import { buyerProjection, raAt55WithPurchase, housingShares } from '../../app/engine/cpfbuy.js';
import { simulate } from '../../app/engine/cpf.js';
import { planPurchase } from '../../app/engine/plan.js';
import { monthlyCost } from '../../app/engine/monthly-cost.js';
import { rentVsBuy, scenarios as presets } from '../../app/engine/rentbuy.js';
import { costInput as affordCostInput } from '../../app/modules/afford/monthly.js';
import { CPF_DEFAULTS } from '../../app/core/cpf-defaults.js';
import { policy } from '../helpers.js';

const YEAR = 2026, OPTS = { year: YEAR, horizonYears: 10, cpfDefaults: CPF_DEFAULTS };
const hh = (o = {}) => ({
  scheme: 'family', firstTimer: true, parents: 'none', propertiesOwned: 0, loan: 'hdb', tenure: 25, otherDebts: 0,
  cash: 60000, grantsOverride: null,
  buyers: [{ age: 30, income: 5000, citizenship: 'SC', cpfOa: 60000 }, { age: 32, income: 4000, citizenship: 'SC', cpfOa: 40000 }], ...o,
});
const block = { source: 'block', bid: 1234, label: 'Blk 1 — median of recent sales', price: 720000, flatType: '4 ROOM', remainingLease: 78.4 };
const choice = { source: 'choice', choiceId: 'c1', bid: 7, label: 'My pick', price: 655000, flatType: '5 ROOM', remainingLease: 70, cov: 15000, annualValue: 26400 };
const typical = { source: 'typical', isDefault: true, price: 600000, flatType: '3 ROOM', n: 120, from: '2025-10', to: '2026-09', scope: { kind: 'towns', towns: ['BISHAN'], label: 'Bishan' }, label: 'Typical 3-room in Bishan', remainingLease: null };
const bankPr = hh({ loan: 'bank', tenure: 20, otherDebts: 800, buyers: [{ age: 40, income: 9000, citizenship: 'PR', prYears3Plus: true, cpfOa: 90000 }] });

/** Save → JSON (as localStorage would) → read back. */
const saved = (flat, household, rent = 2900, plan = { cpf: {} }) => JSON.parse(JSON.stringify(snapshotOf({ id: 'A', name: 'A', savedAt: '2026-10-07T00:00:00Z', flat, household, plan, marketRent: rent })));

/** What the Afford tab computes for (household, flat on screen, market rent) — copied call for call from modules/afford. */
function affordNumbers(h, tf, rent) {
  const p = planPurchase({ household: h, flat: { price: tf.price, flatType: tf.flatType || '4 ROOM', remainingLease: tf.remainingLease ?? null, cov: tf.cov || 0 } }, policy);
  const c = p.chosen;
  const cost = monthlyCost(affordCostInput({ plan: p, focus: tf, household: h, market: rent ? { rent, flatType: tf.flatType } : null, policy }), policy);
  return { p, c, cost };
}

for (const [name, flat, h] of [['block, HDB loan', block, hh()], ['shortlisted flat with COV + typed AV', choice, hh()], ['typical flat', typical, hh()], ['PR bank loan, 20 y, debts', block, bankPr]]) {
  test(`Sev-1: scenario recomputes to exactly the Afford numbers — ${name}`, () => {
    const a = affordNumbers(h, flat, 2900);
    const r = scenarioResults(saved(flat, h), policy, OPTS);
    assert.equal(r.price, a.p.price);
    assert.equal(r.loanType, a.c.loanType);
    assert.equal(r.upfront.net, a.c.funding.net);
    assert.equal(r.upfront.cash, a.c.funding.cashNeeded);
    assert.equal(r.upfront.cpf, a.c.funding.cpfUsed);
    assert.equal(r.monthly, a.c.monthly);
    assert.equal(r.msr, a.c.msrAssessed);
    assert.equal(r.tdsr, a.c.tdsr);
    assert.equal(r.verdict, a.p.verdict.status);
    assert.equal(r.monthlyCost.total, a.cost.total);
    assert.equal(r.oaLeft, Math.max(0, a.p.summary.cpfOa + a.p.grants.total - a.c.funding.cpfUsed));
    assert.ok(Number.isFinite(r.monthly) && r.monthly > 0);
  });
}

test('afford/monthly.js costInput is the engine one (one input for both)', () => {
  assert.equal(affordCostInput, costInput);
  assert.deepEqual(flatInput(choice), { price: 655000, flatType: '5 ROOM', remainingLease: 70, cov: 15000 });
});

test('Sev-1: rent vs buy is the Rent & Buy tab call (base assumptions, no COV, 10 years)', () => {
  const h = hh(), rent = 2900, f = choice;
  // copied from modules/rent/index.js rentBuySection
  const plan = planPurchase({ household: h, flat: { price: f.price, flatType: f.flatType, remainingLease: f.remainingLease } }, policy);
  const o = plan.chosen;
  const mc = monthlyCost({ flatType: f.flatType, price: f.price, loan: { amount: o.loan, rate: o.rate, years: o.tenure || 1 }, marketMonthlyRent: rent }, policy);
  const owner = mc.total - (mc.items.find((i) => i.id === 'mortgage')?.monthly || 0);
  const want = rentVsBuy({ horizonYears: 10, buy: { price: f.price, flatType: f.flatType, loanType: o.loanType, loanAmount: o.loan, rate: o.rate, tenure: o.tenure || 1, upfrontCash: o.funding.cashNeeded, upfrontCpf: o.funding.cpfUsed, monthlyOwnerCosts: owner }, rent: { monthlyRent: rent }, assumptions: presets(policy).base }, policy);
  assert.deepEqual(rentBuyFor({ household: h, flat: f, rent, horizonYears: 10 }, policy), want);
  const r = scenarioResults(saved(f, h, rent), policy, OPTS);
  assert.equal(r.rentBuy.advantage, want.horizon.advantage);
  assert.equal(r.rentBuy.breakEvenYear, want.breakEvenYear);
  assert.equal(r.rentBuy.year, 10);
});

test('Sev-1: CPF at 55 is the Plan tab projection (buyerProjection = the old inline calls)', () => {
  const h = hh({ buyers: [{ age: 30, income: 5000, citizenship: 'SC', cpfOa: 60000, cpfSa: 20000 }, { age: 32, income: 4000, citizenship: 'PR', prYears3Plus: false, cpfOa: 40000 }] });
  const settings = { wageGrowth: 0.02, bonusMonths: null, prYear: { 1: 'PR3+' } };
  // Plan tab: plan without COV; scenario: Afford plan with COV — CPF use and instalment are the same
  const planTab = planPurchase({ household: h, flat: { price: choice.price, flatType: choice.flatType, remainingLease: choice.remainingLease } }, policy);
  const r = scenarioResults(saved(choice, h, null, { cpf: settings }), policy, OPTS);
  let sum = 0;
  h.buyers.forEach((b, i) => {
    // the pre-refactor modules/plan/cpf.js code, inline
    const residency = b.citizenship === 'PR' ? (settings.prYear[i] || (b.prYears3Plus === false ? 'PR2' : 'PR3+')) : 'SC';
    const A65 = policy.get('cpf.age.life_payout');
    const base = { startAge: b.age, endAge: Math.max(b.age, A65), startYear: YEAR, residency, balances: { oa: b.cpfOa || 0, sa: b.cpfSa || 0, ma: 0, ra: 0 }, wage: { monthly: b.income, growth: 0.02, bonusMonths: 1, untilAge: A65 } };
    const perYear = (y) => (y <= YEAR ? policy : policy.forYear(y));
    const share = housingShares(h.buyers, i, planTab);
    const withBuy = simulate({ ...base, housing: { oaUpfront: share.oaUpfront, monthlyFromOa: share.monthlyFromOa, untilAge: b.age + share.tenure } }, perYear);
    const p = buyerProjection({ buyers: h.buyers, i, plan: planTab, settings, defaults: CPF_DEFAULTS, year: YEAR }, policy);
    assert.deepEqual(p.withBuy, withBuy);
    assert.deepEqual(p.without, simulate(base, perYear));
    assert.equal(p.residency, residency);
    sum += withBuy.at55.raFormed;
  });
  assert.equal(r.cpf55.total, sum);
  assert.equal(raAt55WithPurchase({ household: h, plan: planTab, settings, defaults: CPF_DEFAULTS, year: YEAR }, policy).total, sum);
});

test('CPF at 55: foreigners and buyers past 55 are left out; none → null', () => {
  const plan = planPurchase({ household: hh(), flat: flatInput(block) }, policy);
  const mixed = { buyers: [{ age: 30, income: 5000, citizenship: 'SC', cpfOa: 50000 }, { age: 31, income: 6000, citizenship: 'F', cpfOa: null }, { age: 60, income: 3000, citizenship: 'SC', cpfOa: 10000 }] };
  const r = raAt55WithPurchase({ household: mixed, plan, defaults: CPF_DEFAULTS, year: YEAR }, policy);
  assert.deepEqual(r.buyers.map((b) => b.reason), [null, 'foreigner', 'past55']);
  assert.ok(r.total > 0);
  const none = scenarioResults(saved(block, hh({ buyers: [{ age: null, income: 5000, citizenship: 'SC' }] })), policy, OPTS);
  assert.equal(none.cpf55, null);
});

test('snapshot: deep copies (later edits never change it), focus fields kept, no computed numbers stored', () => {
  const h = hh(), plan = { cpf: { wageGrowth: 0.04, prYear: {} }, current: { owns: true } };
  const s = snapshotOf({ id: 'B', name: 'B: Bishan 4R S$720k', savedAt: 'x', flat: block, town: 'BISHAN', household: h, plan, marketRent: 2900 });
  h.buyers[0].income = 1; h.loan = 'bank'; plan.cpf.wageGrowth = 0.09;
  assert.equal(s.household.buyers[0].income, 5000);
  assert.equal(s.household.loan, 'hdb');
  assert.equal(s.household.tenure, 25);
  // Phase 7a A2: the home being sold travels with the scenario while "I own a home now and will sell it" is ticked
  assert.deepEqual(s.plan, { cpf: { wageGrowth: 0.04, prYear: {} }, current: { owns: true } });
  assert.deepEqual(snapshotOf({ id: 'C', name: 'C', savedAt: 'x', flat: block, household: h, plan: { cpf: {}, current: { owns: false, salePrice: 500000 } } }).plan, { cpf: {} });
  assert.deepEqual(s.focus, { source: 'block', bid: 1234, label: block.label, price: 720000, flatType: '4 ROOM', remainingLease: 78.4, isDefault: false, town: 'BISHAN' });
  assert.deepEqual(s.market, { rent: 2900 });
  assert.deepEqual(Object.keys(s).sort(), ['focus', 'household', 'id', 'market', 'name', 'plan', 'savedAt']);
  assert.equal(snapshotOf({ id: 'A', name: 'A', savedAt: 'x', flat: block, household: h }).market.rent, null);
});

test('load: a typical flat comes back as your own figures (same price, type, scope); a block stays a block', () => {
  const t = focusFromSnapshot(saved(typical, hh()));
  assert.equal(t.source, 'price');
  assert.equal(t.price, 600000);
  assert.equal(t.flatType, '3 ROOM');
  assert.deepEqual(t.scope, typical.scope);
  assert.equal('isDefault' in t, false);
  assert.equal('n' in t, false);
  const b = focusFromSnapshot(snapshotOf({ id: 'A', name: 'A', savedAt: 'x', flat: block, town: 'BISHAN', household: hh() }));
  assert.equal(b.source, 'block');
  assert.equal(b.bid, 1234);
  assert.equal('town' in b, false);
  // after loading, the Afford tab works on the restored focus → the same numbers as the scenario
  const r = scenarioResults(saved(choice, hh()), policy, OPTS);
  const again = affordNumbers(hh(), focusFromSnapshot(saved(choice, hh())), 2900);
  assert.equal(again.c.monthly, r.monthly);
  assert.equal(again.cost.total, r.monthlyCost.total);
});

test('missing inputs: no rent → no rent vs buy and no property-tax estimate; no CPF OA → OA left unknown', () => {
  const r = scenarioResults(saved(block, hh({ buyers: [{ age: 30, income: 5000, citizenship: 'SC' }] }), null), policy, OPTS);
  assert.equal(r.rentBuy, null);
  assert.equal(r.monthlyCost.noTax, true);
  assert.equal(r.oaLeft, null);
  const noIncome = scenarioResults(saved(block, hh({ buyers: [{ age: 30, citizenship: 'SC', cpfOa: 1000 }] })), policy, OPTS);
  assert.equal(noIncome.msr, null);
  assert.notEqual(noIncome.verdict, 'ok');
});
