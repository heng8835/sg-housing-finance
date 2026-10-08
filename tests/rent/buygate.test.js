// Phase 7 A6: Rent & Buy never names a winner for a path the household can't take (P3-1, P3-14).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { planPurchase } from '../../app/engine/plan.js';
import { btoFlatTypes, nextPaths } from '../../app/engine/eligibility.js';
import { buyGate, rbVerdict } from '../../app/modules/rent/buygate.js';
import { policy } from '../helpers.js';

const lsStaging = (u) => (existsSync(u) ? readdirSync(u) : []); // staging is empty once the integrator merged it
const hh = (o) => ({ scheme: 'family', firstTimer: true, propertiesOwned: 0, parents: 'none', loan: 'hdb', tenure: 25, grantsOverride: null, otherDebts: null, ...o });
const SC_COUPLE = hh({ buyers: [{ age: 32, income: 5000, citizenship: 'SC', cpfOa: 60000 }, { age: 31, income: 4500, citizenship: 'SC', cpfOa: 50000 }], cash: 80000 });
// P3 Priya: single PR, 35, S$6,800/month, S$40k OA, S$60k cash — rents a whole 3-room for S$3,000
const SINGLE_PR = hh({ scheme: 'single', buyers: [{ age: 35, income: 6800, citizenship: 'PR', prYears3Plus: true, nationality: 'other', cpfOa: 40000 }], cash: 60000, loan: 'bank' });
const FLAT = { price: 520000, flatType: '3 ROOM', remainingLease: 70 };
const gateFor = (household, flat = FLAT, rent = 3000, rentIsAsking = true) => {
  const plan = planPurchase({ household, flat }, policy);
  return { plan, gate: buyGate(plan, policy, { household, price: flat.price, rent, rentIsAsking }) };
};
// the markup Rent & Buy printed before Phase 7 (modules/rent/index.js) — must stay byte-identical for eligible buyers
const OLD_TAG = (diff) => `<p class="verdict"><span class="tag ${diff >= 0 ? 'good' : 'warn'}">${diff >= 0 ? `Buying comes out ahead by S$${Math.round(diff).toLocaleString('en-SG')}` : `Renting comes out ahead by S$${Math.round(-diff).toLocaleString('en-SG')}`}</span></p>`;

test('SC couple fixture: eligible and funded → no gate, the winner tag exactly as before', () => {
  const { plan, gate } = gateFor(SC_COUPLE, { price: 450000, flatType: '4 ROOM', remainingLease: 80 });
  assert.equal(plan.pathways.buy.resale.ok, true);
  assert.notEqual(plan.verdict.status, 'no', plan.verdict.reasons.join(' | '));
  assert.deepEqual(gate, { blocked: false, noWinner: false, html: '' });
  for (const d of [258210, -12000, 0]) assert.equal(rbVerdict(d, gate), OLD_TAG(d));
});

