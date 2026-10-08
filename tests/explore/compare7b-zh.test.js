// Phase 7b COMPARE items (B1, B4, B12, B13): every new English string has a 中文 entry — in the dictionaries or, until
// the integrator merges it, in app/i18n/staging/COMPARE.<target>.json — with the same {n} placeholders.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { TICKS, FOOT } from '../../app/modules/explore/priorities.js';
import { PLACE_KINDS, PHG_HINT } from '../../app/modules/explore/places.js';
import { PHG_KEY } from '../../app/modules/explore/money.js';
import { PHG_NOTES } from '../../app/engine/grants.js';

const lsStaging = (u) => (existsSync(u) ? readdirSync(u) : []); // staging is empty once the integrator merged it
const I18N = new URL('../../app/i18n/', import.meta.url);
const json = (u) => JSON.parse(readFileSync(u, 'utf8'));
const dict = Object.assign({}, ...['zh.json', 'zh-explore.json', 'zh-engine.json', 'zh-guide.json'].map((f) => json(new URL(f, I18N))),
  ...lsStaging(new URL('staging/', I18N)).filter((f) => f.startsWith('COMPARE.')).map((f) => json(new URL(`staging/${f}`, I18N))));
const ph = (s) => (s.match(/\{\d\}/g) || []).sort().join();
const FILES = ['priorities.js', 'places.js', 'briefmoney.js', 'money.js', 'comparables.js', 'brief.js'];

test('中文: every t() string of the 7b COMPARE files + tick / place labels + engine PHG notes', () => {
  const keys = new Set([...TICKS.map((x) => x.label).filter((l) => l !== 'Commute'), ...PLACE_KINDS.map((x) => x[1]), PHG_HINT, PHG_KEY, FOOT, ...Object.values(PHG_NOTES)]);
  for (const f of FILES) {
    const src = readFileSync(new URL(`../../app/modules/explore/${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) keys.add(m[1].replace(/\\'/g, "'"));
    for (const m of src.matchAll(/\bt\("([^"]*)"/g)) keys.add(m[1]);
  }
  const missing = [...keys].filter((k) => /[A-Za-z]/.test(k) && !dict[k]);
  assert.deepEqual(missing, []);
  for (const k of keys) if (dict[k]) assert.equal(ph(dict[k]), ph(k), k);
  for (const f of lsStaging(new URL('staging/', I18N)).filter((x) => x.startsWith('COMPARE.'))) {
    for (const [k, v] of Object.entries(json(new URL(`staging/${f}`, I18N)))) assert.doesNotMatch(v, /你/, `${f}: ${k} uses 您`);
  }
});
