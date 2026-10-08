"""Future MRT/LRT lines & stations -> app/data/future_rail.js (window.HDB_FUTURE).

Station positions: URA Master Plan 2025 "Rail Station Layer" (data.gov.sg) — polygons for
every existing AND planned station (272). A station is "future" when its name is not in
the pipeline's current station list (data/processed/mrt_station_centroid.csv).

Line membership/order/opening years are NOT in any open dataset, so they are curated
below from LTA's published plans (Cross Island Line phases, Jurong Region Line, TEL/DTL
extensions, NSL infill stations, CCL stage 6). Update FUTURE_LINES when LTA announces
changes; stations that can't be matched are reported so the name can be fixed.

Run:  python fetch_future_rail.py        (from tools/)
"""

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_poi import geojson, prop, session  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "app" / "data" / "future_rail.js"
CENTROIDS = HERE.parent / "hdb-data-pipeline" / "data" / "processed" / "mrt_station_centroid.csv"
MP25_STATIONS = "d_2c06c9fe8ae724b5d33efa1f203e2c38"

# (id, display name, colour, status, opening year, ordered station names)
FUTURE_LINES = [
    ("CRL1", "Cross Island Line — Phase 1", "#97c616", "under construction", 2030,
     ["AVIATION PARK", "LOYANG", "PASIR RIS EAST", "PASIR RIS", "TAMPINES NORTH", "DEFU", "HOUGANG", "SERANGOON NORTH", "TAVISTOCK", "ANG MO KIO", "TECK GHEE", "BRIGHT HILL"]),
    ("CRL2", "Cross Island Line — Phase 2", "#97c616", "under construction", 2032,
     ["BRIGHT HILL", "TURF CITY", "KING ALBERT PARK", "MAJU", "CLEMENTI", "WEST COAST", "JURONG LAKE DISTRICT"]),
    ("CRLe", "Cross Island Line — Punggol extension", "#97c616", "under construction", 2032,
     ["PASIR RIS", "ELIAS", "RIVIERA", "PUNGGOL"]),
    ("JRL-W", "Jurong Region Line — West branch", "#0099aa", "under construction", 2027,
     ["CHOA CHU KANG", "CHOA CHU KANG WEST", "TENGAH", "HONG KAH", "CORPORATION", "JURONG WEST", "BAHAR JUNCTION", "BOON LAY", "ENTERPRISE", "TUKANG", "JURONG HILL", "JURONG PIER"]),
    ("JRL-E", "Jurong Region Line — East branch", "#0099aa", "under construction", 2028,
     ["TENGAH", "TENGAH PLANTATION", "TENGAH PARK", "BUKIT BATOK WEST", "TOH GUAN", "JURONG EAST", "JURONG TOWN HALL", "PANDAN RESERVOIR"]),
    ("JRL-N", "Jurong Region Line — NTU branch", "#0099aa", "under construction", 2029,
     ["BAHAR JUNCTION", "GEK POH", "TAWAS", "NANYANG GATEWAY", "NANYANG CRESCENT", "PENG KANG HILL"]),
    ("TEL5", "Thomson–East Coast Line — Stage 5", "#9d5b25", "under construction", 2026,
     ["BAYSHORE", "BEDOK SOUTH", "SUNGEI BEDOK"]),
    ("TELx", "Thomson–East Coast Line — Changi Airport extension", "#9d5b25", "planned", 2032,
     ["SUNGEI BEDOK", "CHANGI AIRPORT TERMINAL 5", "CHANGI AIRPORT"]),
    ("DTL3e", "Downtown Line — Stage 3 extension", "#005ec4", "under construction", 2026,
     ["EXPO", "XILIN", "SUNGEI BEDOK"]),
    ("CCL6", "Circle Line — Stage 6 (closing the loop)", "#fa9e0d", "under construction", 2026,
     ["HARBOURFRONT", "KEPPEL", "CANTONMENT", "PRINCE EDWARD ROAD", "MARINA BAY"]),
    ("NSL-B", "North–South Line — Brickland infill", "#d42e12", "planned", 2034,
     ["BUKIT GOMBAK", "BRICKLAND", "CHOA CHU KANG"]),
    ("NSL-K", "North–South Line — Sungei Kadut infill", "#d42e12", "planned", 2035,
     ["YEW TEE", "SUNGEI KADUT", "KRANJI"]),
    ("TEL-MP", "Thomson–East Coast Line — Mount Pleasant infill", "#9d5b25", "under construction", 2027,
     ["CALDECOTT", "MOUNT PLEASANT", "STEVENS"]),
    ("TEL-FM", "Thomson–East Coast Line — Founders' Memorial", "#9d5b25", "under construction", 2026,
     ["TANJONG RHU", "FOUNDERS' MEMORIAL", "GARDENS BY THE BAY"]),
    ("DTL-H", "Downtown Line — Hume (opened 2025)", "#005ec4", "open", 2025,
     ["BEAUTY WORLD", "HUME", "HILLVIEW"]),
    ("NEL-PC", "North East Line — Punggol Coast (opened 2024)", "#9900aa", "open", 2024,
     ["PUNGGOL", "PUNGGOL COAST"]),
]
ALIASES = {"CHANGI TERMINAL 5": "CHANGI AIRPORT TERMINAL 5", "NS6": "SUNGEI KADUT", "JELEPANG": "JELAPANG", "GARDEN BY THE BAY": "GARDENS BY THE BAY", "ONE NORTH": "ONE-NORTH", "BEACH": "BEACH ROAD"}


