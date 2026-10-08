"""Service-worker manifest for the offline copy (phase 6c AC 10): app/sw-manifest.json + version stamp in app/sw.js.

Run after ANY change under app/ (code, styles, content, policy, icons or data) and before every deploy:

    python tools/build_sw_manifest.py            # write app/sw-manifest.json, stamp VERSION / DATA_VERSION in app/sw.js
    python tools/build_sw_manifest.py --check    # exit 1 when the manifest or the stamp is out of date (CI / pre-deploy)
    python tools/build_sw_manifest.py --app DIR  # another app folder (tests use a temporary copy)

Why the stamp: browsers only install a new service worker when sw.js changes byte-wise, so the build writes the
content hashes into sw.js. Same files -> same output (no timestamps), so re-running is a no-op.

What goes in (relative to app/, so the app works under a GitHub Pages sub-path):
  shell  index.html, main.js, config.js, manifest.webmanifest, every *.js under core/ engine/ modules/ (the import-map
         prefixes @core/ @engine/ @modules/, incl. dynamic imports), styles/**/*.css, i18n/*.json,
         content/*.json (built files, not the .md sources), policy/sg-policy.json, icons/*
  data   DATA_FILES_ALL (else DATA_FILES) from core/data-loader.js that exist on disk (app/data/*.js; hashed, never
         parsed) - minus the FEATURE_FILES whose switch is off in app/config.js BUILD_FEATURES (DEC-015: the public
         build sets btoData: false, so data/bto.js is never precached)
  cdn    https://cdnjs.cloudflare.com/... stylesheet / script URLs in index.html (Leaflet)
Never: app/data in the shell, sw.js / sw-routes.js (the browser fetches those itself), *.md, Dockerfile,
policy/fragments/, OneMap (third party; tiles are not cached).

version      = hash(shell files + cdn URLs + sw.js / sw-routes.js code)  -> cache sghf-shell-<version>
data_version = hash(data files)                                          -> cache sghf-data-<data_version>
Standard library only.
"""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"
TEXT = {".js", ".css", ".html", ".json", ".svg", ".webmanifest", ".md", ".txt"}
STAMP = re.compile(r"^const (VERSION|DATA_VERSION) = '[^']*';$", re.M)
CDN = re.compile(r"""(?:href|src)=["'](https://cdnjs\.cloudflare\.com/[^"']+)["']""")
LOCAL_REF = re.compile(r"""<(?:link|script)\b[^>]*?(?:href|src)=["'](?!https?:|data:|#)([^"']+)["']""", re.I)
IMPORT = re.compile(r"""(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|new\s+Worker\s*\(\s*|new\s+URL\s*\(\s*)(['"])([^'"\n]+)\1""")
SHELL_FIXED = ["index.html", "main.js", "config.js", "manifest.webmanifest", "policy/sg-policy.json"]
SHELL_GLOBS = [("core", "**/*.js"), ("engine", "**/*.js"), ("modules", "**/*.js"), ("styles", "**/*.css"),
               ("i18n", "*.json"), ("content", "*.json"), ("icons", "*.png"), ("icons", "*.svg")]
SELF_FILES = ["sw.js", "sw-routes.js"]
OUT = "sw-manifest.json"


def read_norm(path):
    """File bytes with CRLF -> LF for text files, so Windows and CI hash the same."""
    b = path.read_bytes()
    return b.replace(b"\r\n", b"\n") if path.suffix.lower() in TEXT else b


def file_hash(path):
    return hashlib.sha256(read_norm(path)).hexdigest()


def digest(lines):
    return hashlib.sha256("\n".join(lines).encode("utf-8")).hexdigest()[:12]


def shell_files(app):
    found = [p for p in SHELL_FIXED if (app / p).is_file()]
    for folder, pattern in SHELL_GLOBS:
        base = app / folder
        if base.is_dir():
            found += [p.relative_to(app).as_posix() for p in base.glob(pattern) if p.is_file()]
    found = sorted(set(found))
    return [p for p in found if not p.startswith("data/") and p not in SELF_FILES and p != OUT]


def build_features(app):
    """{name: bool} from app/config.js `BUILD_FEATURES = { btoData: true, ... }` ({} when absent)."""
    cfg = app / "config.js"
    if not cfg.is_file():
        return {}
    m = re.search(r"^export\s+const\s+BUILD_FEATURES\s*=\s*\{([^}]*)\}", cfg.read_text(encoding="utf-8"), re.M)  # not the comments
    return {k: v == "true" for k, v in re.findall(r"(\w+)\s*:\s*(true|false)", m.group(1))} if m else {}


def data_files(app):
    loader = app / "core" / "data-loader.js"
    if not loader.is_file():
        return []
    src = loader.read_text(encoding="utf-8")
    m = re.search(r"DATA_FILES_ALL\s*=\s*\[([^\]]*)\]", src) or re.search(r"DATA_FILES\s*=\s*\[([^\]]*)\]", src)
    names = re.findall(r"""['"]([^'"]+)['"]""", m.group(1)) if m else []
    fm = re.search(r"^export\s+const\s+FEATURE_FILES\s*=\s*\{([^}]*)\}", src, re.M)
    gated = dict(re.findall(r"""['"]([^'"]+)['"]\s*:\s*['"](\w+)['"]""", fm.group(1))) if fm else {}
    on = build_features(app)
    return [n for n in names if (app / n).is_file() and (n not in gated or on.get(gated[n], False))]


