// 7c C9 rules page for people: Simple shows no rule ids and no "rules file" wording — topics in plain words and an
// "Assumptions (fixed)" list; Pro is the full log, unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logHtml, inlineValue, SIMPLE_HOSTS } from '../../app/modules/guides/log.js';
import { sourcesHtml } from '../../app/modules/guides/render.js';
import { policy } from '../helpers.js';

const today = '2026-10-09';
const ids = policy.params().map((p) => p.id);
const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/https?:[^"\s<]+/g, '');

test('Simple: no policy ids (no cpf.alloc), no "rules file"; assumptions listed as fixed', () => {
  const html = logHtml(policy, { today, simple: true });
  assert.doesNotMatch(html, /cpf\.alloc/);
  assert.doesNotMatch(html, /pl-id|<code/);
  assert.doesNotMatch(html, /rules file/i);
  const plain = textOf(html);
  for (const id of ids) assert.ok(!plain.includes(id), `id shown in Simple: ${id}`);
  assert.match(html, /Assumptions \(fixed\)/);
  assert.match(html, /Rules from official pages/);
  const fixed = policy.params().filter((p) => p.status === 'ASSUMPTION').length;
  assert.equal((html.split('Assumptions (fixed)')[1].match(/class="pl-item"/g) || []).length, fixed);
  assert.ok(SIMPLE_HOSTS >= 1);
});

test('Pro: the full log with ids, as before', () => {
  const html = logHtml(policy, { today });
  assert.match(html, /<code class="pl-id">cpf\.alloc\.ratios<\/code>/);
  assert.match(html, /Rules file/);
  assert.equal(logHtml(policy, { today, simple: false }), html);
});

test('guide step sources: Simple has no id in the tooltip and no rules-file version', () => {
  const pro = sourcesHtml(['ratio.msr.cap'], policy), simple = sourcesHtml(['ratio.msr.cap'], policy, { simple: true });
  assert.match(pro, /ratio\.msr\.cap/);
  assert.match(pro, /rules file/);
  assert.doesNotMatch(simple, /ratio\.msr\.cap|rules file/);
  assert.match(simple, /Sources/);
});

test('inline value for a small table', () => {
  assert.equal(inlineValue({ value: { base: 0.02, optimistic: 0.03 }, unit: 'annual rate' }), 'base 2% · optimistic 3%');
  assert.equal(inlineValue({ value: 0.02, unit: 'rate' }), null);
  assert.equal(inlineValue({ value: { a: { b: 1 } }, unit: 'x' }), null);
});
