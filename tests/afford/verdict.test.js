// Afford tab Phase 7a lines (modules/afford/verdict.js, flattype.js) and the guides' live values: sale banner (A2),
// short-lease "up to" (A4), no "Short of" before the cash is known (A11), block hand-off retype.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planPurchase } from '../../app/engine/plan.js';
import { saleInput } from '../../app/engine/salefunds.js';
import { scenarioResults, snapshotOf } from '../../app/engine/scenario.js';
import { saleBanner, shortLeaseNote, grantsAmount, cashShortLine, saleHomeLabel } from '../../app/modules/afford/verdict.js';
import { retypePatch, noSalesHint } from '../../app/modules/afford/flattype.js';
import { resolveLive, LIVE } from '../../app/modules/guides/live.js';
import { policy } from '../helpers.js';

const hh = (o = {}) => ({
  scheme: 'family', firstTimer: true, parents: 'near', propertiesOwned: 0, loan: 'hdb', tenure: 25, otherDebts: 0, cash: 30000, grantsOverride: null,
  buyers: [{ age: 29, income: 4200, citizenship: 'SC', cpfOa: 45000 }, { age: 31, income: 3300, citizenship: 'SC', cpfOa: 38000 }], ...o,
});
const emptyFunds = () => hh({ cash: null, buyers: [{ age: 38, income: 9000, citizenship: 'SC', cpfOa: null }] });
const flat = (price, remainingLease = 80, o = {}) => ({ price, flatType: '4 ROOM', remainingLease, cov: 0, ...o });
const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const seller = (o = {}) => ({ owns: true, propertyType: 'hdb', flatType: '4 ROOM', salePrice: 527000, outstandingLoan: 120000, cpfUsed: 150000, accruedInterest: 38000, mode: null, ...o });
const p2 = () => hh({ firstTimer: false, propertiesOwned: 1, parents: 'none', cash: 80000, buyers: [{ age: 44, income: 7000, citizenship: 'SC', cpfOa: 60000 }, { age: 42, income: 5500, citizenship: 'PR', cpfOa: 40000 }] });

test('A2 banner: one calm line with the sale cash and CPF, a link to Plan; nothing without a sale', () => {
  const none = planPurchase({ household: p2(), flat: flat(800000, 70) }, policy);
  assert.equal(saleBanner(none, null), '');
  const c = seller({ block: { bid: 1, label: '123 Bedok North St 3' } });
  const p = planPurchase({ household: p2(), flat: flat(800000, 70), sale: saleInput({ current: c }, 2026) }, policy);
  const html = saleBanner(p, c);
  assert.match(html, /class="tag info"/);
  assert.match(strip(html), /Includes the sale of your flat at 123 Bedok North St 3: S\$[\d,]+ cash and S\$188,000 back to your CPF OA\./);
  assert.match(html, /id="afSalePlan"/);
  assert.doesNotMatch(html, /uncertain/);
  const blank = seller({ accruedInterest: null });
  const u = planPurchase({ household: p2(), flat: flat(800000, 70), sale: saleInput({ current: blank }, 2026) }, policy);
  assert.match(strip(saleBanner(u, blank)), /Cash from the sale is uncertain — enter the year you bought in Plan\./);
  const first = seller({ mode: 'buy-first' });
  const b = planPurchase({ household: p2(), flat: flat(800000, 70), sale: saleInput({ current: first }, 2026) }, policy);
  assert.match(strip(saleBanner(b, first)), /Buying first: the sale of your 4-room flat is not counted here.*ABSD is remitted upfront/);
  assert.equal(saleHomeLabel({ propertyType: 'private' }), 'your private home');
});

test('A2 Scenarios: a scenario saved with the sale counts it (same as Afford); without it, as before', () => {
  const f = { source: 'price', label: 'x', price: 800000, flatType: '4 ROOM', remainingLease: 70 };
  const opts = { year: 2026, horizonYears: 10, cpfDefaults: { wageGrowth: 0.03, bonusMonths: 1 } };
  const withSale = scenarioResults(snapshotOf({ id: 'A', name: 'A', savedAt: 'x', flat: f, household: p2(), plan: { cpf: {}, current: seller() } }), policy, opts);
  const afford = planPurchase({ household: p2(), flat: flat(800000, 70), sale: saleInput({ current: seller() }, 2026) }, policy);
  assert.equal(withSale.verdict, afford.verdict.status);
  assert.equal(withSale.upfront.cash, afford.chosen.funding.cashNeeded);
  assert.equal(withSale.monthly, afford.chosen.monthly);
  const without = scenarioResults(snapshotOf({ id: 'B', name: 'B', savedAt: 'x', flat: f, household: p2(), plan: { cpf: {}, current: seller({ owns: false }) } }), policy, opts);
  assert.equal(without.monthly, planPurchase({ household: p2(), flat: flat(800000, 70) }, policy).chosen.monthly);
  assert.notEqual(without.verdict, withSale.verdict);
});

test('A4: short lease → "up to" grants and the note; full lease → plain numbers, no note', () => {
  const short = planPurchase({ household: hh(), flat: flat(450000, 61) }, policy);
  assert.match(grantsAmount(short), /^up to S\$125,000$/);
  assert.match(shortLeaseNote(short), /most they could be — the actual amounts are lower/);
  assert.doesNotMatch(shortLeaseNote(short), /are pro-rated/);
  const full = planPurchase({ household: hh(), flat: flat(450000, 80) }, policy);
  assert.equal(grantsAmount(full), 'S$125,000');
  assert.equal(shortLeaseNote(full), '');
  // guides: the same "up to" on the live loan and grants
  const v = resolveLive(['afford.loan', 'afford.grants', 'afford.price'], { household: hh(), flat: flat(450000, 61), policy }).values;
  assert.match(v['afford.loan'].text, /^up to S\$/);
  assert.match(v['afford.grants'].text, /^up to S\$125,000$/);
  assert.doesNotMatch(v['afford.price'].text, /up to/);
  const vf = resolveLive(['afford.loan'], { household: hh(), flat: flat(450000, 80), policy }).values;
  assert.doesNotMatch(vf['afford.loan'].text, /up to/);
});

