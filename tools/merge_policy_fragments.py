"""Fold staged policy fragments (app/policy/fragments/<topic>.json) into app/policy/sg-policy.json.

Fragments let several people/agents add rule values in parallel without editing the same file;
the browser only reads sg-policy.json, so a fragment must be merged before its engine is wired
into the UI. Refuses duplicate ids. Deletes each fragment after a successful merge.

Run:  python tools/merge_policy_fragments.py rent commute ...   (topic names, without .json)
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAIN = ROOT / "app" / "policy" / "sg-policy.json"
FRAG = ROOT / "app" / "policy" / "fragments"
FIELDS = ["id", "value", "unit", "effective_from", "effective_to", "source_url", "retrieved", "status", "note"]


def write(doc):
    with open(MAIN, "w", encoding="utf-8", newline="\n") as f:
        f.write("{\n")
        for k in ["version", "reviewed", "review_due", "_doc"]:
            f.write(f'  "{k}": {json.dumps(doc[k], ensure_ascii=False)},\n')
        f.write('  "params": [\n')
        f.write(",\n".join("    " + json.dumps({k: p.get(k) for k in FIELDS}, ensure_ascii=False) for p in doc["params"]))
        f.write("\n  ]\n}\n")


def main(topics):
    doc = json.loads(MAIN.read_text(encoding="utf-8"))
    have = {(p["id"], p["effective_from"]) for p in doc["params"]}
    for t in topics:
        path = FRAG / f"{t}.json"
        params = json.loads(path.read_text(encoding="utf-8"))["params"]
        for p in params:
            key = (p["id"], p["effective_from"])
            if key in have:
                sys.exit(f"{t}: duplicate {key} — not merged")
            have.add(key)
        doc["params"].extend(params)
        print(f"{t}: +{len(params)} params")
    write(doc)
    for t in topics:
        (FRAG / f"{t}.json").unlink()
    print(f"sg-policy.json now has {len(doc['params'])} params")


if __name__ == "__main__":
    main(sys.argv[1:])
