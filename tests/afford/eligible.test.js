// Phase 7b B11 — Afford notes that fit the household: "Bank loan — {reason}" + Why? for a household that can't take
// an HDB loan; grants it can't get, folded, with the engine's reason; the employment assumption only with a grant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPurchase } from '../../app/engine/plan.js';
import { grants } from '../../app/engine/grants.js';
import { bankLoanNote, grantsMissingFold } from '../../app/modules/afford/eligible.js';
import { grantNotesFor, grantsMissing, GRANT_ASSUMPTION, NO_PHG, NO_EHG_BAND } from '../../app/core/grantnotes.js';
import { policy } from '../helpers.js';

const hh = (o) => ({ scheme: 'family', firstTimer: true, propertiesOwned: 0, parents: 'none', loan: 'hdb', tenure: 25, grantsOverride: null, otherDebts: null, cash: 80000, ...o });
const FLAT = { price: 520000, flatType: '4 ROOM', remainingLease: 80 };
const PR_SINGLE = hh({ scheme: 'single', buyers: [{ age: 35, income: 6800, citizenship: 'PR', prYears3Plus: true, nationality: 'other', cpfOa: 40000 }] });
const SC_COUPLE = hh({ buyers: [{ age: 32, income: 5000, citizenship: 'SC', cpfOa: 60000 }, { age: 31, income: 4500, citizenship: 'SC', cpfOa: 50000 }] });

test('PR-only household: "Bank loan — reason" with Why? (→ Learn hdb-loan); nothing for an SC couple', () => {
  const p = planPurchase({ household: PR_SINGLE, flat: FLAT }, policy);
  const note = bankLoanNote(p);
  assert.match(note, /Bank loan — An HDB loan needs at least one Singapore Citizen buyer/);
  assert.match(note, /id="afLoanWhy">Why\?/);
  assert.equal(bankLoanNote(planPurchase({ household: SC_COUPLE, flat: FLAT }, policy)), '');
});

test('grants you can\'t get now: listed with the reason; none with an override; PHG explained by the parents setting', () => {
  const pr = planPurchase({ household: PR_SINGLE, flat: FLAT }, policy);
  const fold = grantsMissingFold(pr, PR_SINGLE, 'pro');
  assert.match(fold, /Grants you can&#39;t get now \(3\)|Grants you can't get now \(3\)/);
  assert.match(fold, /CPF housing grants need at least one Singapore Citizen buyer/);
  const sc = planPurchase({ household: SC_COUPLE, flat: FLAT }, policy);
  const missing = grantsMissing(sc.grants, SC_COUPLE).map((x) => x.id);
  assert.ok(!missing.some((id) => sc.grants.items.some((i) => i.id === id)), 'a grant the household gets is never listed');
  assert.deepEqual(grantsMissing(sc.grants, SC_COUPLE).find((x) => x.id === 'phg'), { id: 'phg', why: NO_PHG });
  assert.equal(grantsMissingFold(sc, { ...SC_COUPLE, grantsOverride: 30000 }), '');
  // CHG but no EHG: income above the EHG bands
  const rich = hh({ buyers: [{ age: 32, income: 7000, citizenship: 'SC' }, { age: 31, income: 6500, citizenship: 'SC' }] });
  const g = grants({ household: rich, flatType: '4 ROOM' }, policy);
  if (g.items.some((i) => i.id === 'chg') && !g.items.some((i) => i.id === 'ehg')) assert.equal(grantsMissing(g, rich).find((x) => x.id === 'ehg').why, NO_EHG_BAND);
});

test('notes only when they apply: the employment assumption needs a grant to be about', () => {
  const none = grants({ household: PR_SINGLE, flatType: '4 ROOM' }, policy);
  assert.ok(!grantNotesFor(none).includes(GRANT_ASSUMPTION));
  const some = grants({ household: SC_COUPLE, flatType: '4 ROOM' }, policy);
  assert.ok(some.items.length > 0);
  assert.ok(grantNotesFor(some).includes(GRANT_ASSUMPTION));
  // no money changes: the grant total is the engine's
  assert.equal(planPurchase({ household: SC_COUPLE, flat: FLAT }, policy).grants.total, some.total);
});
