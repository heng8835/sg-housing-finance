"""Estimated public-transport commute minutes: every HDB block -> ~25 job / school hubs.

Writes app/data/commute.js (window.HDB_COMMUTE). Build-time only, no API keys, stdlib only.

THIS IS AN ESTIMATE, not a journey planner. Model (all parameters are read from
app/policy/sg-policy.json (ids commute.*) so the app and the build agree):

  door-to-door = min( walk_only,
                      access(block -> station s) + board + rail(s -> station t) + egress(t -> hub) )

  * access / egress = min(walk, feeder bus): walk = straight-line distance to the nearest
    station exit x detour / walking speed; feeder = fixed overhead (walk to stop + wait) +
    distance x detour / bus speed. Individual bus routes are NOT modelled.
  * board = gate-to-platform + half headway, once.
  * rail = Dijkstra over (station, line) platform nodes built from data.js's ordered line
    lists (HDB_DATA.mrt.lines): each hop = centroid distance x track factor / speed (MRT or
    LRT) + dwell; changing line = transfer penalty; stations < link_max_km apart are joined
    by a walking transfer. Lines that future_rail.js marks "open" (e.g. Punggol Coast) are
    spliced in. Loops (LRT) are closed.
  * a block may start at any of its N nearest stations (by access time).

Output (one Uint8 per block, in HDB_DATA.blocks order; 255 = n/a, capped at 254 min):
  window.HDB_COMMUTE = { generated_at, model, block_count, block_sig, block_order, encoding: "base64-uint8",
    na: 255, params: {id: value}, hubs: [{id, name, cat, lat, lon, approx?, note?}],
    minutes: {hubId: "<base64>"}, validation: [...] }

  block_sig = tools/blockkey.py signature of the data.js used (the app drops the file when it differs).

Run:  python tools/build_commute.py      (after build_data.py; ~10 s)
"""

import base64
import heapq
import json
import math
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

from blockkey import block_sig

HERE = Path(__file__).resolve().parent
APP = HERE.parent / "app"
DATA_JS = APP / "data" / "data.js"
FUTURE_JS = APP / "data" / "future_rail.js"
POLICY = APP / "policy" / "sg-policy.json"  # commute.* params (the fragment was folded in)
OUT = APP / "data" / "commute.js"
NA, CAP = 255, 254

