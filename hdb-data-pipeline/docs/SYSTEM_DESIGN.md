# System Design

## Purpose

Data pipeline producing Tableau-ready datasets for Singapore HDB resale/BTO analysis,
orchestrated by Dagster (DEC-009). Resale transactions are the only automated flow —
MRT and BTO are on hold by explicit user decision and still live only in
`legacy/notebooks/`.

## Architecture

The resale flow is 5 Dagster assets, each a thin wrapper around tested functions in
`src/hdb_pipeline/*` — no logic lives in the orchestration layer itself:

```
raw_resale_transactions        data.gov.sg datastore_search, paginated fetch
        |
geocoded_resale_transactions   OneMap geocode, cache-aware + abbreviation fallback (BR-04/BR-11)
        |
enriched_resale_transactions   zone, town centroid, floor_area_sqft (BR-01/02/03)
        |
resale_transactions_csv        validate (schema/rows/price/coverage/zone) -> write
        |                      data/processed/resalebto_transactions.csv (Tableau contract, DEC-003)
        |
resale_transactions_gsheets    mirror to Google Sheets so Tableau Public auto-refreshes (DEC-006/008)
```

Scheduling: `resale_weekly_schedule` (every Monday 08:00 Asia/Singapore) fires
`resale_pipeline_job`, which materializes all 5 assets. Requires `dagster-daemon`
running continuously (DEC-009) — see DEVELOPMENT_GUIDE.md for the launcher scripts.
Monitoring: `dagster-webserver` UI at `http://localhost:3000` shows run history, logs,
and per-asset metadata (row counts, geocode coverage, Sheets sync status) for every run.

`pipelines/run_resale.py` still exists as a standalone script for quick manual runs
outside Dagster (same steps, no orchestration/scheduling/UI).

## Repository map

```
hdb-data-pipeline/
  src/hdb_pipeline/
    config.py        env-driven settings (proxy, paths, dataset IDs, Sheets config, .env)
    http.py          shared requests.Session: proxy, retry, pacing
    sources/
      resale.py       paginated fetch
      geocode.py       cache-aware geocoding + abbreviation fallback (BR-04/BR-11)
      mrt.py           station centroids/lines (pure functions only; fetch not migrated)
      bto.py           price/link/text parsing (pure functions only; crawl not migrated)
    transforms/enrich.py   zone, centroid, sqft (BR-01/02/03)
    validation/checks.py   schema/row-count/price/coverage/zone gate
    export/
      tableau.py       [stub, unused — CSV export lives inline in the asset/script]
      gsheets.py        batched push to Google Sheets (DEC-008)
  dagster_project/    assets.py, schedules.py, definitions.py (DEC-009)
  scripts/            run_dagster_dev.ps1, run_dagster_daemon.ps1, run_dagster_webserver.ps1
  pipelines/          run_resale.py (manual/ad-hoc); run_mrt.py, run_bto.py [not built, on hold]
  data/               raw/ interim/ processed/ cache/ external/
  secrets/            gsheets-service-account.json (gitignored, never commit)
  .dagster_home/      Dagster run/event storage, sqlite (gitignored)
  tests/              pytest suite, 79 passing
../legacy/notebooks/  reference implementation for MRT/BTO (still the source of truth there)
../tableau/           workbooks + extracts
```

## Data flow details

- **Geocode cache**: `data/cache/hdb_address.csv` maps block+street -> lat/lon,
  append-only. Only failures are excluded (retried every run); legacy null rows are
  healed on load (DEC-007). 100.00% coverage confirmed as of 2026-07-21.
- **Full refetch**: resale API supports offset pagination only; each run refetches
  everything (~236k rows, ~24 pages). Acceptable at this volume.
- **Raw snapshots**: `raw_resale_transactions` writes the as-fetched payload to
  `data/raw/resale_transactions_raw.csv` before any transform.
- **Google Sheets sync**: batched at 5,000 rows/request to avoid payload-size failures
  over the an outbound HTTP proxy; best-effort in the CLI script, fails visibly as its own
  Dagster asset if something other than "not configured" goes wrong.

## Integrations

- Tableau workbooks read `data/processed/` CSVs and `data/external/` shapefile directly
  (repointed 2026-07-17, see tableau/README.md).
- Resale data also flows to a Google Sheet for Tableau Public auto-refresh; the
  workbook-side repoint to that Sheet is a pending one-time user step
  (docs/TABLEAU_PUBLISHING.md).

## Infrastructure & constraints

- Windows 11 workstation, Anaconda base Python 3.10.9 (DEC-005), an outbound HTTP proxy on
  all outbound HTTP via env-config (DEC-004).
- Dagster orchestration requires two background processes running continuously for
  scheduling + monitoring to work: `dagster-daemon` (fires the schedule) and
  `dagster-webserver` (UI). `DAGSTER_HOME` is scoped to `.dagster_home/` via the
  `scripts/run_dagster_*.ps1` launchers, not a system-wide env var.
- Sources are public; no live-scraping code runs today (BTO crawl is on hold).

## Risks

- Dagster daemon/webserver not running -> the weekly schedule silently doesn't fire;
  no automatic catch-up for a missed window (laptop off/asleep at 08:00 Monday).
  Mitigation: check the webserver UI's Runs/Schedules page periodically.
- data.gov.sg dataset IDs can be superseded.
- OneMap rate limits if the cache is lost.
- MRT/BTO logic in `legacy/notebooks/` will drift further from any future data.gov.sg
  or BTO-source changes (a BTO source — not in the public build) the longer they stay unmigrated.