def cdn_urls(app):
    html = app / "index.html"
    return sorted(set(CDN.findall(html.read_text(encoding="utf-8")))) if html.is_file() else []


def import_map(app):
    html = app / "index.html"
    if not html.is_file():
        return {}
    m = re.search(r'<script type="importmap">(.*?)</script>', html.read_text(encoding="utf-8"), re.S)
    try:
        return json.loads(m.group(1)).get("imports", {}) if m else {}
    except ValueError:
        return {}


def warnings(app, shell):
    """Referenced local files that are missing or not in the shell list (offline would break on them)."""
    out, have = [], set(shell)
    imap = import_map(app)
    html = app / "index.html"
    if html.is_file():
        for ref in LOCAL_REF.findall(html.read_text(encoding="utf-8")):
            ref = ref.split("?")[0].lstrip("./")
            if ref and ref not in have and ref not in SELF_FILES:
                out.append(f"index.html references {ref}, which is not in the shell list")
    for rel in shell:
        if not rel.endswith(".js"):
            continue
        src = (app / rel).read_text(encoding="utf-8")
        for _, spec in IMPORT.findall(src):
            if "${" in spec or spec.startswith(("http:", "https:", "data:", "node:")):
                continue
            target = None
            for prefix, to in imap.items():
                if spec.startswith(prefix):
                    target = (app / to / spec[len(prefix):]).resolve()
                    break
            if target is None:
                if not spec.startswith("."):
                    continue
                target = ((app / rel).parent / spec).resolve()
            try:
                tr = target.relative_to(app.resolve()).as_posix()
            except ValueError:
                continue
            if tr.endswith((".js", ".json", ".css")) and tr not in have and tr not in SELF_FILES:
                state = "missing" if not target.is_file() else "not in the shell list"
                out.append(f"{rel} imports {spec} ({tr}: {state})")
    return out


def stamped(sw_text, version, data_version):
    vals = {"VERSION": version, "DATA_VERSION": data_version}
    return STAMP.sub(lambda m: f"const {m.group(1)} = '{vals[m.group(1)]}';", sw_text)


def build(app):
    app = Path(app)
    shell, data, cdn = shell_files(app), data_files(app), cdn_urls(app)
    sizes = {p: len(read_norm(app / p)) for p in shell + data}
    code = []
    for name in SELF_FILES:
        p = app / name
        if p.is_file():
            text = read_norm(p).decode("utf-8")
            code.append(f"{name}\t{hashlib.sha256(STAMP.sub('', text).encode('utf-8')).hexdigest()}")
    version = digest([f"{p}\t{file_hash(app / p)}" for p in shell] + [f"cdn\t{u}" for u in cdn] + code)
    data_version = digest([f"{p}\t{file_hash(app / p)}" for p in data]) if data else "none"
    manifest = {
        "about": "Offline copy file list - generated by tools/build_sw_manifest.py; do not edit. Re-run after any app change.",
        "version": version,
        "data_version": data_version,
        "bytes": {"shell": sum(sizes[p] for p in shell), "data": sum(sizes[p] for p in data)},
        "shell": shell,
        "data": data,
        "cdn": cdn,
    }
    return manifest, warnings(app, shell)


def render(manifest):
    return json.dumps(manifest, indent=1, ensure_ascii=False) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--app", default=str(APP), help="app folder (default: app/)")
    ap.add_argument("--check", action="store_true", help="exit 1 if sw-manifest.json or the sw.js stamp is stale")
    args = ap.parse_args(argv)
    app = Path(args.app)
    manifest, warns = build(app)
    for w in warns:
        print(f"warning: {w}", file=sys.stderr)
    out, sw = app / OUT, app / "sw.js"
    text = render(manifest)
    sw_old = sw.read_text(encoding="utf-8") if sw.is_file() else ""
    sw_new = stamped(sw_old, manifest["version"], manifest["data_version"])
    if args.check:
        stale = [n for n, ok in ((OUT, out.is_file() and out.read_text(encoding="utf-8") == text), ("sw.js stamp", sw_new == sw_old)) if not ok]
        if stale:
            print(f"stale: {', '.join(stale)} - run: python tools/build_sw_manifest.py", file=sys.stderr)
            return 1
        print(f"up to date: version {manifest['version']}, data {manifest['data_version']}")
        return 0
    if not out.is_file() or out.read_text(encoding="utf-8") != text:
        out.write_text(text, encoding="utf-8", newline="\n")
    if sw.is_file() and sw_new != sw_old:
        sw.write_text(sw_new, encoding="utf-8", newline="\n")
    mb = lambda n: f"{n / 1e6:.1f} MB"  # noqa: E731
    print(f"{OUT}: version {manifest['version']}, data {manifest['data_version']} - "
          f"{len(manifest['shell'])} shell files ({mb(manifest['bytes']['shell'])}), "
          f"{len(manifest['data'])} data files ({mb(manifest['bytes']['data'])}), {len(manifest['cdn'])} cdn")
    return 0


if __name__ == "__main__":
    sys.exit(main())
