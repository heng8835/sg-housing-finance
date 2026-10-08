"""Market + future-value inputs -> app/data/market.js (window.HDB_MARKET) for the future-value scorecard.

Sources (data.gov.sg, Singapore Open Data Licence):
  d_14f63e595975691e7c24a27ae4c07c79  HDB Resale Price Index (1Q2009 = 100), Quarterly  (HDB)
      columns: quarter ('2009-Q1'), index
  d_a8c3546b26712e35021f3a681d0353ae  Master Plan 2025 Land Use Layer  (URA; gazetted 1 Dec 2025)
      GeoJSON polygons (~190 MB); LU_DESC = zoning ('COMMERCIAL', 'WHITE', 'RESERVE SITE', ...)
  d_17f5382f26140b1fdae0ba2ef6239d2f  HDB Property Information  (HDB)
      blk_no, street, residential, 1room_sold ... 5room_sold, exec_sold, multigen_sold
  local: tools/curated_catalysts.json  (named major projects; positions approximate; sourced per entry)
Whole files come from initiate-download / poll-download (datastore paging gets 429s).
Caches (gitignored): tools/market_cache.json (RPI + property info CSV + metadata, 7 days) and
tools/cache/mp25_landuse.geojson (90 days; NOT committed). --refresh forces new downloads.
Block keys come from app/data/data.js (index into HDB_DATA.blocks), so run build_data.py first
and re-run this after every build_data.py (indices shift).

Land use: the Master Plan is zoning only. It does NOT say whether a zone is already built
(an existing mall and an empty commercial plot look the same), so "undeveloped" cannot be
derived from it: we count zones and zoned area near each block and say so (landuse.undeveloped = null).
Method: target zones are rasterised on a CELL_M grid (cell centre inside the polygon, even-odd,
holes respected; tiny zones keep at least their centroid cell); for each block, cells within
RADIUS_M of the block give the zoned area, and the distinct zones touching those cells the count.

Output (compact JSON, one line, ~0.3-0.5 MB):
window.HDB_MARKET = {
  generated_at: '2026-10-07T10:00+08:00',
  block_sig: '1e7c1499',            # e.g.; tools/blockkey.py signature of the data.js used (app ignores landuse on mismatch)
  sources: [{ key, name, dataset, url, licence, asOf }],      # asOf = data.gov.sg lastUpdatedAt (date)
  rpi: { base: '2009-Q1', quarters: ['1990-Q1', ...], index: [24.3, ...] },   # quarterly, ascending
  landuse: {
    year: 2025, radius_m: 800, cell_m: 25, undeveloped: null, note: '...',
    blocks: 10740,                    # HDB_DATA.blocks.length when built (engine ignores landuse on mismatch)
    cats: ['COMMERCIAL', 'WHITE', 'BUSINESS PARK', 'CIVIC & COMMUNITY INSTITUTION',
           'HEALTH & MEDICAL CARE', 'SPORTS & RECREATION', 'RESERVE SITE'],
    n:  [[...per block...], ...],     # n[c][bid]  = distinct zones of cats[c] within radius_m of block bid
    ha: [[...per block...], ...],     # ha[c][bid] = hectares of cats[c] within radius_m (rounded, 0 = none)
    zones: [k per cat]                # zones of each category island-wide
  },
  town_mix: { 'ANG MO KIO': { '1': units, '2': ..., '3', '4', '5', 'E', 'M' } },   # sold units by type
  catalysts: [{ id, name, kind, lat, lon, approx, km, year, status, source_url, note }]
}
  bid = index into HDB_DATA.blocks (arrays have HDB_DATA.blocks.length entries).

Run:  python tools/fetch_market.py [--refresh] [--selftest]     (first run ~3-5 min: 190 MB download)
Proxy: HDB_PIPELINE_PROXY env var, else hdb-data-pipeline/.env, else none (same helper as fetch_rents.py).
"""

import csv
import io
import json
import math
import sys
import time
import urllib.request
from array import array
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_rents import GOV_INIT, GOV_POLL, _opener, download_csv, get  # noqa: E402
from blockkey import block_sig  # noqa: E402

HERE = Path(__file__).resolve().parent
DATA_JS = HERE.parent / "app" / "data" / "data.js"
OUT = HERE.parent / "app" / "data" / "market.js"
CACHE = HERE / "market_cache.json"
LANDUSE_FILE = HERE / "cache" / "mp25_landuse.geojson"
CATALYSTS = HERE / "curated_catalysts.json"
CACHE_DAYS, LANDUSE_DAYS = 7, 90

