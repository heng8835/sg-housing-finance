// Annuity maths for a monthly-repayment loan. Pure: no DOM, no clock, no policy.

/** Monthly instalment for `principal` at `annualRate` (0.026 = 2.6 %) over `years`. */
export function pmt(principal, annualRate, years) {
  const r = annualRate / 12, n = years * 12;
  return r ? principal * r / (1 - Math.pow(1 + r, -n)) : principal / n;
}

/** Principal that a monthly `payment` services at `annualRate` over `years` (inverse of pmt). */
export function pv(payment, annualRate, years) {
  const r = annualRate / 12, n = years * 12;
  return r ? payment * (1 - Math.pow(1 + r, -n)) / r : payment * n;
}