def norm(name: str) -> str:
    n = name.upper().strip()
    n = re.sub(r"\s+(MRT|LRT)\s+STATION$", "", n)
    n = re.sub(r"\s+STATION$", "", n)
    n = re.sub(r"\s+INTERCHANGE$", "", n)
    n = re.sub(r"\s+", " ", n)
    return ALIASES.get(n, n)


def main() -> int:
    s = session()
    cent = pd.read_csv(CENTROIDS)
    existing = {}
    for n, g in cent.groupby("station_name"):
        existing[norm(n)] = (float(g.centroid_lat.iloc[0]), float(g.centroid_lon.iloc[0]))

    gj = geojson(s, MP25_STATIONS)
    mp = {}
    for f in gj.get("features", []):
        name = norm(prop(f.get("properties", {}), "NAME"))
        g = f.get("geometry") or {}
        rings = g["coordinates"] if g.get("type") == "Polygon" else [r for poly in g.get("coordinates", []) for r in poly]
        pts = [p for ring in rings for p in ring]
        if not name or not pts:
            continue
        lat = sum(p[1] for p in pts) / len(pts)
        lon = sum(p[0] for p in pts) / len(pts)
        mp.setdefault(name, []).append((lat, lon, f["properties"].get("RAIL_TYPE", "MRT")))
    mp = {n: (sum(p[0] for p in v) / len(v), sum(p[1] for p in v) / len(v), v[0][2]) for n, v in mp.items()}
    print(f"MP2025 stations: {len(mp)} distinct names; existing in pipeline: {len(existing)}")

    stations, idx = [], {}
    def station(name):
        if name in idx:
            return idx[name]
        if name in existing:
            lat, lon = existing[name]; fut = False
        elif name in mp:
            lat, lon, _ = mp[name]; fut = True
        else:
            return None
        idx[name] = len(stations)
        stations.append({"n": name.title(), "lat": round(lat, 6), "lon": round(lon, 6), "future": fut, "lines": []})
        return idx[name]

    lines, missing = [], []
    for lid, lname, color, status, year, names in FUTURE_LINES:
        st = []
        for n in names:
            i = station(n)
            if i is None:
                missing.append(f"{lid}: {n}")
                continue
            st.append(i)
            stations[i]["lines"].append(lid)
        lines.append({"id": lid, "name": lname, "color": color, "status": status, "year": year, "st": st})
    for st in stations:
        if st["future"]:
            st["year"] = min(l["year"] for l in lines if l["id"] in st["lines"])
            st["status"] = "planned" if all(l["status"] == "planned" for l in lines if l["id"] in st["lines"]) else "under construction"
    # planned stations in MP2025 not covered by any curated line (e.g. lines beyond 2035)
    SKIP = {"IMBIAH", "RESORTS WORLD", "DE1", "DE2"}  # Sentosa monorail / unnamed placeholders
    unlisted = sorted(n for n in mp if n not in existing and n not in idx and n not in SKIP)
    for n in unlisted:
        lat, lon, rt = mp[n]
        stations.append({"n": n.title(), "lat": round(lat, 6), "lon": round(lon, 6), "future": True, "lines": [], "status": "safeguarded (line not yet curated)", "year": None})

    payload = {"stations": stations, "lines": lines, "generated_at": datetime.now(timezone.utc).astimezone().isoformat(timespec="minutes")}
    OUT.write_text("window.HDB_FUTURE=" + json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + ";", encoding="utf-8")
    nf = sum(1 for x in stations if x["future"])
    print(f"wrote {OUT.name}: {len(lines)} future line segments, {nf} future stations ({len(unlisted)} safeguarded/unlisted), {len(stations) - nf} existing interchange stations")
    if missing:
        print("NOT MATCHED (fix names in FUTURE_LINES):", "; ".join(missing))
    if unlisted:
        print("unlisted MP2025 stations:", ", ".join(unlisted))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
