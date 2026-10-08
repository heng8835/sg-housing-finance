import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, STORE_KEY, LEGACY_KEY } from '../../app/core/store.js';

const memory = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
};

test('fresh store has defaults and Simple mode', () => {
  const s = createStore({ storage: memory() });
  assert.equal(s.get('household.loan'), 'hdb');
  assert.equal(s.get('ui.mode'), 'simple');
  assert.equal(s.get('focus'), null);
  assert.equal(s.get('ui.panelWidth'), null);
  assert.deepEqual(s.get('ui.guide'), { offered: false, done: {} });
});

test('panel width persists in sghf:v2, older saves gain the new ui defaults, reset forgets it', () => {
  const storage = memory({ [STORE_KEY]: JSON.stringify({ schemaVersion: 1, household: {}, ui: { mode: 'pro' } }) });
  const a = createStore({ storage });
  assert.equal(a.get('ui.mode'), 'pro');
  assert.equal(a.get('ui.panelWidth'), null);
  assert.equal(a.get('ui.guide.offered'), false);
  a.set('ui.panelWidth', 520);
  assert.equal(JSON.parse(storage.map.get(STORE_KEY)).ui.panelWidth, 520);
  assert.equal(createStore({ storage }).get('ui.panelWidth'), 520);
  a.reset();
  assert.equal(a.get('ui.panelWidth'), null);
});

test('migrates the v1.8 profile once, flags cash for review, keeps typed grants', () => {
  const legacy = JSON.stringify({ profile: { income: 9000, cash: 150000, age: 32, grants: 30000, loan: 'bank', tenure: 20 } });
  const s = createStore({ storage: memory({ [LEGACY_KEY]: legacy }) });
  assert.equal(s.get('household.buyers.0.income'), 9000);
  assert.equal(s.get('household.buyers.0.age'), 32);
  assert.equal(s.get('household.cash'), 150000);
  assert.equal(s.get('household.needsReview'), true);
  assert.equal(s.get('household.grantsOverride'), 30000);
  assert.equal(s.get('household.loan'), 'bank');
  assert.equal(s.get('household.tenure'), 20);
  assert.equal(s.get('ui.mode'), 'pro');
});

test('set persists and survives a reload; legacy is not re-imported', () => {
  const storage = memory({ [LEGACY_KEY]: JSON.stringify({ profile: { income: 9000 } }) });
  const a = createStore({ storage });
  a.set('household.buyers.0.income', 12000);
  const b = createStore({ storage });
  assert.equal(b.get('household.buyers.0.income'), 12000);
});

test('subscribers hear changes under their prefix only', () => {
  const s = createStore({ storage: memory() });
  const heard = [];
  s.subscribe('household', (v, path) => heard.push(path));
  s.set('household.cash', 1000);
  s.set('ui.mode', 'pro');
  assert.deepEqual(heard, ['household.cash']);
});

test('corrupt saved state falls back to defaults', () => {
  const s = createStore({ storage: memory({ [STORE_KEY]: '{not json' }) });
  assert.equal(s.get('household.scheme'), 'family');
});

test('import rejects foreign files and changes nothing', () => {
  const s = createStore({ storage: memory() });
  s.set('household.cash', 5);
  assert.throws(() => s.import({ hello: 1 }), /not an export/);
  assert.equal(s.get('household.cash'), 5);
});

test('export → import round-trips', () => {
  const a = createStore({ storage: memory() });
  a.set('household.cash', 77000);
  a.set('focus', { source: 'price', price: 600000, label: 'typed' });
  const b = createStore({ storage: memory() });
  b.import(a.export());
  assert.deepEqual(b.export(), a.export());
});

test('reset forgets both the store and the legacy key', () => {
  const storage = memory({ [LEGACY_KEY]: JSON.stringify({ profile: { income: 1 } }) });
  const s = createStore({ storage });
  s.set('household.cash', 1);
  s.reset();
  assert.equal(storage.map.has(STORE_KEY), false);
  assert.equal(storage.map.has(LEGACY_KEY), false);
  assert.equal(s.get('household.cash'), null);
});

// ---------------------------------------------------------------- named scenarios (Phase 6b, AC 6)
const snap = (o = {}) => ({ name: 'Bishan 4R', savedAt: '2026-10-07T01:00:00.000Z', focus: { price: 720000, flatType: '4 ROOM', isDefault: false }, household: { loan: 'hdb', tenure: 25, buyers: [{ age: 30 }] }, plan: { cpf: {} }, market: { rent: null }, ...o });

