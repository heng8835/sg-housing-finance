import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathways, classify } from '../../app/engine/eligibility.js';
import { policy } from '../helpers.js';

const SC = (o = {}) => ({ age: 30, income: 4000, citizenship: 'SC', ...o });
const PR = (o = {}) => ({ age: 30, income: 4000, citizenship: 'PR', prYears3Plus: true, nationality: 'other', ...o });
const F = (o = {}) => ({ age: 30, income: 4000, citizenship: 'F', nationality: 'other', pass: 'EP', ...o });
const hh = (buyers, o = {}) => ({ scheme: 'family', firstTimer: true, propertiesOwned: 0, buyers, ...o });
const oks = (r) => Object.fromEntries(Object.entries(r.buy).map(([k, v]) => [k, v.ok]));
const STATUSES = new Set(['VERIFIED', 'CORROBORATED', 'UNVERIFIED', 'ASSUMPTION']);

test('classify: residency profiles', () => {
  assert.equal(classify(hh([SC(), SC()])).kind, 'sc_family');
  assert.equal(classify(hh([SC(), PR()])).kind, 'sc_family');
  assert.equal(classify(hh([SC(), F()])).kind, 'ncs');
  assert.equal(classify(hh([PR(), PR()])).kind, 'pr_family');
  assert.equal(classify(hh([PR()], { scheme: 'single' })).kind, 'pr_single');
  assert.equal(classify(hh([F()])).kind, 'foreigner');
  assert.equal(classify(hh([])).kind, 'unknown');
  assert.equal(classify({ scheme: 'family' }).kind, 'unknown'); // missing buyers array
});

test('SC family within ceiling: every buy route open, HDB loan ok, BTO is best (nextBest null)', () => {
  const r = pathways(hh([SC(), SC()]), policy);
  assert.deepEqual(oks(r), { bto: true, resale: true, ecNew: true, ecResale: true, condo: true, landed: true });
  assert.equal(r.loan.hdb.ok, true);
  assert.equal(r.nextBest, null);
  assert.equal(r.rent.hdbWhole.ok, true);
  for (const a of [...Object.values(r.buy), r.loan.hdb, ...Object.values(r.rent)]) assert.ok(STATUSES.has(a.status), a.status);
  assert.equal(r.buy.bto.status, 'CORROBORATED'); // rests on elig.rule.family_nucleus
});

test('SC family above the S$16k ceiling: no BTO / HDB loan, resale still open; EC ceiling is S$18k', () => {
  const r = pathways(hh([SC({ income: 9000 }), SC({ income: 8000 })]), policy);
  assert.equal(r.buy.bto.ok, false);
  assert.equal(r.loan.hdb.ok, false);
  assert.equal(r.buy.resale.ok, true);
  assert.equal(r.buy.ecNew.ok, true); // 17,000 <= 18,000 (NDR 2026)
  assert.equal(r.nextBest, 'Consider an HDB resale flat.');
  const rich = pathways(hh([SC({ income: 10000 }), SC({ income: 9000 })]), policy);
  assert.equal(rich.buy.ecNew.ok, false);
});

test('SC single under 35: no HDB purchase at all; condo still open', () => {
  const r = pathways(hh([SC({ age: 30 })], { scheme: 'single' }), policy);
  assert.equal(r.buy.bto.ok, false);
  assert.equal(r.buy.resale.ok, false);
  assert.equal(r.buy.ecNew.ok, false);
  assert.equal(r.loan.hdb.ok, false);
  assert.equal(r.buy.condo.ok, true);
  assert.equal(r.nextBest, 'Consider a private condo.');
});

test('SC single 35+: 2-room Flexi BTO (conditional), resale yes, new EC only with joint singles', () => {
  const r = pathways(hh([SC({ age: 36 })], { scheme: 'single' }), policy);
  assert.equal(r.buy.bto.ok, 'conditional');
  assert.match(r.buy.bto.why.join(' '), /2-room Flexi/);
  assert.equal(r.buy.resale.ok, true);
  assert.equal(r.buy.ecNew.ok, false);
  assert.equal(r.buy.ecResale.status, 'UNVERIFIED'); // honest badge: singles + resale EC not checked
  const jss = pathways(hh([SC({ age: 36 }), SC({ age: 40 })], { scheme: 'single' }), policy);
  assert.equal(jss.buy.ecNew.ok, 'conditional');
});

test('SC + PR couple: as SC family, with the S$10k premium / Citizen Top-Up note; ABSD remission note', () => {
  const r = pathways(hh([SC(), PR()]), policy);
  assert.equal(r.buy.bto.ok, true);
  assert.match(r.buy.bto.why.join(' '), /S\$10,000 premium.*Citizen Top-Up/);
  assert.equal(r.loan.hdb.ok, true);
  assert.ok(r.notes.some((n) => /remitted/.test(n)));
});

