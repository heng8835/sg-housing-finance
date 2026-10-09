import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickRows, stripCell, isEmptyCell, briefSections, leaseNotes, tableLines, tsvText, csvCell, csvText, BOM,
  fitLevels, chooseLevel, trimFlags, FLAGS_SHORT, nearby, locatorSvg, placeLabels, LABEL_GAP, legendHtml, headerButton, briefHtml, fitNote, HEADER_KEYS, LEASE_KEYS,
} from '../../app/modules/explore/brief.js';

const ROWS = [
  { sec: 'Price & value' },
  { k: 'Asking price', f: (m) => `S$${m.price}` },
  { k: '$ per sqft', f: () => 'S$600 psf' },
  { k: 'Over-priced? (vs comparable sales)', simple: true, f: () => '69th percentile<small>in the usual range · n=9</small><button class="cc-open"></button>' },
  { sec: 'Lease & future value' },
  { k: 'Remaining lease today', f: () => '60.0 y<small>lease from 1987</small>', tip: 'Lease tip.' },
  { k: 'Block price trend (3 y, all types)', f: () => '<span class="muted">too few sales</span>' },
  { sec: 'Environment & feng shui' },
  { k: 'Park', f: () => '<span class="muted">n/a</span>' },
  { k: 'Nearest eldercare centre', f: () => '—' },
  { sec: 'The flat itself' },
  { k: 'Listing', f: () => '<a href="https://x">open ↗</a>' },
];
const SIMPLE = new Set(['Asking price', '$ per sqft', 'Remaining lease today']);
const M = { price: 500000, c: { name: 'Home A' } };

test('pickRows: Pro keeps all; Simple keeps simple keys + simple rows and drops empty sections', () => {
  assert.equal(pickRows(ROWS, SIMPLE, 'pro'), ROWS);
  const keys = pickRows(ROWS, SIMPLE, 'simple').map((r) => r.sec || r.k);
  assert.deepEqual(keys, ['Price & value', 'Asking price', '$ per sqft', 'Over-priced? (vs comparable sales)', 'Lease & future value', 'Remaining lease today']);
});

test('stripCell: the Copy-table text extraction', () => {
  assert.equal(stripCell('S$1<small>a &amp; b</small>'), 'S$1 (a & b)');
  assert.equal(stripCell('60 y<small style="color:red">x</small>'), '60 y (x)');
  assert.equal(stripCell('<span class="tag good">✓ Yes</span>&nbsp;'), '✓ Yes');
  assert.equal(stripCell('&lt;b&gt; &quot;q&quot; &#39;s&#39;'), '<b> "q" \'s\'');
});

test('isEmptyCell: blank, dash and muted-only placeholders', () => {
  for (const h of ['', '—', '<span class="muted">n/a</span>', '<span class="muted">—</span>', '  ']) assert.ok(isEmptyCell(h), h);
  for (const h of ['0', 'S$0<small>x</small>', '<span class="muted">not enough sales</span><small>n=3</small>']) assert.ok(!isEmptyCell(h), h);
});

test('briefSections: grouped by section, header keys and empty rows / sections skipped', () => {
  const s = briefSections(ROWS, M, { label: (r) => `L:${r.k}` });
  assert.deepEqual(s.map((x) => x.sec), ['Price & value', 'Lease & future value']);
  assert.deepEqual(s[0].rows.map((r) => r.k), ['$ per sqft', 'Over-priced? (vs comparable sales)']);
  assert.equal(s[0].rows[0].label, 'L:$ per sqft');
  assert.ok(HEADER_KEYS.has('Asking price') && HEADER_KEYS.has('Listing'));
  // a new row appended later (e.g. the scorecard) shows up without brief changes
  const more = [...ROWS, { sec: 'Future value' }, { k: 'Lease runway', f: () => '3 / 5' }];
  assert.deepEqual(briefSections(more, M).at(-1), { sec: 'Future value', rows: [{ k: 'Lease runway', label: 'Lease runway', html: '3 / 5' }] });
});

test('leaseNotes: tips of the lease rows only', () => {
  assert.deepEqual(leaseNotes(ROWS), ['Lease tip.']);
  assert.equal(LEASE_KEYS[0], 'Remaining lease today');
});

