# -*- coding: utf-8 -*-
"""Static files for the mockup, with caching switched off.

`python -m http.server` sends Last-Modified and nothing else — no Cache-Control, no ETag — so a
browser is free to apply heuristic freshness, roughly a tenth of the file's age, and serve a module
from cache without asking. That is survivable for a single self-contained page and not survivable
here: the page and places/*.js change together, and a cached copy of one against a fresh copy of
another is a page that draws its shell and then throws on a name the other half no longer passes.
Which looks exactly like "it works in incognito".

So: no-store on everything. This is a mockup server on localhost; there is nothing to gain by
caching and a whole class of confusing failure to lose.
"""
import functools
import http.server
import json
import os
import sys

# The only paths this server will write, and the only reason it accepts a POST at all: the page's
# four editors saving what they were opened to edit — the six camera routes, the walkers' loops,
# the firefly knots and the boats' laps. All are OVERLAYS over the tables in the HTML, not
# rewrites of them: the page lays each over its own table at boot and deleting the file is a full
# undo, so nothing here can damage anything that is not reproducible from the HTML alone.
SAVES = {'__flights': 'flights.json', '__loops': 'loops.json', '__flies': 'fireflies.json',
         '__boats': 'boats.json'}
SAVE_MAX = 64 * 1024


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_POST(self):  # noqa: N802 — BaseHTTPRequestHandler's naming, not ours
        # matched on the LAST path segment, so the same handler serves the page whether it is
        # being served from this directory or from the repository root
        key = self.path.rstrip('/').rsplit('/', 1)[-1]
        name = SAVES.get(key)
        if name is None:
            self.send_error(404, 'only %s accept a POST' % ', '.join('/' + k for k in SAVES))
            return
        try:
            n = int(self.headers.get('Content-Length') or 0)
            if not 0 < n <= SAVE_MAX:
                raise ValueError('body is %d bytes; the limit is %d' % (n, SAVE_MAX))
            # Parsed before it is written, so a truncated or malformed POST cannot leave a
            # flights.json behind that makes the page throw on its next boot.
            body = json.loads(self.rfile.read(n).decode('utf-8'))
            if not isinstance(body, dict):
                raise ValueError('expected a JSON object, got %s' % type(body).__name__)
            path = os.path.join(os.path.dirname(os.path.abspath(__file__)), name)
            tmp = path + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as fh:
                json.dump(body, fh, indent=2)
                fh.write('\n')
            os.replace(tmp, path)
            out = json.dumps({'ok': True, 'path': name, 'routes': len(body)}).encode()
            print('saved %s (%d entries)' % (name, len(body)), flush=True)
        except Exception as exc:  # noqa: BLE001 — the message is the whole response
            self.send_error(400, str(exc))
            return
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, fmt, *args):
        """Quiet unless something went wrong — a 404 on a model is worth seeing."""
        if args and str(args[1]).startswith(('4', '5')):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5230
    root = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(NoCache, directory=root)
    print('serving %s on http://localhost:%d (no-store)' % (root, port), flush=True)
    http.server.ThreadingHTTPServer(('', port), handler).serve_forever()