test('single PR fixture: no buy-wins line; why + paths she can take, with numbers', () => {
  const { plan, gate } = gateFor(SINGLE_PR);
  assert.equal(plan.pathways.buy.resale.ok, false);
  assert.equal(gate.blocked, true);
  assert.equal(gate.noWinner, true);
  assert.equal(rbVerdict(258210, gate), '', 'no winner tag');
  assert.doesNotMatch(gate.html, /comes out ahead/);
  assert.match(gate.html, /Your household can&#39;t buy this flat type now|Your household can't buy this flat type now/);
  assert.match(gate.html, /Only Singapore Citizen singles can buy HDB flats\./, 'why, from the eligibility engine');
  assert.match(gate.html, /Keep renting<\/b> — S\$3,000\/month \(your asking rent\)/);
  assert.match(gate.html, /once you are a Singapore Citizen \(singles from age 35\)/);
  assert.match(gate.html, /ABSD 5% applies \(S\$26,000 on a S\$520,000 home\)/);
  assert.match(gate.html, /eligibility\.single\.min_age/, 'policy ids for the age rule (Pro only)');
  const median = buyGate(plan, policy, { household: SINGLE_PR, price: FLAT.price, rent: 2900, rentIsAsking: false });
  assert.match(median.html, /S\$2,900\/month \(median rent here\)/);
});

test('single SC under the singles age: blocked, with the years to wait from policy', () => {
  const young = hh({ scheme: 'single', buyers: [{ age: 30, income: 4000, citizenship: 'SC', cpfOa: 30000 }], cash: 40000 });
  const { gate } = gateFor(young);
  assert.equal(gate.blocked, true);
  const min = policy.get('eligibility.single.min_age');
  assert.match(gate.html, new RegExp(`An HDB resale flat from age ${min} — in ${min - 30} years\\.`));
  assert.match(gate.html, /no ABSD on this household&#39;s next purchase|no ABSD on this household's next purchase/);
});

test('foreigner: blocked; the private path carries the foreigner ABSD', () => {
  const f = hh({ buyers: [{ age: 30, income: 9000, citizenship: 'F', nationality: 'other', pass: 'EP', cpfOa: 0 }], cash: 300000, loan: 'bank' });
  const { gate } = gateFor(f);
  assert.equal(gate.blocked, true);
  assert.match(gate.html, /Foreigners cannot buy HDB flats\./);
  const rate = policy.get('stamp.absd.rates').F[0];
  assert.match(gate.html, new RegExp(`ABSD ${Math.round(rate * 100)}% applies`));
});

test('cash short (funds known): "Buying needs S$X more cash first" before the comparison, no winner tag', () => {
  const poor = { ...SC_COUPLE, cash: 1000, buyers: SC_COUPLE.buyers.map((b) => ({ ...b, cpfOa: 0 })) };
  const { plan, gate } = gateFor(poor, { price: 450000, flatType: '4 ROOM', remainingLease: 80 });
  const short = plan.chosen.funding.cashShort;
  assert.ok(short > 0);
  assert.equal(gate.blocked, false, 'eligible: the comparison still shows');
  assert.equal(gate.noWinner, true);
  assert.match(gate.html, new RegExp(`Buying needs S\\$${Math.round(short).toLocaleString('en-SG')} more cash first`));
  assert.ok(gate.html.indexOf('more cash first') < gate.html.indexOf('assumes you could buy now'), 'cash line first');
  assert.equal(rbVerdict(5000, gate), '');
});

test('funds not entered: no "more cash" line (A11) — the gate stays quiet for an eligible household', () => {
  const unknown = { ...SC_COUPLE, cash: null, buyers: SC_COUPLE.buyers.map((b) => ({ ...b, cpfOa: null })) };
  const { gate } = gateFor(unknown, { price: 450000, flatType: '4 ROOM', remainingLease: 80 });
  assert.doesNotMatch(gate.html, /more cash first/);
});

test('engine: btoFlatTypes — singles 2-room Flexi from policy, families unlimited, PR none', () => {
  const single = hh({ scheme: 'single', buyers: [{ age: 36, income: 4000, citizenship: 'SC' }] });
  const s = btoFlatTypes(single, policy);
  assert.deepEqual(s.allowed, policy.get('elig.rule.single').bto_flat_types);
  assert.deepEqual(s.allowed, ['2 ROOM']);
  assert.deepEqual(s.ids, ['elig.rule.single']);
  assert.equal(btoFlatTypes(SC_COUPLE, policy).allowed, null);
  const pr = btoFlatTypes(SINGLE_PR, policy);
  assert.equal(pr.ok, false);
  assert.deepEqual(pr.allowed, []);
  const ncs = btoFlatTypes(hh({ buyers: [{ age: 30, income: 4000, citizenship: 'SC' }, { age: 30, income: 3000, citizenship: 'F', nationality: 'other', pass: 'EP' }] }), policy);
  assert.deepEqual(ncs.allowed, policy.get('elig.ncs').bto_flat_types);
});

test('engine: nextPaths is empty while resale is open; SPR family short of the PR years gets that path', () => {
  assert.deepEqual(nextPaths(SC_COUPLE, policy, { price: 500000 }), []);
  const prFam = hh({ buyers: [{ age: 30, income: 4000, citizenship: 'PR', prYears3Plus: false, nationality: 'other' }, { age: 30, income: 4000, citizenship: 'PR', prYears3Plus: false, nationality: 'other' }] });
  const ids = nextPaths(prFam, policy).map((x) => x.id);
  assert.ok(ids.includes('pr_years'));
  assert.match(nextPaths(prFam, policy).find((x) => x.id === 'pr_years').text, new RegExp(`at least ${policy.get('elig.spr_household').min_pr_years} years`));
});

test('中文: every string in rent/buygate.js has an entry; new engine messages are translated', () => {
  // 7b: strings staged by the build agents (app/i18n/staging/*.json) count until the integrator merges them
  const stagingDir = new URL('../../app/i18n/staging/', import.meta.url);
  const staged = lsStaging(stagingDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(new URL(f, stagingDir), 'utf8')));
  const zh = Object.assign({}, ...['zh.json', 'zh-explore.json', 'zh-engine.json'].map((f) => JSON.parse(readFileSync(new URL(`../../app/i18n/${f}`, import.meta.url), 'utf8'))), ...staged);
  const src = readFileSync(new URL('../../app/modules/rent/buygate.js', import.meta.url), 'utf8');
  const keys = [...src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g), ...src.matchAll(/\bt\("((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\'/g, "'"));
  assert.ok(keys.length >= 10);
  for (const k of keys) assert.match(zh[k] || '', /[一-鿿]/, `zh missing: ${k}`);
  for (const k of ['Singles can buy a new 2-room Flexi flat only.', 'An HDB resale flat from age {0} — in {1} years.',
    'An HDB resale flat once you are a Singapore Citizen (singles from age {0}).', 'A private condo — ABSD {0} applies ({1} on a {2} home).',
    'How long you wait for the keys is not known yet — no comparison until you set it.', 'No rent figure — enter your rent now to include the rent paid while waiting.']) assert.ok(zh[k], `zh-engine missing: ${k}`);
});

test('B11 single PR fixture: bank loan selected, HDB greyed with the reason; no EC / condo path over budget in the main list', async () => {
  const { loanChoice, loanSeg } = await import('../../app/modules/household/loan.js');
  const pr = { ...SINGLE_PR, loan: 'hdb' }; // even with "HDB loan" stored, the drawer shows Bank selected
  const c = loanChoice(pr, policy);
  assert.equal(c.value, 'bank'); assert.equal(c.hdbOff, true);
  assert.deepEqual(c.ids, ['elig.hdb_loan']);
  const html = loanSeg(c);
  assert.match(html, /data-v="hdb" class=" is-off" aria-disabled="true"/);
  assert.match(html, /data-v="bank" class="on"/);
  assert.match(html, /An HDB loan needs at least one Singapore Citizen buyer/);
  assert.equal(planPurchase({ household: pr, flat: FLAT }, policy).chosen.loanType, 'bank', 'Afford agrees: bank loan');
  // an SC couple keeps its own choice; an empty household is not judged
  assert.deepEqual(loanChoice(SC_COUPLE, policy), { value: 'hdb', hdbOff: false, why: [], ids: [] });
  assert.equal(loanChoice(hh({ buyers: [{ age: null, income: null, citizenship: 'PR' }] }), policy).hdbOff, false);
  // next paths vs Most you can pay: a S$900k flat is over her budget → the EC / condo paths leave the main list
  const dear = { price: 900000, flatType: '3 ROOM', remainingLease: 70 };
  const { plan, gate } = gateFor(SINGLE_PR, dear);
  const max = plan.budget.maxPrice;
  assert.ok(max > 0 && max < dear.price, `budget ${max}`);
  const main = gate.html.slice(gate.html.indexOf('rb-paths'), gate.html.indexOf('</ul>', gate.html.indexOf('rb-paths')));
  assert.doesNotMatch(main, /resale EC|private condo/, 'over-budget paths are not in the main list');
  assert.match(gate.html, /Over your budget \(\d\)/);
  assert.match(gate.html, new RegExp(`S\\$${(dear.price - max).toLocaleString('en-SG')} over Most you can pay`));
  const paths = nextPaths(SINGLE_PR, policy, { price: dear.price, maxPrice: max });
  assert.ok(paths.length && paths.every((x) => x.within === false && x.over === dear.price - max));
  // within budget: the paths stay in the main list with "within Most you can pay"
  const cheap = gateFor(SINGLE_PR, { price: 300000, flatType: '3 ROOM', remainingLease: 70 }).gate;
  assert.doesNotMatch(cheap.html, /Over your budget/);
  assert.match(cheap.html, /within Most you can pay/);
  assert.deepEqual(nextPaths(SINGLE_PR, policy, { price: 300000 }).map((x) => x.within), nextPaths(SINGLE_PR, policy, { price: 300000 }).map(() => null), 'no budget → unknown');
});
