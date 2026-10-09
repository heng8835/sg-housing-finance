// 7c C12 sell-then-buy glossary: contra, extension of stay, bridging loan, Intent to Sell, resale levy — in English and
// 中文, rule values only through {policy:id} (no typed numbers anywhere in the text), linked from the Plan sell-buy card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergedDoc } from './helpers.js';

const IDS = ['contra', 'extension-of-stay', 'bridging-loan', 'intent-to-sell', 'resale-levy'];
const read = (f) => JSON.parse(readFileSync(new URL(`../app/content/${f}`, import.meta.url), 'utf8')).terms;
const en = read('content.json'), zh = read('content.zh.json');
const policyIds = new Set(mergedDoc().params.map((p) => p.id));

test('the five sell-buy terms are in the glossary, in English and 中文', () => {
  for (const id of IDS) {
    assert.ok(en[id], `missing ${id}`);
    assert.ok(zh[id], `missing 中文 ${id}`);
    assert.match(zh[id].term, /[一-鿿]/, `${id}: 中文 term`);
    assert.notEqual(zh[id].body, en[id].body, `${id}: 中文 body translated`);
    for (const r of en[id].related) assert.ok(en[r], `${id}: related ${r} exists`);
  }
});

test('rule values only via {policy:id}: no digits in the text, every placeholder resolves', () => {
  for (const [lang, terms] of [['en', en], ['zh', zh]]) {
    for (const id of IDS) {
      const x = terms[id], text = `${x.term} ${x.short} ${x.body}`;
      for (const [, pid] of text.matchAll(/\{policy:([a-z0-9_.-]+)\}/gi)) assert.ok(policyIds.has(pid), `${lang} ${id}: ${pid}`);
      const plain = text.replace(/\{policy:[^}]+\}/g, '').replace(/<[^>]+>/g, '').replace(/https?:\S+/g, '');
      assert.doesNotMatch(plain, /\d/, `${lang} ${id}: put numbers in {policy:…} placeholders`);
    }
  }
  assert.deepEqual(en['extension-of-stay'].policy_keys, ['sellbuy.extension_of_stay.max_months']);
  assert.deepEqual(en['intent-to-sell'].policy_keys, ['sellbuy.intent_to_sell.days_before_otp']);
  assert.deepEqual(en['resale-levy'].policy_keys, ['sellbuy.resale_levy']);
});

test('the Plan sell-buy card links the terms (an ⓘ via data-term)', () => {
  const src = (f) => readFileSync(new URL(`../app/modules/plan/${f}`, import.meta.url), 'utf8');
  for (const id of ['intent-to-sell', 'contra', 'extension-of-stay', 'bridging-loan']) assert.match(src('contra.js'), new RegExp(`'${id}'|"${id}"|data-term="${id}"`));
  assert.match(src('sellbuy.js'), /data-term=\\?"resale-levy\\?"/);
});
