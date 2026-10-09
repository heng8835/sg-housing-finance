"""tools/stage_site.py + tools/public_export.py on temporary folders (no network, no git).

    python -m unittest discover -s tests/tools -p "test_*.py"     (npm test runs it via python-tools.test.js)
"""
import io
import json
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[2] / "tools"
sys.path.insert(0, str(TOOLS))
import public_export  # noqa: E402
import stage_site  # noqa: E402

BTO_SOURCE = "record" + "bto"  # the built-in denylist term, spelled in two parts like the exporter does
CONFIG = ("// build switches - the public export rewrites the line below\n"
          "//   export const BUILD_FEATURES = { btoData: false, floodData: false };\n"
          "export const BUILD_FEATURES = { btoData: true, floodData: true };\n")
LOADER = ("export const DATA_FILES_ALL = ['data/data.js', 'data/bto.js', 'data/family.js', 'data/flood.js'];\n"
          "export const FEATURE_FILES = { 'data/bto.js': 'btoData', 'data/flood.js': 'floodData' };\n")
SW = "importScripts('sw-routes.js');\nconst VERSION = 'x';\nconst DATA_VERSION = 'y';\n"


def write(root, rel, text):
    p = Path(root) / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(text if isinstance(text, bytes) else text.encode("utf-8"))
    return p


def make_app(app):
    files = {
        "index.html": '<!doctype html><script type="importmap">{"imports":{}}</script><script type="module" src="main.js"></script>',
        "main.js": "import './core/data-loader.js';\n", "config.js": CONFIG, "sw.js": SW, "sw-routes.js": "self.SWRoutes = {};\n",
        "manifest.webmanifest": "{}", "core/data-loader.js": LOADER, "engine/x.js": "export const x = 1;\n",
        "modules/m/index.js": "export {};\n", "styles/base.css": "body{}\n", "i18n/zh.json": '{"Hello": "你好"}\n',
        "content/content.json": "{}", "content/glossary/a.md": "# not shipped\n", "policy/sg-policy.json": "{}",
        "policy/fragments/new.json": "{}", "data/data.js": "window.HDB_DATA={};", "data/bto.js": "window.HDB_BTO={};",
        "data/family.js": "window.HDB_FAMILY={};", "data/flood.js": "window.HDB_FLOOD={};",
        "icons/icon.svg": "<svg/>", "README.md": "# app\n", "CLAUDE.md": "# internal\n", "Dockerfile": "FROM nginx\n",
    }
    for rel, text in files.items():
        write(app, rel, text)


def make_repo(src):
    make_app(Path(src) / "app")
    for rel, text in {
        "README.md": "# SG Housing & Finance\n", "LICENSE": "MIT\n", "package.json": "{}\n", ".gitignore": ".env\n",
        "tools/build_data.py": "print('ok')\n", "tools/fetch_hdb_blocks.py": "# HDB blocks\n",
        "tools/fetch_bto.py": "# BTO generator\n", "tools/curated_flood_prone.json": "{}\n", "tools/curated_other.json": "{}\n", "DATA_LICENCES.md": "# licences\n", "CHANGELOG.md": "# changes\n",
        ".github/ISSUE_TEMPLATE/bug.yml": "name: Bug\n", "hdb-data-pipeline/.env.example": "HDB_PIPELINE_PROXY=\n",
        "hdb-data-pipeline/.env.local": "HDB_PIPELINE_PROXY=y\n",
        "tools/rents_cache.json": "{}", "tools/cache/big.json": "{}", "tests/a.test.js": "// test\n",
        "tests/fixtures/gen/all.mjs": "// fixture generator\n",
        "docs/MODULE_MAP.md": "# map\n", "hdb-data-pipeline/.env": "HDB_PIPELINE_PROXY=x\n",
        "hdb-data-pipeline/secrets/key.json": "{}", "hdb-data-pipeline/docs/STATE.yml": "state: x\n",
        "hdb-data-pipeline/docs/PROJECT_BRIEF.md": "# brief\n", "hdb-data-pipeline/src/hdb_pipeline/x.py": "X = 1\n",
        "hdb-data-pipeline/src/hdb_pipeline/sources/bto.py": "# scraper\n", "CLAUDE.md": "# internal\n",
        "app/i18n/zh-explore.json": json.dumps({"Keep me": "保留", f"From the {BTO_SOURCE} scrape": "x"}, ensure_ascii=False, indent=2) + "\n",
        "app/modules/explore/legacy.js": f"const src = 'Upcoming BTO projects: {BTO_SOURCE} scrape';\n",
        "hdb-data-pipeline/src/hdb_pipeline/config.py": f"A = 1\n{BTO_SOURCE.upper()}_BASE_URL = 'https://{BTO_SOURCE}.com'\nB = 2\n",
        ".claude/worktrees/x/app/main.js": "// a worktree copy - never walked\n",
    }.items():
        write(src, rel, text)


