// Monte-Carlo client (Phase 6c): runs engine/montecarlo.js in a module Web Worker (engine/mc.worker.js) so
// the page never blocks; falls back to the main thread when Worker is missing (node tests, old browsers) or
// the worker fails. Results are cached in memory by input (household numbers never leave the browser — the
// worker is same-origin; nothing is stored, logged or sent anywhere).
import { RUNNERS } from '../engine/montecarlo.js';

// UI choices (not rules): how many futures, which percentiles, a fixed seed so the same inputs always show the
// same range (no flicker between renders; reproducible in tests).
export const MC_PERCENTILES = [10, 25, 50, 75, 90];
export const MC_DRAWS_RENTBUY = 2000;
export const MC_DRAWS_CPF = 1000;   // a CPF future is ~40 yearly steps × 12 months — 1,000 keeps a buyer under ~1 s
export const MC_SEED = 20261007;
/** Store path of the shared Pro switch "Show range (Monte-Carlo)" (Rent chart + Plan CPF cards); absent = off. */
export const MC_FLAG = 'plan.mcRange';
/** Share of futures inside the outer band (P10–P90 → 80). */
export const MC_OUTER_SHARE = MC_PERCENTILES[MC_PERCENTILES.length - 1] - MC_PERCENTILES[0];
const CACHE_MAX = 24;

const cache = new Map();          // key → { promise, value? }
const pending = new Map();        // id → { resolve, reject, job }
let worker = null, broken = false, seq = 0;

const local = (job) => new Promise((resolve, reject) => {
  setTimeout(() => { try { resolve(RUNNERS[job.kind](job.args, job.policy, job.opts)); } catch (err) { reject(err); } }, 0);
});

function getWorker() {
  if (worker || broken) return worker;
  if (typeof Worker === 'undefined' || typeof window === 'undefined') { broken = true; return null; }
  try {
    worker = new Worker(new URL('../engine/mc.worker.js', import.meta.url), { type: 'module' });
  } catch { broken = true; return null; }
  worker.onmessage = (e) => {
    const { id, ok, out, error } = e.data || {};
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (ok) p.resolve(out); else p.reject(new Error(error));
  };
  // a worker that cannot start (old browser, blocked module worker): finish everything on the main thread
  worker.onerror = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    broken = true; worker.terminate(); worker = null;
    for (const [id, p] of pending) { pending.delete(id); local(p.job).then(p.resolve, p.reject); }
  };
  return worker;
}

const optsOf = (opts) => ({ seed: MC_SEED, percentiles: MC_PERCENTILES, ...opts });
const keyOf = (kind, args, o) => JSON.stringify([kind, args, o]);

/**
 * Run a named Monte-Carlo job ('rentbuy' | 'cpf', see engine/montecarlo.js RUNNERS); resolves to its result.
 * Same kind + args + opts → the same (cached) promise.
 * @param {'rentbuy'|'cpf'} kind
 * @param {object} args plain, cloneable inputs
 * @param {object} policy the page's resolved policy
 * @param {{ n:number, seed?:number, percentiles?:number[] }} opts
 */
export function runMc(kind, args, policy, opts) {
  const o = optsOf(opts), key = keyOf(kind, args, o);
  if (cache.has(key)) return cache.get(key).promise;
  const job = { kind, args, opts: o, policy };
  const w = getWorker();
  const promise = !w ? local(job) : new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject, job });
    const doc = { params: policy.params(), version: policy.version, reviewed: policy.reviewed, review_due: policy.reviewDue };
    // the page's policy is resolved for today (UTC day, as core/policy.js createPolicy does)
    try { w.postMessage({ id, kind, args, opts: o, doc, asOf: new Date().toISOString().slice(0, 10) }); } catch { pending.delete(id); local(job).then(resolve, reject); }
  });
  const entry = { promise };
  cache.set(key, entry);
  promise.then((v) => { entry.value = v; }, () => cache.delete(key));
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return promise;
}

/** The finished result for this job, else undefined (so a re-render can draw at once). */
export function mcResult(kind, args, opts) {
  const e = cache.get(keyOf(kind, args, optsOf(opts)));
  return e ? e.value : undefined;
}
