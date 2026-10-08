---
id: tenure
term: Loan tenure
short: The number of years over which a home loan is repaid; a longer tenure lowers the monthly instalment but raises the total interest paid.
formula: ""
policy_keys: [tenure.hdb.max, tenure.age_cap, tenure.bank.hdb_flat.max, loan.bank.hdb_flat.full_ltv_max_tenure, loan.bank.ltv.lower_tier, tenure.hdb.lease_buffer]
related: [instalment, total-interest, amortisation, ltv, hdb-loan, bank-loan, remaining-lease]
level: basic
source: https://www.hdb.gov.sg/buying-a-flat/flat-grant-and-loan-eligibility/housing-loan/housing-loan-from-hdb
---
Tenure is how long the loan runs. For an HDB loan it is the shortest of {policy:tenure.hdb.max} years, age {policy:tenure.age_cap} minus the buyers' average age, and the remaining lease minus {policy:tenure.hdb.lease_buffer} years. For a bank loan on an HDB flat the cap is {policy:tenure.bank.hdb_flat.max} years, but going beyond {policy:loan.bank.hdb_flat.full_ltv_max_tenure} years, or past age {policy:tenure.age_cap}, cuts the LTV to {policy:loan.bank.ltv.lower_tier}.

A longer tenure spreads the repayments over more months, so each instalment is smaller and the MSR test is easier to pass. The trade-off is that interest is paid for longer, so the total interest is higher.

Worked example: e.g. a `S$400,000` loan at an illustrative `3.2%` costs about `S$2,260` a month over `20` years but about `S$1,730` over `30` years — while total interest rises from about `S$142,000` to about `S$223,000`.

Tip: Older buyers often get a shorter tenure because of the age limit, which raises the instalment for the same loan.
