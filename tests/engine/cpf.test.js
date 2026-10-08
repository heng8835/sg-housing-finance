import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  contribution, allocate, monthlyInterest, accruedInterest, retirementSums, bhsFor, bhsForYear,
  lifePayout, projectRa, simulate, schemeKey, srsCap,
} from '../../app/engine/cpf.js';
import { createPolicy } from '../../app/core/policy.js';
import { policy, mergedDoc, close } from '../helpers.js';

// Year-resolved policy so effective-dated tables (1 Jan 2027 senior rates) apply per year.
const cache = new Map();
const byYear = (y) => { if (!cache.has(y)) cache.set(y, createPolicy(mergedDoc(), new Date(y, 6, 1))); return cache.get(y); };
const p2027 = byYear(2027);
const c = (age, monthlyWage, residency = 'SC', prScheme = 'GG', p = policy) => contribution({ age, monthlyWage, residency, prScheme }, p);
const pick = (x) => [x.total, x.employee, x.employer];

test('SC / PR 3rd year at the OW ceiling: CPF table maxima for every age band (2026)', () => {
  assert.deepEqual(pick(c(30, 8000)), [2960, 1600, 1360]);
  assert.deepEqual(pick(c(57, 8000)), [2720, 1440, 1280]);
  assert.deepEqual(pick(c(62, 8000)), [2000, 1000, 1000]);
  assert.deepEqual(pick(c(67, 8000)), [1320, 600, 720]);
  assert.deepEqual(pick(c(72, 8000)), [1000, 400, 600]);
  assert.deepEqual(pick(c(30, 12000, 'PR3+')), [2960, 1600, 1360], 'OW above the S$8,000 ceiling is not subject to CPF');
});

test('1 Jan 2027 senior rates: 55–60 at 35.5% (19%), 60–65 at 26% (13%)', () => {
  assert.deepEqual(pick(c(57, 8000, 'SC', 'GG', p2027)), [2840, 1520, 1320]);
  assert.deepEqual(pick(c(62, 8000, 'SC', 'GG', p2027)), [2080, 1040, 1040]);
  assert.deepEqual(pick(c(30, 8000, 'SC', 'GG', p2027)), [2960, 1600, 1360]);
});

test('PR 1st / 2nd year, graduated (G/G) and full-employer (F/G) maxima', () => {
  assert.deepEqual(pick(c(30, 8000, 'PR1', 'GG')), [720, 400, 320]);
  assert.deepEqual(pick(c(30, 8000, 'PR2', 'GG')), [1920, 1200, 720]);
  assert.deepEqual(pick(c(30, 8000, 'PR1', 'FG')), [1760, 400, 1360]);
  assert.deepEqual(pick(c(30, 8000, 'PR2', 'FG')), [2560, 1200, 1360]);
  assert.deepEqual(pick(c(62, 8000, 'PR2', 'GG')), [880, 600, 280]);
  assert.deepEqual(pick(c(57, 8000, 'PR2', 'FG')), [2280, 1000, 1280]);
  assert.deepEqual(pick(c(30, 8000, 'PR1', 'FF')), [2960, 1600, 1360], 'approved full/full joint application uses the full table');
});

test('low-wage bands: nil ≤ $50, employer-only to $500, phased employee share to $750', () => {
  assert.deepEqual(pick(c(30, 50)), [0, 0, 0]);
  assert.deepEqual(pick(c(30, 400)), [68, 0, 68]);
  assert.deepEqual(pick(c(30, 600)), [162, 60, 102]);
  assert.deepEqual(pick(c(30, 750)), [278, 150, 128]);
  assert.deepEqual(pick(c(30, 751)), [278, 150, 128], 'continuous at the $750 boundary');
});

test('additional wages: contributions on OW (capped) + AW', () => {
  const x = contribution({ age: 30, monthlyWage: 8000, additionalWage: 10000, residency: 'SC' }, policy);
  assert.deepEqual(pick(x), [6660, 3600, 3060]);
});

