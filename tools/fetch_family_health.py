"""Family & health layers for the map -> app/data/family.js (window.HDB_FAMILY) + app/data/flood.js (window.HDB_FLOOD).

Sources (all public):
  childcare    ECDA "Listing of Centres" (data.gov.sg CSV, refreshed daily): every licensed
               preschool with vacancy status per programme level for the current + next 6 months.
               Positions: postal code -> ECDA Child Care Services / Kindergartens GeoJSON points
               (same agency), else OneMap search (cached).
  clinics      MOH "CHAS Clinics" (data.gov.sg GeoJSON, coordinates included).
  polyclinics  MOH "Cervical Screening Centre" GeoJSON (every polyclinic offers it, 26 sites),
               + NEW_POLYCLINICS below for ones opened since (geocoded with OneMap).
  flood        PUB "List of Flood Prone Areas" PDF, hand-transcribed in curated_flood_prone.json
               placed at the OpenStreetMap junction of the two named roads ("near"), else
               with OneMap search ("q"); cached; road/junction level, approximate.
               PUB's website terms allow personal viewing only, so the points go to their own file,
               data/flood.js: the PRIVATE build only (feature floodData; tools/stage_site.py --public and
               tools/public_export.py leave it out; the app links to PUB's own list instead).

Output (compact JSON, < 600 KB):
  family.js  { generated_at, sources: [{layer, url, licence, asOf}], legend: {...},
               childcare:   [{n, lat, lon, kind, vac: {level: "AAALLFF"}, upd, spark?}],
               clinics:     [{n, lat, lon, kind, cdmp?}],
               polyclinics: [{n, lat, lon}] }
  flood.js   { generated_at, sources: [flood, geocoding (flood junctions)], legend: {flood},
               flood:       [{n, lat, lon, asOf}] }
  vac strings: one char per month, first = the dataset's current month (see legend.vac).
  The app merges the two (modules/explore/family.js familyData) while floodData is on.

Run:  python tools/fetch_family_health.py      (~1 min warm, ~5-10 min first time)
Proxy: HDB_PIPELINE_PROXY env var, else hdb-data-pipeline/.env, else none (as fetch_poi.py).
Cache: tools/family_health_cache.json (gitignored). Any layer that fails is logged and left empty.
"""

import csv
import io
import json
import math
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "app" / "data" / "family.js"
FLOOD_OUT = HERE.parent / "app" / "data" / "flood.js"  # private build only (PUB terms; feature floodData)
FLOOD_LAYERS = ("flood", "geocoding (flood junctions)")  # source rows that go with the flood points
CACHE = HERE / "family_health_cache.json"
POI_CACHE = HERE / "poi_cache.json"  # fetch_poi.py's postal -> [lat, lon] cache, read-only seed
FLOOD = HERE / "curated_flood_prone.json"


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
GOV_POLL = H + "api-open.data.gov.sg/v1/public/api/datasets/{id}/poll-download"
GOV_INIT = H + "api-open.data.gov.sg/v1/public/api/datasets/{id}/initiate-download"
GOV_META = H + "api-production.data.gov.sg/v2/public/api/datasets/{id}/metadata"
GOV_PAGE = H + "data.gov.sg/datasets/{id}/view"
ONEMAP = H + "www.onemap.gov.sg/api/common/elastic/search"
OVERPASS = H + "overpass-api.de/api/interpreter"
LICENCE = "Singapore Open Data Licence v1.0 (data.gov.sg/open-data-licence)"

DATASETS = {
    "centres": "d_696c994c50745b079b3684f0e90ffc53",       # ECDA Listing of Centres (CSV)
    "cc_points": "d_5d668e3f544335f8028f546827b773b4",     # ECDA Child Care Services (GeoJSON)
    "kg_points": "d_7fe9a72b1afff18e48111772c8d0fd39",     # ECDA Kindergartens (GeoJSON)
    "chas": "d_548c33ea2d99e29ec63a7cc9edcccedc",          # MOH CHAS Clinics (GeoJSON)
    "polyclinics": "d_3ca2a28059588f297908b32da4ac3cbe",   # MOH Cervical Screening Centre = polyclinics
}