RPI_ID = "d_14f63e595975691e7c24a27ae4c07c79"
LANDUSE_ID = "d_a8c3546b26712e35021f3a681d0353ae"
LANDUSE_YEAR = 2025
PROPINFO_ID = "d_17f5382f26140b1fdae0ba2ef6239d2f"
META = "https:" + "//api-production.data.gov.sg/v2/public/api/datasets/{id}/metadata"
VIEW = "https:" + "//data.gov.sg/datasets/{id}/view"
LICENCE = "Singapore Open Data Licence"

CATS = ["COMMERCIAL", "WHITE", "BUSINESS PARK", "CIVIC & COMMUNITY INSTITUTION",
        "HEALTH & MEDICAL CARE", "SPORTS & RECREATION", "RESERVE SITE"]
RADIUS_M, CELL_M = 800, 25
BBOX = (1.15, 103.59, 1.48, 104.10)  # lat0, lon0, lat1, lon1 - mainland Singapore + near islands
ALIAS = {"BUSINESS PARK - WHITE": "BUSINESS PARK"}  # white-flex business park counts as business park
MIX = {"1room_sold": "1", "2room_sold": "2", "3room_sold": "3", "4room_sold": "4",
       "5room_sold": "5", "exec_sold": "E", "multigen_sold": "M"}


# ----------------------------------------------------------------------------- downloads
def fresh(stamp: str | None, days: int) -> bool:
    return bool(stamp) and datetime.fromisoformat(stamp) > datetime.now(timezone.utc) - timedelta(days=days)


def metadata(dataset_id: str) -> dict:
    try:
        return (json.loads(get(META.format(id=dataset_id), 60)).get("data") or {})
    except Exception as e:  # noqa: BLE001 - metadata is optional
        print(f"  metadata {dataset_id} failed: {e!r}"[:200])
        return {}


def download_file(dataset_id: str, dest: Path) -> None:
    """Stream a whole dataset file to `dest` (poll-download; initiate when not staged). Few polite tries."""
    last = None
    for attempt in range(6):
        try:
            url = (json.loads(get(GOV_POLL.format(id=dataset_id), 60)).get("data") or {}).get("url")
            if url:
                dest.parent.mkdir(parents=True, exist_ok=True)
                tmp = dest.with_suffix(".part")
                req = urllib.request.Request(url, headers={"User-Agent": "hdb-comparer/0.1 (personal research)"})
                with _opener.open(req, timeout=600) as r, open(tmp, "wb") as f:
                    while True:
                        chunk = r.read(1 << 20)
                        if not chunk:
                            break
                        f.write(chunk)
                tmp.replace(dest)
                return
            get(GOV_INIT.format(id=dataset_id), 60)
        except Exception as e:  # noqa: BLE001 - retry transient failures
            last = repr(e)
        time.sleep(3 + 2 * attempt)
    raise RuntimeError(f"no download for {dataset_id}: {last}")


# ----------------------------------------------------------------------------- GeoJSON streaming
def iter_features(path: Path, chunk: int = 1 << 22):
    """Yield features of a FeatureCollection one at a time (the file is too big to json.load comfortably)."""
    dec = json.JSONDecoder()
    with open(path, encoding="utf-8-sig") as f:
        buf, pos, eof = "", -1, False
        while pos < 0:
            data = f.read(chunk)
            if not data:
                return
            buf += data
            k = buf.find('"features"')
            if k >= 0 and buf.find("[", k) >= 0:
                pos = buf.find("[", k) + 1
        while True:
            while pos < len(buf) and buf[pos] in " \t\r\n,":
                pos += 1
            if pos < len(buf) and buf[pos] == "]":
                return
            try:
                if pos >= len(buf):
                    raise ValueError("need more")
                obj, end = dec.raw_decode(buf, pos)
            except ValueError:
                if eof:
                    return
                data = f.read(chunk)
                eof = not data
                buf, pos = buf[pos:] + data, 0
                continue
            yield obj
            pos = end


def lu_desc(props: dict) -> str:
    v = props.get("LU_DESC")
    if not v and props.get("Description"):  # KML-style HTML table fallback
        d = props["Description"]
        k = d.find("LU_DESC")
        if k >= 0:
            s = d.find("<td>", k) + 4
            v = d[s:d.find("</td>", s)]
    return str(v or "").strip().upper()


