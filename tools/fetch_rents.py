"""Fetch HDB rental data -> app/data/rents.js (window.HDB_RENTS) for the rent map + "Is this rent fair?".

Sources (data.gov.sg, Singapore Open Data Licence, publisher: Housing & Development Board):
  d_c9f57187485a850908655db0e8cfe651  Renting Out of Flats from Jan 2021
      columns: rent_approval_date (YYYY-MM), town, block, street_name, flat_type ('4-ROOM'), monthly_rent
  d_23000a00c52996c55106084ed0339566  Median Rent by Town and Flat Type (quarterly, since 2005-Q2)
      columns: quarter ('2005-Q2'), town, flat_type ('3-RM'), median_rent ('na' / '-' = not published)
Whole files are downloaded with initiate-download / poll-download (datastore paging gets 429s)
and cached in tools/rents_cache.json for 7 days (gitignored; --refresh forces a download).
Block keys come from app/data/data.js, so run build_data.py first.

Output (compact JSON, one line):
window.HDB_RENTS = {
  generated_at: '2026-10-07T10:00+08:00',
  block_sig: '1e7c1499',                 # e.g.; tools/blockkey.py signature of the data.js used (app drops blocks{} on mismatch)
  source: { transactions: <dataset id>, medians: <dataset id>, licence: 'Singapore Open Data Licence' },
  rows: 212597,                          # rental approvals read
  months: ['2021-01', '2026-09'],        # first, last approval month in the transactions
  window12: ['2025-10', '2026-09'],      # months used for the 12-month stats (inclusive)
  window24: ['2024-10', '2026-09'],      # months used for the 24-month fallback (inclusive)
  flat_types: ['1 ROOM', ..., 'EXECUTIVE', 'MULTI-GENERATION'],   # same labels as HDB_DATA.flat_types
  block_fields: ['n', 'p25', 'med', 'p75', 'last', 'n24', 'p25_24', 'med24', 'p75_24'],
  blocks: {                              # key = index into HDB_DATA.blocks (as a string)
    '123': { '4 ROOM': [n, p25, med, p75, last, n24?, p25_24?, med24?, p75_24?] }
  },
      # n/p25/med/p75 over the last 12 months (S$/month, rounded to the dollar; linear-interpolated
      #   quartiles); p25/p75 are null when n < MIN_N, med is null when n = 0;
      # last = latest approval month 'YYYY-MM' for that block + flat type (any time since 2021);
      # the 24-month fields are present only when n < MIN_N and the 24-month window has a rental
      #   (p25_24/p75_24 null when n24 < MIN_N). Block + flat types with no rental in 24 months are omitted.
  quarters: ['2005-Q2', ..., '2026-Q2'], # axis of the town series
  towns: {                               # key = HDB_DATA.towns label ('KALLANG/WHAMPOA', 'CENTRAL AREA')
    'ANG MO KIO': { '4 ROOM': { q: [median or null per quarter], n, p25, med, p75 } }
  },
      # q from the median-rent dataset; n/p25/med/p75 from the transactions over window12
      #   (absent when the town has no rental of that type in the window).
  unmatched: { rows: k, addresses: m }   # rental rows / distinct addresses not found in HDB_DATA.blocks
}

Run:  python tools/fetch_rents.py [--refresh]      (~30 s first time, seconds when cached)
"""

import csv
import io
import json
import os
import re
import statistics
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

from blockkey import block_sig

HERE = Path(__file__).resolve().parent
DATA_JS = HERE.parent / "app" / "data" / "data.js"
OUT = HERE.parent / "app" / "data" / "rents.js"
CACHE = HERE / "rents_cache.json"
CACHE_DAYS = 7
MIN_N = 3  # mirrors policy 'rent.comps.min_n' (the engine reads the policy; this only shapes the file)

TX_ID = "d_c9f57187485a850908655db0e8cfe651"
MED_ID = "d_23000a00c52996c55106084ed0339566"
GOV_POLL = "https://api-open.data.gov.sg/v1/public/api/datasets/{id}/poll-download"
GOV_INIT = "https://api-open.data.gov.sg/v1/public/api/datasets/{id}/initiate-download"


# Outbound proxy: HDB_PIPELINE_PROXY env var (same name as the pipeline), else the pipeline's
# .env file, else none. Set HDB_PIPELINE_PROXY="" on a home network.
def _proxy():
    v = os.environ.get("HDB_PIPELINE_PROXY")
    if v is None:
        env = HERE.parent / "hdb-data-pipeline" / ".env"
        if env.exists():
            for line in env.read_text(encoding="utf-8").splitlines():
                if line.strip().startswith("HDB_PIPELINE_PROXY="):
                    v = line.split("=", 1)[1].strip().strip('"').strip("'")
    return v or None


PROXY = _proxy()
_opener = urllib.request.build_opener(
    urllib.request.ProxyHandler({"http": PROXY, "https": PROXY} if PROXY else {})
)


