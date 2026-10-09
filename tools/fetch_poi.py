"""Fetch points of interest for the comparer -> app/data/poi.js (window.HDB_POI).

Sources (all public; requests go through the an outbound HTTP proxy like the pipeline):
  data.gov.sg GeoJSON (coordinates included):
    childcare      ECDA Child Care Services + Kindergartens
    eldercare      MOH Eldercare Services (senior activity / day-care centres)
    funeral        NEA Funeral Parlours, Dedicated Columbaria, Crematoria, Active Cemeteries
    parks          NParks Parks and Nature Reserves (polygons, simplified) + park points
    bus            LTA Bus Stop
    hawkers        NEA Hawker Centres
  data.gov.sg datastore + OneMap geocode (postal code, cached in poi_cache.json):
    schools        MOE General information of schools
  OpenStreetMap Overpass:
    food           amenity=cafe / restaurant / fast_food / food_court (nodes + way centres)
  Local file:
    sites          curated_sites.json (former burial grounds etc., approximate)

Run:  python fetch_poi.py            (from tools/)   ~3–5 min first time
Any source that fails is logged and skipped; index.html shows "n/a" for that row.
"""

import html
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from onemap_token import attach  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "app" / "data" / "poi.js"
CACHE = HERE / "poi_cache.json"
SITES = HERE / "curated_sites.json"

# Outbound proxy: HDB_PIPELINE_PROXY env var (same name as the pipeline), else the pipeline's
# .env file, else none. Set HDB_PIPELINE_PROXY="" on a home network.
def _proxy():
    import os
    v = os.environ.get("HDB_PIPELINE_PROXY")
    if v is None:
        env = HERE.parent / "hdb-data-pipeline" / ".env"
        if env.exists():
            for line in env.read_text(encoding="utf-8").splitlines():
                if line.strip().startswith("HDB_PIPELINE_PROXY="):
                    v = line.split("=", 1)[1].strip().strip('"').strip("'")
    return v or None
PROXY = _proxy()
H = "https:" + "//"
GOV = H + "data.gov.sg/api/action/datastore_search"
GOV_POLL = H + "api-open.data.gov.sg/v1/public/api/datasets/{id}/poll-download"
GOV_INIT = H + "api-open.data.gov.sg/v1/public/api/datasets/{id}/initiate-download"
ONEMAP = H + "www.onemap.gov.sg/api/common/elastic/search"
OVERPASS = H + "overpass-api.de/api/interpreter"

DATASETS = {
    "schools": "d_688b934f82c1059ed0a6993d2a829089",
    "hawkers": "d_4a086da0a5553be1d89383cd90d07ecd",
    "childcare": "d_5d668e3f544335f8028f546827b773b4",
    "kindergarten": "d_7fe9a72b1afff18e48111772c8d0fd39",
    "eldercare": "d_f0fd1b3643ed8bd34bd403dedd7c1533",
    "funeral_parlour": "d_054b67adc211306beaf5c005be8f5381",
    "columbarium": "d_9b0752e9d3f1f9d957d5d8be2b58dfff",
    "crematorium": "d_7c7c57950ceda95e8efa6cec46029b5d",
    "cemetery": "d_4a9b83ee745c10c3aa5829fb80e09d9c",
    "parks_poly": "d_77d7ec97be83d44f61b85454f844382f",
    "bus": "d_3f172c6feb3f4f92a2f47d93eed2908a",
}


def session() -> requests.Session:
    s = requests.Session()
    if PROXY:
        s.proxies = {"http": PROXY, "https": PROXY}
    s.headers.update({"User-Agent": "hdb-comparer/0.1 (personal research)", "Accept": "*/*"})
    return attach(s)  # OneMap token on OneMap requests when ONEMAP_EMAIL / ONEMAP_PASSWORD are set (onemap_token.py)


# ----------------------------------------------------------------------------- helpers
def desc_fields(desc: str) -> dict:
    """data.gov.sg KML-style Description HTML table -> {field: value}."""
    return {k: html.unescape(v).strip() for k, v in re.findall(r"<th>([^<]+)</th>\s*<td>([^<]*)</td>", desc or "", re.S)}


