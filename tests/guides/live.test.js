// Guides runtime (pure parts): live values = the Afford tab's numbers, "—" + needs when inputs are missing,
// HTML rendering of steps / quiz, and the policy-change log (grouping, sorting, status filter, review banner).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIVE, resolveLive, unmet, fieldFor, fillLive } from '../../app/modules/guides/live.js';
import { stepHtml, quizHtml, listHtml, needsHtml, DISCLAIMER } from '../../app/modules/guides/render.js';
import { groupLog, reviewState, stateOf, topicOf, statusCounts, logHtml, STATUSES } from '../../app/modules/guides/log.js';
import { markDone } from '../../app/modules/guides/index.js';
import { planPurchase } from '../../app/engine/plan.js';
import { defaults } from '../../app/core/store.js';
import { policy, mergedDoc } from '../helpers.js';

const guides = JSON.parse(readFileSync(new URL('../../app/content/guides.json', import.meta.url), 'utf8')).guides;
const household = () => ({ ...defaults().household, buyers: [{ ...defaults().household.buyers[0], age: 30, income: 6000, cpfOa: 40000 }, { ...defaults().household.buyers[0], age: 29, income: 5000, cpfOa: 30000 }], cash: 50000 });
const flat = { price: 550000, flatType: '4 ROOM', remainingLease: 70, label: 'Blk 1 Test Street' };
const ALL = Object.keys(LIVE);

test('live values match the Afford engine call (same planPurchase inputs)', () => {
  const h = household(), r = resolveLive(ALL, { household: h, flat, policy });
  const p = planPurchase({ household: h, flat: { price: flat.price, flatType: flat.flatType, remainingLease: flat.remainingLease, cov: 0 } }, policy);
  const money = (v) => 'S$' + Math.round(v).toLocaleString('en-SG');
  assert.equal(r.values['afford.instalment'].text, money(p.chosen.monthly));
  assert.equal(r.values['afford.upfront'].text, money(p.chosen.funding.net));
  assert.equal(r.values['afford.cash_needed'].text, money(p.chosen.funding.cashNeeded));
  assert.equal(r.values['afford.max_price'].text, money(p.budget.maxPrice));
  assert.equal(r.values['afford.msr'].text, `${(p.chosen.msrAssessed * 100).toFixed(0)}%`);
  assert.equal(r.values['afford.flat'].text, 'Blk 1 Test Street');
  assert.equal(r.values['household.income'].text, 'S$11,000');
  assert.equal(r.values['household.buyers'].text, '2');
  assert.equal(r.values['household.loan_type'].text, 'HDB loan');
  assert.deepEqual(r.needs, []);
  for (const k of ALL) assert.notEqual(r.values[k].text, '—', `${k} resolves`);
});

test('missing inputs → "—" and the needs list (empty household, no flat)', () => {
  const h = defaults().household, r = resolveLive(ALL, { household: h, flat: null, policy });
  assert.equal(r.values['afford.instalment'].text, '—');
  assert.deepEqual(r.values['afford.msr'].missing, ['flat', 'income']);
  assert.equal(r.values['household.income'].text, '—');
  assert.equal(r.values['household.buyers'].text, '1');
  assert.deepEqual(r.needs, ['income', 'age', 'cash', 'cpfOa', 'flat']);
  const html = fillLive('a {live:household.income} b {live:household.buyers}', r.values);
  assert.match(html, /g-live missing/);
  assert.match(html, /<span class="g-live">1<\/span>/);
  assert.match(needsHtml(r.needs), /data-guide-need="income"/);
  assert.match(needsHtml(r.needs), /data-guide-need="flat"/);
});

test('foreign-only households never need CPF; fieldFor points at the first empty field', () => {
  const h = { ...defaults().household, buyers: [{ citizenship: 'F', age: 30, income: 9000, cpfOa: null }], cash: 1 };
  assert.equal(unmet(h, flat).cpfOa, false);
  const h2 = { ...defaults().household, buyers: [{ citizenship: 'SC', income: 1 }, { citizenship: 'SC', income: null }] };
  assert.equal(fieldFor('income', h2), 'buyers.1.income');
  assert.equal(fieldFor('cash', h2), 'cash');
  assert.equal(fieldFor('cpfOa', { buyers: [{ citizenship: 'F' }, { citizenship: 'SC' }] }), 'buyers.1.cpfOa');
});