# Polyclinics opened after the MOH GeoJSON was last refreshed. Add rows as new ones open.
NEW_POLYCLINICS = [
    {"n": "Serangoon Polyclinic", "q": ["SERANGOON POLYCLINIC", "NHG SERANGOON POLYCLINIC"], "opened": "2025-11-29",
     "src": H + "www.moh.gov.sg/newsroom/speech-by-mr-ong-ye-kung--minister-for-health-and-coordinating-minister-for-social-policies--at-the-official-opening-of-serangoon-polyclinic--29-november-2025/"},
    {"n": "Tengah Polyclinic", "q": ["TENGAH POLYCLINIC", "PARC POINT"], "opened": "2026-02-28",
     "src": H + "www.nuhs.edu.sg/docs/default-source/newsroom-document/nup/2026/nup-media-release---tengah-polyclinic-opens-for-residents.pdf"},
]

LEVELS = [("infant", "inf"), ("pg", "pg"), ("n1", "n1"), ("n2", "n2"), ("k1", "k1"), ("k2", "k2")]
MONTHS = ["current", "next", "third", "fourth", "fifth", "sixth", "seventh"]
VAC_CODE = {"available": "A", "limited": "L", "full": "F", "not applicable": "-"}
KIND = {"CC": "cc", "KN": "kg", "DS": "ds", "EYC": "eyc", "EYC-DS": "eyc"}
LEGEND = {
    "childcare.kind": {"cc": "child care centre", "kg": "kindergarten (incl. MOE Kindergarten)",
                       "ds": "PCF dual-service centre (child care + kindergarten, '(DS)' in name)",
                       "eyc": "Early Years Centre (infant to Nursery 1)"},
    "childcare.vac": {"levels": {"inf": "Infant (2-18 months)", "pg": "Playgroup", "n1": "Nursery 1", "n2": "Nursery 2",
                                 "k1": "Kindergarten 1", "k2": "Kindergarten 2"},
                      "codes": {"A": "Available", "L": "Limited", "F": "Full", "-": "Not applicable that month", "?": "other/unknown"},
                      "months": "7 chars: ECDA's current month, then the next 6 months; a level the centre never offers is omitted"},
    "childcare.spark": "1 = SPARK-certified (ECDA quality rating)",
    "clinics.kind": {"gp": "CHAS GP / medical clinic"},
    "clinics.cdmp": "1 = also in the Chronic Disease Management Programme",
    "flood": "Approximate road/junction position of a PUB-listed flood-prone area (not the flood extent)",
}


# ----------------------------------------------------------------------------- http
try:
    import requests  # noqa: F401
    _S = requests.Session()
    if PROXY:
        _S.proxies = {"http": PROXY, "https": PROXY}
    _S.headers.update({"User-Agent": "hdb-comparer/0.1 (personal research)", "Accept": "*/*"})

    def _raw_get(url, params=None):
        r = _S.get(url, params=params, timeout=120)
        return r.status_code, r.content
except ImportError:
    _OPENER = urllib.request.build_opener(*([urllib.request.ProxyHandler({"http": PROXY, "https": PROXY})] if PROXY else []))

    def _raw_get(url, params=None):
        if params:
            url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={"User-Agent": "hdb-comparer/0.1 (personal research)", "Accept": "*/*"})
        try:
            with _OPENER.open(req, timeout=120) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()


def get(url, params=None, tries=8, base_wait=4.0):
    """GET with backoff on 429/5xx (data.gov.sg and OneMap rate-limit shared IPs hard)."""
    status, body = 0, b""
    for attempt in range(tries):
        try:
            status, body = _raw_get(url, params)
        except Exception as e:  # noqa: BLE001 - network hiccup, retry
            status, body = 0, str(e).encode()
        if 200 <= status < 300:  # poll-download answers 201
            return body
        if status in (0, 429) or status >= 500:
            time.sleep(base_wait * (attempt + 1))
            continue
        break
    raise RuntimeError(f"GET {url} -> {status}: {body[:160]!r}")


