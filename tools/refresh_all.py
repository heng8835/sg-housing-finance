"""Monthly data refresh: run every data generator in order, then summarise what changed and raise sanity flags.

    python tools/refresh_all.py --dry-run              # the plan + a summary of the CURRENT data; no fetching, no writes
    python tools/refresh_all.py                        # the whole chain (network: data.gov.sg, OneMap, Overpass) ~1-2 h
    python tools/refresh_all.py --only data,rents      # some steps (comma-separated; chain order kept)
    python tools/refresh_all.py --list                 # step names

Chain (README "Refresh the app's data"; the order matters - later steps read data.js block indices):
  seed         MRT CSVs rebuilt from the current app/data/data.js when the pipeline has none (the MRT flow is on hold,
               so a fresh checkout has no mrt_map.csv / mrt_station_centroid.csv), and tools/blocks_geocode_cache.json
               topped up from tools/hdb_blocks.json (so only blocks that are really new go to OneMap). Never overwrites.
  resale       hdb-data-pipeline/pipelines/run_resale.py: data.gov.sg -> geocode (append-only hdb_address.csv) -> CSV
  data         build_data.py                  blocks       fetch_hdb_blocks.py        data-merge   build_data.py again
  future-rail  fetch_future_rail.py           poi          fetch_poi.py               bus          fetch_bus_routes.py
  rents        fetch_rents.py                 market       fetch_market.py            family       fetch_family_health.py
  commute      build_commute.py               bto          fetch_bto.py (private build only; skipped without its input)
  manifest     build_sw_manifest.py (offline-copy manifest, after every change under app/)
Each step runs as its own process (its own polite pacing / backoff), is retried --retries times after a pause, and
network steps are spaced --delay seconds apart. A failed core step (seed, resale, data, data-merge, manifest) stops the
run; any other failed step is reported and the run goes on (the step's previous output stays).

Output (--report-dir, default tools/cache/refresh/, gitignored): refresh-summary.json (machine-readable) and
refresh-report.md (the PR body): rows before/after per file, months covered, sales added, new blocks, median price
change by town (latest month vs the one before), file sizes, steps, geocode failures, and SANITY FLAGS:
  fail    a data file empty / unreadable / gone; transactions down > 2 %; latest month earlier than before;
          the geocode cache hdb_address.csv shrank (it is append-only); a core step failed
  review  any other list down > 2 % or emptied; a town median moved > 15 % month on month (both months >= 20 sales);
          latest month older than last calendar month; data.js size changed > 20 %; geocode failures > N per source;
          a non-core step failed; OneMap login failed
Status: failed (exit 1) / needs-review (exit 0) / ok (exit 0). Standard library only; no browser.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import statistics
import subprocess
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

# thresholds (named so the report and the docs can quote them)
ROW_DROP_PCT = 2.0
TOWN_JUMP_PCT = 15.0
TOWN_MIN_SALES = 20
DATA_SIZE_PCT = 20.0
LIST_MIN_BASE = 50          # list-drop flag only for lists with at least this many items before
MAX_GEOCODE_FAILURES = 100  # per source; tune after the first runs
LOGIN_FAILED = "ONEMAP LOGIN FAILED"  # = hdb_pipeline.onemap_auth.LOGIN_FAILED (kept literal: stdlib only here)

# geocode failures printed by the steps -> count per step
GEOCODE_PATTERNS = {
    "resale": [(re.compile(r"geocode MISS"), None)],
    "blocks": [(re.compile(r"\((\d+) could not be geocoded\)"), 1)],
    "family": [(re.compile(r"not found on OneMap"), None)],
    "bto": [(re.compile(r"BTO not located"), None)],
}


class Step:
    def __init__(self, name, script=None, net=False, core=False, doc="", when=None):
        self.name, self.script, self.net, self.core, self.doc, self.when = name, script, net, core, doc, when

    def argv(self, root: Path, python: str):
        return [python, str(root / self.script)] if self.script else None


def _bto_input(root: Path) -> bool:
    return (root / "tools" / "fetch_bto.py").is_file() and \
        (root / "hdb-data-pipeline" / "data" / "processed" / ("record" + "bto_projects.csv")).is_file()


STEPS = [
    Step("seed", None, core=True, doc="MRT CSVs + blocks geocode cache from the committed data (never overwrites)"),
    Step("resale", "hdb-data-pipeline/pipelines/run_resale.py", net=True, core=True, doc="resale transactions (data.gov.sg + OneMap)"),
    Step("data", "tools/build_data.py", core=True, doc="transactions + MRT -> data.js"),
    Step("blocks", "tools/fetch_hdb_blocks.py", net=True, doc="every HDB block -> hdb_blocks.json (OneMap for new ones)"),
    Step("data-merge", "tools/build_data.py", core=True, doc="data.js again with the blocks merged"),
    Step("future-rail", "tools/fetch_future_rail.py", net=True, doc="future MRT stations"),
    Step("poi", "tools/fetch_poi.py", net=True, doc="schools, childcare, parks, bus stops, food ..."),
    Step("bus", "tools/fetch_bus_routes.py", net=True, doc="bus routes (OpenStreetMap)"),
    Step("rents", "tools/fetch_rents.py", net=True, doc="rents"),
    Step("market", "tools/fetch_market.py", net=True, doc="price index, land use, unit mix"),
    Step("family", "tools/fetch_family_health.py", net=True, doc="childcare vacancies, clinics"),
    Step("commute", "tools/build_commute.py", doc="commute estimates"),
    Step("bto", "tools/fetch_bto.py", net=True, doc="BTO projects (private build; skipped without its input)", when=_bto_input),
    Step("manifest", "tools/build_sw_manifest.py", core=True, doc="offline-copy manifest"),
]
STEP_NAMES = [s.name for s in STEPS]


# ----------------------------------------------------------------------------- reading the data files
def load_js(path: Path):
    """window.X = {...}; -> the JSON payload (None when the file is not that shape)."""
    text = Path(path).read_text(encoding="utf-8").strip()
    eq = text.find("=")
    if eq < 0:
        return None
    body = text[eq + 1:].strip()
    if body.endswith(";"):
        body = body[:-1]
    try:
        return json.loads(body)
    except ValueError:
        return None


def csv_rows(path: Path):
    if not Path(path).is_file():
        return None
    with open(path, encoding="utf-8", newline="") as f:
        return max(sum(1 for _ in csv.reader(f)) - 1, 0)


def month_back(ym: str, n: int = 1) -> str:
    y, m = int(ym[:4]), int(ym[5:7]) - n
    while m < 1:
        y, m = y - 1, m + 12
    return f"{y:04d}-{m:02d}"


def pct(before, after):
    if before in (None, 0) or after is None:
        return None
    return round((after - before) / before * 100, 2)


def data_stats(payload: dict) -> dict:
    """data.js: rows, blocks, months, sales per recent month, town medians for the last two months."""
    months, tx, blocks, towns, streets = (payload.get(k) for k in ("months", "tx", "blocks", "towns", "streets"))
    prices, mon, bid = tx["p"], tx["m"], tx["b"]
    last = len(months) - 1
    per_town, per_month = {}, {}
    for i in range(len(prices)):
        mi = mon[i]
        if mi >= last - 2:
            per_month[months[mi]] = per_month.get(months[mi], 0) + 1
        if mi >= last - 1:
            t = towns[blocks[bid[i]]["t"]]
            per_town.setdefault(t, {}).setdefault(months[mi], []).append(prices[i])
    latest = months[last] if months else None
    prev = month_back(latest) if latest else None
    town_median = {}
    for t, by in sorted(per_town.items()):
        a, b = by.get(latest, []), by.get(prev, [])
        town_median[t] = {"latest": round(statistics.median(a)) if a else None, "n": len(a),
                          "prev": round(statistics.median(b)) if b else None, "n_prev": len(b)}
        town_median[t]["change_pct"] = pct(town_median[t]["prev"], town_median[t]["latest"])
    return {
        "rows": payload.get("row_count", len(prices)), "blocks": len(blocks), "no_resale_blocks": sum(1 for b in blocks if b.get("nt")),
        "months": [months[0], latest] if months else None, "month_count": len(months),
        "sales_by_month": dict(sorted(per_month.items())), "town_median": town_median,
        "generated_at": payload.get("generated_at"),
        "_block_keys": {f"{b['b']}|{streets[b['s']]}" for b in blocks},
    }


def describe_js(path: Path) -> dict:
    """size, short hash, list lengths (top level and one level down), months covered."""
    raw = Path(path).read_bytes()
    d = {"size": len(raw), "sha": hashlib.sha256(raw).hexdigest()[:12], "counts": {}, "months": None}
    if not raw.strip():
        d["empty"] = True
        return d
    payload = load_js(path)
    if not isinstance(payload, dict):
        d["unreadable"] = True
        return d
    for k, v in payload.items():
        if isinstance(v, list):
            d["counts"][k] = len(v)
        elif isinstance(v, dict) and k != "tx":
            if v and all(isinstance(x, (dict, list)) for x in list(v.values())[:50]):
                d["counts"][k] = len(v)  # keyed collections (rents.blocks, rents.towns, commute.minutes, ...)
            for k2, v2 in v.items():
                if isinstance(v2, list) and len(v2) and not all(isinstance(x, (int, float)) for x in v2[:50]):
                    d["counts"][f"{k}.{k2}"] = len(v2)
        elif k in ("rows", "row_count") and isinstance(v, int):
            d["counts"][k] = v
    m = payload.get("months")
    if isinstance(m, list) and m and all(isinstance(x, str) for x in m[:2]):
        d["months"] = [m[0], m[-1]]
    if Path(path).name == "data.js" and isinstance(payload.get("tx"), dict):
        d["data"] = data_stats(payload)
    return d


def snapshot(root: Path) -> dict:
    """Everything the summary compares, read from disk (app/data/*.js, hdb_blocks.json, the geocode cache)."""
    root = Path(root)
    files = {}
    for p in sorted((root / "app" / "data").glob("*.js")):
        files[p.name] = describe_js(p)
    extra = {}
    hb = root / "tools" / "hdb_blocks.json"
    if hb.is_file():
        try:
            extra["tools/hdb_blocks.json"] = {"size": hb.stat().st_size, "rows": len(json.loads(hb.read_text(encoding="utf-8")))}
        except ValueError:
            extra["tools/hdb_blocks.json"] = {"size": hb.stat().st_size, "rows": None, "unreadable": True}
    gc = root / "hdb-data-pipeline" / "data" / "cache" / "hdb_address.csv"
    if gc.is_file():
        extra["hdb_address.csv"] = {"size": gc.stat().st_size, "rows": csv_rows(gc)}
    return {"taken_at": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"), "files": files, "extra": extra}


# ----------------------------------------------------------------------------- seed step
def seed(root: Path, log=print) -> dict:
    """Never overwrites. MRT CSVs from data.js when missing; blocks geocode cache topped up from hdb_blocks.json."""
    root = Path(root)
    done = {"mrt": "kept", "blocks_cache_added": 0}
    proc = root / "hdb-data-pipeline" / "data" / "processed"
    exits_csv, cent_csv = proc / "mrt_map.csv", proc / "mrt_station_centroid.csv"
    if not (exits_csv.is_file() and cent_csv.is_file()):
        payload = load_js(root / "app" / "data" / "data.js")
        mrt = (payload or {}).get("mrt")
        if not mrt:
            raise RuntimeError("no MRT CSVs in the pipeline and no MRT data in app/data/data.js to rebuild them from")
        proc.mkdir(parents=True, exist_ok=True)
        st = mrt["stations"]
        if not exits_csv.is_file():
            with open(exits_csv, "w", encoding="utf-8", newline="") as f:
                w = csv.writer(f)
                w.writerow(["station_name", "exit_code", "lat", "lon", "object_id", "updated_at"])
                for i, e in enumerate(mrt["exits"], 1):
                    w.writerow([e["n"], e["e"], e["lat"], e["lon"], i, ""])
        if not cent_csv.is_file():
            with open(cent_csv, "w", encoding="utf-8", newline="") as f:
                w = csv.writer(f)
                w.writerow(["station_name", "centroid_lat", "centroid_lon", "line", "station_code", "seq_in_line", "line_id"])
                for li, line in enumerate(mrt["lines"], 1):
                    for seq, (si, code) in enumerate(zip(line["st"], line["codes"])):
                        w.writerow([st[si]["n"], st[si]["lat"], st[si]["lon"], line["id"], code, seq, li])
        done["mrt"] = "rebuilt from data.js"
        log(f"seed: MRT CSVs rebuilt from app/data/data.js ({len(mrt['exits'])} exits, {len(st)} stations)")
    hb, cache = root / "tools" / "hdb_blocks.json", root / "tools" / "blocks_geocode_cache.json"
    if hb.is_file():
        local = json.loads(cache.read_text(encoding="utf-8")) if cache.is_file() else {}
        added = 0
        for b in json.loads(hb.read_text(encoding="utf-8")):
            k = f"{b['b']}|{b['s']}"
            if not local.get(k) and b.get("lat") is not None:
                local[k] = [b["lat"], b["lon"]]
                added += 1
        if added:
            cache.write_text(json.dumps(local), encoding="utf-8")
        done["blocks_cache_added"] = added
        log(f"seed: blocks geocode cache +{added} from tools/hdb_blocks.json")
    return done


# ----------------------------------------------------------------------------- comparing
def compare(before: dict, after: dict, steps=None, geocode=None, login_failed=False, today=None,
            max_geocode_failures=MAX_GEOCODE_FAILURES) -> dict:
    """Summary + sanity flags. steps: [{name, status, core, ...}]; geocode: {step: failures}."""
    flags = []

    def flag(level, code, msg):
        flags.append({"level": level, "code": code, "message": msg})

    files = {}
    for name in sorted(set(before["files"]) | set(after["files"])):
        b, a = before["files"].get(name), after["files"].get(name)
        row = {"size_before": b and b["size"], "size_after": a and a["size"], "size_change_pct": pct(b and b["size"], a and a["size"]),
               "changed": bool(a and b and a["sha"] != b["sha"]) or (a is None) != (b is None),
               "months_before": b and b.get("months"), "months_after": a and a.get("months"), "counts": {}}
        if a is None:
            flag("fail", "file-gone", f"app/data/{name} existed before the refresh and is gone")
        elif a.get("empty"):
            flag("fail", "empty-file", f"app/data/{name} is empty")
        elif a.get("unreadable"):
            flag("fail", "unreadable-file", f"app/data/{name} is not a readable window.X = {{...}}; file")
        for k in sorted(set((b or {}).get("counts", {})) | set((a or {}).get("counts", {}))):
            cb, ca = (b or {}).get("counts", {}).get(k), (a or {}).get("counts", {}).get(k)
            row["counts"][k] = [cb, ca]
            if a is None or cb is None:
                continue
            if name == "data.js" and k in ("rows", "row_count"):
                continue  # judged below with the transaction rule
            if cb and not ca:
                flag("review", "list-emptied", f"{name} {k}: {cb} -> {ca or 0} (that source probably failed this month)")
            elif cb >= LIST_MIN_BASE and ca is not None and ca < cb * (1 - ROW_DROP_PCT / 100):
                flag("review", "list-drop", f"{name} {k}: {cb} -> {ca} ({pct(cb, ca)} %, limit -{ROW_DROP_PCT} %)")
        files[name] = row

    data = None
    db, da = (before["files"].get("data.js") or {}).get("data"), (after["files"].get("data.js") or {}).get("data")
    if da:
        data = {"rows_before": db and db["rows"], "rows_after": da["rows"], "sales_added": da["rows"] - db["rows"] if db else None,
                "months_before": db and db["months"], "months_after": da["months"],
                "new_months": [], "blocks_before": db and db["blocks"], "blocks_after": da["blocks"],
                "new_blocks": sorted(da["_block_keys"] - db["_block_keys"]) if db else [],
                "sales_by_month": da["sales_by_month"], "town_median": da["town_median"]}
        if db and db["months"] and da["months"]:
            m, out = da["months"][1], []
            while m > db["months"][1] and len(out) < 24:
                out.append(m)
                m = month_back(m)
            data["new_months"] = sorted(out)
        if db and da["rows"] < db["rows"] * (1 - ROW_DROP_PCT / 100):
            flag("fail", "rows-drop", f"transactions {db['rows']:,} -> {da['rows']:,} ({pct(db['rows'], da['rows'])} %, limit -{ROW_DROP_PCT} %)")
        elif db and da["rows"] < db["rows"]:
            flag("review", "rows-down", f"transactions {db['rows']:,} -> {da['rows']:,} (source revisions should only add rows)")
        if db and db["months"] and da["months"] and da["months"][1] < db["months"][1]:
            flag("fail", "months-backwards", f"latest month {da['months'][1]} is earlier than before ({db['months'][1]})")
        today = today or date.today()
        expected = month_back(f"{today.year:04d}-{today.month:02d}")
        if da["months"] and da["months"][1] < expected:
            flag("review", "missing-latest-month", f"latest month is {da['months'][1]}; expected {expected} by now (data.gov.sg lagging?)")
        for t, v in da["town_median"].items():
            if v["change_pct"] is not None and v["n"] >= TOWN_MIN_SALES and v["n_prev"] >= TOWN_MIN_SALES \
                    and abs(v["change_pct"]) > TOWN_JUMP_PCT:
                flag("review", "town-median-jump", f"{t}: median S${v['prev']:,} -> S${v['latest']:,} ({v['change_pct']:+} % m/m, "
                     f"{v['n_prev']} / {v['n']} sales; limit {TOWN_JUMP_PCT} %)")
    sc = files.get("data.js", {}).get("size_change_pct")
    if sc is not None and abs(sc) > DATA_SIZE_PCT:
        flag("review", "data-size", f"data.js size changed {sc:+} % (limit {DATA_SIZE_PCT} %)")

    gb, ga = before["extra"].get("hdb_address.csv"), after["extra"].get("hdb_address.csv")
    if gb and (not ga or (ga["rows"] or 0) < (gb["rows"] or 0)):
        flag("fail", "geocode-cache-shrank", f"hdb_address.csv {gb['rows']} -> {ga and ga['rows']} rows (append-only cache)")
    hb_b, hb_a = before["extra"].get("tools/hdb_blocks.json"), after["extra"].get("tools/hdb_blocks.json")
    if hb_b and hb_a and hb_b["rows"] and (hb_a["rows"] or 0) < hb_b["rows"] * (1 - ROW_DROP_PCT / 100):
        flag("review", "list-drop", f"tools/hdb_blocks.json {hb_b['rows']} -> {hb_a['rows']} blocks")

    for src, n in sorted((geocode or {}).items()):
        if n > max_geocode_failures:
            flag("review", "geocode-failures", f"{src}: {n} geocode failures (limit {max_geocode_failures})")
    for s in steps or []:
        if s["status"] == "failed":
            flag("fail" if s.get("core") else "review", "step-failed", f"step {s['name']} failed after {s['attempts']} attempt(s)"
                 + ("" if s.get("core") else " - its previous output was kept"))
    if login_failed:
        flag("review", "onemap-login", "OneMap login failed (check the ONEMAP_EMAIL / ONEMAP_PASSWORD secrets); calls went out without a token")

    status = "failed" if any(f["level"] == "fail" for f in flags) else "needs-review" if flags else "ok"
    return {"status": status, "flags": flags, "files": files, "data": data, "extra": {"before": before["extra"], "after": after["extra"]},
            "geocode_failures": geocode or {}, "steps": steps or [],
            "thresholds": {"row_drop_pct": ROW_DROP_PCT, "town_jump_pct": TOWN_JUMP_PCT, "town_min_sales": TOWN_MIN_SALES,
                           "data_size_pct": DATA_SIZE_PCT, "list_min_base": LIST_MIN_BASE, "max_geocode_failures": max_geocode_failures}}


def count_geocode_failures(step: str, text: str) -> int:
    n = 0
    for rx, group in GEOCODE_PATTERNS.get(step, []):
        for m in rx.finditer(text):
            n += int(m.group(group)) if group else 1
    return n


# ----------------------------------------------------------------------------- report
def _mb(n):
    return "-" if n is None else f"{n / 1e6:.2f} MB" if n >= 1e5 else f"{n / 1e3:.1f} KB"


def _num(n):
    return "-" if n is None else f"{n:,}" if isinstance(n, int) else str(n)


def markdown(summary: dict, dry_run=False) -> str:
    s, out = summary, []
    head = {"ok": "OK - no sanity flags", "needs-review": "NEEDS REVIEW - see the flags", "failed": "FAILED - do not merge"}[s["status"]]
    out.append(f"## Data refresh {s.get('month', '')}: {head}" + (" (dry run: current data, nothing fetched)" if dry_run else ""))
    out.append("")
    if s["flags"]:
        out.append("### Sanity flags")
        out.append("| level | check | detail |")
        out.append("|---|---|---|")
        out += [f"| {f['level']} | {f['code']} | {f['message']} |" for f in s["flags"]]
        out.append("")
    d = s.get("data")
    if d:
        out.append("### Resale transactions (data.js)")
        out.append(f"- rows: {_num(d['rows_before'])} -> {_num(d['rows_after'])} (sales added: {_num(d['sales_added'])})")
        mb, ma = d["months_before"], d["months_after"]
        out.append(f"- months: {mb and ' to '.join(mb) or '-'} -> {ma and ' to '.join(ma) or '-'}"
                   + (f" (new: {', '.join(d['new_months'])})" if d["new_months"] else ""))
        out.append(f"- sales in the last months: " + ", ".join(f"{m}: {n:,}" for m, n in d["sales_by_month"].items()))
        nb = d["new_blocks"]
        out.append(f"- blocks: {_num(d['blocks_before'])} -> {_num(d['blocks_after'])}; new: {len(nb)}"
                   + (f" ({', '.join(nb[:15])}{' ...' if len(nb) > 15 else ''})" if nb else ""))
        out.append("")
        tm = d["town_median"]
        if tm:
            latest = (ma or ["", ""])[1]
            out.append(f"<details><summary>Median resale price by town, {month_back(latest) if latest else ''} -> {latest} "
                       f"(largest moves first; latest month may be partial)</summary>")
            out.append("")
            out.append("| town | median before | median latest | change | sales (before / latest) |")
            out.append("|---|---:|---:|---:|---:|")
            rows = sorted(tm.items(), key=lambda kv: -abs(kv[1]["change_pct"] or 0))
            for t, v in rows:
                ch = "-" if v["change_pct"] is None else f"{v['change_pct']:+.1f} %"
                out.append(f"| {t} | {_num(v['prev'])} | {_num(v['latest'])} | {ch} | {v['n_prev']} / {v['n']} |")
            out.append("")
            out.append("</details>")
            out.append("")
    out.append("### Files")
    out.append("| file | size before | size after | change | months | lists (before -> after) |")
    out.append("|---|---:|---:|---:|---|---|")
    for name, f in s["files"].items():
        ch = "-" if f["size_change_pct"] is None else f"{f['size_change_pct']:+.1f} %"
        months = " to ".join(f["months_after"]) if f["months_after"] else "-"
        lists = "; ".join(f"{k} {_num(a)}" + ("" if a == b else f" (was {_num(b)})") for k, (b, a) in f["counts"].items())
        out.append(f"| {name}{'' if f['changed'] else ' (unchanged)'} | {_mb(f['size_before'])} | {_mb(f['size_after'])} | {ch} | {months} | {lists or '-'} |")
    for name, a in s["extra"]["after"].items():
        b = s["extra"]["before"].get(name) or {}
        p = pct(b.get("size"), a.get("size"))
        ch = "-" if p is None else f"{p:+.1f} %"
        was = "" if a.get("rows") == b.get("rows") else f" (was {_num(b.get('rows'))})"
        out.append(f"| {name} | {_mb(b.get('size'))} | {_mb(a.get('size'))} | {ch} | - | rows {_num(a.get('rows'))}{was} |")
    out.append("")
    if s["steps"]:
        out.append("### Steps")
        out.append("| step | result | attempts | time |")
        out.append("|---|---|---:|---:|")
        for st in s["steps"]:
            out.append(f"| {st['name']} | {st['status']} | {st.get('attempts', 0)} | {st.get('seconds', 0):.0f} s |")
        out.append("")
    if s["geocode_failures"]:
        out.append("Geocode failures: " + ", ".join(f"{k} {v}" for k, v in s["geocode_failures"].items()))
        out.append("")
    t = s["thresholds"]
    out.append(f"<sub>Limits: rows -{t['row_drop_pct']} %, town median {t['town_jump_pct']} % m/m (>= {t['town_min_sales']} sales), "
               f"data.js size {t['data_size_pct']} %, geocode failures {t['max_geocode_failures']} per source. "
               f"What the flags mean: docs/process/DATA_REFRESH.md.</sub>")
    return "\n".join(out) + "\n"


# ----------------------------------------------------------------------------- running
def run_step(step: Step, root: Path, python: str, retries: int, retry_wait: float, log=print, runner=None, sleep=time.sleep):
    """Run one step with retries -> (record, combined output text)."""
    rec = {"name": step.name, "core": step.core, "status": "ok", "attempts": 0, "seconds": 0.0}
    t0, text = time.time(), ""
    for attempt in range(retries + 1):
        rec["attempts"] = attempt + 1
        try:
            if step.script is None:
                res = seed(root, log=log)
                rec["detail"] = res
                text, rc = json.dumps(res), 0
            else:
                rc, text = (runner or _subprocess)(step.argv(root, python), root)
        except Exception as e:  # noqa: BLE001 - a step must never take the summary down with it
            rc, text = 1, f"{type(e).__name__}: {e}"
            log(f"  {step.name}: {text}")
        if rc == 0:
            break
        rec["status"] = "failed"
        if attempt < retries:
            wait = retry_wait * (attempt + 1)
            log(f"  {step.name}: exit {rc}; retry {attempt + 1}/{retries} in {wait:.0f} s")
            sleep(wait)
            rec["status"] = "ok"
    rec["seconds"] = round(time.time() - t0, 1)
    return rec, text


def _subprocess(argv, root):
    """Run a step, echo its output live, return (exit code, output)."""
    env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUNBUFFERED="1")
    p = subprocess.Popen(argv, cwd=str(root), env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         text=True, encoding="utf-8", errors="replace")
    lines = []
    for line in p.stdout:
        sys.stdout.write("    " + line)
        lines.append(line)
    return p.wait(), "".join(lines)


def select(only=None, skip=None):
    only = [x.strip() for x in (only or "").split(",") if x.strip()]
    skip = [x.strip() for x in (skip or "").split(",") if x.strip()]
    bad = [x for x in only + skip if x not in STEP_NAMES]
    if bad:
        raise SystemExit(f"unknown step(s): {', '.join(bad)} (steps: {', '.join(STEP_NAMES)})")
    return [s for s in STEPS if (not only or s.name in only) and s.name not in skip]


def strip_private(summary):
    """JSON-safe copy (sets dropped)."""
    def clean(x):
        if isinstance(x, dict):
            return {k: clean(v) for k, v in x.items() if not k.startswith("_")}
        if isinstance(x, (list, tuple)):
            return [clean(v) for v in x]
        if isinstance(x, set):
            return sorted(x)
        return x
    return clean(summary)


def write_reports(summary, report_dir: Path, dry_run=False):
    report_dir = Path(report_dir)
    report_dir.mkdir(parents=True, exist_ok=True)
    (report_dir / "refresh-summary.json").write_text(json.dumps(strip_private(summary), indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    (report_dir / "refresh-report.md").write_text(markdown(summary, dry_run=dry_run), encoding="utf-8")


def refresh(root=ROOT, steps=None, dry_run=False, retries=2, retry_wait=120.0, delay=10.0, report_dir=None,
            max_geocode_failures=MAX_GEOCODE_FAILURES, today=None, python=None, runner=None, log=print, sleep=time.sleep):
    """The whole run -> summary dict (also written to report_dir)."""
    root = Path(root)
    steps = STEPS if steps is None else steps
    python = python or sys.executable
    report_dir = Path(report_dir) if report_dir else root / "tools" / "cache" / "refresh"
    before = snapshot(root)
    records, geocode, login_failed, last_net = [], {}, False, False
    for st in steps:
        if st.when and not st.when(root):
            records.append({"name": st.name, "core": st.core, "status": "skipped", "attempts": 0, "seconds": 0.0})
            log(f"- {st.name}: skipped (no input)")
            continue
        if dry_run:
            cmd = f"python {st.script}" if st.script else "(internal)"
            log(f"- {st.name:<12} {cmd:<52} {st.doc}")
            records.append({"name": st.name, "core": st.core, "status": "planned", "attempts": 0, "seconds": 0.0})
            continue
        if st.net and last_net and delay:
            sleep(delay)  # polite gap between network-heavy steps
        log(f"- {st.name}: {st.doc}")
        rec, text = run_step(st, root, python, retries, retry_wait, log=log, runner=runner, sleep=sleep)
        records.append(rec)
        last_net = st.net
        n = count_geocode_failures(st.name, text)
        if n:
            geocode[st.name] = geocode.get(st.name, 0) + n
        login_failed = login_failed or LOGIN_FAILED in text
        if rec["status"] == "failed" and st.core:
            log(f"core step {st.name} failed - stopping")
            break
    after = before if dry_run else snapshot(root)
    summary = compare(before, after, steps=records, geocode=geocode, login_failed=login_failed, today=today,
                      max_geocode_failures=max_geocode_failures)
    summary["dry_run"] = dry_run
    t = today or date.today()
    summary["month"] = f"{t.year:04d}-{t.month:02d}"
    summary["finished_at"] = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    write_reports(summary, report_dir, dry_run=dry_run)
    return summary


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dry-run", action="store_true", help="print the plan and summarise the current data; fetch nothing")
    ap.add_argument("--only", help="comma-separated steps to run (chain order kept)")
    ap.add_argument("--skip", help="comma-separated steps to leave out")
    ap.add_argument("--list", action="store_true", help="list the steps and exit")
    ap.add_argument("--retries", type=int, default=2, help="retries per step after a failure (default 2)")
    ap.add_argument("--retry-wait", type=float, default=120.0, help="seconds before the first retry; x2 before the second ... (default 120)")
    ap.add_argument("--delay", type=float, default=10.0, help="seconds between network steps (default 10)")
    ap.add_argument("--max-geocode-failures", type=int, default=MAX_GEOCODE_FAILURES, help="per source before a review flag")
    ap.add_argument("--report-dir", help="where refresh-summary.json + refresh-report.md go (default tools/cache/refresh)")
    ap.add_argument("--today", help="YYYY-MM-DD for the expected-month check (default: today)")
    args = ap.parse_args(argv)
    if args.list:
        for s in STEPS:
            print(f"{s.name:<12} {'core ' if s.core else '     '}{'net  ' if s.net else '     '}{s.doc}")
        return 0
    try:
        steps = select(args.only, args.skip)
    except SystemExit as e:
        print(e, file=sys.stderr)
        return 2
    today = date.fromisoformat(args.today) if args.today else None
    print(("DRY RUN - nothing is fetched or written to app/; plan:" if args.dry_run else "refresh:"))
    summary = refresh(steps=steps, dry_run=args.dry_run, retries=args.retries, retry_wait=args.retry_wait, delay=args.delay,
                      report_dir=args.report_dir, max_geocode_failures=args.max_geocode_failures, today=today)
    rd = Path(args.report_dir) if args.report_dir else ROOT / "tools" / "cache" / "refresh"
    print(f"\nstatus: {summary['status']} ({len(summary['flags'])} flag(s)); report: {rd / 'refresh-report.md'}")
    for f in summary["flags"]:
        print(f"  [{f['level']}] {f['code']}: {f['message']}")
    return 1 if summary["status"] == "failed" else 0


if __name__ == "__main__":
    sys.exit(main())
