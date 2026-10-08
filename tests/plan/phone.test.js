// Phone overhaul §3.7 (P-45 to P-47): Plan on a phone — a jump row for the cards present, CPF & retirement and the
// Start here goal's card open by default, every card a remembered fold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { CARDS, GOAL_CARD, jumpRowHtml, openByDefault, foldKey, phoneStrings, PHONE_MQ } from '../../app/modules/plan/phone.js';

test('jump row: CPF · Sell & buy · Key dates · Retirement · Schools · BTO, only the cards present', () => {
  assert.deepEqual(CARDS.map((c) => c.chip), ['CPF', 'Sell & buy', 'Key dates', 'Retirement', 'Schools', 'BTO']);
  const all = CARDS.map((c) => ({ id: c.id, proOnly: false }));
  const html = jumpRowHtml(all, false);
  assert.equal((html.match(/class="chip"/g) || []).length, 6);
  assert.match(html, /^<nav class="pl-jump" aria-label="Plan sections">/);
  assert.match(html, /data-jump="planCpf">CPF</);
  assert.match(html, /data-jump="planSellBuy">Sell &amp; buy</);
  const some = jumpRowHtml([{ id: 'planCpf', proOnly: false }, { id: 'planSeniors', proOnly: true }, { id: 'planBto', proOnly: false }], true);
  assert.doesNotMatch(some, /planSeniors/, 'a Pro-only card has no chip in Simple');
  assert.equal((some.match(/class="chip"/g) || []).length, 2);
  assert.equal(jumpRowHtml([{ id: 'planCpf', proOnly: false }], false), '', 'one card: no jump row');
});

test('open by default: CPF & retirement and the Start here goal card; fold keys are per card', () => {
  assert.ok(openByDefault('planCpf', null));
  assert.ok(!openByDefault('planBto', null));
  assert.ok(openByDefault('planBto', 'btoVsResale'));
  assert.ok(openByDefault('planSellBuy', 'sellUpgrade'));
  assert.ok(!openByDefault('planSellBuy', 'buyResale'));
  for (const id of Object.values(GOAL_CARD)) assert.ok(CARDS.some((c) => c.id === id));
  assert.equal(foldKey('planDates'), 'pl-planDates');
  assert.equal(PHONE_MQ, '(max-width: 767px)');
});

test('the Plan cards keep their ids (tours, plan:show and the Start here goals scroll to them)', () => {
  const src = ['cpf', 'sellbuy', 'keydates', 'seniors', 'schools', 'bto'].map((f) => readFileSync(new URL(`../../app/modules/plan/${f}.js`, import.meta.url), 'utf8')).join('\n');
  for (const c of CARDS) assert.match(src, new RegExp(`id="${c.id}"`), c.id);
});

test('中文: every new Plan phone string has an entry (i18n or staging)', () => {
  const app = new URL('../../app/', import.meta.url);
  const read = (p) => JSON.parse(readFileSync(new URL(p, app), 'utf8'));
  const staged = (existsSync(new URL('i18n/staging/', app)) ? readdirSync(new URL('i18n/staging/', app)) : []).filter((f) => f.endsWith('.json')).map((f) => read(`i18n/staging/${f}`));
  const dict = Object.assign({}, ...['zh', 'zh-explore', 'zh-engine', 'zh-guide'].map((n) => read(`i18n/${n}.json`)), ...staged);
  const extra = ['e.g. {0}', 'Median here: {0}', 'Rent as a share of the price (gross yield)'];
  assert.deepEqual([...phoneStrings(), ...extra].filter((k) => !dict[k]), []);
});