def gov_file(dataset_id: str) -> bytes:
    """Whole dataset file via poll-download, initiating the download when it isn't staged."""
    for _ in range(10):
        j = json.loads(get(GOV_POLL.format(id=dataset_id)))
        url = (j.get("data") or {}).get("url")
        if url:
            return get(url)
        get(GOV_INIT.format(id=dataset_id))
        time.sleep(3)
    raise RuntimeError(f"no download url for {dataset_id}")


def gov_updated(dataset_id: str):
    try:
        d = json.loads(get(GOV_META.format(id=dataset_id), tries=3)).get("data") or {}
        return (d.get("lastUpdatedAt") or "")[:10] or None
    except Exception:  # noqa: BLE001 - metadata is nice-to-have
        return None


# ----------------------------------------------------------------------------- helpers
ACRONYMS = {"MOE", "PCF", "NTUC", "YMCA", "YWCA", "PAP", "EYC", "NHG", "NUP", "SAF", "MOH", "CHAS", "AMK", "ICC", "UK", "USA", "ABC", "MCYC", "CDAC", "ECDA", "DA", "GP", "JP"}


def _word(w: str) -> str:
    core = w.strip("()&,.-'@")
    if core.upper() in ACRONYMS or (core and not re.search(r"[aeiouy]", core, re.I) and core.isalpha() and len(core) <= 3):
        return w.upper()
    return w[:1].upper() + w[1:].lower() if w[:1].isalpha() else w[:1] + w[1:2].upper() + w[2:].lower()


def tidy(name: str) -> str:
    name = re.sub(r"\s+", " ", name or "").strip()
    name = re.sub(r"(pte\.? ltd\.?|private limited|ltd\.?|llp)\s*$", "", name, flags=re.I).strip(" ,-")
    if name.isupper() or name.islower():
        name = " ".join(_word(w) for w in name.split(" "))
    return name


def in_sg(lat, lon) -> bool:
    return 1.15 < lat < 1.48 and 103.59 < lon < 104.10


def desc_fields(desc: str) -> dict:
    import html
    return {k: html.unescape(v).strip() for k, v in re.findall(r"<th>([^<]+)</th>\s*<td>([^<]*)</td>", desc or "", re.S)}


def r6(x):
    return round(float(x), 6)


def dist_m(a, b):
    dy = (a[0] - b[0]) * 111320
    dx = (a[1] - b[1]) * 111320 * math.cos(math.radians(a[0]))
    return math.hypot(dx, dy)


class OneMap:
    """OneMap elastic search, cached per (query, page); polite 0.4 s pacing like fetch_poi.py."""

    def __init__(self, cache: dict):
        self.c = cache.setdefault("onemap", {})
        self.calls = 0

    def page(self, q: str, n: int = 1):
        key = f"{q}|{n}"
        if key not in self.c:
            j = json.loads(get(ONEMAP, {"searchVal": q, "returnGeom": "Y", "getAddrDetails": "Y", "pageNum": n}, base_wait=3.0))
            self.c[key] = {"pages": j.get("totalNumPages", 0),
                           "rows": [{"v": r["SEARCHVAL"], "road": r.get("ROAD_NAME", ""), "pc": r.get("POSTAL", ""),
                                     "lat": float(r["LATITUDE"]), "lon": float(r["LONGITUDE"])} for r in j.get("results", [])]}
            self.calls += 1
            time.sleep(0.4)
        return self.c[key]

    def first(self, q: str):
        rows = self.page(q)["rows"]
        return (rows[0]["lat"], rows[0]["lon"]) if rows else None




