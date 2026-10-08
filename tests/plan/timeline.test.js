// Plan tab: "When you pay for a BTO" fold (modules/plan/btopay.js) and the Sell then buy timeline block
// (modules/plan/contra.js) render from engine output; every string has a 中文 entry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { btoPayFold } from '../../app/modules/plan/btopay.js';
import { moveTimelineBlock } from '../../app/modules/plan/contra.js';
import { sellThenBuy } from '../../app/engine/sellbuy.js';
import { policy } from '../helpers.js';

const household = {
  scheme: 'family', firstTimer: true, loan: 'hdb', tenure: 25,
  buyers: [{ age: 29, income: 5000, cpfOa: 40000, cash: 30000, citizenship: 'SC' }, { age: 28, income: 4000, cpfOa: 30000, cash: 20000, citizenship: 'SC' }],
};

test('BTO payment fold: three stages with amounts, dates and sources; works from a typed price alone', () => {
  const html = btoPayFold({ price: 400000, flatType: '4 ROOM', keyDate: '2030-03', h: household, plan: { btoBooked: '2026-10-07' }, policy });
  assert.match(html, /data-fold="btoPay"/);
  assert.match(html, /pro-only/);
  assert.equal((html.match(/<li( class="tl-key")?>\s*<div class="tl-when">/g) || []).length, 3);
  assert.match(html, /S\$2,000/); // option fee
  assert.match(html, /S\$47,600/); // at signing: 38k downpayment + 6.6k BSD + 3k legal
  assert.match(html, /S\$300,000/); // HDB loan at key collection
  assert.match(html, /hdb\.gov\.sg/);
  const typed = btoPayFold({ price: 350000, flatType: '3 ROOM', keyDate: null, h: household, plan: {}, policy });
  assert.match(typed, /when the flat is completed/);
  assert.match(btoPayFold({ price: null, flatType: '4 ROOM', keyDate: null, h: household, plan: {}, policy }), /Enter the BTO price/);
});

test('Sell then buy timeline: contra point, HDB periods, gap verdict and bridge from the two completion dates', () => {
  const current = { salePrice: 600000, outstandingLoan: 150000, cpfPrincipalUsed: 120000, accruedInterest: 20000, flatType: '4 ROOM', propertyType: 'hdb', subsidised: true };
  const h = { ...household, firstTimer: false };
  const r = sellThenBuy({ current, next: { price: 700000, flatType: '5 ROOM', propertyType: 'hdb', loanType: 'hdb', tenure: 25, subsidised: false }, household: h, mode: 'contra' }, policy);
  const c = { ...current, saleCompletion: '2027-03-01' };
  const html = moveTimelineBlock({ r, c, h, plan: { dates: { nextCompletion: '2027-02-01' } }, policy, modeLabel: 'Sell and buy at the same time (contra)' });
  assert.match(html, /id="planMoveTimeline"/);
  assert.match(html, /Contra: line up the two completions/);
  assert.match(html, /class="lane-both tl-key"/);
  assert.match(html, /up to 21 calendar days/);
  assert.match(html, /The purchase completes 28 days first/);
  assert.match(html, /data-p="plan.current.saleCompletion"/);
  assert.match(html, /data-p="plan.dates.nextCompletion"/);
  const none = moveTimelineBlock({ r, c: current, h, plan: {}, policy });
  assert.match(none, /Enter both expected completion dates/);
});

test('every string in btopay.js / contra.js has a 中文 entry (zh.json), engine messages in zh-engine.json', () => {
  const dict = (f) => JSON.parse(readFileSync(new URL(`../../app/i18n/${f}`, import.meta.url), 'utf8'));
  // the runtime merges every dictionary; a reused engine message may already be in zh-engine.json
  const zh = Object.assign({}, dict('zh.json'), dict('zh-explore.json'), dict('zh-engine.json'));
  const zhEngine = dict('zh-engine.json');
  const quoted = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
  const literal = (m) => (m[1] ?? m[2]).replace(/\\'/g, "'");
  const need = [];
  for (const f of ['btopay.js', 'contra.js']) {
    const src = readFileSync(new URL(`../../app/modules/plan/${f}`, import.meta.url), 'utf8');
    need.push(...[...src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((x) => x[1].replace(/\\'/g, "'")));
    // display maps: STAGE / ITEM / LANE / STEP values
    for (const name of ['STAGE', 'ITEM', 'LANE', 'STEP']) {
      const block = src.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n?\\};`));
      // every string literal in the map that is not a key (a key is followed by ':')
      if (block) need.push(...[...block[1].matchAll(quoted)].filter((m) => !/^\s*:/.test(block[1].slice(m.index + m[0].length))).map(literal));
    }
  }
  assert.ok(need.length > 40);
  assert.deepEqual([...new Set(need)].filter((k) => !zh[k]), []);
  const engine = [];
  for (const f of ['btopay.js', 'contra.js']) {
    const src = readFileSync(new URL(`../../app/engine/${f}`, import.meta.url), 'utf8');
    engine.push(...[...src.matchAll(/\[('(?:[^'\\]|\\.)*'),\s*\[/g)].map((m) => literal([...m[1].matchAll(quoted)][0])));
  }
  assert.ok(engine.length > 15);
  assert.deepEqual([...new Set(engine)].filter((k) => !zhEngine[k] && !zh[k]), []);
});