# (id, name, category, lat, lon, note) — coordinates from OneMap search (retrieved 2026-10-07)
# or the HDB_DATA station centroid ("@STATION NAME"). note != None marks an approximation.
HUBS = [
    ("raffles-place", "Raffles Place (CBD)", "work", 1.28435, 103.85107, None),
    ("marina-bay", "Marina Bay Financial Centre", "work", 1.28014, 103.85402, None),
    ("tanjong-pagar", "Tanjong Pagar (Guoco Tower)", "work", 1.27680, 103.84562, None),
    ("bugis", "Bugis", "work", 1.29911, 103.85541, None),
    ("orchard", "Orchard (ION)", "work", 1.30398, 103.83203, None),
    ("novena", "Novena (Tan Tock Seng Hospital)", "work", 1.32137, 103.84569, None),
    ("paya-lebar", "Paya Lebar Central (PLQ)", "work", 1.31771, 103.89341, None),
    ("one-north", "one-north (Fusionopolis / Biopolis)", "work", 1.30005, 103.78820, None),
    ("mbc", "Mapletree Business City / Alexandra", "work", 1.27490, 103.79905, None),
    ("science-park", "Science Park / Kent Ridge", "work", 1.29193, 103.78560, None),
    ("jurong-east", "Jurong East / Jurong Lake District", "work", 1.33329, 103.74328, None),
    ("changi-bp", "Changi Business Park", "work", 1.33404, 103.96292, None),
    ("changi-airport", "Changi Airport", "work", "@CHANGI AIRPORT MRT STATION", None, None),
    ("tampines-rc", "Tampines Regional Centre", "work", 1.35253, 103.94470, None),
    ("woodlands-rc", "Woodlands Regional Centre", "work", 1.43607, 103.78598, None),
    ("punggol-dd", "Punggol Digital District (SIT)", "work", 1.41331, 103.91296, None),
    ("seletar", "Seletar Aerospace Park", "work", 1.40655, 103.85820,
     "Bus-only area: time = rail to the best station + feeder-bus estimate (no route data)."),
    ("tuas", "Tuas industrial (Tuas South Ave 2)", "work", 1.31866, 103.63259,
     "Tuas is very large; this point is in Tuas South, reached by bus from Tuas Link / Tuas West Road. Other parts of Tuas differ by +/-15 min."),
    ("woodlands-checkpoint", "Woodlands Checkpoint (Causeway)", "border", 1.44642, 103.76992,
     "Time to reach the checkpoint only: excludes immigration queues and the Causeway crossing to JB (often 30-90+ min at peak)."),
    ("nus", "NUS (Kent Ridge campus)", "school", 1.29857, 103.77480,
     "Campus is ~1.5 km across; internal shuttle buses not modelled."),
    ("ntu", "NTU", "school", 1.35295, 103.68922,
     "No MRT on campus until the Jurong Region Line (2029): estimate uses a bus from Pioneer / Boon Lay."),
    ("smu", "SMU", "school", 1.29685, 103.85221, None),
    ("intl-dover", "International schools: Dover / Portsdown", "school", 1.30298, 103.77712,
     "Cluster point at UWCSEA Dover; Tanglin Trust (Portsdown) is ~1.5 km east. Most pupils use school buses."),
    ("intl-north", "International schools: Woodlands (SAS)", "school", 1.42538, 103.77450,
     "Cluster point at Singapore American School. Most pupils use school buses."),
    ("intl-east", "International schools: Tampines / East (UWCSEA East)", "school", 1.35809, 103.93129,
     "Cluster point at UWCSEA East; other east-side schools (e.g. Canadian Intl Tanjong Katong) differ. Most pupils use school buses."),
]

# Reference journeys for calibration: (origin station, hub id, station-to-station minutes, door-to-door range, source)
REFERENCES = [
    ("TAMPINES MRT STATION", "raffles-place", 31, (40, 45), "https://www.rome2rio.com/s/Tampines/Raffles-Place-MRT-Station ; singaporemrt.org route planner (31 min, 12 stops)"),
    ("JURONG EAST MRT STATION", "one-north", 15, (15, 20), "https://www.rome2rio.com/s/Jurong-East-MRT-Station/One-north-MRT-Station (15 min)"),
    ("WOODLANDS MRT STATION", "raffles-place", 47, (45, 55), "https://www.rome2rio.com/s/Woodlands-MRT-Station/Raffles-Place-MRT-Station (47 min)"),
    ("PUNGGOL MRT STATION", "paya-lebar", 24, (25, 30), "https://www.rome2rio.com/s/Punggol-MRT-LRT-Station/Paya-Lebar-MRT-Station (24 min incl. transfer)"),
]


def load_js(path: Path) -> dict:
    t = path.read_text(encoding="utf-8")
    return json.loads(t[t.index("=") + 1:].rstrip().rstrip(";"))


def load_params() -> dict:
    """Current value of every commute.* param in the policy file (effective_to null), in file order."""
    doc = json.loads(POLICY.read_text(encoding="utf-8"))
    P = {p["id"]: p["value"] for p in doc["params"] if p["id"].startswith("commute.") and p.get("effective_to") is None}
    if not P:
        raise SystemExit(f"no commute.* params in {POLICY}")
    return P


def km(a_lat, a_lon, b_lat, b_lon) -> float:
    """Equirectangular distance in km (accurate to <0.1% at Singapore's latitude)."""
    x = (b_lon - a_lon) * math.cos(math.radians((a_lat + b_lat) / 2)) * 111.32
    y = (b_lat - a_lat) * 110.574
    return math.hypot(x, y)


