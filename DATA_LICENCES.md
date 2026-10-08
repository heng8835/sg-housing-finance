# Data sources and licences

Every dataset the public build ships or calls, where it comes from and under which terms. The generator that
builds each file names its sources in its docstring (`tools/*.py`); the app's data files are listed in
`app/core/data-loader.js`. The OneMap and PUB terms were read on 2026-10-08 (go-live plan §1, D3; DEC-018).

This project is not affiliated with, or endorsed by, any Singapore government agency. Agency names below say
where the data comes from, nothing more.

## data.gov.sg — Singapore Open Data Licence v1.0

Terms: <https://data.gov.sg/open-data-licence>. Attribution used by this project:

> Contains information from the datasets listed below, accessed from data.gov.sg, which is made available under
> the terms of the Singapore Open Data Licence version 1.0.

| Dataset (data.gov.sg id) | Publisher | Used in | Generator |
|---|---|---|---|
| Resale flat prices (`d_8b84c4ee58e3cfc0ece0d773c8ca6abc`) | Housing & Development Board (HDB) | `data/data.js` (transactions) | `hdb-data-pipeline` → `tools/build_data.py` |
| MRT station exits (`d_b39d3a0871985372d7e1637193335da5`) | Land Transport Authority (LTA) | `data/data.js` (stations, lines) | `hdb-data-pipeline` → `tools/build_data.py` |
| HDB Property Information (`d_17f5382f26140b1fdae0ba2ef6239d2f`) | HDB | `tools/hdb_blocks.json` → `data/data.js`; `data/market.js` (unit mix) | `tools/fetch_hdb_blocks.py`, `tools/fetch_market.py` |
| Renting out of flats from Jan 2021 (`d_c9f57187485a850908655db0e8cfe651`) | HDB | `data/rents.js` | `tools/fetch_rents.py` |
| Median rent by town and flat type (`d_23000a00c52996c55106084ed0339566`) | HDB | `data/rents.js` | `tools/fetch_rents.py` |
| HDB Resale Price Index (`d_14f63e595975691e7c24a27ae4c07c79`) | HDB | `data/market.js` | `tools/fetch_market.py` |
| Master Plan 2025 Land Use Layer (`d_a8c3546b26712e35021f3a681d0353ae`) | Urban Redevelopment Authority (URA) | `data/market.js` | `tools/fetch_market.py` |
| Master Plan 2025 Rail Station Layer (`d_2c06c9fe8ae724b5d33efa1f203e2c38`) | URA | `data/future_rail.js` | `tools/fetch_future_rail.py` |
| General information of schools (`d_688b934f82c1059ed0a6993d2a829089`) | Ministry of Education (MOE) | `data/poi.js` | `tools/fetch_poi.py` |
| Child Care Services (`d_5d668e3f544335f8028f546827b773b4`), Kindergartens (`d_7fe9a72b1afff18e48111772c8d0fd39`) | Early Childhood Development Agency (ECDA) | `data/poi.js`, `data/family.js` | `tools/fetch_poi.py`, `tools/fetch_family_health.py` |
| Listing of Centres (`d_696c994c50745b079b3684f0e90ffc53`) | ECDA | `data/family.js` (vacancies) | `tools/fetch_family_health.py` |
| Eldercare services (`d_f0fd1b3643ed8bd34bd403dedd7c1533`) | Ministry of Health (MOH) | `data/poi.js` | `tools/fetch_poi.py` |
| CHAS clinics (`d_548c33ea2d99e29ec63a7cc9edcccedc`), Cervical screening centres = polyclinics (`d_3ca2a28059588f297908b32da4ac3cbe`) | MOH | `data/family.js` | `tools/fetch_family_health.py` |
| Hawker centres (`d_4a086da0a5553be1d89383cd90d07ecd`) | National Environment Agency (NEA) | `data/poi.js` | `tools/fetch_poi.py` |
| Funeral parlours (`d_054b67adc211306beaf5c005be8f5381`), columbaria (`d_9b0752e9d3f1f9d957d5d8be2b58dfff`), crematoria (`d_7c7c57950ceda95e8efa6cec46029b5d`), cemeteries (`d_4a9b83ee745c10c3aa5829fb80e09d9c`) | NEA | `data/poi.js` | `tools/fetch_poi.py` |
| Parks and nature reserves (`d_77d7ec97be83d44f61b85454f844382f`) | National Parks Board (NParks) | `data/poi.js` | `tools/fetch_poi.py` |
| Bus stops (`d_3f172c6feb3f4f92a2f47d93eed2908a`) | LTA | `data/poi.js` | `tools/fetch_poi.py` |

