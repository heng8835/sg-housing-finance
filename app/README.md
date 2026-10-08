# SG Housing & Finance — web app (`app/`)

Single-page, browser-only tool (formerly "HDB Resale Comparer"): map of every resale
transaction (block level) + side-by-side comparison of flats you found on PropertyGuru /
99.co, from a family buyer's view (price vs. market, affordability, lease decay, MRT /
primary-school / hawker convenience). Roadmap: `hdb-data-pipeline/docs/specs/sg-housing-finance-intelligence.md`.
Educational tool — not financial advice.

## Open it

Double-click **`serve.cmd`** in the repo root (runs `python -m http.server 8766` in `app/`
and opens the browser), or `docker compose up` → http://localhost:8080. Opening
`index.html` directly no longer works: the app is ES modules, which browsers refuse over
`file://` (DEC-012 D2). Needs internet for map tiles (OneMap) and Leaflet (cdnjs);
everything else runs locally. Your household, shortlist and settings stay in the browser
(localStorage key `sghf:v2`, migrated once from the v1.8 key `hdb-comparer`, which still holds the map's
shortlist and settings; see "Privacy guarantee" below) — use **Copy table** to paste into Sheets/Excel.

## Refresh the data (after each weekly pipeline run)

The generators live in `../tools/` and write into `app/data/`:

```bash
python tools/build_data.py        # -> app/data/data.js        (resale transactions + MRT, ~8 MB, ~2 s)
python tools/fetch_poi.py         # -> app/data/poi.js         (schools, hawkers, childcare, eldercare, funeral, parks, bus stops, eateries; ~5 min first time, cached)
python tools/fetch_bus_routes.py  # -> app/data/bus_routes.js  (OSM bus services as stop sequences; ~2 min, cached 30 days)
python tools/fetch_future_rail.py # -> app/data/future_rail.js (URA MP2025 station positions + curated LTA line plans; seconds)
python tools/fetch_hdb_blocks.py  # -> tools/hdb_blocks.json (all HDB blocks incl. no-resale-yet; ~10 min first time)
python tools/build_data.py        # run again after fetch_hdb_blocks.py so data.js picks up the extra blocks
python tools/fetch_bto.py         # -> app/data/bto.js (BTO projects; private build only, not in the public repo)
python tools/fetch_market.py      # -> app/data/market.js      (RPI, MP2025 land use per block, town unit mix, curated catalysts; ~30 s first time incl. a 190 MB download cached in tools/cache/, ~10 s cached)
```

Use the anaconda interpreter (`%LOCALAPPDATA%\anaconda3\python.exe`). `build_data.py` reads
`hdb-data-pipeline/data/processed/resalebto_transactions.csv`, `mrt_map.csv`,
`mrt_station_centroid.csv`. After rebuilding, hard-reload the page (Ctrl+F5).

## Offline copy (PWA) — rebuild the service-worker manifest before every deploy

The app is installable and, after one online visit, opens without a connection (map tiles still need
one). `sw.js` keeps a copy of the app files; which files, and the version that tells browsers a new
copy exists, come from a generated list:

```bash
python tools/build_sw_manifest.py          # -> app/sw-manifest.json + stamps VERSION / DATA_VERSION in app/sw.js
python tools/build_sw_manifest.py --check  # exit 1 if stale (use before deploy / in CI)
```

**Run it after any change under `app/`** (code, styles, i18n, content, policy, icons or data) and
before every deploy — otherwise returning visitors keep the previous data until they reset, and a
new or renamed file is missing from the offline copy. `npm test` skips the freshness test (it only
warns) unless `SW_MANIFEST_STRICT=1`.

| What | Strategy |
|---|---|
| HTML, JS, CSS, JSON (policy, i18n, content), icons | network-first, revalidated (`no-cache`); the saved copy is used only offline — a deploy is never stuck behind the cache |
| `data/*.js` | cache-first per data version; a new version downloads in the background, then "A new version of the app is ready — Reload" appears. On localhost / 127.0.0.1 data is network-first too, so rebuilt data shows on a normal reload |
| Leaflet (cdnjs) | network-first, saved for offline |
| OneMap tiles | never handled or saved; offline the map says "Map tiles need a connection" |

Only static files are saved — never your household, shortlist or searches (those stay in
localStorage). Learn → "Offline copy" shows the size and a **Reset offline copy** button. Add
`?nosw=1` to the address to run one visit without the service worker (it also unregisters it).
Icons: `python tools/build_icons.py` (only when the design changes).

