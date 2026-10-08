---
id: cpf-housing
term: 动用公积金购屋
short: 公积金普通账户存款可用于支付首付、印花税、律师费和每月分期付款，但受与组屋价值及剩余屋契挂钩的限额约束。
formula: ""
policy_keys: [cpf.lease.cover_to_age, cpf.lease.min_years, proposed.cpf.oa.retain_with_hdb_loan]
related: [cpf-oa, vl-wl, lease-to-95, accrued-interest, hps, downpayment]
level: basic
source: https://www.cpf.gov.sg/member/infohub/educational-resources/how-much-cpf-savings-you-can-use-for-your-home-purchase
---
公积金会员可以把普通账户存款用于购屋：支付首付（使用建屋局贷款时可全数用公积金支付）、买方印花税、律师费，以及之后的每月分期付款。

可动用的数额受两组限制。第一，估值上限和提取上限把公积金的使用与售价和估价两者中较低者挂钩。第二是屋契规定：只有当剩余屋契足以覆盖最年轻的买方至 {policy:cpf.lease.cover_to_age} 岁时，才能全额动用；否则可动用的数额按比例递减；若剩余屋契少于 {policy:cpf.lease.min_years} 年，则完全不能动用公积金。使用建屋局贷款的会员可在普通账户中保留最多 {policy:proposed.cpf.oa.retain_with_hdb_loan}。

示例：例如最年轻的买方 `35` 岁，组屋剩余屋契 `55` 年：要看 `35` + `55` 是否达到 {policy:cpf.lease.cover_to_age}。若未达到，可动用的公积金按比例递减。

提示：多用公积金可减少所需现金，但所有动用的公积金在出售组屋时都须连同应计利息退还。
