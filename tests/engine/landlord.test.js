import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rentOutCheck, tenancyStampDuty, rentalYield, roomsKey, leaseEnd, tenantCheck, weakest } from '../../app/engine/landlord.js';
import { policy, close } from '../helpers.js';

const base = (o = {}) => ({
  ownerCitizenship: 'SC', flatClass: 'standard', mopMet: true, flatType: '4 ROOM', mode: 'whole',
  occupants: 4, months: 12, startDate: '2026-11-01', tenants: [{ citizenship: 'SC' }], ...o,
});
const rules = (r) => r.issues.filter((i) => i.level === 'block').map((i) => i.rule);

test('helpers: roomsKey, leaseEnd, weakest', () => {
  assert.equal(roomsKey('4 ROOM'), '4+');
  assert.equal(roomsKey('3-room'), '3');
  assert.equal(roomsKey('EXECUTIVE'), '4+');
  assert.equal(roomsKey('MULTI-GENERATION'), '4+');
  assert.equal(roomsKey(null), null);
  assert.equal(leaseEnd('2027-01-01', 24), '2029-01-01');
  assert.equal(leaseEnd('2026-11-15', 3), '2027-02-15');
  assert.equal(weakest('VERIFIED', 'CORROBORATED', 'VERIFIED'), 'CORROBORATED');
  assert.equal(weakest('VERIFIED', 'UNVERIFIED', 'ASSUMPTION'), 'UNVERIFIED');
});

test('SC owner, standard flat after MOP, SC tenants: ok, no NC quota, 36-month max, 8 occupants', () => {
  const r = rentOutCheck(base(), policy);
  assert.equal(r.ok, true);
  assert.equal(r.ncQuotaApplies, false);
  assert.equal(r.maxPeriodMonths, 36);
  assert.equal(r.maxOccupants, 8);
  assert.deepEqual(r.linkOut, []);
});

test('PR owner can never rent out the whole flat, but may rent bedrooms', () => {
  const whole = rentOutCheck(base({ ownerCitizenship: 'PR' }), policy);
  assert.equal(whole.ok, false);
  assert.ok(rules(whole).includes('rental.whole.owner'));
  assert.equal(rentOutCheck(base({ ownerCitizenship: 'PR', mode: 'room', roomsLet: 1 }), policy).ok, true);
});

test('Plus / Prime flats: no whole-flat rental; rooms allowed even during MOP', () => {
  for (const flatClass of ['plus', 'prime']) assert.equal(rentOutCheck(base({ flatClass }), policy).ok, false);
  assert.equal(rentOutCheck(base({ flatClass: 'prime', mode: 'room', mopMet: false, roomsLet: 1 }), policy).ok, true);
});

test('whole flat before MOP is blocked; unknown MOP is a check', () => {
  assert.equal(rentOutCheck(base({ mopMet: false }), policy).ok, false);
  const r = rentOutCheck(base({ mopMet: null }), policy);
  assert.equal(r.ok, true);
  assert.ok(r.issues.some((i) => i.level === 'check' && i.rule === 'rental.whole.owner'));
});

test('bedrooms cannot be let in 1-2 room flats', () => {
  assert.equal(rentOutCheck(base({ mode: 'room', flatType: '2 ROOM', occupants: 2 }), policy).ok, false);
  assert.equal(rentOutCheck(base({ mode: 'room', flatType: '3 ROOM', occupants: 2 }), policy).ok, true);
});

test('NC quota: applies to whole flat with a non-Malaysian non-citizen, not to Malaysians, not to rooms', () => {
  const ep = { citizenship: 'F', nationality: 'US', pass: 'EP' };
  const r = rentOutCheck(base({ tenants: [ep] }), policy);
  assert.equal(r.ncQuotaApplies, true);
  assert.equal(r.maxPeriodMonths, 24);
  assert.equal(r.linkOut[0].url, 'https://services2.hdb.gov.sg/webapp/BR12AWNCQuota/');
  assert.match(r.issues.find((i) => i.rule === 'rental.nc_quota').msg, /11% block, 8% neighbourhood/);
  const my = rentOutCheck(base({ tenants: [{ citizenship: 'F', nationality: 'MY', pass: 'SP' }] }), policy);
  assert.equal(my.ncQuotaApplies, false);
  assert.equal(my.maxPeriodMonths, 36);
  assert.equal(rentOutCheck(base({ mode: 'room', roomsLet: 1, tenants: [ep] }), policy).ncQuotaApplies, false);
  const pr = rentOutCheck(base({ tenants: [{ citizenship: 'PR', nationality: 'other' }] }), policy);
  assert.equal(pr.ncQuotaApplies, true); // non-Malaysian SPR counts
});

test('rental period: under 6 months blocked; 30 months blocked for non-Malaysian foreigners', () => {
  assert.equal(rentOutCheck(base({ months: 5 }), policy).ok, false);
  const r = rentOutCheck(base({ months: 30, tenants: [{ citizenship: 'F', nationality: 'other', pass: 'EP' }] }), policy);
  assert.ok(rules(r).includes('rental.period'));
  assert.equal(rentOutCheck(base({ months: 30 }), policy).ok, true);
});