test('step + quiz HTML: policy values filled, live values filled, disclaimer, Show me only with a target', () => {
  const g = guides['buying-resale'];
  for (const [i, s] of g.steps.entries()) {
    const html = stepHtml(g, i, { policy, live: resolveLive(s.live, { household: household(), flat, policy }) });
    assert.doesNotMatch(html, /\{(policy|live):/, `step ${i + 1} placeholders left`);
    assert.ok(html.includes(DISCLAIMER), `step ${i + 1} disclaimer`);
    assert.equal(html.includes('data-guide-show'), !!(s.target || s.fallback), `step ${i + 1} show me`);
    assert.match(html, new RegExp(`Step ${i + 1} of ${g.steps.length}`));
    if (s.policy.length) assert.match(html, /class="g-src"/, `step ${i + 1} sources`);
  }
  const q0 = quizHtml(g, [], { policy });
  assert.doesNotMatch(q0, /\{policy:/);
  assert.doesNotMatch(q0, /g-fb/);
  const wrong = (g.quiz[0].answer + 1) % g.quiz[0].options.length;
  const q1 = quizHtml(g, [wrong], { policy });
  assert.match(q1, /g-fb wrong/);
  assert.match(q1, /class="g-opt right"/);
  const all = quizHtml(g, g.quiz.map((q) => q.answer), { policy, tourTitle: 'firstResale' });
  assert.match(all, new RegExp(`You got ${g.quiz.length} of ${g.quiz.length} right`));
  assert.match(all, /data-guide-tour/);
  assert.ok(all.includes(DISCLAIMER));
});

test('Guides list: minutes, steps, ✓ done; completion record', () => {
  const list = Object.values(guides);
  const html = listHtml(list, { 'buying-resale': { done: '2026-10-07', score: 3, of: 4 } });
  assert.match(html, /data-guide-open="buying-resale"/);
  assert.match(html, /~\d+ min/);
  assert.match(html, /✓ Done/);
  assert.match(html, /data-guide-log/);
  assert.deepEqual(markDone({ a: 1 }, 'x', 3, 4, '2026-10-07'), { a: 1, x: { done: '2026-10-07', score: 3, of: 4 } });
});

test('policy log: grouped by topic, newest effective date first, filter by status, states and review banner', () => {
  const params = mergedDoc().params;
  const groups = groupLog(params, { today: '2026-10-07' });
  assert.equal(groups.reduce((n, g) => n + g.items.length, 0), params.length);
  for (const g of groups) for (let i = 1; i < g.items.length; i++) assert.ok(g.items[i - 1].effective_from >= g.items[i].effective_from, g.topic);
  for (let i = 1; i < groups.length; i++) assert.ok(groups[i - 1].latest >= groups[i].latest);
  const ver = groupLog(params, { today: '2026-10-07', status: 'VERIFIED' });
  assert.ok(ver.every((g) => g.items.every((p) => p.status === 'VERIFIED')));
  const counts = statusCounts(params);
  assert.equal(STATUSES.reduce((n, s) => n + counts[s], 0), params.length);
  assert.equal(topicOf('ratio.msr.cap'), 'Loans and limits');
  assert.equal(topicOf('assumption.rate.bank'), 'Modelling assumptions');
  assert.equal(topicOf('zzz.unknown'), 'Other rules');
  assert.equal(stateOf({ effective_from: '2027-01-01', effective_to: null }, '2026-10-07'), 'upcoming');
  assert.equal(stateOf({ effective_from: '2020-01-01', effective_to: '2025-12-31' }, '2026-10-07'), 'ended');
  assert.equal(stateOf({ effective_from: '2020-01-01', effective_to: null }, '2026-10-07'), 'current');
  assert.equal(reviewState('2026-12-31', '2027-01-01'), 'overdue');
  assert.equal(reviewState('2026-12-31', '2026-12-15'), 'soon');
  assert.equal(reviewState('2026-12-31', '2026-10-07'), 'ok');
  const html = logHtml(policy, { today: '2026-10-07', status: 'ASSUMPTION' });
  assert.match(html, /pl-banner/);
  assert.match(html, /data-pl-status="ASSUMPTION" class="chip on"/);
  assert.doesNotMatch(html, /tag good/); // only assumption badges
});
