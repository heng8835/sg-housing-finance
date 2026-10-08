from pathlib import Path

import pandas as pd

from hdb_pipeline.config import Settings
from hdb_pipeline.sources.geocode import (
    add_coordinates,
    geocode_block_street,
    load_cache,
    normalize_street_for_geocode,
)


def settings():
    return Settings(proxy_url=None, data_dir=Path("data"), timeout_s=30)


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


class FakeOneMapSession:
    """Returns fixed coords per address; empty results for addresses in `misses`."""

    def __init__(self, misses=()):
        self.misses = set(misses)
        self.geocoded = []

    def get(self, url, params=None, **kwargs):
        address = params["searchVal"]
        self.geocoded.append(address)
        if address in self.misses:
            return FakeResponse({"results": []})
        return FakeResponse(
            {"results": [{"LATITUDE": "1.3500", "LONGITUDE": "103.8500"}]}
        )


def seed_cache(path: Path):
    pd.DataFrame(
        {
            "block": ["406"],
            "street_name": ["ANG MO KIO AVE 10"],
            "address_for_geocode": ["406 ANG MO KIO AVE 10 SINGAPORE"],
            "latitude": [1.362],
            "longitude": [103.8538],
        }
    ).to_csv(path, index=False)


def test_cached_addresses_are_not_geocoded_again(tmp_path):
    cache_path = tmp_path / "cache.csv"
    seed_cache(cache_path)
    session = FakeOneMapSession()

    df = pd.DataFrame({"block": ["406"], "street_name": ["ANG MO KIO AVE 10"]})
    out = add_coordinates(df, session, settings(), cache_path, log=lambda m: None)

    assert session.geocoded == []  # cache hit, no API call
    assert out.loc[0, "latitude"] == 1.362


def test_new_addresses_geocoded_and_appended_to_cache(tmp_path):
    cache_path = tmp_path / "cache.csv"
    seed_cache(cache_path)
    session = FakeOneMapSession()

    df = pd.DataFrame(
        {
            "block": ["406", "15", "15"],  # one cached, one new (appearing twice)
            "street_name": ["ANG MO KIO AVE 10", "HOUGANG AVE 3", "HOUGANG AVE 3"],
        }
    )
    out = add_coordinates(df, session, settings(), cache_path, log=lambda m: None)

    assert session.geocoded == ["15 HOUGANG AVE 3 SINGAPORE"]  # deduped, cache-aware
    assert out["latitude"].notna().all()

    cache_after = load_cache(cache_path)
    assert len(cache_after) == 2
    assert "15" in set(cache_after["block"])


def test_failed_geocode_not_cached_and_left_nan(tmp_path):
    cache_path = tmp_path / "cache.csv"
    seed_cache(cache_path)
    session = FakeOneMapSession(misses={"999 NOWHERE RD SINGAPORE"})

    df = pd.DataFrame({"block": ["999"], "street_name": ["NOWHERE RD"]})
    out = add_coordinates(df, session, settings(), cache_path, log=lambda m: None)

    assert pd.isna(out.loc[0, "latitude"])
    cache_after = load_cache(cache_path)
    assert "999" not in set(cache_after["block"])  # will retry next run


def test_missing_cache_file_starts_empty(tmp_path):
    cache_path = tmp_path / "does_not_exist.csv"
    session = FakeOneMapSession()

    df = pd.DataFrame({"block": ["15"], "street_name": ["HOUGANG AVE 3"]})
    out = add_coordinates(df, session, settings(), cache_path, log=lambda m: None)

    assert out.loc[0, "latitude"] == 1.35
    assert cache_path.exists()
    assert len(load_cache(cache_path)) == 1


