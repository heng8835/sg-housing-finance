// Phase 7a engine fixes in planPurchase (phase7-user-feedback.md §3 A2, A3, A4, A11; DEC-016 Q2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPurchase } from '../../app/engine/plan.js';
import { budget } from '../../app/engine/budget.js';
import { saleInput } from '../../app/engine/salefunds.js';
import { policy, mergedDoc, close } from '../helpers.js';

// P1-like: Aisha (29) & Wei Jie (31), SC first-timers, S$7,500, OA S$83k, cash S$30k, parents near
const p1 = (o = {}) => ({
  scheme: 'family', firstTimer: true, parents: 'near', propertiesOwned: 0, loan: 'hdb', tenure: 25, otherDebts: 0, cash: 30000, grantsOverride: null,
  buyers: [{ age: 29, income: 4200, citizenship: 'SC', cpfOa: 45000 }, { age: 31, income: 3300, citizenship: 'SC', cpfOa: 38000 }], ...o,
});
// P2-like: Kok Wee (44, SC) & Rachel (42, PR), second-timers owning a 4-room, S$12,500, cash S$80k
const p2 = (o = {}) => ({
  scheme: 'family', firstTimer: false, parents: 'none', propertiesOwned: 1, loan: 'hdb', tenure: 25, otherDebts: 0, cash: 80000, grantsOverride: null,
  buyers: [{ age: 44, income: 7000, citizenship: 'SC', cpfOa: 60000 }, { age: 42, income: 5500, citizenship: 'PR', cpfOa: 40000 }], ...o,
});
const flat = (price, remainingLease = 80, o = {}) => ({ price, flatType: '4 ROOM', remainingLease, cov: 0, ...o });
const r2 = (v) => Math.round(v * 100) / 100;

// numbers every money screen shows, for the "sale off = today" check
const shown = (p) => ({
  loan: r2(p.chosen.loan), monthly: r2(p.chosen.monthly), tenure: p.chosen.tenure, net: r2(p.chosen.funding.net), cashNeeded: r2(p.chosen.funding.cashNeeded),
  cpfUsed: r2(p.chosen.funding.cpfUsed), cashShort: r2(p.chosen.funding.cashShort), grants: p.grants.total, absd: p.absd.amount, maxPrice: p.budget.maxPrice,
});

// ---------------------------------------------------------------- A2 sale off → today's numbers
test('A2: no sale (absent, null, or Plan box unticked / no price) gives exactly the numbers of Phase 6d', () => {
  // captured from Phase 6d planPurchase (before Phase 7a) for the same inputs
  const today = {
    p1: { loan: 491250, monthly: 2228.65, tenure: 25, net: 56200, cashNeeded: 5200, cpfUsed: 176000, cashShort: 0, grants: 125000, absd: 0, maxPrice: 693857 },
    p2: { loan: 491250, monthly: 2445.4, tenure: 22, net: 377700, cashNeeded: 277700, cpfUsed: 100000, cashShort: 197700, grants: 0, absd: 196500, maxPrice: 313336 },
  };
  for (const [name, h, f] of [['p1', p1(), flat(655000, 80)], ['p2', p2(), flat(655000, null)]]) {
    const base = planPurchase({ household: h, flat: f }, policy);
    assert.deepEqual(shown(base), today[name], name);
    const off = [null, saleInput({ current: { owns: false, salePrice: 527000 } }, 2026), saleInput({ current: { owns: true, salePrice: null } }, 2026), saleInput(null, 2026)];
    for (const sale of off) {
      const p = planPurchase({ household: h, flat: f, sale }, policy);
      assert.equal(JSON.stringify(p), JSON.stringify(base), `${name}: sale ${JSON.stringify(sale)}`);
      assert.equal(p.sale, null);
    }
  }
});

// ---------------------------------------------------------------- A2 sale on
const p2Sale = (mode = null, o = {}) => saleInput({ current: { owns: true, propertyType: 'hdb', flatType: '4 ROOM', salePrice: 527000, outstandingLoan: 120000, cpfUsed: 150000, accruedInterest: 38000, mode, ...o } }, 2026);

test('A2: P2 contra — sale cash + CPF refund counted, second-HDB-loan rule caps the loan, ABSD gone (old flat sold)', () => {
  const f = flat(800000, 70, { flatType: '5 ROOM' });
  const before = planPurchase({ household: p2(), flat: f }, policy);
  assert.equal(before.verdict.status, 'no');
  assert.equal(before.chosen.funding.cashShort, 281800);
  const p = planPurchase({ household: p2(), flat: f, sale: p2Sale() }, policy);
  assert.equal(p.sale.mode, 'contra');
  assert.equal(p.sale.cpf, 188000); // principal 150k + typed interest 38k back to OA
  assert.ok(close(p.funds.cpfOa, 100000 + 188000));
  assert.ok(close(p.funds.cash, 80000 + p.sale.cash));
  assert.equal(Math.round(p.chosen.loan), 509270);
  assert.ok(p.chosen.saleCap.reducedBy > 0);
  assert.equal(p.absd.amount, 0);
  assert.equal(p.chosen.funding.cashShort, 0);
  assert.equal(p.verdict.status, 'ok');
  assert.ok(p.budget.maxPrice >= f.price);
});

