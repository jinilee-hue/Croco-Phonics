"""Local server for Croco Phonics: like `python3 -m http.server`, but it tells the browser not to reuse old copies
(Cache-Control: no-cache), so a normal reload always shows the latest files. (A plain http.server let Chrome keep
serving old js/css after an update: the user saw a removed word and the old crown.)

usage: python3 tools/serve.py [port]        default 5211, 127.0.0.1 only
"""
import functools
import http.server
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5211
    http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Handler, directory=str(ROOT))).serve_forever()