def osm_junction(cache: dict, a: str, b: str, max_m: float = 250):
    """Where roads a and b meet, from OpenStreetMap: the nodes both named ways share (centroid
    of the nearest cluster), else the closest pair of vertices if within max_m. Cached."""
    c = cache.setdefault("osm_junction", {})
    key = f"{a}|{b}"
    if key not in c:
        bbox = "1.15,103.59,1.48,104.10"
        na, nb = a.title().replace("'S ", "'s "), b.title().replace("'S ", "'s ")
        q = f'[out:json][timeout:60];(way["highway"]["name"="{na}"]({bbox}););out geom;(way["highway"]["name"="{nb}"]({bbox}););out geom;'
        j = json.loads(get(OVERPASS, {"data": q}, tries=5, base_wait=20.0))
        ways = j.get("elements", [])
        pts = {n: [] for n in (na, nb)}
        for w in ways:
            nm = (w.get("tags") or {}).get("name")
            if nm in pts:
                pts[nm] += [(round(g["lat"], 7), round(g["lon"], 7)) for g in w.get("geometry", [])]
        c[key] = [pts[na], pts[nb]]
        time.sleep(2)
    pa, pb = c[key]
    if not pa or not pb:
        return None
    pa, pb = [tuple(p) for p in pa], [tuple(p) for p in pb]
    shared = sorted(set(pa) & set(pb))
    if shared:
        cluster = [p for p in shared if dist_m(p, shared[0]) < 300]
        return (sum(p[0] for p in cluster) / len(cluster), sum(p[1] for p in cluster) / len(cluster))
    d, x, y = min((dist_m(x, y), x, y) for x in pa for y in pb)
    return ((x[0] + y[0]) / 2, (x[1] + y[1]) / 2) if d <= max_m else None


# ----------------------------------------------------------------------------- layers
def postal_seed(cache: dict) -> dict:
    """postal -> [lat, lon] from ECDA's own GeoJSON points, plus fetch_poi.py's cache."""
    seed = {}
    if POI_CACHE.exists():
        try:
            seed.update({k: v for k, v in json.loads(POI_CACHE.read_text(encoding="utf-8")).items() if v})
        except Exception:  # noqa: BLE001
            pass
    for key in ("cc_points", "kg_points"):
        try:
            gj = json.loads(gov_file(DATASETS[key]))
        except Exception as e:  # noqa: BLE001
            print(f"    {key}: FAILED ({e}) - falling back to OneMap", file=sys.stderr)
            continue
        for f in gj.get("features", []):
            g, p = f.get("geometry") or {}, f.get("properties") or {}
            pc = str(p.get("ADDRESSPOSTALCODE") or "").strip().zfill(6)
            if g.get("type") == "Point" and pc != "000000":
                seed[pc] = [g["coordinates"][1], g["coordinates"][0]]
    seed.update(cache.get("postal", {}))
    return seed


def fetch_childcare(cache: dict, om: OneMap, stats: dict):
    rows = list(csv.DictReader(io.StringIO(gov_file(DATASETS["centres"]).decode("utf-8-sig"))))
    seed = postal_seed(cache)
    own = cache.setdefault("postal", {})
    best = {}
    for r in rows:  # one row per centre_code, latest update wins
        if (r.get("centre_name") or "na").strip().lower() == "na":
            continue
        code = r.get("centre_code") or r["centre_name"]
        if code not in best or (r.get("last_updated") or "") > (best[code].get("last_updated") or ""):
            best[code] = r
    out, src = [], {"ecda_points_or_poi_cache": 0, "onemap_postal": 0, "onemap_address": 0, "failed": 0}
    for r in best.values():
        pc = (r.get("postal_code") or "").strip().zfill(6)
        ll = seed.get(pc) if pc != "000000" else None
        if ll and not in_sg(*ll):
            ll = None
        if ll:
            src["onemap_postal" if pc in own else "ecda_points_or_poi_cache"] += 1
        else:
            ll = om.first(pc) if re.fullmatch(r"\d{6}", pc) and pc != "000000" else None
            if ll:
                src["onemap_postal"] += 1
                own[pc] = list(ll)
            else:
                addr = re.sub(r",?\s*\d{6}\s*$", "", r.get("centre_address") or "").replace(",", " ")
                ll = om.first(addr) if addr.strip() and addr.strip().lower() != "na" else None
                if ll:
                    src["onemap_address"] += 1
                else:
                    src["failed"] += 1
                    continue
        vac = {}
        for lvl, short in LEVELS:
            s = "".join(VAC_CODE.get((r.get(f"{lvl}_vacancy_{m}_month") or "").strip().lower(), "?") for m in MONTHS)
            if s.strip("-"):
                vac[short] = s
        row = {"n": tidy(r["centre_name"]), "lat": r6(ll[0]), "lon": r6(ll[1]),
               "kind": KIND.get((r.get("service_model") or "").strip(), "cc"), "vac": vac, "upd": r.get("last_updated") or None}
        if (r.get("spark_certified") or "").strip().lower() == "yes":
            row["spark"] = 1
        out.append(row)
    stats["childcare_geocode"] = src
    return out


