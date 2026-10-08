# Fair-value benchmark backtest

Run 2026-10-07 by `python tools/backtest_fair_value.py` (stdlib only, 12 s to predictions). Data: `app/data/data.js`, 240,345 resale sales 2017-01 to 2026-09 (generated 2026-09-17T08:20+08:00; 2026-09 is partial and excluded).

## Method

- **Model** = Python replica of `benchmark(c, b)` in `app/modules/explore/legacy.js`: median $psf of the first tier with enough sales of the same flat type — (1) same block 12 m, >=3 sales; (2) same block 24 m, >=3; (3) blocks within 400 m with lease start ±5 y, 12 m, >=5; (4) same, 24 m; (5) town with lease ±5 y, 12 m, >=5; (6) town overall 12 m. Predicted price = benchmark $psf × the sale's own floor area (sqft). Confidence in the app: tiers 1-2 strong, 3-4 moderate, 5-6 weak.
- **No look-ahead (rolling origin)**: a sale registered in month T is valued with sales from months T-24..T-1 only, i.e. as if the app's `lastMonthIdx` were T-1. Same-month sales are never used.
- **Fold 1**: test 2026-06..2026-08; 80 % interval calibrated on 2025-12..2026-05 (P10/P90 of actual÷predicted per tier, computed the same no-look-ahead way; tiers with <30 residuals use all tiers).
- **Fold 2**: test 2026-03..2026-05; 80 % interval calibrated on 2025-09..2026-02 (P10/P90 of actual÷predicted per tier, computed the same no-look-ahead way; tiers with <30 residuals use all tiers).
- **Baseline**: town + flat type median $psf over the previous 12 months (no minimum n).
- **Simplifications**: block lease = modal lease start of the block's sales over the whole file (a static attribute, not a price leak); sqm is the rounded integer stored in data.js (as the app uses); $psf is float64 not float32. Signed error = (pred − actual)/actual, so negative = benchmark below the price paid.
- **Caveats**: `month` is HDB's registration month (price agreed ~1-3 months earlier). In the live app the newest data is already weeks old and a listing registers months later, so the real lag is ~3+ months longer than tested here. Intervals were calibrated in a near-flat market and would sit too high in a hot one.

## Results — overall

| set | n | coverage | MdAPE | mean signed err | median signed err | within ±5 % | within ±10 % | in 80 % interval |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Fold 1 model | 7,295 | 100.0 % | 4.0 % | +1.1 % | +0.5 % | 58.8 % | 86.2 % | 78.1 % |
| Fold 1 baseline | 7,295 | 100.0 % | 9.4 % | +0.3 % | +0.9 % | 29.1 % | 52.0 % | 77.8 % |
| Fold 2 model | 6,102 | 100.0 % | 4.1 % | +0.4 % | +0.0 % | 58.5 % | 86.9 % | 78.3 % |
| Fold 2 baseline | 6,102 | 100.0 % | 9.2 % | -0.1 % | +0.5 % | 29.9 % | 53.2 % | 75.5 % |
| **Both folds, model** | 13,397 | 100.0 % | 4.1 % | +0.8 % | +0.3 % | 58.6 % | 86.5 % | 78.2 % |
| **Both folds, baseline** | 13,397 | 100.0 % | 9.4 % | +0.1 % | +0.7 % | 29.5 % | 52.5 % | 76.8 % |

## Results — model by tier (both folds pooled)

| tier (confidence) | n | coverage | MdAPE | mean signed err | median signed err | within ±5 % | within ±10 % | in 80 % interval | share of sales | baseline MdAPE, same sales | P10–P90 band (fold 1) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 same block, 12 m (>=3) (strong) | 4,928 | 100.0 % | 3.8 % | +1.5 % | +0.7 % | 59.8 % | 86.8 % | 78.3 % | 36.8 % | 9.8 % | 0.92–1.07 |
| 2 same block, 24 m (>=3) (strong) | 4,103 | 100.0 % | 4.1 % | -0.4 % | -0.8 % | 59.2 % | 88.1 % | 78.4 % | 30.6 % | 8.7 % | 0.94–1.11 |
| 3 <=400 m, lease +/-5 y, 12 m (>=5) (moderate) | 3,895 | 100.0 % | 4.1 % | +1.4 % | +1.1 % | 58.5 % | 86.4 % | 78.0 % | 29.1 % | 9.1 % | 0.92–1.07 |
| 4 <=400 m, lease +/-5 y, 24 m (>=5) (moderate) | 239 | 100.0 % | 5.0 % | -2.0 % | -1.8 % | 49.8 % | 80.3 % | 84.1 % | 1.8 % | 13.1 % | 0.93–1.14 |
| 5 town, lease +/-5 y, 12 m (>=5) (weak) | 194 | 100.0 % | 7.0 % | -0.4 % | -0.6 % | 36.1 % | 67.0 % | 78.9 % | 1.4 % | 16.2 % | 0.88–1.18 |
| 6 town overall, 12 m (rough) (weak) | 38 | 100.0 % | 17.3 % | -10.1 % | -5.3 % | 23.7 % | 28.9 % | 26.3 % | 0.3 % | 17.3 % | 0.92–1.09 (pooled) |

