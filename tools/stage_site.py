"""Stage the GitHub Pages artifact: copy ONLY the runtime files of app/ into a site folder (go-live F8 / §2.2).

    python tools/stage_site.py --out _site            # private build (features as in app/config.js)
    python tools/stage_site.py --out _site --public   # public build: btoData + floodData = false, no data/bto.js, data/flood.js
    python tools/stage_site.py --out DIR --app DIR    # another app folder (tests)

Allow-list (anything else in app/ is left out: README.md, CLAUDE.md, Dockerfile, policy/fragments/, content/*.md
sources, caches, editor files):
    index.html main.js config.js sw.js sw-routes.js manifest.webmanifest
    icons/*.png|svg  core/**/*.js  engine/**/*.js  modules/**/*.js  styles/**/*.css  i18n/*.json  content/*.json
    policy/sg-policy.json  data/*.js (minus files of switched-off features: core/data-loader.js FEATURE_FILES)
The staged config.js gets BUILD_SHA = '<git short SHA>' (Learn -> About shows it; the repo copy keeps 'dev'; --sha X
overrides, no git -> left as is). Then sw-manifest.json + the sw.js version stamp are rebuilt for the staged folder (tools/build_sw_manifest.py), so the
offline copy lists exactly what is deployed. Size budget (go-live §2.3): no file > 12 MB, data/ <= 20 MB, site <= 30 MB.

The --out folder is replaced only if it is empty or was made by this script (marker file .staged-site). Standard
library only; prints the staged file list with sizes.
"""
import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build_sw_manifest  # noqa: E402

ROOT = HERE.parent
APP = ROOT / "app"
MARKER = ".staged-site"
ROOT_FILES = ["index.html", "main.js", "config.js", "sw.js", "sw-routes.js", "manifest.webmanifest"]
GLOBS = [("icons", "*.png"), ("icons", "*.svg"), ("core", "**/*.js"), ("engine", "**/*.js"), ("modules", "**/*.js"),
         ("styles", "**/*.css"), ("i18n", "*.json"), ("content", "*.json"), ("data", "*.js")]
FIXED = ["policy/sg-policy.json"]
REQUIRED = ["index.html", "main.js", "sw.js", "sw-routes.js", "policy/sg-policy.json", "core/data-loader.js"]
PUBLIC_OFF = ["btoData", "floodData"]  # DEC-015 (BTO scrape) + PUB website terms (flood points): off in the public build
MB = 1_000_000
BUDGET = {"file": 12 * MB, "data": 20 * MB, "site": 30 * MB}
FEATURES_RE = re.compile(r"^(export\s+const\s+BUILD_FEATURES\s*=\s*\{)([^}]*)(\})", re.M)
SHA_RE = re.compile(r"^(export\s+const\s+BUILD_SHA\s*=\s*)(['\"])[^'\"\n]*\2", re.M)
SHA_OK = re.compile(r"[0-9A-Za-z._-]{1,40}")


