// Phase 7b B9 — key dates that tell the time: past dates say "Already passed" + what next, P1 address-rule note,
// sale / purchase completions + the new flat's MOP end, the sell-first gap × the household's one rent figure (O9),
// the date-order check, .ics without past dates (K4), "typical weeks" only from sourced rules (O11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyDates, orderCheck, gapCost, daysFrom, pastKeyOf } from '../../app/engine/keydates.js';
import { keyDatesSection, icsFor, eventsFor, typicalLines, TYPICAL, gapNote, orderWarning } from '../../app/modules/plan/keydates.js';
import { sharedRent } from '../../app/core/rentshare.js';
import { policy } from '../helpers.js';

const TODAY = '2026-10-07';
const MOP = policy.get('rentbuy.mop.years');
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const plan = (o = {}, cur = {}) => ({ cpf: {}, dates: { keyCollection: null, flatClass: 'standard', nextCompletion: null, children: [], ...o }, current: { owns: false, ...cur } });
const ctx = (p, f = null) => ({ f, plan: p, policy, today: TODAY });

test('engine: every event that can pass has a "what next" text; P1 child ids map to the P1 text', () => {
  for (const id of ['mop', 'absd-refund', 'dispose', 'lease-min', 'lease-cpf', 'lease-hdb-loan', 'lease-end', 'sale-complete', 'next-complete', 'next-mop', 'p1-1', 'p1-12']) assert.ok(pastKeyOf(id), id);
  assert.equal(pastKeyOf('p1-2'), "Registration for this child's Primary 1 year is over.");
  const evs = keyDates({ asOf: TODAY, keyCollection: '2015-01-10', children: ['2019-05-01'] }, policy);
  assert.ok(evs.every((e) => e.past && e.pastKey));
});

test('engine: with a move — "Sale completes", "New flat: purchase completes", new MOP end = purchase + MOP years (policy)', () => {
  const evs = keyDates({ asOf: TODAY, mode: 'sell-first', saleCompletion: '2027-03-12', nextCompletion: '2027-04-30', nextPropertyType: 'hdb' }, policy);
  const by = Object.fromEntries(evs.map((e) => [e.id, e]));
  assert.equal(by['sale-complete'].start, '2027-03-12');
  assert.equal(by['next-complete'].start, '2027-04-30');
  assert.equal(by['next-mop'].start, `${2027 + MOP.standard}-04-30`);
  assert.deepEqual(by['next-mop'].titleVals, [MOP.standard]);
  // no move ticked → none of them
  assert.deepEqual(keyDates({ asOf: TODAY, saleCompletion: '2027-03-12', nextCompletion: '2027-04-30' }, policy).map((e) => e.id), []);
});

test('engine: order check — sell first with the purchase completing first (and buy first the other way) is flagged', () => {
  assert.deepEqual(orderCheck({ mode: 'sell-first', saleCompletion: '2027-04-30', purchaseCompletion: '2027-03-12' }), { mode: 'sell-first', sale: '2027-04-30', purchase: '2027-03-12' });
  assert.equal(orderCheck({ mode: 'sell-first', saleCompletion: '2027-03-12', purchaseCompletion: '2027-04-30' }), null);
  assert.ok(orderCheck({ mode: 'buy-first', saleCompletion: '2027-03-12', purchaseCompletion: '2027-04-30' }));
  assert.equal(orderCheck({ mode: 'contra', saleCompletion: '2027-04-30', purchaseCompletion: '2027-03-12' }), null);
  assert.equal(orderCheck({ mode: 'sell-first', saleCompletion: null, purchaseCompletion: '2027-03-12' }), null);
});

test('Sev-1 engine: gap cost = whole months covering the gap × rent (a part month counts as a month)', () => {
  assert.equal(daysFrom('2027-03-12', '2027-04-30'), 49);
  assert.deepEqual(gapCost({ mode: 'sell-first', saleCompletion: '2027-03-12', purchaseCompletion: '2027-04-30', rent: 3000 }), { days: 49, months: 2, rent: 3000, cost: 6000 });
  assert.equal(gapCost({ mode: 'sell-first', saleCompletion: '2027-03-12', purchaseCompletion: '2027-04-12', rent: 2500 }).cost, 2500, 'exactly one month');
  assert.equal(gapCost({ mode: 'sell-first', saleCompletion: '2027-03-12', purchaseCompletion: '2027-04-13', rent: 2500 }).months, 2);
  assert.deepEqual(gapCost({ mode: 'sell-first', saleCompletion: '2027-03-12', purchaseCompletion: '2027-05-01', rent: null }), { days: 50, months: 2, rent: null, cost: null });
  assert.equal(gapCost({ mode: 'sell-first', saleCompletion: '2027-03-12', purchaseCompletion: '2027-03-12', rent: 3000 }), null, 'no gap');
  assert.equal(gapCost({ mode: 'contra', saleCompletion: '2027-03-12', purchaseCompletion: '2027-04-30', rent: 3000 }), null);
  assert.equal(gapCost({ mode: 'sell-first', saleCompletion: '2027-03-12', purchaseCompletion: '2027-04-30', rent: 0 }).cost, 0, 'typed 0 = no rent paid');
});