Sales with no benchmark at all: 0 (coverage counts them as misses). Baseline interval band (fold 1): 0.85–1.26.

## Storey effect (model, both folds)

| storey band | n | coverage | MdAPE | mean signed err | median signed err | within ±5 % | within ±10 % | in 80 % interval |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 01-03 | 2,203 | 100.0 % | 6.5 % | +6.0 % | +5.9 % | 39.2 % | 72.5 % | 58.9 % |
| 04-06 | 3,053 | 100.0 % | 4.0 % | +2.8 % | +2.4 % | 59.7 % | 86.9 % | 78.3 % |
| 07-12 | 5,267 | 100.0 % | 3.4 % | -0.5 % | -0.7 % | 66.2 % | 91.2 % | 84.8 % |
| 13-21 | 2,305 | 100.0 % | 3.9 % | -2.4 % | -2.6 % | 61.2 % | 90.0 % | 83.0 % |
| 22+ | 569 | 100.0 % | 5.4 % | -5.4 % | -5.2 % | 47.5 % | 81.5 % | 71.9 % |

## Lag across market regimes (model, half-years, same no-look-ahead method)

| period | n | model MdAPE | model median signed err | baseline median signed err | 4-room $psf YoY |
|---|---:|---:|---:|---:|---:|
| 2021H1 | 13,686 | 6.2 % | -5.0 % | -5.8 % | +13.8 % |
| 2021H2 | 15,401 | 7.1 % | -6.4 % | -6.0 % | +12.6 % |
| 2022H1 | 13,150 | 7.1 % | -6.5 % | -5.3 % | +9.1 % |
| 2022H2 | 13,570 | 6.7 % | -6.0 % | -4.9 % | +9.2 % |
| 2023H1 | 12,940 | 5.6 % | -4.4 % | -3.1 % | +7.6 % |
| 2023H2 | 12,814 | 5.2 % | -3.6 % | -2.5 % | +5.6 % |
| 2024H1 | 13,821 | 5.0 % | -3.7 % | -3.2 % | +6.0 % |
| 2024H2 | 14,011 | 5.9 % | -5.2 % | -4.5 % | +9.1 % |
| 2025H1 | 13,126 | 5.6 % | -4.7 % | -3.8 % | +9.7 % |
| 2025H2 | 11,959 | 4.6 % | -2.5 % | -1.4 % | +3.1 % |
| 2026H1 | 12,227 | 4.1 % | -0.2 % | +0.5 % | -0.1 % |
| 2026-07..2026-08 | 5,170 | 4.0 % | +0.5 % | +1.1 % | -0.8 % |

## Interpretation

- The benchmark lands within ±10 % of the price paid for 87 % of test sales (MdAPE 4.1 %) versus 53 % (MdAPE 9.4 %) for the town × flat-type median: block-level comparables more than halve the error, and coverage is 100 % because tier 6 almost always has sales.
- Lag: the trailing-window median lags rising markets. In half-years with 4-room $psf up >=5 % YoY the median signed error averaged -5.1 % (worst 2022H1: -6.5 % at +9.1 % YoY), vs +0.2 % when YoY < 3 %. The recent test windows were flat (4-room YoY -0.8 % / +0.0 %), so the headline bias (+0.3 % median) understates the lag in a hot market.
- Storey is the largest unmodelled factor: floors 01-03 are valued 5.9 % above their price, floors 13+ 3.0 % below. The app's 'premium vs benchmark' for a high-floor listing is therefore partly a storey premium, not overpaying.
- 'Strong' tiers (1-2, 67 % of sales) earn the label: MdAPE 3.9 %. The empirical 80 % interval caught 78 % of test prices (target 80 %); a ±5 % 'fair' band would be too tight for most sales — 59 % fall inside it.

## Suggested next steps

1. Time-adjust comparables: scale each comparable's $psf by a town × flat-type monthly index (e.g. 3-month rolling median, or a repeat-sales index) to the valuation month before taking the median; re-run this backtest and expect the signed error to move toward 0.
2. Storey adjustment: estimate a storey-band multiplier per town (or per block where n allows) from the training window and apply it to the listing's storey; the storey table is the target to flatten.
3. Show the empirical interval (per-tier P10–P90) in the app instead of a single fair value, and label the premium 'within normal range' when the asking price is inside it.
4. Add floor-area and remaining-lease adjustments for tiers 3-6 (different blocks), then re-check per-tier MdAPE; keep this script as the regression gate for any benchmark change.
