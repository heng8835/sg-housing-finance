---
id: tdsr
term: 总债务偿还率（TDSR）
short: 适用于银行贷款，规定所有每月债务还款合计——房贷、汽车贷款、信用卡最低还款额等——不得超过每月总收入的 {policy:ratio.tdsr.cap}。
formula: "TDSR = 所有每月债务还款（包括新的分期付款）÷ 每月总收入"
policy_keys: [ratio.tdsr.cap, ratio.msr.cap, rate.floor.bank]
related: [msr, bank-loan, floor-rate, stress-test]
level: intermediate
source: https://www.mas.gov.sg/regulation/explainers/new-housing-loans/msr-and-tdsr-rules
---
总债务偿还率考虑的是借款人正在偿还的所有债务，而不只是新的房贷。汽车贷款、其他产业贷款、个人贷款和学费贷款，以及信用卡最低还款额都计算在内。金融管理局把银行和金融机构发放的产业贷款的总额上限定为每月总收入的 {policy:ratio.tdsr.cap}。建屋局贷款则改以抵押偿还率审核。

以银行贷款购买组屋时，两项限制都适用：房贷分期付款必须在 {policy:ratio.msr.cap} 的抵押偿还率上限以内，所有债务合计则须在总债务偿还率以内。与抵押偿还率一样，新房贷按实际利率与 {policy:rate.floor.bank} 的银行利率下限两者中较高者审核。

示例：例如一名月收入 `S$6,000` 的买方，每月要还 `S$700` 的汽车贷款。汽车贷款占用了部分总债务偿还率的额度，可用于房贷的余地因此减少，尽管单看抵押偿还率审核不受影响。

提示：为他人贷款担保也可能计入总债务偿还率，因此及早列出所有债务承担，可避免在贷款审批时出现意外。
