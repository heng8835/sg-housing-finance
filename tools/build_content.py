"""Glossary + guides markdown -> app/content/content.json and app/content/guides.json (+ .zh.json translations).

GLOSSARY  app/content/glossary/<id>.md
  Front-matter block (id, term, short, formula, policy_keys, related, level, source) and a short markdown body.
  Numbers that are rules are written as {policy:<id>} placeholders and filled in by the browser from
  app/policy/sg-policy.json, so the content never goes stale on its own. Body markdown supported: paragraphs,
  **bold**, `example` spans, and "- " bullet lists. Translations: glossary/<lang>/<id>.md -> content.<lang>.json.

GUIDES  app/content/guides/<id>.md  (+ guides/zh/<id>.md, REQUIRED for every guide)  -> guides.json / guides.zh.json
  Read by app/modules/guides (Learn sheet -> Guides). Authoring format (see also app/content/guides/README.md):

    ---
    id: buying-resale                 # = file name (kebab-case)
    title: Buying your first resale flat
    summary: One sentence for the card in the Guides list.
    use_case: firstResale             # a tour id from app/modules/guide/steps.js (offers that tour at the end), or empty
    order: 1                          # position in the Guides list
    est_minutes: 6                    # "~6 min" on the card
    ---
    Optional intro paragraph (shown above step 1).

    ## Step title
    target: #afPrice                  # optional: CSS selector of the real control -> "Show me" button
    fallback: [#affordVerdict, #tabbtn-afford]   # optional: tried in order when the target is missing / hidden
    tab: afford                       # optional: explore | afford | rent | plan | choices (opened first)
    if_missing: Switch to Pro to see this.       # optional: note when the target itself is missing
    Body markdown (paragraphs, **bold**, `example`, "- " lists). Live numbers for the current household:
    {live:afford.instalment}. Rule values: {policy:ratio.msr.cap}.

    ## Quiz
    ### Question text?
    - [ ] wrong option
    - [x] the one correct option
    - [ ] wrong option
    explain: Why the answer is right (shown after answering; {policy:id} allowed).
    term: msr                         # optional glossary id -> "Learn more" button

  Rules (the build fails loudly on any of them):
  - 5-8 steps; 3-5 quiz questions, each 2-5 options with exactly one [x] and an explain: line.
  - Step keys are lowercase lines at the very start of a step; an unknown lowercase "key:" there is an error.
  - {live:key} must be one of LIVE_KEYS below (= app/modules/guides/live.js LIVE; a test keeps them equal).
  - {policy:id} must exist in app/policy/sg-policy.json (or policy/fragments/) or start with "proposed.".
  - No digits in titles, bodies, options or explanations outside {placeholders} and `example` spans —
    rule values come from the policy file, never typed.
  - Selectors: one selector per entry (no commas), balanced [] () quotes, ids / classes well formed.
  - zh files: same id; title + summary + step titles / bodies + quiz text translated; the structure (number of
    steps, target / fallback / tab when given, live + policy placeholders, number of questions, options per
    question, the correct option, term) must match the English guide. Structural keys may be left out in zh.
  - Every guide ends with the standard "educational, not advice" disclaimer — added by the viewer, not the file.

Run:  python tools/build_content.py
"""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GLOSSARY = ROOT / "app" / "content" / "glossary"
OUT = ROOT / "app" / "content" / "content.json"
GUIDES = ROOT / "app" / "content" / "guides"
GUIDES_OUT = ROOT / "app" / "content" / "guides.json"
POLICY = ROOT / "app" / "policy" / "sg-policy.json"
FRAGMENTS = ROOT / "app" / "policy" / "fragments"
TOUR_STEPS = ROOT / "app" / "modules" / "guide" / "steps.js"
LANGS = ["zh"]
FIELDS = ("id", "term", "short", "formula", "policy_keys", "related", "level", "source")

