"""Central configuration, read from environment variables with working defaults.

Replaces the setproxy()-before-every-call pattern in the legacy notebooks (DEC-004).

Environment variables (all optional):
- HDB_PIPELINE_PROXY     proxy URL for outbound HTTP. Unset -> an outbound HTTP proxy
                         default (None; set it when behind a proxy).
                         Set to an empty string -> no proxy (e.g. running at home).
- HDB_PIPELINE_DATA_DIR  base data directory. Default: <repo>/data.
- HDB_PIPELINE_TIMEOUT_S HTTP timeout in seconds. Default: 30.
- HDB_PIPELINE_GSHEETS_KEY_FILE  path to the Google service-account JSON key used
                                 for the Tableau Public auto-refresh bridge (DEC-006).
                                 Default: secrets/gsheets-service-account.json.
- HDB_PIPELINE_GSHEETS_SHEET_ID  target Google Sheet ID for the resale export.
"""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

DEFAULT_PROXY = None  # set HDB_PIPELINE_PROXY (or .env) when behind a proxy

# data.gov.sg dataset IDs
RESALE_DATASET_ID = "d_8b84c4ee58e3cfc0ece0d773c8ca6abc"
MRT_EXITS_DATASET_ID = "d_b39d3a0871985372d7e1637193335da5"

# API endpoints
DATASTORE_SEARCH_URL = "https://data.gov.sg/api/action/datastore_search"
POLL_DOWNLOAD_URL = "https://api-open.data.gov.sg/v1/public/api/datasets/{dataset_id}/poll-download"
ONEMAP_SEARCH_URL = "https://www.onemap.gov.sg/api/common/elastic/search"

# polite request pacing (BR-08)
GEOCODE_DELAY_S = 0.05
LISTING_DELAY_S = 0.6
DETAIL_DELAY_S = 0.5


DEFAULT_GSHEETS_KEY_FILE = "secrets/gsheets-service-account.json"


@dataclass(frozen=True)
class Settings:
    proxy_url: str | None
    data_dir: Path
    timeout_s: int
    gsheets_key_file: Path = Path(DEFAULT_GSHEETS_KEY_FILE)
    gsheets_sheet_id: str | None = None

    @property
    def raw_dir(self) -> Path:
        return self.data_dir / "raw"

    @property
    def interim_dir(self) -> Path:
        return self.data_dir / "interim"

    @property
    def processed_dir(self) -> Path:
        return self.data_dir / "processed"

    @property
    def cache_dir(self) -> Path:
        return self.data_dir / "cache"

    @property
    def external_dir(self) -> Path:
        return self.data_dir / "external"


def _repo_root() -> Path:
    # src/hdb_pipeline/config.py -> parents[2] == the repo root (hdb-data-pipeline/)
    return Path(__file__).resolve().parents[2]


def _default_data_dir() -> Path:
    return _repo_root() / "data"


def get_settings() -> Settings:
    """Build Settings from the environment. Read fresh on every call so tests
    (and long-lived sessions) see current env values.

    Loads <repo>/.env first (gitignored) without overriding variables already set
    in the real environment, so a local .env can hold HDB_PIPELINE_GSHEETS_SHEET_ID
    without needing it set manually every session.
    """
    load_dotenv(_repo_root() / ".env", override=False)

    raw_proxy = os.environ.get("HDB_PIPELINE_PROXY")
    if raw_proxy is None:
        proxy_url: str | None = DEFAULT_PROXY
    else:
        proxy_url = raw_proxy.strip() or None

    data_dir = Path(os.environ.get("HDB_PIPELINE_DATA_DIR") or _default_data_dir())
    timeout_s = int(os.environ.get("HDB_PIPELINE_TIMEOUT_S") or 30)

    gsheets_key_file = Path(
        os.environ.get("HDB_PIPELINE_GSHEETS_KEY_FILE")
        or (_repo_root() / DEFAULT_GSHEETS_KEY_FILE)
    )
    gsheets_sheet_id = os.environ.get("HDB_PIPELINE_GSHEETS_SHEET_ID") or None

    return Settings(
        proxy_url=proxy_url,
        data_dir=data_dir,
        timeout_s=timeout_s,
        gsheets_key_file=gsheets_key_file,
        gsheets_sheet_id=gsheets_sheet_id,
    )