## Feature switches — private vs public build (DEC-015)

`app/config.js` holds the build-time switches; this private repo ships them all **on**:

```js
export const BUILD_FEATURES = { btoData: true, floodData: true };
```

`btoData` covers everything that needs the BTO projects dataset (`data/bto.js`, a third-party scrape that is
not licensed for publication): the map layer row + legend swatch + popups + search hits, the compare row
"Upcoming BTO supply within 1 km", the BTO part of the future-value supply driver, and the project list in
Plan → "BTO or resale?". Code and data stay in this repo ("hide, don't drop").

`floodData` covers PUB's flood-prone points (`data/flood.js`, hand-transcribed from PUB's list into
`tools/curated_flood_prone.json`; PUB's website terms allow personal viewing only): the map layer + legend row,
the block-popup line, the "No flood-prone point" priority chip and the PUB part of the family sources line.
Off → those hide and the compare row "Flood-prone point within 300 m" reads "Not in this version — see PUB's
list of flood-prone areas (pub.gov.sg)" (plain text: PUB's terms need written permission for links).

**Public build:** set `btoData: false` and `floodData: false` in `app/config.js` (the public export,
`tools/public_export.py`, writes it), leave `data/bto.js` and `data/flood.js` out, then run `python tools/build_sw_manifest.py` — with the switch off it leaves
`data/bto.js` out of the offline copy. The app then does not load `data/bto.js`; the compare table loses only
that one row (characterisation: `tests/fixtures/compare-phase7a-nobto.txt`); the supply driver counts the MOP
wave only and says "BTO supply not included in this version"; Plan → "BTO or resale?" works from a typed BTO
price and key-collection month, comparing with resale prices and rents around the flat picked on the map;
guide steps aimed at that card fall back to their `fallback` + `if_missing` note.

**Try it here without a rebuild:** add `?features=-btoData` to the address (comma list, e.g.
`?features=-btoData,-floodData`). A URL can only switch a feature off, never on.

## Privacy guarantee — your finances never leave the browser

What you type about your household (incomes, CPF balances, cash, debts, grants, ages, names, nicknames,
listing links, daily places) is kept **only** in this browser's localStorage (`sghf:v2`, `hdb-comparer`,
`sghf:sample` while a sample is on) and, when you ask, in a file saved on your device (Export = a local Blob;
CSV / brief / .ics = local downloads or print). It is never put in a URL, a request, a log or analytics
(there are none). The only things the page sends anywhere:

| To | What | Personal data? |
|---|---|---|
| this site | the app files, policy, dictionaries, guides, `data/*.js` (fixed paths) | no |
| `cdnjs.cloudflare.com` | Leaflet 1.9.4 JS + CSS (pinned by SRI) | no |
| `www.onemap.gov.sg` | map tiles + logo (images only) | nothing — the *Daily places* search runs on the app's own data (`core/placesearch.js`) |

The **share link** (`#shortlist=…`) holds only the flats — block + street, flat type, storey range, floor
area, **asking price**, facing — in the URL fragment, which browsers never send to a server; no nicknames,
listing URLs, income, CPF or cash. Saved map views hold map settings only. The service worker stores static
files only and never handles OneMap.

How this is enforced (`npm test`, also a named CI step):
- `tests/privacy/privacy.test.js` — fills a household with marker values (income 987654, CPF 876543, cash
  765432, names "ZZPRIVATE") and drives every URL / request builder for real: store + scenarios + export /
  import / forget, share link, Daily places search (no request), saved views, Start here, sample households, the same-origin
  loaders and the service worker (in `node:vm`), with `fetch`, `XMLHttpRequest`, `sendBeacon`, `Image`,
  `WebSocket`, `EventSource`, `console`, `location` and `history` all spied — no marker may appear (also
  looked for inside URL-encoded and base64url payloads). A negative control proves the spies catch a leak.
- `tests/privacy/egress.test.js` — every `fetch` / XHR / worker / navigation / clipboard / `console` call site
  in `app/` must be on a reviewed allow-list (a new one fails until reviewed), only the three hosts above may
  appear, no `console.log`, error messages name rule ids / files only.
- `tests/privacy/headers.test.js` — the CSP / referrer / SRI below.

