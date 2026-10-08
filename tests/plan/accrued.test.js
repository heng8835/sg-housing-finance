// Phase 7 A5 — accrued CPF interest is never silently 0 (engine/sellbuy.js accruedEstimate / saleProceeds and
// Plan → Sell then buy). Sev-1: blank vs typed changes the cash by exactly the estimate; a label never claims
// interest that is not counted; the typed value always wins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { saleProceeds, accruedEstimate, sellThenBuy } from '../../app/engine/sellbuy.js';
import { accruedInterest } from '../../app/engine/cpf.js';
import { sellBuySection, cpfBackLabels } from '../../app/modules/plan/sellbuy.js';
import { policy } from '../helpers.js';

// P2 (Tan / Kok Wee) — 4-room bought 2012, ~S$120k loan left, ~S$150k CPF used
const tan = { salePrice: 580000, outstandingLoan: 120000, cpfPrincipalUsed: 150000, agentFeeRate: 0, legalFees: 0 };
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('accruedEstimate: typed wins; blank + year → compounded yearly at cpf.housing.accrued_rate; blank without year → unknown', () => {
  const rate = policy.get('cpf.housing.accrued_rate');
  const est = accruedEstimate({ cpfPrincipalUsed: 150000, boughtYear: 2012, asOfYear: 2026 }, policy);
  assert.equal(est.source, 'estimate'); assert.equal(est.years, 14); assert.equal(est.rate, rate);
  assert.equal(est.amount, Math.round(accruedInterest([{ month: 0, amount: 150000 }], 14 * 12, policy).accrued));
  assert.ok(Math.abs(est.amount - 150000 * ((1 + rate) ** 14 - 1)) < 1, 'yearly compounding of the principal');
  assert.deepEqual(accruedEstimate({ cpfPrincipalUsed: 150000, accruedInterest: 38000, boughtYear: 2012, asOfYear: 2026 }, policy), { amount: 38000, source: 'typed', years: null, rate: null, fromYear: null });
  assert.equal(accruedEstimate({ cpfPrincipalUsed: 150000, accruedInterest: 0, boughtYear: 2012, asOfYear: 2026 }, policy).source, 'typed', 'a typed 0 is typed');
  assert.equal(accruedEstimate({ cpfPrincipalUsed: 150000 }, policy).source, 'unknown');
  assert.equal(accruedEstimate({ cpfPrincipalUsed: 150000, boughtYear: 2012 }, policy).source, 'unknown', 'no as-of year: engines do not read the clock');
  assert.equal(accruedEstimate({ cpfPrincipalUsed: 150000, boughtYear: 2030, asOfYear: 2026 }, policy).source, 'unknown', 'future year');
  assert.equal(accruedEstimate({ cpfPrincipalUsed: '', boughtYear: 2012, asOfYear: 2026 }, policy).source, 'none');
  assert.equal(accruedEstimate({ cpfPrincipalUsed: 150000, boughtYear: 2026, asOfYear: 2026 }, policy).amount, 0, 'bought this year');
  assert.equal(est.fromYear, 2012);
  // no year typed: this year − years held (private SSD input / sellThenBuy current.holdingYears); the typed year wins
  assert.deepEqual(accruedEstimate({ cpfPrincipalUsed: 150000, holdingYears: 14, asOfYear: 2026 }, policy), est);
  assert.equal(accruedEstimate({ cpfPrincipalUsed: 150000, boughtYear: 2012, holdingYears: 3, asOfYear: 2026 }, policy).years, 14);
});

test('Sev-1 saleProceeds: blank vs typed — cash differs by exactly the interest counted; shape only gains fields', () => {
  const unknown = saleProceeds(tan, policy);
  const est = saleProceeds({ ...tan, boughtYear: 2012, asOfYear: 2026 }, policy);
  const typed = saleProceeds({ ...tan, accruedInterest: 38000, boughtYear: 2012, asOfYear: 2026 }, policy);
  // unknown: same numbers as before A5 (interest 0) but flagged
  assert.deepEqual([unknown.accruedSource, unknown.accruedInterest, unknown.cpfRefund, unknown.cashProceeds, unknown.cashUncertain], ['unknown', 0, 150000, 310000, true]);
  assert.ok(unknown.notes.some((n) => /not counted/.test(n)));
  // estimate: S$61,946 for the Tan household → cash S$248,054
  assert.deepEqual([est.accruedSource, est.accruedInterest, est.cpfRefund, est.cashProceeds, est.cashUncertain], ['estimate', 61946, 211946, 248054, true]);
  assert.equal(unknown.cashProceeds - est.cashProceeds, est.accruedInterest);
  assert.ok(est.assumptions.some((n) => /estimated at S\$61,946/.test(n) && /2012/.test(n)));
  // typed: wins over the year
  assert.deepEqual([typed.accruedSource, typed.accruedInterest, typed.cpfRefund, typed.cashProceeds, typed.cashUncertain], ['typed', 38000, 188000, 272000, false]);
  assert.equal(unknown.cashProceeds - typed.cashProceeds, 38000);
  // backward-compatible: every old field still there
  for (const k of ['gross', 'loanRedemption', 'cpfOwed', 'cpfRefund', 'cpfShortfall', 'agentFee', 'legalFees', 'fees', 'cashProceeds', 'cashShortfall', 'loanShortfall', 'cpfReturnedToOa', 'assumptions', 'notes']) assert.ok(k in est, k);
  assert.equal(est.cpfOwed, 150000 + 61946); assert.equal(est.cpfPrincipal, 150000);
});

