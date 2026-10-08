---
id: floor-rate
term: Interest rate floor (stress-test rate)
short: A minimum interest rate lenders use when checking affordability — {policy:rate.floor.hdb} for HDB loans and {policy:rate.floor.bank} for bank loans — even if the actual rate is lower.
formula: "Assessment rate = max(actual rate, floor rate)"
policy_keys: [rate.floor.hdb, rate.floor.bank, rate.hdb.concessionary, ratio.msr.cap]
related: [msr, tdsr, stress-test, hdb-loan, bank-loan, instalment]
level: intermediate
source: https://www.mas.gov.sg/regulation/explainers/tdsr-for-property-loans/calculating-tdsr
---
When HDB or a bank works out how much it can lend, it does not plug today's interest rate into the MSR and TDSR checks. It uses the higher of the actual rate and a floor rate: {policy:rate.floor.hdb} for an HDB loan, and {policy:rate.floor.bank} for a bank loan on residential property.

The floor exists so that borrowers can still cope if rates rise. Because it is often above the rate actually charged — the HDB concessionary rate is currently {policy:rate.hdb.concessionary} — the maximum loan is smaller than a calculation at the real rate would suggest.

Worked example: e.g. a `S$400,000` loan over `20` years. The instalment used for the MSR check is computed at the floor rate, so it is higher than the instalment the borrower will actually pay. It is that floor-rate instalment that must fit within {policy:ratio.msr.cap} of income.

Tip: The gap between the floor-rate instalment and the actual instalment is a built-in safety margin; comparing the two shows how much room the household has if rates go up.
