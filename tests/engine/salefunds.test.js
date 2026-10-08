// engine/salefunds.js: the sale as planPurchase counts it must match Plan → Sell then buy (engine/sellbuy.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saleInput, saleFunds, secondLoanCap } from '../../app/engine/salefunds.js';
import { sellThenBuy } from '../../app/engine/sellbuy.js';
import { planPurchase } from '../../app/engine/plan.js';
import { policy, close } from '../helpers.js';

const hh = (o = {}) => ({
  scheme: 'family', firstTimer: false, parents: 'none', propertiesOwned: 1, loan: 'hdb', tenure: 25, otherDebts: 0, cash: 80000, grantsOverride: null,
  buyers: [{ age: 44, income: 7000, citizenship: 'SC', cpfOa: 60000 }, { age: 42, income: 5500, citizenship: 'SC', cpfOa: 40000 }], ...o,
});
const current = (o = {}) => ({ owns: true, propertyType: 'hdb', flatType: '4 ROOM', salePrice: 527000, outstandingLoan: 120000, cpfUsed: 150000, accruedInterest: 38000, mode: null, ...o });

test('saleInput: maps Plan inputs as modules/plan/sellbuy.js does; null when not ticked or no price', () => {
  assert.equal(saleInput(null, 2026), null);
  assert.equal(saleInput({ current: current({ owns: false }) }, 2026), null);
  assert.equal(saleInput({ current: current({ salePrice: null }) }, 2026), null);
  const s = saleInput({ current: current({ boughtYear: 2012, yearsHeld: 3, mode: 'sell-first' }) }, 2026);
  assert.deepEqual(s, {
    current: { salePrice: 527000, outstandingLoan: 120000, cpfPrincipalUsed: 150000, accruedInterest: 38000, boughtYear: 2012, asOfYear: 2026, flatType: '4 ROOM', propertyType: 'hdb', subsidised: undefined, holdingYears: 3 },
    mode: 'sell-first',
  });
});

test('same numbers as Plan → Sell then buy for every order, HDB and private homes, typed / blank interest', () => {
  const cases = [
    [hh(), current(), 800000], [hh(), current({ mode: 'sell-first' }), 650000], [hh(), current({ mode: 'buy-first' }), 700000],
    [hh(), current({ accruedInterest: null, boughtYear: 2010 }), 750000], [hh(), current({ accruedInterest: null }), 750000],
    [hh({ cash: 20000 }), current({ salePrice: 400000, outstandingLoan: 250000 }), 600000],
    [hh(), current({ propertyType: 'private', salePrice: 1500000, outstandingLoan: 400000, cpfUsed: 300000, yearsHeld: 8 }), 900000],
  ];
  for (const [h, c, price] of cases) {
    const sale = saleInput({ current: c }, 2026);
    const flat = { price, flatType: '5 ROOM', remainingLease: 75, cov: 0 };
    const p = planPurchase({ household: h, flat, sale }, policy);
    const r = sellThenBuy({ current: sale.current, next: { price, flatType: '5 ROOM', propertyType: 'hdb', loanType: h.loan, tenure: h.tenure, remainingLease: 75, subsidised: false }, household: h, mode: sale.mode }, policy);
    const tag = `${c.propertyType} ${c.mode} ${price}`;
    assert.equal(p.sale.mode, r.mode, tag);
    assert.ok(close(p.chosen.loan, r.nextFunding.loan), `${tag} loan ${p.chosen.loan} vs ${r.nextFunding.loan}`);
    assert.ok(close(p.chosen.monthly, r.nextFunding.monthly), `${tag} monthly`);
    assert.ok(close(p.funds.cash, r.nextFunding.cashAvailable), `${tag} cash ${p.funds.cash} vs ${r.nextFunding.cashAvailable}`);
    assert.ok(close(p.funds.cpfOa, r.nextFunding.cpfOaAvailable), `${tag} cpf`);
    assert.ok(close(p.absd.amount, r.nextFunding.absd), `${tag} absd`);
    assert.ok(close(p.chosen.funding.cashShort, r.gap.cashShort), `${tag} cashShort`);
    assert.ok(close(p.chosen.funding.fundsShort, r.gap.fundsShort), `${tag} fundsShort`);
  }
});

test('second-loan cap: keeps the greater of S$25,000 or half the cash proceeds; nothing when buying first or no loan', () => {
  const sf = saleFunds({ sale: saleInput({ current: current() }, 2026), household: hh() }, policy);
  const cap = secondLoanCap({ price: 800000, loan: 600000, sf }, policy);
  const cashP = sf.proceeds.cashProceeds;
  assert.ok(close(cap.retain, Math.max(25000, cashP / 2)));
  assert.ok(close(cap.mustUse, 188000 + cashP - cap.retain));
  assert.ok(close(cap.loan, 800000 - cap.mustUse));
  const first = saleFunds({ sale: saleInput({ current: current({ mode: 'buy-first' }) }, 2026), household: hh() }, policy);
  assert.equal(secondLoanCap({ price: 800000, loan: 600000, sf: first }, policy).loan, 600000);
  assert.equal(secondLoanCap({ price: 800000, loan: 0, sf }, policy).loan, 0);
});
