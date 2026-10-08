"""Rolling-origin backtest of the app's "recent sales benchmark" (fair value).

Replicates benchmark(c, b) from app/modules/explore/legacy.js (tiers 1-6) in Python and
scores it against actual resale prices with no look-ahead: every test sale is valued using
only sales registered in months strictly before its own month. Also scores a naive baseline
(town + flat type median $psf, last 12 months) and an empirical 80 % interval calibrated on
the 6 months preceding each test window.

Run:  python tools/backtest_fair_value.py      (stdlib only; prints tables and rewrites
      docs/backtest-fair-value.md)
"""

import bisect
import datetime
import json
import math
import statistics
import sys
import time
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "app" / "data" / "data.js"
OUT = ROOT / "docs" / "backtest-fair-value.md"

SQFT = 10.7639           # sqm -> sqft, as in legacy.js
RADIUS_M = 400           # nearBlocks radius
LEASE_TOL = 5            # +/- years lease-commencement match
TEST_MONTHS = 3          # months per test fold
N_FOLDS = 2              # fold 1 = latest 3 complete months, fold 2 = the 3 before
CALIB_MONTHS = 6         # months before each test fold used to fit the 80 % interval
MIN_CALIB = 30           # fewer residuals than this in a tier -> use all-tier residuals
HIST_START = "2021-01"   # start of the half-yearly lag table (needs 24 m of prior history)
TIER_LABEL = {
    1: "same block, 12 m (>=3)", 2: "same block, 24 m (>=3)",
    3: "<=400 m, lease +/-5 y, 12 m (>=5)", 4: "<=400 m, lease +/-5 y, 24 m (>=5)",
    5: "town, lease +/-5 y, 12 m (>=5)", 6: "town overall, 12 m (rough)",
}
CONF = {1: "strong", 2: "strong", 3: "moderate", 4: "moderate", 5: "weak", 6: "weak"}


def load():
    s = DATA.read_text(encoding="utf-8")
    return json.loads(s[s.index("=") + 1:].rstrip().rstrip(";"))


def haversine(la1, lo1, la2, lo2):
    r = math.pi / 180
    a = math.sin((la2 - la1) * r / 2) ** 2 + math.cos(la1 * r) * math.cos(la2 * r) * math.sin((lo2 - lo1) * r / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(a))


def pct(q, xs):
    return statistics.quantiles(xs, n=100, method="inclusive")[q - 1]