class Model:
    def __init__(self, data: dict, future: dict | None, P: dict):
        self.P = P
        m = data["mrt"]
        names = [s["n"] for s in m["stations"]]
        # 1. canonical stations: merge consecutive same-code entries (e.g. "PAYA LEBAR" + "CC9")
        alias = {}
        for line in m["lines"]:
            for k in range(1, len(line["st"])):
                if line["codes"][k] == line["codes"][k - 1]:
                    a, b = line["st"][k - 1], line["st"][k]
                    alias[b] = alias.get(a, a)
        canon = lambda i: alias.get(i, i)  # noqa: E731
        self.st = {}  # canonical index -> {name, lat, lon, exits: [(lat, lon)]}
        for i, s in enumerate(m["stations"]):
            c = canon(i)
            self.st.setdefault(c, {"n": names[c], "lat": m["stations"][c]["lat"], "lon": m["stations"][c]["lon"], "exits": []})
        by_name = {n: i for i, n in enumerate(names)}
        for e in m["exits"]:
            if e["n"] in by_name:
                self.st[canon(by_name[e["n"]])]["exits"].append((e["lat"], e["lon"]))
        for s in self.st.values():
            s["exits"] = s["exits"] or [(s["lat"], s["lon"])]
        # 2. line sequences (canonical, de-duplicated), loops closed
        group = lambda lid: "CC" if lid == "CE" else lid  # noqa: E731 CE trains run through from the CCL
        seqs = []
        for line in m["lines"]:
            seq = []
            for i in line["st"]:
                if not seq or seq[-1] != canon(i):
                    seq.append(canon(i))
            seqs.append((group(line["id"]), "LRT" in line["id"], seq))
            if line["id"] == "BPLRT":  # BP6 -> ... -> BP13 -> back to BP6 (Bukit Panjang)
                bp6 = canon(line["st"][line["codes"].index("BP6")])
                seqs.append(("BPLRT", True, [seq[-1], bp6]))
        # 3. splice in future_rail segments already open (e.g. NEL Punggol Coast)
        self.added = []
        if future:
            fst = future["stations"]
            for fl in future["lines"]:
                if fl["status"] != "open":
                    continue
                ids = []
                for j in fl["st"]:
                    fs = fst[j]
                    near = min(self.st, key=lambda c: km(fs["lat"], fs["lon"], self.st[c]["lat"], self.st[c]["lon"]))
                    if km(fs["lat"], fs["lon"], self.st[near]["lat"], self.st[near]["lon"]) < P["commute.rail.link_max_km"]:
                        ids.append(near)
                    else:
                        new = f"F:{fs['n']}"
                        self.st[new] = {"n": fs["n"].upper() + " (opened " + str(fl["year"]) + ")", "lat": fs["lat"], "lon": fs["lon"], "exits": [(fs["lat"], fs["lon"])]}
                        self.added.append(self.st[new]["n"])
                        ids.append(new)
                hosts = [g for g, _, seq in seqs if any(i in seq for i in ids)]
                gid = max(set(hosts), key=hosts.count) if hosts else fl["id"]
                known = {(a, b) for g, _, seq in seqs if g == gid for a, b in zip(seq, seq[1:])}
                for a, b in zip(ids, ids[1:]):
                    if (a, b) not in known and (b, a) not in known:
                        seqs.append((gid, False, [a, b]))
        # 4. platform graph
        self.adj = {}
        def edge(u, v, w):
            self.adj.setdefault(u, []).append((v, w))
            self.adj.setdefault(v, []).append((u, w))
        plat = {}
        for gid, lrt, seq in seqs:
            speed = P["commute.rail.lrt_speed_kmh"] if lrt else P["commute.rail.mrt_speed_kmh"]
            for a, b in zip(seq, seq[1:]):
                d = km(self.st[a]["lat"], self.st[a]["lon"], self.st[b]["lat"], self.st[b]["lon"])
                edge((a, gid), (b, gid), d * P["commute.rail.track_factor"] / speed * 60 + P["commute.rail.dwell_min"])
                plat.setdefault(a, set()).add(gid); plat.setdefault(b, set()).add(gid)
        self.plat = {c: sorted(g) for c, g in plat.items()}
        for c, gs in self.plat.items():
            for x in range(len(gs)):
                for y in range(x + 1, len(gs)):
                    edge((c, gs[x]), (c, gs[y]), P["commute.rail.transfer_min"])
        cs = list(self.plat)
        self.links = []
        for x in range(len(cs)):
            for y in range(x + 1, len(cs)):
                a, b = self.st[cs[x]], self.st[cs[y]]
                d = km(a["lat"], a["lon"], b["lat"], b["lon"])
                if d < P["commute.rail.link_max_km"]:
                    self.links.append((a["n"], b["n"], round(d * 1000)))
                    w = P["commute.rail.transfer_min"] + self.walk(d)
                    for ga in self.plat[cs[x]]:
                        for gb in self.plat[cs[y]]:
                            edge((cs[x], ga), (cs[y], gb), w)

    def walk(self, d_km: float) -> float:
        return d_km * self.P["commute.walk.detour_factor"] / self.P["commute.walk.speed_kmh"] * 60

    def access(self, d_km: float) -> float:
        """Walk, or feeder bus when that is faster."""
        P = self.P
        bus = P["commute.feeder.overhead_min"] + d_km * P["commute.walk.detour_factor"] / P["commute.feeder.speed_kmh"] * 60
        return min(self.walk(d_km), bus)

    def exit_km(self, lat, lon, c) -> float:
        return min(km(lat, lon, a, b) for a, b in self.st[c]["exits"])

    def station_to(self, lat, lon) -> dict:
        """Dijkstra from a hub point: minutes from each station's platform level to the hub."""
        dist, pq = {}, []
        for c, gs in self.plat.items():
            eg = self.access(self.exit_km(lat, lon, c))
            for g in gs:
                dist[(c, g)] = eg
                pq.append((eg, (c, g)))
        heapq.heapify(pq)
        done = set()
        while pq:
            d, u = heapq.heappop(pq)
            if u in done:
                continue
            done.add(u)
            for v, w in self.adj.get(u, ()):
                if d + w < dist.get(v, math.inf):
                    dist[v] = d + w
                    heapq.heappush(pq, (d + w, v))
        best = {}
        for (c, _g), d in dist.items():
            best[c] = min(best.get(c, math.inf), d)
        return best

    def rail_only(self, origin_c, hub_c) -> float:
        """Platform-to-platform minutes between two stations (for calibration)."""
        dist = {(origin_c, g): 0.0 for g in self.plat[origin_c]}
        pq = [(0.0, k) for k in dist]
        done = set()
        while pq:
            d, u = heapq.heappop(pq)
            if u in done:
                continue
            done.add(u)
            if u[0] == hub_c:
                return d
            for v, w in self.adj.get(u, ()):
                if d + w < dist.get(v, math.inf):
                    dist[v] = d + w
                    heapq.heappush(pq, (d + w, v))
        return math.inf