def get(url: str, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "hdb-comparer/0.1 (personal research)", "Accept": "*/*"})
    with _opener.open(req, timeout=timeout) as r:
        return r.read()


def download_csv(dataset_id: str) -> str:
    """poll-download, falling back to initiate-download when the file isn't staged yet."""
    last = None
    for _ in range(10):
        try:
            body = json.loads(get(GOV_POLL.format(id=dataset_id), 60))
            last = str(body)[:200]
            url = (body.get("data") or {}).get("url")
            if url:
                return get(url, 300).decode("utf-8-sig")
        except Exception as e:  # noqa: BLE001 - retry any transient failure
            last = repr(e)
        try:
            get(GOV_INIT.format(id=dataset_id), 60)
        except Exception as e:  # noqa: BLE001
            last = repr(e)
        time.sleep(3)
    raise RuntimeError(f"no download url for {dataset_id}: {last}")


def load_csv(dataset_id: str, cache: dict, refresh: bool) -> list[dict]:
    hit = cache.get(dataset_id)
    fresh = hit and datetime.fromisoformat(hit["fetched"]) > datetime.now(timezone.utc) - timedelta(days=CACHE_DAYS)
    if refresh or not fresh:
        print(f"downloading {dataset_id} ...")
        cache[dataset_id] = {"fetched": datetime.now(timezone.utc).isoformat(), "csv": download_csv(dataset_id)}
        time.sleep(1)
    return list(csv.DictReader(io.StringIO(cache[dataset_id]["csv"])))


# ----------------------------------------------------------------------------- addresses
# HDB_DATA street names use the resale dataset's abbreviations ('BT BATOK WEST AVE 6',
# 'C'WEALTH CRES'). The rental dataset uses the same style, but normalise both sides anyway.
ABBR = {
    "AVENUE": "AVE", "STREET": "ST", "ROAD": "RD", "DRIVE": "DR", "CRESCENT": "CRES",
    "CENTRAL": "CTRL", "NORTH": "NTH", "SOUTH": "STH", "BUKIT": "BT", "JALAN": "JLN",
    "LORONG": "LOR", "UPPER": "UPP", "CLOSE": "CL", "COMMONWEALTH": "C'WEALTH", "KAMPONG": "KG",
    "TANJONG": "TG", "PLACE": "PL", "TERRACE": "TER", "HEIGHTS": "HTS", "GARDENS": "GDNS",
    "PARK": "PK", "SAINT": "ST.", "MARKET": "MKT",
}


def norm_street(s: str) -> str:
    s = re.sub(r"\s+", " ", (s or "").upper().replace("’", "'")).strip()
    return " ".join(ABBR.get(w, w) for w in s.split(" "))


def norm_block(b: str) -> str:
    return re.sub(r"\s+", "", (b or "").upper())


def norm_type(t: str) -> str | None:
    """'4-ROOM' / '4-RM' / '4 ROOM' -> '4 ROOM'; 'EXEC' -> 'EXECUTIVE'."""
    t = re.sub(r"\s+", " ", (t or "").upper()).strip()
    m = re.match(r"^(\d)[- ]?(ROOM|RM)$", t)
    if m:
        return f"{m.group(1)} ROOM"
    if t.startswith("EXEC"):
        return "EXECUTIVE"
    if t.startswith("MULTI"):
        return "MULTI-GENERATION"
    return None


def norm_town(t: str, towns: list[str]) -> str:
    t = re.sub(r"\s+", " ", (t or "").upper()).strip()
    if t in towns:
        return t
    alias = {"CENTRAL": "CENTRAL AREA", "KALLANG WHAMPOA": "KALLANG/WHAMPOA", "KALLANG/ WHAMPOA": "KALLANG/WHAMPOA"}
    return alias.get(t, t)


# ----------------------------------------------------------------------------- stats
def month_add(ym: str, k: int) -> str:
    y, m = int(ym[:4]), int(ym[5:7]) - 1 + k
    return f"{y + m // 12:04d}-{m % 12 + 1:02d}"


def stats(vals: list[float]) -> tuple:
    """(n, p25, med, p75) rounded to the dollar; quartiles only when n >= MIN_N."""
    n = len(vals)
    if not n:
        return 0, None, None, None
    med = round(statistics.median(vals))
    if n < MIN_N:
        return n, None, med, None
    q = statistics.quantiles(vals, n=4, method="inclusive")  # == numpy 'linear'
    return n, round(q[0]), med, round(q[2])


