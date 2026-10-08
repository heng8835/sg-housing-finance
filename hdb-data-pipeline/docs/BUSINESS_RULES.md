# Business Rules

All rules below are evidenced by the legacy notebooks (`legacy/notebooks/`), which remain
the behavioral source of truth until migration completes.

## BR-01 — Zone classification
- Rule: each town maps to one of Central / East / North / North-East / West via the
  static `TOWN_TO_ZONE` dict; unmapped towns become `"Unknown"`.
- Purpose: regional grouping in dashboards.
- Evidence: Resale notebook cell 7. Status: Confirmed.

## BR-02 — Town centroids
- Rule: static `TOWN_CENTROIDS` dict provides a representative lat/lon per town
  (27 towns); towns are upper-cased and trimmed before lookup.
- Evidence: Resale notebook cell 6. Status: Confirmed.

## BR-03 — Floor area conversion
- Rule: `floor_area_sqft = floor_area_sqm * 10.76391041671`, rounded to 2 dp;
  `floor_area_sqm` is cast float -> int first.
- Evidence: Resale notebook cell 8. Status: Confirmed.
- Note: the float->int cast truncates fractional sqm; TODO confirm intended.

## BR-04 — Geocoding address format & caching
- Rule: geocode string is `"<block> <street_name> SINGAPORE"`; only unique
  block+street pairs are geocoded; results cached (`data/cache/hdb_address.csv`);
  OneMap top search result is taken; missing -> null lat/lon.
- Evidence: Resale notebook cells 2-4. Status: Confirmed.

## BR-05 — an outbound HTTP proxy on all outbound requests
- Rule: all HTTP requests go through the proxy named by `HDB_PIPELINE_PROXY`, when set.
- Evidence: `setproxy()` in both notebooks, called before every fetch.
- Status: Confirmed behavior; the hard-coded address must move to env config (DEC-004 TODO).

## BR-06 — BTO price-range parsing
- Rule: messy strings (unicode dashes, `$`, commas, `/psf` suffix) parse into
  `price_min/price_max/psf_min/psf_max`; psf range is extracted first and removed
  before price parsing; missing values stay None; rows are kept even with empty price.
- Evidence: BTO notebook `parse_price_range`, `parse_unit_price_rows`. Status: Confirmed.

## BR-07 — BTO project link filter
- Rule: only `/bto/<slug>` paths count as projects; utility pages
  (`/bto`, `/bto/brochures`, `/bto/tracker`, `/bto/launches`, `/bto/sales-launches`)
  are excluded; projects de-duplicated by URL.
- Evidence: BTO notebook `is_project_href`. Status: Confirmed.

## BR-08 — Polite scraping
- Rule: 0.6s between listing pages, 0.5s between detail pages, 0.05s between geocodes;
  descriptive User-Agent on the scraper session.
- Evidence: both notebooks. Status: Confirmed.

## BR-09 — BTO type derivation
- Rule: `type` = first word of `bto_type` (e.g. "BTO", "SBF"); `bto_type` and
  `construction_progress` columns are then dropped.
- Evidence: BTO notebook cell 2. Status: Confirmed.

## BR-11 — Geocode fallback for HDB street abbreviations
- Rule: some HDB street names use abbreviations OneMap's search cannot resolve.
  Geocoding first tries the address as written; on a miss it retries with a
  whole-token expansion map: `C'WEALTH`->COMMONWEALTH, `PK`->PARK, `KG`->KAMPONG,
  `MKT`->MARKET, `ST.`->SAINT. Tokens that already resolve (RD, DR, AVE, CL, CRES,
  LANE, and bare `ST` meaning "street") are deliberately NOT expanded.
- Purpose: recover ~2,390 transactions (95 addresses, mostly Queenstown/Commonwealth,
  Kallang/St George's) that the legacy notebook left ungeocoded.
- Evidence: added 2026-07-17; verified all 14 failing streets resolve via fallback
  (`sources/geocode.py`, `geocode_block_street`). Status: Confirmed. See DEC-007.
- Note: the abbreviation map is data-derived, not exhaustive — extend it if the
  validation "unknown coverage" check flags new unresolved streets.

## BR-10 — MRT station centroid
- Rule: a station's centroid is the mean lat/lon of all its exits; stations expand to
  one row per line code via the hand-maintained `STATION_LINE_MAP`;
  `line_id` = 1-based factorization of line.
- Evidence: Resale notebook cells 18-20. Status: Confirmed.
