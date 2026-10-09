"""tools/onemap_token.py + hdb_pipeline/onemap_auth.py: OneMap token login, cache, refresh (no network: the POST is faked).

    python -m unittest discover -s tests/tools -p "test_*.py"     (npm test runs it via python-tools.test.js)
The requests integration (session.auth, retry on 401) is tested in hdb-data-pipeline/tests/test_onemap_auth.py.
"""
import io
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[2] / "tools"
sys.path.insert(0, str(TOOLS))
import onemap_token  # noqa: E402
from onemap_token import LOGIN_FAILED, TokenSource, is_onemap  # noqa: E402

SEARCH = "https:" + "//www.onemap.gov.sg/api/common/elastic/search"
EMAIL, PASSWORD = "owner@example.test", "pw-not-real-123"  # fake test values, never sent anywhere
ENV = {"ONEMAP_EMAIL": EMAIL, "ONEMAP_PASSWORD": PASSWORD}


class FakePost:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []

    def __call__(self, url, payload, proxy, timeout):
        self.calls.append((url, dict(payload), proxy))
        return self.replies.pop(0) if len(self.replies) > 1 else self.replies[0]


def ok(token, expiry=None):
    body = {"access_token": token}
    if expiry is not None:
        body["expiry_timestamp"] = str(expiry)
    return 200, json.dumps(body).encode()


class Clock:
    def __init__(self, t=1_000_000.0):
        self.t = t

    def __call__(self):
        return self.t


class TokenTests(unittest.TestCase):
    def test_no_credentials_no_header_no_login(self):
        post = FakePost([ok("t1")])
        src = TokenSource(env={}, post=post)
        self.assertFalse(src.configured)
        self.assertIsNone(src.token())
        self.assertEqual(src.headers(SEARCH), {})
        self.assertEqual(post.calls, [])
        half = TokenSource(env={"ONEMAP_EMAIL": EMAIL}, post=post)  # one of the two is not enough
        self.assertFalse(half.configured)

    def test_login_once_then_cached(self):
        clock = Clock()
        post = FakePost([ok("tok-A", clock.t + 3 * 86400)])
        src = TokenSource(env=ENV, post=post, clock=clock, proxy="http://proxy.invalid:1")
        self.assertEqual(src.headers(SEARCH), {"Authorization": "tok-A"})
        self.assertEqual(src.headers(SEARCH), {"Authorization": "tok-A"})
        self.assertEqual(src.fetches, 1)
        url, payload, proxy = post.calls[0]
        self.assertTrue(url.endswith("/api/auth/post/getToken"))
        self.assertEqual(payload, {"email": EMAIL, "password": PASSWORD})
        self.assertEqual(proxy, "http://proxy.invalid:1", "the login goes through the same proxy")

    def test_refresh_before_expiry_and_on_force(self):
        clock = Clock()
        post = FakePost([ok("tok-A", clock.t + 3600), ok("tok-B", clock.t + 3 * 86400)])
        src = TokenSource(env=ENV, post=post, clock=clock)
        self.assertEqual(src.token(), "tok-A")
        clock.t += 3600 - 60  # inside the refresh margin
        self.assertEqual(src.token(), "tok-B")
        self.assertEqual(src.fetches, 2)
        self.assertEqual(src.token(), "tok-B")
        src.invalidate()
        src.token()
        self.assertEqual(src.fetches, 3)
        src.token(force=True)
        self.assertEqual(src.fetches, 4)

    def test_missing_or_past_expiry_means_three_days(self):
        clock = Clock()
        for expiry in (None, clock.t - 10, "not-a-number"):
            post = FakePost([(200, json.dumps({"access_token": "x", **({} if expiry is None else {"expiry_timestamp": expiry})}).encode())])
            src = TokenSource(env=ENV, post=post, clock=clock)
            src.token()
            clock.t += 3 * 86400 - 3600  # still valid well inside 3 days
            src.token()
            self.assertEqual(src.fetches, 1, expiry)
            clock.t -= 3 * 86400 - 3600

    def test_failed_login_is_anonymous_and_never_leaks(self):
        for reply in [(401, b""), (0, b"URLError"), (200, b"not json"), (200, b'{"error": "x"}')]:
            err = io.StringIO()
            src = TokenSource(env=ENV, post=FakePost([reply]), stderr=err)
            self.assertEqual(src.headers(SEARCH), {})
            self.assertEqual(src.headers(SEARCH), {})
            text = err.getvalue()
            self.assertEqual(text.count(LOGIN_FAILED), 1, "reported once")
            self.assertNotIn(PASSWORD, text)
            self.assertNotIn(EMAIL, text)
            with self.assertRaises(onemap_token.TokenError) as cm:
                src.token()
            self.assertNotIn(PASSWORD, str(cm.exception))
        src = TokenSource(env=ENV, post=FakePost([ok("secret-token")]))
        src.token()
        self.assertNotIn("secret-token", repr(src))
        self.assertNotIn(EMAIL, repr(src))

    def test_only_onemap_urls_get_the_header(self):
        post = FakePost([ok("tok")])
        src = TokenSource(env=ENV, post=post)
        self.assertTrue(is_onemap(SEARCH))
        self.assertTrue(is_onemap("https:" + "//onemap.gov.sg/api/common/elastic/search?searchVal=1"))
        self.assertFalse(is_onemap("https:" + "//www.onemap.gov.sg/api/auth/post/getToken"))
        self.assertFalse(is_onemap("https:" + "//data.gov.sg/api/action/datastore_search"))
        self.assertFalse(is_onemap("https:" + "//onemap.gov.sg.evil.example/api"))
        self.assertEqual(src.headers("https:" + "//data.gov.sg/x"), {})
        self.assertEqual(post.calls, [], "no login for other hosts")


class EnvFileTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="sghf-onemap-"))

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_env_file_fills_only_missing_onemap_keys(self):
        f = self.tmp / ".env"
        f.write_text('HDB_PIPELINE_PROXY=\nONEMAP_EMAIL="file@example.test"\nONEMAP_PASSWORD=from-file\nOTHER=1\n', encoding="utf-8")
        env = {"ONEMAP_PASSWORD": "from-env"}
        onemap_token.load_env_file(f, env)
        self.assertEqual(env, {"ONEMAP_EMAIL": "file@example.test", "ONEMAP_PASSWORD": "from-env"})
        onemap_token.load_env_file(self.tmp / "missing.env", env)  # no file: no change, no error
        f.write_text("ONEMAP_EMAIL=                # optional OneMap account\nONEMAP_PASSWORD=pw  # comment\n", encoding="utf-8")
        env = {}
        onemap_token.load_env_file(f, env)
        self.assertEqual(env, {"ONEMAP_PASSWORD": "pw"}, "blank value + inline comment = not set")

    def test_tools_route_onemap_through_the_helper(self):
        # every tool that calls OneMap search builds its session / request via onemap_token
        for name in ["fetch_poi.py", "fetch_family_health.py"]:
            self.assertIn("from onemap_token import", (TOOLS / name).read_text(encoding="utf-8"), name)
        for name in ["fetch_hdb_blocks.py", "fetch_bto.py"]:  # fetch_bto.py: private build only
            if (TOOLS / name).is_file():
                self.assertIn("from fetch_poi import", (TOOLS / name).read_text(encoding="utf-8"), name)
        self.assertIn("return attach(s)", (TOOLS / "fetch_poi.py").read_text(encoding="utf-8"))
        fh = (TOOLS / "fetch_family_health.py").read_text(encoding="utf-8")
        self.assertIn("attach(_S)", fh)
        self.assertIn("**headers_for(url)", fh)
        http = (TOOLS.parent / "hdb-data-pipeline" / "src" / "hdb_pipeline" / "http.py").read_text(encoding="utf-8")
        self.assertIn("session.auth = OneMapAuth(", http)


if __name__ == "__main__":
    unittest.main()