test('allocation matches CPF worked examples and sums to the total', () => {
  assert.deepEqual(allocate(100, 30, policy), { oa: 62.17, sa: 16.21, ma: 21.62, ra: 0 });
  assert.deepEqual(allocate(100, 57, policy), { oa: 35.3, sa: 0, ma: 30.88, ra: 33.82 });
  assert.deepEqual(allocate(100, 57, p2027), { oa: 33.82, sa: 0, ma: 29.57, ra: 36.61 });
  for (const age of [25, 40, 48, 52, 58, 63, 68, 75]) {
    for (const res of ['SC', 'PR1', 'PR2']) {
      const x = c(age, 5432, res);
      const a = x.alloc;
      assert.ok(close(a.oa + a.sa + a.ma + a.ra, x.total), `age ${age} ${res}`);
      assert.ok(a.oa >= 0 && a.ma > 0);
    }
  }
});

test('foreigners: CPF not applicable; SRS cap S$35,700 vs S$15,300', () => {
  assert.equal(schemeKey('F'), null);
  assert.equal(c(30, 8000, 'F').applicable, false);
  const s = simulate({ startAge: 30, endAge: 65, startYear: 2026, wage: { monthly: 8000 }, residency: 'F' }, policy);
  assert.equal(s.applicable, false);
  assert.equal(s.srsAnnualCap, 35700);
  assert.equal(srsCap('SC', policy), 15300);
  assert.equal(srsCap('PR2', policy), 15300);
});

test('interest on a known balance: OA 2.5% + 1% extra (to SA) below 55', () => {
  const m = monthlyInterest({ oa: 10000, sa: 0, ma: 0, ra: 0 }, 30, policy);
  assert.ok(close(m.oa * 12, 250));
  assert.ok(close(m.sa * 12, 100), 'extra interest on OA goes to SA');
  const s = simulate({ startAge: 30, endAge: 30, startYear: 2026, balances: { oa: 10000 } }, policy);
  assert.equal(s.rows[0].oa, 10250);
  assert.equal(s.rows[0].sa, 100);
});

test('extra interest is capped: first $60k combined, OA counts at most $20k', () => {
  const m = monthlyInterest({ oa: 50000, sa: 50000, ma: 0, ra: 0 }, 30, policy);
  assert.ok(close(m.extra * 12, 600));
  assert.ok(close(m.sa * 12, 50000 * 0.04 + 600), 'SA: 4% + its own extra + the OA extra');
  const senior = monthlyInterest({ oa: 0, sa: 0, ma: 0, ra: 100000 }, 60, policy);
  assert.ok(close(senior.ra * 12, 4000 + 900), '55+: 2% on first $30k, 1% on next $30k');
});

test('retirement sums: published 2026/2027 cohorts, ERS = 2 × FRS, projection beyond', () => {
  assert.deepEqual(retirementSums(2026, policy), { year: 2026, brs: 110200, frs: 220400, ers: 440800, projected: false });
  assert.equal(retirementSums(2027, policy).frs, 228200);
  const p = retirementSums(2028, policy);
  assert.equal(p.projected, true);
  assert.equal(p.brs, 118100);
  assert.equal(p.frs, 236200);
});

test('Basic Healthcare Sum: S$79,000 in 2026, fixed at the age-65 year', () => {
  assert.equal(bhsForYear(2026, policy), 79000);
  assert.equal(bhsFor(2030, 66, policy), bhsForYear(2029, policy));
  assert.ok(bhsForYear(2030, policy) > 79000);
});

test('RA formation at 55: SA first, then OA, up to the FRS; SA closed', () => {
  const s = simulate({ startAge: 55, endAge: 55, startYear: 2026, balances: { oa: 100000, sa: 150000 } }, policy);
  assert.equal(s.at55.raFormed, 220400);
  assert.equal(s.at55.fromSa, 150000);
  assert.equal(s.at55.fromOa, 70400);
  assert.deepEqual([s.at55.metBRS, s.at55.metFRS, s.at55.metERS], [true, true, false]);
  assert.equal(s.rows[0].sa, 0);
  const rich = simulate({ startAge: 55, endAge: 55, startYear: 2026, balances: { oa: 10000, sa: 250000 } }, policy);
  assert.equal(rich.at55.fromOa, 0);
  assert.ok(rich.rows[0].oa > 39600, 'SA above the FRS moves to OA');
  const poor = simulate({ startAge: 55, endAge: 55, startYear: 2026, balances: { oa: 20000, sa: 100000 }, housing: { pledge: true } }, policy);
  assert.deepEqual([poor.at55.metBRS, poor.at55.metFRS, poor.at55.metFRSWithPledge], [true, false, true]);
});

