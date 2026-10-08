"""Public export (DEC-015): build an allow-listed copy of this private repo for the fresh public repository.

    python tools/public_export.py --out ../sg-housing-finance-public            # first export (folder new or empty)
    python tools/public_export.py --out ../sg-housing-finance-public --clean    # replace an earlier export
    python tools/public_export.py --out DIR --src DIR --denylist FILE           # other source tree (tests)

What it does - and never does (no git: the owner runs `git init` + one squashed commit in --out):
  1. reads the denylist (gitignored tools/public_denylist.txt; format in tools/public_denylist.example.txt):
     one string per line - machine paths, user names, company / network names, e-mails. Matching ignores case
     and treats \\ and / (any run of them) as the same, so JSON-escaped paths match too.
  2. copies only the INCLUDE allow-list below, minus EXCLUDE (secrets, env files, caches, internal docs, the BTO
     scrape + its scraper and generator tools/fetch_bto.py), except the reviewed KEEP list (.env.example
     template). Files with a denylist hit are left out when they are optional docs;
     anywhere else the export FAILS (the public repo would be broken) - scrub the file in the private repo.
     PUB's flood-prone points (data/flood.js + their hand transcription tools/curated_flood_prone.json: PUB's website
     terms allow personal viewing only) are excluded the same way.
  3. switches the BTO and flood features off in app/config.js (BUILD_FEATURES.btoData / floodData = false) and rebuilds
     app/sw-manifest.json + the sw.js stamp (tools/build_sw_manifest.py) for the exported app.
  4. scans the WHOLE output again (text and binary, file names too) for denylisted strings and secret-looking
     tokens (GitHub / AWS / Google / Slack / OpenAI keys, private keys, service-account JSON, user:pass@ URLs,
     ip:port proxy addresses, user-profile paths) and FAILS on any hit, then prints the manifest (files + sizes).
Exit codes: 0 = clean export, 1 = refused (a hit, a missing denylist, a required file excluded), 2 = bad arguments.
Hits are reported by denylist line number, never by the denylisted text itself. Standard library only.
"""
import argparse
import fnmatch
import json
import os
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build_sw_manifest  # noqa: E402
import stage_site  # noqa: E402

ROOT = HERE.parent
DENYLIST = HERE / "public_denylist.txt"
MARKER = ".public-export.json"

