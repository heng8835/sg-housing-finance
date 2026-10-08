---
id: downpayment
term: 首付
short: 售价中贷款未涵盖的部分，以公积金和/或现金支付；首付的数额及现金部分取决于贷款类型。
formula: "首付 = 售价 − 贷款额"
policy_keys: [loan.hdb.ltv, loan.bank.ltv, downpayment.bank.cash_min]
related: [ltv, cov, cpf-housing, hdb-loan, bank-loan, upfront-cost]
level: basic
source: https://www.mas.gov.sg/regulation/explainers/new-housing-loans/loan-tenure-and-loan-to-value-limits
---
首付是买方自己承担的那部分售价。使用最高 {policy:loan.hdb.ltv} 的建屋局贷款时，余下部分可用公积金普通账户存款、现金或两者支付。使用最高 {policy:loan.bank.ltv} 的银行贷款时，售价中至少 {policy:downpayment.bank.cash_min} 须以现金支付，首付的其余部分可用公积金支付。

由于贷款以售价和估价两者中较低者为准，任何超出估价的现金（COV）都会加在一般首付之上，并须以现金支付。

示例：例如一间估价为 `S$600,000` 的 `S$600,000` 组屋：首付等于售价减去贷款额。如果议定售价是 `S$620,000` 而估价不变，多出的 `S$20,000` 就是 COV，须另外以现金支付。

提示：购屋津贴会存入公积金并用于购屋，因此组屋购买资格信（HFE letter）上列明的津贴额会直接减少家庭需要筹措的款项。
