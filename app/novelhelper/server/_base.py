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

from ..localization import t, get_language, language_context

import json
import mimetypes
import time
import traceback
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, unquote, urlparse

from .. import ai, logger, store
from ._helpers import _json_default
from ._state import MAX_BODY


class _BaseHandler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: bytes, content_type: str):
        self._last_status = status
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, payload, status: int = 200):
        body = json.dumps(payload, ensure_ascii=False, default=_json_default).encode("utf-8")
        self._send(status, body, "application/json; charset=utf-8")

    def _error(self, message: str, status: int = 400, detail: str = ""):
        self._json({"ok": False, "error": message, "detail": detail}, status=status)

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        if length > MAX_BODY:
            raise ValueError(t('errors.body_too_large'))
        raw = self.rfile.read(length)
        if not raw.strip():
            return {}
        return json.loads(raw.decode("utf-8"))

    def log_message(self, fmt, *args):  # noqa: A003
        print(f"[novelhelper] {self.address_string()} {fmt % args}")

    def do_GET(self):  # noqa: N802
        self._dispatch("GET")

    def do_HEAD(self):  # noqa: N802
        self._dispatch("GET")

    def _dispatch(self, method: str):
        with language_context(self.headers.get("X-NovelHelper-Language") or get_language()):
            self._dispatch_localized(method)

    def _dispatch_localized(self, method: str):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        query = parse_qs(parsed.query)
        started = time.time()
        try:
            if path.startswith("/api/"):
                self._api(method, path, query)
            else:
                self._static(path)
        except PermissionError as exc:
            logger.log_warning("HTTP", "permission denied", method=method, path=path, error=str(exc))
            self._error(str(exc), status=403)
        except ValueError as exc:
            logger.log_warning("HTTP", "invalid request", method=method, path=path, error=str(exc))
            self._error(str(exc), status=400)
        except FileNotFoundError as exc:
            logger.log_warning("HTTP", "not found", method=method, path=path, error=str(exc))
            self._error(t('errors.file_missing', detail=exc), status=404)
        except ai.AIError as exc:
            logger.log_exception("AI", "request failed", exc, method=method, path=path)
            self._error(str(exc), status=502, detail=str(exc))
        except Exception as exc:  # noqa: BLE001
            logger.log_exception("ERROR", "unhandled request error", exc, method=method, path=path)
            self._error(f"{type(exc).__name__}: {exc}", status=500, detail=traceback.format_exc()[-2000:])
        finally:
            if path.startswith("/api/"):
                logger.log_event("HTTP", method, path=path,
                                 status=getattr(self, "_last_status", 0),
                                 ms=round((time.time() - started) * 1000, 1))

    def do_POST(self):  # noqa: N802
        self._dispatch("POST")

    def do_PUT(self):  # noqa: N802
        self._dispatch("POST")

    def do_DELETE(self):  # noqa: N802
        self._dispatch("DELETE")

    def _static(self, path: str):
        rel = "index.html" if path in ("/", "") else path.lstrip("/")
        target = (store.WEB_DIR / rel).resolve()
        try:
            target.relative_to(store.WEB_DIR.resolve())
        except ValueError:
            self._error(t('errors.invalid_path'), status=403)
            return
        if not target.exists() or target.is_dir():
            self._error(t('errors.resource_missing', path=rel), status=404)
            return
        ctype = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        self._send(200, target.read_bytes(), ctype)
