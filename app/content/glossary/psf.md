---
id: psf
term: Resale price / $psf
short: The transacted price of a resale flat, and that price divided by floor area in square feet — a way to compare flats of different sizes.
formula: "$psf = resale price ÷ (floor area in m² × 10.764)"
policy_keys: []
related: [fair-value, rpi, remaining-lease, lease-decay, cov]
level: basic
source: https://data.gov.sg/collections/189/view
---
Every completed HDB resale transaction is published with its price, flat type, floor area, storey range and lease commencement date. The headline price is what buyer and seller agreed, including any Cash Over Valuation.

Price per square foot (psf) adjusts for size. HDB records floor area in square metres, so the area is converted to square feet first. A bigger flat usually costs more in total but often less per square foot.

Worked example: e.g. a `S$550,000` flat of `92` square metres (about `990` sq ft) works out to about `S$555` psf; a `S$480,000` flat of `68` square metres (about `732` sq ft) is about `S$656` psf.

Tip: Psf is most meaningful when comparing flats with similar remaining lease, location and flat type; storey and condition also move prices.
