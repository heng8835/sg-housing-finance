---
id: floor-rate
term: 利率下限（压力测试利率）
short: 贷款机构评估负担能力时采用的最低利率——建屋局贷款为 {policy:rate.floor.hdb}，银行贷款为 {policy:rate.floor.bank}——即使实际利率较低也照样采用。
formula: "评估利率 = max(实际利率, 利率下限)"
policy_keys: [rate.floor.hdb, rate.floor.bank, rate.hdb.concessionary, ratio.msr.cap]
related: [msr, tdsr, stress-test, hdb-loan, bank-loan, instalment]
level: intermediate
source: https://www.mas.gov.sg/regulation/explainers/tdsr-for-property-loans/calculating-tdsr
---
建屋发展局或银行在计算可贷款额时，并不是把当前利率直接代入抵押偿还率和总债务偿还率的审核，而是采用实际利率与利率下限两者中较高者：建屋局贷款为 {policy:rate.floor.hdb}，住宅产业的银行贷款为 {policy:rate.floor.bank}。

设定利率下限，是为了确保借款人在利率上升时仍能应付。由于下限往往高于实际收取的利率——建屋局优惠利率目前为 {policy:rate.hdb.concessionary}——最高贷款额会比按实际利率计算的结果小。

示例：例如一笔 `20` 年期、`S$400,000` 的贷款。用于抵押偿还率审核的分期付款按利率下限计算，因此高于借款人实际要付的分期付款。必须控制在收入 {policy:ratio.msr.cap} 以内的，正是这个按利率下限计算的分期付款。

提示：按利率下限计算的分期付款与实际分期付款之间的差距，是一个内置的安全缓冲；比较两者可以看出利率上升时家庭还有多少余地。
