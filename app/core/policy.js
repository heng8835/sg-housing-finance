// Policy single source of truth (DEC-013). Every Singapore rule value lives in
// policy/sg-policy.json with a source URL and an effective date; code asks for it by id.

/**
 * Wrap a policy document so values resolve for the date `asOf`.
 * get(id) throws on an unknown id or an unsourced (null) value — never falls back silently.
 */
export function createPolicy(doc, asOf) {
  const day = asOf.toISOString().slice(0, 10);
  const entry = (id) => {
    const hits = doc.params.filter((p) => p.id === id && p.effective_from <= day && (p.effective_to == null || day <= p.effective_to));
    if (!hits.length) throw new Error(`policy: no value for "${id}" on ${day}`);
    return hits[hits.length - 1];
  };
  const years = new Map();
  return {
    /** The same rules resolved for 1 Jan of `year` — for multi-year projections (engine/cpf.js simulate). */
    forYear(year) {
      if (!years.has(year)) years.set(year, createPolicy(doc, new Date(Date.UTC(year, 0, 1))));
      return years.get(year);
    },
    version: doc.version,
    reviewed: doc.reviewed,
    reviewDue: doc.review_due,
    /** Every entry (all dates), copied — for the policy-change log in Learn. */
    params: () => doc.params.map((p) => ({ ...p })),
    get(id) {
      const p = entry(id);
      if (p.value == null) throw new Error(`policy: "${id}" has no verified value yet`);
      return p.value;
    },
    meta: entry,
    unverified: () => doc.params.filter((p) => p.status !== 'VERIFIED').map((p) => p.id),
  };
}

export async function loadPolicy(url, asOf = new Date()) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`could not load ${url} (${res.status})`);
  return createPolicy(await res.json(), asOf);
}
