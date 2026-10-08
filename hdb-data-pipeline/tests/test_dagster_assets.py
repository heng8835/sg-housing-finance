"""Verifies the Dagster asset graph itself (dependency wiring, metadata, the
export -> gsheets hookup) with all network/IO functions mocked. The underlying
business logic is already covered in test_resale.py, test_geocode_cache.py,
test_checks.py, and test_gsheets.py — this file protects the orchestration layer.
"""

import pandas as pd
import pytest
from dagster import materialize

from dagster_project import assets as assets_module
from hdb_pipeline.config import Settings
from hdb_pipeline.validation.checks import RESALE_CONTRACT_COLUMNS

ALL_ASSETS = [
    assets_module.raw_resale_transactions,
    assets_module.geocoded_resale_transactions,
    assets_module.enriched_resale_transactions,
    assets_module.resale_transactions_csv,
    assets_module.resale_transactions_gsheets,
]


def fake_settings(tmp_path, gsheets_sheet_id=None):
    for d in ["raw", "interim", "processed", "cache"]:
        (tmp_path / d).mkdir()
    return Settings(
        proxy_url=None,
        data_dir=tmp_path,
        timeout_s=30,
        gsheets_key_file=tmp_path / "no-such-key.json",
        gsheets_sheet_id=gsheets_sheet_id,
    )


def raw_fixture_df():
    return pd.DataFrame(
        {
            "_id": [1, 2],
            "month": ["2024-05", "2024-05"],
            "town": ["bedok", "hougang"],
            "flat_type": ["4 ROOM", "4 ROOM"],
            "block": ["123", "456"],
            "street_name": ["BEDOK NORTH RD", "HOUGANG AVE 3"],
            "storey_range": ["04 TO 06", "07 TO 09"],
            "floor_area_sqm": ["92", "90"],
            "flat_model": ["New Generation", "New Generation"],
            "lease_commence_date": [1980, 1985],
            "remaining_lease": ["55 years", "60 years"],
            "resale_price": [500000, 510000],
        }
    )


def fake_add_coordinates(df, session, s, cache_path, log=print):
    df = df.copy()
    df["address_for_geocode"] = df["block"] + " " + df["street_name"] + " SINGAPORE"
    df["latitude"] = [1.32, 1.36]
    df["longitude"] = [103.92, 103.89]
    return df


@pytest.fixture
def wired(monkeypatch, tmp_path):
    """Mocks fetch/geocode/settings/session; leaves push_dataframe (gsheets) real
    so its own success/skip logic is exercised in-process, not re-mocked away."""
    settings = fake_settings(tmp_path)
    monkeypatch.setattr(assets_module, "get_settings", lambda: settings)
    monkeypatch.setattr(assets_module, "make_session", lambda s: object())
    monkeypatch.setattr(
        assets_module, "fetch_resale_transactions", lambda session, s, log=print: raw_fixture_df()
    )
    monkeypatch.setattr(assets_module, "add_coordinates", fake_add_coordinates)
    return settings


def test_full_asset_graph_materializes_and_gsheets_skips_when_unconfigured(wired):
    settings = wired
    result = materialize(ALL_ASSETS)
    assert result.success

    output_csv = settings.processed_dir / assets_module.OUTPUT_NAME
    assert output_csv.exists()
    written = pd.read_csv(output_csv)
    assert len(written) == 2
    assert list(written.columns) == RESALE_CONTRACT_COLUMNS
    assert written.loc[0, "zone"] == "East"  # BEDOK -> East, proves enrich ran

    # Asset keys are namespaced (KEY_PREFIX), so the op node name is
    # "<prefix>__<asset>" — derive it rather than hardcoding the prefix.
    gsheets_output = result.output_for_node(
        f"{assets_module.KEY_PREFIX}__resale_transactions_gsheets"
    )
    assert gsheets_output is None  # asset returns None; real push_dataframe skipped (no sheet id)


def test_gsheets_push_receives_the_exported_dataframe(wired, monkeypatch):
    settings = wired
    pushed = {}

    def fake_push_dataframe(df, s, log=print):
        pushed["rows"] = len(df)
        pushed["columns"] = list(df.columns)
        return "https://docs.google.com/spreadsheets/d/fake"

    monkeypatch.setattr(assets_module, "push_dataframe", fake_push_dataframe)

    result = materialize(ALL_ASSETS)
    assert result.success
    assert pushed["rows"] == 2
    assert pushed["columns"] == RESALE_CONTRACT_COLUMNS


def test_raw_snapshot_written_to_raw_dir(wired):
    settings = wired
    result = materialize([assets_module.raw_resale_transactions])
    assert result.success
    assert (settings.raw_dir / "resale_transactions_raw.csv").exists()


def test_gsheets_asset_fails_visibly_on_a_real_sync_error(wired, monkeypatch):
    """A misconfiguration (GSheetsNotConfigured) is a soft skip, but any other
    error from push_dataframe must fail the asset run, not be swallowed."""

    def boom(df, s, log=print):
        raise RuntimeError("simulated network failure")

    monkeypatch.setattr(assets_module, "push_dataframe", boom)

    result = materialize(ALL_ASSETS, raise_on_error=False)
    assert not result.success