# ---------------------------------------------------------------- what goes in (posix globs, relative to --src)
INCLUDE = [
    "README.md", "LICENSE", "package.json", ".gitignore", ".gitattributes", ".dockerignore", "docker-compose.yml",
    "serve.cmd", ".github/workflows/*.yml", ".github/ISSUE_TEMPLATE/*.yml", "DATA_LICENCES.md", "CHANGELOG.md",
    # app: runtime + source (content .md sources, README, Dockerfile)
    "app/index.html", "app/main.js", "app/config.js", "app/sw.js", "app/sw-routes.js", "app/manifest.webmanifest",
    "app/README.md", "app/Dockerfile", "app/icons/*", "app/core/**/*.js", "app/engine/**/*.js", "app/modules/**/*.js",
    "app/styles/**/*.css", "app/i18n/*.json", "app/content/*.json", "app/content/**/*.md", "app/policy/sg-policy.json",
    "app/data/*.js",
    # generators + curated inputs (caches excluded below)
    "tools/*.py", "tools/curated_*.json", "tools/hdb_blocks.json", "tools/public_denylist.example.txt",
    # JS tests + fixtures, Python tool tests
    "tests/**/*.js", "tests/**/*.json", "tests/**/*.txt", "tests/**/*.py",
    # fixture generators (npm run fixtures[:check]; tests/explore/money.test.js imports one) + their README
    "tests/**/*.mjs", "tests/fixtures/gen/README.md",
    # docs: a trimmed, outward-facing set
    "docs/MODULE_MAP.md", "docs/backtest-fair-value.md", "docs/screenshot.png",
    # the pipeline (portfolio, go-live Q9): code + tests + outward-facing docs
    "hdb-data-pipeline/README.md", "hdb-data-pipeline/pyproject.toml", "hdb-data-pipeline/Dockerfile",
    "hdb-data-pipeline/.gitignore", "hdb-data-pipeline/.env.example", "hdb-data-pipeline/src/**/*.py", "hdb-data-pipeline/dagster_project/**/*.py",
    "hdb-data-pipeline/pipelines/*.py", "hdb-data-pipeline/pipelines/README.md", "hdb-data-pipeline/tests/*.py",
    "hdb-data-pipeline/tests/README.md", "hdb-data-pipeline/data/*/.gitkeep",
    "hdb-data-pipeline/docs/PROJECT_BRIEF.md", "hdb-data-pipeline/docs/SYSTEM_DESIGN.md",
    "hdb-data-pipeline/docs/BUSINESS_RULES.md", "hdb-data-pipeline/docs/DATA_MODEL.md",
]
# never, even when an INCLUDE glob matches
EXCLUDE = [
    "**/.env", "**/.env.*", ".env", ".env.*", "**/secrets/**", "**/*.pem", "**/*.key", "**/*.p12", "**/*.pfx",
    "**/id_rsa*", "**/*service-account*.json", "**/*.log",
    "**/__pycache__/**", "**/*.pyc", "**/.pytest_cache/**", "**/node_modules/**", "**/.ipynb_checkpoints/**",
    "**/*.ipynb", "**/*.zip", "**/*.twb", "**/*.twbx", "**/*.hyper", "**/.claude/**", "**/graphify-out/**",
    "tools/cache/**", "tools/*_cache.json", "**/CLAUDE.md",
    "app/policy/fragments/**",
    "tools/public_denylist.txt",
    # DEC-015: the unlicensed BTO scrape, its scraper and its generator stay private
    "app/data/bto.js", "tools/fetch_bto.py",
    # PUB's website terms (pub.gov.sg/termsofuse): personal viewing only - the flood points and their transcription stay private
    "app/data/flood.js", "tools/curated_flood_prone.json",
    "hdb-data-pipeline/src/hdb_pipeline/sources/bto.py", "hdb-data-pipeline/tests/test_bto_parsing.py",
    # internal docs (personal / work context): never public
    "hdb-data-pipeline/docs/STATE.yml", "hdb-data-pipeline/docs/AUDIT_LOG.md", "hdb-data-pipeline/docs/DECISION_LOG.md",
    "hdb-data-pipeline/docs/NEXT_SESSION.md", "hdb-data-pipeline/docs/PROJECT_STATUS.md",
    "hdb-data-pipeline/docs/specs/**", "HANDOFF.md",
]
# reviewed exceptions to EXCLUDE: placeholders only, no values (docker-compose.yml points at the pipeline .env,
# so the public repo ships the template; the secret scan below still runs on it)
KEEP = ["hdb-data-pipeline/.env.example"]
# a denylist hit only drops these (documentation: docs folders + any .md but the root README); elsewhere it fails
OPTIONAL = ["docs/**", "hdb-data-pipeline/docs/**", "**/*.md"]
OPTIONAL_NEVER = ["README.md"]
# built-in denylist (on top of the owner's file): the unlicensed BTO source must not be named in the public repo
BUILTIN_DENY = ["record" + "bto"]  # spelled in two parts so this file does not trip its own scan
# deliberate rewrites before the scan (DEC-015): the few code / test / dictionary files that name the BTO source
NEUTRAL = "external BTO listing"
BTO_SOURCE_RE = re.compile(re.escape(BUILTIN_DENY[0]) + r"(?:\.com)?", re.I)
PRUNE = {".git", ".claude", "node_modules", "__pycache__", ".pytest_cache", ".ruff_cache", "graphify-out", ".venv",
         "venv", "legacy", "tableau", ".dagster_home", ".playwright-mcp"}
# must be in the output (the public repo has to run)
REQUIRED = ["README.md", "LICENSE", "package.json", "app/index.html", "app/main.js", "app/config.js",
            "app/core/data-loader.js", "app/policy/sg-policy.json"]
# must NOT be in the output (checked after the copy, belt and braces)
FORBIDDEN = ["app/data/bto.js", "app/data/flood.js", "tools/curated_flood_prone.json", "tools/fetch_bto.py", "hdb-data-pipeline/src/hdb_pipeline/sources/bto.py",
             "**/.env", "**/secrets/**", "**/CLAUDE.md", "hdb-data-pipeline/docs/STATE.yml"]
PUBLIC_OFF = stage_site.PUBLIC_OFF

