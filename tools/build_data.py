"""Build app/data/data.js from the pipeline's processed resale CSV + MRT files.

Output is a single JS file assigning window.HDB_DATA so index.html works from file://
(no server). Transactions are stored column-wise with dictionary-encoded strings and a
block lookup table to keep the file ~10 MB for ~240k rows.

Run:  python build_data.py            (from tools/)
"""

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
PROCESSED = HERE.parent / "hdb-data-pipeline" / "data" / "processed"
TX_CSV = PROCESSED / "resalebto_transactions.csv"
MRT_EXITS_CSV = PROCESSED / "mrt_map.csv"
MRT_CENTROID_CSV = PROCESSED / "mrt_station_centroid.csv"
OUT = HERE.parent / "app" / "data" / "data.js"
BLOCKS_JSON = HERE / "hdb_blocks.json"  # from fetch_hdb_blocks.py (optional)


def encode(series: pd.Series):
    """Dictionary-encode a string column -> (codes list, categories list)."""
    cat = series.astype("category")
    return cat.cat.codes.astype(int).tolist(), cat.cat.categories.tolist()


def build_transactions(df: pd.DataFrame) -> dict:
    df = df.copy()
    df["block"] = df["block"].astype(str).str.strip()
    df["street_name"] = df["street_name"].astype(str).str.strip()

    # --- block lookup: one row per (block, street) with lat/lon + modal town ---
    blk = (
        df.groupby(["block", "street_name"], sort=True)
        .agg(
            lat=("latitude", "median"),
            lon=("longitude", "median"),
            town=("town", lambda s: s.mode().iloc[0]),
        )
        .reset_index()
    )
    blk["bid"] = range(len(blk))
    df = df.merge(blk[["block", "street_name", "bid"]], on=["block", "street_name"], how="left")

    towns = sorted(df["town"].unique().tolist())
    town_idx = {t: i for i, t in enumerate(towns)}
    streets = sorted(blk["street_name"].unique().tolist())
    street_idx = {s: i for i, s in enumerate(streets)}
    zone_by_town = (
        df.groupby("town")["zone"].agg(lambda s: s.mode().iloc[0]).to_dict()
    )

    blocks = [
        {
            "b": r.block,
            "s": street_idx[r.street_name],
            "t": town_idx[r.town],
            "lat": round(float(r.lat), 6),
            "lon": round(float(r.lon), 6),
        }
        for r in blk.itertuples(index=False)
    ]

    # --- HDB Property Information: real heights/years for known blocks + blocks with no resale yet ---
    if BLOCKS_JSON.exists():
        info = {(x["b"], x["s"]): x for x in json.loads(BLOCKS_JSON.read_text(encoding="utf-8"))}
        known = {(b["b"], streets[b["s"]]) for b in blocks}
        for b in blocks:
            x = info.get((b["b"], streets[b["s"]]))
            if x:
                b["top"], b["yc"], b["u"] = x["top"], x["yc"], x["u"]
        added = 0
        for (blk, street), x in info.items():
            if (blk, street) in known or not x.get("u"):
                continue
            if street not in street_idx:
                street_idx[street] = len(streets); streets.append(street)
            # town: nearest transacted block (HDB town codes differ from resale town names)
            nearest = min(blocks[:len(known)], key=lambda q: (q["lat"] - x["lat"]) ** 2 + (q["lon"] - x["lon"]) ** 2)
            blocks.append({"b": blk, "s": street_idx[street], "t": nearest["t"], "lat": x["lat"], "lon": x["lon"], "top": x["top"], "yc": x["yc"], "u": x["u"], "nt": 1})
            added += 1
        print(f"merged HDB property info: {sum(1 for b in blocks if 'top' in b)} blocks with height/year, {added} blocks without resale history added")

    # --- transactions, column-wise ---
    months = sorted(df["month"].unique().tolist())
    month_idx = {m: i for i, m in enumerate(months)}

    ft_codes, flat_types = encode(df["flat_type"])
    st_codes, storeys = encode(df["storey_range"])
    mo_codes, models = encode(df["flat_model"])

    tx = {
        "b": df["bid"].astype(int).tolist(),
        "m": df["month"].map(month_idx).astype(int).tolist(),
        "ft": ft_codes,
        "s": st_codes,
        "a": df["floor_area_sqm"].round().astype(int).tolist(),
        "mo": mo_codes,
        "ly": df["lease_commence_date"].astype(int).tolist(),
        "p": df["resale_price"].round().astype(int).tolist(),
    }

    return {
        "months": months,
        "towns": towns,
        "zones": [zone_by_town[t] for t in towns],
        "streets": streets,
        "flat_types": flat_types,
        "storeys": storeys,
        "models": models,
        "blocks": blocks,
        "tx": tx,
    }