def prop(props: dict, *names: str) -> str:
    d = desc_fields(props.get("Description", ""))
    for n in names:
        v = props.get(n) or d.get(n)
        if v and str(v).strip() and str(v).strip().lower() not in ("none", "null"):
            return str(v).strip()
    return ""


def tidy(name: str) -> str:
    if not name:
        return ""
    name = re.sub(r"\s+", " ", name).strip()
    name = re.sub(r"(pte\.? ltd\.?|private limited|ltd\.?|llp)\s*$", "", name, flags=re.I).strip(" ,-")
    return " ".join(w if w.isupper() and len(w) <= 3 else w[:1].upper() + w[1:].lower() for w in name.split(" "))


def geojson(s: requests.Session, dataset_id: str) -> dict:
    """poll-download, falling back to initiate-download when the file isn't staged yet."""
    last = None
    for _ in range(10):
        r = s.get(GOV_POLL.format(id=dataset_id), timeout=60)
        last = r.text[:200]
        url = ((r.json().get("data") or {}) if r.ok else {}).get("url")
        if url:
            return s.get(url, timeout=300).json()
        s.get(GOV_INIT.format(id=dataset_id), timeout=60)
        time.sleep(2)
    raise RuntimeError(f"no download url for {dataset_id}: {last}")


def points(gj: dict, name_fn) -> list[dict]:
    out = []
    for f in gj.get("features", []):
        g = f.get("geometry") or {}
        if g.get("type") != "Point":
            continue
        lon, lat = g["coordinates"][:2]
        out.append({"n": name_fn(f.get("properties", {})), "lat": round(lat, 6), "lon": round(lon, 6)})
    return out


