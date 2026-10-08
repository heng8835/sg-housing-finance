---
id: option-fee
term: 选购权（OTP）与选购权费
short: 选购权是卖方以议定价格出售组屋的要约；买方支付选购权费以取得选购权，再支付行使费以行使它。
formula: "选购权费 + 行使费 ≤ 建屋局上限；两者都计入售价"
policy_keys: [proposed.resale.option_fee.max, fees.option_exercise.max, proposed.resale.otp.exercise_days]
related: [hfe, valuation, cov, upfront-cost, legal-fees]
level: basic
source: https://www.hdb.gov.sg/buying-a-flat/resale-flats/process-for-buying-a-resale-flat/option-to-purchase
---
在组屋转售交易中，卖方使用建屋发展局的标准表格向买方发出选购权。买方须支付最高 {policy:proposed.resale.option_fee.max} 的选购权费才能取得它。之后买方有 {policy:proposed.resale.otp.exercise_days} 天考虑；行使选购权须支付行使费，两项费用合计不得超过 {policy:fees.option_exercise.max}。

两项费用都可在上限内商议，计入转售价，并须以现金支付——不能使用公积金。如果买方没有在期限内行使选购权，选购权费归卖方所有。

示例：例如买方支付 `S$500` 的选购权费。若行使选购权，这笔钱计入售价；若让它失效，这 `S$500` 就会损失。

提示：先后次序很重要——使用建屋局贷款的买方必须在获得选购权之前持有有效的组屋购买资格信（HFE letter），而估价申请是在获得选购权之后才提交的，因此支付选购权费时还不知道估价。
