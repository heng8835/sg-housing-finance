# HDB Data Pipeline

Data pipeline behind the **"Can I Afford This HDB"** Tableau Public dashboard. Fetches
Singapore HDB resale transactions, geocodes, enriches, validates, and exports a
Tableau-ready dataset — plus a Google Sheets bridge so Tableau Public auto-refreshes
without manual republishing. Orchestrated by Dagster (scheduling + monitoring).

**Status:** resale flow complete and live-verified end-to-end (Milestone 1 + Dagster
orchestration). MRT and BTO are on hold by user decision and still only exist in
`../legacy/notebooks/`.

## Layout

```
src/hdb_pipeline/     Python package — the tested business logic
  sources/            data acquisition (resale API, cached geocoding; MRT/BTO parsing only, fetch on hold)
  transforms/         enrichment (zones, centroids, sqft)
  validation/         data-quality checks before export
  export/             gsheets.py (Google Sheets push); tableau.py (unused stub)
dagster_project/       Dagster assets/schedules wrapping src/hdb_pipeline (orchestration only, no logic)
scripts/               PowerShell launchers for the Dagster daemon/webserver/dev UI
pipelines/             run_resale.py — manual/ad-hoc run without Dagster
data/
  raw/                as-fetched snapshots (regenerable, not committed)
  interim/            intermediate working data + previous-run backup
  processed/          canonical outputs — Tableau points HERE
  cache/              geocode cache (hdb_address.csv) — valuable, committed
  external/           third-party reference data (MRT shapefile, planning-area geojson)
secrets/               gsheets-service-account.json (gitignored, never commit)
.dagster_home/         Dagster run/event storage (gitignored)
tests/                 pytest suite, 79 passing
docs/                  project documentation (start with docs/NEXT_SESSION.md)
```

## Getting started

```powershell
& "$env:LOCALAPPDATA\anaconda3\python.exe" -m pytest                 # run tests
& "$env:LOCALAPPDATA\anaconda3\python.exe" pipelines/run_resale.py    # manual run
.\scripts\run_dagster_dev.ps1                                         # Dagster UI + scheduling, interactive
```

See `docs/DEVELOPMENT_GUIDE.md` for full command reference, `CLAUDE.md` for the
Claude Code working agreement, and `docs/PROJECT_BRIEF.md` for scope.
