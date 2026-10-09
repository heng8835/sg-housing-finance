"""tools/refresh_all.py (summary, sanity flags, step runner, seed) on synthetic data in temp folders, plus the refresh /
publish workflow files. No network, no real generator is run.

    python -m unittest discover -s tests/tools -p "test_*.py"     (npm test runs it via python-tools.test.js)
"""
import csv
import io
import json
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "tools"))
import refresh_all as ra  # noqa: E402

try:
    import yaml  # noqa: F401 - optional: CI's node job has no PyYAML (the scratch venv / pipeline env do)
except ImportError:
    yaml = None

TOWNS = ["ANG MO KIO", "BEDOK"]
MONTHS = ["2026-07", "2026-08", "2026-09"]


def make_data(sales, blocks=None, months=MONTHS, pad=0):
    """sales: {(town index, month index): [prices]} -> window.HDB_DATA payload (one block per town unless given)."""
    blocks = blocks or [{"b": str(100 + t), "s": t, "t": t, "lat": 1.3, "lon": 103.8} for t in range(len(TOWNS))]
    tx = {"b": [], "m": [], "p": [], "ft": [], "s": [], "a": [], "mo": [], "ly": []}
    for (t, m), prices in sorted(sales.items()):
        for p in prices:
            tx["b"].append(t)
            tx["m"].append(m)
            tx["p"].append(p)
            for k in ("ft", "s", "a", "mo", "ly"):
                tx[k].append(0)
    return {"months": list(months), "towns": TOWNS, "zones": ["North-East", "East"], "streets": [f"STREET {i}" for i in range(max(len(blocks), 2))],
            "flat_types": ["4 ROOM"], "storeys": ["01 TO 03"], "models": ["Model A"], "blocks": blocks, "tx": tx,
            "mrt": {"lines": [{"id": "NS", "name": "North-South Line", "color": "#d42e12", "st": [0, 1], "codes": ["NS1", "NS2"]}],
                    "stations": [{"n": "A MRT STATION", "lat": 1.30, "lon": 103.80, "lines": ["NS"], "codes": ["NS1"]},
                                 {"n": "B MRT STATION", "lat": 1.31, "lon": 103.81, "lines": ["NS"], "codes": ["NS2"]}],
                    "exits": [{"n": "A MRT STATION", "e": "Exit A", "lat": 1.3001, "lon": 103.8001},
                              {"n": "B MRT STATION", "e": "Exit B", "lat": 1.3101, "lon": 103.8101}]},
            "pad": "x" * pad, "row_count": len(tx["p"])}


def steady(n=30, price=500000, months=(0, 1, 2)):
    return {(t, m): [price + 1000 * i for i in range(n)] for t in range(len(TOWNS)) for m in months}


def write_js(root, name, var, payload):
    p = Path(root) / "app" / "data" / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(f"window.{var}=" + json.dumps(payload, separators=(",", ":")) + ";", encoding="utf-8")
    return p


def write_cache(root, rows):
    p = Path(root) / "hdb-data-pipeline" / "data" / "cache" / "hdb_address.csv"
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["block", "street_name", "address_for_geocode", "latitude", "longitude"])
        for i in range(rows):
            w.writerow([str(i), "ST", f"{i} ST SINGAPORE", 1.3, 103.8])


def codes(summary):
    return {(f["level"], f["code"]) for f in summary["flags"]}


class Temp(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="sghf-refresh-"))
        write_js(self.root, "data.js", "HDB_DATA", make_data(steady()))
        write_js(self.root, "poi.js", "HDB_POI", {"schools": list(range(200)), "parks": list(range(80)), "generated_at": "x"})
        write_cache(self.root, 100)

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def compare(self, **k):
        k.setdefault("today", date(2026, 10, 5))
        return ra.compare(self.before, ra.snapshot(self.root), **k)


