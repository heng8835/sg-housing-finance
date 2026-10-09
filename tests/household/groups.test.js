// Household page "About you" (spec phone-topbar-area-household.md §4, slice S3): groupFor for every store path and
// every path a fill link / need prompt / opener can target, the fallback order of household:open { field }, the
// basics card (10 controls for a Citizen couple, folds closed), nothing lost (each path rendered inside its group),
// same store writes (parseField), summaries from engine outputs, and 中文 coverage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { policy } from '../helpers.js';
import { defaults } from '../../app/core/store.js';
import { HOUSEHOLD_FIELD, householdField, FILL_TEXT } from '../../app/core/filllink.js';
import { NEEDS } from '../../app/core/missing.js';
import { grants } from '../../app/engine/grants.js';
import { groupFor, candidates, pickTarget, foldOf, summaries, statusLine, GROUPS, uiStrings as groupStrings } from '../../app/modules/household/groups.js';
import { formHtml, parseField, idFor, uiStrings as formStrings } from '../../app/modules/household/form.js';
import { initI18n, missingStrings } from '../../app/core/i18n.js';

const APP = new URL('../../app/', import.meta.url);
const read = (p) => readFileSync(new URL(p, APP), 'utf8');
const B = (o = {}) => ({ ...defaults().household.buyers[0], ...o });
const H = (o = {}) => ({ ...defaults().household, ...o });
const COUPLE = H({ buyers: [B({ age: 29, income: 4500, cpfOa: 32000 }), B({ age: 28, income: 3500, cpfOa: 21000 })], cash: 40000 });
// covers every conditional field: payout-age citizen, PR with follow-ups, foreigner on a Work Permit
const SENIOR = H({ buyers: [B({ age: 70, income: 2000, cpfOa: 90000, cpfLifeMonthly: 1200 }), B({ age: 67, citizenship: 'PR', prYears3Plus: true, nationality: 'MY' })] });
const FOREIGN = H({ buyers: [B({ age: 35, income: 6000, citizenship: 'F', pass: 'WP', nationality: 'other' })] });

/** The HTML of one group (from its data-group marker to the next one). */
function groupHtml(html, id) {
  const at = html.indexOf(`data-group="${id}"`);
  if (at < 0) return '';
  const next = html.indexOf('data-group="', at + 1);
  return html.slice(at, next < 0 ? undefined : next);
}
const page = (h, o = {}) => formHtml(h, policy, { pro: true, ...o });

test('groupFor: every store path of the household slice (defaults + conditional fields)', () => {
  const want = {
    scheme: 'basics', cash: 'basics', otherDebts: 'loan', firstTimer: 'grants', propertiesOwned: 'grants', parents: 'grants',
    loan: 'loan', tenure: 'loan', grantsOverride: 'grants', needsReview: 'basics', buyers: 'basics',
  };
  for (const k of Object.keys(defaults().household)) assert.equal(groupFor(k), want[k], k);
  const buyer = { age: 'basics', income: 'basics', citizenship: 'basics', cpfOa: 'basics', prYears3Plus: 'basics', nationality: 'basics',
    pass: 'basics', wpSector: 'basics', cpfSa: 'cpf', cpfMa: 'cpf', cpfRa: 'cpf', cpfLifeMonthly: 'cpf' };
  for (const i of [0, 1]) for (const [k, g] of Object.entries(buyer)) assert.equal(groupFor(`buyers.${i}.${k}`), g, `buyers.${i}.${k}`);
  for (const k of [...Object.keys(defaults().household.buyers[0]), 'cpfLifeMonthly']) assert.ok(k in buyer, `buyer key ${k} has a group`);
  assert.equal(groupFor('forget'), 'data');
  assert.equal(groupFor('nonsense'), 'basics');
  assert.equal(groupFor(undefined), 'basics');
});

test('groupFor: every path the openers target (filllink, quickfill / missing, guides, Plan, CPF rows) is a known group', () => {
  const paths = new Set(['buyers.0.income', 'buyers.1.income', 'buyers.0.age', 'buyers.1.age', 'buyers.0.cpfOa', 'buyers.1.cpfOa', 'cash',
    'buyers.0.cpfLifeMonthly', 'buyers.1.cpfLifeMonthly']);
  for (const k of Object.keys(FILL_TEXT)) for (const h of [COUPLE, SENIOR, H()]) { const p = householdField(h, k); if (HOUSEHOLD_FIELD.test(p)) paths.add(p); }
  for (const p of Object.values(NEEDS)) for (const i of [0, 1]) paths.add(p.replace('*', i));
  for (const p of paths) {
    assert.ok(HOUSEHOLD_FIELD.test(p), `${p} is a household field`);
    assert.ok(GROUPS.some((g) => g.id === groupFor(p)), p);
  }
  assert.equal(groupFor('buyers.0.income'), 'basics');
  assert.equal(groupFor('cash'), 'basics');
  assert.equal(groupFor('buyers.1.cpfLifeMonthly'), 'cpf');
});