def fetch_clinics(om: OneMap, stats: dict):
    gj = json.loads(gov_file(DATASETS["chas"]))
    out, fixed, dropped = [], 0, 0
    for f in gj.get("features", []):
        g = f.get("geometry") or {}
        if g.get("type") != "Point":
            continue
        d = desc_fields((f.get("properties") or {}).get("Description"))
        lat, lon = g["coordinates"][1], g["coordinates"][0]
        if not in_sg(lat, lon):  # a few source points are off the island: re-place by postal code
            ll = om.first(str(d.get("POSTAL_CD") or "").zfill(6)) or om.first(f"{d.get('BLK_HSE_NO', '')} {d.get('STREET_NAME', '')}".strip())
            if not ll:
                dropped += 1
                continue
            (lat, lon), fixed = ll, fixed + 1
        row = {"n": tidy(d.get("HCI_NAME", "")) or "CHAS clinic", "lat": r6(lat), "lon": r6(lon), "kind": "gp"}
        if "CDMP" in (d.get("CLINIC_PROGRAMME_CODE") or "").upper().split(","):
            row["cdmp"] = 1
        out.append(row)
    stats["clinics_off_island"] = {"re_geocoded": fixed, "dropped": dropped}
    return out


def fetch_polyclinics(om: OneMap, stats: dict):
    gj = json.loads(gov_file(DATASETS["polyclinics"]))
    out = []
    for f in gj.get("features", []):
        g, p = f.get("geometry") or {}, f.get("properties") or {}
        if g.get("type") == "Point":
            name = re.sub(r"(?i)sengkang", "Sengkang", tidy(p.get("NAME") or "Polyclinic"))
            out.append({"n": name, "lat": r6(g["coordinates"][1]), "lon": r6(g["coordinates"][0])})
    have = {x["n"].lower() for x in out}
    added = []
    for np in NEW_POLYCLINICS:
        if np["n"].lower() in have:
            continue
        ll = next((x for x in (om.first(q) for q in np["q"]) if x), None)
        if ll:
            out.append({"n": np["n"], "lat": r6(ll[0]), "lon": r6(ll[1])})
            added.append(np["n"])
        else:
            print(f"    polyclinic {np['n']}: not found on OneMap", file=sys.stderr)
    stats["polyclinics_added"] = added
    return out


def fetch_flood(cache: dict, om: OneMap, stats: dict):
    cur = json.loads(FLOOD.read_text(encoding="utf-8"))
    out, how = [], {"near": 0, "q": 0, "failed": []}
    for a in cur["areas"]:
        gc = a.get("geocode") or {}
        ll = None
        if gc.get("near"):
            try:
                ll = osm_junction(cache, *gc["near"])
            except Exception as e:  # noqa: BLE001 - Overpass busy: fall back to OneMap q
                print(f"    flood {a['sn']}: Overpass failed ({e})", file=sys.stderr)
        if ll:
            how["near"] += 1
        else:
            ll = next((x for x in (om.first(q) for q in gc.get("q", [])) if x), None)
            if ll:
                how["q"] += 1
        if not ll:
            how["failed"].append(a["sn"])
            continue
        out.append({"n": a["location"], "lat": r6(ll[0]), "lon": r6(ll[1]), "asOf": cur["asOf"]})
    stats["flood_geocode"] = how
    return out, cur