def simplify_ring(ring: list, max_pts: int = 40) -> list:
    step = max(1, len(ring) // max_pts)
    pts = ring[::step]
    return [[round(p[1], 5), round(p[0], 5)] for p in pts]  # -> [lat, lon]


def with_source(fn, label: str, default):
    try:
        v = fn()
        print(f"  {label}: {len(v)}")
        return v
    except Exception as e:  # noqa: BLE001 - every layer is optional
        print(f"  {label}: FAILED ({e})", file=sys.stderr)
        return default


# ----------------------------------------------------------------------------- sources
def fetch_schools(s: requests.Session, cache: dict) -> list[dict]:
    rows, offset = [], 0
    while True:
        r = s.get(GOV, params={"resource_id": DATASETS["schools"], "limit": 500, "offset": offset}, timeout=60)
        r.raise_for_status()
        recs = r.json()["result"]["records"]
        if not recs:
            break
        rows.extend(recs)
        offset += len(recs)
    out = []
    for sc in rows:
        ll = geocode_postal(s, cache, str(sc["postal_code"]).zfill(6))
        if ll:
            out.append({"n": sc["school_name"].title(), "lvl": sc["mainlevel_code"], "type": sc["type_code"].title(), "lat": round(ll[0], 6), "lon": round(ll[1], 6)})
    return out


def geocode_postal(s: requests.Session, cache: dict, postal: str):
    if cache.get(postal):
        return cache[postal]
    for attempt in range(6):
        r = s.get(ONEMAP, params={"searchVal": postal, "returnGeom": "Y", "getAddrDetails": "Y", "pageNum": 1}, timeout=30)
        if r.status_code == 429:
            time.sleep(2 * (attempt + 1))
            continue
        res = (r.json().get("results") or []) if r.ok else []
        val = [float(res[0]["LATITUDE"]), float(res[0]["LONGITUDE"])] if res else None
        if val:
            cache[postal] = val
        time.sleep(0.4)
        return val
    return None


def fetch_hawkers(s):
    return points(geojson(s, DATASETS["hawkers"]), lambda p: tidy(prop(p, "NAME")) or "Hawker centre")


def fetch_childcare(s):
    def nm(p):
        return tidy(prop(p, "NAME")) or tidy(prop(p, "ADDRESSSTREETNAME").split(",")[1] if "," in prop(p, "ADDRESSSTREETNAME") else "") or "Childcare centre"
    cc = [dict(x, t="childcare") for x in points(geojson(s, DATASETS["childcare"]), nm)]
    kg = [dict(x, t="kindergarten") for x in points(geojson(s, DATASETS["kindergarten"]), nm)]
    return cc + kg


def fetch_eldercare(s):
    return points(geojson(s, DATASETS["eldercare"]), lambda p: tidy(prop(p, "NAME")) or "Eldercare centre")


def fetch_funeral(s):
    out = []
    for key, t in (("funeral_parlour", "funeral parlour"), ("columbarium", "columbarium"), ("crematorium", "crematorium"), ("cemetery", "cemetery")):
        out += [dict(x, t=t) for x in points(geojson(s, DATASETS[key]), lambda p: tidy(prop(p, "NAME")) or t)]
    return out


def fetch_parks(s):
    gj = geojson(s, DATASETS["parks_poly"])
    out = []
    for f in gj.get("features", []):
        g = f.get("geometry") or {}
        rings = g["coordinates"] if g.get("type") == "Polygon" else [r for poly in g.get("coordinates", []) for r in poly] if g.get("type") == "MultiPolygon" else []
        if not rings:
            continue
        outer = max(rings, key=len)
        ring = simplify_ring(outer)
        lat = sum(p[0] for p in ring) / len(ring)
        lon = sum(p[1] for p in ring) / len(ring)
        name = tidy(prop(f.get("properties", {}), "NAME")) or "Park"
        out.append({"n": name, "lat": round(lat, 6), "lon": round(lon, 6), "ring": ring, "reserve": prop(f.get("properties", {}), "N_RESERVE") == "1"})
    return out


def fetch_bus(s):
    def nm(p):
        n = prop(p, "BUS_STOP_NUM", "BUS_STOP_N", "LOC_DESC")
        return f"Bus stop {n}" if n else "Bus stop"
    return points(geojson(s, DATASETS["bus"]), nm)


FOOD_CACHE = HERE / "osm_food_cache.json"


def fetch_food(s):
    """One Overpass query per map tile for all four amenities (Overpass rate-limits to a
    couple of slots, so fewer, smaller queries win). Each tile is cached in
    osm_food_cache.json for 30 days; a tile that keeps failing is skipped, not fatal."""
    cache = json.loads(FOOD_CACHE.read_text(encoding="utf-8")) if FOOD_CACHE.exists() else {}
    tiles = [(1.20, 103.60, 1.34, 103.83), (1.20, 103.83, 1.34, 104.05), (1.34, 103.60, 1.48, 103.83),
             (1.34, 103.83, 1.41, 103.94), (1.34, 103.94, 1.41, 104.05), (1.41, 103.83, 1.48, 103.94), (1.41, 103.94, 1.48, 104.05)]  # NE quarter split: densest
    out, seen, failed = [], set(), 0
    for bbox in tiles:
        key = f"all|{bbox}"
        if key not in cache or time.time() - cache[key]["t"] > 30 * 86400:
            q = f'[out:json][timeout:40];nwr["amenity"~"^(cafe|restaurant|fast_food|food_court)$"]({bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]});out center;'
            r = None
            for attempt in range(4):
                r = s.get(OVERPASS, params={"data": q}, timeout=90)
                if r.ok:
                    break
                time.sleep(30 * (attempt + 1))  # 429/504: wait for a free slot
            if not (r and r.ok):
                failed += 1
                print(f"    tile {bbox}: skipped ({r.status_code if r is not None else 'no response'})", file=sys.stderr)
                continue
            rows = []
            for el in r.json().get("elements", []):
                tags = el.get("tags", {})
                lat, lon = (el.get("lat"), el.get("lon")) if el["type"] == "node" else ((el.get("center") or {}).get("lat"), (el.get("center") or {}).get("lon"))
                if lat is None:
                    continue
                rows.append({"id": el["id"], "n": tags.get("name", tags["amenity"].replace("_", " ").title()), "t": tags["amenity"], "lat": round(lat, 6), "lon": round(lon, 6)})
            cache[key] = {"t": time.time(), "rows": rows}
            FOOD_CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
            print(f"    tile {bbox}: {len(rows)}")
            time.sleep(3)
        for row in cache[key]["rows"]:
            if row["id"] in seen:
                continue
            seen.add(row["id"])
            out.append({k: v for k, v in row.items() if k != "id"})
    if failed:
        print(f"    {failed} tile(s) skipped — re-run later to fill them in", file=sys.stderr)
    return out


def fetch_shops(s, value, label):
    """OSM shop=<value> (malls, supermarkets) — one query per tile; cached 30 days per kind.
    Keeps the brand for supermarkets so the map can say 'FairPrice' / 'Sheng Siong'."""
    cache = HERE / f"osm_{value}_cache.json"
    if cache.exists() and time.time() - cache.stat().st_mtime < 30 * 86400:
        return json.loads(cache.read_text(encoding="utf-8"))
    tiles = [(1.20, 103.60, 1.34, 103.83), (1.20, 103.83, 1.34, 104.05), (1.34, 103.60, 1.48, 103.83), (1.34, 103.83, 1.48, 104.05)]
    out, seen = [], set()
    for bbox in tiles:
        q = f'[out:json][timeout:30];nwr["shop"="{value}"]({bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]});out center;'
        r = None
        for attempt in range(4):
            r = s.get(OVERPASS, params={"data": q}, timeout=60)
            if r.ok:
                break
            time.sleep(30 * (attempt + 1))
        if not (r and r.ok):
            print(f"    {label} tile {bbox}: skipped ({r.status_code if r is not None else 'no response'})", file=sys.stderr)
            continue
        for el in r.json().get("elements", []):
            tags = el.get("tags", {})
            name = tags.get("name") or tags.get("brand")
            if el["id"] in seen or not name:
                continue
            seen.add(el["id"])
            lat, lon = (el.get("lat"), el.get("lon")) if el["type"] == "node" else ((el.get("center") or {}).get("lat"), (el.get("center") or {}).get("lon"))
            if lat is None:
                continue
            row = {"n": name, "lat": round(lat, 6), "lon": round(lon, 6)}
            if tags.get("brand"):
                row["b"] = tags["brand"]
            out.append(row)
        time.sleep(2)
    cache.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    return out


def fetch_malls(s):
    return fetch_shops(s, "mall", "malls")


def fetch_supermarkets(s):
    return fetch_shops(s, "supermarket", "supermarkets")


def load_sites():
    if not SITES.exists():
        return []
    return json.loads(SITES.read_text(encoding="utf-8")).get("sites", [])


# ----------------------------------------------------------------------------- main
def main() -> int:
    s = session()
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    print("fetching:")
    payload = {
        "schools": with_source(lambda: fetch_schools(s, cache), "schools", []),
        "hawkers": with_source(lambda: fetch_hawkers(s), "hawkers", []),
        "childcare": with_source(lambda: fetch_childcare(s), "childcare + kindergartens", []),
        "eldercare": with_source(lambda: fetch_eldercare(s), "eldercare", []),
        "funeral": with_source(lambda: fetch_funeral(s), "funeral/columbaria/crematoria/cemeteries", []),
        "parks": with_source(lambda: fetch_parks(s), "parks (polygons)", []),
        "bus": with_source(lambda: fetch_bus(s), "bus stops", []),
        "food": with_source(lambda: fetch_food(s), "cafes & eateries (OSM)", []),
        "malls": with_source(lambda: fetch_malls(s), "shopping malls (OSM)", []),
        "supermarkets": with_source(lambda: fetch_supermarkets(s), "supermarkets (OSM)", []),
        "sites": with_source(load_sites, "curated sites", []),
        "generated_at": datetime.now(timezone.utc).astimezone().isoformat(timespec="minutes"),
    }
    CACHE.write_text(json.dumps(cache))
    OUT.write_text("window.HDB_POI=" + json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + ";", encoding="utf-8")
    print(f"wrote {OUT.name} ({OUT.stat().st_size / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
