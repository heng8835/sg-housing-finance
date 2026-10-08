---
id: stress-test
term: 压力测试
short: 检查利率若比现在高，分期付款是否仍负担得起——这正是贷款机构采用利率下限背后的理念。
formula: "压力情境分期付款 = 按（当前利率 + 利率冲击）重新计算的分期付款"
policy_keys: [rate.floor.hdb, rate.floor.bank, ratio.msr.cap]
related: [floor-rate, msr, tdsr, instalment, fixed-vs-floating, sora]
level: intermediate
source: https://www.mas.gov.sg/regulation/explainers/tdsr-for-property-loans/calculating-tdsr
---
压力测试要回答的是"如果利率上升会怎样？"。监管机构通过利率下限把压力测试纳入每一笔贷款的审批：建屋局贷款为 {policy:rate.floor.hdb}，银行贷款为 {policy:rate.floor.bank}。按这个利率计算的分期付款，必须控制在收入 {policy:ratio.msr.cap} 的抵押偿还率上限以内。

家庭也可以自己进行压力测试：按较高的利率重新计算分期付款，并与实得工资（而不只是总收入）比较。这对浮动利率贷款最为重要，因为其分期付款会随基准变动。

示例：例如一笔 `20` 年期、`S$400,000` 的贷款：按 `3.2%` 计算，分期付款约为 `S$2,260`；加上 `1.5` 个百分点的冲击（至 `4.7%`），则增至约 `S$2,570`。

提示：收入也可以做压力测试——收入较低的时期，例如换工作期间或休育儿假期间，用于还贷的收入比例会提高。
