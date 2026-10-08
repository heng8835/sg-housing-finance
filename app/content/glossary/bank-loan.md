---
id: bank-loan
term: Bank loan (for an HDB flat)
short: A home loan from a bank or financial institution, priced off market rates, with an LTV of up to {policy:loan.bank.ltv} and both MSR and TDSR checks.
formula: ""
policy_keys: [loan.bank.ltv, loan.bank.ltv.lower_tier, tenure.bank.hdb_flat.max, ratio.msr.cap, ratio.tdsr.cap, rate.floor.bank, downpayment.bank.cash_min]
related: [hdb-loan, ltv, tdsr, msr, sora, fixed-vs-floating, refinancing, downpayment]
level: basic
source: https://www.mas.gov.sg/regulation/explainers/new-housing-loans/loan-tenure-and-loan-to-value-limits
---
HDB flat buyers can borrow from a bank instead of HDB. Bank loans are not subject to HDB's income ceiling, and their rates follow the market, so they can be lower or higher than the HDB rate at different times.

MAS sets the rules. A first housing loan can be up to {policy:loan.bank.ltv} of the lower of price and valuation (or {policy:loan.bank.ltv.lower_tier} if the tenure or age limits are exceeded), and the tenure on an HDB flat is capped at {policy:tenure.bank.hdb_flat.max} years. At least {policy:downpayment.bank.cash_min} of the price must be paid in cash. The loan must pass both MSR ({policy:ratio.msr.cap}) and TDSR ({policy:ratio.tdsr.cap}), tested at {policy:rate.floor.bank} or the actual rate if higher.

Worked example: e.g. a `S$500,000` flat bought with a bank loan needs a cash portion in the downpayment, while the same flat with an HDB loan could be paid for entirely from CPF and the loan.

Tip: Moving from an HDB loan to a bank loan later is possible, but moving from a bank loan back to an HDB loan is not.
