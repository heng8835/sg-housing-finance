import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sccRateFor, costInput, segments, riskTotals, monthlyPanel, avTag } from '../../app/modules/afford/monthly.js';
import { monthlyCost, rateRisk } from '../../app/engine/monthly-cost.js';
import { pmt } from '../../app/engine/mortgage.js';
import { planPurchase } from '../../app/engine/plan.js';
import { policy, close } from '../helpers.js';

const hh = (o = {}) => ({
  scheme: 'family', firstTimer: true, parents: 'none', propertiesOwned: 0, loan: 'hdb', tenure: 25, otherDebts: 0,
  cash: 60000, grantsOverride: null,
  buyers: [{ age: 30, income: 5000, citizenship: 'SC', cpfOa: 60000 }, { age: 30, income: 4000, citizenship: 'SC', cpfOa: 40000 }], ...o,
});
const focus = { price: 600000, flatType: '4 ROOM', remainingLease: 80 };
const setup = (f = focus, h = hh()) => {
  const plan = planPurchase({ household: h, flat: f }, policy);
  const x = costInput({ plan, focus: f, household: h });
  return { plan, x, cost: monthlyCost(x, policy), h, f };
};

test('S&CC rate: reduced with a citizen buyer, normal without', () => {
  assert.equal(sccRateFor(hh()), 'reduced');
  assert.equal(sccRateFor(hh({ buyers: [{ citizenship: 'SC' }, { citizenship: 'PR' }] })), 'reduced');
  assert.equal(sccRateFor(hh({ buyers: [{ citizenship: 'PR' }, { citizenship: 'PR' }] })), 'normal');
  assert.equal(sccRateFor({ buyers: [{}] }), 'reduced');          // citizenship defaults to SC (engine/household)
  assert.equal(sccRateFor({}), 'reduced');
});

test('costInput uses the chosen loan; Annual Value only when the user typed one', () => {
  const { plan, x } = setup();
  assert.deepEqual(x.loan, { amount: plan.chosen.loan, rate: plan.chosen.rate, years: plan.chosen.tenure });
  assert.equal(x.annualValue, null);
  assert.equal(x.flatType, '4 ROOM');
  assert.equal(costInput({ plan, focus: { ...focus, annualValue: 30000 }, household: hh() }).annualValue, 30000);
  assert.equal(costInput({ plan, focus: { ...focus, annualValue: 0 }, household: hh() }).annualValue, null);
  const noLoan = { ...plan, chosen: { ...plan.chosen, tenure: 0 } };
  assert.deepEqual(costInput({ plan: noLoan, focus, household: hh() }).loan, { amount: 0, rate: 0, years: 0 });
});

test('instalment line equals the Afford instalment for the chosen loan', () => {
  const { plan, cost } = setup();
  assert.ok(close(cost.items.find((i) => i.id === 'mortgage').monthly, plan.chosen.monthly));
});

test('segments: positive lines only, shares sum to 1 and match the total', () => {
  const { cost } = setup();                                       // property tax unknown → null line
  const segs = segments(cost.items);
  assert.ok(!segs.some((s) => s.id === 'property-tax'));
  assert.ok(close(segs.reduce((s, x) => s + x.share, 0), 1, 1e-9));
  assert.ok(close(segs.reduce((s, x) => s + x.monthly, 0), cost.total, 1e-9));
  for (const s of segs) assert.ok(close(s.share * cost.total, s.monthly, 1e-9), s.id);
  const withTax = setup({ ...focus, annualValue: 30000 }).cost;
  assert.ok(segments(withTax.items).some((s) => s.id === 'property-tax'));
  assert.deepEqual(segments([{ id: 'a', monthly: 0 }, { id: 'b', monthly: null }]), []);
});

test('riskTotals: other lines unchanged, instalment swapped for the SORA band ends', () => {
  const { x, cost } = setup();
  const risk = rateRisk({ loan: x.loan.amount, years: x.loan.years, rate: x.loan.rate }, policy);
  const r = riskTotals(cost, risk);
  const rest = cost.total - cost.items.find((i) => i.id === 'mortgage').monthly;
  assert.ok(close(r.now, cost.total, 1e-9));
  assert.ok(close(r.high, rest + pmt(x.loan.amount, risk.high.rate, x.loan.years), 1e-9));
  assert.ok(close(r.high - r.low, risk.swing, 1e-9));
  assert.ok(r.low < r.median && r.median < r.high);
  assert.equal(r.rises, r.high > r.now);
  assert.equal(riskTotals(cost, null), null);
  assert.equal(riskTotals(cost, { ...risk, current: null }), null);
});

