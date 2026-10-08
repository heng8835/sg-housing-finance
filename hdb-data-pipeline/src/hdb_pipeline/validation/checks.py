"""Data-quality checks run before anything is exported (schemas: docs/DATA_MODEL.md).

A failed check raises ValidationError so the runner aborts BEFORE overwriting the
Tableau-facing files in data/processed/.
"""

import pandas as pd

RESALE_CONTRACT_COLUMNS = [
    "_id", "month", "town", "flat_type", "block", "street_name", "storey_range",
    "floor_area_sqm", "flat_model", "lease_commence_date", "remaining_lease",
    "resale_price", "address_for_geocode", "latitude", "longitude", "zone",
    "town_lat", "town_lon", "floor_area_sqft",
]

MIN_GEOCODE_COVERAGE = 0.95


class ValidationError(Exception):
    """Raised when a dataset fails validation; message lists every failure."""


def check_resale_transactions(
    df: pd.DataFrame,
    previous_row_count: int | None = None,
) -> dict:
    """Validate the enriched resale transactions frame against the Tableau contract.

    Returns a summary dict on success; raises ValidationError listing all failures.
    """
    failures = []

    missing = [c for c in RESALE_CONTRACT_COLUMNS if c not in df.columns]
    if missing:
        failures.append(f"missing contract columns: {missing}")

    if len(df) == 0:
        failures.append("dataset is empty")

    if previous_row_count is not None and len(df) < previous_row_count:
        failures.append(
            f"row count dropped: {len(df)} < previous {previous_row_count} "
            "(source revisions should only add rows)"
        )

    if "_id" in df.columns and df["_id"].duplicated().any():
        failures.append(f"duplicate _id values: {int(df['_id'].duplicated().sum())}")

    if "month" in df.columns:
        bad_months = ~df["month"].astype(str).str.match(r"^\d{4}-\d{2}$")
        if bad_months.any():
            failures.append(f"malformed month values: {int(bad_months.sum())}")

    if "resale_price" in df.columns:
        prices = pd.to_numeric(df["resale_price"], errors="coerce")
        if prices.isna().any():
            failures.append(f"non-numeric resale_price: {int(prices.isna().sum())}")
        elif (prices <= 0).any():
            failures.append(f"non-positive resale_price: {int((prices <= 0).sum())}")

    geocode_coverage = None
    if {"latitude", "longitude"}.issubset(df.columns) and len(df):
        geocode_coverage = float(df["latitude"].notna().mean())
        if geocode_coverage < MIN_GEOCODE_COVERAGE:
            failures.append(
                f"geocode coverage {geocode_coverage:.1%} < {MIN_GEOCODE_COVERAGE:.0%}"
            )

    unknown_towns: list[str] = []
    if {"zone", "town"}.issubset(df.columns):
        unknown_towns = sorted(df.loc[df["zone"] == "Unknown", "town"].unique())
        if unknown_towns:
            failures.append(
                f"towns with no zone mapping (extend TOWN_TO_ZONE): {unknown_towns}"
            )

    if failures:
        raise ValidationError("; ".join(failures))

    return {
        "rows": len(df),
        "months": (df["month"].min(), df["month"].max()),
        "geocode_coverage": geocode_coverage,
        "towns": int(df["town"].nunique()),
    }
