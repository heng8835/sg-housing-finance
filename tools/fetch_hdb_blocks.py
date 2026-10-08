"""All HDB blocks (incl. new ones with no resale yet) -> tools/hdb_blocks.json.

Output
  hdb_blocks.json  every residential HDB block from data.gov.sg "HDB Property Information"
                   (13k rows: blk, street, year completed, max floor, dwelling units, mix),
                   geocoded via the pipeline's append-only cache first, then OneMap.
                   build_data.py merges this into data.js (adds blocks without transactions,
                   real block heights and completion years) - run build_data.py again afterwards.

BTO projects (app/data/bto.js) are built by a separate, private generator (tools/fetch_bto.py) that is
not part of the public repository (DEC-015); it reuses onemap() from this file.

Run:  python fetch_hdb_blocks.py         (from tools/)   first run ~25 min (OneMap pacing)
"""

import json
import sys
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_poi import ONEMAP, session  # noqa: E402

HERE = Path(__file__).resolve().parent
PIPE = HERE.parent / "hdb-data-pipeline" / "data"
CACHE = PIPE / "cache" / "hdb_address.csv"           # pipeline's geocode cache (read-only here)
LOCAL_CACHE = HERE / "blocks_geocode_cache.json"      # comparer-side additions
OUT_BLOCKS = HERE / "hdb_blocks.json"
PROPERTY_INFO = "d_17f5382f26140b1fdae0ba2ef6239d2f"


def onemap(s, q):
    for attempt in range(6):
        r = s.get(ONEMAP, params={"searchVal": q, "returnGeom": "Y", "getAddrDetails": "Y", "pageNum": 1}, timeout=30)
        if r.status_code == 429:
            time.sleep(2 * (attempt + 1))
            continue
        res = (r.json().get("results") or []) if r.ok else []
        time.sleep(0.4)
        return res[0] if res else None
    return None


def fetch_property_info(s):
    """Whole CSV via the dataset download endpoint (paging the datastore gets 429s)."""
    import io
    from fetch_poi import GOV_INIT, GOV_POLL
    for _ in range(10):
        r = s.get(GOV_POLL.format(id=PROPERTY_INFO), timeout=60)
        url = ((r.json().get("data") or {}) if r.ok else {}).get("url")
        if url:
            return pd.read_csv(io.StringIO(s.get(url, timeout=300).text), dtype=str)
        s.get(GOV_INIT.format(id=PROPERTY_INFO), timeout=60)
        time.sleep(2)
    raise RuntimeError("HDB Property Information: no download url")


def geocode_blocks(s, df):
    cache = {}
    if CACHE.exists():
        c = pd.read_csv(CACHE, dtype=str)
        for r in c.itertuples(index=False):
            cache[(str(r.block).strip(), str(r.street_name).strip())] = (float(r.latitude), float(r.longitude))
    local = json.loads(LOCAL_CACHE.read_text(encoding="utf-8")) if LOCAL_CACHE.exists() else {}
    out, misses, new = [], 0, 0
    for i, r in enumerate(df.itertuples(index=False)):
        key = (str(r.blk_no).strip(), str(r.street).strip())
        lk = "|".join(key)
        ll = cache.get(key) or (tuple(local[lk]) if local.get(lk) else None)
        if ll is None:
            hit = onemap(s, f"{key[0]} {key[1]} SINGAPORE")
            ll = (float(hit["LATITUDE"]), float(hit["LONGITUDE"])) if hit else None
            local[lk] = list(ll) if ll else None
            new += 1
            if new % 100 == 0:
                LOCAL_CACHE.write_text(json.dumps(local), encoding="utf-8")
                print(f"    geocoded {new} new blocks… ({i + 1}/{len(df)})", flush=True)
        if ll is None:
            misses += 1
            continue
        n = lambda v: int(float(v)) if str(v).strip() not in ("", "nan", "None") else 0  # noqa: E731
        out.append({"b": key[0], "s": key[1], "lat": round(ll[0], 6), "lon": round(ll[1], 6),
                    "yc": n(r.year_completed), "top": n(r.max_floor_lvl), "u": n(r.total_dwelling_units)})
    LOCAL_CACHE.write_text(json.dumps(local), encoding="utf-8")
    return out, misses


def main() -> int:
    s = session()
    print("HDB Property Information:")
    df = fetch_property_info(s)
    df = df[df["residential"] == "Y"].copy()
    print(f"  {len(df)} residential blocks; geocoding (pipeline cache first)…")
    blocks, misses = geocode_blocks(s, df)
    # unit mix per block (sold units by type) — used for "block has 4/5-room units?"
    mix_cols = {"1room_sold": "1", "2room_sold": "2", "3room_sold": "3", "4room_sold": "4", "5room_sold": "5", "exec_sold": "E", "multigen_sold": "M"}
    key = {(str(r.blk_no).strip(), str(r.street).strip()): r for r in df.itertuples(index=False)}
    for b in blocks:
        r = key[(b["b"], b["s"])]
        b["mix"] = {v: int(float(getattr(r, k) or 0)) for k, v in mix_cols.items() if str(getattr(r, k, "")).strip() not in ("", "nan")}
    OUT_BLOCKS.write_text(json.dumps(blocks, separators=(",", ":")), encoding="utf-8")
    print(f"  wrote {OUT_BLOCKS.name}: {len(blocks)} blocks ({misses} could not be geocoded)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
