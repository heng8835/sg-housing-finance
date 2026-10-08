// Turns a sample (data.js) into what the sandbox writes into the live keys: the sghf:v2 state and the legacy
// 'hdb-comparer' state (shortlist). Pure — data.js lookups, the date and translation are passed in (node-testable).
import { defaults, STORE_KEY, LEGACY_KEY } from '../../core/store.js';
import { remainingLease } from '../../engine/lease.js';

const parse = (raw) => { try { const v = JSON.parse(raw || 'null'); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; } };
// map / table preferences the sample keeps from the user's own comparer state; the rest (choices, profile,
// workplaces, commute hubs, filters, towns, flat types) belongs to the user and is not carried into the sample
const DROP = ['choices', 'nextId', 'profile', 'workplaces', 'commuteHubs', 'filt', 'towns', 'ft'];

/**
 * @param {object} sample one of SAMPLES
 * @param {{ base?: { [key]: string|null }, resolve?: (blk, street) => ({ bid:number, leaseStart?:number|null }|null),
 *           flatTypes?: string[], asOf: Date, leaseTerm: number, tr?: (s:string) => string }} ctx
 *   base = the user's own raw keys (userSnapshot): UI preferences (language, Simple / Pro, panel width, tour memory)
 *   and map preferences carry over, so the sample looks like the user's app. `flatTypes` = data.js flat_types.
 * @returns {{ state: object, comparer: object, skipped: string[] }} skipped = shortlist names not found in data.js
 */
export function buildSample(sample, { base = {}, resolve = () => null, flatTypes = [], asOf, leaseTerm, tr = (s) => s }) {
  const own = parse(base[STORE_KEY]);
  const d = defaults();
  const ui = { ...d.ui, ...(own && own.ui && typeof own.ui === 'object' ? own.ui : {}) };
  const skipped = [];
  const choices = [];
  const flats = sample.shortlist.map((f) => {
    const hit = resolve(f.blk, f.street);
    const start = Number.isFinite(hit?.leaseStart) && hit.leaseStart > 0 ? hit.leaseStart : f.leaseStart;
    const lease = remainingLease(start, asOf, leaseTerm);
    const name = tr(f.name), ft = flatTypes.indexOf(f.flatType);
    if (!hit || ft < 0) { skipped.push(name); return { f, name, lease, choice: null }; }
    const choice = { id: choices.length + 1, bid: hit.bid, ft, storey: f.storey, sqm: f.sqm, price: f.price, name, url: '', facing: f.facing || '' };
    choices.push(choice);
    return { f, name, lease, choice };
  });
  const first = flats[0];
  const focus = first.choice
    ? { source: 'choice', choiceId: first.choice.id, bid: first.choice.bid, label: first.name, price: first.f.price, flatType: first.f.flatType, remainingLease: first.lease, cov: 0 }
    : { source: 'price', label: first.name, price: first.f.price, flatType: first.f.flatType, remainingLease: first.lease };
  const state = {
    ...d,
    household: { ...d.household, ...clone(sample.household) },
    focus,
    ui,
    plan: { ...d.plan, ...clone(sample.plan) },
    scenarios: [],
  };
  const comparer = Object.fromEntries(Object.entries(parse(base[LEGACY_KEY]) || {}).filter(([k]) => !DROP.includes(k)));
  Object.assign(comparer, { choices, nextId: choices.length + 1, workplaces: [] });
  if (sample.mapTypes) comparer.ft = sample.mapTypes.map((x) => flatTypes.indexOf(x)).filter((i) => i >= 0);
  return { state, comparer, skipped };
}

const clone = (o) => JSON.parse(JSON.stringify(o));

/** The raw strings requestSample() needs: { 'sghf:v2': string, 'hdb-comparer': string }. */
export function samplePayload(built) {
  return { [STORE_KEY]: JSON.stringify(built.state), [LEGACY_KEY]: JSON.stringify(built.comparer) };
}