def with_layer(fn, label, default):
    try:
        v = fn()
        print(f"  {label}: {len(v[0]) if isinstance(v, tuple) else len(v)}")
        return v
    except Exception as e:  # noqa: BLE001 - every layer is optional
        print(f"  {label}: FAILED ({e})", file=sys.stderr)
        return default


# ----------------------------------------------------------------------------- main
def main() -> int:
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    om, stats = OneMap(cache), {}
    print("fetching:")
    try:
        childcare = with_layer(lambda: fetch_childcare(cache, om, stats), "childcare (ECDA listing)", [])
        clinics = with_layer(lambda: fetch_clinics(om, stats), "CHAS clinics", [])
        polyclinics = with_layer(lambda: fetch_polyclinics(om, stats), "polyclinics", [])
        flood, cur = with_layer(lambda: fetch_flood(cache, om, stats), "flood-prone areas", ([], {}))
    finally:
        CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    onemap_src = {"layer": "geocoding", "url": H + "www.onemap.gov.sg", "licence": "OneMap search API, Singapore Land Authority (attribution: OneMap / SLA)", "asOf": None}
    sources = [
        {"layer": "childcare", "url": GOV_PAGE.format(id=DATASETS["centres"]), "licence": LICENCE, "asOf": gov_updated(DATASETS["centres"]),
         "publisher": "Early Childhood Development Agency (ECDA)"},
        {"layer": "childcare (positions)", "url": GOV_PAGE.format(id=DATASETS["cc_points"]), "licence": LICENCE, "asOf": gov_updated(DATASETS["cc_points"]),
         "publisher": "ECDA (Child Care Services + Kindergartens GeoJSON)"},
        {"layer": "clinics", "url": GOV_PAGE.format(id=DATASETS["chas"]), "licence": LICENCE, "asOf": gov_updated(DATASETS["chas"]), "publisher": "Ministry of Health (MOH)"},
        {"layer": "polyclinics", "url": GOV_PAGE.format(id=DATASETS["polyclinics"]), "licence": LICENCE, "asOf": gov_updated(DATASETS["polyclinics"]),
         "publisher": "MOH (Cervical Screening Centre = all polyclinics)"},
    ] + [{"layer": "polyclinics", "url": p["src"], "licence": "public announcement (fact only)", "asOf": p["opened"], "publisher": p["n"]}
         for p in NEW_POLYCLINICS if p["n"] in stats.get("polyclinics_added", [])] + [
        {"layer": "flood", "url": cur.get("source"), "licence": "PUB public list, hand-transcribed (attribute: Source: PUB)", "asOf": cur.get("asOf"),
         "publisher": cur.get("publisher")},
        onemap_src,
        {"layer": "geocoding (flood junctions)", "url": H + "www.openstreetmap.org/copyright", "licence": "ODbL - (c) OpenStreetMap contributors", "asOf": None},
    ]
    generated = datetime.now(timezone.utc).astimezone().isoformat(timespec="minutes")
    legend = {k: v for k, v in LEGEND.items() if k != "flood"}
    payload = {"generated_at": generated, "sources": [s for s in sources if s["layer"] not in FLOOD_LAYERS], "legend": legend,
               "childcare": childcare, "clinics": clinics, "polyclinics": polyclinics}
    flood_payload = {"generated_at": generated, "sources": [s for s in sources if s["layer"] in FLOOD_LAYERS],
                     "legend": {"flood": LEGEND["flood"]}, "flood": flood}
    OUT.write_text("window.HDB_FAMILY=" + json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + ";", encoding="utf-8")
    FLOOD_OUT.write_text("window.HDB_FLOOD=" + json.dumps(flood_payload, separators=(",", ":"), ensure_ascii=False) + ";", encoding="utf-8")
    print("geocode:", json.dumps(stats), f"(OneMap calls this run: {om.calls})")
    for f in (OUT, FLOOD_OUT):
        print(f"wrote {f.name} ({f.stat().st_size / 1e3:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