test('A11: empty-funds household → no "Short of" in Afford lines, Scenarios or the guides\' live values', () => {
  for (const h of [emptyFunds(), hh({ cash: null })]) {
    for (const price of [450000, 655000, 950000]) {
      const p = planPurchase({ household: h, flat: flat(price, 80, { cov: 25000 }) }, policy);
      const afford = [cashShortLine(p), ...p.verdict.reasons, saleBanner(p, null), shortLeaseNote(p)].join(' ');
      assert.doesNotMatch(afford, /short of/i);
      assert.match(cashShortLine(p), /Add your savings to check the cash part\./);
      const sc = scenarioResults(snapshotOf({ id: 'A', name: 'A', savedAt: 'x', flat: { source: 'price', price, flatType: '4 ROOM', remainingLease: 80, cov: 25000 }, household: h }), policy,
        { year: 2026, horizonYears: 10, cpfDefaults: { wageGrowth: 0.03, bonusMonths: 1 } });
      assert.doesNotMatch(JSON.stringify(sc.plan.verdict), /short of/i);
      const live = resolveLive(Object.keys(LIVE), { household: h, flat: flat(price, 80, { cov: 25000 }), policy });
      assert.doesNotMatch(JSON.stringify(live), /short of/i);
    }
  }
  const known = planPurchase({ household: hh(), flat: flat(655000, 80, { cov: 30000 }) }, policy);
  assert.match(cashShortLine(known), /Short of S\$[\d,]+ in cash\./);
});

test('block hand-off: a new flat type brings that block\'s median for it, or no price + a hint; other focus keeps its price', () => {
  const f = { source: 'block', bid: 42, label: '334B Ang Mo Kio Ave 1 — median of recent 3-room sales', price: 410000, flatType: '3 ROOM', remainingLease: 60 };
  const lookup = (bid, ft) => (bid === 42 && ft === '4 ROOM' ? { price: 532500.4, n: 6 } : null);
  assert.deepEqual(retypePatch(f, '4 ROOM', lookup, '334B Ang Mo Kio Ave 1'), { flatType: '4 ROOM', price: 532500, label: '334B Ang Mo Kio Ave 1 — median of recent 4-room sales' });
  const none = retypePatch(f, '5 ROOM', lookup, '334B Ang Mo Kio Ave 1');
  assert.deepEqual(none, { flatType: '5 ROOM', price: null, label: '334B Ang Mo Kio Ave 1 — no recent sales' });
  assert.match(strip(noSalesHint({ ...f, ...none })), /No recent 5-room sales in this block — type a price/);
  assert.equal(noSalesHint(f), '');
  const own = { source: 'price', label: 'Your own figures', price: 600000, flatType: '3 ROOM' };
  assert.deepEqual(retypePatch(own, '4 ROOM', lookup, ''), { flatType: '4 ROOM' });
  assert.deepEqual(retypePatch(f, '3 ROOM', lookup, 'x'), { flatType: '3 ROOM' });
});

test('中文: every Phase 7a Afford / engine string has an entry with the same placeholders, using 您', () => {
  const read = (f) => JSON.parse(readFileSync(new URL(`../../app/i18n/${f}`, import.meta.url), 'utf8'));
  const ph = (s) => (s.match(/\{\d\}/g) || []).sort().join();
  const want = {
    'zh.json': ['your home', 'your private home', 'your flat at {0}', 'your {0} flat', 'your flat', 'Includes the sale of {0}: {1} cash and {2} back to your CPF OA.',
      'Buying first: the sale of {0} is not counted here — its money arrives after this purchase.', 'Cash from the sale is uncertain — enter the year you bought in Plan.',
      'Cash from the sale uses an estimate of the accrued CPF interest.', 'Change in Plan →', 'up to {0}', 'includes selling your home', 'No recent {0} sales in this block — type a price',
      "This lease doesn't reach age 95 for the youngest buyer, so HDB and CPF will lower the loan and the CPF you can use, and HDB will pro-rate the EHG. The figures here are the most they could be — the actual amounts are lower. Ask HDB at HFE."],
    'zh-engine.json': ['Add your savings to check the cash part.',
      'The lease does not cover the youngest buyer to 95: the EHG shown is the most you could get. HDB will pro-rate it (formula not published), so the actual amount is lower.',
      'Possible with a smaller loan: borrow {0} (not {1}) and pay {2} more from cash or CPF — your income limits the loan at the test rate.',
      'A smaller loan of {0} could work if you can pay {1} more from cash or CPF — add your savings to check.',
      'The lease does not cover the youngest buyer to 95. HDB and CPF will lower the loan and the CPF you can use (formulas not published), so the loan and CPF figures here are the most they could be.'],
  };
  for (const [file, keys] of Object.entries(want)) {
    const d = read(file);
    for (const k of keys) {
      assert.ok(d[k], `${file} missing: ${k}`);
      assert.equal(ph(d[k]), ph(k), `${file} placeholders: ${k}`);
      assert.match(d[k], /[一-鿿]/);
      assert.doesNotMatch(d[k], /你/);
    }
  }
});
