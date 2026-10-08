---
id: stress-test
term: Stress test
short: Checking whether the instalment would still be affordable if interest rates were higher than today — the idea behind the floor rates lenders apply.
formula: "Stressed instalment = instalment recomputed at (current rate + rate shock)"
policy_keys: [rate.floor.hdb, rate.floor.bank, ratio.msr.cap]
related: [floor-rate, msr, tdsr, instalment, fixed-vs-floating, sora]
level: intermediate
source: https://www.mas.gov.sg/regulation/explainers/tdsr-for-property-loans/calculating-tdsr
---
A stress test asks "what if rates go up?". Regulators build one into every loan approval through floor rates: {policy:rate.floor.hdb} for HDB loans and {policy:rate.floor.bank} for bank loans. The instalment at that rate must fit within the MSR cap of {policy:ratio.msr.cap} of income.

Households can run their own stress test too, by recomputing the instalment at a higher rate and comparing it with take-home pay, not just gross income. This is most relevant for floating-rate loans, whose instalments change as benchmarks move.

Worked example: e.g. a `S$400,000` loan over `20` years: at `3.2%` the instalment is about `S$2,260`; adding a shock of `1.5` percentage points (to `4.7%`) raises it to about `S$2,570`.

Tip: Income can be stress-tested as well — a period of lower income, such as during a job change or parental leave, raises the share of income going to the loan.
