# Project Brief

Status: **Approved by user on 2026-07-16.**

## Project Name

HDB Data Pipeline (Singapore HDB resale/BTO analysis)

## Plain-Language Summary

Convert two working Jupyter scraper notebooks into a stable, tested Python data pipeline
that refreshes the datasets behind the owner's Tableau dashboards — including the published
Tableau Public dashboard "Can I Afford This HDB — A Singapore Resale Buyer Decision Tool".

## Problem Being Solved

The current pipeline is two ad-hoc notebooks with duplicated helpers, hard-coded proxy
settings, no validation, and no tests. Refreshing dashboard data is manual and fragile.
(Confirmed)

## Intended Users

- The data owner/analyst (builds and refreshes the dashboards). (Confirmed)
- Dashboard viewers on Tableau Public (indirect consumers). (Confirmed)

## Expected Outcome

A `hdb-data-pipeline` Python package with reusable source/transform/validation/export
modules, runnable entry-point scripts, tests, and documented refresh + Tableau publishing
steps. Ready to be wrapped by Dagster later without rewriting. (Confirmed)

## First-Version Scope

### Included

- Migrate resale-transactions flow (data.gov.sg fetch -> OneMap geocode with cache ->
  zone/centroid/sqft enrichment -> CSV export). (Confirmed)
- Migrate MRT reference flow (exits geojson -> station centroids + line mapping). (Confirmed)
- Migrate BTO scraper flow (a BTO source — not in the public build: listing/detail/prices). (Confirmed)
- Validation checks before export; pytest suite for pure functions. (Confirmed)
- Proxy/config via environment variables instead of hard-coding. (Recommended default)

### Not Included Yet

- Dagster orchestration (explicitly deferred by user). (Confirmed)
- Automated Tableau Public republishing (see docs/TABLEAU_PUBLISHING.md options). (Deferred)
- Scheduling (Windows Task Scheduler or Dagster later). (Deferred)
- Distance-to-MRT or other new analytical features. (Deferred)

## User Workflow

1. Owner runs a pipeline script (e.g. `python pipelines/run_resale.py`).
2. Pipeline fetches, enriches, validates; failures stop the export with a clear message.
3. Validated CSVs land in `data/processed/` (stable paths for Tableau).
4. Owner refreshes/republishes the Tableau workbook (manual today; see publishing options).

## Inputs

- data.gov.sg datastore_search — resale transactions, dataset `d_8b84c4ee58e3cfc0ece0d773c8ca6abc`, ~223k rows, JSON, paginated. (Confirmed)
- data.gov.sg poll-download — MRT station exits GeoJSON, dataset `d_b39d3a0871985372d7e1637193335da5`. (Confirmed)
- OneMap search API — geocoding, cached in `data/cache/hdb_address.csv`. (Confirmed)
- A BTO source — not in the public build: HTML scrape of BTO projects and unit prices. (Confirmed)
- Static reference: MRT shapefile, planning-area geojson, station-line map, town centroids/zones. (Confirmed)
- Frequency: monthly-ish manual refresh today; TODO confirm desired cadence.

## Outputs

- CSVs in `data/processed/`: `resalebto_transactions.csv`, `mrt_map.csv`,
  `mrt_station_centroid.csv`, plus BTO project / unit-price files from a BTO source — not in
  the public build. (Confirmed)
- Destination: Tableau workbooks in `../tableau/`, published to Tableau Public. (Confirmed)

## Business Rules

See docs/BUSINESS_RULES.md (zone mapping, sqm->sqft constant, geocode caching,
price-range parsing, polite scraping delays, an outbound HTTP proxy on all requests).

## Automation

- Trigger: manual run today. Schedule: TODO. Timezone: Asia/Singapore.
- Retry: HTTP retry w/ backoff (Recommended default). Failure notification: TODO.

## Access and Security

- Public data sources; no credentials today. an outbound HTTP proxy address must live in
  env config, not source. No PII beyond public transaction records. (Confirmed)

## Integrations

- Tableau Desktop/Public (file-based today; Google Sheets option under evaluation).

## Recommended Technical Direction

- Application type: Python batch pipeline package + thin runner scripts. (Recommended default)
- Storage: files (CSV) under `data/`; no database yet. (Recommended default)
- Testing: pytest with fixtures, no live network in tests. (Recommended default)
- Orchestration: none now; Dagster-compatible function design. (Confirmed)
- Python 3.11+; pandas/requests/bs4/lxml as in notebooks. (Recommended default)

## Quality Requirements

- Schema + row-count + coverage validation before export; clear failure messages;
  logging to console (file logging TODO); tests for all pure functions.

## Constraints

- Windows 11 workstation behind an outbound HTTP proxy. (Confirmed)
- **No Python installation found on this machine** — setup required before development
  can be validated. (Confirmed, TODO)
- Tableau Public free tier: no REST API publishing; auto-refresh only via Google Sheets. (Confirmed)

## Assumptions

- The two notebooks are the complete current pipeline. 
- The BTO project-details file came from an earlier notebook variant; treat current
  notebook outputs as canonical. TODO confirm.

## Open Questions

- Desired refresh cadence (monthly when data.gov.sg updates?).
- ~~Where does Python/Jupyter currently run?~~ Resolved: Anaconda base env at
  `%LOCALAPPDATA%\anaconda3` (Python 3.10.9) — see DEC-005.
- ~~Google Sheets acceptable for auto-refresh?~~ Resolved: yes, adopted as the
  target once pipeline automation is stable — see DEC-006.

## Success Criteria

- One command refreshes each dataset end-to-end with validation passing.
- Tableau workbooks read stable paths in `data/processed/` without edits.
- Pure-function test suite passes; a failed validation blocks export.

## Bootstrap Permissions

- Graphify installation: Available as Claude skill; generation deferred until code exists.
- Other development dependency installation: Not performed (no Python present).
- Documentation and configuration changes: Permitted (done).
- Application or pipeline implementation during bootstrap: Not permitted (none done).