test('candidates: field → buyer 1\'s field → the group title row → the first basics field', () => {
  assert.deepEqual(candidates('buyers.1.income'), [{ path: 'buyers.1.income' }, { path: 'buyers.0.income' }, { first: true }]);
  assert.deepEqual(candidates('buyers.1.cpfSa'), [{ path: 'buyers.1.cpfSa' }, { path: 'buyers.0.cpfSa' }, { group: 'cpf' }, { first: true }]);
  assert.deepEqual(candidates('buyers.0.cpfLifeMonthly'), [{ path: 'buyers.0.cpfLifeMonthly' }, { group: 'cpf' }, { first: true }]);
  assert.deepEqual(candidates('tenure'), [{ path: 'tenure' }, { group: 'loan' }, { first: true }]);
  assert.deepEqual(candidates(''), [{ first: true }]);
  assert.equal(foldOf('basics'), null);
  assert.equal(foldOf('cpf'), 'hhCpf');
});

/** "On screen" in pure HTML: the element is rendered, and in Simple not inside a .pro-only block. */
function shownIn(html, { pro }) {
  const visible = (needle) => {
    const at = html.indexOf(needle);
    if (at < 0) return false;
    if (pro) return true;
    // inside a pro-only wrapper: the nearest unclosed pro-only div / details before it
    const before = html.slice(0, at);
    const opens = [...before.matchAll(/<(div|details)[^>]*class="[^"]*pro-only[^"]*"/g)].map((m) => ({ at: m.index, tag: m[1] }));
    return !opens.some((o) => before.slice(o.at).split(`<${o.tag}`).length > before.slice(o.at).split(`</${o.tag}>`).length);
  };
  return (c) => (c.path ? visible(`data-path="${c.path}"`) : c.group ? visible(`data-fold="${foldOf(c.group)}"`) : true);
}

test('open at a field: three fields in three groups land on the field; a field not shown falls back', () => {
  const html = page(SENIOR);
  for (const [field, group] of [['buyers.0.income', 'basics'], ['parents', 'grants'], ['buyers.0.cpfLifeMonthly', 'cpf']]) {
    assert.deepEqual(pickTarget(field, shownIn(html, { pro: true })), { path: field }, field);
    assert.match(groupHtml(html, group), new RegExp(`data-path="${field.replace(/\./g, '\\.')}"`), `${field} sits in ${group}`);
  }
  // buyer 2's income with one buyer → buyer 1's income
  const one = page(H({ buyers: [B({ age: 30, income: 5000 })] }));
  assert.deepEqual(pickTarget('buyers.1.income', shownIn(one, { pro: true })), { path: 'buyers.0.income' });
  // Simple, a couple under the payout age: SA is Pro only and the CPF group has no field → the first basics field
  const simple = formHtml(COUPLE, policy, { pro: false });
  assert.deepEqual(pickTarget('buyers.0.cpfSa', shownIn(simple, { pro: false })), { first: true });
  // Simple, a retiree: SA is hidden but the CPF group shows (payout field) → its title row
  assert.deepEqual(pickTarget('buyers.0.cpfSa', shownIn(page(SENIOR, { pro: false }), { pro: false })), { group: 'cpf' });
  // CPF LIFE payout under the payout age, Pro → the CPF group title row
  assert.deepEqual(pickTarget('buyers.0.cpfLifeMonthly', shownIn(page(COUPLE), { pro: true })), { group: 'cpf' });
  // ids for <label for> are stable per path
  assert.equal(idFor('buyers.0.income'), 'hh-buyers-0-income');
  assert.match(html, /<label for="hh-buyers-0-income">Income a month<\/label>/);
});

