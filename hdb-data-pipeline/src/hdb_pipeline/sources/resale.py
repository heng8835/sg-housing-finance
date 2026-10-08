"""HDB resale transactions from data.gov.sg.

Paginated datastore_search fetch (10k rows/page, ~235k rows total).
Migrated from legacy/notebooks/HDB Resale Data Scraper.ipynb cell 1.
"""

import pandas as pd
import requests

from hdb_pipeline import http
from hdb_pipeline.config import DATASTORE_SEARCH_URL, RESALE_DATASET_ID, Settings


def fetch_resale_transactions(
    session: requests.Session,
    settings: Settings,
    resource_id: str = RESALE_DATASET_ID,
    page_size: int = 10000,
    log=print,
) -> pd.DataFrame:
    """Fetch the full resale transactions dataset, page by page.

    Returns a DataFrame with lower-cased column names, in API row order.
    """
    offset = 0
    all_records: list[dict] = []

    while True:
        response = http.get(
            session,
            DATASTORE_SEARCH_URL,
            settings,
            params={"resource_id": resource_id, "limit": page_size, "offset": offset},
        )
        result = response.json()["result"]
        records = result["records"]
        total = result["total"]

        all_records.extend(records)
        offset += len(records)
        log(f"fetched {offset}/{total}")

        # stop when everything is fetched, or on an empty page (safety against loops)
        if offset >= total or not records:
            break

    df = pd.DataFrame(all_records)
    df.columns = [c.lower() for c in df.columns]
    return df
