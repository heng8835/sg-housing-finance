"""Shared HTTP session: proxy, standard headers, retry with backoff, polite pacing.

One session is built once per pipeline run and passed to source modules —
replacing the legacy notebooks' setproxy()-before-every-call pattern (DEC-004).
Polite delays between scrape requests are a business rule (BR-08).
OneMap calls carry the account token when ONEMAP_EMAIL / ONEMAP_PASSWORD are set (onemap_auth.py);
without them they go out anonymously as before.
"""

import time

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from hdb_pipeline.config import Settings
from hdb_pipeline.onemap_auth import OneMapAuth, shared

USER_AGENT = "Mozilla/5.0 (compatible; hdb-data-pipeline/0.1)"

RETRY_TOTAL = 5
RETRY_BACKOFF_S = 0.5
RETRY_STATUSES = (429, 500, 502, 503, 504)


def make_session(settings: Settings) -> requests.Session:
    """Build a requests.Session with proxy (if configured), standard headers,
    GET retry/backoff on transient failures, and the OneMap token on OneMap
    requests (only when the credentials are set; other hosts are untouched)."""
    session = requests.Session()

    if settings.proxy_url:
        session.proxies = {
            "http": settings.proxy_url,
            "https": settings.proxy_url,
        }

    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept-Language": "en-SG,en;q=0.9",
        }
    )

    retry = Retry(
        total=RETRY_TOTAL,
        backoff_factor=RETRY_BACKOFF_S,
        status_forcelist=RETRY_STATUSES,
        allowed_methods=frozenset(["GET"]),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    session.auth = OneMapAuth(shared(proxy=settings.proxy_url))

    return session


def get(session: requests.Session, url: str, settings: Settings, **kwargs) -> requests.Response:
    """GET with the configured timeout applied; raises on HTTP error status."""
    kwargs.setdefault("timeout", settings.timeout_s)
    response = session.get(url, **kwargs)
    response.raise_for_status()
    return response


def sleep_politely(seconds: float) -> None:
    """Pause between requests to external sites (BR-08). No-op for <= 0."""
    if seconds > 0:
        time.sleep(seconds)