# ----------------------------------------------------------------------------- raster helpers (pure)
class Grid:
    """Equirectangular metre grid over BBOX; cell (row, col) centre = origin + (i + 0.5) * cell."""

    def __init__(self, bbox=BBOX, cell=CELL_M):
        self.lat0, self.lon0, lat1, lon1 = bbox
        self.cell = cell
        self.my = 110574.0                                   # metres per degree latitude
        self.mx = 111320.0 * math.cos(math.radians((self.lat0 + lat1) / 2))
        self.w = int((lon1 - self.lon0) * self.mx / cell) + 1
        self.h = int((lat1 - self.lat0) * self.my / cell) + 1
        self.cat = bytearray(self.w * self.h)                # category code (1-based), 0 = none
        self.zone = array("i", bytes(4 * self.w * self.h))   # zone id (1-based), 0 = none

    def xy(self, lon, lat):
        return (lon - self.lon0) * self.mx / self.cell, (lat - self.lat0) * self.my / self.cell

    def fill(self, rings, code: int, zid: int) -> int:
        """Rasterise one polygon (outer ring + holes, lon/lat), even-odd rule. Returns cells set."""
        rows: dict[int, list[float]] = {}
        for ring in rings:
            pts = [self.xy(p[0], p[1]) for p in ring]
            for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
                if y1 == y2:
                    continue
                lo, hi = (y1, y2) if y1 < y2 else (y2, y1)
                for r in range(max(0, math.ceil(lo - 0.5)), min(self.h - 1, math.ceil(hi - 0.5) - 1) + 1):
                    yc = r + 0.5
                    rows.setdefault(r, []).append(x1 + (yc - y1) * (x2 - x1) / (y2 - y1))
        n = 0
        for r, xs in rows.items():
            xs.sort()
            for a, b in zip(xs[::2], xs[1::2]):
                c0, c1 = max(0, math.ceil(a - 0.5)), min(self.w, math.ceil(b - 0.5))
                if c1 > c0:
                    base = r * self.w
                    self.cat[base + c0: base + c1] = bytes([code]) * (c1 - c0)
                    self.zone[base + c0: base + c1] = array("i", [zid]) * (c1 - c0)
                    n += c1 - c0
        if not n:  # tiny zone: keep its first-vertex cell so it still counts
            x, y = self.xy(rings[0][0][0], rings[0][0][1])
            c, r = int(x), int(y)
            if 0 <= c < self.w and 0 <= r < self.h and not self.cat[r * self.w + c]:
                self.cat[r * self.w + c] = code
                self.zone[r * self.w + c] = zid
                n = 1
        return n

    def disc(self, radius_m: float):
        """Row offsets and half-widths (cells) of a disc of radius_m, cell-centre test."""
        rc = radius_m / self.cell
        k = int(rc)
        return [(dy, int(math.sqrt(max(0.0, rc * rc - dy * dy)))) for dy in range(-k, k + 1)]

    def around(self, lat, lon, disc, ncat: int):
        """(cells per category [1..ncat], distinct zone ids) within the disc centred on (lat, lon)."""
        x, y = self.xy(lon, lat)
        c, r = int(x), int(y)
        cells, zones = [0] * (ncat + 1), set()
        for dy, hw in disc:
            rr = r + dy
            if rr < 0 or rr >= self.h:
                continue
            a, b = max(0, c - hw), min(self.w, c + hw + 1)
            if b <= a:
                continue
            base = rr * self.w
            sl = self.cat[base + a: base + b]
            if sl.count(0) == len(sl):
                continue
            for k in range(1, ncat + 1):
                cells[k] += sl.count(k)
            zones.update(self.zone[base + a: base + b])
        zones.discard(0)
        return cells, zones


def polygons(geom: dict):
    t = (geom or {}).get("type")
    if t == "Polygon":
        return [geom["coordinates"]]
    if t == "MultiPolygon":
        return geom["coordinates"]
    return []


