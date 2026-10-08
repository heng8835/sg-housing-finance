// Lease arithmetic (BR-C1). Pure: the caller passes `asOf` and the policy values.

/**
 * Years left on a lease that started in `leaseStartYear`, as of the date `asOf`.
 * Start month is unknown in the data, so January is assumed (error up to 1 year).
 * Returns null when the start year is missing or invalid — callers show "unknown".
 */
export function remainingLease(leaseStartYear, asOf, termYears) {
  if (!Number.isFinite(leaseStartYear) || leaseStartYear <= 0) return null;
  return termYears - (asOf.getFullYear() - leaseStartYear) - asOf.getMonth() / 12;
}

/** Does `remaining` lease last until the youngest owner reaches `targetAge`? null if unknown. */
export function coversToAge(remaining, youngestAge, targetAge) {
  if (remaining == null || !youngestAge) return null;
  return remaining >= targetAge - youngestAge;
}