test('accrued interest compounds yearly at the OA rate', () => {
  const a = accruedInterest([{ month: 0, amount: 100000 }], 120, policy);
  assert.ok(close(a.accrued, 100000 * (1.025 ** 10 - 1)), String(a.accrued));
  const two = accruedInterest([{ month: 0, amount: 50000 }, { month: 12, amount: 50000 }], 24, policy);
  assert.ok(close(two.accrued, 50000 * (1.025 ** 2 - 1) + 50000 * 0.025));
  assert.ok(two.accrued > 50000 * 0.025 * 2 + 50000 * 0.025, 'more than simple interest');
});

test('housing: OA use reduces OA, accrues interest, never increases RA at 55', () => {
  const base = { startAge: 30, endAge: 55, startYear: 2026, balances: { oa: 60000, sa: 20000, ma: 25000 }, wage: { monthly: 5000, growth: 0.02, bonusMonths: 1 } };
  const without = simulate(base, byYear);
  const withH = simulate({ ...base, housing: { oaUpfront: 50000, monthlyFromOa: 1200, untilAge: 55 } }, byYear);
  assert.ok(withH.at55.raFormed <= without.at55.raFormed);
  const last = withH.rows[withH.rows.length - 1];
  assert.ok(last.oa < without.rows[without.rows.length - 1].oa);
  assert.ok(last.accruedInterest > 0 && last.housingPrincipal > 50000);
  assert.ok(withH.rows.every((r) => r.oa >= 0));
  const short = simulate({ ...base, balances: { oa: 1000 }, housing: { oaUpfront: 50000 } }, policy);
  assert.equal(short.rows[0].cashShortfall, 49000);
});

test('projection: first-year contributions, PR status advances, MA capped at the BHS', () => {
  const s = simulate({ startAge: 30, endAge: 32, startYear: 2026, wage: { monthly: 5000 }, residency: 'PR1' }, byYear);
  assert.deepEqual(s.rows.map((r) => r.residency), ['PR1', 'PR2', 'PR3+']);
  assert.equal(s.rows[0].contributions, 450 * 12);
  assert.equal(s.rows[2].contributions, 1850 * 12);
  const full = simulate({ startAge: 30, endAge: 30, startYear: 2026, balances: { ma: 79000 }, wage: { monthly: 5000 } }, policy);
  assert.equal(full.rows[0].ma, 79000);
  assert.ok(full.rows[0].sa > 0, 'MA contributions and interest above the BHS flow to SA');
  const senior = simulate({ startAge: 57, endAge: 58, startYear: 2026, balances: { ra: 100000 }, wage: { monthly: 8000 } }, byYear);
  assert.deepEqual(senior.rows.map((r) => r.contributions), [2720 * 12, 2840 * 12], '2027 senior rates apply from 2027');
});

test('CPF LIFE estimate reproduces CPF anchors (BRS $950, FRS $1,780, ERS $3,440 at 65)', () => {
  for (const [ra55, monthly] of [[110200, 950], [220400, 1780], [440800, 3440]]) {
    const est = lifePayout(projectRa(ra55, 10, policy), policy);
    assert.equal(est.monthly, monthly);
    assert.ok(est.monthlyLow <= monthly && monthly <= est.monthlyHigh);
  }
  const s = simulate({ startAge: 55, endAge: 65, startYear: 2026, balances: { sa: 220400 } }, byYear);
  assert.equal(s.life.monthly, 1780);
  const mid = lifePayout(projectRa(165300, 10, policy), policy);
  assert.ok(mid.monthly > 950 && mid.monthly < 1780 && mid.monthlyLow < mid.monthlyHigh);
});

test('full working-life projection is internally consistent', () => {
  const s = simulate({ startAge: 25, endAge: 70, startYear: 2026, wage: { monthly: 4500, growth: 0.03, bonusMonths: 2, untilAge: 65 } }, byYear);
  assert.equal(s.rows.length, 46);
  assert.ok(s.at55.metBRS);
  assert.ok(s.life.monthly > 0);
  for (const r of s.rows) assert.ok(close(r.total, r.oa + r.sa + r.ma + r.ra, 0.05));
  assert.ok(s.rows.filter((r) => r.age >= 65).every((r) => r.contributions === 0));
  assert.ok(s.rows.filter((r) => r.age >= 55).every((r) => r.sa === 0));
});