## Other sources

| Source | Terms | Used in | Status |
|---|---|---|---|
| **OneMap** map tiles + logo (Singapore Land Authority) | [OneMap API Terms of Service](https://www.onemap.gov.sg/legal/apitermsofservice.html) (use allowed, commercial or not; datasets under the Singapore Open Data Licence) and the [OneMap terms of use](https://www.onemap.gov.sg/legal/termsofuse.html) (SLA logos and notices must not be removed or altered). The OneMap logo + "© Singapore Land Authority" attribution is shown on the map; no token needed for map services | loaded live in the browser (`app/modules/explore/legacy.js`) — the only request the app makes to OneMap | OK (read 2026-10-08) |
| **OneMap** search API (SLA) — build time only | same API Terms of Service: datasets obtained through the API are governed by the Singapore Open Data Licence v1.0 → redistributable with attribution: *"Contains information from OneMap accessed via its API, made available under the terms of the Singapore Open Data Licence version 1.0."* Search now needs an access token (owner's OneMap account, 3-day tokens) — kept in local / CI secrets, never in the app | geocoding of blocks, schools, childcare and polyclinics — the coordinates are in `data/*.js` and `tools/hdb_blocks.json`. **Not called from the browser** (Daily places search uses the app's own data since 2026-10-08) | OK (read 2026-10-08). The pipeline's geocode cache (`hdb_address.csv`) and `data/external` stay out of the public repo (D3) |
| **OpenStreetMap** (Overpass API) | Open Database Licence (ODbL) 1.0 — © OpenStreetMap contributors, <https://www.openstreetmap.org/copyright> | `data/poi.js` (cafés / eateries, shopping malls, supermarkets), `data/bus_routes.js` (bus services as stop sequences), road junctions used to place flood points (private build only) | OK — attribution on the map; derived files are offered under the ODbL |
| **PUB** "List of Flood Prone Areas" (PDF, Nov 2025), hand-transcribed in `tools/curated_flood_prone.json` | PUB website terms ([Terms of Use](https://www.pub.gov.sg/termsofuse)): personal, non-commercial viewing only; no reproduction or republishing without PUB's written consent. data.gov.sg's open "Flood Prone Areas" dataset has yearly hectares only, no locations | **not in this build** — `data/flood.js` is private (the app runs with the `floodData` feature off and links to PUB's own list instead) | Not shipped; will be switched on only with PUB's written permission |
| MOH announcements of new polyclinics (facts only: name, opening date) | public announcement, cited per entry | `data/family.js` | OK (facts, linked) |
| Curated future MRT lines (`FUTURE_LINES` in `tools/fetch_future_rail.py`) | facts from LTA announcements, written by hand | `data/future_rail.js` | OK (facts); approximate |
| Curated major projects (`tools/curated_catalysts.json`) | facts, source link per entry | `data/market.js` | OK; one entry cites Wikipedia — to replace with an official page (F14) |
| Curated former burial grounds (`tools/curated_sites.json`) | facts, source link per entry, approximate positions | `data/poi.js` | OK; four entries cite Wikipedia (CC BY-SA) — to replace or credit (F14) |
| Derived: commute estimates (`data/commute.js`) | this project's own model over the files above (`tools/build_commute.py`) | `data/commute.js` | OK |
| Singapore rules (`app/policy/sg-policy.json`) | each value cites its official page (`source_url`, `retrieved`) — facts, not copied text | the whole app | OK |
| **LTA DataMall** | — | **not used** (bus routes come from OpenStreetMap) | — |
| **BTO projects** | — | **not in this build** (`data/bto.js` and its generator are private; the app runs with the `btoData` feature off) | — |

## Software loaded by the page

| Library | Licence | From |
|---|---|---|
| Leaflet 1.9.4 | BSD 2-Clause | cdnjs.cloudflare.com (pinned with SRI hashes in `app/index.html`) |

The project's own code is MIT-licensed (`LICENSE`). The data files keep the terms of their sources above.
