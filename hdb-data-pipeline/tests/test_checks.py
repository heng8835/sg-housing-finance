import pandas as pd
import pytest

from hdb_pipeline.validation.checks import (
    RESALE_CONTRACT_COLUMNS,
    ValidationError,
    check_resale_transactions,
)


def valid_df(n=3):
    rows = []
    for i in range(n):
        rows.append(
            {
                "_id": i + 1,
                "month": "2024-05",
                "town": "BEDOK",
                "flat_type": "4 ROOM",
                "block": "123",
                "street_name": "BEDOK NORTH RD",
                "storey_range": "04 TO 06",
                "floor_area_sqm": 92,
                "flat_model": "New Generation",
                "lease_commence_date": 1980,
                "remaining_lease": "55 years",
                "resale_price": 500000 + i,
                "address_for_geocode": "123 BEDOK NORTH RD SINGAPORE",
                "latitude": 1.32,
                "longitude": 103.92,
                "zone": "East",
                "town_lat": 1.3236,
                "town_lon": 103.9273,
                "floor_area_sqft": 990.28,
            }
        )
    return pd.DataFrame(rows).reindex(columns=RESALE_CONTRACT_COLUMNS)


def test_valid_frame_passes_and_summarizes():
    summary = check_resale_transactions(valid_df(), previous_row_count=2)
    assert summary["rows"] == 3
    assert summary["months"] == ("2024-05", "2024-05")
    assert summary["geocode_coverage"] == 1.0


def test_missing_column_fails():
    df = valid_df().drop(columns=["zone"])
    with pytest.raises(ValidationError, match="missing contract columns"):
        check_resale_transactions(df)


def test_row_count_drop_fails():
    with pytest.raises(ValidationError, match="row count dropped"):
        check_resale_transactions(valid_df(3), previous_row_count=10)


def test_duplicate_id_fails():
    df = valid_df()
    df.loc[1, "_id"] = df.loc[0, "_id"]
    with pytest.raises(ValidationError, match="duplicate _id"):
        check_resale_transactions(df)


def test_malformed_month_fails():
    df = valid_df()
    df.loc[0, "month"] = "May 2024"
    with pytest.raises(ValidationError, match="malformed month"):
        check_resale_transactions(df)


def test_bad_price_fails():
    df = valid_df()
    df["resale_price"] = df["resale_price"].astype(object)
    df.loc[0, "resale_price"] = "not a number"
    with pytest.raises(ValidationError, match="non-numeric resale_price"):
        check_resale_transactions(df)


def test_low_geocode_coverage_fails():
    df = valid_df(20)
    df.loc[:2, "latitude"] = None  # 3/20 missing -> 85% < 95%
    with pytest.raises(ValidationError, match="geocode coverage"):
        check_resale_transactions(df)


def test_unknown_zone_names_the_town():
    df = valid_df()
    df.loc[0, "zone"] = "Unknown"
    df.loc[0, "town"] = "NEWTOWN"
    with pytest.raises(ValidationError, match="NEWTOWN"):
        check_resale_transactions(df)


def test_empty_frame_fails():
    with pytest.raises(ValidationError, match="empty"):
        check_resale_transactions(valid_df(0))
