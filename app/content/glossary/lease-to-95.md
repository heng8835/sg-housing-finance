---
id: lease-to-95
term: Lease must cover age 95
short: CPF savings and the HDB loan can be used in full only if the remaining lease covers the youngest buyer to age {policy:cpf.lease.cover_to_age}; otherwise both are pro-rated.
formula: "Full use if youngest buyer's age + remaining lease ≥ cover-to age"
policy_keys: [cpf.lease.cover_to_age, cpf.lease.min_years, loan.hdb.ltv]
related: [remaining-lease, cpf-housing, ltv, lease-decay, lease, ehg]
level: intermediate
source: https://www.cpf.gov.sg/service/article/how-much-cpf-savings-can-i-use-to-buy-a-property-if-its-lease-does-not-cover-the-youngest-buyer-to-age-95
---
This rule links how much a buyer can borrow from HDB and use from CPF to whether the flat will last them a lifetime. The test is simple: add the youngest buyer's age to the flat's remaining lease. If the total reaches {policy:cpf.lease.cover_to_age}, CPF savings can be used up to the Valuation Limit and the HDB loan can go up to the full {policy:loan.hdb.ltv}.

If the total falls short, the usable CPF amount and the HDB loan limit are pro-rated down, so more of the price must be paid in cash. If the remaining lease is below {policy:cpf.lease.min_years} years, CPF savings cannot be used at all.

Worked example: e.g. youngest buyer aged `30` and a flat with `60` years left: `30` + `60` = `90`, which is compared against {policy:cpf.lease.cover_to_age}. The same buyer and a flat with `70` years left gives `100`.

Tip: The rule matters most for older flats and older buyers; checking it before the Option to Purchase avoids discovering a cash shortfall later.