test('basics first: a Citizen couple has 10 controls in the open card; every group starts folded', () => {
  const html = page(COUPLE);
  const basics = groupHtml(html, 'basics');
  const paths = [...basics.matchAll(/data-path="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(paths, ['scheme', 'buyers.0.age', 'buyers.0.income', 'buyers.0.citizenship', 'buyers.0.cpfOa',
    'buyers.1.age', 'buyers.1.income', 'buyers.1.citizenship', 'buyers.1.cpfOa', 'cash']);
  assert.match(basics, /<h3>The basics<\/h3>/);
  assert.match(basics, /<legend><span id="hh-buyer-1">Buyer 2<\/span><button type="button" class="hh-remove" data-act="remove-buyer" data-i="1" aria-label="Remove buyer 2">Remove<\/button><\/legend>/, 'Remove: a quiet text button in the Buyer 2 heading row (H-2)');
  assert.doesNotMatch(basics, /data-act="add-buyer"/);
  assert.match(page(H({ buyers: [B({ age: 30 })] })), /data-act="add-buyer"/, 'family with one buyer: + Add second buyer');
  // Citizenship is a 3-button switch with the same values as the old select
  assert.match(basics, /data-act="cit" data-i="0" data-v="SC" class="on">Citizen<\/button><button[^>]*data-v="PR"[^>]*>PR<\/button><button[^>]*data-v="F"[^>]*>Foreigner</);
  for (const id of ['grants', 'loan', 'cpf', 'data']) {
    const g = groupHtml(html, id);
    assert.match(g, new RegExp(`^data-group="${id}">`), `${id}: a fold whose open state comes only from keepFolds`);
  }
  assert.equal((html.match(/<details /g) || []).length, 4);
  assert.doesNotMatch(html, /<details[^>]* open/, 'folds closed by default');
  // wordiness: help text only behind ⓘ (hidden), no paragraph in the basics
  assert.deepEqual([...basics.matchAll(/<p [^>]*>/g)].map((m) => m[0]).filter((p) => !/class="hh-help"[^>]* hidden/.test(p)), []);
  assert.match(html, /<h2 id="hhTitle">About you<\/h2>/);
  assert.match(html, /<span id="hhLine">2 buyers · S\$8,000 a month · saved only in this browser<\/span>/);
});

test('folds remember: keepFolds attr() opens a group; the open group renders open', () => {
  const html = formHtml(COUPLE, policy, { folds: { attr: (k) => (k === 'hhLoan' ? ' open' : '') } });
  assert.match(html, /data-fold="hhLoan" data-group="loan" open>/);
  assert.doesNotMatch(html, /data-fold="hhGrants"[^>]* open>/);
});

test('nothing lost: every household path is rendered, once, inside its own group (same data-path values)', () => {
  const seen = new Set();
  for (const h of [COUPLE, SENIOR, FOREIGN]) {
    const html = page(h);
    for (const [, p] of html.matchAll(/data-path="([^"]+)"/g)) {
      assert.ok(p === 'scheme' || HOUSEHOLD_FIELD.test(p), `${p}: a known drawer path`);
      assert.match(groupHtml(html, groupFor(p)), new RegExp(`data-path="${p.replace(/\./g, '\\.')}"`), `${p} in ${groupFor(p)}`);
      assert.equal(html.split(`data-path="${p}"`).length, 2, `${p} once`);
      seen.add(p.replace(/^buyers\.\d+\./, 'buyers.N.'));
    }
  }
  const all = ['scheme', 'cash', 'otherDebts', 'firstTimer', 'propertiesOwned', 'parents', 'tenure', 'grantsOverride',
    ...['age', 'income', 'citizenship', 'cpfOa', 'cpfSa', 'cpfMa', 'cpfRa', 'cpfLifeMonthly', 'prYears3Plus', 'nationality', 'pass', 'wpSector'].map((k) => `buyers.N.${k}`)];
  assert.deepEqual([...seen].sort(), all.sort());
  // loan type: the eligibility-aware switch (loan.js), Export / Import / Forget and the links in "Your data"
  const html = page(COUPLE);
  assert.match(groupHtml(html, 'loan'), /data-act="loan" data-v="hdb"/);
  for (const a of ['export', 'import', 'forget', 'samples', 'edit-answers', 'start']) assert.match(groupHtml(html, 'data'), new RegExp(`data-act="${a}"`), a);
  assert.doesNotMatch(groupHtml(page(COUPLE, { sample: true }), 'data'), /data-act="samples"/, 'sample: no "Try a sample" link');
  assert.match(page(COUPLE, { sample: true }), /<p class="hh-line">.*<span id="hhLine">Sample household · 2 buyers · S\$8,000 a month<\/span><button type="button" class="link hh-exit" data-act="sample-exit">Exit sample<\/button><\/p>/, 'sample notice folded into the status line (H-1.1)');
  assert.doesNotMatch(page(COUPLE, { sample: true }), /class="notice"/);
  // a foreigner: no CPF anywhere, no CPF group
  assert.doesNotMatch(page(FOREIGN), /cpfOa|data-group="cpf"/);
  // phone: "Close" + sticky Done; desktop: ✕, no foot
  assert.match(page(COUPLE, { phone: true }), /<div class="drawer-foot"><button class="btn primary" value="close">Done<\/button><\/div>$/);
  assert.doesNotMatch(page(COUPLE), /drawer-foot/);
});