test('tableLines + tsvText: header, upper-case sections, one column per flat (the Copy table text)', () => {
  const rows = [{ sec: 'Price & value' }, { k: 'Asking price', f: (m) => `S$${m.price}<small>x</small>` }];
  const ms = [{ price: 1, c: { name: 'A' } }, { price: 2, c: { name: 'B, "two"' } }];
  const lines = tableLines(rows, ms, (r) => r.k);
  assert.deepEqual(lines, [['Measure', 'A', 'B, "two"'], ['PRICE & VALUE'], ['Asking price', 'S$1 (x)', 'S$2 (x)']]);
  assert.equal(tsvText(lines), 'Measure\tA\tB, "two"\nPRICE & VALUE\nAsking price\tS$1 (x)\tS$2 (x)');
});

test('CSV: RFC 4180 quoting, BOM for Excel, CRLF, formula guard, 中文 kept', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a, b'), '"a, b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('two\nlines'), '"two\nlines"');
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell('-3%'), '-3%');
  assert.equal(csvCell(null), '');
  const out = csvText([['Measure', '宏茂桥'], ['PRICE'], ['Price', 'S$1,000']]);
  assert.ok(out.startsWith(BOM) && BOM === '﻿');
  assert.equal(out, '﻿Measure,宏茂桥\r\nPRICE\r\nPrice,"S$1,000"\r\n');
  assert.deepEqual([...Buffer.from(out, 'utf8').subarray(0, 3)], [0xef, 0xbb, 0xbf]);
});

test('one-page rule: Pro rows dropped first, then smaller text, then fewer flags', () => {
  const pro = fitLevels('pro');
  assert.deepEqual(pro.map((l) => [l.rows, l.dense, l.flags]), [['pro', false, Infinity], ['simple', false, Infinity], ['simple', true, Infinity], ['simple', true, FLAGS_SHORT], ['simple', true, FLAGS_SHORT], ['simple', true, 5]]);
  assert.deepEqual(pro.map((l) => l.notes !== false), [true, true, true, true, false, false], '7b B4: the last two levels leave out the lease notes');
  assert.deepEqual(fitLevels('simple'), pro.slice(1));
  const h = { 'pro,false,Infinity': 1200, 'simple,false,Infinity': 1100, 'simple,true,Infinity': 990, 'simple,true,8': 900 };
  const height = (l) => h[[l.rows, l.dense, l.flags].join(',')];
  assert.equal(chooseLevel(pro, height, 1000), 2);
  assert.equal(chooseLevel(pro, height, 1300), 0);
  assert.equal(chooseLevel(pro, height, 500), 5, 'nothing fits → the last level');
  assert.equal(chooseLevel(pro, () => 0, 1000), 0, 'unmeasurable → first level');
  assert.match(fitNote(pro[1], 'pro'), /Simple rows only/);
  assert.match(fitNote(pro[0], 'pro'), /all rows/);
  assert.match(fitNote(pro[3], 'pro'), /fewer flags/);
  assert.match(fitNote(pro[5], 'pro'), /no lease notes/);
});

test('trimFlags: keeps the most serious, original order', () => {
  const f = [['good', '✓', 'a'], ['warn', '!', 'b'], ['good', '✓', 'c'], ['critical', '✕', 'd'], ['neutral', '•', 'e']];
  assert.deepEqual(trimFlags(f, 3), { shown: [f[1], f[3], f[4]], hidden: 2 });
  assert.deepEqual(trimFlags(f), { shown: f, hidden: 0 });
});

