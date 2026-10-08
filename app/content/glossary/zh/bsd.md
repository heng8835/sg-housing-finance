---
id: bsd
term: 买方印花税（BSD）
short: 购买产业时须缴付的税，按售价与市值两者中较高者以累进税率计算，每次购买都须缴付。
formula: "BSD = 各税级之和（落在该税级的价值部分 × 该税级税率）"
policy_keys: [stamp.bsd.bands, cpf.usage.bsd, proposed.stamp.duty.payment_days]
related: [absd, upfront-cost, legal-fees, valuation, cpf-housing]
level: basic
source: https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property/buyer's-stamp-duty-(bsd)
---
在新加坡购买任何产业都须缴付买方印花税，转售组屋也不例外。税额按购买价与市值两者中较高者计算，采用累进税级：价值的第一部分适用较低税率，之后每一部分适用更高的税率，具体见国内税务局（IRAS）的税率表。计算结果向下取整至最接近的整元。

买方印花税须在签署购买文件后 {policy:proposed.stamp.duty.payment_days} 天内缴付，可用现金或公积金普通账户存款支付，但须符合公积金的规定。

示例：例如一间 `S$600,000` 的组屋，价值的第一级按最低税率计算，下一级按较高税率计算，依此类推，直到涵盖全部 `S$600,000`。本应用会根据国内税务局的最新税率表把各级税额相加。

提示：由于税率逐级提高，买方印花税的增幅比售价更快，因此价格较高的组屋，所缴印花税占售价的比例也较大。
