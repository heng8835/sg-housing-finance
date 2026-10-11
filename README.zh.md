<div align="center">

<img src="app/icons/icon.svg" alt="新加坡住房与理财" width="88" height="88">

# 新加坡住房与理财（SG Housing & Finance）

**这间组屋我们买得起吗？** 用新加坡真实的规则，在您的浏览器里给出浅白的答案。

<a href="https://heng8835.github.io/sg-housing-finance/"><img src="https://img.shields.io/badge/%F0%9F%91%89%20打开应用-免费，不用注册-1f5fae?style=for-the-badge&labelColor=174a87" alt="打开应用——免费，不用注册" height="36"></a>

[English](README.md) · **简体中文** · 电脑和手机 · [在 Ko-fi 支持我们](https://ko-fi.com/zhlim)

[![tests](https://github.com/heng8835/sg-housing-finance/actions/workflows/ci.yml/badge.svg)](https://github.com/heng8835/sg-housing-finance/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/许可证-MIT-555?style=flat-square)](LICENSE)
[![开放数据](https://img.shields.io/badge/数据-data.gov.sg_开放许可-555?style=flat-square)](DATA_LICENCES.md)
[![不追踪](https://img.shields.io/badge/追踪-无-555?style=flat-square)](#隐私)

</div>

## 听起来很熟悉？

> 您在**榜鹅**看中了一间四房式组屋。中介说价钱很好。父母却希望您住在**碧山**，离他们近一点。
> 而且没有人能告诉您，交易当天到底要准备多少现金。
>
> **新加坡住房与理财把所有答案放在同一页——按*您的*家庭算给您看。**

## 帮您把决定看清楚

| | 您想知道 | 数字告诉您 |
|:---:|---|---|
| 💰 | **“我们真的买得起吗？”** | 根据您的收入、公积金和津贴，算出最多可付多少，以及首付要准备多少现金。不靠猜。 |
| 🏷️ | **“这个价钱公道吗？”** | 与同一座和附近组屋的近期转售价比较，一眼看出是高于还是低于市场。 |
| ⚖️ | **“该选哪一间？”** | 勾选您在乎的——现金、地铁、学校、屋契——候选组屋并排比较，每间一句浅白结论。 |
| 📍 | **“附近有什么？”** | 1 公里内的小学、托儿所、诊所、地铁和通勤时间，逐座列出。 |
| 🏠 | **“先租，还是现在买？”** | 您的租金是否合理，以及租屋和买屋的真实成本对比。 |
| 👵 | **“公积金会怎样？”** | 买与不买这间组屋，您的公积金和退休入息各是多少。 |
| 🔒 | **“我的薪水安全吗？”** | 资料只留在您的浏览器。不用注册，没有追踪。 |

## 实际操作

<div align="center">

<img src="docs/readme/demo.gif" alt="选择目标，载入示例家庭，查看最多可付多少，打开附近有小学的组屋卡片，并在比较页为三间组屋排序" width="800">

</div>

| 负担能力 | 比较 | 探索 |
|:---:|:---:|:---:|
| <img src="docs/readme/afford.jpg" width="260" alt="负担能力页：最多可付多少和所需现金"> | <img src="docs/readme/compare.jpg" width="260" alt="三间组屋的比较表"> | <img src="docs/readme/schools.jpg" width="260" alt="组屋卡片：1 公里内的小学"> |
| **租屋与买屋** | **规划** | **中文** |
| <img src="docs/readme/rent.jpg" width="260" alt="租屋与买屋页"> | <img src="docs/readme/plan.jpg" width="260" alt="规划页：公积金与退休"> | <img src="docs/readme/zh.jpg" width="260" alt="中文界面"> |

> [!NOTE]
> **教育用途的估算，并非理财建议。本项目与新加坡任何政府机构没有关联。**
> 在作决定前，请向建屋局、公积金局、税务局和您的银行核实价格、资格、贷款和津贴。

## 以真实数据为基础

<div align="center">

| **24 万+** | **10,740** | **191** | **1,000+** | **0** |
|:---:|:---:|:---:|:---:|:---:|
| 2017 年以来的转售成交 | 地图上的组屋 | 条新加坡规则，每条附官方来源和日期 | 项自动测试 | 个追踪器 |

</div>

每条规则都放在同一个文件 [`sg-policy.json`](app/policy/sg-policy.json) 里，附上来源和生效日期。

## 隐私

不用账号，没有服务器，没有分析工具。您的收入、公积金和储蓄只留在这个浏览器里，绝不会出现在网址、请求或日志中。
由 [`tests/privacy/`](tests/privacy) 的测试保证。**清除我的数据**会删除一切。

## 发现数字有误？

请用“Wrong number”模板[提交问题](https://github.com/heng8835/sg-housing-finance/issues/new/choose)。
**切勿贴上您的收入、公积金余额、储蓄或姓名**——问题是公开的。

## 支持我们

<img src="app/icons/logo.png" alt="" width="72" height="71" align="left">

新加坡住房与理财是免费的。如果它对您有帮助，可以在 [Ko-fi](https://ko-fi.com/zhlim) 支持我们。
<br clear="left">

## 数据与许可证

来自 data.gov.sg 的公开数据，按新加坡开放数据许可证提供；地图图块来自 OneMap 和 OpenStreetMap。
逐项数据及条款：[`DATA_LICENCES.md`](DATA_LICENCES.md)。预购组屋项目和易淹水地点的来源不允许转载，所以没有收录。

代码：MIT，见 [LICENSE](LICENSE)。数据沿用其来源的条款。

## 开发者

<details><summary><b>架构、本地运行和数据更新</b></summary>

静态网页应用（ES 模块，无需构建），数据由 Dagster 管道提供：

```
data.gov.sg ──► hdb-data-pipeline ──► tools/*.py ──► app/data/（自动生成）
                         app/policy/sg-policy.json ──► app/（engine/ + modules/）
```

```bash
serve.cmd                  # Windows；或：python tools/serve.py   -> http://localhost:8766
npm test                   # 应用测试（Node 22，无依赖）
docker compose up          # 应用 -> http://localhost:8080，Dagster -> http://localhost:3000
python tools/refresh_all.py --dry-run   # 预览一次完整的数据更新；去掉 --dry-run 即执行
```

更多：[`app/README.md`](app/README.md)（数据更新顺序）·
[`hdb-data-pipeline/README.md`](hdb-data-pipeline/README.md)（管道设置）·
[`docs/MODULE_MAP.md`](docs/MODULE_MAP.md)（每个源文件一行）· [`CHANGELOG`](CHANGELOG.md)
</details>
