---
id: fair-value
term: Recent sales benchmark (fair value in this app)
short: This app's reference price for a flat, built from recent resale transactions of similar flats in the same block or town — a reference point, not a valuation.
formula: "Benchmark price = recent comparable $psf × flat's floor area"
policy_keys: []
related: [psf, cov, valuation, rpi, remaining-lease, lease-decay]
level: intermediate
source: https://data.gov.sg/collections/189/view
---
The app compares an asking price with recent sales of similar flats: the same flat type, in the same block where there are enough sales, otherwise in the same town. It expresses the benchmark as a price per square foot and applies it to the flat's floor area.

The benchmark summarises past transactions, so it lags the market and cannot see a flat's condition, view, renovation or exact position. It is not HDB's valuation, which is only known after the Option to Purchase, and it is not a prediction.

Worked example: e.g. if similar flats in the block recently sold at about `S$600` psf and a `1,000` sq ft flat is listed at `S$650,000`, the asking price is about `S$50,000` above the benchmark — a gap that could turn into COV if HDB's valuation is close to recent sales.

Tip: A large gap in either direction is a prompt to look more closely at the listing, not a verdict on it.