def selftest() -> None:
    """A 400 m x 400 m square zone next to a point: area and count within 800 m."""
    g = Grid(bbox=(1.30, 103.80, 1.32, 103.82), cell=10)
    dlat, dlon = 400 / g.my, 400 / g.mx
    lat, lon = 1.31, 103.81
    square = [[[lon, lat], [lon + dlon, lat], [lon + dlon, lat + dlat], [lon, lat + dlat], [lon, lat]]]
    hole = [[lon + dlon / 4, lat + dlat / 4], [lon + dlon * 3 / 4, lat + dlat / 4], [lon + dlon * 3 / 4, lat + dlat * 3 / 4], [lon + dlon / 4, lat + dlat * 3 / 4]]
    assert abs(g.fill(square, 1, 1) * 100 - 160000) < 160000 * 0.03
    g2 = Grid(bbox=(1.30, 103.80, 1.32, 103.82), cell=10)
    assert abs(g2.fill(square + [hole], 1, 1) * 100 - 120000) < 120000 * 0.05   # hole = 200 m x 200 m
    cells, zones = g.around(lat - 100 / g.my, lon - 100 / g.mx, g.disc(800), 1)  # whole square within 800 m
    assert zones == {1} and abs(cells[1] * 100 - 160000) < 160000 * 0.03, (cells, zones)
    cells, zones = g.around(lat - 900 / g.my, lon, g.disc(800), 1)               # 900 m away: nothing
    assert zones == set() and cells[1] == 0
    print("selftest ok")


# ----------------------------------------------------------------------------- builders
def build_rpi(cache: dict, refresh: bool) -> dict:
    hit = cache.get(RPI_ID)
    if refresh or not hit or not fresh(hit.get("fetched"), CACHE_DAYS):
        print("downloading RPI ...")
        cache[RPI_ID] = {"fetched": datetime.now(timezone.utc).isoformat(), "csv": download_csv(RPI_ID)}
        time.sleep(1)
    rows = []
    for r in csv.DictReader(io.StringIO(cache[RPI_ID]["csv"])):
        q = (r.get("quarter") or "").strip().upper().replace(" ", "")
        try:
            rows.append((q, round(float(r["index"]), 1)))
        except (KeyError, TypeError, ValueError):
            continue
    rows.sort()
    return {"base": "2009-Q1", "quarters": [q for q, _ in rows], "index": [v for _, v in rows]}


def build_town_mix(cache: dict, refresh: bool, hdb: dict) -> dict:
    hit = cache.get(PROPINFO_ID)
    if refresh or not hit or not fresh(hit.get("fetched"), CACHE_DAYS):
        print("downloading HDB Property Information ...")
        cache[PROPINFO_ID] = {"fetched": datetime.now(timezone.utc).isoformat(), "csv": download_csv(PROPINFO_ID)}
        time.sleep(1)
    streets, towns = hdb["streets"], hdb["towns"]
    town_of = {(b["b"], streets[b["s"]]): towns[b["t"]] for b in hdb["blocks"]}
    out, miss = {}, 0
    for r in csv.DictReader(io.StringIO(cache[PROPINFO_ID]["csv"])):
        if (r.get("residential") or "").strip().upper() != "Y":
            continue
        town = town_of.get((str(r.get("blk_no", "")).strip(), str(r.get("street", "")).strip()))
        if not town:
            miss += 1
            continue
        mix = out.setdefault(town, {v: 0 for v in MIX.values()})
        for col, k in MIX.items():
            try:
                mix[k] += int(float(r.get(col) or 0))
            except ValueError:
                pass
    print(f"town unit mix: {len(out)} towns ({miss} residential blocks not matched to data.js)")
    return out