test('the estimate is capped like any refund and flows into sellThenBuy', () => {
  const capped = saleProceeds({ ...tan, salePrice: 300000, boughtYear: 2012, asOfYear: 2026 }, policy);
  assert.equal(capped.cpfRefund, 180000); assert.equal(capped.cpfShortfall, 150000 + 61946 - 180000);
  const hh = { scheme: 'family', firstTimer: false, propertiesOwned: 1, cash: 60000, loan: 'hdb', tenure: 20, buyers: [{ age: 44, income: 7000, cpfOa: 30000, citizenship: 'SC' }, { age: 42, income: 5500, cpfOa: 40000, citizenship: 'PR', prYears3Plus: true }] };
  const run = (cur) => sellThenBuy({ current: { ...tan, ...cur, flatType: '4 ROOM', subsidised: true }, next: { price: 800000, flatType: '5 ROOM', loanType: 'hdb' }, household: hh }, policy);
  const a = run({}), b = run({ boughtYear: 2012, asOfYear: 2026 });
  assert.equal(a.proceeds.cashAfterTaxes - b.proceeds.cashAfterTaxes, 61946);
  assert.equal(b.nextFunding.cpfOaAvailable - a.nextFunding.cpfOaAvailable, 61946);
  assert.equal(b.proceeds.accruedSource, 'estimate');
});

const planCtx = (cur) => ({
  h: { scheme: 'family', firstTimer: false, propertiesOwned: 1, cash: 60000, loan: 'hdb', tenure: 20, buyers: [{ age: 44, income: 7000, cpfOa: 30000, citizenship: 'SC' }] },
  tf: { source: 'price', label: 'My pick', price: 800000, flatType: '5 ROOM', remainingLease: 80 },
  plan: { current: { owns: true, propertyType: 'hdb', flatType: '4 ROOM', salePrice: 580000, outstandingLoan: 120000, cpfUsed: 150000, accruedInterest: null, ...cur }, dates: {} },
  policy, today: '2026-10-07',
});

test('Plan → Sell then buy: labels never claim interest that is not counted; estimate labelled; typed unchanged', () => {
  const blank = strip(sellBuySection(planCtx({})));
  assert.match(blank, /Year you bought/);
  assert.match(blank, /principal \+ interest \(enter the year you bought to estimate\)/);
  assert.doesNotMatch(blank, /principal \+ accrued interest/);
  assert.match(blank, /Cash from the sale may be lower — check your CPF statement \(My Statement\)/);
  assert.match(blank, /uncertain/);
  const est = strip(sellBuySection(planCtx({ boughtYear: 2012 })));
  assert.match(est, /principal \+ est\. interest S\$61,946/);
  assert.match(est, /estimate/);
  assert.match(est, /S\$211,946/);
  assert.doesNotMatch(est, /principal \+ accrued interest/);
  const typed = strip(sellBuySection(planCtx({ boughtYear: 2012, accruedInterest: 38000 })));
  assert.match(typed, /principal \+ accrued interest/);
  assert.match(typed, /S\$188,000/);
  assert.doesNotMatch(typed, /may be lower|est\. interest|uncertain/);
  assert.equal(cpfBackLabels({ accruedSource: 'none' }).sub, 'principal + accrued interest');
});

test('Plan → Sell then buy: a private home without the year uses this year − years held', () => {
  const html = strip(sellBuySection(planCtx({ propertyType: 'private', yearsHeld: 14 })));
  assert.match(html, /principal \+ est\. interest S\$61,946/);
});

test('中文: every A5 string has an entry with the same placeholders', () => {
  const read = (f) => JSON.parse(readFileSync(new URL(`../../app/i18n/${f}`, import.meta.url), 'utf8'));
  const ph = (s) => (s.match(/\{\d\}/g) || []).sort().join();
  const want = {
    'zh.json': ['Year you bought', 'blank = estimate', 'Leave the interest blank to estimate it from the year you bought.', 'principal + est. interest {0}', 'CPF refund (principal + est. interest)',
      'principal + interest (enter the year you bought to estimate)', 'CPF refund (principal only — interest not counted)', 'Cash from the sale may be lower — check your CPF statement (My Statement).',
      'Accrued interest is an estimate — cash from the sale changes with it. Check your CPF statement (My Statement) for the exact amount.', 'estimate', 'uncertain'],
    'zh-engine.json': ['Accrued interest estimated at {0}: {1} of CPF at {2} a year, compounded yearly from {3} as if all of it was used that year (instalments paid later earn less, so this is on the high side). Your CPF statement has the exact amount.',
      'Accrued interest is not counted: enter it from your CPF statement, or the year you bought to estimate it. The CPF refund is likely higher and the cash lower.'],
  };
  for (const [file, keys] of Object.entries(want)) {
    const d = read(file);
    for (const k of keys) {
      assert.ok(d[k], `${file} missing: ${k}`);
      assert.equal(ph(d[k]), ph(k), `${file} placeholders: ${k}`);
      assert.match(d[k], /[一-鿿]/);
    }
  }
});
