---
id: valuation
term: HDB valuation (Request for Value)
short: HDB's assessment of a resale flat's market value, requested after the Option to Purchase is granted; it caps the loan and CPF usage.
formula: "Loan and CPF base = lower of (agreed price, HDB valuation)"
policy_keys: [loan.hdb.ltv, loan.bank.ltv]
related: [cov, ltv, vl-wl, option-fee, cpf-housing]
level: intermediate
source: https://www.hdb.gov.sg/hdb-flat-portal/buying-and-selling-an-hdb-resale-flat/get-help/buying-a-flat/request-for-value-of-flat
---
Buyers paying with CPF savings or a housing loan must submit a Request for Value to HDB once they hold an Option to Purchase. HDB then assesses the flat, and the result becomes the reference for the maximum loan — {policy:loan.hdb.ltv} for an HDB loan or {policy:loan.bank.ltv} for a bank loan — and for how much CPF can be used.

The valuation is independent of the agreed price. If the price is above it, the gap is Cash Over Valuation, payable in cash. If the price is at or below the valuation, the loan and CPF limits are based on the price instead.

Worked example: e.g. agreed price `S$580,000`, valuation `S$590,000`: the loan is based on `S$580,000`, the lower figure, and there is no COV.

Tip: The valuation result is valid only for a limited period, so the resale application has to follow within that window, or a new request is needed.