def build_landuse(refresh: bool, hdb: dict) -> dict:
    cache_stamp = None
    if LANDUSE_FILE.exists():
        cache_stamp = datetime.fromtimestamp(LANDUSE_FILE.stat().st_mtime, timezone.utc).isoformat()
    if refresh or not fresh(cache_stamp, LANDUSE_DAYS):
        print(f"downloading MP{LANDUSE_YEAR} land use (~190 MB) ...")
        t0 = time.time()
        download_file(LANDUSE_ID, LANDUSE_FILE)
        print(f"  {LANDUSE_FILE.stat().st_size / 1e6:.0f} MB in {time.time() - t0:.0f}s")
    t0 = time.time()
    g = Grid()
    code = {c: i + 1 for i, c in enumerate(CATS)}
    zone_cat, seen, nfeat = [0], {}, 0
    for f in iter_features(LANDUSE_FILE):
        nfeat += 1
        desc = lu_desc(f.get("properties") or {})
        seen[desc] = seen.get(desc, 0) + 1
        desc = ALIAS.get(desc, desc)
        if desc not in code:
            continue
        for poly in polygons(f.get("geometry")):
            zid = len(zone_cat)
            zone_cat.append(code[desc])
            g.fill(poly, code[desc], zid)
    print(f"  {nfeat:,} land-use features, rasterised in {time.time() - t0:.0f}s; target zones: {len(zone_cat) - 1:,}")
    print("  LU_DESC values:", sorted(seen.items(), key=lambda kv: -kv[1])[:40])
    t0 = time.time()
    disc = g.disc(RADIUS_M)
    cell_ha = CELL_M * CELL_M / 10000
    n = [[0] * len(hdb["blocks"]) for _ in CATS]
    ha = [[0] * len(hdb["blocks"]) for _ in CATS]
    for bid, b in enumerate(hdb["blocks"]):
        cells, zones = g.around(b["lat"], b["lon"], disc, len(CATS))
        for z in zones:
            n[zone_cat[z] - 1][bid] += 1
        for k in range(len(CATS)):
            ha[k][bid] = round(cells[k + 1] * cell_ha)
    print(f"  per-block summary for {len(hdb['blocks']):,} blocks in {time.time() - t0:.0f}s")
    return {
        "year": LANDUSE_YEAR, "radius_m": RADIUS_M, "cell_m": CELL_M, "undeveloped": None,
        "note": "Zoning only: the Master Plan does not say whether a zone is already built, so these are "
                "counts and areas of zones, not of empty sites. Zoning is not a committed project.",
        "cats": CATS, "blocks": len(hdb["blocks"]), "n": n, "ha": ha,
        "zones": [sum(1 for c in zone_cat[1:] if c == k + 1) for k in range(len(CATS))],
    }


def source(key, name, dataset_id):
    m = metadata(dataset_id)
    time.sleep(1)
    return {"key": key, "name": m.get("name") or name, "dataset": dataset_id, "url": VIEW.format(id=dataset_id),
            "licence": LICENCE, "asOf": (m.get("lastUpdatedAt") or "")[:10] or None}


def main() -> int:
    if "--selftest" in sys.argv:
        selftest()
        return 0
    refresh = "--refresh" in sys.argv
    if not DATA_JS.exists():
        print("app/data/data.js missing - run build_data.py first", file=sys.stderr)
        return 1
    t_all = time.time()
    t = DATA_JS.read_text(encoding="utf-8")
    hdb = json.loads(t[t.index("{"): t.rindex("}") + 1])
    del t
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    failed = []
    payload = {"generated_at": datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%dT%H:%M+08:00"),
               "block_sig": block_sig(hdb), "sources": []}

    for key, fn in (("rpi", lambda: build_rpi(cache, refresh)), ("town_mix", lambda: build_town_mix(cache, refresh, hdb))):
        try:
            payload[key] = fn()
        except Exception as e:  # noqa: BLE001 - one failed source must not block the others
            failed.append(f"{key}: {e!r}"[:300])
            payload[key] = None
    CACHE.write_text(json.dumps(cache), encoding="utf-8")
    try:
        payload["landuse"] = build_landuse(refresh, hdb)
    except Exception as e:  # noqa: BLE001
        failed.append(f"landuse: {e!r}"[:300])
        payload["landuse"] = None
    payload["catalysts"] = json.loads(CATALYSTS.read_text(encoding="utf-8"))["projects"]

    payload["sources"] = [
        source("rpi", "HDB Resale Price Index (1Q2009 = 100), Quarterly", RPI_ID),
        source("landuse", f"Master Plan {LANDUSE_YEAR} Land Use Layer", LANDUSE_ID),
        source("town_mix", "HDB Property Information", PROPINFO_ID),
        {"key": "catalysts", "name": "Curated major projects (tools/curated_catalysts.json)", "dataset": None,
         "url": None, "licence": "see each project's source_url", "asOf": json.loads(CATALYSTS.read_text(encoding="utf-8")).get("asOf")},
    ]
    js = "window.HDB_MARKET=" + json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + ";"
    OUT.write_text(js, encoding="utf-8")
    rpi = payload.get("rpi") or {}
    print(f"RPI: {len(rpi.get('quarters', []))} quarters {rpi.get('quarters', ['?'])[0]}..{rpi.get('quarters', ['?'])[-1]}; "
          f"catalysts: {len(payload['catalysts'])}; wrote {OUT.name} ({len(js.encode('utf-8')) / 1e3:.0f} KB) in {time.time() - t_all:.0f}s")
    for f in failed:
        print("FAILED", f, file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
