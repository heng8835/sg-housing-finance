---
id: cpf-housing
term: Using CPF for housing
short: CPF Ordinary Account savings can pay the downpayment, stamp duty, legal fees and instalments, within limits linked to the flat's value and remaining lease.
formula: ""
policy_keys: [cpf.lease.cover_to_age, cpf.lease.min_years, proposed.cpf.oa.retain_with_hdb_loan]
related: [cpf-oa, vl-wl, lease-to-95, accrued-interest, hps, downpayment]
level: basic
source: https://www.cpf.gov.sg/member/infohub/educational-resources/how-much-cpf-savings-you-can-use-for-your-home-purchase
---
CPF lets members put their Ordinary Account savings towards a home: the downpayment (all of it, with an HDB loan), Buyer's Stamp Duty, legal fees and the monthly instalments afterwards.

Two sets of limits shape how much can be used. First, the Valuation Limit and Withdrawal Limit tie CPF usage to the lower of price and valuation. Second, the lease rule: full use is allowed only if the remaining lease covers the youngest buyer to age {policy:cpf.lease.cover_to_age}; otherwise the usable amount is pro-rated, and CPF cannot be used at all if the remaining lease is below {policy:cpf.lease.min_years} years. Members taking an HDB loan may keep up to {policy:proposed.cpf.oa.retain_with_hdb_loan} in their OA.

Worked example: e.g. a youngest buyer aged `35` and a flat with `55` years of lease left: the check is whether `35` + `55` reaches {policy:cpf.lease.cover_to_age}. If it falls short, CPF usage is pro-rated.

Tip: Using more CPF lowers the cash needed, but all CPF used is refunded with accrued interest when the flat is sold.
