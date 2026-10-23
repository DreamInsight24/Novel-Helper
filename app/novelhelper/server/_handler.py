from __future__ import annotations

from http.server import ThreadingHTTPServer

from .. import ai as ai
from .. import store
from ._api import _ApiMixin
from ._base import _BaseHandler
from ._generation import _GenerationMixin
from ._records import _RecordMixin


class Handler(_ApiMixin, _RecordMixin, _GenerationMixin, _BaseHandler):
    server_version = "NovelHelper/2610.1"
    protocol_version = "HTTP/1.1"


def serve(host: str = "127.0.0.1", port: int = 8765) -> ThreadingHTTPServer:
    store.ensure_dirs()
    httpd = ThreadingHTTPServer((host, port), Handler)
    httpd.daemon_threads = True
    return httpd
