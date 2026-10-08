// CPF-11 compare row "CPF LIFE at 65 (est.)" (modules/explore/cpflife.js) and the Plan → CPF headline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCpfLife, cellHtml, signedMoney, ROW_KEY } from '../../app/modules/explore/cpflife.js';
import { lifePayoutDelta, PAYOUT_REASONS } from '../../app/engine/cpfpayout.js';
import { cpfSection } from '../../app/modules/plan/cpf.js';
import { CPF_DEFAULTS } from '../../app/core/cpf-defaults.js';
import { policy } from '../helpers.js';

const strip = (h) => h.replace(/<small>/g, '\n').replace(/<\/small>/g, '\n').replace(/<[^>]+>/g, '').split('\n').map((s) => s.trim()).filter(Boolean).join(' ');
const D = { flat_types: ['1 ROOM', '2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE'] };
const couple = { scheme: 'family', firstTimer: true, parents: 'none', propertiesOwned: 0, loan: 'hdb', tenure: 25, otherDebts: 0, cash: 60000, grantsOverride: null,
  buyers: [{ age: 32, income: 5000, citizenship: 'SC', cpfOa: 60000, cpfSa: 20000 }, { age: 30, income: 4000, citizenship: 'SC', cpfOa: 40000, cpfSa: 15000 }] };
const fakeStore = (household, plan = { cpf: {} }) => ({ get: (k) => ({ household, plan }[k]), subscribe: () => () => {} });
const mk = (household) => createCpfLife({ policy, store: fakeStore(household), bus: { emit() {} }, D, year: () => 2026 });
const m = (price, ft, leaseNow) => ({ c: { price, ft }, leaseNow });

test('cell text: delta headline + without → with (estimate); no change; missing inputs', () => {
  const ok = { ok: true, delta: -310, without: { monthly: 1450 }, withBuy: { monthly: 1140 } };
  assert.equal(strip(cellHtml(ok)), '≈ −S$310/mo vs not buying S$1,450 → S$1,140/mo (estimate)');
  assert.equal(strip(cellHtml({ ...ok, delta: 0, withBuy: { monthly: 1450 } })), 'no change vs not buying S$1,450 → S$1,450/mo (estimate)');
  assert.equal(signedMoney(-310), '−S$310'); assert.equal(signedMoney(25), '+S$25');
  const nb = cellHtml({ ok: false, reason: 'nobalances', buyer: 1 });
  assert.equal(strip(nb), '— add CPF balances in Household');
  assert.match(nb, /data-cpf-open="buyers\.1\.cpfOa"/);
  assert.match(cellHtml({ ok: false, reason: 'noage', buyer: 0 }), /data-cpf-open="buyers\.0\.age"/);
  assert.equal(strip(cellHtml({ ok: false, reason: 'foreigner' })), '— no CPF LIFE for foreigners');
  assert.equal(cellHtml({ ok: false, reason: 'noplan' }), '—');
  assert.equal(cellHtml(null), '—');
});

test('row: label from policy, engine numbers per flat, best = smallest reduction', () => {
  const row = mk(couple).row();
  assert.equal(row.k, ROW_KEY);
  assert.equal(row.lbl, `CPF LIFE at ${policy.get('cpf.age.life_payout')} (est.)`);
  assert.equal(row.best, 'max'); assert.equal(row.simple, true);
  const a = m(720000, 3, 75), b = m(380000, 2, 75);
  const want = lifePayoutDelta({ household: couple, flat: { price: 720000, flatType: '4 ROOM', remainingLease: 75 }, settings: {}, defaults: CPF_DEFAULTS, year: 2026 }, policy);
  assert.equal(row.v(a), want.delta);
  assert.equal(strip(row.f(a)), strip(cellHtml(want)));
  assert.ok(row.v(a) < 0 && row.v(b) >= row.v(a), 'the cheaper flat reduces the payout less → max delta wins');
});

