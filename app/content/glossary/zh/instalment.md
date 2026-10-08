---
id: instalment
term: 每月分期付款
short: 房贷每月的固定还款额，包括当月利息和部分本金。
formula: "分期付款 = P × r ÷ (1 − (1 + r)^−n)，其中 P = 贷款额，r = 年利率 ÷ 12，n = 贷款期限（月数）"
policy_keys: [rate.floor.hdb, rate.floor.bank, ratio.msr.cap]
related: [amortisation, tenure, msr, total-interest, floor-rate]
level: basic
source: https://www.hdb.gov.sg/buying-a-flat/flat-grant-and-loan-eligibility/housing-loan/housing-loan-from-hdb
---
分期付款是借款人每月要付的钱。对一般房贷而言，只要利率不变，分期付款也保持不变。初期大部分是利息；随着时间推移，越来越多用于减少本金。

决定分期付款的有三个因素：贷款额、利率和贷款期限。贷款越多或利率越高，分期付款越高；贷款期限越长，分期付款越低。

在评估负担能力时，若利率下限高于实际利率，贷款机构会按利率下限计算分期付款——建屋局贷款为 {policy:rate.floor.hdb}，银行贷款为 {policy:rate.floor.bank}——再与收入的 {policy:ratio.msr.cap} 抵押偿还率上限比较。

示例：例如一笔 `20` 年期、`S$400,000` 的贷款，按示意性的 `3.2%` 利率计算，每月约为 `S$2,260`。若按示意性的 `4.2%` 计算，同一笔贷款每月约为 `S$2,470`。

提示：对这种规模的贷款来说，利率变动约一个百分点，每月分期付款就会相差约两百元，因此利率假设很重要。