# ---------------------------------------------------------------- secret-looking tokens
SECRETS = [
    ("GitHub token", r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}"),
    ("GitHub fine-grained token", r"\bgithub_pat_[A-Za-z0-9_]{22,}"),
    ("AWS access key", r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"),
    ("private key", r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    ("Google API key", r"\bAIza[0-9A-Za-z_\-]{35}"),
    ("service-account JSON", r'"private_key(?:_id)?"\s*:\s*"[^"]{8,}'),
    ("Slack token", r"\bxox[abprs]-[A-Za-z0-9-]{10,}"),
    ("OpenAI / Anthropic key", r"\bsk-(?:ant-|proj-)?[A-Za-z0-9_\-]{20,}"),
    ("Stripe live key", r"\b[rs]k_live_[A-Za-z0-9]{16,}"),
    ("credentials in a URL", r"\b[a-z][a-z0-9+.\-]*://[^/\s:@'\"<>]+:[^/\s@'\"<>]+@[\w.\-]+"),
    ("ip:port (proxy?)", r"\b(?!127\.0\.0\.1:|0\.0\.0\.0:)(?:\d{1,3}\.){3}\d{1,3}:\d{2,5}\b"),
    ("Windows user-profile path", r"\b[A-Za-z]:[\\/]{1,2}Users[\\/]{1,2}(?!Public\b|Default\b|<)[A-Za-z0-9._\-]+"),
    ("home-folder path", r"(?<![\w.])/(?:home|Users)/(?!runner\b|<)[a-z][a-z0-9._\-]+/"),
]
SECRET_RES = [(name, re.compile(rx)) for name, rx in SECRETS]
# exact matches that look like a secret but are known test values (reviewed)
NOT_SECRET = {"192.168.1.20:8766"}  # tests/pwa/status.test.js: a LAN address that must not get the offline copy
TEXT_EXT = {".md", ".txt", ".py", ".js", ".mjs", ".json", ".html", ".css", ".yml", ".yaml", ".toml", ".cfg", ".ini",
            ".csv", ".svg", ".webmanifest", ".cmd", ".bat", ".ps1", ".sh", ".gitignore", ".gitattributes",
            ".dockerignore", ".example", ""}


def match(rel, patterns):
    """fnmatch with ** spanning folders ('a/**/*.js' also matches 'a/x.js')."""
    for p in patterns:
        if fnmatch.fnmatchcase(rel, p) or ("/**/" in p and fnmatch.fnmatchcase(rel, p.replace("/**/", "/"))):
            return True
        if p.endswith("/**") and (rel == p[:-3] or rel.startswith(p[:-2])):
            return True
        if p.startswith("**/") and match(rel, [p[3:]]):
            return True
        if p.startswith("**/") and "/" in rel and match(rel.split("/", 1)[1], [p]):
            return True
    return False


def norm(s):
    """Lower case; any run of / or \\ becomes one /."""
    return re.sub(r"[\\/]+", "/", s.lower())


def load_denylist(path):
    p = Path(path)
    if not p.is_file():
        raise SystemExit(f"error: denylist {p} not found - copy tools/public_denylist.example.txt to "
                         f"tools/public_denylist.txt and fill in your own values (it is gitignored)")
    terms = []
    for i, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
        t = line.strip()
        if t and not t.startswith("#"):
            if len(t) < 3:
                raise SystemExit(f"error: denylist line {i} is shorter than 3 characters (too many false hits)")
            terms.append((f"denylist line {i}", t))
    if not terms:
        raise SystemExit(f"error: denylist {p} has no entries")
    return terms + [(f"built-in term '{t}'", t) for t in BUILTIN_DENY]


def is_text(path, data):
    return (path.suffix.lower() in TEXT_EXT or path.name.startswith(".")) and b"\0" not in data[:8192]


def scan_bytes(rel, data, terms, text):
    """[(kind, detail)] hits in one file: denylist (by line number) + secrets (text only) + the file name."""
    hits = []
    name_n = norm(rel)
    s = data.decode("utf-8", errors="replace") if text else ""
    body = norm(s) if text else ""
    low = data.lower() if not text else b""  # bytes.lower() folds ASCII only - also in UTF-16LE text
    for i, t in terms:
        tn = norm(t)
        if tn in name_n:
            hits.append(("denylist", f"{i} in the file name"))
        elif text and tn in body:
            hits.append(("denylist", f"{i} at line {body[:body.index(tn)].count(chr(10)) + 1}"))
        elif not text:  # binary (xls, png metadata...): raw UTF-8 and UTF-16LE forms, either slash
            forms = {t.lower(), t.lower().replace("\\", "/"), t.lower().replace("/", "\\")}
            if any(f.encode("utf-8") in low or f.encode("utf-16-le") in low for f in forms):
                hits.append(("denylist", f"{i} (binary)"))
    if text:
        for name, rx in SECRET_RES:
            m = next((m for m in rx.finditer(s) if m.group(0) not in NOT_SECRET), None)
            if m:
                hits.append(("secret", f"{name} at line {s[:m.start()].count(chr(10)) + 1}"))
    return hits


def candidates(src):
    """Allow-listed files under src (posix rel paths), and the ones EXCLUDE removed. Tool / VCS folders are skipped."""
    src = Path(src)
    picked, excluded = [], []
    for dirpath, dirnames, filenames in os.walk(src):
        dirnames[:] = sorted(d for d in dirnames if d not in PRUNE)
        for name in sorted(filenames):
            rel = (Path(dirpath) / name).relative_to(src).as_posix()
            if match(rel, INCLUDE):
                (excluded if match(rel, EXCLUDE) and rel not in KEEP else picked).append(rel)
    return sorted(picked), sorted(excluded)


def optional(rel):
    return rel not in OPTIONAL_NEVER and match(rel, OPTIONAL)


def transform(rel, data):
    """Deliberate rewrites (DEC-015) -> (new bytes, note or None). Only files that need it change:
    app/i18n/*.json  entries whose English key or Chinese value names the BTO source are dropped
    app/ + tests/ JS the source name becomes a neutral phrase (strings shown only while btoData is on; the tests
                     that check it see the same phrase)
    pipeline config  the BTO-source URL constant goes (only the excluded scraper used them)"""
    if not BTO_SOURCE_RE.search(data.decode("utf-8", errors="replace")):
        return data, None
    text = data.decode("utf-8")
    if re.fullmatch(r"app/i18n/[^/]+\.json", rel):
        d = json.loads(text)
        keep = {k: v for k, v in d.items() if not (BTO_SOURCE_RE.search(k) or BTO_SOURCE_RE.search(str(v)))}
        out = json.dumps(keep, ensure_ascii=False, indent=2) + ("\n" if text.endswith("\n") else "")
        return out.encode("utf-8"), f"dropped {len(d) - len(keep)} dictionary entries"
    if rel.endswith((".js", ".mjs")) and rel.startswith(("app/", "tests/")):
        out, n = BTO_SOURCE_RE.subn(NEUTRAL, text)
        return out.encode("utf-8"), f"renamed the BTO source {n}x"
    if rel == "hdb-data-pipeline/src/hdb_pipeline/config.py":
        lines = text.splitlines(keepends=True)
        keep = [ln for ln in lines if not BTO_SOURCE_RE.search(ln)]
        return "".join(keep).encode("utf-8"), f"dropped {len(lines) - len(keep)} lines"
    return data, None


def check_out(out, src, clean):
    """Refuse an --out inside / above the source, a non-empty folder that is not an earlier export, or a git repo
    that is not an earlier export. An earlier export that is now the public repo's working copy (.git + MARKER) is
    updated in place with --clean: everything but .git is replaced, so the owner commits the diff and pushes."""
    out, src = Path(out).resolve(), Path(src).resolve()
    if out == src or src in out.parents or out in src.parents:
        raise SystemExit(f"error: --out must be outside the source repo (got {out})")
    if out.exists():
        if not out.is_dir():
            raise SystemExit(f"error: {out} exists and is not a folder")
        if any(out.iterdir()):
            if (out / ".git").exists() and not (out / MARKER).is_file():
                raise SystemExit(f"error: {out} is a git repository that this script did not make - refusing to touch it")
            if not (out / MARKER).is_file():
                raise SystemExit(f"error: {out} is not empty and is not an earlier export - refusing to touch it")
            if not clean:
                raise SystemExit(f"error: {out} holds an earlier export - pass --clean to replace it")
    return out


def prepare_out(out):
    if out.exists() and (out / ".git").exists():  # the public repo's working copy: keep its history, replace the rest
        for child in out.iterdir():
            if child.name == ".git":
                continue
            shutil.rmtree(child) if child.is_dir() and not child.is_symlink() else child.unlink()
        return out
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    return out


def export(src, out, denylist, clean=False):
    """Run the export. Returns (manifest dict, problems list); raises SystemExit on refusal before copying."""
    src = Path(src).resolve()
    out = check_out(out, src, clean)
    terms = load_denylist(denylist)
    picked, excluded = candidates(src)
    problems, dropped, copied, rewritten, content = [], [], [], [], {}
    for rel in picked:
        data = (src / rel).read_bytes()
        if is_text(src / rel, data):
            data, note = transform(rel, data)
            if note:
                rewritten.append((rel, note))
        hits = scan_bytes(rel, data, terms, is_text(src / rel, data))
        if not hits:
            copied.append(rel)
            content[rel] = data
        elif all(k == "denylist" for k, _ in hits) and optional(rel):
            dropped.append((rel, "; ".join(d for _, d in hits)))
        else:
            problems.append(f"{rel}: " + "; ".join(f"{k}: {d}" for k, d in hits))
    missing = [r for r in REQUIRED if r not in copied]
    if missing:
        problems.append("required files missing from the export: " + ", ".join(missing))
    if problems:
        return {"files": {}, "dropped": dropped, "excluded": excluded, "rewritten": rewritten}, problems
    out = prepare_out(out)
    for rel in copied:
        dst = out / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(content[rel])
    # 3. BTO + flood off, offline-copy manifest for the exported app
    stage_site.switch_off(out / "app" / "config.js", PUBLIC_OFF)
    feats = stage_site.build_sw_manifest_features(out / "app")
    if any(feats.get(n, False) for n in PUBLIC_OFF):
        problems.append(f"app/config.js still has {PUBLIC_OFF} on")
    if (out / "app" / "sw.js").is_file():
        if build_sw_manifest.main(["--app", str(out / "app")]):
            problems.append("build_sw_manifest.py failed on the exported app")
        elif build_sw_manifest.OUT not in copied:
            copied.append(f"app/{build_sw_manifest.OUT}")
    gi = out / ".gitignore"
    with open(gi, "a", encoding="utf-8", newline="\n") as f:
        f.write(f"\n# written by tools/public_export.py (export bookkeeping, not part of the repo)\n{MARKER}\n")
    if ".gitignore" not in copied:
        copied.append(".gitignore")
    # 4. scan everything that is now in --out
    files = sorted(p.relative_to(out).as_posix() for p in out.rglob("*") if p.is_file() and ".git" not in p.relative_to(out).parts)
    for rel in files:
        if rel == MARKER:
            continue
        data = (out / rel).read_bytes()
        for kind, d in scan_bytes(rel, data, terms, is_text(out / rel, data)):
            problems.append(f"OUTPUT {rel}: {kind}: {d}")
        if match(rel, FORBIDDEN):
            problems.append(f"OUTPUT {rel}: forbidden in the public repo")
    sizes = {rel: (out / rel).stat().st_size for rel in files if rel != MARKER}
    manifest = {"files": sizes, "dropped": dropped, "excluded": excluded, "rewritten": rewritten, "features_off": PUBLIC_OFF}
    (out / MARKER).write_text(json.dumps({"about": "tools/public_export.py bookkeeping - delete before committing "
                                          "or keep (it is gitignored)", "files": len(sizes),
                                          "bytes": sum(sizes.values()), "ok": not problems}, indent=1) + "\n",
                              encoding="utf-8")
    return manifest, problems


def report(manifest, problems, out):
    files = manifest["files"]
    for rel, n in files.items():
        print(f"  {n:>10,}  {rel}")
    groups = {}
    for rel, n in files.items():
        top = rel.split("/")[0] if "/" in rel else "(root)"
        g = groups.setdefault(top, [0, 0])
        g[0] += 1
        g[1] += n
    print("summary:")
    for top, (c, n) in sorted(groups.items()):
        print(f"  {top:<22} {c:>5} files  {n / 1e6:8.2f} MB")
    print(f"  {'total':<22} {len(files):>5} files  {sum(files.values()) / 1e6:8.2f} MB  -> {out}")
    print(f"left out by EXCLUDE: {len(manifest['excluded'])} files")
    for rel in manifest["excluded"]:
        print(f"  - {rel}")
    if manifest["dropped"]:
        print("left out (optional doc with a denylist hit - scrub it in the private repo if it should be public):")
        for rel, why in manifest["dropped"]:
            print(f"  - {rel}: {why}")
    for rel, note in manifest.get("rewritten", []):
        print(f"rewritten: {rel} - {note}")
    print(f"features switched off: {', '.join(manifest.get('features_off', PUBLIC_OFF))}")
    if problems:
        print("\nEXPORT REFUSED:", file=sys.stderr)
        for p in problems:
            print(f"  ! {p}", file=sys.stderr)
    else:
        print("\nOK - no git was run. Next (owner): cd into the folder, review, git init, one commit, push to the new "
              "public repo.")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", required=True, help="target folder (outside this repo; new, empty or an earlier export)")
    ap.add_argument("--src", default=str(ROOT), help="source repo (default: this repo)")
    ap.add_argument("--denylist", default=str(DENYLIST), help="denylist file (default: tools/public_denylist.txt)")
    ap.add_argument("--clean", action="store_true", help="replace an earlier export in --out")
    args = ap.parse_args(argv)
    try:
        manifest, problems = export(args.src, args.out, args.denylist, clean=args.clean)
    except SystemExit as e:
        print(e, file=sys.stderr)
        return 1
    report(manifest, problems, args.out)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
