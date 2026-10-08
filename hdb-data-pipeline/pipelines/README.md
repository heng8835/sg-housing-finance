# Pipeline entry points

Runnable scripts, one per flow (to be implemented during development):

- `run_resale.py` — fetch resale transactions -> geocode -> enrich -> validate -> export
- `run_mrt.py` — fetch MRT exits -> station centroids/lines -> validate -> export
- `run_bto.py` — scrape a BTO source (not in the public build) -> parse prices -> validate -> export

Each script should be a thin orchestrator over `src/hdb_pipeline/` functions so the same
functions can later be wrapped by Dagster assets without rewriting (Dagster is deliberately
deferred — see docs/DECISION_LOG.md DEC-002).