GUIDE_FIELDS = ("id", "title", "summary", "use_case", "order", "est_minutes")
STEP_KEYS = ("target", "fallback", "tab", "if_missing")
STRUCT_KEYS = ("target", "fallback", "tab")
TABS = ("explore", "afford", "rent", "plan", "choices")
# Live values a guide may show (resolved in the browser from the store + engines). Keep equal to
# app/modules/guides/live.js LIVE — tests/guides/content.test.js compares the two lists.
LIVE_KEYS = (
    "household.buyers", "household.income", "household.youngest_age", "household.cash", "household.cpf_oa",
    "household.funds", "household.loan_type",
    "afford.flat", "afford.price", "afford.loan", "afford.downpayment", "afford.bsd", "afford.grants",
    "afford.upfront", "afford.cash_needed", "afford.instalment", "afford.msr", "afford.max_price", "afford.tenure",
)
STEPS_MIN, STEPS_MAX = 5, 8
QUIZ_MIN, QUIZ_MAX = 3, 5
OPTIONS_MIN, OPTIONS_MAX = 2, 5
PLACEHOLDER = re.compile(r"\{([a-z]+):([A-Za-z0-9_.-]+)\}")


def parse_front(text, name):
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", text, re.S)
    if not m:
        raise ValueError(f"{name}: missing front-matter")
    meta = {}
    for line in m.group(1).splitlines():
        if not line.strip():
            continue
        key, _, val = line.partition(":")
        val = val.strip()
        if val.startswith("[") and val.endswith("]"):
            meta[key.strip()] = [v.strip() for v in val[1:-1].split(",") if v.strip()]
        else:
            meta[key.strip()] = val[1:-1] if len(val) >= 2 and val[0] == val[-1] == '"' else val
    return meta, m.group(2).strip()


def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    return re.sub(r"`(.+?)`", r'<span class="eg">\1</span>', s)


def body_html(md):
    out = []
    for block in re.split(r"\n\s*\n", md):
        lines = [l for l in block.splitlines() if l.strip()]
        if lines and all(l.lstrip().startswith("- ") for l in lines):
            out.append("<ul>" + "".join(f"<li>{inline(l.lstrip()[2:])}</li>" for l in lines) + "</ul>")
        elif lines:
            out.append(f"<p>{inline(' '.join(l.strip() for l in lines))}</p>")
    return "".join(out)