test('UI: a past date says "Already passed" + what next; P1 rows carry the MOE address note with a link', () => {
  const html = keyDatesSection(ctx(plan({ keyCollection: '2015-01-10', children: ['2019-05-01', '2024-03-03'] })));
  const past = html.split('<li class="past">').slice(1);
  assert.ok(past.length >= 2);
  for (const li of past) assert.match(li, /<span class="tag neutral">Already passed<\/span><br><small>[^<]{10,}<\/small>/);
  assert.match(html, /Registration for this child&#39;s Primary 1 year is over\./);
  assert.match(html, /MOE has rules on living at the address you register with/);
  assert.match(html, /href="https:\/\/www\.moe\.gov\.sg\//);
  assert.match(html, /Past dates are left out of the calendar file\./);
});

test('.ics leaves out past dates (K4) — and has the upcoming ones', () => {
  const c = ctx(plan({ keyCollection: '2015-01-10', children: ['2019-05-01', '2024-03-03'] }));
  const evs = eventsFor(c);
  assert.ok(evs.some((e) => e.past) && evs.some((e) => !e.past));
  const { count, text } = icsFor(c);
  assert.equal(count, evs.filter((e) => !e.past).length);
  assert.equal((text.match(/BEGIN:VEVENT/g) || []).length, count);
  for (const e of evs.filter((x) => x.past)) assert.ok(!text.includes(`DTSTART;VALUE=DATE:${e.start.replace(/-/g, '')}`), e.id);
});

test('UI: dates that contradict "Sell first, then buy" get the warning; matching dates do not', () => {
  const bad = plan({ nextCompletion: '2027-03-12' }, { owns: true, mode: 'sell-first', saleCompletion: '2027-04-30' });
  const html = keyDatesSection(ctx(bad));
  assert.match(strip(html), /Your dates don.*t match &quot;Sell first, then buy&quot;: the new flat completes on 12 Mar 2027, before the sale completes on 30 Apr 2027\./);
  assert.equal(orderWarning({ owns: true, mode: 'sell-first', saleCompletion: '2027-03-12' }, { nextCompletion: '2027-04-30' }), '');
  assert.match(strip(keyDatesSection(ctx(bad))), /Sale completes/);
});

test('Sev-1 UI: the gap uses the one rent figure (plan.rent.amount, else the older plan.rentNow); none → ask for it', () => {
  const cur = { owns: true, mode: 'sell-first', saleCompletion: '2027-03-12' };
  const d = { nextCompletion: '2027-04-30' };
  assert.match(strip(gapNote(cur, d, { rent: { amount: 3000 } })), /about 2 months × your rent S\$3,000 = S\$6,000\./);
  assert.match(strip(gapNote(cur, d, { rentNow: 2400 })), /× your rent S\$2,400 = S\$4,800\./);
  const none = gapNote(cur, d, {});
  assert.match(none, /data-fill="rent"/); // fill link → Rent & Buy, the rent field focused (core/filllink.js)
  assert.match(strip(none), /Add the rent you(.|&#39;)d pay to see this\./); // the link text is HTML-escaped
  assert.equal(gapNote({ ...cur, mode: 'buy-first' }, d, { rent: { amount: 3000 } }), '');
  assert.equal(sharedRent({ rent: { amount: 0 }, rentNow: 1500 }).amount, 0, 'typed 0 wins');
  assert.equal(sharedRent({}).amount, null);
});

test('O11: typical weeks only from sourced rules — the HDB entries are unverified (null), so nothing is shown', () => {
  for (const [id] of TYPICAL) assert.equal(policy.meta(id).value, null, `${id} still unverified`);
  assert.deepEqual(typicalLines(policy), []);
  const fake = { get: (id) => ({ 'keydates.typical.hfe_letter_weeks': 4 }[id] ?? (() => { throw new Error('null'); })()) };
  assert.deepEqual(typicalLines(fake), ['HFE letter: usually about 4 weeks once HDB has all your documents.']);
});