def quiet(fn, *a, **k):
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        return fn(*a, **k), out.getvalue() + err.getvalue()


class Temp(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="sghf-tools-"))

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)


class StageSite(Temp):
    def test_public_stage_is_runtime_only_with_bto_and_flood_off(self):
        app, out = self.tmp / "app", self.tmp / "_site"
        make_app(app)
        (files, dropped), _ = quiet(stage_site.stage, app, out, public=True)
        self.assertIn("data/data.js", files)
        self.assertIn("data/family.js", files)
        self.assertEqual(dropped, ["data/bto.js", "data/flood.js"])
        for gone in ["data/bto.js", "data/flood.js", "README.md", "CLAUDE.md", "Dockerfile", "policy/fragments/new.json", "content/glossary/a.md"]:
            self.assertFalse((out / gone).exists(), gone)
        cfg = (out / "config.js").read_text(encoding="utf-8")
        self.assertIn("export const BUILD_FEATURES = { btoData: false, floodData: false };\n", cfg)
        self.assertNotIn("btoData: true", cfg)
        self.assertNotIn("floodData: true", cfg)
        self.assertIn("btoData: true", (app / "config.js").read_text(encoding="utf-8"), "the source app is untouched")
        man = json.loads((out / "sw-manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(man["data"], ["data/data.js", "data/family.js"])
        self.assertIn("config.js", man["shell"])

    def test_private_stage_keeps_bto_and_refuses_foreign_folders(self):
        app, out = self.tmp / "app", self.tmp / "_site"
        make_app(app)
        (files, dropped), _ = quiet(stage_site.stage, app, out)
        self.assertIn("data/bto.js", files)
        self.assertIn("data/flood.js", files)
        self.assertEqual(dropped, [])
        quiet(stage_site.stage, app, out)  # re-run over its own output: fine
        other = self.tmp / "mine"
        write(other, "precious.txt", "keep")
        with self.assertRaises(SystemExit):
            quiet(stage_site.stage, app, other)
        self.assertTrue((other / "precious.txt").exists())
        with self.assertRaises(SystemExit):
            quiet(stage_site.stage, app, app / "sub")

    def test_stage_stamps_the_version_into_the_staged_config_only(self):  # Phase 7b About: "App <sha>"
        app, out = self.tmp / "app", self.tmp / "_site"
        make_app(app)
        write(app, "config.js", CONFIG + "export const BUILD_SHA = 'dev';\n")
        quiet(stage_site.stage, app, out, public=True, sha="abc1234")
        cfg = (out / "config.js").read_text(encoding="utf-8")
        self.assertIn("export const BUILD_SHA = 'abc1234';\n", cfg)
        self.assertIn("{ btoData: false, floodData: false }", cfg)
        self.assertIn("BUILD_SHA = 'dev'", (app / "config.js").read_text(encoding="utf-8"), "the source app is untouched")
        with self.assertRaises(SystemExit):
            quiet(stage_site.stage, app, out, sha="x'; alert(1)")
        self.assertFalse(stage_site.stamp_sha(out / "missing.js", "abc"))

    def test_public_stage_fails_without_the_switch(self):
        app, out = self.tmp / "app", self.tmp / "_site"
        make_app(app)
        write(app, "config.js", "export const BUILD_FEATURES = {};\n")
        with self.assertRaises(SystemExit):
            quiet(stage_site.stage, app, out, public=True)
        (app / "config.js").unlink()
        with self.assertRaises(SystemExit):
            quiet(stage_site.stage, app, self.tmp / "_site2", public=True)


class PublicExport(Temp):
    def setUp(self):
        super().setUp()
        self.src, self.out = self.tmp / "repo", self.tmp / "public"
        make_repo(self.src)
        self.deny = write(self.tmp, "deny.txt", "# test denylist\nD:\\Old Project Folder\nsomeone-at-work\n")

    def run_export(self, **k):
        return quiet(public_export.export, self.src, self.out, self.deny, **k)

    def test_clean_export_allow_list_and_transforms(self):
        (manifest, problems), _ = self.run_export()
        self.assertEqual(problems, [])
        have = set(manifest["files"])
        for rel in ["README.md", "LICENSE", "app/index.html", "app/config.js", "app/data/data.js", "app/README.md",
                    "app/content/glossary/a.md", "tools/build_data.py", "tests/a.test.js", "docs/MODULE_MAP.md",
                    "hdb-data-pipeline/src/hdb_pipeline/x.py", "hdb-data-pipeline/docs/PROJECT_BRIEF.md", "app/sw-manifest.json",
                    "tools/fetch_hdb_blocks.py", "tests/fixtures/gen/all.mjs", "DATA_LICENCES.md", "CHANGELOG.md", ".github/ISSUE_TEMPLATE/bug.yml",
                    "hdb-data-pipeline/.env.example"]:
            self.assertIn(rel, have, rel)
        self.assertIn("tools/curated_other.json", have)
        for rel in ["app/data/bto.js", "app/data/flood.js", "tools/curated_flood_prone.json", "tools/fetch_bto.py", "tools/rents_cache.json", "tools/cache/big.json",
                    "hdb-data-pipeline/.env", "hdb-data-pipeline/.env.local","hdb-data-pipeline/secrets/key.json", "hdb-data-pipeline/docs/STATE.yml",
                    "hdb-data-pipeline/src/hdb_pipeline/sources/bto.py", "CLAUDE.md", "app/CLAUDE.md",
                    "app/policy/fragments/new.json", ".claude/worktrees/x/app/main.js"]:
            self.assertNotIn(rel, have, rel)
            self.assertFalse((self.out / rel).exists(), rel)
        self.assertIn("{ btoData: false, floodData: false }", (self.out / "app/config.js").read_text(encoding="utf-8"))
        self.assertEqual(json.loads((self.out / "app/sw-manifest.json").read_text(encoding="utf-8"))["data"], ["data/data.js", "data/family.js"])
        zh = json.loads((self.out / "app/i18n/zh-explore.json").read_text(encoding="utf-8"))
        self.assertEqual(zh, {"Keep me": "保留"})
        self.assertNotIn(BTO_SOURCE, (self.out / "app/modules/explore/legacy.js").read_text(encoding="utf-8").lower())
        self.assertEqual((self.out / "hdb-data-pipeline/src/hdb_pipeline/config.py").read_text(encoding="utf-8"), "A = 1\nB = 2\n")
        self.assertIn(public_export.MARKER, (self.out / ".gitignore").read_text(encoding="utf-8"))
        self.assertFalse((self.out / ".git").exists(), "no git is run")
        self.assertIn("btoData: true", (self.src / "app/config.js").read_text(encoding="utf-8"), "the source is untouched")
        # re-run needs --clean; then it replaces the earlier export
        with self.assertRaises(SystemExit):
            self.run_export()
        (manifest, problems), _ = self.run_export(clean=True)
        self.assertEqual(problems, [])

    def test_denylist_hit_in_code_refuses_and_writes_nothing(self):
        write(self.src, "app/main.js", "// built on D:/old project folder/app\n")  # other slash + case: still a hit
        (manifest, problems), _ = self.run_export()
        self.assertTrue(any("app/main.js" in p and "denylist line 2" in p for p in problems), problems)
        self.assertFalse(self.out.exists(), "nothing written when refused")
        self.assertFalse(any("old project folder" in p.lower() for p in problems), "hits name the line, not the value")

    def test_json_escaped_path_in_code_is_a_hit(self):
        write(self.src, "tools/paths.json", '{"root": "D:\\\\Old Project Folder\\\\x"}')
        write(self.src, "tools/curated_x.json", '{"root": "D:\\\\Old Project Folder\\\\x"}')
        (manifest, problems), _ = self.run_export()
        self.assertTrue(any("tools/curated_x.json" in p for p in problems), problems)

    def test_denylist_hit_in_an_optional_doc_drops_it(self):
        write(self.src, "hdb-data-pipeline/docs/PROJECT_BRIEF.md", "written by Someone-At-Work\n")
        write(self.src, "hdb-data-pipeline/docs/DATA_MODEL.md", f"BTO data from the {BTO_SOURCE} scrape\n")
        (manifest, problems), _ = self.run_export()
        self.assertEqual(problems, [])
        dropped = dict(manifest["dropped"])
        self.assertIn("hdb-data-pipeline/docs/PROJECT_BRIEF.md", dropped)
        self.assertIn("built-in term", dropped["hdb-data-pipeline/docs/DATA_MODEL.md"])
        self.assertFalse((self.out / "hdb-data-pipeline/docs/PROJECT_BRIEF.md").exists())

    def test_secret_looking_tokens_refuse(self):
        # every fake token is split in this source, so the public export of THIS file passes its own scan
        tokens = {
            "tools/a.py": "TOKEN = 'ghp_" + "A" * 36 + "'\n",
            "tools/b.py": "PROXY = 'http://user:pa" + "55@proxy.example:8080'\n",
            "tools/c.py": "PROXY = '10.1.2.3:" + "3128'\n",
            "tools/d.py": "-----BEGIN RSA " + "PRIVATE KEY-----\n",
            "tools/e.py": "P = r'C:\\Us" + "ers\\jdoe\\work'\n",
            "tools/f.py": "K = 'AKIA" + "ABCDEFGHIJKLMNOP'\n",
        }
        for rel, text in tokens.items():
            write(self.src, rel, text)
        (manifest, problems), _ = self.run_export()
        for rel in tokens:
            self.assertTrue(any(p.startswith(rel) and "secret" in p for p in problems), (rel, problems))
        self.assertFalse(self.out.exists())

    def test_update_in_place_keeps_git_history(self):  # go-live: --out is the public repo's working copy
        (manifest, problems), _ = self.run_export()
        self.assertEqual(problems, [])
        write(self.out, ".git/HEAD", "ref: refs/heads/main\n")  # the owner ran git init + one commit there
        write(self.out, "stale.txt", "removed from the source since")
        with self.assertRaises(SystemExit):
            self.run_export()  # still needs --clean
        (manifest, problems), _ = self.run_export(clean=True)
        self.assertEqual(problems, [])
        self.assertEqual((self.out / ".git/HEAD").read_text(encoding="utf-8"), "ref: refs/heads/main\n", ".git kept")
        self.assertFalse((self.out / "stale.txt").exists(), "everything else replaced")
        self.assertNotIn(".git/HEAD", manifest["files"])
        # a git repo this script did not make is never touched
        foreign = self.tmp / "foreign"
        write(foreign, ".git/HEAD", "x")
        write(foreign, "keep.txt", "keep")
        with self.assertRaises(SystemExit):
            quiet(public_export.export, self.src, foreign, self.deny, clean=True)
        self.assertTrue((foreign / "keep.txt").exists())

    def test_private_workflows_stay_private(self):  # S4: refresh PR + publish job name the private repo / its secrets
        for name in ["ci.yml", "data-refresh.yml", "publish-public.yml"]:
            write(self.src, f".github/workflows/{name}", f"name: {name}\n")
        (manifest, problems), _ = self.run_export()
        self.assertEqual(problems, [])
        self.assertIn(".github/workflows/ci.yml", manifest["files"])
        for name in ["data-refresh.yml", "publish-public.yml"]:
            self.assertNotIn(f".github/workflows/{name}", manifest["files"])
            self.assertIn(f".github/workflows/{name}", manifest["excluded"])
            self.assertFalse((self.out / ".github/workflows" / name).exists())
            self.assertTrue(public_export.match(f".github/workflows/{name}", public_export.FORBIDDEN))
        for real in ["data-refresh.yml", "publish-public.yml"]:  # the real files in this repo are excluded too
            self.assertTrue(public_export.match(f".github/workflows/{real}", public_export.EXCLUDE))

    def test_fresh_clone_of_the_public_repo_is_updated_in_place(self):  # publish-public.yml: no MARKER in a clone
        (manifest, problems), _ = self.run_export()
        self.assertEqual(problems, [])
        clone = self.tmp / "clone"
        shutil.copytree(self.out, clone)
        (clone / public_export.MARKER).unlink()  # gitignored: never in a clone
        write(clone, ".git/HEAD", "ref: refs/heads/main\n")
        (manifest, problems), _ = quiet(public_export.export, self.src, clone, self.deny, clean=True)
        self.assertEqual(problems, [])
        self.assertTrue((clone / ".git/HEAD").exists())
        self.assertEqual((clone / ".gitignore").read_text(encoding="utf-8").count(public_export.MARKER), 1, "trailer not doubled")
        # a clone of an EMPTY public repo (only .git) is fine; a clone without the trailer is foreign
        empty = self.tmp / "empty"
        write(empty, ".git/HEAD", "ref: refs/heads/main\n")
        (manifest, problems), _ = quiet(public_export.export, self.src, empty, self.deny, clean=True)
        self.assertEqual(problems, [])
        foreign = self.tmp / "foreign2"
        write(foreign, ".git/HEAD", "x")
        write(foreign, ".gitignore", f"{public_export.MARKER}\n")  # the name alone is not the trailer
        with self.assertRaises(SystemExit):
            quiet(public_export.export, self.src, foreign, self.deny, clean=True)

    def test_out_must_be_outside_and_not_foreign(self):
        with self.assertRaises(SystemExit):
            quiet(public_export.export, self.src, self.src / "export", self.deny)
        write(self.out, "precious.txt", "keep")
        with self.assertRaises(SystemExit):
            self.run_export(clean=True)
        self.assertTrue((self.out / "precious.txt").exists())

    def test_missing_or_empty_denylist_refuses(self):
        with self.assertRaises(SystemExit):
            quiet(public_export.export, self.src, self.out, self.tmp / "nope.txt")
        empty = write(self.tmp, "empty.txt", "# only comments\n\n")
        with self.assertRaises(SystemExit):
            quiet(public_export.export, self.src, self.out, empty)

    def test_cli_exit_codes(self):
        rc, _ = quiet(public_export.main, ["--src", str(self.src), "--out", str(self.out), "--denylist", str(self.deny)])
        self.assertEqual(rc, 0)
        write(self.src, "tools/a.py", "TOKEN = 'ghp_" + "B" * 36 + "'\n")
        rc, text = quiet(public_export.main, ["--src", str(self.src), "--out", str(self.tmp / "p2"), "--denylist", str(self.deny)])
        self.assertEqual(rc, 1)
        self.assertIn("EXPORT REFUSED", text)

    def test_example_denylist_passes_its_own_scan(self):
        example = TOOLS / "public_denylist.example.txt"
        terms = public_export.load_denylist(example)
        self.assertTrue(len(terms) > 3)
        data = example.read_bytes()
        hits = [h for h in public_export.scan_bytes("tools/public_denylist.example.txt", data, [], True)]
        self.assertEqual(hits, [], "no secret-looking token in the shipped example")


if __name__ == "__main__":
    unittest.main()
