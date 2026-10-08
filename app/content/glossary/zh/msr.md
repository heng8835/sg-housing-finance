---
id: msr
term: 抵押偿还率（MSR）
short: 房贷分期付款占家庭每月总收入的比例；购买组屋时不得超过 {policy:ratio.msr.cap}。
formula: "MSR = 每月分期付款 ÷ 家庭每月总收入"
policy_keys: [ratio.msr.cap, rate.floor.hdb, rate.floor.bank]
related: [tdsr, ltv, floor-rate, instalment, stress-test]
level: basic
source: https://www.mas.gov.sg/regulation/explainers/new-housing-loans/msr-and-tdsr-rules
---
抵押偿还率衡量家庭每月总收入中有多少用于偿还组屋房贷。组屋的上限为 {policy:ratio.msr.cap}，无论贷款来自建屋局还是银行都适用。

贷款机构不会按借款人实际支付的利率来审核抵押偿还率，而是按实际利率与利率下限两者中较高者计算分期付款：建屋局贷款为 {policy:rate.floor.hdb}，银行贷款为 {policy:rate.floor.bank}。这为利率上升预留了缓冲。

示例：例如一对夫妇合计月收入 `S$8,000`。按利率下限计算的分期付款，最多只能是 `S$8,000` 的 {policy:ratio.msr.cap}。这个分期付款上限，加上贷款期限，决定了他们最多可以借多少。

提示：抵押偿还率按扣除公积金缴交前的总收入计算，而分期付款则由公积金和实得工资支付。把分期付款与实得工资一起比较，能更全面地了解还款是否轻松。