**Security headers (in `index.html`, since GitHub Pages cannot set headers):** a `Content-Security-Policy`
meta (scripts: this site + cdnjs + the import map by its sha256 — **edit the import map → update the hash**,
the test prints the new one; requests (`connect-src`): this site only; images: OneMap tiles + logo, cdnjs, also `data:` / `blob:`; `object-src 'none'`,
`base-uri 'self'`, `form-action 'self'`; styles need `'unsafe-inline'` for the `style=""` attributes),
`referrer` = `strict-origin`, and `integrity="sha384-…" crossorigin="anonymous"` on both Leaflet tags (a new
Leaflet version needs new hashes from the exact cdnjs files).

## Deploy (GitHub Pages) and the public export

**Pages artifact** — only runtime files are published (no README / CLAUDE.md / Dockerfile / policy fragments /
`.md` sources):

```bash
python tools/stage_site.py --out _site --public   # copies the allow-list, btoData + floodData off, no bto.js / flood.js,
                                                   # rebuilds sw-manifest.json for _site, size budget check
```

`.github/workflows/pages.yml` runs exactly this (after a green `tests` run on `main`, and only while the repo
is public). CI also runs `python tools/build_sw_manifest.py --check` and the privacy tests.

**Public repository (DEC-015)** — the public repo is a fresh one with one squashed commit, built from an
allow-listed export of this private repo (no git is run; the owner does `git init` in the target):

```bash
copy tools\public_denylist.example.txt tools\public_denylist.txt   # once; fill in your own values (gitignored)
python tools/public_export.py --out ..\sg-housing-finance-public    # add --clean to replace an earlier export
```

It copies app runtime + source, tools (minus the BTO scraper / generator), tests, the pipeline code and an
outward-facing docs set; leaves out env files, secrets, caches, internal docs (STATE, AUDIT / DECISION logs,
specs), `CLAUDE.md` files, `data/bto.js`, `data/flood.js` and `tools/curated_flood_prone.json`; switches `btoData` and
`floodData` off; rebuilds the offline manifest; then scans
the whole output (text and binary, file names too) for denylisted strings, the BTO source name and
secret-looking tokens and **fails on any hit**. It prints the manifest of included files with sizes.

## Files

| Path | Role |
|---|---|
| `index.html`, `main.js` | page shell + entry module (loading overlay → policy + data → Explore view) |
| `config.js` | build-time feature switches (`BUILD_FEATURES`, see above); read through `core/features.js` |
| `manifest.webmanifest`, `icons/`, `sw.js`, `sw-routes.js`, `sw-manifest.json` | installable app + offline copy (see above); `sw-manifest.json` is generated |
| `core/` | `data-loader.js` (injects the generated data scripts), `data.js` (read-only data accessor for modules), `policy.js` (policy lookup by id + date), `store.js`, `bus.js`, `dom.js`, `i18n.js` (EN / 中文) |
| `engine/` | pure calculations (mortgage, stamp duty, lease, affordability, grants, budget, plan, rent, eligibility, landlord, rent vs buy, CPF, sell-then-buy, seniors, monthly cost, commute); no DOM, no clock, policy passed in; tested by `npm test` |
| `modules/` | `explore/legacy.js` (the v1.8 map + compare view, being split up), `household`, `afford`, `rent`, `learn`, `shell` (Simple/Pro, language, phone sheet) |
| `i18n/` | Chinese dictionaries, English text as the key: `zh.json` (new modules), `zh-explore.json` (map, compare, index.html), `zh-engine.json` (engine messages). In the browser, switch to 中文, open every view, then `window.__i18nMissing()` lists anything untranslated |
| `content/` | Learn glossary (`glossary/*.md`, `glossary/zh/*.md` → `content.json`, `content.zh.json` via `tools/build_content.py`) |
| `policy/sg-policy.json` | **every** Singapore rule value (LTV, MSR, floor rates, BSD bands, lease rules…) with source URL, effective date, status |
| `styles/base.css`, `modules.css` | styles (desktop: the side panel floats over a full-width map) |
| `data/` | **generated** — `data.js`, `poi.js`, `bus_routes.js`, `future_rail.js`, `bto.js` (only with `btoData` on), `rents.js` (loaded); `commute.js`, `family.js`, `flood.js` (only with `floodData` on), `market.js` (optional — features hide with a note when missing); regenerate with `tools/`, never edit |
| `../tools/build_data.py` | processed CSV → `data.js` (`window.HDB_DATA`, columnar, dictionary-encoded); also MRT/LRT lines with station order and official colours |
| `../tools/fetch_poi.py` | data.gov.sg: MOE schools (geocoded via OneMap), NEA hawker centres, ECDA childcare + kindergartens, MOH eldercare centres, NEA funeral parlours / columbaria / crematoria / cemeteries, NParks park polygons, LTA bus stops; OpenStreetMap cafés & eateries, shopping malls, supermarkets → `poi.js` |
| `../tools/fetch_bus_routes.py` | OpenStreetMap bus route relations → `bus_routes.js`; powers bus-stop popups and the "direct bus to <workplace>" check |
| `../tools/fetch_future_rail.py` | URA Master Plan 2025 station footprints + curated `FUTURE_LINES` → `future_rail.js` |
| `../tools/fetch_hdb_blocks.py` | HDB Property Information (every residential block) → `hdb_blocks.json` (merged by build_data.py: hollow markers = completed, no resale yet) |
| `../tools/fetch_bto.py` | BTO projects from the pipeline's scrape → `bto.js` (private build only; the script, its input and `bto.js` are not in the public export) |
| `../tools/fetch_market.py` | data.gov.sg HDB Resale Price Index (quarterly), URA Master Plan 2025 Land Use (zones within 800 m of each block — zoning only, not "undeveloped"), HDB Property Information unit mix per town; `curated_catalysts.json` → `market.js` (future-value scorecard) |
| `../tools/curated_catalysts.json` | hand-kept major projects (Punggol Digital District, Jurong Lake District, Paya Lebar Air Base, …): approximate position, reach, year, source link per entry |
| `../tools/curated_sites.json` | hand-kept list of former burial grounds (approximate centre + radius, source link) — edit freely |

