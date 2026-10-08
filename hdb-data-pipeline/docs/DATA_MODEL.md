# Data Model

Schemas of the Tableau-facing datasets in `data/processed/` (the "contract" — see DEC-003).

## resalebto_transactions.csv (~223k rows)

Grain: one HDB resale transaction.

| Column | Notes |
|---|---|
| _id | source row id from data.gov.sg (unique key) |
| month | transaction month, `YYYY-MM` |
| town, flat_type, block, street_name, storey_range, flat_model | as provided by HDB |
| floor_area_sqm | int (truncated from source) |
| floor_area_sqft | sqm x 10.76391041671, 2 dp (BR-03) |
| lease_commence_date, remaining_lease | as provided |
| resale_price | SGD |
| address_for_geocode | `"<block> <street> SINGAPORE"` (BR-04) |
| latitude, longitude | OneMap geocode; may be null |
| zone | Central/East/North/North-East/West/Unknown (BR-01) |
| town_lat, town_lon | town centroid (BR-02) |

## hdb_address.csv (data/cache/, ~13k rows)

Grain: one unique block+street. Columns: block, street_name, address_for_geocode,
latitude, longitude. Append-only geocode cache — do not regenerate casually.

## mrt_map.csv

Grain: one station exit. Columns: station_name, exit_code, lat, lon, object_id, updated_at.

## mrt_station_centroid.csv

Grain: one station x line code. Columns: station_name, centroid_lat, centroid_lon
(mean of exits), line, station_code, seq_in_line, line_id (BR-10).

## BTO projects (private build only)

From a BTO source — not in the public build; file names are not listed here.

Grain: one BTO project. Columns: project_name, project_url (key), status, town,
classification (Standard/Plus/Prime), bounded_by, overall_price_min/max,
no_of_blocks, highest_floor, tenure, developer, launch_date, expected_top,
total_units, type (BR-09), project_name_raw, error (populated on scrape failure).

## BTO unit prices (private build only)

Grain: one unit type within a project. Columns: unit_type, floor_area, units,
price_range_raw, price_min, price_max, psf_min, psf_max (BR-06),
project_url (FK), project_name.

## BTO project details (private build only)

Earlier variant of the projects extract kept for reference. TODO confirm superseded,
then archive.

## data/external/ (reference, not pipeline-generated)

- `TrainStation_Aug2025/RapidTransitSystemStation.shp` — LTA station polygons (Tableau map layer)
- `MasterPlan2019PlanningAreaBoundaryNoSea (1).geojson` — URA planning areas
- `train station master.xls` — station reference list
