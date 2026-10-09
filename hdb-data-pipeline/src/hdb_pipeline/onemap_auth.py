"""OneMap API token: log in with ONEMAP_EMAIL / ONEMAP_PASSWORD, keep the token in memory, refresh it on expiry or 401.

OneMap's search API (/api/common/elastic/search) takes an ``Authorization: <access_token>`` header. A token comes from
POST /api/auth/post/getToken with {"email", "password"} and lasts 3 days (``expiry_timestamp``, epoch seconds).

- Credentials come from the environment only (a CI secret, or the gitignored .env loaded by config.get_settings).
- No credentials -> no header: requests go out anonymously exactly as before (tests, runs without an account).
- The e-mail, the password and the token are never printed, logged or put in an exception message.
- A failed login is reported once on stderr with the marker ``ONEMAP LOGIN FAILED`` (tools/refresh_all.py flags it)
  and the request goes out without the header, so a wrong password degrades to anonymous calls instead of a crash.

Used by:
  hdb_pipeline.http.make_session   every pipeline session (the geocoder) gets OneMapAuth as session.auth
  tools/onemap_token.py            the tools' requests sessions (attach) and their urllib fallback (headers_for)

Standard library only at import time; OneMapAuth (the requests integration) needs requests.
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

TOKEN_URL = "https://www.onemap.gov.sg/api/auth/post/getToken"
ONEMAP_DOMAIN = "onemap.gov.sg"
EMAIL_ENV = "ONEMAP_EMAIL"
PASSWORD_ENV = "ONEMAP_PASSWORD"
DEFAULT_LIFETIME_S = 3 * 24 * 3600  # OneMap tokens last 3 days
REFRESH_MARGIN_S = 15 * 60  # renew a little early so a long run never sends an expired token
LOGIN_FAILED = "ONEMAP LOGIN FAILED"


class TokenError(RuntimeError):
    """The token request failed. The message never contains credentials or the token."""


def is_onemap(url: str) -> bool:
    """True for OneMap API URLs that take the token (not the token endpoint itself)."""
    parts = urlsplit(str(url))
    host = (parts.hostname or "").lower()
    on_onemap = host == ONEMAP_DOMAIN or host.endswith("." + ONEMAP_DOMAIN)
    return on_onemap and not parts.path.startswith("/api/auth/")


def credentials(env=None):
    """(email, password) from the environment, or None when either is missing / blank."""
    env = os.environ if env is None else env
    email = (env.get(EMAIL_ENV) or "").strip()
    password = env.get(PASSWORD_ENV) or ""
    return (email, password) if email and password else None


def urllib_post(url: str, payload: dict, proxy, timeout: float):
    """POST JSON -> (status, body bytes). Error bodies are dropped (they could echo the request)."""
    handlers = [urllib.request.ProxyHandler({"http": proxy, "https": proxy})] if proxy else []
    opener = urllib.request.build_opener(*handlers)
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json",
                 "User-Agent": "hdb-data-pipeline/0.1 (onemap token)"},
        method="POST",
    )
    try:
        with opener.open(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, b""
    except (urllib.error.URLError, OSError) as e:
        return 0, type(e).__name__.encode()


class TokenSource:
    """One in-memory token per process (see shared()); thread-safe; refreshed before expiry or on demand."""

    def __init__(self, env=None, post=None, proxy=None, clock=time.time, timeout: float = 30, stderr=None):
        self._env = env
        self._post = post or urllib_post
        self.proxy = proxy
        self._clock = clock
        self.timeout = timeout
        self._stderr = stderr
        self._token = None
        self._expiry = 0.0
        self._lock = threading.Lock()
        self._warned = False
        self.fetches = 0  # logins made (tests, logs)

    def __repr__(self) -> str:  # never shows the token or the credentials
        return f"<TokenSource configured={self.configured} cached={self._token is not None}>"

    @property
    def configured(self) -> bool:
        return credentials(self._env) is not None

    def invalidate(self) -> None:
        with self._lock:
            self._token, self._expiry = None, 0.0

    def token(self, force: bool = False):
        """The access token, logging in when there is none, it is about to expire, or force=True.
        None when no credentials are set. Raises TokenError when the login fails."""
        creds = credentials(self._env)
        if creds is None:
            return None
        with self._lock:
            now = self._clock()
            if not force and self._token and now < self._expiry - REFRESH_MARGIN_S:
                return self._token
            status, body = self._post(TOKEN_URL, {"email": creds[0], "password": creds[1]}, self.proxy, self.timeout)
            if status != 200:
                raise TokenError(f"OneMap token request failed (HTTP {status or 'no response'}) - "
                                 f"check {EMAIL_ENV} / {PASSWORD_ENV}")
            try:
                data = json.loads(body.decode("utf-8") if isinstance(body, bytes) else body)
            except ValueError:
                raise TokenError("OneMap token response was not JSON") from None
            tok = data.get("access_token") if isinstance(data, dict) else None
            if not tok:
                raise TokenError("OneMap token response had no access_token")
            try:
                expiry = float(data.get("expiry_timestamp"))
            except (TypeError, ValueError):
                expiry = 0.0
            if expiry <= now:
                expiry = now + DEFAULT_LIFETIME_S
            self._token, self._expiry = str(tok), expiry
            self.fetches += 1
            return self._token

    def headers(self, url=None, force: bool = False) -> dict:
        """{"Authorization": token} for a OneMap URL (or url=None) when credentials are set, else {}.
        A failed login is reported once (marker LOGIN_FAILED) and gives {} - the call then goes out anonymously."""
        if url is not None and not is_onemap(url):
            return {}
        try:
            tok = self.token(force=force)
        except TokenError as e:
            if not self._warned:
                self._warned = True
                print(f"{LOGIN_FAILED}: {e}; calling OneMap without a token", file=self._stderr or sys.stderr)
            return {}
        return {"Authorization": tok} if tok else {}


_SHARED = None
_SHARED_LOCK = threading.Lock()


def shared(proxy=None) -> TokenSource:
    """The process-wide TokenSource (one login per run, shared by every session). proxy: used for the login."""
    global _SHARED
    with _SHARED_LOCK:
        if _SHARED is None:
            _SHARED = TokenSource(proxy=proxy)
        elif proxy and not _SHARED.proxy:
            _SHARED.proxy = proxy
        return _SHARED


try:  # requests integration (the pipeline and most tools use requests sessions)
    from requests.auth import AuthBase as _AuthBase
except ImportError:  # pragma: no cover - stdlib-only callers use TokenSource.headers()
    _AuthBase = object


class OneMapAuth(_AuthBase):
    """``session.auth = OneMapAuth(source)``: adds the token to OneMap requests only (other hosts untouched); on a
    401 it logs in again once and resends the request. Without credentials it does nothing."""

    def __init__(self, source: TokenSource | None = None):
        self.source = source or shared()

    def __call__(self, r):
        if not self.source.configured or not is_onemap(r.url):
            return r
        h = self.source.headers()
        if h:
            r.headers.update(h)
            r.register_hook("response", self._retry_on_401)
        return r

    def _retry_on_401(self, resp, **kwargs):
        if resp.status_code != 401 or getattr(resp.request, "_onemap_retried", False):
            return resp
        self.source.invalidate()
        h = self.source.headers(force=True)
        if not h:
            return resp
        resp.content  # noqa: B018 - drain so the connection can be reused
        resp.close()
        prep = resp.request.copy()
        prep.headers.update(h)
        prep._onemap_retried = True
        new = resp.connection.send(prep, **kwargs)
        new.history.append(resp)
        new.request = prep
        return new
