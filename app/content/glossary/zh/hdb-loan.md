---
id: hdb-loan
term: 建屋局优惠贷款
short: 建屋发展局为符合资格的家庭提供的房贷，利率定在略高于公积金普通账户利率的水平——目前为每年 {policy:rate.hdb.concessionary}。
formula: ""
policy_keys: [rate.hdb.concessionary, loan.hdb.ltv, tenure.hdb.max, ratio.msr.cap, rate.floor.hdb, eligibility.income_ceiling.family, proposed.cpf.oa.retain_with_hdb_loan]
related: [hfe, bank-loan, ltv, msr, income-ceiling, fixed-vs-floating, refinancing, cpf-oa]
level: basic
source: https://www.hdb.gov.sg/buying-a-flat/flat-grant-and-loan-eligibility/housing-loan/housing-loan-from-hdb
---
建屋发展局向家庭中至少有一名新加坡公民的合格买方提供贷款。利率定在比公积金普通账户利率略高一点的水平，每季检讨一次，目前为 {policy:rate.hdb.concessionary}。这个利率历来非常稳定，但不一定总是最便宜的选择。

主要限制：贷款额最高为售价与估价两者中较低者的 {policy:loan.hdb.ltv}；贷款期限最长 {policy:tenure.hdb.max} 年；按 {policy:rate.floor.hdb} 的利率下限计算的分期付款，必须通过 {policy:ratio.msr.cap} 的抵押偿还率上限；家庭月收入不得超过 {policy:eligibility.income_ceiling.family}。一般须先动用普通账户存款，但买方可在账户中保留最多 {policy:proposed.cpf.oa.retain_with_hdb_loan}。

示例：例如一间 `S$500,000` 的组屋，使用建屋局贷款时首付可完全用公积金支付，而银行贷款则须有一部分以现金支付。

提示：卖方发出选购权之前，买方必须持有确认贷款资格的有效组屋购买资格信（HFE letter）。
