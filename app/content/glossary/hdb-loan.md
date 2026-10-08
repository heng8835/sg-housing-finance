---
id: hdb-loan
term: HDB concessionary loan
short: A housing loan from HDB for eligible households, at a rate pegged slightly above the CPF Ordinary Account rate — currently {policy:rate.hdb.concessionary} a year.
formula: ""
policy_keys: [rate.hdb.concessionary, loan.hdb.ltv, tenure.hdb.max, ratio.msr.cap, rate.floor.hdb, eligibility.income_ceiling.family, proposed.cpf.oa.retain_with_hdb_loan]
related: [hfe, bank-loan, ltv, msr, income-ceiling, fixed-vs-floating, refinancing, cpf-oa]
level: basic
source: https://www.hdb.gov.sg/buying-a-flat/flat-grant-and-loan-eligibility/housing-loan/housing-loan-from-hdb
---
HDB lends to eligible buyers with at least one Singapore Citizen in the household. The interest rate is pegged a small margin above the CPF Ordinary Account rate and reviewed quarterly; it is currently {policy:rate.hdb.concessionary}. It has historically been very stable, though not always the cheapest option.

Key limits: the loan is up to {policy:loan.hdb.ltv} of the lower of price and valuation; the tenure is at most {policy:tenure.hdb.max} years; the instalment must pass the MSR cap of {policy:ratio.msr.cap} at the {policy:rate.floor.hdb} floor rate; and family household income must not exceed {policy:eligibility.income_ceiling.family} a month. Ordinary Account savings are generally used first, though buyers may keep up to {policy:proposed.cpf.oa.retain_with_hdb_loan} in the account.

Worked example: e.g. for a `S$500,000` flat, the downpayment under an HDB loan can be paid entirely from CPF, whereas a bank loan needs part of it in cash.

Tip: A valid HFE letter confirming loan eligibility is needed before a seller can grant the Option to Purchase.
