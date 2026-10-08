---
id: bank-loan
term: 银行贷款（购买组屋）
short: 向银行或金融机构申请的房贷，利率随市场而定，贷款与估值比率最高为 {policy:loan.bank.ltv}，并须同时通过抵押偿还率和总债务偿还率的审核。
formula: ""
policy_keys: [loan.bank.ltv, loan.bank.ltv.lower_tier, tenure.bank.hdb_flat.max, ratio.msr.cap, ratio.tdsr.cap, rate.floor.bank, downpayment.bank.cash_min]
related: [hdb-loan, ltv, tdsr, msr, sora, fixed-vs-floating, refinancing, downpayment]
level: basic
source: https://www.mas.gov.sg/regulation/explainers/new-housing-loans/loan-tenure-and-loan-to-value-limits
---
组屋买家可以选择向银行而不是建屋发展局借贷。银行贷款不受建屋局收入顶限的限制，利率跟随市场变动，因此在不同时期可能低于或高于建屋局贷款利率。

相关条例由金融管理局（MAS）制定。第一笔房贷最高可达售价与估价两者中较低者的 {policy:loan.bank.ltv}（若超出贷款期限或年龄限制，则为 {policy:loan.bank.ltv.lower_tier}），组屋的贷款期限最长为 {policy:tenure.bank.hdb_flat.max} 年。售价中至少 {policy:downpayment.bank.cash_min} 须以现金支付。贷款须同时通过抵押偿还率（{policy:ratio.msr.cap}）和总债务偿还率（{policy:ratio.tdsr.cap}）的审核，审核按 {policy:rate.floor.bank} 或实际利率（以较高者为准）计算。

示例：例如以银行贷款购买一间 `S$500,000` 的组屋，首付中须有一部分是现金；而同一间组屋若使用建屋局贷款，则可完全用公积金和贷款支付。

提示：日后可以从建屋局贷款转为银行贷款，但从银行贷款转回建屋局贷款则不可行。