def build_mrt() -> dict:
    exits = pd.read_csv(MRT_EXITS_CSV)
    cent = pd.read_csv(MRT_CENTROID_CSV)
    stations = (
        cent.groupby("station_name")
        .agg(
            lat=("centroid_lat", "first"),
            lon=("centroid_lon", "first"),
            lines=("line", lambda s: sorted(set(s.dropna().astype(str)))),
            codes=("station_code", lambda s: sorted(set(s.dropna().astype(str)))),
        )
        .reset_index()
    )
    LINES = {  # line_id in the centroid file -> (display name, official colour)
        "NS": ("North–South Line", "#d42e12"), "EW": ("East–West Line", "#009645"), "CG": ("Changi Airport branch (EW)", "#009645"),
        "NE": ("North East Line", "#9900aa"), "CC": ("Circle Line", "#fa9e0d"), "CE": ("Circle Line extension", "#fa9e0d"),
        "DT": ("Downtown Line", "#005ec4"), "TE": ("Thomson–East Coast Line", "#9d5b25"),
        "BPLRT": ("Bukit Panjang LRT", "#748477"), "SKLRT_SE": ("Sengkang LRT (East loop)", "#748477"),
        "SKLRT_SW": ("Sengkang LRT (West loop)", "#748477"), "PGLRT_PE": ("Punggol LRT (East loop)", "#748477"), "PGLRT_PW": ("Punggol LRT (West loop)", "#748477"),
    }
    st_idx = {n: i for i, n in enumerate(stations["station_name"])}
    lines = []
    for line, grp in cent.dropna(subset=["seq_in_line"]).groupby("line", sort=False):
        seq = grp.sort_values("seq_in_line")
        name, color = LINES.get(line, (line, "#52514e"))
        lines.append({"id": line, "name": name, "color": color, "st": [st_idx[n] for n in seq["station_name"]], "codes": seq["station_code"].astype(str).tolist()})
    lines.sort(key=lambda l: list(LINES).index(l["id"]) if l["id"] in LINES else 99)
    return {
        "lines": lines,
        "stations": [
            {
                "n": r.station_name,
                "lat": round(float(r.lat), 6),
                "lon": round(float(r.lon), 6),
                "lines": r.lines,
                "codes": r.codes,
            }
            for r in stations.itertuples(index=False)
        ],
        "exits": [
            {
                "n": r.station_name,
                "e": str(r.exit_code),
                "lat": round(float(r.lat), 6),
                "lon": round(float(r.lon), 6),
            }
            for r in exits.itertuples(index=False)
        ],
    }


def main() -> int:
    t0 = time.time()
    if not TX_CSV.exists():
        print(f"missing {TX_CSV}", file=sys.stderr)
        return 1
    df = pd.read_csv(TX_CSV, dtype={"block": str})
    df = df.dropna(subset=["latitude", "longitude"])
    payload = build_transactions(df)
    payload["mrt"] = build_mrt()
    payload["generated_at"] = datetime.now(timezone.utc).astimezone().isoformat(timespec="minutes")
    payload["row_count"] = len(df)

    js = "window.HDB_DATA=" + json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + ";"
    OUT.write_text(js, encoding="utf-8")
    print(
        f"wrote {OUT.name}: {len(df):,} rows, {len(payload['blocks']):,} blocks, "
        f"{len(payload['mrt']['stations'])} MRT stations, {sum(1 for b in payload['blocks'] if b.get('nt'))} no-resale blocks, "
        f"{OUT.stat().st_size / 1e6:.1f} MB in {time.time() - t0:.1f}s"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