test('A2: buy first — sale money not counted yet, ABSD remitted upfront (HDB sell-within rule) with the note', () => {
  const f = flat(800000, 70, { flatType: '5 ROOM' });
  const p = planPurchase({ household: p2(), flat: f, sale: p2Sale('buy-first') }, policy);
  assert.equal(p.sale.usable, false);
  assert.equal(p.sale.cash, 0);
  assert.equal(p.funds.cash, 80000);
  assert.equal(p.chosen.loan, 600000);
  assert.equal(p.absd.amount, 0);
  assert.equal(p.absd.remitted, true);
  assert.ok(p.absd.remittedAmount > 0);
  assert.match(p.absd.note, /remitted upfront.*within 6 months/);
  assert.equal(p.chosen.funding.cashShort, 41800);
  assert.equal(p.verdict.status, 'no');
});

test('A2: accrued interest left blank — counted only via the estimate, flagged as uncertain', () => {
  const f = flat(800000, 70, { flatType: '5 ROOM' });
  const unknown = planPurchase({ household: p2(), flat: f, sale: p2Sale(null, { accruedInterest: null }) }, policy);
  assert.equal(unknown.sale.cashUncertain, true);
  assert.equal(unknown.sale.accruedSource, 'unknown');
  assert.equal(unknown.sale.cpf, 150000);
  const est = planPurchase({ household: p2(), flat: f, sale: p2Sale(null, { accruedInterest: null, boughtYear: 2012 }) }, policy);
  assert.equal(est.sale.accruedSource, 'estimate');
  assert.ok(est.sale.cpf > 150000);
});

// ---------------------------------------------------------------- A3 smaller loan
test('A3: P1 S$655k — full loan fails MSR but a smaller loan fits: tight, one line with both loans and the extra', () => {
  const p = planPurchase({ household: p1(), flat: flat(655000, 80) }, policy);
  assert.equal(p.chosen.msrOk, false);
  assert.equal(p.verdict.status, 'tight');
  assert.ok(p.verdict.codes.includes('smaller-loan'));
  assert.ok(!p.verdict.codes.includes('msr'));
  const line = p.verdict.reasons[p.verdict.codes.indexOf('smaller-loan')];
  assert.match(line, /^Possible with a smaller loan: borrow S\$474,472 \(not S\$491,250\) and pay S\$16,778 more from cash or CPF/);
  assert.ok(p.smallerLoan.funding.cashShort === 0 && p.smallerLoan.fits === true);
  assert.ok(p.budget.maxPrice >= 655000);
});

test('A3: smaller loan that still does not fit the cash → no; cash unknown → unknown with "add your savings"', () => {
  const big = planPurchase({ household: p1(), flat: flat(655000, 80, { cov: 30000 }) }, policy);
  assert.equal(big.verdict.status, 'no');
  assert.ok(big.verdict.codes.includes('msr'));
  const noCash = planPurchase({ household: p1({ cash: null }), flat: flat(655000, 80, { cov: 30000 }) }, policy);
  assert.ok(noCash.verdict.codes.includes('smaller-loan-unknown'));
  assert.ok(!noCash.verdict.reasons.some((r) => /Short of/.test(r)));
});

test('A3: budget() honours the remaining lease (tenure capped), as the verdict does', () => {
  const x = { income: 7500, loanType: 'hdb', tenure: 25, averageAge: 30, cash: 30000, cpfOa: 83000, grants: 125000, fees: 3000, hdbFees: 0, fundsKnown: true };
  const long = budget({ ...x, remainingLease: 80 }, policy), short = budget({ ...x, remainingLease: 40 }, policy);
  assert.equal(long.tenure, 25);
  assert.equal(short.tenure, 20);
  assert.ok(short.maxPrice < long.maxPrice);
  const p = planPurchase({ household: p1(), flat: flat(500000, 40) }, policy);
  assert.equal(p.budget.tenure, p.chosen.tenure);
});

