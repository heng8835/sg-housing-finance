# Tests

Pytest suite (empty at bootstrap). Planned coverage, in priority order:

1. Pure parsing/transform functions (no network): `parse_price_range`, zone mapping,
   sqft conversion, station-line expansion — these migrate first and are easiest to test.
2. Validation checks against small fixture DataFrames.
3. Source modules with mocked HTTP responses (recorded JSON/HTML fixtures in `tests/fixtures/`).

No live-network tests in the default suite.
