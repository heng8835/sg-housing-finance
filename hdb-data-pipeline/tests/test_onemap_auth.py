"""OneMap token on the pipeline's requests session (onemap_auth.OneMapAuth via http.make_session). No network:
the token POST is faked and OneMap / data.gov.sg answers come from a fake transport adapter."""

import json
from pathlib import Path

import requests
from requests.adapters import BaseAdapter

from hdb_pipeline import onemap_auth
from hdb_pipeline.config import Settings
from hdb_pipeline.http import make_session
from hdb_pipeline.onemap_auth import OneMapAuth, TokenSource

SEARCH = "https://www.onemap.gov.sg/api/common/elastic/search"
ENV = {"ONEMAP_EMAIL": "owner@example.test", "ONEMAP_PASSWORD": "pw-not-real"}


def settings():
    return Settings(proxy_url=None, data_dir=Path("data"), timeout_s=30)


class FakePost:
    def __init__(self, tokens):
        self.tokens = list(tokens)
        self.calls = 0

    def __call__(self, url, payload, proxy, timeout):
        self.calls += 1
        return 200, json.dumps({"access_token": self.tokens.pop(0), "expiry_timestamp": "9999999999"}).encode()


class FakeAdapter(BaseAdapter):
    """Answers every request; OneMap answers 401 to tokens listed in `reject`."""

    def __init__(self, reject=()):
        super().__init__()
        self.reject = set(reject)
        self.seen = []

    def send(self, request, **kwargs):
        self.seen.append((request.url, request.headers.get("Authorization")))
        r = requests.Response()
        r.status_code = 401 if request.headers.get("Authorization") in self.reject else 200
        r._content = b'{"results": []}'
        r.url = request.url
        r.request = request
        r.connection = self
        return r

    def close(self):
        pass


def session_with(source, adapter):
    s = requests.Session()
    s.auth = OneMapAuth(source)
    s.mount("https://", adapter)
    return s


def test_make_session_attaches_onemap_auth():
    s = make_session(settings())
    assert isinstance(s.auth, OneMapAuth)
    assert s.auth.source is onemap_auth.shared()


def test_no_credentials_requests_unchanged():
    adapter = FakeAdapter()
    post = FakePost(["t1"])
    s = session_with(TokenSource(env={}, post=post), adapter)
    s.get(SEARCH, params={"searchVal": "1"})
    assert adapter.seen[0][1] is None
    assert post.calls == 0


def test_token_only_on_onemap_requests():
    adapter = FakeAdapter()
    post = FakePost(["tok-1"])
    s = session_with(TokenSource(env=ENV, post=post), adapter)
    s.get(SEARCH, params={"searchVal": "1"})
    s.get("https://data.gov.sg/api/action/datastore_search")
    s.get(SEARCH, params={"searchVal": "2"})
    assert [h for _, h in adapter.seen] == ["tok-1", None, "tok-1"]
    assert post.calls == 1  # one login for the whole run


def test_401_logs_in_again_and_resends_once():
    adapter = FakeAdapter(reject={"old"})
    post = FakePost(["old", "new"])
    s = session_with(TokenSource(env=ENV, post=post), adapter)
    r = s.get(SEARCH, params={"searchVal": "1"})
    assert r.status_code == 200
    assert [h for _, h in adapter.seen] == ["old", "new"]
    assert len(r.history) == 1 and r.history[0].status_code == 401
    # a token that keeps failing is not retried forever
    adapter2 = FakeAdapter(reject={"a", "b"})
    s2 = session_with(TokenSource(env=ENV, post=FakePost(["a", "b"])), adapter2)
    assert s2.get(SEARCH).status_code == 401
    assert len(adapter2.seen) == 2
