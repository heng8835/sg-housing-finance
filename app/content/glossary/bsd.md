---
id: bsd
term: Buyer's Stamp Duty (BSD)
short: A tax on buying property, charged at tiered rates on the higher of the price or market value, and payable on every purchase.
formula: "BSD = sum over bands of (portion of value in band × band rate)"
policy_keys: [stamp.bsd.bands, cpf.usage.bsd, proposed.stamp.duty.payment_days]
related: [absd, upfront-cost, legal-fees, valuation, cpf-housing]
level: basic
source: https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property/buyer's-stamp-duty-(bsd)
---
BSD applies to every property purchase in Singapore, including HDB resale flats. It is calculated on the higher of the purchase price and the market value, using progressive bands: a low rate on the first slice of value and higher rates on each further slice, as set out in the IRAS rate table. The result is rounded down to the nearest dollar.

BSD must be paid within {policy:proposed.stamp.duty.payment_days} days of signing the purchase document. It can be paid in cash or with CPF Ordinary Account savings, subject to CPF rules.

Worked example: e.g. for a `S$600,000` flat, the first band of value is taxed at the lowest rate, the next band at a higher rate, and so on until the full `S$600,000` is covered. This app adds up the bands from the current IRAS table.

Tip: Because the rates rise band by band, BSD grows faster than the price, so a higher-priced flat carries a proportionally larger duty.
