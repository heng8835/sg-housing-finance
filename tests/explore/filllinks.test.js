// Fill links (owner, Oct 2026): every empty-state prompt in the compare rows — a value missing only because an input is
// not given yet — is ONE link (app/core/filllink.js) whose data attributes map to a known field / target, on the desktop
// table and the phone cards alike (cards render the same r.f(m)). Audit: hdb-data-pipeline/docs/specs/fill-links-audit.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILL_TEXT, FILL_TARGETS, FLAT_FIELDS, FLAT_INPUT, knownFill, householdField, fillLink, householdLink, stripFillLinks, bindFillLinks, uiStrings } from '../../app/core/filllink.js';
import { createMoney, ROW_KEYS, phgCell } from '../../app/modules/explore/money.js';
import { cellHtml as cpfCell } from '../../app/modules/explore/cpflife.js';
import { briefSections, fileCell } from '../../app/modules/explore/brief.js';
import { cashShortLine } from '../../app/modules/afford/verdict.js';
import { policy } from '../helpers.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FT = ['1 ROOM', '2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE', 'MULTI-GENERATION'];
const fakeStore = (state) => ({ get: (k) => k.split('.').reduce((o, p) => (o == null ? o : o[p]), state), subscribe: () => () => {} });
const flat = (price) => ({ c: { id: 7, bid: 0, ft: 3, price, name: 'x' }, leaseNow: 80, cov: 0, b: {} });
const LINK = /<button type="button" class="link fill-link" data-fill="([a-z]+)"(?: data-field="([^"]*)")?(?: data-id="([^"]*)")?>([^<]*)<\/button>/g;
const linksIn = (html) => [...String(html).matchAll(LINK)].map(([, target, field, id, text]) => ({ target, field, id, text }));
const textOf = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

/** Every link in html: known target + field, one per cell, and the text is one of the fill wordings. */
function assertLinks(html, want, where) {
  const ls = linksIn(html);
  assert.equal(ls.length, 1, `${where}: exactly one fill link in ${html}`);
  for (const l of ls) {
    assert.ok(knownFill(l), `${where}: ${JSON.stringify(l)} maps to a known field / target`);
    if (want) assert.deepEqual({ target: l.target, field: l.field }, want, where);
  }
  return ls[0];
}

test('helper: known targets / fields, first empty buyer, markup', () => {
  assert.deepEqual(FILL_TARGETS, ['household', 'places', 'flat', 'rent']);
  for (const f of ['buyers.0.income', 'buyers.1.age', 'buyers.0.cpfOa', 'buyers.1.cpfLifeMonthly', 'cash', 'otherDebts', 'firstTimer', 'grantsOverride']) assert.ok(knownFill({ target: 'household', field: f }), f);
  for (const f of ['', 'buyers.x.income', 'income', 'buyers.0.salary']) assert.equal(knownFill({ target: 'household', field: f }), false, f);
  assert.ok(knownFill({ target: 'flat', field: 'facing' })); assert.equal(knownFill({ target: 'flat', field: 'colour' }), false);
  assert.ok(knownFill({ target: 'places' })); assert.ok(knownFill({ target: 'rent' })); assert.equal(knownFill({ target: 'map' }), false);
  for (const f of FLAT_FIELDS) assert.match(FLAT_INPUT[f], /^c[A-Z]/);
  const h = { buyers: [{ income: 5000, age: 30, cpfOa: 1 }, { income: '', age: null, citizenship: 'SC' }], cash: null };
  assert.equal(householdField(h, 'income'), 'buyers.1.income');
  assert.equal(householdField(h, 'age'), 'buyers.1.age');
  assert.equal(householdField(h, 'cpfOa'), 'buyers.1.cpfOa');
  assert.equal(householdField({ buyers: [{ citizenship: 'F' }, { citizenship: 'SC' }] }, 'cpfOa'), 'buyers.1.cpfOa', 'foreigners have no CPF');
  assert.equal(householdField(h, 'funds'), 'cash');
  assert.equal(householdField({ ...h, cash: 1000 }, 'funds'), 'buyers.1.cpfOa');
  assert.equal(householdField(null, 'income'), 'buyers.0.income');
  assert.equal(householdField(h, 'cash'), 'cash');
  assert.equal(fillLink({ target: 'flat', id: 3, field: 'facing', text: 'facing' }), '<button type="button" class="link fill-link" data-fill="flat" data-field="facing" data-id="3">Set the facing →</button>');
  assert.equal(householdLink(h, 'income', { small: true }), '<small><button type="button" class="link fill-link" data-fill="household" data-field="buyers.1.income">Add your income →</button></small>');
  assert.equal(stripFillLinks(`S$1<small>x</small>${householdLink(h, 'income', { small: true })}`), 'S$1<small>x</small>');
  for (const s of Object.values(FILL_TEXT)) assert.match(s, /^[A-Z].* →$/, `short, sentence case, ends with →: ${s}`);
});

test('click routing: household → household:open {field}; others → fill:open; unknown ignored', () => {
  const sent = [], bus = { emit: (n, p) => sent.push([n, p]) };
  let handler;
  bindFillLinks({ addEventListener: (_, fn) => { handler = fn; } }, bus);
  const click = (ds) => handler({ target: { closest: () => ({ dataset: ds }) }, preventDefault() {} });
  click({ fill: 'household', field: 'buyers.0.income' });
  click({ fill: 'places' });
  click({ fill: 'flat', field: 'facing', id: '4' });
  click({ fill: 'rent' });
  click({ fill: 'household', field: 'nonsense' });
  assert.deepEqual(sent, [['household:open', { field: 'buyers.0.income' }], ['fill:open', { target: 'places', field: '', id: null }],
    ['fill:open', { target: 'flat', field: 'facing', id: 4 }], ['fill:open', { target: 'rent', field: '', id: null }]]);
});

test('Compare money rows: every empty state is one fill link to the missing input (desktop table = phone cards: same r.f)', () => {
  const household = { scheme: 'family', firstTimer: true, propertiesOwned: 0, loan: 'hdb', tenure: 25, cash: null, buyers: [{ age: 30, citizenship: 'SC' }] };
  const mon = createMoney({ policy, store: fakeStore({ household, plan: {} }), D: { flat_types: FT }, year: () => 2026 });
  const R = Object.fromEntries(mon.rows().map((r) => [r.k, r])), m = flat(600000);
  for (const mode of ['f', 'fs']) {
    assert.equal(assertLinks(R[ROW_KEYS.monthly][mode](m), { target: 'household', field: 'buyers.0.income' }, 'monthly').text, 'Add your income →');
    assertLinks(R[ROW_KEYS.cash][mode](m), { target: 'household', field: 'cash' }, 'cash');
    assertLinks(R[ROW_KEYS.most][mode](m), { target: 'household', field: 'buyers.0.income' }, 'most');
    assertLinks(R[ROW_KEYS.verdict][mode](m), { target: 'household', field: 'buyers.0.income' }, 'verdict (income unknown)');
  }
  // numbers unchanged: the monthly instalment is still shown before the link
  assert.match(textOf(R[ROW_KEYS.monthly].f(m)), /^S\$[\d,]+ Add your income →$/);
  // with income + cash known: no fill link anywhere in the money rows
  const full = createMoney({ policy, store: fakeStore({ household: { ...household, cash: 300000, buyers: [{ age: 30, income: 9000, citizenship: 'SC', cpfOa: 90000 }] }, plan: {} }), D: { flat_types: FT }, year: () => 2026 });
  for (const r of full.rows()) assert.equal(linksIn(r.f(m)).length, 0, r.k);
  // PHG row, parents' place without a distance → "Tag your parents' home →" (Daily places)
  assertLinks(phgCell({ km: null, basis: null }, { grants: { items: [] } }), { target: 'places', field: undefined }, 'PHG');
});

test('Compare "CPF LIFE at 65": noage / nobalances / atpayout → household links on that buyer', () => {
  assertLinks(cpfCell({ ok: false, reason: 'noage', buyer: 1 }), { target: 'household', field: 'buyers.1.age' }, 'noage');
  assertLinks(cpfCell({ ok: false, reason: 'nobalances', buyer: 0 }), { target: 'household', field: 'buyers.0.cpfOa' }, 'nobalances');
  assertLinks(cpfCell({ ok: false, reason: 'atpayout', buyer: 0 }), { target: 'household', field: 'buyers.0.cpfLifeMonthly' }, 'atpayout');
  assert.equal(linksIn(cpfCell({ ok: false, reason: 'foreigner' })).length, 0, 'not an input: no link');
});

test('legacy compare rows (source scan): no old placeholders left; every fillLink call names a known target / field', () => {
  const src = readFileSync(join(ROOT, 'app/modules/explore/legacy.js'), 'utf8');
  for (const old of ["t('set age')", "t('set facing')", 'main windows face" on the flat', 'add daily places in the Shortlist tab']) assert.ok(!src.includes(old), old);
  const calls = [...src.matchAll(/fillLink\(\{ target: '(\w+)'(?:, id: [^,]+)?(?:, field: '(\w+)')?/g)];
  assert.ok(calls.length >= 3, 'facing, listing, daily places');
  for (const [, target, field] of calls) assert.ok(knownFill({ target, field }), `${target} ${field}`);
  assert.match(src, /householdLink\(store\.get\('household'\), 'age'\)/, 'lease to 95 → age');
});

test('every fill link in app source has a known target and literal fields are known', () => {
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.js')) files.push(p); } };
  walk(join(ROOT, 'app/modules')); walk(join(ROOT, 'app/core'));
  for (const p of files) {
    const s = readFileSync(p, 'utf8');
    for (const [, target] of s.matchAll(/fillLink\(\{ target: '(\w+)'/g)) assert.ok(FILL_TARGETS.includes(target), `${p}: ${target}`);
    for (const [, key] of s.matchAll(/householdLink\([^,]+, '(\w+)'/g)) assert.ok(knownFill({ target: 'household', field: householdField({}, key) }), `${p}: ${key}`);
    assert.ok(!/data-cpf-open/.test(s), `${p}: old CPF link attribute`);
  }
});

test('brief + files: fill links are not printed / exported (paper cannot be tapped)', () => {
  const link = fillLink({ target: 'flat', id: 1, field: 'facing', text: 'facing' });
  const rows = [{ sec: 'S' }, { k: 'Sun', f: () => link }, { k: 'Monthly', f: () => `S$2,000${householdLink(null, 'income', { small: true })}` }];
  const s = briefSections(rows, {}, { skip: new Set() });
  assert.deepEqual(s[0].rows.map((r) => [r.k, r.html]), [['Monthly', 'S$2,000']]);
  assert.equal(fileCell(link), '—');
  assert.equal(fileCell(`S$2,000${householdLink(null, 'income', { small: true })}`), 'S$2,000');
  assert.equal(fileCell('<span class="muted">n/a</span>'), 'n/a', 'other cells unchanged');
  assert.match(cashShortLine({ cashShort: null }, { cash: null }), /data-fill="household" data-field="cash">Add your savings to check the cash part\.</);
});

test('characterisation: compare-phase7c*.txt = 7b except empty-state cells (now link text); no number changes', () => {
  const read = (f) => readFileSync(join(ROOT, 'tests/fixtures', f), 'utf8').split(/\r?\n/);
  const NEW = new Set(Object.values(FILL_TEXT).map((x) => x));
  const OLD = new Set(['add daily places in the Shortlist tab', 'set "main windows face" on the flat', 'set facing', 'set age', '—', '— add CPF balances in Household', '— add ages in Household']);
  for (const [a, b] of [['compare-phase7b.txt', 'compare-phase7c.txt'], ['compare-phase7b-fv.txt', 'compare-phase7c-fv.txt'], ['compare-phase7b-nobto.txt', 'compare-phase7c-nobto.txt']]) {
    const o = read(a), n = read(b);
    assert.equal(o.length, n.length, b);
    const diff = o.map((_, i) => i).filter((i) => o[i] !== n[i]);
    assert.deepEqual(diff.map((i) => n[i].split(' | ')[0]), ['CPF LIFE at 65 (est.)i', 'Workplaces', 'Sun & heat (window facing)i', 'Outlook in facing directioni', 'Listing'], b);
    for (const i of diff) {
      const oc = o[i].split(' | '), nc = n[i].split(' | ');
      assert.equal(oc.length, nc.length);
      nc.forEach((c, j) => {
        if (c === oc[j]) return;
        assert.ok(OLD.has(oc[j]), `${b} ${nc[0]}: old cell "${oc[j]}" was an empty state`);
        assert.ok(NEW.has(c.replace(/^— /, '')), `${b} ${nc[0]}: new cell "${c}" is a fill link`);
      });
      assert.equal((o[i].match(/\d/g) || []).join(''), (n[i].match(/\d/g) || []).join(''), `${b}: no number changed`);
    }
  }
});

test('中文: every fill-link text and every sentence used as link text has an entry', () => {
  const zh = Object.assign({}, ...['zh.json', 'zh-explore.json', 'zh-engine.json', 'zh-guide.json'].map((f) => JSON.parse(readFileSync(join(ROOT, 'app/i18n', f), 'utf8'))));
  const sentences = ['Add your savings to check the cash part.', "Add the rent you'd pay to see this.", 'Add your household to see which are within your budget.'];
  for (const s of [...uiStrings(), ...sentences]) assert.ok(zh[s], `missing 中文: ${s}`);
  for (const s of uiStrings()) assert.match(zh[s], / →$/, `${s}: 中文 keeps the arrow`);
});