test('SC + foreigner (Non-Citizen Spouse scheme): 2-room Flexi, resale yes, no new EC; SC must be 21+', () => {
  const r = pathways(hh([SC({ age: 25 }), F({ pass: 'DP' })]), policy);
  assert.equal(r.buy.bto.ok, 'conditional');
  assert.equal(r.buy.resale.ok, true);
  assert.match(r.buy.resale.why.join(' '), /3Gen and Prime/);
  assert.equal(r.buy.ecNew.ok, false);
  assert.equal(r.buy.ecResale.ok, 'conditional');
  const young = pathways(hh([SC({ age: 20 }), F()]), policy);
  assert.equal(young.buy.bto.ok, false);
  assert.equal(young.buy.resale.ok, false);
});

test('PR + PR under 3 years: nothing from HDB; condo yes; landed needs SLA approval', () => {
  const r = pathways(hh([PR({ prYears3Plus: false }), PR()]), policy);
  assert.equal(r.buy.bto.ok, false);
  assert.equal(r.buy.resale.ok, false);
  assert.equal(r.buy.ecNew.ok, false);
  assert.equal(r.buy.condo.ok, true);
  assert.equal(r.buy.landed.ok, 'conditional');
  assert.equal(r.loan.hdb.ok, false);
});

test('PR + PR 3+ years: resale with SPR quota (non-Malaysian), resale EC yes, bank loan only', () => {
  const r = pathways(hh([PR(), PR()]), policy);
  assert.deepEqual(oks(r), { bto: false, resale: true, ecNew: false, ecResale: true, condo: true, landed: 'conditional' });
  assert.match(r.buy.resale.why.join(' '), /SPR quota \(8% block, 5% neighbourhood\)/);
  assert.equal(r.loan.hdb.ok, false);
  const my = pathways(hh([PR({ nationality: 'MY' }), PR({ nationality: 'MY' })]), policy);
  assert.ok(!my.buy.resale.why.some((w) => /SPR quota/.test(w)), 'Malaysian SPRs are exempt from the SPR quota');
  const unknownYears = pathways(hh([PR({ prYears3Plus: null }), PR()]), policy);
  assert.equal(unknownYears.buy.resale.ok, 'conditional');
});

test('PR single: no HDB flat; condo yes', () => {
  const r = pathways(hh([PR({ age: 40 })], { scheme: 'single' }), policy);
  assert.equal(r.buy.bto.ok, false);
  assert.equal(r.buy.resale.ok, false);
  assert.equal(r.buy.condo.ok, true);
});

test('foreigner on EP: no HDB / new EC; resale EC only 10+ years past TOP; ABSD 60%; may rent HDB', () => {
  const r = pathways(hh([F()]), policy);
  assert.deepEqual(oks(r), { bto: false, resale: false, ecNew: false, ecResale: 'conditional', condo: true, landed: 'conditional' });
  assert.match(r.buy.ecResale.why[0], /at least 10 years past TOP/);
  assert.ok(r.notes.includes('ABSD on this household\'s next purchase: 60%.'));
  assert.equal(r.rent.hdbWhole.ok, true);
  assert.match(r.rent.hdbWhole.why.join(' '), /Non-Citizen quota/);
  assert.equal(r.rent.privateHome.ok, true);
});

test('renting as Work Permit holders: sector rules and Malaysian exemption', () => {
  const wp = (o) => pathways(hh([F({ pass: 'WP', ...o })]), policy).rent;
  const mfg = wp({ wpSector: 'manufacturing' });
  assert.equal(mfg.hdbWhole.ok, false);
  assert.equal(mfg.hdbRoom.ok, true);
  const cmp = wp({ wpSector: 'cmp' });
  assert.equal(cmp.hdbWhole.ok, false);
  assert.equal(cmp.hdbRoom.ok, false);
  assert.equal(wp({ wpSector: 'services' }).hdbWhole.ok, true);
  const my = wp({ wpSector: 'cmp', nationality: 'MY' });
  assert.equal(my.hdbWhole.ok, true);
  assert.ok(!my.hdbWhole.why.some((w) => /Non-Citizen quota/.test(w)), 'Malaysians are exempt from the NC quota');
  assert.equal(wp({ wpSector: null }).hdbWhole.ok, 'conditional');
});

test('private-property owner: resale notes 6-month disposal; HDB loan conditional on the wait-out', () => {
  const r = pathways(hh([SC(), SC()], { propertiesOwned: 1, ownsPrivate: true }), policy);
  assert.equal(r.buy.resale.ok, true);
  assert.match(r.buy.resale.why.join(' '), /within 6 months/);
  assert.equal(r.buy.ecNew.ok, false);
  assert.equal(r.loan.hdb.ok, 'conditional');
  assert.match(r.loan.hdb.why.join(' '), /30-month wait-out/);
});

test('missing buyers: every answer conditional, no throw', () => {
  const r = pathways({ scheme: 'family' }, policy);
  assert.equal(r.buy.bto.ok, 'conditional');
  assert.equal(r.rent.hdbWhole.ok, 'conditional');
  assert.equal(r.nextBest, null);
});