def main() -> int:
    if not DATA_JS.exists():
        print(f"missing {DATA_JS} - run build_data.py first", file=sys.stderr)
        return 1
    P = load_params()
    data = load_js(DATA_JS)
    future = load_js(FUTURE_JS) if FUTURE_JS.exists() else None
    M = Model(data, future, P)
    st_by_name = {s["n"]: c for c, s in M.st.items()}

    hubs = []
    for hid, name, cat, lat, lon, note in HUBS:
        if isinstance(lat, str):
            s = M.st[st_by_name[lat[1:]]]
            lat, lon = s["lat"], s["lon"]
        h = {"id": hid, "name": name, "cat": cat, "lat": lat, "lon": lon}
        if note:
            h.update(approx=True, note=note)
        hubs.append(h)

    blocks = data["blocks"]
    K = P["commute.access.candidate_stations"]
    cands = []  # per block: [(access + board, station)]
    for b in blocks:
        if b.get("lat") is None:
            cands.append(None); continue
        acc = sorted((M.access(M.exit_km(b["lat"], b["lon"], c)), c) for c in M.plat)[:K]
        cands.append([(a + P["commute.rail.board_min"], c) for a, c in acc])

    minutes, stats = {}, {}
    for h in hubs:
        to_hub = M.station_to(h["lat"], h["lon"])
        h["_to"] = to_hub
        arr = bytearray(len(blocks))
        for i, b in enumerate(blocks):
            if cands[i] is None:
                arr[i] = NA; continue
            t = M.walk(km(b["lat"], b["lon"], h["lat"], h["lon"]))
            for a, c in cands[i]:
                t = min(t, a + to_hub[c])
            arr[i] = min(CAP, round(t))
        minutes[h["id"]] = base64.b64encode(bytes(arr)).decode("ascii")
        vals = sorted(x for x in arr if x != NA)
        stats[h["id"]] = (vals[0], statistics.median(vals), vals[-1])

    validation = []
    hub_by_id = {h["id"]: h for h in hubs}
    for st_name, hid, ref_rail, (lo, hi), src in REFERENCES:
        o = st_by_name[st_name]
        h = hub_by_id[hid]
        hub_st = min(M.plat, key=lambda c: M.exit_km(h["lat"], h["lon"], c))
        rail = M.rail_only(o, hub_st)
        near = [i for i, b in enumerate(blocks) if b.get("lat") is not None and 0.3 <= M.exit_km(b["lat"], b["lon"], o) <= 0.6]
        arr = base64.b64decode(minutes[hid])
        d2d = statistics.median(arr[i] for i in near) if near else None
        validation.append({"from": st_name.title(), "to": hid, "rail_model": round(rail, 1), "rail_ref": ref_rail,
                           "rail_err": round(rail - ref_rail, 1), "door_model_median": d2d, "door_ref": [lo, hi],
                           "blocks": len(near), "source": src})
    for h in hubs:
        h.pop("_to")

    payload = {
        "generated_at": datetime.now(timezone.utc).astimezone().isoformat(timespec="minutes"),
        "model": "ESTIMATE: min(walk only, walk/feeder-bus to one of the N nearest MRT/LRT stations + boarding + "
                 "rail over the line graph (distance-based run time + dwell, transfer penalty) + walk/feeder-bus to the hub). "
                 "Peak-hour typical; bus routes, crowding, disruptions and exact exits are not modelled. Parameters: commute.* in the policy file.",
        "block_count": len(blocks),
        "block_sig": block_sig(data),
        "block_order": "HDB_DATA.blocks index",
        "encoding": "base64-uint8",
        "na": NA,
        "cap": CAP,
        "params": P,
        "hubs": hubs,
        "minutes": minutes,
        "validation": validation,
    }
    OUT.write_text("window.HDB_COMMUTE=" + json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + ";", encoding="utf-8")

    print(f"stations: {len(M.plat)} with platforms; spliced in: {M.added or 'none'}; walking links: {M.links}")
    print(f"{'hub':22s} min  med  max")
    for hid, (a, mdn, z) in stats.items():
        print(f"{hid:22s} {a:3d} {mdn:5.0f} {z:4d}")
    print("validation (rail = platform to platform; door = median of blocks 300-600 m from the origin station):")
    for v in validation:
        print(f"  {v['from']:14s} -> {v['to']:14s} rail {v['rail_model']:5.1f} vs {v['rail_ref']:3d} ({v['rail_err']:+.1f})"
              f" | door {v['door_model_median']} vs {v['door_ref']} (n={v['blocks']})")
    print(f"wrote {OUT.name}: {len(hubs)} hubs x {len(blocks):,} blocks, {OUT.stat().st_size / 1e3:.0f} kB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
