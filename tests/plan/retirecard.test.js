// Phase 7b B6 — Plan → Options at 55 and above as a retirement result card: Stay / Right-size (SHB) / Lease Buyback /
// Flexi, each with the same three money lines (cash freed now, RA top-up, CPF LIFE a month), every "—" with a reason,
// no Lease Buyback proceeds or CPF LIFE amount invented, neutral people words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seniorsSection, laterOptions, topUpsFor, agedBuyers, MAIN, OTHER } from '../../app/modules/plan/seniors.js';
import { seniorOptions } from '../../app/engine/seniors.js';
import { rightSizeCash } from '../../app/engine/rightsize.js';
import { lifePayoutTopUp } from '../../app/engine/cpfpayout.js';
import { saleInput } from '../../app/engine/salefunds.js';
import { CPF_DEFAULTS } from '../../app/core/cpf-defaults.js';
import { money } from '../../app/core/dom.js';
import { policy } from '../helpers.js';

const A65 = policy.get('cpf.age.life_payout');
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
// P4 — Mr Lim (66, receives S$1,050 a month) and Mrs Lim (63), selling their 4-room for S$560,000
const mrLim = { age: 66, income: 0, citizenship: 'SC', cpfOa: 30000, cpfRa: 190000, cpfLifeMonthly: 1050 };
const mrsLim = { age: 63, income: 0, citizenship: 'SC', cpfOa: 30000, cpfRa: 190000 };
const P4 = { scheme: 'family', firstTimer: false, parents: 'none', propertiesOwned: 1, loan: 'hdb', tenure: 10, otherDebts: 0, cash: 150000, grantsOverride: null, buyers: [mrLim, mrsLim] };
const selling = { cpf: {}, current: { owns: true, propertyType: 'hdb', flatType: '4 ROOM', salePrice: 560000, outstandingLoan: 0, cpfUsed: 150000, accruedInterest: 60000, remainingLease: 55 } };
const twoRoom = { source: 'price', label: 'Bedok 2-room', price: 300000, flatType: '2 ROOM', remainingLease: 60 };
const card = (o = {}) => seniorsSection({ h: P4, tf: twoRoom, plan: selling, policy, today: '2026-10-07', mode: 'pro', ...o });
const items = (html) => html.split('<li class="pw"').slice(1);
const optionOf = (html, id) => items(html).find((s) => s.includes(`data-option="${id}"`));

test('B6: P4 shows the four main options, then the other two in a fold, each with the same 3 money lines in order', () => {
  const html = card();
  assert.deepEqual(items(html).map((s) => /data-option="([^"]+)"/.exec(s)[1]), [...MAIN, ...OTHER]);
  for (const s of items(html)) {
    const lines = [...s.matchAll(/<li><span>([^<]+)<\/span>/g)].map((m) => m[1]);
    assert.deepEqual(lines, ['Cash freed now', 'RA top-up', 'CPF LIFE a month']);
  }
  assert.match(html, /Other options \(2\): rent out a room, Community Care Apartment/);
});

test('B6: every "—" comes with a reason', () => {
  for (const html of [card(), card({ plan: { cpf: {}, current: { owns: false } } }), card({ h: { ...P4, buyers: [{ age: 60, citizenship: 'SC' }] } })]) {
    for (const m of html.matchAll(/<b>—<\/b>(<small>(.*?)<\/small>)?/g)) assert.ok(m[2] && strip(m[2]).trim().length > 3, `dash without a reason: ${m[0]}`);
  }
});

test('B6: cash freed now — SHB and Flexi from the sale (same engine numbers), Stay S$0, Lease Buyback never estimated', () => {
  const html = card();
  const shb = seniorOptions({ owners: P4.buyers.map((b) => ({ age: b.age, citizenship: 'SC', raBalance: b.cpfRa })), income: 0, flatType: '4 ROOM', remainingLease: 55, marketValue: 560000, nextFlatType: '2 ROOM', nextFlatPrice: 300000, outstandingLoan: 0 }, policy).find((o) => o.option === 'shb');
  const sale = saleInput(selling, 2026);
  const want = rightSizeCash({ sale, nextPrice: 300000, raTopUp: shb.raTopUp, bonus: shb.bonus.amount }, policy).cashFreed;
  assert.equal(want, 218400); // see tests/engine/rightsize.test.js for the arithmetic
  assert.match(optionOf(html, 'shb'), new RegExp(`Cash freed now</span><b>${money(want).replace('$', '\\$')}</b>`));
  assert.match(optionOf(html, 'shb'), /S\$60,000 → bonus S\$40,000/);
  assert.match(optionOf(html, 'flexi'), /Cash freed now<\/span><b>S\$238,600<\/b>/);
  assert.match(optionOf(html, 'stay'), /Cash freed now<\/span><b>S\$0<\/b>/);
  assert.match(optionOf(html, 'lbs'), /Cash freed now<\/span><b>—<\/b>/);
  assert.doesNotMatch(html, /Cash now is the bonus only/, 'the old note is gone now that the sale is counted');
});

