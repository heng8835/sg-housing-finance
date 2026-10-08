// "Forget my data" (household drawer → store.reset()) must leave no app key in localStorage (go-live §3.1).
// 1. static: every localStorage key the app source can write is in APP_KEYS (a new key fails here until reset covers it)
// 2. dynamic: fill every key, reset, list what is left — only foreign keys; the next start does not bring data back
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, sep } from 'node:path';
import { createStore, applySampleBoot, STORE_KEY, LEGACY_KEY, SAMPLE_KEY, SANDBOXED_KEYS } from '../../app/core/store.js';

const APP = fileURLToPath(new URL('../../app/', import.meta.url));
const APP_KEYS = ['hdb-comparer', 'sghf:sample', 'sghf:v2'];

const memory = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
};
const keys = (s) => [...s.map.keys()].sort();

const sources = () => readdirSync(APP, { recursive: true })
  .filter((f) => f.endsWith('.js') && !f.split(sep).includes('data'))
  .map((f) => ({ f, text: readFileSync(join(APP, f), 'utf8') }));

test('the app writes only the known localStorage keys', () => {
  assert.deepEqual([STORE_KEY, LEGACY_KEY, SAMPLE_KEY].sort(), APP_KEYS);
  const found = new Set();
  const setters = [];
  for (const { f, text } of sources()) {
    for (const m of text.matchAll(/['"`](sghf:[\w.-]+|hdb-comparer)['"`]/g)) found.add(m[1]);
    for (const m of text.matchAll(/(?:localStorage|storage)\.setItem\(\s*([^,]+),/g)) setters.push([f, m[1].trim()]);
  }
  assert.deepEqual([...found].sort(), APP_KEYS, 'a new storage key needs adding to store.reset() and APP_KEYS');
  // setItem's key is always one of the constants (k / key are bound to STORE_KEY / SANDBOXED_KEYS in store.js)
  const allowed = new Set(["'hdb-comparer'", 'LEGACY_KEY', 'SAMPLE_KEY', 'k', 'key']);
  for (const [f, arg] of setters) assert.ok(allowed.has(arg), `${f}: setItem(${arg}, …) — unknown key`);
  assert.deepEqual(SANDBOXED_KEYS, [STORE_KEY, LEGACY_KEY]);
});

test('Forget my data leaves no app key behind — listed after reset', () => {
  const backup = { [STORE_KEY]: JSON.stringify({ schemaVersion: 1, household: { buyers: [{ income: 987654 }] } }), [LEGACY_KEY]: '{"choices":[1]}' };
  const s = memory({
    [LEGACY_KEY]: JSON.stringify({ choices: [{ bid: 1, name: 'ZZPRIVATE' }], views: [{ name: 'home' }] }),
    // an 'exit' record still waiting for the next start: without removal it would restore the backup after a forget
    [SAMPLE_KEY]: JSON.stringify({ id: 'young-couple', phase: 'exit', backup }),
    'other-site:pref': 'keep',
  });
  const store = createStore({ storage: s });
  store.set('household.buyers', [{ age: 30, income: 987654, cpfOa: 876543 }]);
  store.set('household.cash', 765432);
  store.set('ui.lang', 'zh');
  store.set('ui.textSize', 'large');
  assert.deepEqual(keys(s), ['hdb-comparer', 'other-site:pref', 'sghf:sample', 'sghf:v2']);

  store.reset();
  assert.deepEqual(keys(s), ['other-site:pref'], 'only foreign keys survive');
  assert.equal(store.get('household.cash'), createStore({ storage: memory() }).get('household.cash'));

  // the reload after Forget: nothing comes back
  assert.equal(applySampleBoot(s), null);
  const again = createStore({ storage: s });
  assert.deepEqual(keys(s), ['other-site:pref']);
  assert.notEqual(again.get('household.cash'), 765432);
  assert.equal(JSON.stringify(again.get('household')).includes('987654'), false);
});

test('an unreadable sample record is forgotten too', () => {
  const s = memory({ [STORE_KEY]: '{}', [SAMPLE_KEY]: 'not json' });
  createStore({ storage: s }).reset();
  assert.deepEqual(keys(s), []);
});

test('while a sample is on, Forget is refused and removes nothing', () => {
  const s = memory({ [STORE_KEY]: '{"x":1}', [LEGACY_KEY]: '{}', [SAMPLE_KEY]: JSON.stringify({ id: 'young-couple', phase: 'active', backup: { [STORE_KEY]: null, [LEGACY_KEY]: null } }) });
  const store = createStore({ storage: s });
  assert.throws(() => store.reset(), /Exit the sample first/);
  assert.deepEqual(keys(s), ['hdb-comparer', 'sghf:sample', 'sghf:v2']);
});
