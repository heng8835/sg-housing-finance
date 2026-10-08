"""OneMap geocoding with a persistent, append-only cache.

Geocodes unique "<block> <street_name> SINGAPORE" addresses via the OneMap search
API; results are cached in data/cache/hdb_address.csv so only addresses new since
the last run hit the API (BR-04).

Only successful geocodes are cached. Failures are left out of the cache entirely,
so every run retries them — the legacy notebook instead stored failures as null
rows, which made them permanent (BR-11, DEC-007).

Migrated from legacy/notebooks/HDB Resale Data Scraper.ipynb cells 2-4.
"""

from pathlib import Path

import pandas as pd
import requests

from hdb_pipeline import http
from hdb_pipeline.config import GEOCODE_DELAY_S, ONEMAP_SEARCH_URL, Settings

CACHE_COLUMNS = ["block", "street_name", "address_for_geocode", "latitude", "longitude"]

# HDB writes some street names with abbreviations OneMap's search cannot resolve.
# Only tokens that were observed failing are listed: RD/DR/AVE/CL/CRES/LANE etc.
# resolve fine and must NOT be expanded (BR-11).
STREET_ABBREVIATIONS = {
    "C'WEALTH": "COMMONWEALTH",
    "PK": "PARK",
    "KG": "KAMPONG",
    "MKT": "MARKET",
    "ST.": "SAINT",  # note: bare "ST" means STREET and is deliberately not mapped
}


def format_geocode_address(block: str, street_name: str) -> str:
    """Build the OneMap search string '<block> <street_name> SINGAPORE' (BR-04)."""
    return f"{str(block).strip()} {str(street_name).strip()} SINGAPORE"


def normalize_street_for_geocode(street_name: str) -> str:
    """Expand the HDB street abbreviations OneMap cannot resolve (BR-11).

    Whole-token replacement only, so 'HOUGANG ST 22' (ST = STREET) is untouched
    while 'ST. GEORGE'S RD' (ST. = SAINT) is expanded.
    """
    return " ".join(STREET_ABBREVIATIONS.get(t, t) for t in str(street_name).split())


def onemap_geocode(session: requests.Session, settings: Settings, address: str):
    """Return (lat, lon) from the top OneMap search result, or (None, None)."""
    response = http.get(
        session,
        ONEMAP_SEARCH_URL,
        settings,
        params={
            "searchVal": address,
            "returnGeom": "Y",
            "getAddrDetails": "Y",
            "pageNum": 1,
        },
    )
    results = response.json().get("results") or []
    if not results:
        return None, None
    top = results[0]
    return float(top["LATITUDE"]), float(top["LONGITUDE"])


def geocode_block_street(session: requests.Session, settings: Settings, block, street_name):
    """Geocode one address: try it as HDB writes it, then retry with abbreviations
    expanded (BR-11). Returns (lat, lon), or (None, None) if both attempts fail."""
    address = format_geocode_address(block, street_name)
    lat, lon = onemap_geocode(session, settings, address)
    if lat is not None:
        return lat, lon

    fallback = format_geocode_address(block, normalize_street_for_geocode(street_name))
    if fallback == address:
        return None, None

    http.sleep_politely(GEOCODE_DELAY_S)
    return onemap_geocode(session, settings, fallback)


def load_cache(cache_path: Path) -> pd.DataFrame:
    """Load the geocode cache; empty frame with the right columns if absent."""
    if Path(cache_path).exists():
        return pd.read_csv(cache_path, dtype={"block": str, "street_name": str})
    return pd.DataFrame(columns=CACHE_COLUMNS)


def add_coordinates(
    df: pd.DataFrame,
    session: requests.Session,
    settings: Settings,
    cache_path: Path,
    log=print,
) -> pd.DataFrame:
    """Add address_for_geocode/latitude/longitude to df (needs block, street_name).

    Only block+street pairs without cached coordinates are geocoded; successes are
    appended to the cache. Unresolved addresses are not written to the cache, so
    they are retried on the next run.
    """
    df = df.copy()
    df["block"] = df["block"].astype(str).str.strip()
    df["street_name"] = df["street_name"].astype(str).str.strip()
    df["address_for_geocode"] = [
        format_geocode_address(b, s) for b, s in zip(df["block"], df["street_name"])
    ]

    cache = load_cache(cache_path)
    # Legacy caches (from the notebook) stored failures as null-coordinate rows.
    # Drop them so they are retried rather than treated as known (DEC-007).
    resolved = cache[cache["latitude"].notna()].copy()
    dropped = len(cache) - len(resolved)
    if dropped:
        log(f"cache: dropping {dropped} unresolved legacy rows for retry")

    pairs = df[["block", "street_name"]].drop_duplicates()
    known = set(zip(resolved["block"], resolved["street_name"]))
    todo = pairs[
        [((b, s) not in known) for b, s in zip(pairs["block"], pairs["street_name"])]
    ]

    log(f"geocode: {len(pairs)} unique addresses, {len(todo)} to geocode")

    new_rows = []
    for i, (_, row) in enumerate(todo.iterrows(), start=1):
        lat, lon = geocode_block_street(session, settings, row["block"], row["street_name"])
        if lat is None:
            log(f"geocode MISS (will retry next run): {row['block']} {row['street_name']}")
            continue
        new_rows.append(
            {
                "block": row["block"],
                "street_name": row["street_name"],
                "address_for_geocode": format_geocode_address(row["block"], row["street_name"]),
                "latitude": lat,
                "longitude": lon,
            }
        )
        if i % 50 == 0 or i == len(todo):
            log(f"geocoded {i}/{len(todo)}")
        http.sleep_politely(GEOCODE_DELAY_S)

    if new_rows or dropped:
        if resolved.empty:
            cache = pd.DataFrame(new_rows, columns=CACHE_COLUMNS)
        else:
            cache = pd.concat([resolved, pd.DataFrame(new_rows)], ignore_index=True)
        Path(cache_path).parent.mkdir(parents=True, exist_ok=True)
        cache.to_csv(cache_path, index=False)
        log(f"cache updated: +{len(new_rows)} rows -> {len(cache)} total")
    else:
        cache = resolved

    coords = cache[["block", "street_name", "latitude", "longitude"]]
    return pd.merge(df, coords, on=["block", "street_name"], how="left")