test('B6: CPF LIFE — at the payout age "goes up, CPF works it out" (no amount); the younger buyer is estimated', () => {
  const s = optionOf(card(), 'shb');
  assert.match(s, /CPF LIFE a month<\/span><b>goes up<\/b>/);
  assert.match(s, /CPF works out the new amount for Buyer 1\./);
  const tops = topUpsFor({ option: 'shb', raTopUp: 60000 }, agedBuyers(P4), P4, policy);
  assert.deepEqual(tops, [30000, 30000]);
  const r = lifePayoutTopUp({ household: P4, topUps: tops, defaults: CPF_DEFAULTS, year: 2026 }, policy);
  const b2 = r.buyers.find((b) => b.i === 1);
  assert.ok(s.includes(`Buyer 2: ${money(b2.before)} → ${money(b2.after)} at ${A65} (estimate).`));
  assert.match(s, /top-up split evenly between the owners aged 55 and above/);
  assert.match(s, /href="https:\/\/www\.cpf\.gov\.sg\//, 'CPF estimator link from the policy source');
  // Stay: no top-up → no change, own figure + estimate
  assert.match(optionOf(card(), 'stay'), /no change/);
});

test('B6: Lease Buyback for P4 opens when Buyer 2 turns 65 — "From 2028", neutral words', () => {
  const html = card();
  const lbs = optionOf(html, 'lbs');
  assert.match(lbs, /<span class="tag info pw-tag">From 2028<\/span>/);
  assert.match(lbs, /From 2028, when Buyer 2 turns 65\./);
  assert.doesNotMatch(strip(html), /\b(wife|husband|his|her)\b/i);
  const later = laterOptions({ owners: [{ age: 66, citizenship: 'SC' }, { age: 63, citizenship: 'SC' }], income: 0 }, agedBuyers(P4), policy, 2026);
  assert.deepEqual(later.lbs, { year: 2028, buyer: 1, age: 65 });
  // one buyer: "when you turn"
  const one = card({ h: { ...P4, buyers: [{ ...mrsLim }] } });
  assert.match(optionOf(one, 'lbs'), /From 2028, when you turn 65\./);
});

test('B6: not selling → the prompt, and the sale lines say why', () => {
  const html = card({ plan: { cpf: {}, current: { owns: false } } });
  assert.match(html, /class="need"[^>]*>.*Tick &#39;I own a home now&#39; in Sell then buy and add its sale price\./s);
  assert.match(optionOf(html, 'shb'), /Cash freed now<\/span><b>—<\/b><small>Tick &#39;I own a home now&#39;/);
  assert.match(html, /data-act="goto-sellbuy"/);
});

test('B6: Flexi without a 2-room flat picked → no price invented', () => {
  const html = card({ tf: { ...twoRoom, flatType: '3 ROOM' } });
  assert.match(optionOf(html, 'flexi'), /Cash freed now<\/span><b>—<\/b><small>Flexi prices depend on the project and lease/);
});

test('B6: Simple says "Retirement Account" and "Lease Buyback"; Pro "RA top-up"', () => {
  const simple = card({ mode: 'simple' });
  assert.match(simple, /<span>Retirement Account top-up<\/span>/);
  assert.match(simple, /<span class="pw-name">Lease Buyback<\/span>/);
  assert.match(card(), /<span>RA top-up<\/span>/);
});

test('B6: CPF balances missing → "—" with a fill link to add them (household:open via core/filllink.js)', () => {
  const html = card({ h: { ...P4, buyers: [{ age: 60, income: 0, citizenship: 'SC' }] } });
  assert.match(optionOf(html, 'stay'), /CPF LIFE a month<\/span><b>—<\/b><small><button type="button" class="link fill-link" data-fill="household" data-field="buyers\.0\.cpfOa">Add CPF balances →/);
});
