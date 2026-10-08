"""Dagster assets for the resale flow: fetch -> geocode -> enrich -> export -> sync.

Each asset is a thin wrapper around the tested functions in src/hdb_pipeline/*
(DEC-009) — no business logic is duplicated here. This mirrors
pipelines/run_resale.py step for step; run_resale.py remains available for
quick manual/ad-hoc runs, while these assets are the scheduled + monitored path.
"""

import dagster as dg
import pandas as pd

from hdb_pipeline.config import get_settings
from hdb_pipeline.export.gsheets import GSheetsNotConfigured, push_dataframe
from hdb_pipeline.http import make_session
from hdb_pipeline.sources.geocode import add_coordinates
from hdb_pipeline.sources.resale import fetch_resale_transactions
from hdb_pipeline.transforms.enrich import add_floor_area_sqft, add_town_centroids, add_zone
from hdb_pipeline.validation.checks import RESALE_CONTRACT_COLUMNS, check_resale_transactions

OUTPUT_NAME = "resalebto_transactions.csv"

RESALE_GROUP = "resale"

# Asset keys are namespaced under hdb/ so the shared multi-project Dagster UI
# (<shared-dagster-deployment>) renders one folder per project instead of a flat list.
# Sister convention: the margin pipeline uses "margin". Group + job selection are
# unaffected (resale_job selects by GROUP, not by key).
KEY_PREFIX = "hdb"


def _ins(*names: str) -> dict:
    """Map input params to their hdb/-prefixed upstream keys — bare parameter
    names stop auto-resolving once a key_prefix is applied."""
    return {n: dg.AssetIn(key_prefix=KEY_PREFIX) for n in names}


@dg.asset(key_prefix=KEY_PREFIX, group_name=RESALE_GROUP,
          description="Raw resale transactions fetched from data.gov.sg.")
def raw_resale_transactions(context: dg.AssetExecutionContext) -> pd.DataFrame:
    settings = get_settings()
    session = make_session(settings)
    df = fetch_resale_transactions(session, settings, log=context.log.info)

    settings.raw_dir.mkdir(parents=True, exist_ok=True)
    df.to_csv(settings.raw_dir / "resale_transactions_raw.csv", index=False)

    context.add_output_metadata({"rows": len(df), "columns": len(df.columns)})
    return df


@dg.asset(
    key_prefix=KEY_PREFIX,
    group_name=RESALE_GROUP,
    ins=_ins("raw_resale_transactions"),
    description="Resale transactions with latitude/longitude added via cached OneMap geocoding (BR-04/BR-11).",
)
def geocoded_resale_transactions(
    context: dg.AssetExecutionContext, raw_resale_transactions: pd.DataFrame
) -> pd.DataFrame:
    settings = get_settings()
    session = make_session(settings)
    df = add_coordinates(
        raw_resale_transactions,
        session,
        settings,
        settings.cache_dir / "hdb_address.csv",
        log=context.log.info,
    )
    coverage = float(df["latitude"].notna().mean())
    context.add_output_metadata({"geocode_coverage": dg.MetadataValue.float(coverage)})
    return df


@dg.asset(
    key_prefix=KEY_PREFIX,
    group_name=RESALE_GROUP,
    ins=_ins("geocoded_resale_transactions"),
    description="Resale transactions enriched with zone, town centroid, and floor area in sqft (BR-01/02/03).",
)
def enriched_resale_transactions(geocoded_resale_transactions: pd.DataFrame) -> pd.DataFrame:
    df = add_zone(geocoded_resale_transactions)
    df = add_town_centroids(df)
    df = add_floor_area_sqft(df)
    return df[RESALE_CONTRACT_COLUMNS]


@dg.asset(
    key_prefix=KEY_PREFIX,
    group_name=RESALE_GROUP,
    ins=_ins("enriched_resale_transactions"),
    description="Validated resale dataset exported to data/processed/ (the Tableau contract, DEC-003).",
)
def resale_transactions_csv(
    context: dg.AssetExecutionContext, enriched_resale_transactions: pd.DataFrame
) -> pd.DataFrame:
    settings = get_settings()
    df = enriched_resale_transactions

    output_path = settings.processed_dir / OUTPUT_NAME
    previous_count = None
    if output_path.exists():
        previous_count = sum(1 for _ in open(output_path, encoding="utf-8")) - 1

    # Raises ValidationError (fails this asset's run) before anything is overwritten.
    summary = check_resale_transactions(df, previous_row_count=previous_count)

    settings.processed_dir.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        settings.interim_dir.mkdir(parents=True, exist_ok=True)
        backup = settings.interim_dir / "resalebto_transactions.previous.csv"
        backup.write_bytes(output_path.read_bytes())

    tmp_path = output_path.with_suffix(".csv.tmp")
    df.to_csv(tmp_path, index=False)
    tmp_path.replace(output_path)

    added = len(df) - previous_count if previous_count is not None else len(df)
    context.add_output_metadata(
        {
            "rows": summary["rows"],
            "months": f"{summary['months'][0]} to {summary['months'][1]}",
            "geocode_coverage": dg.MetadataValue.float(summary["geocode_coverage"]),
            "towns": summary["towns"],
            "rows_added": added,
            "path": dg.MetadataValue.path(str(output_path)),
        }
    )
    return df


@dg.asset(
    key_prefix=KEY_PREFIX,
    group_name=RESALE_GROUP,
    ins=_ins("resale_transactions_csv"),
    description=(
        "Mirrors resale_transactions_csv to Google Sheets so Tableau Public can "
        "auto-refresh (DEC-006/DEC-008). Fails visibly on a real sync error; only "
        "a missing configuration is treated as a soft skip."
    ),
)
def resale_transactions_gsheets(
    context: dg.AssetExecutionContext, resale_transactions_csv: pd.DataFrame
) -> None:
    settings = get_settings()
    try:
        url = push_dataframe(resale_transactions_csv, settings, log=context.log.info)
    except GSheetsNotConfigured as e:
        context.log.warning(f"Google Sheets sync skipped (not configured): {e}")
        context.add_output_metadata({"status": dg.MetadataValue.text("skipped_not_configured")})
        return
    context.add_output_metadata(
        {"status": dg.MetadataValue.text("synced"), "sheet_url": dg.MetadataValue.url(url)}
    )
