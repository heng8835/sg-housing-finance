---
id: tdsr
term: Total Debt Servicing Ratio (TDSR)
short: For bank loans, the cap on all monthly debt repayments together — home loan, car loan, card minimums and others — at {policy:ratio.tdsr.cap} of gross monthly income.
formula: "TDSR = all monthly debt repayments (incl. the new instalment) ÷ gross monthly income"
policy_keys: [ratio.tdsr.cap, ratio.msr.cap, rate.floor.bank]
related: [msr, bank-loan, floor-rate, stress-test]
level: intermediate
source: https://www.mas.gov.sg/regulation/explainers/new-housing-loans/msr-and-tdsr-rules
---
TDSR looks at every debt a borrower is servicing, not just the new home loan. Car loans, other property loans, personal and study loans, and credit-card minimum payments all count. MAS caps the total at {policy:ratio.tdsr.cap} of gross monthly income for property loans from banks and financial institutions. HDB loans are assessed on MSR instead.

For an HDB flat bought with a bank loan, both limits apply: the home-loan instalment must stay within the MSR cap of {policy:ratio.msr.cap}, and all debts together within TDSR. As with MSR, the new mortgage is assessed at the higher of the actual rate and the bank floor rate of {policy:rate.floor.bank}.

Worked example: e.g. a buyer earning `S$6,000` a month with a `S$700` car instalment. The car loan uses up part of the TDSR room, so less is left for the mortgage, even though the MSR test on its own is unaffected.

Tip: Being a guarantor for someone else's loan can also count towards TDSR, so listing every commitment early avoids surprises at loan approval.
