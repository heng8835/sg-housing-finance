// S1a: one display helper for HDB flat-type / storey codes (app/core/flattype.js) + the reviewed compare fixture diff
// (hdb-data-pipeline/docs/specs/flattype-labels-diff.md): committed 7c → 7d = labels only, no number changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flatTypeLabel, flatTypeEnglish, flatTypeShort, storeyLabel, storeyRange, FLATTYPE_STRINGS } from '../../app/core/flattype.js';
import { build, JOBS } from '../fixtures/gen/flattype_fixture.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

test('flatTypeLabel: HDB codes in sentence case; unknown codes unchanged', () => {
  assert.deepEqual(['1 ROOM', '2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE', 'MULTI-GENERATION'].map(flatTypeLabel),
    ['1-room', '2-room', '3-room', '4-room', '5-room', 'Executive', 'Multi-generation']);
  assert.equal(flatTypeLabel('TERRACE'), 'TERRACE');
  assert.equal(flatTypeLabel(null), '');
  assert.equal(flatTypeEnglish('4 ROOM'), '4-room');
  assert.deepEqual(['4 ROOM', 'EXECUTIVE', 'MULTI-GENERATION'].map(flatTypeShort), ['4-room', 'Exec.', 'Multi-gen']);
});

test('storeyLabel / storeyRange: "31 TO 33" → "storey 31–33" / "31–33"; leading zeros dropped; other text unchanged', () => {
  assert.equal(storeyLabel('31 TO 33'), 'storey 31–33');
  assert.equal(storeyLabel('01 TO 03'), 'storey 1–3');
  assert.equal(storeyRange('01 TO 03'), '1–3');
  assert.equal(storeyLabel('40'), '40');
  assert.equal(storeyRange(undefined), '');
});

test('中文: every key the helper looks up has a translation (4 ROOM → 4房式, as before)', () => {
  const zh = Object.assign({}, ...['zh.json', 'zh-explore.json', 'zh-engine.json', 'zh-guide.json'].map((f) => JSON.parse(readFileSync(join(ROOT, 'app/i18n', f), 'utf8'))));
  for (const k of FLATTYPE_STRINGS) assert.ok(zh[k], `missing zh for ${k}`);
  assert.equal(zh['4-room'], zh['4 ROOM']);
});

test('characterisation: compare-phase7d*.txt = 7c with flat-type / storey labels only (no number changes)', () => {
  const NUMS = /S\$[\d,.]+k?|[+-]?\d+(?:\.\d+)?%|\d+(?:\.\d+)? (?:y|m|km|sqm|pp)\b/g;
  for (const [a, b] of JOBS) {
    const old = readFileSync(join(ROOT, 'tests/fixtures', a), 'utf8'), now = readFileSync(join(ROOT, 'tests/fixtures', b), 'utf8');
    assert.equal(build(old), now, `${b} is not 7c with the label rewrite`);
    const o = old.split(/\r?\n/), n = now.split(/\r?\n/);
    assert.equal(o.length, n.length);
    const changed = o.map((l, i) => [l, n[i]]).filter(([x, y]) => x !== y);
    assert.ok(changed.length >= 5 && changed.length <= 8, `${b}: ${changed.length} lines changed`);
    for (const [x, y] of changed) {
      assert.match(x, /\d ROOM|EXECUTIVE|MULTI-GENERATION|\d+ TO \d+/);
      assert.deepEqual(y.match(NUMS), x.match(NUMS), `numbers changed in: ${y.slice(0, 60)}`);
    }
  }
});
