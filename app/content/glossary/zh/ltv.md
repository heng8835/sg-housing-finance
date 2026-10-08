---
id: ltv
term: 贷款与估值比率（LTV）
short: 最高贷款额占组屋售价与估价两者中较低者的比例——建屋局贷款为 {policy:loan.hdb.ltv}，第一笔银行贷款为 {policy:loan.bank.ltv}。
formula: "最高贷款额 = LTV × min(售价, 估价)"
policy_keys: [loan.hdb.ltv, loan.bank.ltv, loan.bank.ltv.lower_tier, loan.bank.hdb_flat.full_ltv_max_tenure, tenure.age_cap, cpf.lease.cover_to_age]
related: [downpayment, valuation, cov, hdb-loan, bank-loan, lease-to-95]
level: basic
source: https://www.mas.gov.sg/regulation/explainers/new-housing-loans/loan-tenure-and-loan-to-value-limits
---
LTV 决定购屋款项中可以借贷的比例。它以议定售价和建屋局估价两者中较低者为基础，因此超出估价支付的任何款项都不能贷款。

建屋局贷款的上限为 {policy:loan.hdb.ltv}，如果剩余屋契不足以覆盖最年轻的买方至 {policy:cpf.lease.cover_to_age} 岁，则按比例递减。第一笔银行贷款的上限为 {policy:loan.bank.ltv}；若组屋的贷款期限超过 {policy:loan.bank.hdb_flat.full_ltv_max_tenure} 年，或贷款期超过 {policy:tenure.age_cap} 岁，则降至 {policy:loan.bank.ltv.lower_tier}。

示例：例如一间售价 `S$600,000`、估价 `S$580,000` 的组屋。贷款按 `S$580,000` 计算，其余部分——包括 `S$20,000` 的差额——由买方以公积金和现金支付。

提示：LTV 是上限，而不是目标。少借一些可降低分期付款和总利息，但前期需要动用更多储蓄。
