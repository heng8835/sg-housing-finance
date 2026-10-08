"""Local web server for app/ that tells the browser to re-check every file (Cache-Control: no-cache),
so edits and rebuilt data show up on a normal reload. Unchanged files still come back as a cheap
304. Used by serve.cmd and the "app" preview config.

Run:  python tools/serve.py [port]        (default 8766; serves ../app)
"""
import functools
import http.server
import sys
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "app"


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    handler = functools.partial(NoCacheHandler, directory=str(APP))
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"Serving {APP} at http://localhost:{port}/ (Ctrl+C to stop)")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