test('panel renders every line, "—" for unknown property tax, and the rate band', () => {
  const { plan, h, f, cost } = setup();
  const html = monthlyPanel({ plan, focus: f, household: h, policy });
  for (const id of ['instalment', 'property-tax', 'scc', 'hps', 'sora']) assert.ok(html.includes(`data-term="${id}"`), id);
  assert.ok(html.includes('<b>—</b>') && html.includes('excl. property tax'));
  assert.ok(html.includes('S$' + Math.round(cost.total).toLocaleString('en-SG') + '/mo'));
  assert.ok(/if rates rise/.test(html));
  const withTax = monthlyPanel({ plan, focus: { ...f, annualValue: 30000 }, household: h, policy });
  assert.ok(!withTax.includes('excl. property tax'));
});

test('panel degrades to a note when a rule value is missing', () => {
  const { plan, h, f } = setup();
  const broken = { ...policy, get: (id) => { if (id.startsWith('cost.')) throw new Error('missing'); return policy.get(id); }, meta: policy.meta };
  assert.ok(monthlyPanel({ plan, focus: f, household: h, policy: broken }).includes('unavailable'));
});

test('S&CC rate follows the town-council rule in policy (cost.scc.reduced_eligibility, read on a TC page)', () => {
  const rule = policy.meta('cost.scc.reduced_eligibility');
  assert.equal(rule.status, 'VERIFIED');
  assert.match(rule.source_url, /^https:\/\/[a-z-]+\.org\.sg\//);
  assert.equal(sccRateFor(hh(), policy), 'reduced');
  assert.equal(sccRateFor(hh({ buyers: [{ citizenship: 'PR' }, { citizenship: 'F' }] }), policy), 'normal');
  assert.equal(sccRateFor(hh({ buyers: [{ citizenship: 'PR' }, { citizenship: 'SC' }] }), policy), 'reduced');
  const { plan } = setup();
  assert.equal(costInput({ plan, focus, household: hh({ buyers: [{ citizenship: 'PR', age: 30, income: 5000 }] }), policy }).sccRate, 'normal');
});

test('Annual Value: estimated from a typical rent when no notice figure (tag "Estimated"), the notice wins ("From your notice")', () => {
  const h = hh(), plan = planPurchase({ household: h, flat: focus }, policy);
  const x = costInput({ plan, focus, household: h, market: { rent: 3100 } });
  assert.equal(x.marketMonthlyRent, 3100);
  assert.equal(x.annualValue, null);
  const est = monthlyCost(x, policy);
  assert.equal(est.avSource, 'estimate');
  assert.equal(est.avUsed, 37200);
  const before = monthlyCost(costInput({ plan, focus, household: h }), policy);    // today: no rent → no tax line
  const tax = est.items.find((i) => i.id === 'property-tax').monthly;
  assert.ok(close(tax, 1008 * 0.85 / 12, 1e-9));                                    // S$71.40 a month (2026 rebate)
  assert.ok(close(est.total - before.total, tax, 1e-9));                            // only the tax line is added
  assert.deepEqual(avTag(est), { cls: 'neutral', text: 'Estimated' });
  const html = monthlyPanel({ plan, focus, household: h, policy, market: { rent: 3100 } });
  assert.match(html, /<span class="tag neutral mc-tag">Estimated<\/span>/);
  assert.match(html, /Annual Value estimated as 12 × typical rent for a 4-room here \(S\$3,100 → S\$37,200\)\. IRAS sets the real figure on your notice\./);
  assert.match(html, /placeholder="est\. 37,200"/);
  assert.ok(!html.includes('excl. property tax'));
  assert.ok(!html.includes('mcAvClear'));                                           // nothing typed → nothing to clear
  const typed = monthlyPanel({ plan, focus: { ...focus, annualValue: 30000 }, household: h, policy, market: { rent: 3100 } });
  assert.match(typed, /<span class="tag info mc-tag">From your notice<\/span>/);
  assert.match(typed, /id="mcAvClear">Use the estimate</);
  assert.ok(!typed.includes('Annual Value estimated as'));
  assert.equal(avTag(monthlyCost(costInput({ plan, focus, household: h }), policy)), null);
  assert.equal(costInput({ plan, focus, household: h, market: { rent: 0 } }).marketMonthlyRent, undefined);
});