def git_sha(where):
    """Short SHA of HEAD of the git repo holding `where`, or None (no git, not a repo)."""
    try:
        r = subprocess.run(["git", "-C", str(where), "rev-parse", "--short", "HEAD"], capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return None
    sha = r.stdout.strip()
    return sha if r.returncode == 0 and re.fullmatch(r"[0-9a-f]{4,40}", sha) else None


def stamp_sha(config_path, sha):
    """Write `export const BUILD_SHA = '<sha>'` into a (staged) config.js. False when there is no sha, no file or no line."""
    p = Path(config_path)
    if not sha or not p.is_file():
        return False
    if not SHA_OK.fullmatch(sha):
        raise SystemExit(f"error: --sha {sha!r} is not a plain version string")
    text = p.read_text(encoding="utf-8")
    new, n = SHA_RE.subn(lambda m: f"{m.group(1)}'{sha}'", text)
    if n:
        p.write_text(new, encoding="utf-8", newline="\n")
    return bool(n)


def feature_files(app):
    """{'data/bto.js': 'btoData', ...} from core/data-loader.js FEATURE_FILES ({} when absent)."""
    loader = Path(app) / "core" / "data-loader.js"
    src = loader.read_text(encoding="utf-8") if loader.is_file() else ""
    m = re.search(r"^export\s+const\s+FEATURE_FILES\s*=\s*\{([^}]*)\}", src, re.M)
    return dict(re.findall(r"""['"]([^'"]+)['"]\s*:\s*['"](\w+)['"]""", m.group(1))) if m else {}


def switch_off(config_path, names):
    """Rewrite `export const BUILD_FEATURES = { ... }` in config.js with each of `names` set to false.

    Raises SystemExit when the file or the BUILD_FEATURES line (or one of the names in it) is missing: a public
    build must never ship with a feature it cannot switch off."""
    p = Path(config_path)
    if not p.is_file():
        raise SystemExit(f"error: {p} not found - cannot switch off {', '.join(names)} (DEC-015)")
    text = p.read_text(encoding="utf-8")
    m = FEATURES_RE.search(text)
    if not m:
        raise SystemExit(f"error: no 'export const BUILD_FEATURES = {{ ... }}' line in {p}")
    body = m.group(2)
    for name in names:
        body, n = re.subn(rf"\b({re.escape(name)}\s*:\s*)(true|false)\b", r"\1false", body)
        if not n:
            raise SystemExit(f"error: BUILD_FEATURES in {p} has no '{name}' switch")
    new = text[:m.start()] + m.group(1) + body + m.group(3) + text[m.end():]
    p.write_text(new, encoding="utf-8", newline="\n")
    return build_sw_manifest_features(p.parent)


def build_sw_manifest_features(app):
    """The switches as build_sw_manifest.py reads them (so stage + offline copy agree)."""
    fn = getattr(build_sw_manifest, "build_features", None)
    return fn(Path(app)) if fn else {}


def select(app, public):
    """Relative posix paths of the runtime files to stage, and the ones left out because a feature is off."""
    app = Path(app)
    files = [f for f in ROOT_FILES + FIXED if (app / f).is_file()]
    for folder, pattern in GLOBS:
        base = app / folder
        if base.is_dir():
            files += [p.relative_to(app).as_posix() for p in base.glob(pattern) if p.is_file()]
    files = sorted(set(files))
    gated = feature_files(app)
    off = set(PUBLIC_OFF) if public else {k for k, on in build_sw_manifest_features(app).items() if not on}
    dropped = [f for f in files if gated.get(f) in off]
    return [f for f in files if f not in dropped], dropped


def prepare_out(out, app):
    out = Path(out).resolve()
    app_r = Path(app).resolve()
    if out == app_r or app_r in out.parents or out in app_r.parents:
        raise SystemExit(f"error: --out {out} must not be the app folder, inside it, or above it")
    if out.exists():
        if not out.is_dir():
            raise SystemExit(f"error: {out} exists and is not a folder")
        if any(out.iterdir()) and not (out / MARKER).is_file():
            raise SystemExit(f"error: {out} is not empty and was not made by stage_site.py - refusing to replace it")
        shutil.rmtree(out)
    out.mkdir(parents=True)
    (out / MARKER).write_text("made by tools/stage_site.py - safe to delete\n", encoding="utf-8")
    return out


def check_budget(out, files):
    sizes = {f: (out / f).stat().st_size for f in files}
    errs = [f"{f} is {s / MB:.1f} MB (> {BUDGET['file'] / MB:.0f} MB)" for f, s in sizes.items() if s > BUDGET["file"]]
    data = sum(s for f, s in sizes.items() if f.startswith("data/"))
    total = sum(sizes.values())
    if data > BUDGET["data"]:
        errs.append(f"data/ is {data / MB:.1f} MB (> {BUDGET['data'] / MB:.0f} MB)")
    if total > BUDGET["site"]:
        errs.append(f"site is {total / MB:.1f} MB (> {BUDGET['site'] / MB:.0f} MB)")
    return sizes, errs


def stage(app, out, public=False, quiet=False, sha=None):
    app = Path(app)
    missing = [f for f in REQUIRED if not (app / f).is_file()]
    if missing:
        raise SystemExit(f"error: {app} is missing {', '.join(missing)}")
    files, dropped = select(app, public)
    out = prepare_out(out, app)
    for f in files:
        dst = out / f
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(app / f, dst)
    if public:
        if "config.js" not in files:
            raise SystemExit(f"error: app/config.js missing - the public build cannot switch off {', '.join(PUBLIC_OFF)} (DEC-015)")
        feats = switch_off(out / "config.js", PUBLIC_OFF)
        if any(feats.get(n, False) for n in PUBLIC_OFF):
            raise SystemExit(f"error: config.js still has {PUBLIC_OFF} on after the rewrite")
        leftover = [f for f in feature_files(out) if (out / f).exists()]
        if leftover:
            raise SystemExit(f"error: switched-off data still staged: {leftover}")
    stamp_sha(out / "config.js", sha if sha is not None else git_sha(app))  # Learn -> About: "App <sha>"
    rc = build_sw_manifest.main(["--app", str(out)])
    if rc:
        raise SystemExit(f"error: build_sw_manifest.py failed ({rc})")
    files = sorted(set(files) | {build_sw_manifest.OUT})
    sizes, errs = check_budget(out, files)
    if not quiet:
        for f in files:
            print(f"  {sizes[f]:>10,}  {f}")
        for f in dropped:
            print(f"  {'(left out)':>10}  {f}  - feature switched off")
        print(f"staged {len(files)} files, {sum(sizes.values()) / MB:.1f} MB -> {out}{' (public build)' if public else ''}")
    if errs:
        raise SystemExit("error: size budget exceeded: " + "; ".join(errs))
    return files, dropped


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", required=True, help="site folder to create (e.g. _site)")
    ap.add_argument("--app", default=str(APP), help="app folder (default: app/)")
    ap.add_argument("--public", action="store_true", help="public build: switch off btoData + floodData, leave out data/bto.js + data/flood.js")
    ap.add_argument("--sha", default=None, help="version for config.js BUILD_SHA (default: git short SHA of HEAD)")
    args = ap.parse_args(argv)
    stage(args.app, args.out, public=args.public, sha=args.sha)
    return 0


if __name__ == "__main__":
    sys.exit(main())
