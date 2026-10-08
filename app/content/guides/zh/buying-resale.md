---
id: buying-resale
title: 购买您的第一套转售组屋
summary: 从谁来买到领钥匙——按您的家庭情况检查价格、所需现金，以及可能获得的津贴。
---
本指南按一般首次购买转售组屋的步骤逐一说明，并指出应用程序中对应的功能。蓝色数字来自您自己的家庭资料；粗体数字是应用程序规则文件中注明日期的规则。

## 谁来买
指南中的所有数字都根据您在**家庭资料**中输入的内容计算。资料只保存在这个浏览器里——不会发送到任何地方。

目前应用程序中有 **{live:household.buyers}** 位买家，家庭每月总收入合计 **{live:household.income}**。

- 建屋局贷款和公积金购屋津贴要求家庭月收入不超过{policy:eligibility.income_ceiling.family}（家庭）。
- 申请建屋局贷款，至少一位买家须是新加坡公民；否则应用程序会显示银行贷款。

## 先申请组屋购买资格信（HFE）
**组屋购买资格信（HFE letter）**一次过确认您能否购买、可获得哪些津贴，以及建屋局可贷款多少。如果您打算申请建屋局贷款，必须在卖家签发选购权（OTP）之前持有有效的资格信。

您选择的是：**{live:household.loan_type}**。建屋局贷款：

- 最高为价格与估价两者中较低者的{policy:loan.hdb.ltv}；
- 贷款期最长{policy:tenure.hdb.max}年（年纪较大或屋契较短时会更短）；
- 目前利率为每年{policy:rate.hdb.concessionary}，每季检讨。

## 看看类似组屋的成交价
搜索大牌、街道或地铁站，然后点按一栋组屋查看近期成交。在“我的选择”中，比较表会显示叫价低于、处于还是高于可比成交的一般范围。

建屋局的估价要在选购权之后才出来。如果您付的价格高于估价，差额——**超出估价的现金（COV）**——只能用现金支付，贷款和公积金都不能用。

## 在“负担能力”中测试价格
输入价格，或在组屋上点“算算负担能力 →”。应用程序现在测试的是 **{live:afford.flat}**，价格 **{live:afford.price}**。

- 每月供款：**{live:afford.instalment}**，为期 **{live:afford.tenure}** 年。
- 贷款方会检查**抵押偿还率（MSR）**：按最低测试利率（建屋局贷款{policy:rate.floor.hdb}，银行贷款{policy:rate.floor.bank}）计算的月供，不可超过总收入的{policy:ratio.msr.cap}。您按测试利率计算的比率：**{live:afford.msr}**。

## 最多可付多少
结论卡显示**最多可付**的价格：您的家庭为 **{live:afford.max_price}**；按您正在测试的价格，贷款约 **{live:afford.loan}**。

限制来自收入（MSR 上限决定最高贷款）或来自您的现金和公积金（首付和费用）。数字下方的说明会告诉您是哪一项在起限制作用——那就是需要着手改善的地方。

## 首期款项：现金与公积金
领钥匙前，您需要支付首付（**{live:afford.downpayment}**）、买方印花税（**{live:afford.bsd}**）和律师费。扣除津贴后共 **{live:afford.upfront}**，其中 **{live:afford.cash_needed}** 必须用现金。

- 选购权费和行使费合计最多{policy:fees.option_exercise.max}，必须用现金支付，COV 也一样。
- 申请银行贷款时，至少价格的{policy:downpayment.bank.cash_min}须以现金支付。
- 您的现金：**{live:household.cash}**；公积金普通账户：**{live:household.cpf_oa}**。

## 津贴
首次购屋的家庭可能获得**加强版公积金购屋津贴（EHG）**（按收入计算）、转售组屋的**公积金购屋津贴**（家庭月收入不超过{policy:eligibility.income_ceiling.family}），以及与父母同住或住在附近时的**就近居住购屋津贴（PHG）**。津贴存入公积金，用于支付房价。

应用程序为您的家庭估算的津贴为 **{live:afford.grants}**。要获得全额加强版津贴，屋契须覆盖最年轻的买家至{policy:cpf.lease.cover_to_age}岁；实际数额以您的资格信为准。

## 屋契、时间线和之后的事
请输入剩余屋契。只有屋契覆盖最年轻的买家至{policy:cpf.lease.cover_to_age}岁，才能全额动用公积金；否则按比例计算，而且剩余屋契至少须有{policy:cpf.lease.min_years}年。

一般顺序：资格信 → 选购权 → 在{policy:sellbuy.otp.exercise_days}天内行使 → 转售申请 → 建屋局接受申请后约{policy:sellbuy.resale.completion_days}天内完成交易。之后您必须住满**最低居住期（MOP）**，才能出售组屋或整间出租。

## Quiz
### 如果申请建屋局贷款，什么时候必须持有有效的资格信？
- [ ] 组屋估价出来之后
- [x] 卖家签发选购权之前
- [ ] 只在交易完成时
explain: 申请建屋局贷款时，必须在签发选购权之前持有有效的资格信——所以请在开始物色组屋前申请。
term: hfe

### 月供必须通过 MSR 测试。它是按哪个利率计算的？
- [ ] 您实际支付的利率
- [x] 实际利率与最低测试利率两者中较高者
- [ ] 一律按银行牌价利率
explain: 贷款方按实际利率与最低测试利率（建屋局贷款{policy:rate.floor.hdb}，银行贷款{policy:rate.floor.bank}）两者中较高者计算月供，且不可超过总收入的{policy:ratio.msr.cap}。
term: msr

### 以下哪一项必须用现金支付，不能用公积金？
- [x] 超出估价的现金（COV）
- [ ] 买方印花税
- [ ] 申请建屋局贷款时的全部首付
explain: COV、选购权费和行使费只能用现金。印花税，以及申请建屋局贷款时的首付，都可以用公积金普通账户支付。
term: cov

### 什么时候可以全额动用公积金购买转售组屋？
- [ ] 只要是组屋就可以
- [ ] 只有屋龄不到十年的组屋
- [x] 剩余屋契覆盖最年轻的买家至{policy:cpf.lease.cover_to_age}岁时
explain: 要全额动用公积金，屋契须覆盖最年轻的买家至{policy:cpf.lease.cover_to_age}岁；否则按比例计算，而且剩余屋契至少须有{policy:cpf.lease.min_years}年。
term: lease-to-95
