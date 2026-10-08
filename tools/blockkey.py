"""Stable block keys + block-order signature, shared by the generators of per-block files.

HDB_DATA.blocks (tools/build_data.py) is sorted by (block, street); a block's index (`bid`) shifts when a
refresh adds a block. Per-block files (rents.js, commute.js, market.js) are keyed by that index, so each
records `block_sig` = signature of the data.js it was built from; the app (app/core/blockkey.js, same
algorithm) drops their per-block part when the signature does not match the loaded data.js.

  key       = "BLOCK|STREET"  (trimmed, single spaces, upper case)
  block_sig = FNV-1a 32-bit, lower-case hex, over the UTF-8 of every key joined by "\n" in HDB_DATA.blocks order

Run:  python tools/blockkey.py      (prints key count, duplicates and block_sig of app/data/data.js)
"""

import json
from pathlib import Path

DATA_JS = Path(__file__).resolve().parent.parent / "app" / "data" / "data.js"


def norm_key(block, street) -> str:
    return f"{str(block or '').strip().upper()}|{' '.join(str(street or '').split()).upper()}"


def block_keys(hdb: dict) -> list:
    streets = hdb["streets"]
    return [norm_key(b["b"], streets[b["s"]]) for b in hdb["blocks"]]


def block_sig(hdb: dict) -> str:
    h = 0x811C9DC5
    for x in "\n".join(block_keys(hdb)).encode("utf-8"):
        h = ((h ^ x) * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def main() -> int:
    t = DATA_JS.read_text(encoding="utf-8")
    hdb = json.loads(t[t.index("=") + 1:].rstrip().rstrip(";"))
    keys = block_keys(hdb)
    print(f"{len(keys):,} blocks, {len(keys) - len(set(keys))} duplicate keys, block_sig {block_sig(hdb)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
