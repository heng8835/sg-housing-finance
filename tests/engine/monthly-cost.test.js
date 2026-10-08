import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthlyCost, rateRisk, propertyTax, progressiveTax, flatKey } from '../../app/engine/monthly-cost.js';
import { pmt } from '../../app/engine/mortgage.js';
import { policy, close } from '../helpers.js';

const base = { flatType: '4 ROOM', price: 600000, loan: { amount: 450000, rate: 0.026, years: 25 }, annualValue: 30000, ownerOccupied: true };
const item = (r, id) => r.items.find((i) => i.id === id);

test('flatKey maps HDB labels and private', () => {
  assert.equal(flatKey('4 ROOM'), '4 ROOM');
  assert.equal(flatKey('MULTI-GENERATION'), 'EXECUTIVE');
  assert.equal(flatKey('Executive'), 'EXECUTIVE');
  assert.equal(flatKey('CONDOMINIUM'), 'PRIVATE');
});

test('owner-occupier property tax follows the IRAS 2025+ bands', () => {
  const bands = policy.get('cost.ptax.owner_occupied.bands');
  assert.equal(progressiveTax(12000, bands), 0);
  assert.ok(close(progressiveTax(30000, bands), 720));            // 18,000 × 4%
  assert.ok(close(progressiveTax(50000, bands), 1120 + 600));      // full 4% + 6% bands
  assert.ok(close(progressiveTax(150000, bands), 1120 + 600 + 2500 + 1400 + 3000 + 10400 + 3200));
});

test('non-owner-occupier rates and the 2026 owner-occupier rebate', () => {
  assert.ok(close(propertyTax({ annualValue: 30000, ownerOccupied: false }, policy).net, 3600));   // 12%
  const hdb = propertyTax({ annualValue: 30000, ownerOccupied: true, hdb: true }, policy);
  assert.ok(close(hdb.rebate, 720 * 0.15) && close(hdb.net, 720 * 0.85));
  const pvt = propertyTax({ annualValue: 150000, ownerOccupied: true, hdb: false }, policy);
  assert.ok(close(pvt.rebate, 500));                                                                 // 10% capped at $500
});

test('monthly cost lines for a 4-room HDB flat', () => {
  const r = monthlyCost(base, policy);
  assert.deepEqual(r.items.map((i) => i.id), ['mortgage', 'property-tax', 'scc', 'utilities', 'hps', 'fire']);
  assert.ok(close(item(r, 'mortgage').monthly, pmt(450000, 0.026, 25)));
  assert.ok(close(item(r, 'property-tax').monthly, 720 * 0.85 / 12));
  assert.ok(close(item(r, 'scc').monthly, (69.4 + 71.5) / 2));
  assert.ok(close(item(r, 'utilities').monthly, (380.7 * 0.2859 + 15.4 * 3.24) * 1.09));
  assert.ok(close(item(r, 'hps').monthly, 209.4 * 450000 / 200000 / 12));
  assert.ok(close(item(r, 'fire').monthly, 4.59 / 5 / 12, 1e-6));
  assert.ok(close(r.total, r.items.reduce((t, i) => t + i.monthly, 0)));
  for (const i of r.items) assert.ok(Number.isFinite(i.monthly) && i.basis, i.id);
});

test('annual value falls back to market rent × 12; missing both gives a null line', () => {
  const viaRent = monthlyCost({ ...base, annualValue: null, marketMonthlyRent: 2500 }, policy);
  assert.ok(close(item(viaRent, 'property-tax').monthly, 720 * 0.85 / 12));
  const none = monthlyCost({ ...base, annualValue: null }, policy);
  assert.equal(item(none, 'property-tax').monthly, null);
  assert.ok(Number.isFinite(none.total));
});

test('private home: no S&CC/HPS/fire, maintenance input, private rebate', () => {
  const r = monthlyCost({ ...base, flatType: 'PRIVATE', annualValue: 48000, maintenanceMonthly: 350 }, policy);
  const ids = r.items.map((i) => i.id);
  assert.ok(!ids.includes('scc') && !ids.includes('hps') && !ids.includes('fire'));
  assert.equal(item(r, 'maintenance').monthly, 350);
  const gross = 1120 + 8000 * 0.06;
  assert.ok(close(item(r, 'property-tax').monthly, (gross - Math.min(gross * 0.1, 500)) / 12));
});

test('normal S&CC rate, no loan, opting out of HPS', () => {
  const r = monthlyCost({ ...base, flatType: '3 ROOM', sccRate: 'normal', loan: { amount: 0, rate: 0, years: 0 } }, policy);
  assert.equal(item(r, 'mortgage').monthly, 0);
  assert.equal(item(r, 'hps'), undefined);
  assert.ok(close(item(r, 'scc').monthly, (70.5 + 79.5) / 2));
  assert.equal(item(monthlyCost({ ...base, hps: false }, policy), 'hps'), undefined);
});

test('rateRisk: SORA band + spread, ordered instalments', () => {
  const r = rateRisk({ loan: 450000, years: 25, rate: 0.026 }, policy);
  assert.equal(r.window.from, '2021-10-01');
  assert.ok(r.low.rate < r.median.rate && r.median.rate < r.high.rate);
  assert.ok(close(r.median.rate, 0.0238315 + 0.005, 1e-9));
  assert.ok(close(r.high.monthly, pmt(450000, 0.037611 + 0.005, 25)));
  assert.ok(r.low.monthly < r.median.monthly && r.median.monthly < r.high.monthly);
  assert.ok(close(r.swing, r.high.monthly - r.low.monthly));
  assert.ok(close(r.current.monthly, pmt(450000, 0.026, 25)));
  assert.equal(rateRisk({ loan: { amount: 450000 }, years: 25 }, policy).current, null);
});

test('Annual Value estimate: rent × 12 × cost.ptax.av_rent_factor (factor 1 = the old numbers); avSource / avUsed', () => {
  const factor = policy.get('cost.ptax.av_rent_factor');
  assert.equal(factor, 1);
  assert.equal(policy.meta('cost.ptax.av_rent_factor').status, 'ASSUMPTION');
  const est = monthlyCost({ ...base, annualValue: null, marketMonthlyRent: 3100 }, policy);
  assert.equal(est.avSource, 'estimate');
  assert.equal(est.avUsed, 3100 * 12 * factor);
  const pt = propertyTax({ annualValue: 37200, ownerOccupied: true, hdb: true }, policy);
  assert.ok(close(item(est, 'property-tax').monthly, pt.net / 12, 1e-9));
  // 37,200: 0% on 12k, 4% on 25.2k = 1,008 a year, less the 2026 HDB rebate (15%) → 856.80 → 71.40 a month
  assert.ok(close(item(est, 'property-tax').monthly, 1008 * 0.85 / 12, 1e-9));
  const notice = monthlyCost({ ...base, annualValue: 30000, marketMonthlyRent: 3100 }, policy);   // the notice wins
  assert.equal(notice.avSource, 'notice');
  assert.equal(notice.avUsed, 30000);
  const none = monthlyCost({ ...base, annualValue: null }, policy);
  assert.equal(none.avSource, null);
  assert.equal(none.avUsed, null);
  // a different factor scales the estimate only
  const doc = { get: (id) => (id === 'cost.ptax.av_rent_factor' ? 0.5 : policy.get(id)), meta: policy.meta };
  assert.equal(monthlyCost({ ...base, annualValue: null, marketMonthlyRent: 3100 }, doc).avUsed, 18600);
  assert.equal(monthlyCost({ ...base, annualValue: 30000 }, doc).avUsed, 30000);
});