def main() -> int:
    refresh = "--refresh" in sys.argv
    if not DATA_JS.exists():
        print("app/data/data.js missing - run build_data.py first", file=sys.stderr)
        return 1
    t = DATA_JS.read_text(encoding="utf-8")
    hdb = json.loads(t[t.index("{"): t.rindex("}") + 1])
    flat_types, towns, streets = hdb["flat_types"], hdb["towns"], hdb["streets"]
    bid_of = {}
    for i, b in enumerate(hdb["blocks"]):
        bid_of.setdefault((norm_block(b["b"]), norm_street(streets[b["s"]])), i)

    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    tx = load_csv(TX_ID, cache, refresh)
    med_rows = load_csv(MED_ID, cache, refresh)
    CACHE.write_text(json.dumps(cache), encoding="utf-8")

    # --- transactions ---
    rows, bad = [], 0
    for r in tx:
        ft = norm_type(r.get("flat_type"))
        try:
            rent = float(r["monthly_rent"])
        except (TypeError, ValueError, KeyError):
            bad += 1
            continue
        ym = (r.get("rent_approval_date") or "")[:7]
        if not ft or not re.match(r"^\d{4}-\d{2}$", ym) or rent <= 0:
            bad += 1
            continue
        rows.append((ym, norm_town(r.get("town"), towns), norm_block(r.get("block")), norm_street(r.get("street_name")), ft, rent))
    months = sorted({r[0] for r in rows})
    first, last = months[0], months[-1]
    w12, w24 = month_add(last, -11), month_add(last, -23)

    unmatched_rows, unmatched_addr, addr_seen = 0, set(), set()
    blk12, blk24, blk_last, town12 = {}, {}, {}, {}
    for ym, town, block, street, ft, rent in rows:
        addr_seen.add((block, street))
        bid = bid_of.get((block, street))
        if ym >= w12:
            town12.setdefault((town, ft), []).append(rent)
        if bid is None:
            unmatched_rows += 1
            unmatched_addr.add((block, street))
            continue
        key = (bid, ft)
        if blk_last.get(key, "") < ym:
            blk_last[key] = ym
        if ym >= w24:
            blk24.setdefault(key, []).append(rent)
            if ym >= w12:
                blk12.setdefault(key, []).append(rent)

    blocks = {}
    for key, v24 in blk24.items():
        bid, ft = key
        n, p25, med, p75 = stats(blk12.get(key, []))
        rec = [n, p25, med, p75, blk_last[key]]
        if n < MIN_N:
            rec += list(stats(v24))
        blocks.setdefault(str(bid), {})[ft] = rec

    # --- town medians (quarterly) ---
    quarters = sorted({r["quarter"].strip() for r in med_rows if r.get("quarter")})
    qi = {q: i for i, q in enumerate(quarters)}
    town_out = {}
    unknown_towns = set()
    for r in med_rows:
        ft = norm_type(r.get("flat_type"))
        if not ft:
            continue
        town = norm_town(r.get("town"), towns)
        if town not in towns:
            unknown_towns.add(town)
        v = (r.get("median_rent") or "").strip()
        try:
            val = round(float(v.replace(",", "")))
        except ValueError:
            val = None  # 'na', '-', ''
        ent = town_out.setdefault(town, {}).setdefault(ft, {"q": [None] * len(quarters)})
        ent["q"][qi[r["quarter"].strip()]] = val
    for (town, ft), vals in town12.items():
        n, p25, med, p75 = stats(vals)
        ent = town_out.setdefault(town, {}).setdefault(ft, {"q": [None] * len(quarters)})
        ent.update({"n": n, "p25": p25, "med": med, "p75": p75})
    # drop all-null series with no transaction stats (e.g. 1-room in towns that have none)
    for town in list(town_out):
        for ft in list(town_out[town]):
            e = town_out[town][ft]
            if all(x is None for x in e["q"]) and "n" not in e:
                del town_out[town][ft]

    payload = {
        "generated_at": datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%dT%H:%M+08:00"),
        "block_sig": block_sig(hdb),
        "source": {"transactions": TX_ID, "medians": MED_ID, "licence": "Singapore Open Data Licence"},
        "rows": len(rows),
        "months": [first, last],
        "window12": [w12, last],
        "window24": [w24, last],
        "flat_types": flat_types,
        "block_fields": ["n", "p25", "med", "p75", "last", "n24", "p25_24", "med24", "p75_24"],
        "blocks": blocks,
        "quarters": quarters,
        "towns": town_out,
        "unmatched": {"rows": unmatched_rows, "addresses": len(unmatched_addr)},
    }
    js = "window.HDB_RENTS=" + json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + ";"
    OUT.write_text(js, encoding="utf-8")

    matched_rows = len(rows) - unmatched_rows
    print(f"read {len(tx):,} rental rows ({bad} skipped), months {first}..{last}")
    print(f"block match: {matched_rows:,}/{len(rows):,} rows ({matched_rows / len(rows):.1%}), "
          f"{len(addr_seen) - len(unmatched_addr):,}/{len(addr_seen):,} addresses")
    if unmatched_addr:
        print("  unmatched e.g.:", sorted(unmatched_addr)[:12])
    if unknown_towns:
        print("  median-rent towns not in HDB_DATA.towns:", sorted(unknown_towns))
    n_entries = sum(len(v) for v in blocks.values())
    print(f"blocks: {len(blocks):,} with rentals in 24 months, {n_entries:,} block x type entries; "
          f"quarters {quarters[0]}..{quarters[-1]}; wrote {OUT.name} ({len(js.encode('utf-8')) / 1e6:.2f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
