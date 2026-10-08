---
id: lease-to-95
term: 屋契须覆盖至95岁
short: 只有当剩余屋契足以覆盖最年轻的买方至 {policy:cpf.lease.cover_to_age} 岁时，才能全额动用公积金和建屋局贷款；否则两者都按比例递减。
formula: "若 最年轻买方的年龄 + 剩余屋契 ≥ 覆盖年龄，则可全额动用"
policy_keys: [cpf.lease.cover_to_age, cpf.lease.min_years, loan.hdb.ltv]
related: [remaining-lease, cpf-housing, ltv, lease-decay, lease, ehg]
level: intermediate
source: https://www.cpf.gov.sg/service/article/how-much-cpf-savings-can-i-use-to-buy-a-property-if-its-lease-does-not-cover-the-youngest-buyer-to-age-95
---
这项规定把买方可向建屋局借贷和可动用的公积金数额，与组屋能否供他们住上一辈子挂钩。审核方法很简单：把最年轻买方的年龄加上组屋的剩余屋契。如果总和达到 {policy:cpf.lease.cover_to_age}，公积金可动用至估值上限，建屋局贷款也可达到全额的 {policy:loan.hdb.ltv}。

如果总和不足，可动用的公积金数额和建屋局贷款上限都会按比例递减，售价中须以现金支付的部分就会增加。如果剩余屋契少于 {policy:cpf.lease.min_years} 年，则完全不能动用公积金。

示例：例如最年轻的买方 `30` 岁，组屋剩余屋契 `60` 年：`30` + `60` = `90`，再与 {policy:cpf.lease.cover_to_age} 比较。同一名买方若购买剩余屋契 `70` 年的组屋，总和则为 `100`。

提示：这项规定对较旧的组屋和年纪较大的买方影响最大；在获得选购权之前先核对，可避免日后才发现现金不足。
