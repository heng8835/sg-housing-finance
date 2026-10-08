"""Resale transactions pipeline: fetch -> geocode -> enrich -> validate -> export.

Run from the repo root:
    & "$env:LOCALAPPDATA\\anaconda3\\python.exe" pipelines/run_resale.py

Writes data/processed/resalebto_transactions.csv (the Tableau contract) only if
validation passes; the previous version is kept at
data/interim/resalebto_transactions.previous.csv.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pandas as pd

from hdb_pipeline.config import get_settings
from hdb_pipeline.export.gsheets import GSheetsNotConfigured, push_dataframe
from hdb_pipeline.http import make_session
from hdb_pipeline.sources.geocode import add_coordinates
from hdb_pipeline.sources.resale import fetch_resale_transactions
from hdb_pipeline.transforms.enrich import (
    add_floor_area_sqft,
    add_town_centroids,
    add_zone,
)
from hdb_pipeline.validation.checks import RESALE_CONTRACT_COLUMNS, check_resale_transactions

OUTPUT_NAME = "resalebto_transactions.csv"


def main() -> int:
    settings = get_settings()
    session = make_session(settings)
    print(f"proxy: {settings.proxy_url or '(none)'}")

    # 1. fetch + raw snapshot
    df = fetch_resale_transactions(session, settings)
    settings.raw_dir.mkdir(parents=True, exist_ok=True)
    df.to_csv(settings.raw_dir / "resale_transactions_raw.csv", index=False)

    # 2. geocode (cache-aware) + enrich
    df = add_coordinates(df, session, settings, settings.cache_dir / "hdb_address.csv")
    df = add_zone(df)
    df = add_town_centroids(df)
    df = add_floor_area_sqft(df)
    df = df[RESALE_CONTRACT_COLUMNS]

    # 3. validate against the current production file before touching it
    output_path = settings.processed_dir / OUTPUT_NAME
    previous_count = None
    if output_path.exists():
        previous_count = sum(1 for _ in open(output_path, encoding="utf-8")) - 1

    summary = check_resale_transactions(df, previous_row_count=previous_count)
    print(f"validation OK: {summary}")

    # 4. export: back up the previous file, then replace atomically-ish
    settings.processed_dir.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        settings.interim_dir.mkdir(parents=True, exist_ok=True)
        backup = settings.interim_dir / "resalebto_transactions.previous.csv"
        backup.write_bytes(output_path.read_bytes())

    tmp_path = output_path.with_suffix(".csv.tmp")
    df.to_csv(tmp_path, index=False)
    tmp_path.replace(output_path)

    added = len(df) - previous_count if previous_count is not None else len(df)
    print(f"wrote {output_path} ({len(df)} rows, {added:+d} vs previous)")

    # 5. mirror to Google Sheets so Tableau Public can auto-refresh (DEC-006).
    # Best-effort: the local CSV above is already the source of truth, so a Sheets
    # hiccup (quota, network, misconfiguration) must not fail the whole run.
    try:
        url = push_dataframe(df, settings)
        print(f"synced to Google Sheets: {url}")
    except GSheetsNotConfigured as e:
        print(f"Google Sheets sync skipped (not configured): {e}")
    except Exception as e:
        print(f"WARNING: Google Sheets sync failed (local export still succeeded): {e}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
