<div align="center">

<img src="app/icons/icon.svg" alt="SG Housing & Finance" width="88" height="88">

# SG Housing & Finance

**Can we afford this flat?** Plain answers from Singapore's real rules, in your browser.

<a href="https://heng8835.github.io/sg-housing-finance/"><img src="https://img.shields.io/badge/%F0%9F%91%89%20Open%20the%20app-free%2C%20no%20sign--up-1f5fae?style=for-the-badge&labelColor=174a87" alt="Open the app — free, no sign-up" height="36"></a>

**English** · [简体中文](README.zh.md) · desktop & phone · [Support on Ko-fi](https://ko-fi.com/zhlim)

[![tests](https://github.com/heng8835/sg-housing-finance/actions/workflows/ci.yml/badge.svg)](https://github.com/heng8835/sg-housing-finance/actions/workflows/ci.yml)
[![MIT licence](https://img.shields.io/badge/licence-MIT-555?style=flat-square)](LICENSE)
[![Open data](https://img.shields.io/badge/data-data.gov.sg_open_licence-555?style=flat-square)](DATA_LICENCES.md)
[![No tracking](https://img.shields.io/badge/tracking-none-555?style=flat-square)](#privacy)

</div>

## Sound familiar?

> You found a 4-room in **Punggol**. The agent says it's a good price. Your parents want you near them in
> **Bishan**. And nobody can tell you how much cash you actually need on the day.
>
> **SG Housing & Finance puts every answer on one page — worked out for *your* household.**

## Your decision, made clear

| | You're asking | What the numbers say |
|:---:|---|---|
| 💰 | **"Can we really afford it?"** | The most you can pay, from your income, CPF and grants — plus the cash you must put down upfront. No guesswork. |
| 🏷️ | **"Is this a fair price?"** | Checked against recent resale prices in the same block and nearby. You'll see if it's above or below the market. |
| ⚖️ | **"Which flat should we pick?"** | Tick what matters — cash, MRT, schools, lease — and get your shortlist side by side, one plain verdict per flat. |
| 📍 | **"What's around it?"** | Primary schools within 1 km, childcare, clinics, MRT and travel time, block by block. |
| 🏠 | **"Rent first, or buy now?"** | Whether your rent is fair, and what renting really costs against buying. |
| 👵 | **"What happens to our CPF?"** | Your CPF and retirement payout, with and without this flat. |
| 🔒 | **"Is my salary safe?"** | It never leaves your browser. No sign-up, no tracking. |

## See it in action

<div align="center">

<img src="docs/readme/demo.gif" alt="Picking a goal, loading a sample household, seeing what it can pay, opening a block card with nearby schools, and ranking three flats in Compare" width="800">

</div>

| Afford | Compare | Explore |
|:---:|:---:|:---:|
| <img src="docs/readme/afford.jpg" width="260" alt="Afford tab: most you can pay and cash needed"> | <img src="docs/readme/compare.jpg" width="260" alt="Compare table of three flats"> | <img src="docs/readme/schools.jpg" width="260" alt="Block card with primary schools within 1 km"> |
| **Rent & Buy** | **Plan** | **中文** |
| <img src="docs/readme/rent.jpg" width="260" alt="Rent and Buy tab"> | <img src="docs/readme/plan.jpg" width="260" alt="Plan tab with CPF and retirement"> | <img src="docs/readme/zh.jpg" width="260" alt="The app in Chinese"> |

> [!NOTE]
> **Educational estimates, not financial advice. Not affiliated with any Singapore government agency.**
> Check prices, eligibility, loans and grants with HDB, CPF Board, IRAS and your bank before you commit.

## Built on real data

<div align="center">

| **240k+** | **10,740** | **191** | **1,000+** | **0** |
|:---:|:---:|:---:|:---:|:---:|
| resale sales since 2017 | HDB blocks mapped | Singapore rules, each with an official source and date | automated tests | trackers |

</div>

Every rule lives in one file, [`sg-policy.json`](app/policy/sg-policy.json), with its source and the date it applies from.

## Privacy

No account, no server, no analytics. Your income, CPF and savings stay in this browser and never go into a URL,
request or log. Enforced by tests in [`tests/privacy/`](tests/privacy). **Forget my data** clears everything.

## Found a wrong number?

[Open an issue](https://github.com/heng8835/sg-housing-finance/issues/new/choose) with the "Wrong number" template.
**Never paste your income, CPF balances, savings or names** — issues are public.

## Support

<img src="app/icons/logo.png" alt="" width="72" height="71" align="left">

SG Housing & Finance is free. If it helped you, you can support it on [Ko-fi](https://ko-fi.com/zhlim).
<br clear="left">

## Data & licence

Public data from data.gov.sg under the Singapore Open Data Licence; map tiles from OneMap and OpenStreetMap.
Details per dataset: [`DATA_LICENCES.md`](DATA_LICENCES.md). BTO projects and flood areas are left out because their
sources don't allow republishing.

Code: MIT, see [LICENSE](LICENSE). Data keeps the terms of its sources.

## For developers

<details><summary><b>Architecture, local setup and data refresh</b></summary>

A static web app (ES modules, no build step) fed by a Dagster pipeline:

```
data.gov.sg ──► hdb-data-pipeline ──► tools/*.py ──► app/data/ (generated)
                         app/policy/sg-policy.json ──► app/ (engine/ + modules/)
```

```bash
serve.cmd                  # Windows; or: python tools/serve.py   -> http://localhost:8766
npm test                   # app tests (Node 22, no dependencies)
docker compose up          # app -> http://localhost:8080, Dagster -> http://localhost:3000
python tools/refresh_all.py --dry-run   # plan a full data refresh; drop --dry-run to run it
```

More: [`app/README.md`](app/README.md) (data refresh order) ·
[`hdb-data-pipeline/README.md`](hdb-data-pipeline/README.md) (pipeline setup) ·
[`docs/MODULE_MAP.md`](docs/MODULE_MAP.md) (one row per source file) · [`CHANGELOG`](CHANGELOG.md)
</details>
