"""Resale transaction enrichment: zones, town centroids, floor area conversion.

Migrated from legacy/notebooks/HDB Resale Data Scraper.ipynb cells 6-8.
Behavior rules: BR-01 (zones), BR-02 (centroids), BR-03 (sqft conversion) in
docs/BUSINESS_RULES.md. Output schema is part of the Tableau contract (DEC-003).
"""

import pandas as pd

SQM_TO_SQFT = 10.76391041671

TOWN_CENTROIDS = {
    "ANG MO KIO": (1.3691, 103.8454),
    "BEDOK": (1.3236, 103.9273),
    "BISHAN": (1.3508, 103.8485),
    "BUKIT BATOK": (1.3491, 103.7496),
    "BUKIT MERAH": (1.2819, 103.8239),
    "BUKIT PANJANG": (1.3786, 103.7620),
    "BUKIT TIMAH": (1.3294, 103.8021),
    "CENTRAL AREA": (1.2903, 103.8510),
    "CHOA CHU KANG": (1.3840, 103.7440),
    "CLEMENTI": (1.3151, 103.7649),
    "GEYLANG": (1.3182, 103.8871),
    "HOUGANG": (1.3612, 103.8863),
    "JURONG EAST": (1.3326, 103.7436),
    "JURONG WEST": (1.3404, 103.7050),
    "KALLANG/WHAMPOA": (1.3114, 103.8620),
    "MARINE PARADE": (1.3025, 103.9074),
    "NOVENA": (1.3201, 103.8439),
    "PASIR RIS": (1.3721, 103.9474),
    "PUNGGOL": (1.4051, 103.9023),
    "QUEENSTOWN": (1.2942, 103.7861),
    "SEMBAWANG": (1.4491, 103.8185),
    "SENGKANG": (1.3868, 103.8914),
    "SERANGOON": (1.3554, 103.8677),
    "TAMPINES": (1.3526, 103.9447),
    "TOA PAYOH": (1.3343, 103.8563),
    "WOODLANDS": (1.4360, 103.7865),
    "YISHUN": (1.4304, 103.8354),
}

TOWN_TO_ZONE = {
    # Central
    "ANG MO KIO": "Central",
    "BISHAN": "Central",
    "BUKIT MERAH": "Central",
    "BUKIT TIMAH": "Central",
    "CENTRAL AREA": "Central",
    "GEYLANG": "Central",
    "KALLANG/WHAMPOA": "Central",
    "MARINE PARADE": "Central",
    "NOVENA": "Central",
    "QUEENSTOWN": "Central",
    "TOA PAYOH": "Central",
    # East
    "BEDOK": "East",
    "CHANGI": "East",
    "PASIR RIS": "East",
    "TAMPINES": "East",
    "PAYA LEBAR": "East",
    # North
    "SEMBAWANG": "North",
    "WOODLANDS": "North",
    "YISHUN": "North",
    # North-East
    "HOUGANG": "North-East",
    "PUNGGOL": "North-East",
    "SENGKANG": "North-East",
    "SERANGOON": "North-East",
    # West
    "BUKIT BATOK": "West",
    "BUKIT PANJANG": "West",
    "CHOA CHU KANG": "West",
    "CLEMENTI": "West",
    "JURONG EAST": "West",
    "JURONG WEST": "West",
}


def add_zone(df: pd.DataFrame) -> pd.DataFrame:
    """Add a 'zone' column from 'town' (BR-01). Unmapped towns become 'Unknown'."""
    df = df.copy()
    df["town"] = df["town"].str.upper().str.strip()
    df["zone"] = df["town"].map(TOWN_TO_ZONE).fillna("Unknown")
    return df


def add_town_centroids(df: pd.DataFrame, town_col: str = "town") -> pd.DataFrame:
    """Add 'town_lat'/'town_lon' columns from the static centroid map (BR-02)."""
    out = df.copy()
    out[town_col] = out[town_col].str.upper().str.strip()
    out["town_lat"] = out[town_col].map(lambda t: TOWN_CENTROIDS.get(t, (None, None))[0])
    out["town_lon"] = out[town_col].map(lambda t: TOWN_CENTROIDS.get(t, (None, None))[1])
    return out


def add_floor_area_sqft(df: pd.DataFrame) -> pd.DataFrame:
    """Cast floor_area_sqm to int (truncating, as in the notebook) and add
    floor_area_sqft = sqm * SQM_TO_SQFT rounded to 2 dp (BR-03)."""
    df = df.copy()
    df["floor_area_sqm"] = df["floor_area_sqm"].astype(float).astype(int)
    df["floor_area_sqft"] = (df["floor_area_sqm"] * SQM_TO_SQFT).round(2)
    return df
