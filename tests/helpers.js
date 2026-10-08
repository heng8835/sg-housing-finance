// Shared test helpers: the real policy file, resolved for a fixed date so results are reproducible.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createPolicy } from '../app/core/policy.js';

export const POLICY_URL = new URL('../app/policy/sg-policy.json', import.meta.url);
export const policyDoc = () => JSON.parse(readFileSync(POLICY_URL, 'utf8'));
// Staging area: topic fragments (same schema, { "params": [...] }) are merged into the main file
// by the integrator. Tests see main + fragments so engines can be built in parallel.
export const FRAGMENTS_URL = new URL('../app/policy/fragments/', import.meta.url);
export const fragmentDocs = () => (existsSync(FRAGMENTS_URL)
  ? readdirSync(FRAGMENTS_URL).filter((f) => f.endsWith('.json')).map((f) => ({ file: f, ...JSON.parse(readFileSync(new URL(f, FRAGMENTS_URL), 'utf8')) }))
  : []);
export const mergedDoc = () => { const d = policyDoc(); return { ...d, params: [...d.params, ...fragmentDocs().flatMap((f) => f.params)] }; };
export const AS_OF = new Date(2026, 9, 6); // 6 Oct 2026 — the characterisation capture date
export const policy = createPolicy(mergedDoc(), AS_OF);

export const close = (actual, expected, tol = 0.01) => Math.abs(actual - expected) <= tol;
