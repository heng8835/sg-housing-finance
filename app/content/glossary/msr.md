---
id: msr
term: Mortgage Servicing Ratio (MSR)
short: The share of gross monthly household income that goes to home-loan instalments; for HDB flats it may not exceed {policy:ratio.msr.cap}.
formula: "MSR = monthly instalment ÷ gross monthly household income"
policy_keys: [ratio.msr.cap, rate.floor.hdb, rate.floor.bank]
related: [tdsr, ltv, floor-rate, instalment, stress-test]
level: basic
source: https://www.mas.gov.sg/regulation/explainers/new-housing-loans/msr-and-tdsr-rules
---
MSR measures how much of a household's gross monthly income is committed to the mortgage on the flat. For HDB flats the cap is {policy:ratio.msr.cap}, and it applies whether the loan comes from HDB or from a bank.

Lenders do not test MSR at the rate the borrower will actually pay. The instalment is worked out at the higher of the actual rate and a floor rate: {policy:rate.floor.hdb} for an HDB loan, or {policy:rate.floor.bank} for a bank loan. This builds in a buffer in case rates rise.

Worked example: e.g. a couple earning `S$8,000` a month combined. Their instalment, computed at the floor rate, may be at most {policy:ratio.msr.cap} of `S$8,000`. That ceiling on the instalment, together with the tenure, sets the largest loan they can take.

Tip: MSR uses gross income, before CPF contributions, while the instalment is paid from CPF and take-home pay. Comparing the instalment with take-home pay as well gives a fuller picture of how comfortable it is.
