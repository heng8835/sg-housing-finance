# Guides — authoring format

Guides are short, step-by-step explainers shown in **Learn → Guides** (`app/modules/guides`). Each step can point at
the real control in the app ("Show me in the app"), show live numbers for the user's own household, and every rule
value comes from `app/policy/sg-policy.json`. Each guide ends with a 3–5 question self-check quiz.

Build after every edit (the tests fail if the JSON is older than the markdown):

```
python tools/build_content.py            # → app/content/guides.json + guides.zh.json (and the glossary)
python tools/build_content.py --selftest # the schema checks reject bad input
npm test                                 # tests/guides/*.test.js
```

## Files

- `app/content/guides/<id>.md` — English. `<id>` is kebab-case and equals the `id:` field.
- `app/content/guides/zh/<id>.md` — 中文, **required** for every guide (the build fails without it). Use 您.

## Front-matter

```
---
id: buying-resale
title: Buying your first resale flat
summary: One sentence for the card in the Guides list.
use_case: firstResale     # optional: a tour id from app/modules/guide/steps.js (firstResale, sellBuy, renting,
                          # retire, shortlist, map) → "Take the tour →" after the quiz; leave empty for none
order: 1                  # position in the Guides list
est_minutes: 7            # shown as "~7 min"
---
```

In the zh file only `id`, `title` and `summary` are needed; `use_case` / `order` / `est_minutes` may be left out
(they come from English) but must match if given.

## Body

Optional intro paragraph, then **5–8 steps**, each starting with `## Step title`, then the quiz as the last section.

```
## Test a price in Afford
tab: afford                                  # optional: explore | afford | rent | plan | choices (opened first)
target: #afPrice                             # optional: CSS selector of the real control → "Show me in the app"
fallback: [#affordFlat, #tabbtn-afford]      # optional: tried in order when the target is missing or hidden
if_missing: Switch to Pro to see this part.  # optional: note when the target itself is not on screen
Body text. Paragraphs, **bold**, `example` spans and "- " bullet lists.
Live numbers: {live:afford.instalment}. Rule values: {policy:ratio.msr.cap}.
```

- Step keys are lowercase lines at the very top of the step; an unknown lowercase `key:` there is a build error.
- Selectors: one per entry (no commas), same targets as the tour (`app/modules/guide/steps.js`). The test checks that
  the ids / classes exist in the app; a step whose controls may be absent needs `if_missing`.
- The zh step may leave out `target` / `fallback` / `tab` (inherited); if given they must equal English.

### Live values — `{live:key}`

Resolved in the browser from the store + the same engine call as the Afford tab. Missing input → "—" plus a box
"Numbers shown as — need income … [Add in Household →] [Pick a flat or enter a price in Afford →]".

| key | shows | needs |
|---|---|---|
| `household.buyers` | number of buyers | — |
| `household.income` | combined gross monthly income | income |
| `household.youngest_age` | youngest buyer's age | age |
| `household.cash` | cash savings | cash |
| `household.cpf_oa` | combined CPF OA | CPF OA |
| `household.funds` | cash + CPF OA | cash, CPF OA |
| `household.loan_type` | "HDB loan" / "bank loan" (Household setting) | — |
| `afford.flat` | the flat Afford is testing (label) | a flat price |
| `afford.price` | its price | a flat price |
| `afford.loan` | loan amount | a flat price |
| `afford.downpayment` | downpayment (price − loan) | a flat price |
| `afford.bsd` | Buyer's Stamp Duty | a flat price |
| `afford.grants` | grants total | a flat price, income |
| `afford.upfront` | upfront after grants | a flat price |
| `afford.cash_needed` | part of the upfront that must be cash | a flat price, CPF OA |
| `afford.instalment` | monthly instalment | a flat price |
| `afford.msr` | MSR at the test (floor) rate | a flat price, income |
| `afford.max_price` | most you can pay | a flat price, income |
| `afford.tenure` | loan tenure in years | a flat price |

New keys: add them to `LIVE` in `app/modules/guides/live.js` **and** `LIVE_KEYS` in `tools/build_content.py`
(a test compares the two lists).

### Rule values — `{policy:id}`

Any id in `app/policy/sg-policy.json` (or `policy/fragments/`). Shown bold with its status and effective date; the
step's "Sources" line links the official pages. **Never type a number**: the build rejects digits in titles, bodies,
options and explanations outside `{placeholders}` and `` `example` `` spans. Table-valued rules (grant bands, BSD
bands) show "(see the rules table)" — describe them in words.

## Quiz

```
## Quiz
### Question text?
- [ ] wrong option
- [x] the one correct option
- [ ] wrong option
explain: Why — shown right after answering ({policy:id} allowed, no {live:…}).
term: msr          # optional glossary id (app/content/glossary) → "Learn more →"
```

3–5 questions, 2–5 options each, exactly one `[x]`, an `explain:` line. Keep `## Quiz` as the heading in zh too. The
zh quiz must have the same number of options, the same correct option and the same `term`.

## Tone

Educational, not advice: explain rules and trade-offs, never "buy this". The viewer adds the standard disclaimer to
every step and the quiz — do not repeat it in the file.
