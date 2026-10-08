from pathlib import Path

import pytest

from hdb_pipeline.config import Settings
from hdb_pipeline.http import RETRY_TOTAL, make_session, sleep_politely


def settings(proxy=None, timeout=30):
    return Settings(proxy_url=proxy, data_dir=Path("data"), timeout_s=timeout)


def test_session_proxy_configured():
    s = make_session(settings(proxy="http://proxy.test:3128"))
    assert s.proxies == {
        "http": "http://proxy.test:3128",
        "https": "http://proxy.test:3128",
    }


def test_session_no_proxy_when_none():
    s = make_session(settings(proxy=None))
    assert s.proxies == {}


def test_session_headers():
    s = make_session(settings())
    assert "hdb-data-pipeline" in s.headers["User-Agent"]
    assert s.headers["Accept-Language"] == "en-SG,en;q=0.9"


def test_session_retry_mounted_for_both_schemes():
    s = make_session(settings())
    for scheme in ["http://", "https://"]:
        retries = s.get_adapter(scheme).max_retries
        assert retries.total == RETRY_TOTAL
        assert 429 in retries.status_forcelist


def test_get_applies_timeout_and_raises_on_error(monkeypatch):
    from hdb_pipeline import http as http_mod

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            captured["raised_checked"] = True

    class FakeSession:
        def get(self, url, **kwargs):
            captured["url"] = url
            captured["timeout"] = kwargs.get("timeout")
            return FakeResponse()

    resp = http_mod.get(FakeSession(), "https://example.test/x", settings(timeout=7))
    assert isinstance(resp, FakeResponse)
    assert captured["timeout"] == 7
    assert captured["raised_checked"]


def test_sleep_politely(monkeypatch):
    calls = []
    monkeypatch.setattr("time.sleep", lambda s: calls.append(s))
    sleep_politely(0.5)
    sleep_politely(0)
    sleep_politely(-1)
    assert calls == [0.5]