class Model:
    def __init__(self, d):
        tx, self.blocks = d["tx"], d["blocks"]
        self.m, self.ft, self.b, self.ly, self.s = tx["m"], tx["ft"], tx["b"], tx["ly"], tx["s"]
        self.p, self.a = tx["p"], tx["a"]
        n = len(self.p)
        self.psf = [self.p[i] / (self.a[i] * SQFT) for i in range(n)]
        # block lease = modal lease_commence_date of its sales (first to reach max wins), else HDB year
        by_block = defaultdict(list)
        for i in range(n):
            by_block[self.b[i]].append(i)
        self.lease = []
        for bi, blk in enumerate(self.blocks):
            c, best, bl = {}, 0, 0
            for i in by_block.get(bi, ()):
                y = self.ly[i]; c[y] = c.get(y, 0) + 1
                if c[y] > best:
                    best, bl = c[y], y
            self.lease.append(bl or blk.get("yc") or 0)
        # (block, ft) and (town, ft) -> (months[], idx[]) sorted by month, for bisect windows
        bf, tf = defaultdict(list), defaultdict(list)
        for i in sorted(range(n), key=lambda i: self.m[i]):
            bf[(self.b[i], self.ft[i])].append(i)
            tf[(self.blocks[self.b[i]]["t"], self.ft[i])].append(i)
        self.bf = {k: ([self.m[i] for i in v], v) for k, v in bf.items()}
        self.tf = {k: ([self.m[i] for i in v], v) for k, v in tf.items()}
        # spatial grid for nearBlocks
        self.grid = defaultdict(list)
        for bi, blk in enumerate(self.blocks):
            self.grid[(math.floor(blk["lat"] / 0.006), math.floor(blk["lon"] / 0.006))].append(bi)
        self.near_cache = {}

    def win(self, groups, key, lo, hi):
        g = groups.get(key)
        if not g:
            return []
        ms, idx = g
        return idx[bisect.bisect_left(ms, lo):bisect.bisect_right(ms, hi)]

    def near(self, bi):
        if bi not in self.near_cache:
            b = self.blocks[bi]; gy, gx = math.floor(b["lat"] / 0.006), math.floor(b["lon"] / 0.006)
            out = []
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    for j in self.grid.get((gy + dy, gx + dx), ()):
                        x = self.blocks[j]
                        if j != bi and abs(x["lat"] - b["lat"]) < 0.006 and abs(x["lon"] - b["lon"]) < 0.006 \
                                and haversine(b["lat"], b["lon"], x["lat"], x["lon"]) <= RADIUS_M:
                            out.append(j)
            self.near_cache[bi] = out
        return self.near_cache[bi]

    def med(self, idx):
        return statistics.median(self.psf[i] for i in idx)

    def benchmark(self, i, T):
        """Tiered benchmark psf for sale i as if 'now' were month T (uses months T-24..T-1 only)."""
        bi, ft, lo12, lo24, hi = self.b[i], self.ft[i], T - 12, T - 24, T - 1
        lease, town = self.lease[bi], self.blocks[bi]["t"]
        w = self.win(self.bf, (bi, ft), lo12, hi)
        if len(w) >= 3:
            return self.med(w), 1
        w = self.win(self.bf, (bi, ft), lo24, hi)
        if len(w) >= 3:
            return self.med(w), 2
        n12, n24 = [], []
        for nb in self.near(bi):
            for j in self.win(self.bf, (nb, ft), lo24, hi):
                if abs(self.ly[j] - lease) <= LEASE_TOL:
                    n24.append(j)
                    if self.m[j] >= lo12:
                        n12.append(j)
        if len(n12) >= 5:
            return self.med(n12), 3
        if len(n24) >= 5:
            return self.med(n24), 4
        tw = self.win(self.tf, (town, ft), lo12, hi)
        tl = [j for j in tw if abs(self.ly[j] - lease) <= LEASE_TOL]
        if len(tl) >= 5:
            return self.med(tl), 5
        return (self.med(tw), 6) if tw else (None, None)

    def baseline(self, i, T):
        tw = self.win(self.tf, (self.blocks[self.b[i]]["t"], self.ft[i]), T - 12, T - 1)
        return self.med(tw) if tw else None


def metrics(rows, band=None):
    """rows: dicts with actual, pred (None = no benchmark), lo/hi interval ratios."""
    cov = [r for r in rows if r["pred"]]
    if not cov:
        return None
    ape = [abs(r["pred"] - r["actual"]) / r["actual"] for r in cov]
    se = [(r["pred"] - r["actual"]) / r["actual"] for r in cov]
    hit = [r["pred"] * r["lo"] <= r["actual"] <= r["pred"] * r["hi"] for r in cov if r.get("lo")]
    return {
        "n": len(rows), "cov": len(cov) / len(rows), "mdape": statistics.median(ape),
        "bias": statistics.fmean(se), "mdse": statistics.median(se),
        "w5": sum(e <= 0.05 for e in ape) / len(ape), "w10": sum(e <= 0.10 for e in ape) / len(ape),
        "pi": sum(hit) / len(hit) if hit else None,
    }


def fmt_row(label, mt, extra=()):
    if not mt:
        return f"| {label} | 0 | - | - | - | - | - | - | - |" + "".join(f" {e} |" for e in extra)
    f = lambda x: "-" if x is None else f"{x * 100:.1f} %"
    sg = lambda x: f"{x * 100:+.1f} %"
    return (f"| {label} | {mt['n']:,} | {f(mt['cov'])} | {f(mt['mdape'])} | {sg(mt['bias'])} | {sg(mt['mdse'])} | "
            f"{f(mt['w5'])} | {f(mt['w10'])} | {f(mt['pi'])} |" + "".join(f" {e} |" for e in extra))


HDR = "| n | coverage | MdAPE | mean signed err | median signed err | within ±5 % | within ±10 % | in 80 % interval |"


