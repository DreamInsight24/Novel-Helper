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

"""Desktop window and HTTP server lifecycle helpers."""
from __future__ import annotations

import os
import threading
from typing import Any

WINDOW_TITLE = "NovelHelper"
WINDOW_SIZE = (1440, 900)
WINDOW_MIN_SIZE = (1024, 720)
WEBVIEW2_URL = "https://go.microsoft.com/fwlink/p/?LinkId=2124703"


class WindowError(RuntimeError):
    """The desktop window could not be created or started."""


class ServerRuntime:
    """Run a prepared HTTP server in a daemon thread and stop it cleanly."""

    def __init__(self, httpd: Any):
        self.httpd = httpd
        self.thread: threading.Thread | None = None

    def start(self) -> "ServerRuntime":
        self.thread = threading.Thread(
            target=self.httpd.serve_forever,
            name="novelhelper-http",
            daemon=True,
        )
        self.thread.start()
        return self

    def stop(self, timeout: float = 5.0) -> bool:
        """Stop the server and report whether its thread exited in time."""
        if self.thread and self.thread.is_alive():
            self.httpd.shutdown()
        self.httpd.server_close()
        if self.thread:
            self.thread.join(timeout)
            return not self.thread.is_alive()
        return True


def load_webview() -> Any:
    """Import pywebview lazily so CLI/check/service modes have no GUI dependency."""
    try:
        import webview  # type: ignore[import-not-found]
    except Exception as exc:  # noqa: BLE001 - surface a readable install hint
        raise WindowError(
            "无法加载 pywebview 桌面组件。请重新安装依赖（pip install -r app/requirements.txt），"
            "或使用 --no-window 只启动本地服务。") from exc
    return webview


def open_window(url: str, *, webview_module: Any = None) -> None:
    """Create the application window and block until it is closed."""
    webview = webview_module or load_webview()
    try:
        webview.create_window(
            WINDOW_TITLE,
            url,
            width=WINDOW_SIZE[0],
            height=WINDOW_SIZE[1],
            min_size=WINDOW_MIN_SIZE,
            resizable=True,
        )
        webview.start()
    except Exception as exc:  # noqa: BLE001 - pywebview/WinForms errors vary
        raise WindowError(
            "无法启动应用窗口。请确认已安装 Microsoft Edge WebView2 Runtime："
            f"{WEBVIEW2_URL}；也可使用 --no-window 只启动本地服务，或查看日志。"
        ) from exc


def show_error_dialog(title: str, message: str) -> None:
    """Best-effort native error dialog for double-click launches on Windows."""
    if os.name != "nt":
        return
    try:
        import ctypes

        ctypes.windll.user32.MessageBoxW(0, message, title, 0x10)  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001 - console/log output remains available
        pass