test('A3 property: price ≤ "Most you can pay" ⇒ never "no" for income (MSR / TDSR) reasons', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let checked = 0;
  for (let k = 0; k < 400; k++) {
    const bank = rnd() < 0.3, age = 25 + Math.floor(rnd() * 35);
    const h = {
      scheme: 'family', firstTimer: rnd() < 0.7, parents: 'none', propertiesOwned: 0, loan: bank ? 'bank' : 'hdb', tenure: bank ? 30 : 25,
      otherDebts: bank ? Math.floor(rnd() * 1500) : 0, cash: Math.floor(rnd() * 150000), grantsOverride: null,
      buyers: [{ age, income: 2000 + Math.floor(rnd() * 10000), citizenship: 'SC', cpfOa: Math.floor(rnd() * 200000) }],
    };
    const lease = rnd() < 0.2 ? null : 45 + Math.floor(rnd() * 50);
    const probe = planPurchase({ household: h, flat: flat(500000, lease) }, policy);
    const max = probe.budget.maxPrice;
    if (!(max > 50000)) continue;
    for (const share of [0.5, 0.8, 0.95, 1]) {
      const p = planPurchase({ household: h, flat: flat(Math.floor(max * share), lease) }, policy);
      checked += 1;
      assert.ok(!p.verdict.codes.includes('msr') && !p.verdict.codes.includes('tdsr'), `${JSON.stringify(h)} lease ${lease} price ${Math.floor(max * share)} ≤ ${max}: ${p.verdict.reasons.join(' / ')}`);
    }
  }
  assert.ok(checked > 400, `checked ${checked}`);
});

// ---------------------------------------------------------------- A4 short lease, per lease band
test('A4: short-lease pro-ration rules are not published → null + UNVERIFIED (if one is verified, apply it and update this test)', () => {
  const ids = ['loan.hdb.ltv.short_lease_proration', 'cpf.usage.short_lease_proration', 'grant.ehg.short_lease_proration'];
  for (const id of ids) {
    const m = policy.meta(id);
    assert.equal(m.value, null, id);
    assert.equal(m.status, 'UNVERIFIED', id);
    assert.match(m.source_url, /^https:\/\/www\.(mom|cpf|hdb)\.gov\.sg\//, id);
    assert.throws(() => policy.get(id), /no verified value/);
  }
  assert.equal(mergedDoc().params.filter((p) => ids.includes(p.id)).length, ids.length);
});

test('A4 bands: covers 95 → full, no note; short of 95 → "up to" loan / CPF / EHG + tight; under 20 years → no CPF; tenure 0 → no loan', () => {
  const at = (lease) => planPurchase({ household: p1(), flat: flat(450000, lease) }, policy); // youngest 29: needs 66 years
  const full = at(80);
  assert.equal(full.coversTo95, true);
  assert.equal(full.shortLease, null);
  assert.ok(!full.grants.items.some((i) => i.upTo));
  assert.ok(!full.verdict.codes.includes('short-lease'));

  for (const lease of [65, 50, 30]) {
    const p = at(lease);
    assert.equal(p.coversTo95, false, `lease ${lease}`);
    assert.deepEqual(p.shortLease, { loanUpTo: true, cpfUpTo: true, ehgUpTo: 25000 }, `lease ${lease}`);
    assert.ok(['tight', 'no', 'unknown'].includes(p.verdict.status), `lease ${lease}: never ok`);
    assert.ok(p.verdict.codes.includes('short-lease'));
    const text = p.verdict.reasons.join(' ') + p.grants.notes.join(' ');
    assert.doesNotMatch(text, /are pro-rated|full amount is shown/, 'never says "pro-rated" next to a number that is not');
    assert.match(text, /most (they|you) could/);
    assert.equal(p.chosen.ltv, full.chosen.ltv, `lease ${lease}: LTV not pro-rated (no published rule)`);
    assert.equal(p.grants.total, full.grants.total);
  }
  const lowLease = at(18);
  assert.equal(lowLease.verdict.status, 'no');
  assert.ok(lowLease.verdict.codes.includes('lease-cpf') && lowLease.verdict.codes.includes('no-loan'));
  assert.equal(lowLease.shortLease, null);
});

// ---------------------------------------------------------------- A11 no "short of" before the cash is known
test('A11: empty funds or unknown cash → no "Short of" anywhere in the verdict; cashShort null', () => {
  const empty = p1({ cash: null, buyers: [{ age: 38, income: 9000, citizenship: 'SC', cpfOa: null }] });
  const oaOnly = p1({ cash: null });
  for (const h of [empty, oaOnly]) {
    for (const price of [450000, 655000, 900000]) {
      const p = planPurchase({ household: h, flat: flat(price, 80, { cov: 20000 }) }, policy);
      assert.equal(p.cashShort, null);
      assert.ok(!p.verdict.reasons.some((r) => /Short of|short of/.test(r)), p.verdict.reasons.join(' / '));
      assert.notEqual(p.verdict.status, 'ok');
    }
  }
  const oa = planPurchase({ household: oaOnly, flat: flat(655000, 80, { cov: 20000 }) }, policy);
  assert.ok(oa.verdict.reasons.includes('Add your savings to check the cash part.'));
  const known = planPurchase({ household: p1(), flat: flat(655000, 80, { cov: 30000 }) }, policy);
  assert.ok(known.cashShort > 0);
});
