---
id: tenure
term: 贷款期限
short: 偿还房贷的年数；期限越长，每月分期付款越低，但支付的总利息越高。
formula: ""
policy_keys: [tenure.hdb.max, tenure.age_cap, tenure.bank.hdb_flat.max, loan.bank.hdb_flat.full_ltv_max_tenure, loan.bank.ltv.lower_tier, tenure.hdb.lease_buffer]
related: [instalment, total-interest, amortisation, ltv, hdb-loan, bank-loan, remaining-lease]
level: basic
source: https://www.hdb.gov.sg/buying-a-flat/flat-grant-and-loan-eligibility/housing-loan/housing-loan-from-hdb
---
贷款期限是指贷款持续的时间。建屋局贷款的期限取以下三者中最短者：{policy:tenure.hdb.max} 年、{policy:tenure.age_cap} 岁减去买方的平均年龄，以及剩余屋契减去 {policy:tenure.hdb.lease_buffer} 年。以银行贷款购买组屋，期限上限为 {policy:tenure.bank.hdb_flat.max} 年，但若超过 {policy:loan.bank.hdb_flat.full_ltv_max_tenure} 年，或贷款期超过 {policy:tenure.age_cap} 岁，贷款与估值比率会降至 {policy:loan.bank.ltv.lower_tier}。

期限越长，还款分摊到更多月份，每期分期付款就越少，也更容易通过抵押偿还率审核。代价是支付利息的时间更长，因此总利息更高。

示例：例如一笔 `S$400,000` 的贷款，按示意性的 `3.2%` 利率计算，`20` 年期每月约 `S$2,260`，`30` 年期每月约 `S$1,730`——但总利息会从约 `S$142,000` 增至约 `S$223,000`。

提示：由于年龄限制，年纪较大的买方往往只能获得较短的贷款期限，因此同样的贷款额，分期付款会更高。
