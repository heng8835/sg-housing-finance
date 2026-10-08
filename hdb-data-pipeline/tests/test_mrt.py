import pandas as pd
import pytest

from hdb_pipeline.sources.mrt import (
    STATION_LINE_MAP,
    expand_station_lines,
    station_centroids,
)


def exits_fixture():
    return pd.DataFrame(
        {
            "station_name": [
                "BISHAN MRT STATION", "BISHAN MRT STATION",
                " HOUGANG MRT STATION ",  # untrimmed on purpose
                "BISHAN MRT STATION",
            ],
            "exit_code": ["A", "B", "A", "C"],
            "lat": [1.35, 1.36, 1.3712, 1.34],
            "lon": [103.84, 103.85, 103.8863, 103.86],
        }
    )


def test_station_centroids_mean_and_exit_count():
    out = station_centroids(exits_fixture()).set_index("station_name")
    bishan = out.loc["BISHAN MRT STATION"]
    assert bishan["centroid_lat"] == pytest.approx((1.35 + 1.36 + 1.34) / 3)
    assert bishan["exits_count"] == 3
    # station name is trimmed
    assert "HOUGANG MRT STATION" in out.index


def test_station_centroids_drops_missing_coords():
    extra = pd.DataFrame(
        {"station_name": ["NOWHERE STATION"], "exit_code": ["A"],
         "lat": [float("nan")], "lon": [float("nan")]}
    )
    df = pd.concat([exits_fixture(), extra], ignore_index=True)
    out = station_centroids(df)
    assert "NOWHERE STATION" not in set(out["station_name"])


def test_expand_station_lines_multi_line_station():
    centroids = station_centroids(exits_fixture())
    out = expand_station_lines(centroids)
    bishan = out[out["station_name"] == "BISHAN MRT STATION"]
    assert set(bishan["station_code"]) == {"NS17", "CC15"}
    assert set(bishan["line"]) == {"NS", "CC"}
    # centroid carried onto every expanded row
    assert bishan["centroid_lat"].nunique() == 1


def test_expand_station_lines_line_id_first_appearance_order():
    centroids = station_centroids(exits_fixture())
    out = expand_station_lines(centroids)
    first_line = out.loc[0, "line"]
    assert out.loc[0, "line_id"] == 1
    assert (out[out["line"] == first_line]["line_id"] == 1).all()


def test_expand_station_lines_unmapped_station_dropped():
    centroids = pd.DataFrame(
        {
            "station_name": ["BISHAN MRT STATION", "FUTURE STATION"],
            "centroid_lat": [1.35, 1.40],
            "centroid_lon": [103.85, 103.90],
            "exits_count": [3, 1],
        }
    )
    out = expand_station_lines(centroids)
    assert "FUTURE STATION" not in set(out["station_name"])


def test_station_line_map_sengkang_includes_lrt_codes():
    # The legacy notebook defined SENGKANG twice; the surviving definition
    # includes both the NE line and the Sengkang LRT loop codes.
    codes = {m["code"] for m in STATION_LINE_MAP["SENGKANG MRT STATION"]}
    assert codes == {"NE16", "SW0", "SW9", "SE0", "SE6"}
