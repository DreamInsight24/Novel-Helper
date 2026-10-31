# Copyright (C) 2026 DreamInsight24 and NovelHelper contributors
#
# SPDX-License-Identifier: GPL-3.0-or-later
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

from __future__ import annotations

import os
from http.server import ThreadingHTTPServer

from .. import APP_VERSION
from .. import ai as ai
from .. import store
from ..localization import get_languages
from ._api import _ApiMixin
from ._base import _BaseHandler
from ._generation import _GenerationMixin
from ._language import apply_persisted_language
from ._records import _RecordMixin


class Handler(_ApiMixin, _RecordMixin, _GenerationMixin, _BaseHandler):
    server_version = f"NovelHelper/{APP_VERSION.lstrip('v')}"
    protocol_version = "HTTP/1.1"


class _Server(ThreadingHTTPServer):
    # On Windows SO_REUSEADDR allows a second bind to the same port, which
    # would silently defeat the explicit-port conflict check. Disabling it
    # makes socketserver use SO_EXCLUSIVEADDRUSE on Windows.
    allow_reuse_address = os.name != "nt"
    allow_reuse_port = False


def serve(host: str = "127.0.0.1", port: int = 0) -> ThreadingHTTPServer:
    get_languages()  # Validate resources before accepting requests.
    store.ensure_dirs()
    apply_persisted_language()  # Damaged config falls back to first-run defaults (K2).
    httpd = _Server((host, port), Handler)
    httpd.daemon_threads = True
    return httpd
