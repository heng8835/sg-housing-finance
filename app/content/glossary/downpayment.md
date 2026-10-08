---
id: downpayment
term: Downpayment
short: The part of the purchase price not covered by the loan, paid from CPF and/or cash; its size and cash portion depend on the loan type.
formula: "Downpayment = price − loan amount"
policy_keys: [loan.hdb.ltv, loan.bank.ltv, downpayment.bank.cash_min]
related: [ltv, cov, cpf-housing, hdb-loan, bank-loan, upfront-cost]
level: basic
source: https://www.mas.gov.sg/regulation/explainers/new-housing-loans/loan-tenure-and-loan-to-value-limits
---
The downpayment is the buyer's own contribution to the price. With an HDB loan of up to {policy:loan.hdb.ltv}, the remainder can be paid with CPF Ordinary Account savings, cash, or both. With a bank loan of up to {policy:loan.bank.ltv}, at least {policy:downpayment.bank.cash_min} of the price must be paid in cash, and the rest of the downpayment can come from CPF.

Because the loan is based on the lower of price and valuation, any Cash Over Valuation is added on top of the normal downpayment and must be paid in cash.

Worked example: e.g. a `S$600,000` flat valued at `S$600,000`: the downpayment is the price minus the loan. If the agreed price were `S$620,000` with the same valuation, the extra `S$20,000` is COV, payable in cash on top.

Tip: Housing grants are credited to CPF and go towards the purchase, so the grant amount in the HFE letter directly reduces what the household has to find.
