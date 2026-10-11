<div align="center">

<img src="app/icons/logo.png" alt="新加坡住房与理财标志" width="96" height="95">

# 新加坡住房与理财（SG Housing & Finance）

**这间组屋我们买得起吗？用浅白的话、新加坡真实的规则来回答，<br>而您的数字从不离开您的浏览器。**

### 👉 [打开应用 — heng8835.github.io/sg-housing-finance](https://heng8835.github.io/sg-housing-finance/)

免费 · 不用注册 · 适合电脑使用（手机版正在改进）· 英文和中文 · [在 Ko-fi 支持我们 ☕](https://ko-fi.com/zhlim)

[![打开应用](https://img.shields.io/badge/打开应用-heng8835.github.io-2b6cb0?style=flat-square)](https://heng8835.github.io/sg-housing-finance/)
[![tests](https://github.com/heng8835/sg-housing-finance/actions/workflows/ci.yml/badge.svg)](https://github.com/heng8835/sg-housing-finance/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/许可证-MIT-555?style=flat-square)](LICENSE)
[![开放数据](https://img.shields.io/badge/数据-data.gov.sg_开放许可-555?style=flat-square)](DATA_LICENCES.md)
[![不追踪](https://img.shields.io/badge/追踪-无-555?style=flat-square)](#隐私)

[English](README.md) · **简体中文**

<img src="docs/readme/demo.gif" alt="从“从这里开始”选择目标，载入示例家庭，负担能力页显示最多可付多少，组屋卡片列出附近小学，比较页按您勾选的项目为三间组屋排序" width="800">

</div>

---

您在榜鹅看中了一间四房式组屋。中介说价钱很好。父母却希望您住在碧山，离他们近一点。公积金结单不知道
在哪封电邮里，也没有人能告诉您，交易当天到底要准备多少现金。

**新加坡住房与理财把这些都放在同一页**：地图上的每一笔组屋转售成交、*您家庭*最多可付多少、津贴和必须用
现金支付的部分、每间组屋附近的学校和诊所，以及一张不必请教银行也看得懂的并排比较。免费、不用注册，
提供英文和中文。

> **教育用途的估算，并非理财建议。** 在作决定前，请向建屋局、公积金局、税务局和您的银行核实价格、资格、
> 贷款和津贴。本项目与新加坡任何政府机构没有关联，也未获其认可。

## 它能回答什么

| | 问题 | 位置 |
|---|---|---|
| <img src="docs/readme/afford.jpg" width="260" alt="负担能力页"> | **“我们最多能付多少？要准备多少现金？”**<br>最多可付金额、建屋局贷款与银行贷款、津贴、现金与公积金、真正的每月开销，并计入出售现有组屋的所得。 | 负担能力 |
| <img src="docs/readme/compare.jpg" width="260" alt="比较表"> | **“这几间组屋，哪一间适合我们？”**<br>勾选您在乎的（现金、步行到地铁、学校、剩余屋契……），每间组屋得到一句浅白的说明。与近期成交价比较、金钱项目、屋契、家庭项目，还可以打印一页摘要。 | 比较 |
| <img src="docs/readme/schools.jpg" width="260" alt="组屋卡片与 1 公里内的小学"> | **“这座组屋附近有什么？”**<br>每一座组屋（包括从未转售过的）：近期价格、租金、1 公里内的小学、有空位的托儿所、诊所、地铁和通勤时间。 | 探索 |
| <img src="docs/readme/rent.jpg" width="260" alt="租房与买房页"> | **“我们的租金合理吗？该不该改为买房？”**<br>您的家庭可以走哪些途径、租金是否合理（或输入您自己的房间租金）、租房与买房比较。 | 租房与买房 |
| <img src="docs/readme/plan.jpg" width="260" alt="规划页：公积金与退休"> | **“这对我们的公积金和退休有什么影响？”**<br>买与不买这间组屋时的公积金、终身入息计划估算、先卖后买的时间表、重要日期（.ics）、55 岁以上的选择。 | 规划 |
| <img src="docs/readme/zh.jpg" width="260" alt="中文界面"> | **“可以用中文吗？”**<br>每个页面、导览和词汇表都有简体中文版，还可以放大字体。 | 所有页面 |

## 数字

<div align="center">

| 240,345 | 10,740 | 188 | 813 | 0 |
|:---:|:---:|:---:|:---:|:---:|
| 2017 年以来的转售成交 | 地图上的组屋座数 | 新加坡规则，每条都注明官方来源和日期 | 自动化测试 | 追踪器 |

</div>

每一项规则数值（贷款上限、利率、印花税税级、公积金和津贴规则）都存放在同一个文件
[`app/policy/sg-policy.json`](app/policy/sg-policy.json) 里，并注明官方来源、生效日期以及是否已核实。程序从不凭记忆
写入规则。到了每年的检讨日期，应用会在每一页提醒您。

## 使用前 / 使用后

| 以前 | 现在 |
|---|---|
| 建屋局转售网页、公积金计算器、银行贷款计算器、房屋网站、教育部找学校、地图——六个分页加一张试算表 | 一页、一个家庭，每个页面的数字都一样 |
| 房屋网站说“在预算内”，却不知道您的公积金和津贴 | 必须用现金支付的部分、由公积金和津贴支付的部分，以及**您家庭**最多可付的金额 |
| 百分位和术语（MSR、TDSR、COV） | “比这里最近 5 笔成交都便宜” · “每月贷款约占您收入的四分之一” |

## 隐私

**您的财务资料只留在您的浏览器里。** 收入、公积金、储蓄和您的候选清单只保存在这个浏览器的储存空间。它们
不会出现在任何网址、请求、日志或分析里——这里根本没有分析工具。网页只连接三个地方：本网站、cdnjs（地图程序库，
以完整性哈希锁定版本）和 OneMap（只有地图图块）。**清除我的数据**会删除一切。

这由测试保证（[`tests/privacy/`](tests/privacy)）：在家庭资料里输入的标记数值，绝不能出现在任何网址、请求或
控制台输出中；每一个网络调用都在审核过的允许清单上。

## 运作方式

```
data.gov.sg（建屋局、市建局、陆交局、教育部、幼儿培育署、卫生部、环境局、国家公园局）   OneMap · OpenStreetMap
            │                                                                          │
            ▼                                                                          ▼
   hdb-data-pipeline（Dagster） ──►  tools/*.py  ──►  app/data/*.js（自动生成）
                                                            │
   app/policy/sg-policy.json（注明日期和来源的规则） ─────────┤
                                                            ▼
                        静态网页应用（没有服务器，不需要编译）
                        engine/ 纯计算 · modules/ 每个分页一个
                        您的家庭资料 → 只在这个浏览器里
```

## 常见问题

<details><summary><b>这是理财建议吗？</b></summary>

不是。它根据公开数据和注明日期的规则，提供教育用途的估算，从不说“买这间”。作决定前，请向建屋局、公积金局、
税务局和您的银行核实。
</details>

<details><summary><b>我的资料会去哪里？</b></summary>

哪里都不去。资料只保存在您设备上的浏览器储存空间。没有账户、没有接收资料的服务器，也没有分析工具。
请看[隐私](#隐私)。
</details>

<details><summary><b>规则和价格有多新？</b></summary>

价格：建屋局转售数据截至应用顶部显示的月份，每次数据更新时刷新。规则：每一页都有“规则更新至”日期，
每条规则都链接到它的官方网页。规则每年一月检讨（公积金在 1 月 1 日调整）。
</details>

<details><summary><b>为什么没有预购组屋项目和易淹水地点？</b></summary>

这些资料的来源不允许转载，所以公开版本选择不收录，而不违反条款。预购组屋卡片仍可根据您输入的价格计算，
比较表也会提示您查看公用事业局自己的易淹水地点名单。
</details>

<details><summary><b>它和建屋局或公积金局有关联吗？</b></summary>

没有。机构名称只说明数据的来源。
</details>

<details><summary><b>我发现数字有误。</b></summary>

谢谢！请用“Wrong number”模板[提交问题](https://github.com/heng8835/sg-housing-finance/issues/new/choose)。
**切勿贴上您的收入、公积金余额、储蓄或姓名**：问题是公开的。
</details>

## 开发者

本地运行、数据更新步骤和代码结构，请看英文版 [README](README.md#for-developers)。

## 数据来源

来自 data.gov.sg 的公开数据（建屋局、市建局、陆交局、教育部、幼儿培育署、卫生部、环境局、国家公园局），按新加坡
开放数据许可证提供；地图图块来自 OneMap（© 新加坡土地管理局）；以及 OpenStreetMap（© OpenStreetMap 贡献者，ODbL）。
逐项数据及条款：[`DATA_LICENCES.md`](DATA_LICENCES.md)。

注意：距离是直线距离；未来地铁线、大型项目和旧坟场由人工整理，位置是大约的；通勤时间是模型估算，不是路线规划。

## 支持我们

新加坡住房与理财是免费的。如果它对您有帮助，可以在 [Ko-fi](https://ko-fi.com/zhlim) 支持我们 ☕ —— 谢谢！

## 意见反馈

发现数字有误或数据问题？请[提交问题](https://github.com/heng8835/sg-housing-finance/issues/new/choose)——
**切勿贴上您的收入、公积金余额、储蓄或姓名**：问题是公开的。

## 许可证

代码：MIT，见 [LICENSE](LICENSE)。数据沿用其来源的条款（[`DATA_LICENCES.md`](DATA_LICENCES.md)）。
