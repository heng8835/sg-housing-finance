"""Bus routes as ordered stop sequences -> app/data/bus_routes.js (window.HDB_BUS).

Source: OpenStreetMap bus route relations (route=bus) via Overpass, fetched in tiles and
merged. Each route keeps its service number, from/to, and the ordered list of stops
(lat, lon, LTA stop code from the node's `ref`, name). Straight lines between stops are
drawn on the map — enough to see where a service goes; road-accurate geometry is not kept
(would be ~30 MB). Coverage/accuracy is community-maintained; LTA DataMall is the
authoritative source but needs an API key.

Run:  python fetch_bus_routes.py         (from tools/)   ~1–2 min, cached 30 days
"""

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_poi import OVERPASS, session  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "app" / "data" / "bus_routes.js"
CACHE = HERE / "osm_bus_cache.json"
TILES = [(1.20, 103.60, 1.34, 103.83), (1.20, 103.83, 1.34, 104.05), (1.34, 103.60, 1.48, 103.83), (1.34, 103.83, 1.48, 104.05)]


def overpass(s, q):
    for attempt in range(5):
        r = s.get(OVERPASS, params={"data": q}, timeout=90)
        if r.ok:
            return r.json()
        time.sleep(20 * (attempt + 1))
    r.raise_for_status()


def fetch_raw(s):
    if CACHE.exists() and time.time() - CACHE.stat().st_mtime < 30 * 86400:
        return json.loads(CACHE.read_text(encoding="utf-8"))
    rels, nodes = {}, {}
    for bbox in TILES:
        q = f'[out:json][timeout:40];rel["route"="bus"]({bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]})->.r;.r out body;node(r.r);out body;'
        for el in overpass(s, q).get("elements", []):
            (rels if el["type"] == "relation" else nodes)[el["id"]] = el
        print(f"  tile {bbox}: {len(rels)} routes, {len(nodes)} stop nodes so far")
        time.sleep(3)
    raw = {"rels": list(rels.values()), "nodes": list(nodes.values())}
    CACHE.write_text(json.dumps(raw), encoding="utf-8")
    return raw


def build(raw):
    nodes = {n["id"]: n for n in raw["nodes"]}
    routes, stop_index = [], {}
    for rel in raw["rels"]:
        t = rel.get("tags", {})
        ref = t.get("ref") or t.get("name", "")
        if not ref:
            continue
        members = [m for m in rel.get("members", []) if m["type"] == "node" and m["ref"] in nodes]
        roles = {m.get("role", "") for m in members}
        prefer = "platform" if any(r.startswith("platform") for r in roles) else "stop"
        seq = [m for m in members if m.get("role", "").startswith(prefer)] or members
        stops = []
        for m in seq:
            n = nodes[m["ref"]]
            nt = n.get("tags", {})
            code = nt.get("ref") or nt.get("asset_ref") or ""
            stops.append([round(n["lat"], 5), round(n["lon"], 5), code, nt.get("name", "")])
        if len(stops) < 2:
            continue
        idx = len(routes)
        routes.append({"ref": str(ref), "from": t.get("from", stops[0][3]), "to": t.get("to", stops[-1][3]), "name": t.get("name", ""), "stops": stops})
        for st in stops:
            if st[2]:
                stop_index.setdefault(st[2], []).append(idx)
    routes_sorted = sorted(range(len(routes)), key=lambda i: (len(routes[i]["ref"]), routes[i]["ref"]))
    remap = {old: new for new, old in enumerate(routes_sorted)}
    routes = [routes[i] for i in routes_sorted]
    stop_index = {code: sorted(remap[i] for i in idxs) for code, idxs in stop_index.items()}
    return routes, stop_index


def main() -> int:
    s = session()
    print("fetching bus route relations from OSM:")
    raw = fetch_raw(s)
    routes, stop_index = build(raw)
    payload = {"routes": routes, "stops": stop_index, "generated_at": datetime.now(timezone.utc).astimezone().isoformat(timespec="minutes")}
    OUT.write_text("window.HDB_BUS=" + json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + ";", encoding="utf-8")
    services = len({r["ref"] for r in routes})
    print(f"wrote {OUT.name}: {len(routes)} route directions, {services} services, {len(stop_index)} stops with codes, {OUT.stat().st_size / 1e6:.1f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