def build(src=GLOSSARY, out=OUT):
    terms = {}
    for f in sorted(src.glob("*.md")):
        meta, body = parse_front(f.read_text(encoding="utf-8"), f.name)
        missing = [k for k in FIELDS if k not in meta]
        if missing:
            raise ValueError(f"{f.name}: missing {missing}")
        if meta["id"] != f.stem:
            raise ValueError(f"{f.name}: id {meta['id']} != filename")
        terms[meta["id"]] = {**{k: meta[k] for k in FIELDS if k != "id"}, "short": inline(meta["short"]), "body": body_html(body)}
    for tid, t in terms.items():
        bad = [r for r in t["related"] if r not in terms]
        if bad:
            raise ValueError(f"{tid}: related ids not found: {bad}")
    out.write_text(json.dumps({"terms": terms}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(terms)} terms -> {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB)")
    return terms


# ---------------------------------------------------------------- guides
def policy_ids():
    docs = [json.loads(POLICY.read_text(encoding="utf-8"))]
    if FRAGMENTS.is_dir():
        docs += [json.loads(f.read_text(encoding="utf-8")) for f in sorted(FRAGMENTS.glob("*.json"))]
    return {p["id"] for d in docs for p in d.get("params", [])}


def tour_ids():
    return set(re.findall(r"^\s{4}id: '([A-Za-z]+)'", TOUR_STEPS.read_text(encoding="utf-8"), re.M))


def check_selector(sel, where):
    s = sel.strip()
    if not s:
        raise ValueError(f"{where}: empty selector")
    if "," in s:
        raise ValueError(f"{where}: one selector per entry, no commas: {s!r}")
    if not re.fullmatch(r"""[A-Za-z0-9_\-#.\[\]="':()\s>+~*^$|]+""", s):
        raise ValueError(f"{where}: unexpected characters in selector {s!r}")
    if not re.match(r"[#.\[A-Za-z*:]", s) or re.search(r"[>+~]\s*$", s):
        raise ValueError(f"{where}: selector must start with a tag / # / . / [ and not end with a combinator: {s!r}")
    depth = {"(": 0, "[": 0}
    quote = None
    for ch in s:
        if quote:
            quote = None if ch == quote else quote
        elif ch in "\"'":
            quote = ch
        elif ch in "([":
            depth[ch] += 1
        elif ch in ")]":
            depth["(" if ch == ")" else "["] -= 1
            if min(depth.values()) < 0:
                raise ValueError(f"{where}: unbalanced brackets in {s!r}")
    if quote or any(depth.values()):
        raise ValueError(f"{where}: unbalanced brackets or quotes in {s!r}")
    bare = re.sub(r"\[[^\]]*\]", "[]", re.sub(r"\"[^\"]*\"|'[^']*'", '""', s))
    if re.search(r"[#.](?![A-Za-z_-])", bare):
        raise ValueError(f"{where}: '#' / '.' must be followed by a name in {s!r}")
    return s


def check_text(text, where, pids, allow_live=True):
    """Placeholders are known; no digits outside placeholders and `example` spans. Returns (policy, live) ids."""
    pol, live = [], []
    for kind, key in PLACEHOLDER.findall(text):
        if kind == "policy":
            if key not in pids and not key.startswith("proposed."):
                raise ValueError(f"{where}: unknown policy id {key}")
            pol.append(key)
        elif kind == "live" and allow_live:
            if key not in LIVE_KEYS:
                raise ValueError(f"{where}: unknown live key {key} (allowed: {', '.join(LIVE_KEYS)})")
            live.append(key)
        else:
            raise ValueError(f"{where}: placeholder {{{kind}:{key}}} not allowed here")
    plain = re.sub(r"`[^`]*`", "", PLACEHOLDER.sub("", text))
    if re.search(r"\{[a-z]+:", plain):
        raise ValueError(f"{where}: malformed placeholder")
    if re.search(r"\d", plain):
        raise ValueError(f"{where}: digits outside {{policy:...}} / `example` - use a placeholder: {plain.strip()[:80]!r}")
    return pol, live


def uniq(xs):
    return list(dict.fromkeys(xs))


def parse_step(title, lines, where, pids):
    keys, i = {}, 0
    while i < len(lines):
        m = re.match(r"^([a-z_]+):\s*(.*)$", lines[i])
        if not m:
            break
        if m.group(1) not in STEP_KEYS:
            raise ValueError(f"{where}: unknown step key {m.group(1)!r} (allowed: {', '.join(STEP_KEYS)})")
        keys[m.group(1)] = m.group(2).strip()
        i += 1
    body = "\n".join(lines[i:]).strip()
    if not title.strip() or not body:
        raise ValueError(f"{where}: a step needs a title and a body")
    step = {"title": inline(title.strip())}
    if "target" in keys:
        step["target"] = check_selector(keys["target"], f"{where} target")
    if "fallback" in keys:
        raw = keys["fallback"]
        if not (raw.startswith("[") and raw.endswith("]")):
            raise ValueError(f"{where}: fallback must be a list [a, b]")
        step["fallback"] = [check_selector(x, f"{where} fallback") for x in raw[1:-1].split(",") if x.strip()]
        if not step["fallback"]:
            raise ValueError(f"{where}: empty fallback list")
    if "tab" in keys:
        if keys["tab"] not in TABS:
            raise ValueError(f"{where}: tab {keys['tab']!r} not one of {TABS}")
        step["tab"] = keys["tab"]
    if "if_missing" in keys:
        check_text(keys["if_missing"], f"{where} if_missing", pids, allow_live=False)
        step["if_missing"] = inline(keys["if_missing"])
    check_text(title, f"{where} title", pids, allow_live=False)
    pol, live = check_text(body, where, pids)
    step.update(body=body_html(body), policy=uniq(pol), live=uniq(live))
    return step


def parse_quiz(lines, where, pids, terms):
    blocks, cur = [], None
    for line in lines:
        if line.startswith("### "):
            cur = {"q": line[4:].strip(), "lines": []}
            blocks.append(cur)
        elif line.strip():
            if cur is None:
                raise ValueError(f"{where}: text before the first '### question'")
            cur["lines"].append(line.strip())
    if not QUIZ_MIN <= len(blocks) <= QUIZ_MAX:
        raise ValueError(f"{where}: {len(blocks)} questions (need {QUIZ_MIN}-{QUIZ_MAX})")
    quiz = []
    for n, b in enumerate(blocks, 1):
        w = f"{where} question {n}"
        options, answer, explain, term = [], [], None, None
        for line in b["lines"]:
            m = re.match(r"^- \[( |x)\] (.+)$", line)
            if m:
                if m.group(1) == "x":
                    answer.append(len(options))
                check_text(m.group(2), w, pids, allow_live=False)
                options.append(inline(m.group(2).strip()))
            elif line.startswith("explain:"):
                explain = line[len("explain:"):].strip()
            elif line.startswith("term:"):
                term = line[len("term:"):].strip()
            else:
                raise ValueError(f"{w}: unexpected line {line!r}")
        if not OPTIONS_MIN <= len(options) <= OPTIONS_MAX:
            raise ValueError(f"{w}: {len(options)} options (need {OPTIONS_MIN}-{OPTIONS_MAX})")
        if len(answer) != 1:
            raise ValueError(f"{w}: mark exactly one option [x]")
        if not explain:
            raise ValueError(f"{w}: missing explain:")
        if term and term not in terms:
            raise ValueError(f"{w}: glossary term {term!r} not found")
        check_text(b["q"], w, pids, allow_live=False)
        check_text(explain, w, pids, allow_live=False)
        item = {"q": inline(b["q"]), "options": options, "answer": answer[0], "explain": inline(explain)}
        if term:
            item["term"] = term
        quiz.append(item)
    return quiz


def parse_guide(path, pids, terms, tours):
    name = path.name
    meta, body = parse_front(path.read_text(encoding="utf-8"), name)
    missing = [k for k in ("id", "title", "summary") if not meta.get(k)]
    if missing:
        raise ValueError(f"{name}: missing {missing}")
    if meta["id"] != path.stem:
        raise ValueError(f"{name}: id {meta['id']} != filename")
    unknown = [k for k in meta if k not in GUIDE_FIELDS]
    if unknown:
        raise ValueError(f"{name}: unknown front-matter keys {unknown}")
    for k in ("title", "summary"):
        check_text(meta[k], f"{name} {k}", pids, allow_live=False)
    sections = re.split(r"^## ", "\n" + body, flags=re.M)
    intro, steps, quiz = sections[0].strip(), [], None
    for n, sec in enumerate(sections[1:], 1):
        head, _, rest = sec.partition("\n")
        lines = rest.strip("\n").splitlines()
        if head.strip() == "Quiz":
            if quiz is not None:
                raise ValueError(f"{name}: more than one '## Quiz'")
            quiz = parse_quiz(lines, f"{name} quiz", pids, terms)
        elif quiz is not None:
            raise ValueError(f"{name}: '## Quiz' must be the last section")
        else:
            steps.append(parse_step(head, lines, f"{name} step {n}", pids))
    if not STEPS_MIN <= len(steps) <= STEPS_MAX:
        raise ValueError(f"{name}: {len(steps)} steps (need {STEPS_MIN}-{STEPS_MAX})")
    if quiz is None:
        raise ValueError(f"{name}: missing '## Quiz' section")
    g = {"id": meta["id"], "title": inline(meta["title"]), "summary": inline(meta["summary"]), "steps": steps, "quiz": quiz}
    if intro:
        check_text(intro, f"{name} intro", pids)
        g["intro"] = body_html(intro)
    g["_meta"] = meta
    return g


def merge_translation(en, tr, name):
    """zh guide: translated text on top of the English structure; fail on any structural difference."""
    if len(tr["steps"]) != len(en["steps"]):
        raise ValueError(f"{name}: {len(tr['steps'])} steps, English has {len(en['steps'])}")
    for k in ("use_case", "order", "est_minutes"):
        if k in tr["_meta"] and tr["_meta"][k] != en["_meta"].get(k):
            raise ValueError(f"{name}: {k} differs from English")
    steps = []
    for n, (a, b) in enumerate(zip(en["steps"], tr["steps"]), 1):
        for k in STRUCT_KEYS:
            if k in b and b[k] != a.get(k):
                raise ValueError(f"{name} step {n}: {k} differs from English ({b[k]!r} vs {a.get(k)!r})")
        for k in ("policy", "live"):
            if sorted(a[k]) != sorted(b[k]):
                raise ValueError(f"{name} step {n}: {{{k}:...}} placeholders differ from English ({b[k]} vs {a[k]})")
        if ("if_missing" in a) != ("if_missing" in b):
            raise ValueError(f"{name} step {n}: if_missing present in one language only")
        steps.append({**a, "title": b["title"], "body": b["body"], **({"if_missing": b["if_missing"]} if "if_missing" in b else {})})
    if len(tr["quiz"]) != len(en["quiz"]):
        raise ValueError(f"{name}: {len(tr['quiz'])} questions, English has {len(en['quiz'])}")
    quiz = []
    for n, (a, b) in enumerate(zip(en["quiz"], tr["quiz"]), 1):
        if len(a["options"]) != len(b["options"]) or a["answer"] != b["answer"] or a.get("term") != b.get("term"):
            raise ValueError(f"{name} question {n}: options / correct answer / term differ from English")
        quiz.append({**a, "q": b["q"], "options": b["options"], "explain": b["explain"]})
    out = {**en, "title": tr["title"], "summary": tr["summary"], "steps": steps, "quiz": quiz}
    if "intro" in en or "intro" in tr:
        if ("intro" in en) != ("intro" in tr):
            raise ValueError(f"{name}: intro present in one language only")
        out["intro"] = tr["intro"]
    return out


def finish(g):
    meta = g.pop("_meta")
    use_case = meta.get("use_case", "")
    order = int(meta.get("order") or 99)
    minutes = int(meta.get("est_minutes") or 0)
    if not 1 <= minutes <= 30:
        raise ValueError(f"{g['id']}: est_minutes must be 1-30")
    return {"id": g["id"], "title": g["title"], "summary": g["summary"], "use_case": use_case, "order": order,
            "est_minutes": minutes, **({"intro": g["intro"]} if "intro" in g else {}), "steps": g["steps"], "quiz": g["quiz"]}


def build_guides(terms, src=GUIDES, out=GUIDES_OUT):
    files = sorted(src.glob("*.md"))
    files = [f for f in files if f.name.lower() != "readme.md"]
    if not files:
        print("0 guides")
        return
    pids, tours = policy_ids(), tour_ids()
    en = {}
    for f in files:
        g = parse_guide(f, pids, terms, tours)
        uc = g["_meta"].get("use_case", "")
        if uc and uc not in tours:
            raise ValueError(f"{f.name}: use_case {uc!r} is not a tour id ({', '.join(sorted(tours))})")
        en[g["id"]] = g
    for lang in LANGS:
        extra = sorted(p.stem for p in (src / lang).glob("*.md") if p.stem not in en) if (src / lang).is_dir() else []
        if extra:
            raise ValueError(f"guides/{lang}: no English guide for {extra}")
        tr = {}
        for gid, g in en.items():
            path = src / lang / f"{gid}.md"
            if not path.exists():
                raise ValueError(f"guides/{lang}/{gid}.md is missing (every guide needs a {lang} translation)")
            tr[gid] = finish(merge_translation(g, parse_guide(path, pids, terms, tours), f"{lang}/{gid}.md"))
        write_guides(tr, out.with_name(f"guides.{lang}.json"))
    write_guides({gid: finish(g) for gid, g in en.items()}, out)


def write_guides(guides, out):
    ordered = dict(sorted(guides.items(), key=lambda kv: (kv[1]["order"], kv[0])))
    out.write_text(json.dumps({"guides": ordered}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(guides)} guides -> {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB)")


def selftest():
    """python tools/build_content.py --selftest : the guide checks reject bad input (nothing is written)."""
    import tempfile
    pids, terms, tours = policy_ids(), {"msr": {}}, tour_ids()
    good_step = "## Step\ntarget: #afPrice\ntab: afford\nBody {live:afford.price} and {policy:ratio.msr.cap}.\n\n"
    quiz = "## Quiz\n" + "".join(f"### Q{'?' * (i + 1)}\n- [ ] a\n- [x] b\nexplain: why\nterm: msr\n" for i in range(3))
    front = "---\nid: t\ntitle: T\nsummary: S\nuse_case: firstResale\norder: 1\nest_minutes: 5\n---\n"
    cases = {
        "ok": front + good_step * 5 + quiz,
        "unknown live key": front + good_step.replace("afford.price", "afford.nope") + good_step * 4 + quiz,
        "unknown policy id": front + good_step.replace("ratio.msr.cap", "ratio.nope") + good_step * 4 + quiz,
        "bad selector": front + good_step.replace("#afPrice", "#af[Price") + good_step * 4 + quiz,
        "comma selector": front + good_step.replace("#afPrice", "#a, #b") + good_step * 4 + quiz,
        "unknown step key": front + good_step.replace("tab:", "tabs:") + good_step * 4 + quiz,
        "bad tab": front + good_step.replace("tab: afford", "tab: map") + good_step * 4 + quiz,
        "digits": front + good_step.replace("Body", "Body 30%") + good_step * 4 + quiz,
        "too few steps": front + good_step * 4 + quiz,
        "two answers": front + good_step * 5 + quiz.replace("- [ ] a", "- [x] a", 1),
        "no explain": front + good_step * 5 + quiz.replace("explain: why\n", "", 1),
        "unknown term": front + good_step * 5 + quiz.replace("term: msr", "term: nope", 1),
        "no quiz": front + good_step * 5,
    }
    with tempfile.TemporaryDirectory() as d:
        for name, text in cases.items():
            p = Path(d) / "t.md"
            p.write_text(text, encoding="utf-8")
            try:
                parse_guide(p, pids, terms, tours)
                ok = True
            except ValueError:
                ok = False
            assert ok == (name == "ok"), f"selftest: {name} -> {'accepted' if ok else 'rejected'}"
        (Path(d) / "t.md").write_text(cases["ok"], encoding="utf-8")
        en = parse_guide(Path(d) / "t.md", pids, terms, tours)
        (Path(d) / "t.md").write_text(cases["ok"].replace("{live:afford.price}", ""), encoding="utf-8")
        try:
            merge_translation(en, parse_guide(Path(d) / "t.md", pids, terms, tours), "zh/t.md")
            raise AssertionError("selftest: zh with different live keys accepted")
        except ValueError:
            pass
        src = Path(d) / "g"
        src.mkdir()
        (src / "t.md").write_text(cases["ok"], encoding="utf-8")
        try:
            build_guides({"msr": {}}, src, Path(d) / "guides.json")
            raise AssertionError("selftest: missing zh accepted")
        except ValueError:
            pass
    print(f"selftest: {len(cases) + 2} guide checks ok")


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv:
        selftest()
        sys.exit(0)
    terms = build()
    for lang in LANGS:
        if (GLOSSARY / lang).is_dir():
            build(GLOSSARY / lang, OUT.with_name(f"content.{lang}.json"))
    build_guides(terms)
