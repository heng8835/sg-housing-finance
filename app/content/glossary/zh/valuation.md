---
id: valuation
term: 建屋局估价（估价申请）
short: 建屋发展局对转售组屋市值的评估，在发出选购权后申请；它决定贷款和公积金使用的上限。
formula: "贷款及公积金的计算基础 = min(议定售价, 建屋局估价)"
policy_keys: [loan.hdb.ltv, loan.bank.ltv]
related: [cov, ltv, vl-wl, option-fee, cpf-housing]
level: intermediate
source: https://www.hdb.gov.sg/hdb-flat-portal/buying-and-selling-an-hdb-resale-flat/get-help/buying-a-flat/request-for-value-of-flat
---
以公积金存款或房贷付款的买方，在取得选购权后必须向建屋发展局提交估价申请（Request for Value）。建屋局随后评估该组屋，评估结果将作为最高贷款额——建屋局贷款为 {policy:loan.hdb.ltv}，银行贷款为 {policy:loan.bank.ltv}——以及可动用公积金数额的依据。

估价与议定售价无关。如果售价高于估价，差额就是超出估价的现金（COV），须以现金支付。如果售价等于或低于估价，贷款和公积金限额就以售价为准。

示例：例如议定售价 `S$580,000`，估价 `S$590,000`：贷款以较低的 `S$580,000` 为准，没有 COV。

提示：估价结果只在一段有限时间内有效，因此必须在这段时间内提交转售申请，否则须重新申请估价。
