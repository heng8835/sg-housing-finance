---
id: ltv
term: Loan-to-Value limit (LTV)
short: The maximum loan as a share of the lower of the flat's price and valuation — {policy:loan.hdb.ltv} for HDB loans and {policy:loan.bank.ltv} for a first bank loan.
formula: "Max loan = LTV × lower of (price, valuation)"
policy_keys: [loan.hdb.ltv, loan.bank.ltv, loan.bank.ltv.lower_tier, loan.bank.hdb_flat.full_ltv_max_tenure, tenure.age_cap, cpf.lease.cover_to_age]
related: [downpayment, valuation, cov, hdb-loan, bank-loan, lease-to-95]
level: basic
source: https://www.mas.gov.sg/regulation/explainers/new-housing-loans/loan-tenure-and-loan-to-value-limits
---
LTV sets how much of the purchase can be borrowed. It is applied to the lower of the agreed price and HDB's valuation, so any amount paid above valuation is never financed.

For an HDB loan the limit is {policy:loan.hdb.ltv}, pro-rated downwards if the remaining lease does not cover the youngest buyer to age {policy:cpf.lease.cover_to_age}. For a first bank loan it is {policy:loan.bank.ltv}, falling to {policy:loan.bank.ltv.lower_tier} if the tenure on an HDB flat is longer than {policy:loan.bank.hdb_flat.full_ltv_max_tenure} years or the loan runs past age {policy:tenure.age_cap}.

Worked example: e.g. a flat priced at `S$600,000` that is valued at `S$580,000`. The loan is calculated on `S$580,000`, and the buyer funds the rest — including the `S$20,000` gap — from CPF and cash.

Tip: LTV is a ceiling, not a target. Borrowing less lowers the instalment and the total interest, but uses more savings upfront.