test('row without CPF balances: "—" + link, and no v (not counted as a measure, no best)', () => {
  const seedLike = { buyers: [{ age: 32, income: 9000, citizenship: 'SC', cpfOa: null }], cash: 150000, loan: 'hdb', tenure: 25 };
  const row = mk(seedLike).row();
  assert.equal(row.v, undefined); assert.equal(row.best, undefined);
  assert.equal(strip(row.f(m(720000, 3, 59.3))), '— add CPF balances in Household');
});

test('insert: end of "Can we afford it?" (after "Most you can pay"), else before the next section', () => {
  const life = mk(couple);
  const r = life.insert([{ sec: 'Can we afford it?' }, { k: 'Loan' }, { k: 'Most you can pay' }, { sec: 'Lease & future value' }]);
  assert.deepEqual(r.map((x) => x.k || x.sec), ['Can we afford it?', 'Loan', 'Most you can pay', ROW_KEY, 'Lease & future value']);
  const r2 = life.insert([{ sec: 'Can we afford it?' }, { k: 'Loan' }, { sec: 'Lease & future value' }]);
  assert.deepEqual(r2.map((x) => x.k || x.sec), ['Can we afford it?', 'Loan', ROW_KEY, 'Lease & future value']);
});

test('Plan → CPF: household headline = the same engine delta for the focus flat', () => {
  const f = { source: 'price', label: 'My pick', price: 720000, flatType: '4 ROOM', remainingLease: 75 };
  const html = cpfSection({ h: couple, tf: f, plan: { cpf: {} }, policy, today: '2026-10-07' });
  const r = lifePayoutDelta({ household: couple, flat: f, settings: {}, defaults: CPF_DEFAULTS, year: 2026 }, policy);
  assert.ok(r.ok && r.delta < 0);
  const txt = strip(html);
  assert.ok(txt.includes(`≈ ${signedMoney(r.delta)} a month`), txt.slice(0, 400));
  assert.ok(txt.includes(`S$${r.without.monthly.toLocaleString('en-SG')} → S$${r.withBuy.monthly.toLocaleString('en-SG')} a month vs not buying`));
  const noBal = cpfSection({ h: { ...couple, buyers: [{ age: 32, income: 5000, citizenship: 'SC', cpfOa: null }] }, tf: f, plan: { cpf: {} }, policy, today: '2026-10-07' });
  assert.ok(noBal.includes(PAYOUT_REASONS.nobalances.replace("'", '&#39;')));
});

test('中文: every new string has an entry (explore → zh-explore, plan → zh, engine → zh-engine) with the same placeholders', () => {
  const read = (f) => JSON.parse(readFileSync(new URL(`../../app/i18n/${f}`, import.meta.url), 'utf8'));
  const ph = (s) => (s.match(/\{\d\}/g) || []).sort().join();
  const want = {
    'zh-explore.json': ['CPF LIFE at {0} (est.)', 'no change vs not buying', '≈ {0}/mo vs not buying', '{0} → {1}/mo (estimate)', 'add CPF balances in Household', 'add ages in Household', 'no CPF LIFE for foreigners'],
    'zh.json': ['no change', '≈ {0} a month', 'Household CPF LIFE from {0} if you buy this flat (estimate)', '{0} → {1} a month vs not buying'],
    'zh-engine.json': Object.values(PAYOUT_REASONS),
  };
  for (const [file, keys] of Object.entries(want)) {
    const dict = read(file);
    for (const k of keys) { assert.ok(dict[k], `${file} missing: ${k}`); assert.equal(ph(dict[k]), ph(k), k); }
  }
  const tip = mk(couple).row().tip;
  const explore = read('zh-explore.json');
  const fill = (k) => k.replace('{0}', policy.get('cpf.age.life_payout')).replace('{1}', policy.get('cpf.age.ra_formation'));
  const key = Object.keys(explore).find((k) => fill(k) === tip);
  assert.ok(key, 'tip template in zh-explore'); assert.equal(ph(explore[key]), ph(key));
});
