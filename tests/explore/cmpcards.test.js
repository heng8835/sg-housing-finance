// Phone Compare cards (phone overhaul §3.4 / §7, AC6): the cards are built from the same row definitions as the
// desktop table, so every card value must equal the same row's cell in the table dump of the compare seed
// (tests/fixtures/compare-seed.json → compare-phase7b*.txt). Key-row set and order are fixed; Simple mode hides the
// Pro-only rows (same pickRows as the table); "best" is the table's rule. Plus: the phone priorities fold, the 中文
// strings, the CSS rules (phone only, type floor) and the size of the legacy.js hook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { KEY_ROWS, bestOf, cardsModel, splitRows, cardsHtml, uiStrings, phoneLabel, headLine, ftPhone, storeyPhone } from '../../app/modules/explore/cmpcards.js';
import { blockHtml } from '../../app/modules/explore/priorities.js';
import { pickRows } from '../../app/modules/explore/brief.js';
import { esc } from '../../app/core/dom.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SEED = JSON.parse(read('../fixtures/compare-seed.json')).state;
const FIXTURES = ['compare-phase7b.txt', 'compare-phase7b-fv.txt', 'compare-phase7b-nobto.txt'];

/** The table dump → { glance: [cell per flat], rows: [{ sec } | { k, cells }] } (labels lose the ⓘ button's "i"). */
function parseDump(name) {
  const lines = read(`../fixtures/${name}`).split(/\r?\n/).filter((l) => l.trim());
  const out = { glance: null, rows: [] };
  for (const line of lines.slice(1)) {
    const parts = line.split(' | ');
    if (/ \|$/.test(line) && parts.length === 1) { out.rows.push({ sec: line.replace(/ \|$/, '') }); continue; }
    assert.equal(parts.length, 1 + SEED.choices.length, `${name}: ${line.slice(0, 40)}`);
    const [label, ...cells] = parts;
    if (label === 'At a glance') out.glance = cells;
    else out.rows.push({ k: label.replace(/i$/, ''), cells });
  }
  return out;
}
/** Seed flats as the metrics the cards read (name, id, a block label); m.i = the column. */
const seedMs = () => SEED.choices.map((c, i) => ({ c, b: { label: `block ${c.bid}` }, i }));
/** Row definitions shaped like legacy ROWS(): f(m) = that flat's cell (escaped HTML of the dump text). */
const rowsOf = (dump) => dump.rows.map((r) => (r.sec ? { sec: r.sec } : { k: r.k, f: (m) => esc(r.cells[m.i]) }));
/** "At a glance" cell → verdict() flags [cls, icon, text] (the dump joins "icon text" with spaces). */
const flagsOf = (cell) => cell.split(/ (?=[✓!✕▲▼•?] )/).map((s) => ['neutral', s[0], s.slice(2)]);
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const text = (h) => unesc(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Card HTML → { glance: [line text], key: [[label, value]], all: [[label, value]], secs: [names] } per card. */
function cardsOf(html) {
  return html.split('<article ').slice(1).map((a) => {
    const kv = (cls) => [...a.matchAll(new RegExp(`<div class="${cls}"><dt>([\\s\\S]*?)</dt><dd>([\\s\\S]*?)</dd></div>`, 'g'))].map((m) => [text(m[1]), m[2]]);
    return {
      glance: [...a.matchAll(/<li class="cc-g [^"]*">([\s\S]*?)<\/li>/g)].map((m) => text(m[1])),
      key: kv('cc-kv'), all: kv('cc-row-kv'),
      secs: [...a.matchAll(/<h5 class="cc-sec">([\s\S]*?)<\/h5>/g)].map((m) => text(m[1])),
      fold: (a.match(/<details class="cc-all"[^>]*><summary>([\s\S]*?)<\/summary>/) || [])[1],
    };
  });
}

for (const name of FIXTURES) {
  test(`${name}: every card value equals the same row of the desktop table dump; nothing dropped or repeated`, () => {
    const dump = parseDump(name), ms = seedMs(), rows = rowsOf(dump);
    const model = cardsModel(ms, rows, { verdict: (m) => flagsOf(dump.glance[m.i]), label: (r) => esc(r.k) });
    const cards = cardsOf(cardsHtml(ms, model, { head: () => '' }));
    assert.equal(cards.length, SEED.choices.length);
    const dumpRows = dump.rows.filter((r) => !r.sec);
    cards.forEach((card, i) => {
      assert.equal(card.glance.join(' '), dump.glance[i], `card ${i + 1}: At a glance`);
      const seen = [...card.key, ...card.all];
      assert.equal(seen.length, dumpRows.length, `card ${i + 1}: every row once`);
      for (const r of dumpRows) {
        const hit = seen.filter(([l]) => l === r.k);
        assert.equal(hit.length, 1, `card ${i + 1}: ${r.k}`);
        assert.equal(text(hit[0][1]), r.cells[i], `card ${i + 1}: ${r.k}`);
      }
      // key rows first, in the fixed order; the fold keeps the table's order and its section headings
      assert.deepEqual(card.key.map(([l]) => l), KEY_ROWS.filter((k) => dumpRows.some((r) => r.k === k)));
      assert.deepEqual(card.all.map(([l]) => l), dumpRows.map((r) => r.k).filter((k) => !KEY_ROWS.includes(k)));
      const secs = []; let cur = null;
      for (const r of dump.rows) { if (r.sec) cur = r.sec; else if (!KEY_ROWS.includes(r.k) && !secs.includes(cur)) secs.push(cur); }
      assert.deepEqual(card.secs, secs);
      assert.equal(card.fold, `All rows (${dumpRows.length - card.key.length})`);
    });
  });
}

test('key rows: the fixed set of 8, in order, all present in the 7b table', () => {
  assert.deepEqual(KEY_ROWS, ['Asking price', 'Premium vs. recent sales', 'Monthly instalment', 'Cash you must pay', 'Remaining lease today',
    'Nearest MRT', 'Primary schools within 1 km', 'Floor area']);
  const keys = parseDump('compare-phase7b.txt').rows.map((r) => r.k);
  for (const k of KEY_ROWS) assert.ok(keys.includes(k), k);
});

test('Simple mode: the cards show only the rows the table keeps (pickRows) — Pro-only rows are hidden', () => {
  const dump = parseDump('compare-phase7b.txt'), ms = seedMs();
  const SIMPLE = new Set(['Asking price', '$ per sqft', 'Premium vs. recent sales', 'Monthly instalment', 'Can you afford it?', 'Cash you must pay',
    'Most you can pay', 'Remaining lease today', 'Lease covers youngest owner to 95', 'Nearest MRT', 'Primary schools within 1 km', 'Workplaces']);
  const rows = pickRows(rowsOf(dump), SIMPLE, 'simple');
  const [card] = cardsOf(cardsHtml(ms, cardsModel(ms, rows, { label: (r) => esc(r.k) }), {}));
  const shown = [...card.key, ...card.all].map(([l]) => l);
  assert.deepEqual(new Set(shown), new Set([...SIMPLE].filter((k) => dump.rows.some((r) => r.k === k))));
  for (const pro of ['Loan', 'Upfront incl. fees (cash + CPF)', 'Floor area', 'Block liquidity', 'Storey']) assert.ok(!shown.includes(pro), pro);
  assert.ok(!card.key.some(([l]) => l === 'Floor area'), 'a key row the table hides is not shown');
});

test('bestOf = the table rule: min / max, ties all best, all-equal → none, no number ignored, one flat → none', () => {
  const ms = [{ x: 3 }, { x: 1 }, { x: 1 }, { x: null }];
  assert.deepEqual([...bestOf({ v: (m) => m.x, best: 'min' }, ms)], [1, 2]);
  assert.deepEqual([...bestOf({ v: (m) => m.x, best: 'max' }, ms)], [0]);
  assert.deepEqual([...bestOf({ v: (m) => m.x }, ms)], [0], 'no best given → max (as the table)');
  assert.deepEqual([...bestOf({ v: () => 5, best: 'min' }, ms)], [], 'all equal');
  assert.deepEqual([...bestOf({ v: (m) => (m.x == null ? NaN : 2), best: 'min' }, ms)], [], 'NaN skipped, the rest tie');
  assert.deepEqual([...bestOf({ v: (m) => m.x, best: 'min' }, ms.slice(0, 1))], []);
  assert.deepEqual([...bestOf({ f: () => '' }, ms)], [], 'no value → never best');
  // the legacy table still uses this rule (change both together)
  const legacy = read('../../app/modules/explore/legacy.js');
  assert.match(legacy, /const bv = r\.best === 'min' \? Math\.min\(\.\.\.valid\.map\(\(\[v\]\) => v\)\) : Math\.max/);
  assert.match(legacy, /if \(bestIdx\.size === valid\.length\) bestIdx = new Set\(\);/);
});

test('"Best of 3" under the best value, wins in the card header ("best in X of N measures" as the table) or the ticks note', () => {
  const ms = [{ c: { id: 1, name: 'A' } }, { c: { id: 2, name: 'B' } }, { c: { id: 3, name: 'C' } }];
  const rows = [{ sec: 'Price & value' }, { k: 'Asking price', f: (m) => `S$${m.c.id}`, v: (m) => m.c.id, best: 'min' },
    { k: 'Storey', f: () => 'x', v: (m) => m.c.id, best: 'max' }, { k: 'Flat type', f: () => '4 ROOM' }];
  const model = cardsModel(ms, rows, {});
  assert.deepEqual(model.wins, [1, 0, 1]);
  assert.equal(model.measures, 2);
  const html = cardsHtml(ms, model, { at: 1 });
  const cards = html.split('<article ').slice(1);
  assert.match(cards[0], /S\$1 <span class="tag good cc-best">Best of 3<\/span>/);
  assert.doesNotMatch(cards[1], /cc-best/);
  assert.match(cards[2], /<dt>Storey<\/dt><dd>x <span class="tag good cc-best">Best of 3/);
  assert.match(cards[0], /best in 1 of 2 measures/);
  assert.match(html, /Flat <b>2<\/b> of 3/);
  assert.match(html, /data-cc-go="-1"[^>]*>‹/);
  assert.match(cardsHtml(ms, model, { note: (i) => `meets ${i} of your 2 ticks` }), /meets 2 of your 2 ticks/);
  assert.equal(splitRows(model).key.map((r) => r.k).join(), 'Asking price');
  // one flat: no "Flat 1 of 1", no wins note; none: the empty line
  const one = cardsHtml(ms.slice(0, 1), cardsModel(ms.slice(0, 1), rows, {}));
  assert.doesNotMatch(one, /cc-nav|best in/);
  assert.match(cardsHtml([], cardsModel([], rows, {})), /No flats yet/);
  // folds: data-fold per flat, open only when remembered open (F6)
  assert.match(html, /<details class="cc-all" data-fold="cmp-all-1"><summary>All rows \(2\)<\/summary>/);
  assert.match(cardsHtml(ms, model, { open: (k) => k === 'cmp-all-2' }), /data-fold="cmp-all-2" open>/);
  // actions: Afford (proxies the list's Afford) + Brief (brief.js listens on #cmpBody for data-brief)
  assert.match(cards[0], /data-cmp-afford="1">Afford<\/button><button type="button" class="btn" data-brief="1"/);
});

test('priorities on phones: one fold, closed unless opened, one-line summary "Sort: …" names the picks (R-15a)', () => {
  const facts = [0, 1].map((i) => ({ i, name: `F${i}`, vals: { mrt: 300 + i, schools: 2 - i }, cashShort: 0, bad: 0 }));
  const html = blockHtml({ ticks: ['mrt', 'schools'], facts, bandKm: 1, phone: true });
  assert.match(html, /^<details class="prio prio-phone" data-fold="prio" aria-label="Your priorities"><summary><span class="prio-t">Sort: Walk to MRT · Primary schools within 1 km<\/span><small class="prio-s">pick up to 5<\/small><\/summary>/);
  assert.match(blockHtml({ ticks: [], facts, bandKm: 1, phone: true }), /<span class="prio-t">Sort: none picked<\/span>/);
  assert.match(html, /data-prio="mrt" aria-pressed="true"/);
  assert.match(html, /data-prio-clear/);
  assert.match(html, /fits your ticks best|tied on your ticks/);
  assert.doesNotMatch(html, /Change what matters/, 'no fold inside the fold');
  assert.match(blockHtml({ ticks: [], facts, bandKm: 1, phone: true, open: true }), /data-fold="prio" open .*pick up to 5/);
  assert.match(blockHtml({ ticks: ['mrt'], facts, bandKm: 1 }), /^<section class="prio"/, 'desktop block unchanged');
});

const I18N = new URL('../../app/i18n/', import.meta.url);
const json = (u) => JSON.parse(readFileSync(u, 'utf8'));
const staged = existsSync(new URL('staging/', I18N)) ? readdirSync(new URL('staging/', I18N)).filter((f) => f.startsWith('COMPARE.')) : [];
const dict = Object.assign({}, ...['zh.json', 'zh-explore.json', 'zh-engine.json', 'zh-guide.json'].map((f) => json(new URL(f, I18N))),
  ...staged.map((f) => json(new URL(`staging/${f}`, I18N))));

test('中文: every string of the cards and the phone priorities fold (dictionaries or staging COMPARE.*.json)', () => {
  const keys = new Set([...uiStrings(), 'Sort by what matters', 'Sort: {0}', 'Sort: none picked', 'pick up to {0}']);
  for (const m of read('../../app/modules/explore/cmpcards.js').matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) keys.add(m[1]);
  const missing = [...keys].filter((k) => !dict[k]);
  assert.deepEqual(missing, []);
  const ph = (s) => (s.match(/\{\d\}/g) || []).sort().join();
  for (const k of keys) assert.equal(ph(dict[k]), ph(k), k);
  for (const k of keys) assert.doesNotMatch(dict[k], /点击|悬停|你/, k);
  assert.doesNotMatch(uiStrings().join(' '), /\b(click|hover)\b/i, 'phones say "tap"');
});

test('phone-compare.css: every rule inside @media (max-width: 767px); rem font sizes ≥ .875rem', () => {
  const css = read('../../app/styles/phone-compare.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  (function walk(s, media) {
    let i = 0;
    while (i < s.length) {
      const open = s.indexOf('{', i); if (open < 0) { assert.equal(s.slice(i).trim(), ''); return; }
      let depth = 1, k = open + 1;
      for (; k < s.length && depth; k++) { if (s[k] === '{') depth++; else if (s[k] === '}') depth--; }
      const head = s.slice(i, open).trim(), body = s.slice(open + 1, k - 1);
      if (head.startsWith('@')) walk(body, [...media, head]); else rules.push({ head, body, media });
      i = k;
    }
  })(css, []);
  assert.ok(rules.length > 40);
  assert.deepEqual(rules.filter((r) => !r.media.some((m) => /^@media (screen and )?\(max-width:\s*767px\)$/.test(m))).map((r) => r.head), []);
  const bad = [];
  for (const r of rules) for (const m of r.body.matchAll(/font-size\s*:\s*([^;]+)/g)) {
    const v = m[1].trim();
    if (!/^[\d.]+rem$/.test(v) || parseFloat(v) < 0.875) bad.push(`${r.head}: ${v}`);
  }
  assert.deepEqual(bad, []);
});

test('legacy.js: one small phone branch in renderCompare; the desktop table code is untouched', () => {
  const src = read('../../app/modules/explore/legacy.js');
  assert.equal(src.match(/cards\.on\(\)/g)?.length, 1);
  assert.equal(src.match(/createCompareCards\(/g)?.length, 1);
  const branch = src.split('\n').find((l) => l.includes('if (cards.on())'));
  assert.ok(branch.length < 450, 'one line');
  assert.match(src, /let html = prio\.html\(ms\) \+ '<table class="cmp">/, 'the table still starts with the desktop priorities block');
});

test('R-15b: "At a glance" shows 4 flags, the rest in a remembered "Show N more" fold; R-16: sentence-case sub line', () => {
  const ms = [{ c: { id: 7, name: 'A' } }];
  const flags = Array.from({ length: 6 }, (_, k) => ['good', '✓', `flag ${k}`]);
  const model = cardsModel(ms, [{ k: 'Asking price', f: () => 'S$1' }], { verdict: () => flags });
  const html = cardsHtml(ms, model, {});
  const [shown, rest] = html.split('<details class="cc-more"');
  assert.equal(shown.match(/<li class="cc-g /g).length, 4);
  assert.match(rest, /^ data-fold="cmp-glance-7"><summary><span class="cc-more-c">Show 2 more<\/span><span class="cc-more-o">Show fewer<\/span><\/summary>/);
  assert.equal(rest.match(/<li class="cc-g /g).length, 2);
  assert.match(cardsHtml(ms, model, { open: (k) => k === 'cmp-glance-7' }), /data-fold="cmp-glance-7" open>/);
  const four = cardsModel(ms, [], { verdict: () => flags.slice(0, 4) });
  assert.doesNotMatch(cardsHtml(ms, four, {}), /cc-more/, 'no fold for 4 flags or fewer');
  assert.equal(headLine('Blk 1', '4 ROOM', '31 TO 33'), 'Blk 1 · 4-room · storey 31–33');
  assert.equal(headLine('Blk 1', 'MULTI-GENERATION', '01 TO 03'), 'Blk 1 · Multi-generation · storey 1–3');
  assert.equal(ftPhone('EXECUTIVE'), 'Executive');
  assert.equal(storeyPhone('40'), '40');
});

test('P-44: phone + Simple say "Price per sq ft"; Pro keeps the table label', () => {
  const label = (r) => r.k, psf = { k: '$ per sqft' }, other = { k: 'Asking price' };
  assert.equal(phoneLabel(psf, label, true), 'Price per sq ft');
  assert.equal(phoneLabel(psf, label, false), '$ per sqft');
  assert.equal(phoneLabel(other, label, true), 'Asking price');
});
