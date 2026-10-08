// Guards the policy single source of truth (DEC-013).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createPolicy } from '../app/core/policy.js';
import { mergedDoc } from './helpers.js';

const doc = mergedDoc(); // main file + staged fragments
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = new Set(['VERIFIED', 'CORROBORATED', 'UNVERIFIED', 'ASSUMPTION']);

test('every param has a source, an effective date and a known status', () => {
  for (const p of doc.params) {
    assert.ok(p.id && p.unit, `${p.id}: id/unit`);
    assert.ok(p.value !== undefined, `${p.id}: value key present (null = not yet sourced)`);
    assert.match(p.effective_from, ISO, `${p.id}: effective_from`);
    assert.ok(p.effective_to == null || ISO.test(p.effective_to), `${p.id}: effective_to`);
    assert.ok(p.source_url, `${p.id}: source_url`);
    assert.match(p.retrieved, ISO, `${p.id}: retrieved`);
    assert.ok(STATUSES.has(p.status), `${p.id}: status ${p.status}`);
  }
});

test('no overlapping effective windows for the same id', () => {
  const byId = {};
  for (const p of doc.params) (byId[p.id] ||= []).push(p);
  for (const [id, list] of Object.entries(byId)) {
    const sorted = list.slice().sort((a, b) => a.effective_from.localeCompare(b.effective_from));
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = sorted[i - 1].effective_to;
      assert.ok(prevEnd != null && prevEnd < sorted[i].effective_from, `${id}: windows overlap`);
    }
  }
});

test('no duplicate entries: one row per (id, effective_from); repeated ids must be dated versions', () => {
  const seen = new Set();
  for (const p of doc.params) {
    const k = `${p.id}@${p.effective_from}`;
    assert.ok(!seen.has(k), `${p.id}: duplicate row for effective_from ${p.effective_from}`);
    seen.add(k);
  }
  const byId = {};
  for (const p of doc.params) (byId[p.id] ||= []).push(p);
  for (const [id, list] of Object.entries(byId)) {
    if (list.length < 2) continue;
    // every version except the newest must end before the next starts (otherwise it is an accidental copy)
    const open = list.filter((p) => p.effective_to == null);
    assert.ok(open.length <= 1, `${id}: ${open.length} open-ended versions — close the older one with effective_to`);
  }
});

test('UNVERIFIED rules carry no value (app/CLAUDE.md: value null until read on an official page)', () => {
  const bad = doc.params.filter((p) => p.status === 'UNVERIFIED' && p.value !== null).map((p) => p.id);
  assert.deepEqual(bad, [], `UNVERIFIED with a value: ${bad.join(', ')} — source it (VERIFIED) or set value null`);
});

// Go-live D1 = c (owner 2026-10-08): launched before the January refresh, so an overdue review warns (CI annotation +
// the app's "Rules last checked … due for review" line) instead of freezing deploys. POLICY_STRICT=1 makes it fail again.
test('policy review is not overdue', (t) => {
  const overdue = !(new Date(doc.review_due) > new Date());
  const msg = `review_due ${doc.review_due} has passed — re-check every source`;
  if (overdue && process.env.POLICY_STRICT !== '1') {
    t.diagnostic(`WARNING ${msg}`);
    if (process.env.GITHUB_ACTIONS) process.stdout.write(`::warning title=Policy review overdue::${msg}
`);
    return;
  }
  assert.ok(!overdue, msg);
});

test('unknown ids throw instead of falling back', () => {
  const p = createPolicy(doc, new Date());
  assert.throws(() => p.get('no.such.rule'), /no value/);
});

test('engine code contains no policy-looking numeric literals', () => {
  const ALLOWED = new Set(['0', '1', '2', '12', '100']); // months, cents
  const dir = new URL('../app/engine/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const code = readFileSync(new URL(file, dir), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""');
    const bad = (code.match(/(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g) || []).filter((n) => !ALLOWED.has(n));
    assert.deepEqual(bad, [], `${file}: move ${bad.join(', ')} into policy/sg-policy.json`);
  }
});