class Summary(Temp):
    def test_clean_month_is_ok_with_the_numbers(self):
        write_js(self.root, "data.js", "HDB_DATA", make_data(steady(), pad=20000))  # realistic: tx is a small part of data.js
        self.before = ra.snapshot(self.root)
        months = MONTHS + ["2026-10"]
        blocks = [{"b": "100", "s": 0, "t": 0, "lat": 1.3, "lon": 103.8}, {"b": "101", "s": 1, "t": 1, "lat": 1.3, "lon": 103.8},
                  {"b": "999", "s": 2, "t": 1, "lat": 1.31, "lon": 103.81, "nt": 1}]
        sales = steady(months=(0, 1, 2, 3))
        write_js(self.root, "data.js", "HDB_DATA", make_data(sales, blocks=blocks, months=months, pad=20000))
        write_cache(self.root, 103)
        s = self.compare(today=date(2026, 11, 5))
        self.assertEqual(s["status"], "ok", s["flags"])
        d = s["data"]
        self.assertEqual((d["rows_before"], d["rows_after"], d["sales_added"]), (180, 240, 60))
        self.assertEqual(d["months_after"], ["2026-07", "2026-10"])
        self.assertEqual(d["new_months"], ["2026-10"])
        self.assertEqual(d["new_blocks"], ["999|STREET 2"])
        self.assertEqual(d["town_median"]["BEDOK"]["n"], 30)
        self.assertEqual(d["town_median"]["BEDOK"]["change_pct"], 0.0)
        self.assertEqual(s["files"]["poi.js"]["counts"]["schools"], [200, 200])
        self.assertFalse(s["files"]["poi.js"]["changed"])
        self.assertEqual(s["extra"]["after"]["hdb_address.csv"]["rows"], 103)
        md = ra.markdown(s)
        self.assertIn("OK - no sanity flags", md)
        self.assertIn("sales added: 60", md)
        self.assertIn("| BEDOK |", md)
        json.dumps(ra.strip_private(s))  # JSON-safe (block-key sets dropped)

    def test_transaction_drop_over_2_percent_fails(self):
        self.before = ra.snapshot(self.root)
        sales = steady()
        sales[(0, 0)] = sales[(0, 0)][:20]  # 180 -> 170 rows (-5.6 %)
        write_js(self.root, "data.js", "HDB_DATA", make_data(sales))
        s = self.compare()
        self.assertIn(("fail", "rows-drop"), codes(s))
        self.assertEqual(s["status"], "failed")
        self.assertIn("FAILED - do not merge", ra.markdown(s))

    def test_small_drop_is_review_only(self):
        self.before = ra.snapshot(self.root)
        sales = steady()
        sales[(0, 0)] = sales[(0, 0)][:29]  # -1 row (-0.6 %)
        write_js(self.root, "data.js", "HDB_DATA", make_data(sales))
        s = self.compare()
        self.assertEqual(codes(s), {("review", "rows-down")})

    def test_town_median_jump_needs_enough_sales(self):
        sales = steady()
        sales[(0, 1)] = [500000] * 5                   # ANG MO KIO: only 5 sales in the month before the latest
        sales[(0, 0)] = sales[(0, 0)] + [500000] * 25  # (same total row count)
        write_js(self.root, "data.js", "HDB_DATA", make_data(sales))
        self.before = ra.snapshot(self.root)
        sales[(1, 2)] = [700000] * 30  # BEDOK +36 % m/m on 30 / 30 sales -> flag
        sales[(0, 2)] = [900000] * 30  # ANG MO KIO jumps too, but its previous month had 5 sales -> no flag
        write_js(self.root, "data.js", "HDB_DATA", make_data(sales))
        s = self.compare()
        jumps = [f for f in s["flags"] if f["code"] == "town-median-jump"]
        self.assertEqual(len(jumps), 1, s["flags"])
        self.assertIn("BEDOK", jumps[0]["message"])
        self.assertEqual(s["status"], "needs-review")

    def test_missing_latest_month_and_months_going_backwards(self):
        self.before = ra.snapshot(self.root)
        s = self.compare(today=date(2026, 12, 5))  # expected 2026-11, have 2026-09
        self.assertIn(("review", "missing-latest-month"), codes(s))
        self.assertNotIn(("review", "missing-latest-month"), codes(self.compare(today=date(2026, 10, 5))))
        write_js(self.root, "data.js", "HDB_DATA", make_data(steady(months=(0, 1)), months=MONTHS[:2]))
        self.assertIn(("fail", "months-backwards"), codes(self.compare()))

    def test_empty_unreadable_and_gone_files_fail(self):
        self.before = ra.snapshot(self.root)
        (self.root / "app" / "data" / "poi.js").write_text("", encoding="utf-8")
        self.assertIn(("fail", "empty-file"), codes(self.compare()))
        (self.root / "app" / "data" / "poi.js").write_text("window.HDB_POI={broken", encoding="utf-8")
        self.assertIn(("fail", "unreadable-file"), codes(self.compare()))
        (self.root / "app" / "data" / "poi.js").unlink()
        self.assertIn(("fail", "file-gone"), codes(self.compare()))

    def test_layer_emptied_or_shrunk_is_review(self):
        self.before = ra.snapshot(self.root)
        write_js(self.root, "poi.js", "HDB_POI", {"schools": [], "parks": list(range(70)), "generated_at": "y"})
        c = codes(self.compare())
        self.assertIn(("review", "list-emptied"), c)
        self.assertIn(("review", "list-drop"), c)  # parks 80 -> 70

    def test_data_size_change_over_20_percent(self):
        self.before = ra.snapshot(self.root)
        size = (self.root / "app" / "data" / "data.js").stat().st_size
        write_js(self.root, "data.js", "HDB_DATA", make_data(steady(), pad=size // 2))
        self.assertIn(("review", "data-size"), codes(self.compare()))

    def test_geocode_cache_must_only_grow(self):
        self.before = ra.snapshot(self.root)
        write_cache(self.root, 90)
        self.assertIn(("fail", "geocode-cache-shrank"), codes(self.compare()))
        (self.root / "hdb-data-pipeline" / "data" / "cache" / "hdb_address.csv").unlink()
        self.assertIn(("fail", "geocode-cache-shrank"), codes(self.compare()))

    def test_geocode_failures_steps_and_login(self):
        self.before = ra.snapshot(self.root)
        self.assertEqual(ra.count_geocode_failures("resale", "geocode MISS (will retry next run): 1 X\ngeocode MISS: 2 Y\n"), 2)
        self.assertEqual(ra.count_geocode_failures("blocks", "  wrote hdb_blocks.json: 13000 blocks (37 could not be geocoded)"), 37)
        self.assertEqual(ra.count_geocode_failures("poi", "geocode MISS"), 0)
        s = self.compare(geocode={"resale": 5, "blocks": 150}, max_geocode_failures=100,
                         steps=[{"name": "poi", "core": False, "status": "failed", "attempts": 3}], login_failed=True)
        msgs = [f["message"] for f in s["flags"]]
        self.assertTrue(any(m.startswith("blocks: 150") for m in msgs), msgs)
        self.assertFalse(any(m.startswith("resale:") for m in msgs))
        self.assertIn(("review", "step-failed"), codes(s))
        self.assertIn(("review", "onemap-login"), codes(s))
        self.assertEqual(s["status"], "needs-review")
        s = self.compare(steps=[{"name": "data", "core": True, "status": "failed", "attempts": 3}])
        self.assertEqual((s["status"], codes(s)), ("failed", {("fail", "step-failed")}))


class Runner(Temp):
    def fake(self, fail=()):
        calls = []

        def runner(argv, root):
            name = Path(argv[1]).name
            calls.append(name)
            if name in fail:
                return 1, "boom"
            if name == "fetch_hdb_blocks.py":
                return 0, "wrote hdb_blocks.json: 10 blocks (3 could not be geocoded)\n"
            if name == "fetch_poi.py":
                return 0, "ONEMAP LOGIN FAILED: OneMap token request failed (HTTP 401)\n"
            return 0, "ok\n"
        return runner, calls

    def run_refresh(self, **k):
        k.setdefault("today", date(2026, 10, 5))
        k.setdefault("report_dir", self.root / "report")
        with redirect_stdout(io.StringIO()):
            return ra.refresh(root=self.root, python="python", sleep=lambda s: None, **k)

    def test_chain_order_retries_reports(self):
        runner, calls = self.fake(fail={"fetch_market.py"})
        s = self.run_refresh(runner=runner, retries=2)
        self.assertEqual(calls[:4], ["run_resale.py", "build_data.py", "fetch_hdb_blocks.py", "build_data.py"])
        self.assertEqual(calls.count("fetch_market.py"), 3, "1 try + 2 retries")
        self.assertEqual(calls[-1], "build_sw_manifest.py", "a failed non-core step does not stop the run")
        self.assertNotIn("fetch_bto.py", calls, "no BTO input in this tree")
        by = {r["name"]: r for r in s["steps"]}
        self.assertEqual(by["market"]["status"], "failed")
        self.assertEqual(by["bto"]["status"], "skipped")
        self.assertEqual(by["seed"]["status"], "ok")
        self.assertEqual(s["geocode_failures"], {"blocks": 3})
        self.assertIn(("review", "onemap-login"), codes(s))
        self.assertEqual(s["status"], "needs-review")
        rep = self.root / "report"
        self.assertEqual(json.loads((rep / "refresh-summary.json").read_text(encoding="utf-8"))["status"], "needs-review")
        self.assertIn("NEEDS REVIEW", (rep / "refresh-report.md").read_text(encoding="utf-8"))
        proc = self.root / "hdb-data-pipeline" / "data" / "processed"
        self.assertTrue((proc / "mrt_map.csv").is_file() and (proc / "mrt_station_centroid.csv").is_file(), "seed ran")

    def test_core_failure_stops(self):
        runner, calls = self.fake(fail={"run_resale.py"})
        s = self.run_refresh(runner=runner, retries=0)
        self.assertEqual(calls, ["run_resale.py"])
        self.assertEqual(s["status"], "failed")

    def test_dry_run_runs_nothing_and_writes_nothing_to_app(self):
        runner, calls = self.fake()
        data = (self.root / "app" / "data" / "data.js").read_bytes()
        s = self.run_refresh(runner=runner, dry_run=True)
        self.assertEqual(calls, [])
        self.assertTrue(all(r["status"] in ("planned", "skipped") for r in s["steps"]))
        self.assertEqual((self.root / "app" / "data" / "data.js").read_bytes(), data)
        self.assertFalse((self.root / "hdb-data-pipeline" / "data" / "processed").exists(), "seed not run in a dry run")
        self.assertIn("dry run", (self.root / "report" / "refresh-report.md").read_text(encoding="utf-8"))

    def test_only_and_skip(self):
        self.assertEqual([s.name for s in ra.select("manifest,data")], ["data", "manifest"], "chain order kept")
        self.assertNotIn("bus", [s.name for s in ra.select(skip="bus")])
        with self.assertRaises(SystemExit):
            ra.select("nope")
        runner, calls = self.fake()
        self.run_refresh(runner=runner, steps=ra.select("rents"))
        self.assertEqual(calls, ["fetch_rents.py"])
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            self.assertEqual(ra.main(["--list"]), 0)
            self.assertEqual(ra.main(["--only", "nope"]), 2)


class Seed(Temp):
    def test_mrt_csvs_from_data_js_and_never_overwrite(self):
        hb = self.root / "tools" / "hdb_blocks.json"
        hb.parent.mkdir(parents=True, exist_ok=True)
        hb.write_text(json.dumps([{"b": "1", "s": "ST A", "lat": 1.3, "lon": 103.8}, {"b": "2", "s": "ST B", "lat": 1.4, "lon": 103.9}]), encoding="utf-8")
        cache = self.root / "tools" / "blocks_geocode_cache.json"
        cache.write_text(json.dumps({"1|ST A": [9.9, 9.9]}), encoding="utf-8")
        res = ra.seed(self.root, log=lambda m: None)
        self.assertEqual(res, {"mrt": "rebuilt from data.js", "blocks_cache_added": 1})
        self.assertEqual(json.loads(cache.read_text(encoding="utf-8")), {"1|ST A": [9.9, 9.9], "2|ST B": [1.4, 103.9]})
        proc = self.root / "hdb-data-pipeline" / "data" / "processed"
        with open(proc / "mrt_station_centroid.csv", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        self.assertEqual([(r["station_name"], r["line"], r["station_code"], r["seq_in_line"]) for r in rows],
                         [("A MRT STATION", "NS", "NS1", "0"), ("B MRT STATION", "NS", "NS2", "1")])
        with open(proc / "mrt_map.csv", encoding="utf-8") as f:
            self.assertEqual([r["exit_code"] for r in csv.DictReader(f)], ["Exit A", "Exit B"])
        (proc / "mrt_map.csv").write_text("station_name,exit_code,lat,lon,object_id,updated_at\n", encoding="utf-8")
        self.assertEqual(ra.seed(self.root, log=lambda m: None)["mrt"], "kept")
        self.assertEqual((proc / "mrt_map.csv").read_text(encoding="utf-8").count("\n"), 1, "existing CSV untouched")


class Workflows(unittest.TestCase):
    WF = REPO / ".github" / "workflows"
    PRIVATE = (WF / "data-refresh.yml").is_file() and (WF / "publish-public.yml").is_file()  # not in the public export

    def text(self, name):
        return (self.WF / name).read_text(encoding="utf-8")

    @unittest.skipUnless(yaml, "PyYAML not installed")
    def test_every_workflow_parses(self):
        for p in sorted(self.WF.glob("*.yml")):
            doc = yaml.safe_load(p.read_text(encoding="utf-8"))
            self.assertIn("jobs", doc, p.name)
            on = doc.get("on", doc.get(True))  # YAML 1.1 reads a bare `on` key as True
            self.assertTrue(on, p.name)
            for job in doc["jobs"].values():
                self.assertEqual(job["runs-on"], "ubuntu-24.04", p.name)

    @unittest.skipUnless(yaml, "PyYAML not installed")
    @unittest.skipUnless(PRIVATE, "private-repo workflows (left out of the public export)")
    def test_refresh_and_publish_shape(self):
        ref = yaml.safe_load(self.text("data-refresh.yml"))
        on = ref.get("on", ref.get(True))
        self.assertEqual(on["schedule"], [{"cron": "0 19 4 * *"}])  # 03:00 SGT on the 5th
        self.assertIn("workflow_dispatch", on)
        self.assertEqual(ref["permissions"], {"contents": "write", "pull-requests": "write", "issues": "write"})
        steps = ref["jobs"]["refresh"]["steps"]
        run = "\n".join(s.get("run", "") for s in steps)
        self.assertIn("python tools/refresh_all.py", run)
        self.assertIn("npm run fixtures", run)
        self.assertIn("npm test", run)
        self.assertIn("gh pr create --base main", run)
        envs = {k: v for s in steps for k, v in (s.get("env") or {}).items()}
        self.assertEqual(envs["ONEMAP_EMAIL"], "${{ secrets.ONEMAP_EMAIL }}")
        self.assertEqual(envs["ONEMAP_PASSWORD"], "${{ secrets.ONEMAP_PASSWORD }}")
        pub = yaml.safe_load(self.text("publish-public.yml"))
        on = pub.get("on", pub.get(True))
        self.assertEqual(on["push"]["branches"], ["main"])
        self.assertIn("workflow_dispatch", on)
        self.assertEqual(pub["permissions"], {"contents": "read"})
        psteps = pub["jobs"]["publish"]["steps"]
        clone = next(s for s in psteps if s.get("name") == "clone the public repo")
        self.assertEqual(clone["with"]["token"], "${{ secrets.PUBLIC_REPO_TOKEN }}")
        prun = "\n".join(s.get("run", "") for s in psteps)
        self.assertIn("public_export.py --src src --out public --clean", prun)

    @unittest.skipUnless(PRIVATE, "private-repo workflows (left out of the public export)")
    def test_refresh_never_pushes_main_and_prints_no_secret(self):
        for name in ["data-refresh.yml", "publish-public.yml"]:
            t = self.text(name)
            self.assertNotIn("push origin main", t)
            self.assertNotIn("HEAD:main", t)
            self.assertNotIn("--no-verify", t)
            for secret in ["ONEMAP_PASSWORD", "PUBLIC_REPO_TOKEN", "PUBLIC_DENYLIST"]:
                self.assertNotRegex(t, r"echo[^\n]*\$\{?" + secret, f"{name} echoes {secret}")
            self.assertIn("if: github.event.repository.private", t, "private repo only")
        self.assertIn('git push --force origin "HEAD:refs/heads/$branch"', self.text("data-refresh.yml"))
        self.assertIn("case \"$branch\" in data/*)", self.text("data-refresh.yml"))


if __name__ == "__main__":
    unittest.main()
