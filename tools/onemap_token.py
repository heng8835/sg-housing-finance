"""OneMap token for the tools: every OneMap search call in tools/*.py goes through here.

The logic lives in the pipeline (hdb-data-pipeline/src/hdb_pipeline/onemap_auth.py) so the pipeline geocoder and the
tools share one implementation; this module only puts it on sys.path and adds two helpers:

    attach(session)    requests.Session -> the same session, with the token added to OneMap requests only
                       (fetch_poi.session(), so fetch_hdb_blocks.py / fetch_bto.py too; fetch_family_health.py)
    headers_for(url)   {"Authorization": token} for a OneMap URL, else {} (fetch_family_health.py's urllib fallback)

Credentials: ONEMAP_EMAIL / ONEMAP_PASSWORD from the environment (a CI secret), else from the gitignored
hdb-data-pipeline/.env (never overriding the environment). Neither set -> OneMap is called anonymously, as before.
The token is fetched once per process, kept in memory only, renewed before its 3-day expiry and after a 401.
Nothing here prints or logs the e-mail, the password or the token.
"""

import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PIPELINE_SRC = HERE.parent / "hdb-data-pipeline" / "src"
ENV_FILE = HERE.parent / "hdb-data-pipeline" / ".env"
if str(PIPELINE_SRC) not in sys.path:
    sys.path.insert(0, str(PIPELINE_SRC))

from hdb_pipeline.onemap_auth import (  # noqa: E402
    EMAIL_ENV,
    LOGIN_FAILED,
    PASSWORD_ENV,
    OneMapAuth,
    TokenError,
    TokenSource,
    credentials,
    is_onemap,
    shared,
)

__all__ = ["attach", "headers_for", "load_env_file", "OneMapAuth", "TokenSource", "TokenError", "credentials",
           "is_onemap", "shared", "LOGIN_FAILED"]


def load_env_file(path=ENV_FILE, env=None):
    """Copy ONEMAP_EMAIL / ONEMAP_PASSWORD from a .env file into env (default os.environ) when not already set."""
    env = os.environ if env is None else env
    p = Path(path)
    if not p.is_file():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.strip().partition("=")
        key, value = key.strip(), value.strip()
        if not (sep and key in (EMAIL_ENV, PASSWORD_ENV)) or env.get(key):
            continue
        if value[:1] in ("'", '"'):
            value = value[1:].split(value[0], 1)[0]  # quoted: up to the closing quote
        else:
            value = re.split(r"(?:^|\s)#", value, maxsplit=1)[0].strip()  # unquoted: drop an inline comment
        if value:
            env[key] = value


load_env_file()


def attach(session):
    """Give a requests.Session the OneMap token (OneMap hosts only). Returns the session."""
    proxies = getattr(session, "proxies", None) or {}
    session.auth = OneMapAuth(shared(proxy=proxies.get("https")))
    return session


def headers_for(url):
    """Authorization header for a OneMap URL when credentials are set, else {} (for urllib callers)."""
    return shared().headers(url)
