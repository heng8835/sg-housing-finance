import pandas as pd

from hdb_pipeline.transforms.enrich import (
    SQM_TO_SQFT,
    TOWN_CENTROIDS,
    TOWN_TO_ZONE,
    add_floor_area_sqft,
    add_town_centroids,
    add_zone,
)


def test_add_zone_known_towns():
    df = pd.DataFrame({"town": ["HOUGANG", "BEDOK", "WOODLANDS", "CLEMENTI", "BISHAN"]})
    out = add_zone(df)
    assert list(out["zone"]) == ["North-East", "East", "North", "West", "Central"]


def test_add_zone_normalizes_case_and_whitespace():
    df = pd.DataFrame({"town": ["  hougang ", "kallang/whampoa"]})
    out = add_zone(df)
    assert list(out["town"]) == ["HOUGANG", "KALLANG/WHAMPOA"]
    assert list(out["zone"]) == ["North-East", "Central"]


def test_add_zone_unknown_town():
    df = pd.DataFrame({"town": ["ATLANTIS"]})
    out = add_zone(df)
    assert out.loc[0, "zone"] == "Unknown"


def test_add_zone_does_not_mutate_input():
    df = pd.DataFrame({"town": ["hougang"]})
    add_zone(df)
    assert df.loc[0, "town"] == "hougang"


def test_every_centroid_town_has_a_zone():
    missing = [t for t in TOWN_CENTROIDS if t not in TOWN_TO_ZONE]
    assert missing == []


def test_add_town_centroids_known_and_unknown():
    df = pd.DataFrame({"town": ["hougang", "ATLANTIS"]})
    out = add_town_centroids(df)
    assert out.loc[0, "town_lat"] == 1.3612
    assert out.loc[0, "town_lon"] == 103.8863
    assert pd.isna(out.loc[1, "town_lat"])
    assert pd.isna(out.loc[1, "town_lon"])


def test_add_floor_area_sqft_conversion_and_rounding():
    df = pd.DataFrame({"floor_area_sqm": ["100", "44"]})
    out = add_floor_area_sqft(df)
    assert out.loc[0, "floor_area_sqft"] == round(100 * SQM_TO_SQFT, 2)  # 1076.39
    assert out.loc[1, "floor_area_sqft"] == round(44 * SQM_TO_SQFT, 2)


def test_add_floor_area_sqft_truncates_fractional_sqm():
    # Legacy behavior (BR-03): float -> int cast truncates, 67.7 becomes 67.
    df = pd.DataFrame({"floor_area_sqm": ["67.7"]})
    out = add_floor_area_sqft(df)
    assert out.loc[0, "floor_area_sqm"] == 67
    assert out.loc[0, "floor_area_sqft"] == round(67 * SQM_TO_SQFT, 2)