def main():
    t0 = time.time()
    d = load()
    md = Model(d)
    months = d["months"]
    gen = d.get("generated_at", "")[:7]
    last_complete = len(months) - 2 if months[-1] == gen else len(months) - 1
    folds = []
    for k in range(N_FOLDS):
        te_hi = last_complete - k * TEST_MONTHS
        te_lo = te_hi - TEST_MONTHS + 1
        folds.append({"k": k + 1, "test": (te_lo, te_hi), "calib": (te_lo - CALIB_MONTHS, te_lo - 1)})
    # predictions from HIST_START so the lag table can cover rising and flat markets
    first = min(min(f["calib"][0] for f in folds), months.index(HIST_START))
    by_month = defaultdict(list)
    for i, m in enumerate(md.m):
        if first <= m <= last_complete:
            by_month[m].append(i)
    preds = {}  # month -> list of rows
    for T in range(first, last_complete + 1):
        rows = []
        for i in by_month[T]:
            psf, tier = md.benchmark(i, T)
            bpsf = md.baseline(i, T)
            sq = md.a[i] * SQFT
            rows.append({"i": i, "actual": md.p[i], "pred": psf * sq if psf else None, "tier": tier,
                         "bpred": bpsf * sq if bpsf else None, "storey": d["storeys"][md.s[i]]})
        preds[T] = rows

    # empirical interval per fold: P10/P90 of actual/pred over the calibration months
    model_rows, base_rows, fold_out, band_info = [], [], [], {}
    for f in folds:
        cal = [r for T in range(f["calib"][0], f["calib"][1] + 1) for r in preds[T]]
        allr = [r["actual"] / r["pred"] for r in cal if r["pred"]]
        bands = {"all": (pct(10, allr), pct(90, allr), len(allr))}
        for t in TIER_LABEL:
            rr = [r["actual"] / r["pred"] for r in cal if r["tier"] == t]
            bands[t] = (pct(10, rr), pct(90, rr), len(rr)) if len(rr) >= MIN_CALIB else bands["all"][:2] + (len(rr),)
        br = [r["actual"] / r["bpred"] for r in cal if r["bpred"]]
        bb = (pct(10, br), pct(90, br))
        band_info[f["k"]] = (bands, bb)
        test = [r for T in range(f["test"][0], f["test"][1] + 1) for r in preds[T]]
        mr = [dict(r, fold=f["k"], lo=bands[r["tier"]][0] if r["pred"] else None, hi=bands[r["tier"]][1] if r["pred"] else None) for r in test]
        brw = [{"actual": r["actual"], "pred": r["bpred"], "lo": bb[0], "hi": bb[1], "tier": r["tier"], "fold": f["k"]} for r in test]
        model_rows += mr; base_rows += brw
        fold_out.append((f, metrics(mr), metrics(brw)))

    # market change: 4-room median $psf over a window vs the same window a year earlier (mix-stable)
    ft4 = d["flat_types"].index("4 ROOM")
    def yoy(lo, hi):
        a = [md.psf[i] for i in range(len(md.p)) if md.ft[i] == ft4 and lo <= md.m[i] <= hi]
        b = [md.psf[i] for i in range(len(md.p)) if md.ft[i] == ft4 and lo - 12 <= md.m[i] <= hi - 12]
        return statistics.median(a) / statistics.median(b) - 1
    drift = {f["k"]: yoy(*f["test"]) for f in folds}
    # half-yearly lag table: model vs baseline signed error across rising and flat markets
    halves = []
    m0 = months.index(HIST_START)
    for T in range(m0, last_complete + 1):
        key = months[T][:4] + ("H1" if months[T][5:7] <= "06" else "H2")
        if not halves or halves[-1][0] != key:
            halves.append([key, T, T])
        halves[-1][2] = T
    # storey effect: bias by storey band (pooled model rows)
    def sband(s):
        lo = int(s[:2]); return "01-03" if lo <= 1 else "04-06" if lo <= 4 else "07-12" if lo <= 10 else "13-21" if lo <= 19 else "22+"

    L = []
    p = L.append
    p("# Fair-value benchmark backtest")
    p("")
    p(f"Run {datetime.date.today().isoformat()} by `python tools/backtest_fair_value.py` (stdlib only, "
      f"{time.time() - t0:.0f} s to predictions). Data: `app/data/data.js`, {len(md.p):,} resale sales "
      f"{months[0]} to {months[-1]} (generated {d.get('generated_at', '?')}; {months[-1]} is "
      f"{'partial and excluded' if last_complete < len(months) - 1 else 'treated as complete'}).")
    p("")
    p("## Method")
    p("")
    p("- **Model** = Python replica of `benchmark(c, b)` in `app/modules/explore/legacy.js`: median $psf of the "
      "first tier with enough sales of the same flat type — (1) same block 12 m, >=3 sales; (2) same block 24 m, "
      ">=3; (3) blocks within 400 m with lease start ±5 y, 12 m, >=5; (4) same, 24 m; (5) town with lease ±5 y, "
      "12 m, >=5; (6) town overall 12 m. Predicted price = benchmark $psf × the sale's own floor area (sqft). "
      "Confidence in the app: tiers 1-2 strong, 3-4 moderate, 5-6 weak.")
    p("- **No look-ahead (rolling origin)**: a sale registered in month T is valued with sales from months "
      "T-24..T-1 only, i.e. as if the app's `lastMonthIdx` were T-1. Same-month sales are never used.")
    for f in folds:
        p(f"- **Fold {f['k']}**: test {months[f['test'][0]]}..{months[f['test'][1]]}; 80 % interval calibrated on "
          f"{months[f['calib'][0]]}..{months[f['calib'][1]]} (P10/P90 of actual÷predicted per tier, computed the same "
          f"no-look-ahead way; tiers with <{MIN_CALIB} residuals use all tiers).")
    p("- **Baseline**: town + flat type median $psf over the previous 12 months (no minimum n).")
    p("- **Simplifications**: block lease = modal lease start of the block's sales over the whole file (a static "
      "attribute, not a price leak); sqm is the rounded integer stored in data.js (as the app uses); $psf is "
      "float64 not float32. Signed error = (pred − actual)/actual, so negative = benchmark below the price paid.")
    p("- **Caveats**: `month` is HDB's registration month (price agreed ~1-3 months earlier). In the live app the "
      "newest data is already weeks old and a listing registers months later, so the real lag is ~3+ months "
      "longer than tested here. Intervals were calibrated in a near-flat market and would sit too high in a hot one.")
    p("")
    p("## Results — overall")
    p("")
    p("| set " + HDR)
    p("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    for f, mm, bm in fold_out:
        p(fmt_row(f"Fold {f['k']} model", mm)); p(fmt_row(f"Fold {f['k']} baseline", bm))
    pm, pb = metrics(model_rows), metrics(base_rows)
    p(fmt_row("**Both folds, model**", pm)); p(fmt_row("**Both folds, baseline**", pb))
    p("")
    p("## Results — model by tier (both folds pooled)")
    p("")
    p("| tier (confidence) " + HDR + " share of sales | baseline MdAPE, same sales | P10–P90 band (fold 1) |")
    p("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    bands1 = band_info[1][0]
    for t in TIER_LABEL:
        rr = [r for r in model_rows if r["tier"] == t]
        if not rr:
            continue
        bm = metrics([r for r in base_rows if r["tier"] == t])
        lo, hi, nn = bands1[t]
        p(fmt_row(f"{t} {TIER_LABEL[t]} ({CONF[t]})", metrics(rr),
                  (f"{len(rr) / len(model_rows) * 100:.1f} %", f"{bm['mdape'] * 100:.1f} %" if bm else "-",
                   f"{lo:.2f}–{hi:.2f}" + ("" if nn >= MIN_CALIB else " (pooled)"))))
    nob = sum(1 for r in model_rows if not r["pred"])
    p("")
    p(f"Sales with no benchmark at all: {nob} (coverage counts them as misses). Baseline interval band "
      f"(fold 1): {band_info[1][1][0]:.2f}–{band_info[1][1][1]:.2f}.")
    p("")
    p("## Storey effect (model, both folds)")
    p("")
    p("| storey band " + HDR)
    p("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    sb = defaultdict(list)
    for r in model_rows:
        sb[sband(r["storey"])].append(r)
    for k in ["01-03", "04-06", "07-12", "13-21", "22+"]:
        if sb[k]:
            p(fmt_row(k, metrics(sb[k])))
    p("")
    # interpretation
    strong = metrics([r for r in model_rows if r["tier"] in (1, 2)])
    lowb, highb = metrics(sb["01-03"]), metrics(sb["13-21"] + sb["22+"])
    word = lambda x: "below" if x < 0 else "above"
    p("## Lag across market regimes (model, half-years, same no-look-ahead method)")
    p("")
    p("| period | n | model MdAPE | model median signed err | baseline median signed err | 4-room $psf YoY |")
    p("|---|---:|---:|---:|---:|---:|")
    hrows = []
    for key, lo, hi in halves:
        rr = [r for T in range(lo, hi + 1) for r in preds[T]]
        mm = metrics(rr)
        bm = metrics([{"actual": r["actual"], "pred": r["bpred"]} for r in rr])
        y = yoy(lo, hi)
        lab = key if hi - lo == 5 else f"{months[lo]}..{months[hi]}"
        hrows.append((lab, mm, y))
        p(f"| {lab} | {mm['n']:,} | {mm['mdape'] * 100:.1f} % | {mm['mdse'] * 100:+.1f} % | {bm['mdse'] * 100:+.1f} % | {y * 100:+.1f} % |")
    p("")
    hot = [h for h in hrows if h[2] >= 0.05]
    cool = [h for h in hrows if h[2] < 0.03]
    worst = min(hrows, key=lambda h: h[1]["mdse"])
    p("## Interpretation")
    p("")
    p(f"- The benchmark lands within ±10 % of the price paid for {pm['w10'] * 100:.0f} % of test sales (MdAPE "
      f"{pm['mdape'] * 100:.1f} %) versus {pb['w10'] * 100:.0f} % (MdAPE {pb['mdape'] * 100:.1f} %) for the town × "
      f"flat-type median: block-level comparables more than halve the error, and coverage is "
      f"{pm['cov'] * 100:.0f} % because tier 6 almost always has sales.")
    if hot:
        p(f"- Lag: the trailing-window median lags rising markets. In half-years with 4-room $psf up >=5 % YoY the "
          f"median signed error averaged {statistics.fmean(h[1]['mdse'] for h in hot) * 100:+.1f} % "
          f"(worst {worst[0]}: {worst[1]['mdse'] * 100:+.1f} % at {worst[2] * 100:+.1f} % YoY)"
          + (f", vs {statistics.fmean(h[1]['mdse'] for h in cool) * 100:+.1f} % when YoY < 3 %" if cool else "")
          + f". The recent test windows were flat (4-room YoY {drift[1] * 100:+.1f} % / {drift[2] * 100:+.1f} %), "
          f"so the headline bias ({pm['mdse'] * 100:+.1f} % median) understates the lag in a hot market.")
    else:
        p(f"- Lag: no half-year since {HIST_START} had 4-room $psf up >=5 % YoY, so lag is small here "
          f"(median signed error {pm['mdse'] * 100:+.1f} %).")
    p(f"- Storey is the largest unmodelled factor: floors 01-03 are valued {abs(lowb['mdse']) * 100:.1f} % "
      f"{word(lowb['mdse'])} their price, floors 13+ {abs(highb['mdse']) * 100:.1f} % {word(highb['mdse'])}. The "
      f"app's 'premium vs benchmark' for a high-floor listing is therefore partly a storey premium, not overpaying.")
    p(f"- 'Strong' tiers (1-2, {sum(1 for r in model_rows if r['tier'] in (1, 2)) / len(model_rows) * 100:.0f} % of "
      f"sales) earn the label: MdAPE {strong['mdape'] * 100:.1f} %. The empirical 80 % interval caught "
      f"{pm['pi'] * 100:.0f} % of test prices (target 80 %); a ±5 % 'fair' band would be too tight for most "
      f"sales — {pm['w5'] * 100:.0f} % fall inside it.")
    p("")
    p("## Suggested next steps")
    p("")
    p("1. Time-adjust comparables: scale each comparable's $psf by a town × flat-type monthly index "
      "(e.g. 3-month rolling median, or a repeat-sales index) to the valuation month before taking the median; "
      "re-run this backtest and expect the signed error to move toward 0.")
    p("2. Storey adjustment: estimate a storey-band multiplier per town (or per block where n allows) from the "
      "training window and apply it to the listing's storey; the storey table is the target to flatten.")
    p("3. Show the empirical interval (per-tier P10–P90) in the app instead of a single fair value, and label "
      "the premium 'within normal range' when the asking price is inside it.")
    p("4. Add floor-area and remaining-lease adjustments for tiers 3-6 (different blocks), then re-check per-tier "
      "MdAPE; keep this script as the regression gate for any benchmark change.")
    text = "\n".join(L) + "\n"
    OUT.write_text(text, encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # Windows consoles default to cp1252
    print(text)
    print(f"wrote {OUT.relative_to(ROOT)} in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
