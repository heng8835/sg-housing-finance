// Phase 7b B13: unusual price warnings beyond ±20 % (At a glance) and a plain rank below 8 comparables (Over-priced row).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { premiumFlag, rankOf, rankText, overpricedCell, overpricedCellSimple, summaryText, UNUSUAL_PREMIUM, RANK_TEXT_MAX_N } from '../../app/modules/explore/comparables.js';
import { fairValue } from '../../app/engine/fairvalue.js';

const strip = (h) => h.replace(/<small>/g, ' (').replace(/<\/small>/g, ')').replace(/<[^>]+>/g, '');
const legacyFlag = (p, short) => { const pct = (v) => (v > 0 ? '+' : '') + (v * 100).toFixed(0) + '%'; return p > 0.08 ? ['serious', '▲', `${pct(p)} above recent sales (${short})`] : p < -0.03 ? ['good', '▼', `${pct(p)} below recent sales`] : ['good', '≈', 'priced in line with recent sales']; };

test('−26 % shows the "unusually low" note, not a green tick', () => {
  const [cls, icon, text] = premiumFlag(-0.26, 'blocks within 400 m');
  assert.equal(cls, 'warn');
  assert.equal(icon, '!');
  assert.equal(text, 'Unusually low — 26% below recent sales. Check the lease, the flat model (e.g. DBSS) and the listing.');
  assert.notEqual(cls, 'good');
});

test('+23 % shows "unusually high" (serious) with what to check', () => {
  assert.deepEqual(premiumFlag(0.226, 'this block'), ['serious', '▲', 'Unusually high — 23% above recent sales (this block). Check the listing, renovation and floor.']);
  assert.equal(UNUSUAL_PREMIUM, 0.2);
});

test('inside ±20 % the flag is exactly the older one', () => {
  for (let k = -40; k <= 40; k++) { const p = k / 200; assert.deepEqual(premiumFlag(p, 'x'), legacyFlag(p, 'x'), String(p)); }
  assert.equal(premiumFlag(null, 'x'), null);
});

test('n = 5 comparables: a plain rank, never "100th percentile" (Pro, Simple, panel line)', () => {
  const psfs = [500, 510, 520, 530, 540], asking = 560;
  const fv = fairValue({ psfs, sqft: 1000, askingPsf: asking, minN: 5 }), rank = rankOf(psfs, asking, fv.p50);
  assert.equal(fv.percentile, 100);
  assert.deepEqual([rank.n, rank.dearer, rank.cheaper], [5, 5, 0]);
  for (const html of [overpricedCell(fv, { rank }), overpricedCellSimple(fv, { rank }), summaryText(fv, asking, rank)]) {
    assert.doesNotMatch(strip(html), /percentile/i);
    assert.match(strip(html), /Dearer than all 5 recent sales \(\+8%\)/);
  }
  const low = rankOf(psfs, 400, fv.p50);
  assert.equal(rankText(low), 'Cheaper than all 5 recent sales (-23%)');
  assert.equal(rankText(rankOf([1, 2, 3, 4, 5, 6], 4.5, 3.5)), 'Dearer than 4 of 6 recent sales (+29%)');
  assert.equal(rankText(rankOf([1, 2, 3, 4, 5, 6], 1.5, 3.5)), 'Cheaper than 5 of 6 recent sales (-57%)');
});

test('from 8 comparables on: the percentile as before', () => {
  const psfs = [1, 2, 3, 4, 5, 6, 7, 8], fv = fairValue({ psfs, sqft: 100, askingPsf: 9, minN: 5 });
  assert.equal(RANK_TEXT_MAX_N, 8);
  assert.match(strip(overpricedCell(fv, { rank: rankOf(psfs, 9, fv.p50) })), /^100th percentile/);
  // too few for any judgement: unchanged "not enough" text
  const thin = fairValue({ psfs: [1, 2, 3], sqft: 100, askingPsf: 9, minN: 5 });
  assert.match(strip(overpricedCell(thin, { rank: rankOf([1, 2, 3], 9, thin.p50) })), /n=3 \(at least 5 needed\)/);
});

test('characterisation: compare-phase7b*.txt = 7a-family except the premium flags beyond ±20 % (Ho Ching +22.6 %)', () => {
  const read = (f) => readFileSync(new URL(`../fixtures/${f}`, import.meta.url), 'utf8').split(/\r?\n/);
  for (const [a, b] of [['compare-phase7a-family.txt', 'compare-phase7b.txt'], ['compare-phase7a-family-fv.txt', 'compare-phase7b-fv.txt'], ['compare-phase7a-family-nobto.txt', 'compare-phase7b-nobto.txt']]) {
    const o = read(a), n = read(b);
    assert.equal(o.length, n.length, b);
    const diff = o.map((l, i) => i).filter((i) => o[i] !== n[i]);
    assert.deepEqual(diff.map((i) => n[i].split(' | ')[0]), ['At a glance'], `${b}: only the At-a-glance row`);
    const oc = o[diff[0]].split(' | '), nc = n[diff[0]].split(' | ');
    assert.deepEqual([oc[1] === nc[1], oc[2] === nc[2], oc[3] === nc[3]], [true, true, false]);
    assert.ok(nc[3].startsWith('▲ Unusually high — 23% above recent sales (this block). Check the listing, renovation and floor. '));
    assert.equal(nc[3].replace('▲ Unusually high — 23% above recent sales (this block). Check the listing, renovation and floor.', ''), oc[3].replace('▲ +23% above recent sales (this block)', ''));
  }
});
