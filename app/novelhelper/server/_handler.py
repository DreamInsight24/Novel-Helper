from __future__ import annotations

from http.server import ThreadingHTTPServer

from .. import ai as ai
from .. import store
from ..localization import get_languages
from ._api import _ApiMixin
from ._base import _BaseHandler
from ._generation import _GenerationMixin
from ._language import apply_persisted_language
from ._records import _RecordMixin


class Handler(_ApiMixin, _RecordMixin, _GenerationMixin, _BaseHandler):
    server_version = "NovelHelper/2610.1"
    protocol_version = "HTTP/1.1"


def serve(host: str = "127.0.0.1", port: int = 8765) -> ThreadingHTTPServer:
    get_languages()  # Validate resources before accepting requests.
    store.ensure_dirs()
    apply_persisted_language()  # Damaged config falls back to first-run defaults (K2).
    httpd = ThreadingHTTPServer((host, port), Handler)
    httpd.daemon_threads = True
    return httpd