test('nearby + locator SVG: stations within 2 km (else nearest), schools within 1 km, all inside the frame', () => {
  const c = { lat: 1.35, lon: 103.85 };
  const st = [{ n: 'Far', lat: 1.40, lon: 103.85 }, { n: 'Near <A>', lat: 1.354, lon: 103.85 }];
  const sc = [{ n: 'S1', lat: 1.352, lon: 103.851 }, { n: 'S2', lat: 1.37, lon: 103.85 }];
  const near = nearby(c, st, sc);
  assert.deepEqual(near.mrt.map((s) => s.name), ['Near <A>']);
  assert.equal(near.schoolCount, 1);
  assert.ok(Math.abs(near.mrt[0].m - 445) < 5);
  assert.deepEqual(nearby(c, [st[0]], []).mrt.map((s) => s.name), ['Far']);
  const svg = locatorSvg({ centre: c, mrt: [{ ...st[0], name: 'Far' }, { ...st[1], name: 'Near <A>' }], schools: near.schools });
  assert.match(svg, /^<svg viewBox="0 0 240 240" role="img"/);
  assert.match(svg, /Near &lt;A&gt;/);
  for (const [, x, y] of svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="7"/g)) assert.ok(+x >= 0 && +x <= 240 && +y >= 0 && +y <= 240, `${x},${y}`);
  assert.match(legendHtml(near), /MRT \/ LRT: Near &lt;A&gt; 44\d m/);
});

test('locator labels (S1a): a name close to a placed one is dropped (nearest kept), its square stays', () => {
  const p = placeLabels([{ x: 100, y: 100, name: 'Fernvale' }, { x: 104, y: 106, name: 'Layar' }, { x: 60, y: 200, name: 'Far' }]);
  assert.deepEqual(p.map((x) => x.show), [true, false, true]);
  // anchors further apart than the gap, but the first name's box runs into the second → dropped too
  assert.deepEqual(placeLabels([{ x: 100, y: 100, name: 'Fernvale' }, { x: 100 + LABEL_GAP + 8, y: 101, name: 'Layar' }]).map((x) => x.show), [true, false]);
  assert.deepEqual(placeLabels([{ x: 100, y: 60, name: 'A' }, { x: 100, y: 60 + LABEL_GAP + 1, name: 'B' }]).map((x) => x.show), [true, true]);
  const c = { lat: 1.3925, lon: 103.876 };
  // ~35 m apart on the ground ≈ 3.5 SVG units: the nearer station keeps its name, the other only its square
  const mrt = [{ name: 'Layar', lat: 1.3928, lon: 103.8790, m: 330 }, { name: 'Fernvale', lat: 1.3925, lon: 103.8787, m: 300 }];
  const svg = locatorSvg({ centre: c, mrt, schools: [] });
  assert.match(svg, />Fernvale</);
  assert.doesNotMatch(svg, />Layar</);
  assert.equal(svg.match(/width="7"/g).length, 2);
});

test('headerButton: no text node (dump / TSV unchanged), label in data-label + aria-label', () => {
  const b = headerButton({ id: 3, name: 'A "1"' });
  assert.equal(b.replace(/<[^>]+>/g, ''), '');
  assert.match(b, /data-brief="3" data-label="Brief" aria-label="Flat brief for A &quot;1&quot;"/);
});

test('briefHtml: header, flags, key numbers, notes, sources; dense class', () => {
  const md = { name: 'Home <1>', address: '101 Bishan St 12', town: 'Bishan', flatType: '4 ROOM', storey: '07 TO 09', sqm: 92, price: 'S$600,000', listing: 'https://l', facts: ['Completed 1987'],
    printed: '7 Oct 2026', flags: [['good', '✓', 'ok'], ['warn', '!', 'careful']], pro: briefSections(ROWS, M), simple: briefSections(pickRows(ROWS, SIMPLE, 'simple'), M),
    notes: ['Lease tip.'], mapSvg: '<svg></svg>', mapLegend: '', sources: 'Sources: x', title: 'HDB Resale Comparer' };
  const html = briefHtml(md, fitLevels('pro')[0]);
  assert.match(html, /^<article class="brief">/);
  assert.match(html, /<h1>Home &lt;1&gt;<\/h1>/);
  assert.match(html, /101 Bishan St 12 · Bishan · 4 ROOM · 07 TO 09 · 92 sqm/);
  assert.match(html, /not financial advice/);
  assert.match(html, /Printed 7 Oct 2026/);
  assert.match(html, /<th scope="row">Over-priced\? \(vs comparable sales\)<\/th>/);
  assert.match(html, /Lease &amp; CPF notes/);
  assert.match(html, /Listing: https:\/\/l/);
  assert.doesNotMatch(html, /Block price trend/);
  assert.match(briefHtml(md, fitLevels('pro')[3]), /^<article class="brief dense">/);
});