test('Work Permit tenants: manufacturing whole flat blocked, room ok; CMP blocked unless Malaysian; bedroom cap', () => {
  const mfg = { citizenship: 'F', nationality: 'other', pass: 'WP', wpSector: 'manufacturing' };
  assert.equal(rentOutCheck(base({ tenants: [mfg] }), policy).ok, false);
  assert.equal(rentOutCheck(base({ mode: 'room', roomsLet: 2, tenants: [mfg] }), policy).ok, true);
  assert.equal(rentOutCheck(base({ mode: 'room', roomsLet: 3, tenants: [mfg] }), policy).ok, false); // 4-room: max 2
  assert.equal(rentOutCheck(base({ mode: 'room', flatType: '3 ROOM', roomsLet: 2, occupants: 3, tenants: [mfg] }), policy).ok, false);
  const cmp = { citizenship: 'F', nationality: 'other', pass: 'WP', wpSector: 'cmp' };
  assert.equal(tenantCheck(cmp, 'room', policy).ok, false);
  assert.equal(tenantCheck({ ...cmp, nationality: 'MY' }, 'whole', policy).ok, true);
  assert.equal(tenantCheck({ citizenship: 'F', pass: 'EP', passMonthsLeft: 4 }, 'whole', policy).ok, false);
  assert.equal(tenantCheck({ citizenship: 'F', pass: null }, 'whole', policy).ok, 'conditional');
});

test('occupancy cap by flat type; 4-room+ relaxation ends for leases past 2028', () => {
  const cap = (flatType, o = {}) => rentOutCheck(base({ flatType, ...o }), policy).maxOccupants;
  assert.equal(cap('2 ROOM'), 4);
  assert.equal(cap('3 ROOM'), 6);
  assert.equal(cap('5 ROOM'), 8);
  assert.equal(cap('4 ROOM', { startDate: '2028-06-01', months: 12 }), 6); // runs into 2029
  assert.equal(cap('4 ROOM', { startDate: '2027-01-01', months: 24 }), 8); // ends 31 Dec 2028
  assert.equal(rentOutCheck(base({ occupants: 9 }), policy).ok, false);
  assert.equal(rentOutCheck(base({ flatType: '3 ROOM', occupants: 7 }), policy).ok, false);
});

test('private home: 3-month minimum; 6 unrelated persons, 8 if at least 90 sqm', () => {
  const p = (o) => rentOutCheck({ propertyType: 'private', months: 12, occupants: 7, startDate: '2026-11-01', ...o }, policy);
  assert.equal(p({ sqm: 80 }).ok, false);
  assert.equal(p({ sqm: 80 }).maxOccupants, 6);
  assert.equal(p({ sqm: 95 }).ok, true);
  assert.equal(p({ sqm: 95, months: 2 }).ok, false);
});

test('every issue and result carries a known status', () => {
  const r = rentOutCheck(base({ ownerCitizenship: 'PR', flatClass: 'plus', tenants: [{ citizenship: 'F', pass: 'WP', wpSector: 'cmp' }] }), policy);
  assert.ok(r.issues.length >= 3);
  for (const i of r.issues) assert.ok(['VERIFIED', 'CORROBORATED', 'UNVERIFIED', 'ASSUMPTION'].includes(i.status));
  assert.equal(r.status, 'CORROBORATED'); // WP sector + NC-quota link rest on search extracts
});

test('lease stamp duty: 0.4% of total rent up to 4 years, rounded down', () => {
  assert.equal(tenancyStampDuty({ monthlyRent: 2500, months: 12 }, policy).duty, 120);
  assert.equal(tenancyStampDuty({ monthlyRent: 3333, months: 24 }, policy).duty, 319); // 79,992 x 0.4% = 319.968
  assert.equal(tenancyStampDuty({ monthlyRent: 3000, months: 48 }, policy).duty, 576);
});

test('lease stamp duty: over 4 years uses 4 x average annual rent; exempt when AAR <= S$1,000', () => {
  assert.equal(tenancyStampDuty({ monthlyRent: 3000, months: 60 }, policy).duty, 576); // 36,000 x 4 x 0.4%
  const small = tenancyStampDuty({ monthlyRent: 80, months: 12 }, policy);
  assert.equal(small.duty, 0);
  assert.equal(small.exempt, true);
  assert.equal(tenancyStampDuty({ monthlyRent: 90, months: 12 }, policy).duty, 4); // AAR 1,080
  assert.equal(tenancyStampDuty({ monthlyRent: 0, months: 12 }, policy).duty, 0);
  assert.equal(tenancyStampDuty({ monthlyRent: 2500, months: 12 }, policy).status, 'CORROBORATED');
});

test('rental yield: gross and net', () => {
  const y = rentalYield({ price: 600000, monthlyRent: 3000, annualCosts: 6000 });
  assert.ok(close(y.gross, 0.06, 1e-9));
  assert.ok(close(y.net, 0.05, 1e-9));
  assert.deepEqual(rentalYield({ price: 0, monthlyRent: 3000 }), { gross: null, net: null });
});