test('same store writes: parseField reads every control as before', () => {
  const el = (value, type = 'text', dataset = {}) => ({ value, type, dataset });
  assert.equal(parseField(el('true', 'select-one', { type: 'timer' })), true);
  assert.equal(parseField(el('false', 'select-one', { type: 'timer' })), false);
  assert.equal(parseField(el('mixed', 'select-one', { type: 'timer' })), 'mixed');
  assert.equal(parseField(el('2', 'select-one', { type: 'int' })), 2);
  assert.equal(parseField(el('', 'select-one', { type: 'bool' })), null);
  assert.equal(parseField(el('600,000', 'text', { money: '' })), 600000);
  assert.equal(parseField(el('', 'text', { money: '' })), null);
  assert.ok(Number.isNaN(parseField(el('12.5', 'text', { money: '' }))));
  assert.equal(parseField(el('29', 'number')), 29);
  assert.equal(parseField(el('', 'number')), null);
  assert.equal(parseField(el('near', 'select-one')), 'near');
  const src = read('modules/household/index.js');
  assert.match(src, /case 'cit': set\(`buyers\.\$\{b\.dataset\.i\}\.citizenship`, b\.dataset\.v\)/, 'citizenship switch writes the same SC / PR / F');
});

test('summaries: engine figures as they are (grants() total, loan choice), Pro-only CPF line', () => {
  const s = summaries(COUPLE, policy, { pro: true });
  const g4 = grants({ household: COUPLE, flatType: '4 ROOM' }, policy).total;
  assert.equal(s.grants, `First-timers · est. grants S$${Math.round(g4).toLocaleString('en-SG')}`, 'defaults left out (H-1.4)');
  assert.equal(summaries(H({ ...COUPLE, propertiesOwned: 1, parents: 'near' }), policy).grants.split(' · ').slice(0, 3).join(' · '), 'First-timers · owns 1 home · near parents');
  assert.equal(s.loan, 'HDB loan · 25 years · no other loans');
  assert.equal(s.cpf, 'More CPF balances: not filled');
  assert.equal(summaries(COUPLE, policy).cpf, '', 'Simple: no Pro-only line');
  assert.equal(s.data, 'Export, import or forget');
  assert.match(summaries(H({ ...COUPLE, grantsOverride: 30000, parents: 'with', otherDebts: 500, loan: 'bank' }), policy).grants, /living with parents · your grant figure S\$30,000$/);
  assert.match(summaries(H({ ...COUPLE, otherDebts: 500, loan: 'bank' }), policy).loan, /^Bank loan · 25 years · other loans S\$500 a month$/);
  assert.equal(summaries(SENIOR, policy).cpf, 'CPF LIFE payout S$1,200 a month');
  assert.equal(summaries(H({ buyers: [B({ age: 70 })] }), policy).cpf, 'CPF LIFE payout: not filled');
  assert.doesNotMatch(summaries(H(), policy).grants, /est\. grants/, 'no estimate before an income');
  assert.equal(statusLine(H()), 'Saved only in this browser. Nothing is sent.');
  assert.equal(statusLine(COUPLE, { sample: true }), 'Sample household · 2 buyers · S$8,000 a month');
  assert.equal(statusLine(H(), { sample: true }), 'Sample household', 'a sample with no income: said once');
});

test('中文: every string of the page has an entry; a rendered page misses nothing', async () => {
  const dict = Object.assign({}, ...['zh-guide', 'zh', 'zh-explore', 'zh-engine'].map((n) => JSON.parse(read(`i18n/${n}.json`))));
  for (const s of [...formStrings(), ...groupStrings()]) assert.ok(dict[s], `missing 中文: ${s}`);
  globalThis.document ??= { documentElement: {} };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => ({ ok: true, json: async () => JSON.parse(read(u)) });
  try {
    await initI18n('zh');
    for (const h of [COUPLE, SENIOR, FOREIGN]) formHtml(h, policy, { pro: true, phone: true });
    formHtml(COUPLE, policy, { sample: true });
    assert.deepEqual(missingStrings(), []);
    assert.match(page(COUPLE), /<h2 id="hhTitle">我的资料<\/h2>/);
    assert.match(page(COUPLE), /2 位买家 · 每月 S\$8,000 · 只保存在此浏览器/);
  } finally { await initI18n('en'); globalThis.fetch = realFetch; }
});
