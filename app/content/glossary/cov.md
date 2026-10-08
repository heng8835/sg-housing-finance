---
id: cov
term: Cash Over Valuation (COV)
short: The amount by which an agreed resale price exceeds HDB's valuation; it cannot be covered by a loan or CPF and must be paid in cash.
formula: "COV = max(0, agreed price − HDB valuation)"
policy_keys: [loan.hdb.ltv, loan.bank.ltv]
related: [valuation, downpayment, ltv, upfront-cost, fair-value, option-fee]
level: basic
source: https://www.hdb.gov.sg/hdb-flat-portal/buying-and-selling-an-hdb-resale-flat/get-help/buying-a-flat/request-for-value-of-flat
---
In an HDB resale, buyer and seller agree a price, then HDB assesses the flat's value. The loan and CPF usage are based on the lower of the two. If the price is higher, the difference is Cash Over Valuation, and it has to be paid in cash.

COV is not a fee or a tax; it is part of the price that cannot be borrowed against. It tends to appear when demand is strong and fade when the market cools.

Worked example: e.g. agreed price `S$650,000`, valuation `S$630,000`: COV is `S$20,000` in cash. The loan is capped at {policy:loan.hdb.ltv} (HDB loan) or {policy:loan.bank.ltv} (bank loan) of `S$630,000`, not of the price.

Tip: The valuation is only known after the Option to Purchase is granted, so many buyers keep a cash buffer for possible COV. This app's recent-sales benchmark gives a sense of whether an asking price sits above nearby transactions.