## Assumptions baked into the numbers

Rule values (LTV, rates, MSR / TDSR caps, tenures, stamp-duty bands, CPF lease rules…) come only
from `policy/sg-policy.json`, each with its source, effective date and status; the ids are given
below instead of the numbers, so this file never goes stale. Open Learn → glossary in the app, or
the policy file, for the current values.

- **Remaining lease** = lease term (`lease.term.years`) − (today − lease commencement year) of
  the block (January assumed; unknown start year → "unknown").
- **Recent-sales benchmark** = median $psf of the same block + flat type, last 12 months
  (≥ 3 sales); otherwise the town. *Fair value* = benchmark × sqft. HDB valuations are not
  published, so "possible COV" is a scenario (valuation = benchmark), not an estimate.
- **Loan**: HDB loan at `loan.hdb.ltv` and `rate.hdb.concessionary`, tenure up to
  `tenure.hdb.max`; bank loan at `loan.bank.ltv` up to `loan.bank.hdb_flat.full_ltv_max_tenure`,
  `loan.bank.ltv.lower_tier` beyond (illustrative rate `assumption.rate.bank`, labelled as an
  assumption). The MSR cap (`ratio.msr.cap`) is **tested at the floor rate** (`rate.floor.hdb`,
  `rate.floor.bank`) — so "max price your income supports" is lower than at the contract rate;
  TDSR (`ratio.tdsr.cap`) uses the debts you enter. BSD on the IRAS residential bands
  (`stamp.bsd.bands`), rounded down to the dollar. Legal fees are an estimate
  (`assumption.fees.legal`); renovation is not included.
- **Lease coverage**: remaining lease must reach the youngest owner's `cpf.lease.cover_to_age`
  for full CPF use (otherwise CPF and the HDB loan LTV are pro-rated); below `cpf.lease.min_years`
  no CPF at all. "In 10 y only buyers aged N+ get full CPF" shows how the resale buyer pool shrinks.
- **Distances** are straight-line (walking ≈ +25%, road/MRT ≈ 1.3–1.5×).
- **Environment & feng shui** rows: sun/heat from the "main windows face" you enter (W/SW =
  afternoon sun; N/S = least direct sun); floor position vs the highest storey ever sold in
  the block; outlook = nearest HDB block within 120 m in the facing direction (no condos/
  landed); "faces park" = park edge within 300 m in that direction; former burial grounds
  come from `curated_sites.json` and are approximate.
- **Area prices box** (top-left of the map) recalculates for the blocks in view once zoomed
  in (≥ 14), or for a circle you draw (click centre, click again for radius) — always using
  the current flat-type and period filters.
- **Workplaces & daily places** (Family profile, any number) apply to every flat
  automatically: searched in the app's own data only (blocks, streets, towns incl. 中文, MRT/LRT, schools, malls,
  polyclinics, hawker centres, parks — `core/placesearch.js`; OneMap's search API needs a per-owner token, so it is
  not used); not in our data → "pick on the map", which needs no network either.