test('scenarios: empty by default; older saves without the slot gain it; garbage is dropped', () => {
  assert.deepEqual(createStore({ storage: memory() }).get('scenarios'), []);
  const old = memory({ [STORE_KEY]: JSON.stringify({ schemaVersion: 1, household: { cash: 5 }, ui: { mode: 'pro' } }) });
  const a = createStore({ storage: old });
  assert.deepEqual(a.get('scenarios'), []);
  assert.equal(a.get('household.cash'), 5);
  const bad = memory({ [STORE_KEY]: JSON.stringify({ schemaVersion: 1, household: {}, scenarios: [{ id: 'Z', ...snap() }, { id: 'B', ...snap() }, { id: 'B', ...snap({ name: 'dup' }) }, { id: 'A', focus: { price: 0 }, household: {} }, 'x'] }) });
  const b = createStore({ storage: bad });
  assert.deepEqual(b.get('scenarios').map((s) => [s.id, s.name]), [['B', 'Bishan 4R']]);
  assert.deepEqual(createStore({ storage: memory({ [STORE_KEY]: JSON.stringify({ schemaVersion: 1, household: {}, scenarios: 'nope' }) }) }).get('scenarios'), []);
});

test('scenarios: save takes the first free id, persists in sghf:v2, stops at four', () => {
  const storage = memory();
  const s = createStore({ storage });
  const seen = [];
  assert.equal(s.saveScenario((id) => { seen.push(id); return snap({ name: `${id}: one` }); }), 'A');
  assert.equal(s.saveScenario(snap()), 'B');
  assert.equal(s.saveScenario(snap()), 'C');
  assert.equal(s.deleteScenario('B'), true);
  assert.equal(s.nextScenarioId(), 'B');
  assert.equal(s.saveScenario(snap()), 'B');
  assert.equal(s.saveScenario(snap()), 'D');
  assert.equal(s.nextScenarioId(), null);
  assert.equal(s.saveScenario(() => assert.fail('build must not run when full')), null);
  assert.deepEqual(s.get('scenarios').map((x) => x.id), ['A', 'B', 'C', 'D']);
  assert.deepEqual(seen, ['A']);
  const saved = JSON.parse(storage.map.get(STORE_KEY));
  assert.equal(saved.scenarios.length, 4);
  assert.equal(saved.scenarios[0].name, 'A: one');
  assert.deepEqual(createStore({ storage }).get('scenarios'), s.get('scenarios'));
});

test('scenarios: a snapshot without a priced flat or household is refused', () => {
  const s = createStore({ storage: memory() });
  assert.equal(s.saveScenario(snap({ focus: { price: null } })), null);
  assert.equal(s.saveScenario(snap({ household: null })), null);
  assert.deepEqual(s.get('scenarios'), []);
});

test('scenarios: rename trims and caps the name, blank keeps it; delete; subscribers hear it', () => {
  const s = createStore({ storage: memory() });
  const heard = [];
  s.subscribe('scenarios', (v) => heard.push(v.length));
  s.saveScenario(snap());
  assert.equal(s.renameScenario('A', '  Near parents  '), true);
  assert.equal(s.get('scenarios.0.name'), 'Near parents');
  assert.equal(s.renameScenario('A', '   '), false);
  assert.equal(s.get('scenarios.0.name'), 'Near parents');
  assert.equal(s.renameScenario('C', 'x'), false);
  s.renameScenario('A', 'x'.repeat(200));
  assert.equal(s.get('scenarios.0.name').length, 60);
  assert.equal(s.deleteScenario('C'), false);
  assert.equal(s.deleteScenario('A'), true);
  assert.deepEqual(s.get('scenarios'), []);
  assert.deepEqual(heard, [1, 1, 1, 0]);
});

test('scenarios: included in export / import, cleared by Forget my data', () => {
  const a = createStore({ storage: memory() });
  a.saveScenario(snap());
  a.saveScenario(snap({ name: 'two' }));
  const file = a.export();
  assert.equal(file.scenarios.length, 2);
  const storage = memory();
  const b = createStore({ storage });
  b.import(file);
  assert.deepEqual(b.get('scenarios'), a.get('scenarios'));
  b.import({ ...file, scenarios: [{ id: 'Q' }] });
  assert.deepEqual(b.get('scenarios'), []);
  b.import(file);
  b.reset();
  assert.deepEqual(b.get('scenarios'), []);
  assert.equal(storage.map.has(STORE_KEY), false);
});
