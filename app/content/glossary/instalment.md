---
id: instalment
term: Monthly instalment
short: The fixed monthly repayment on a home loan, covering that month's interest plus part of the principal.
formula: "Instalment = P × r ÷ (1 − (1 + r)^−n), where P = loan, r = annual rate ÷ 12, n = tenure in months"
policy_keys: [rate.floor.hdb, rate.floor.bank, ratio.msr.cap]
related: [amortisation, tenure, msr, total-interest, floor-rate]
level: basic
source: https://www.hdb.gov.sg/buying-a-flat/flat-grant-and-loan-eligibility/housing-loan/housing-loan-from-hdb
---
The instalment is what the borrower pays each month. For a standard home loan it stays the same as long as the interest rate stays the same. Early on most of it is interest; over time more of it goes to reducing the principal.

Three things set the instalment: the loan amount, the interest rate and the tenure. A bigger loan or a higher rate increases it; a longer tenure reduces it.

For affordability checks, lenders compute the instalment at the floor rate — {policy:rate.floor.hdb} for HDB loans, {policy:rate.floor.bank} for bank loans — whenever that is higher than the actual rate, and compare it with the MSR cap of {policy:ratio.msr.cap} of income.

Worked example: e.g. a `S$400,000` loan over `20` years at an illustrative `3.2%` costs about `S$2,260` a month. At an illustrative `4.2%`, the same loan costs about `S$2,470`.

Tip: A rate change of around one percentage point moves the instalment by a couple of hundred dollars a month on a loan of this size, which is why rate assumptions matter.