class TestNormalizeStreet:
    def test_expands_broken_abbreviations(self):
        assert normalize_street_for_geocode("C'WEALTH DR") == "COMMONWEALTH DR"
        assert normalize_street_for_geocode("FARRER PK RD") == "FARRER PARK RD"
        assert normalize_street_for_geocode("KG KAYU RD") == "KAMPONG KAYU RD"
        assert normalize_street_for_geocode("NEW MKT RD") == "NEW MARKET RD"
        assert normalize_street_for_geocode("ST. GEORGE'S RD") == "SAINT GEORGE'S RD"

    def test_leaves_working_abbreviations_alone(self):
        # these resolve fine in OneMap and must not be touched
        for street in ["ANG MO KIO AVE 10", "BEDOK NORTH RD", "HOUGANG ST 22",
                       "C'WEALTH CRES", "TAMPINES ST 11"]:
            normalized = normalize_street_for_geocode(street)
            assert "STREET" not in normalized  # bare ST stays ST (= street)
        assert normalize_street_for_geocode("HOUGANG ST 22") == "HOUGANG ST 22"

    def test_only_whole_tokens_replaced(self):
        # 'PK' inside a longer token must not be expanded
        assert normalize_street_for_geocode("PKING RD") == "PKING RD"


class FallbackSession:
    """Misses the raw address, hits only the normalized one."""

    def __init__(self, hit_address):
        self.hit_address = hit_address
        self.tried = []

    def get(self, url, params=None, **kwargs):
        address = params["searchVal"]
        self.tried.append(address)
        if address == self.hit_address:
            return FakeResponse({"results": [{"LATITUDE": "1.3056", "LONGITUDE": "103.8007"}]})
        return FakeResponse({"results": []})


def test_geocode_falls_back_to_normalized_address():
    session = FallbackSession("94 COMMONWEALTH DR SINGAPORE")
    lat, lon = geocode_block_street(session, settings(), "94", "C'WEALTH DR")

    assert (lat, lon) == (1.3056, 103.8007)
    assert session.tried == ["94 C'WEALTH DR SINGAPORE", "94 COMMONWEALTH DR SINGAPORE"]


def test_geocode_skips_fallback_when_normalization_changes_nothing():
    session = FallbackSession("never matches")
    lat, lon = geocode_block_street(session, settings(), "406", "ANG MO KIO AVE 10")

    assert (lat, lon) == (None, None)
    assert session.tried == ["406 ANG MO KIO AVE 10 SINGAPORE"]  # no wasted second call


def test_legacy_null_cache_rows_are_retried_and_healed(tmp_path):
    """The notebook cached failures as null rows, making them permanent (DEC-007)."""
    cache_path = tmp_path / "cache.csv"
    pd.DataFrame(
        {
            "block": ["406", "94"],
            "street_name": ["ANG MO KIO AVE 10", "C'WEALTH DR"],
            "address_for_geocode": ["406 ANG MO KIO AVE 10 SINGAPORE", "94 C'WEALTH DR SINGAPORE"],
            "latitude": [1.362, None],  # second row is a legacy failure
            "longitude": [103.8538, None],
        }
    ).to_csv(cache_path, index=False)

    session = FallbackSession("94 COMMONWEALTH DR SINGAPORE")
    df = pd.DataFrame(
        {"block": ["406", "94"], "street_name": ["ANG MO KIO AVE 10", "C'WEALTH DR"]}
    )
    out = add_coordinates(df, session, settings(), cache_path, log=lambda m: None)

    # the null row was retried (and resolved via fallback); the good row was not re-fetched
    assert "406 ANG MO KIO AVE 10 SINGAPORE" not in session.tried
    assert out.loc[1, "latitude"] == 1.3056

    healed = load_cache(cache_path)
    assert healed["latitude"].notna().all()  # no null rows left behind
    assert len(healed) == 2


def test_address_for_geocode_always_populated_even_when_geocode_fails(tmp_path):
    cache_path = tmp_path / "cache.csv"
    session = FakeOneMapSession(misses={"999 NOWHERE RD SINGAPORE"})

    df = pd.DataFrame({"block": ["999"], "street_name": ["NOWHERE RD"]})
    out = add_coordinates(df, session, settings(), cache_path, log=lambda m: None)

    assert out.loc[0, "address_for_geocode"] == "999 NOWHERE RD SINGAPORE"
    assert pd.isna(out.loc[0, "latitude"])
