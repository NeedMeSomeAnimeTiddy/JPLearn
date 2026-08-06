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
import os
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

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
