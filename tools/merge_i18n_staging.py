"""Merge 中文 strings staged by parallel build agents into the app's i18n files.

Each staging file is app/i18n/staging/<AGENT>.<target>.json = {"English key": "中文", ...}, where <target> is
zh, zh-explore, zh-guide or zh-engine (-> app/i18n/<target>.json). Existing keys are never overwritten: a key that
is already present with a different value is reported as a conflict and left as it is.

Usage: python tools/merge_i18n_staging.py [--dry-run] [--keep]
  --dry-run  report only
  --keep     keep the staging files (default: delete them after a clean merge)
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
I18N = ROOT / "app" / "i18n"
STAGING = I18N / "staging"
TARGETS = {"zh", "zh-explore", "zh-guide", "zh-engine"}


def main(argv):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # 中文 keys on a Windows console
    dry, keep = "--dry-run" in argv, "--keep" in argv
    files = sorted(STAGING.glob("*.json")) if STAGING.exists() else []
    if not files:
        print("nothing staged")
        return 0
    merged, conflicts, bad = {}, [], []
    for f in files:
        parts = f.stem.split(".", 1)
        target = parts[1] if len(parts) == 2 else ""
        if target not in TARGETS:
            bad.append(f.name)
            continue
        merged.setdefault(target, []).append((f, json.loads(f.read_text(encoding="utf-8"))))
    for target, items in merged.items():
        path = I18N / f"{target}.json"
        text = path.read_text(encoding="utf-8")
        data = json.loads(text)
        lines = text.splitlines()
        indent = len(lines[1]) - len(lines[1].lstrip(" ")) if len(lines) > 1 else 2  # keep each file's own style
        added = 0
        for f, entries in items:
            for k, v in entries.items():
                if k in data:
                    if data[k] != v:
                        conflicts.append(f"{f.name}: {k!r} has {data[k]!r}, staged {v!r}")
                    continue
                data[k] = v
                added += 1
        print(f"{target}.json: +{added} from {', '.join(f.name for f, _ in items)}")
        if not dry:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=indent or 2) + "\n", encoding="utf-8")
    for c in conflicts:
        print("CONFLICT", c)
    for b in bad:
        print("SKIPPED (unknown target)", b)
    if not dry and not keep and not bad:
        for f in files:
            f.unlink()
        if not any(STAGING.iterdir()):
            STAGING.rmdir()
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
