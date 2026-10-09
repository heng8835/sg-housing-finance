"""Serve a staged site folder for the browser smoke test: python tests/e2e/serve_site.py PORT DIR (127.0.0.1 only).

python -m http.server with two changes: a listen backlog of 128 (the stock 5 refuses connections on Windows when
parallel browsers each open several), no per-request log lines, and fixed MIME types for ES modules / JSON (the
Windows registry can map .js to text/plain). Standard library only.
"""
import functools
import http.server
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
                      ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".css": "text/css"}

    def log_message(self, *args):
        pass


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True


def main(argv):
    if len(argv) != 3:
        raise SystemExit("usage: serve_site.py PORT DIR")
    port, folder = int(argv[1]), argv[2]
    with Server(("127.0.0.1", port), functools.partial(Handler, directory=folder)) as httpd:
        print(f"serving {folder} on 127.0.0.1:{port}", flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main(sys.argv)
