// Module Web Worker: runs engine/montecarlo.js off the main thread (core/mc.js starts it; node tests and
// browsers without module workers use the same RUNNERS on the main thread). Not imported by other engine
// code. Messages stay inside the browser (same-origin worker — no network).
//   in:  { id, kind:'rentbuy'|'cpf', args, opts:{ n, seed, percentiles }, doc:{ params, version, reviewed, review_due }, asOf:'YYYY-MM-DD' }
//   out: { id, ok:true, out } | { id, ok:false, error }
// The policy document comes from the page (the one it already loaded), resolved for the page's date.
import { createPolicy } from '../core/policy.js';
import { RUNNERS } from './montecarlo.js';

let cached = { key: null, policy: null };
const policyFor = (doc, asOf) => {
  const key = `${doc.version}|${doc.params.length}|${asOf}`;
  if (cached.key !== key) cached = { key, policy: createPolicy(doc, new Date(`${asOf}T00:00:00Z`)) };
  return cached.policy;
};

self.onmessage = (e) => {
  const { id, kind, args, opts, doc, asOf } = e.data || {};
  try {
    const run = RUNNERS[kind];
    if (!run) throw new Error(`unknown Monte-Carlo kind "${kind}"`);
    self.postMessage({ id, ok: true, out: run(args, policyFor(doc, asOf), opts) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
