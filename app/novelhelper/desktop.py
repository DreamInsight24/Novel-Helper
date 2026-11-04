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

import base64
import ctypes
import hashlib
import os
import sys
import threading
import time
from ctypes import wintypes
from dataclasses import dataclass
from pathlib import Path
from typing import Any

WINDOW_TITLE = "NovelHelper"
WINDOW_SIZE = (1280, 800)
WINDOW_MIN_SIZE = (1024, 720)
WINDOW_MARGIN = 32
SPLASH_MIN_SECONDS = 1.2
SPLASH_LOAD_TIMEOUT = 5.0
SPLASH_FADE_SECONDS = 0.18
SPLASH_BACKGROUND = "#0B1220"
WEBVIEW2_URL = "https://go.microsoft.com/fwlink/p/?LinkId=2124703"
_ERROR_ALREADY_EXISTS = 183
_SW_RESTORE = 9

_RESOURCE_DIR = (
    Path(getattr(sys, "_MEIPASS")) / "resources"
    if getattr(sys, "frozen", False) and getattr(sys, "_MEIPASS", None)
    else Path(__file__).resolve().parent.parent / "resources"
)
ICON_PATH = _RESOURCE_DIR / "NovelHelper.ico"
ICON_PNG_PATH = _RESOURCE_DIR / "NovelHelper.png"
SPLASH_PATH = _RESOURCE_DIR / "splash.html"


class WindowError(RuntimeError):
    """The desktop window could not be created or started."""


@dataclass(frozen=True)
class WindowBounds:
    """Initial window geometry in logical pixels."""

    x: int
    y: int
    width: int
    height: int
    min_width: int
    min_height: int

    @property
    def min_size(self) -> tuple[int, int]:
        return self.min_width, self.min_height


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


_KERNEL32: Any = None


def _kernel32() -> Any:
    """``kernel32`` with ctypes last-error capture, for ``CreateMutexW``."""
    global _KERNEL32
    if _KERNEL32 is None:
        _KERNEL32 = ctypes.WinDLL("kernel32", use_last_error=True)
    return _KERNEL32


class SingleInstance:
    """Allow only one NovelHelper process per data directory.

    The guard is a named kernel mutex, so a crashed process never leaves a
    stale lock behind: Windows releases the handle when the process exits.
    """

    def __init__(self, key: str) -> None:
        self._key = key
        self._handle: int | None = None

    def acquire(self) -> bool:
        """Return ``True`` when this process may run, ``False`` if another does."""
        if os.name != "nt":
            return True
        try:
            kernel32 = _kernel32()
            kernel32.CreateMutexW.argtypes = (
                wintypes.LPVOID, wintypes.BOOL, wintypes.LPCWSTR)
            kernel32.CreateMutexW.restype = wintypes.HANDLE
            kernel32.CloseHandle.argtypes = (wintypes.HANDLE,)
            kernel32.CloseHandle.restype = wintypes.BOOL
            name = "Local\\NovelHelper-" + hashlib.sha256(
                self._key.casefold().encode("utf-8")).hexdigest()[:32]
            handle = kernel32.CreateMutexW(None, False, name)
            if not handle:
                return True  # a broken Win32 call must not block startup
            if ctypes.get_last_error() == _ERROR_ALREADY_EXISTS:
                kernel32.CloseHandle(handle)
                return False
            self._handle = handle
            return True
        except Exception:  # noqa: BLE001 - single-instance is best effort
            return True

    def release(self) -> None:
        """Drop the mutex early; process exit does this automatically."""
        if self._handle is None:
            return
        try:
            _kernel32().CloseHandle(self._handle)
        except Exception:  # noqa: BLE001 - the process is exiting anyway
            pass
        self._handle = None


def focus_existing_window(title: str = WINDOW_TITLE, timeout: float = 2.0) -> bool:
    """Bring a running window to the front, retrying briefly during startup."""
    if os.name != "nt":
        return False
    try:
        user32 = ctypes.windll.user32  # type: ignore[attr-defined]
        user32.FindWindowW.argtypes = (wintypes.LPCWSTR, wintypes.LPCWSTR)
        user32.FindWindowW.restype = wintypes.HWND
    except Exception:  # noqa: BLE001 - window focus is optional
        return False
    deadline = time.monotonic() + max(0.0, float(timeout))
    while True:
        try:
            hwnd = user32.FindWindowW(None, title)
            if hwnd:
                user32.ShowWindow(hwnd, _SW_RESTORE)
                user32.SetForegroundWindow(hwnd)
                return True
        except Exception:  # noqa: BLE001 - window focus is optional
            return False
        if time.monotonic() >= deadline:
            return False
        time.sleep(0.1)


def window_bounds(work_area: tuple[int, int, int, int]) -> WindowBounds:
    """Fit the default window inside a work area and center it there.

    ``work_area`` is ``(left, top, width, height)`` in logical pixels and
    should exclude the taskbar. The result is always clamped to the available
    area, so small screens never get an oversized or off-screen window.
    """
    left, top, area_width, area_height = (int(value) for value in work_area)
    area_width = max(1, area_width)
    area_height = max(1, area_height)

    width = min(WINDOW_SIZE[0], max(1, area_width - 2 * WINDOW_MARGIN))
    height = min(WINDOW_SIZE[1], max(1, area_height - 2 * WINDOW_MARGIN))
    width = min(width, area_width)
    height = min(height, area_height)

    x = left + max(0, (area_width - width) // 2)
    y = top + max(0, (area_height - height) // 2)

    return WindowBounds(
        x=x,
        y=y,
        width=width,
        height=height,
        min_width=min(WINDOW_MIN_SIZE[0], width),
        min_height=min(WINDOW_MIN_SIZE[1], height),
    )


def _system_dpi_scale() -> float:
    """Return the system DPI scale before the first pywebview window exists."""
    if os.name != "nt":
        return 1.0
    try:
        user32 = ctypes.windll.user32  # type: ignore[attr-defined]
        try:
            dpi = int(user32.GetDpiForSystem())
        except (AttributeError, OSError):
            hdc = user32.GetDC(0)
            try:
                dpi = int(ctypes.windll.gdi32.GetDeviceCaps(hdc, 88))  # type: ignore[attr-defined]
            finally:
                user32.ReleaseDC(0, hdc)
        return max(1.0, dpi / 96.0)
    except Exception:  # noqa: BLE001 - fall back to unscaled coordinates
        return 1.0


def primary_work_area() -> tuple[int, int, int, int]:
    """Return the primary monitor work area in logical pixels.

    ``SPI_GETWORKAREA`` excludes the taskbar. The process is made DPI-aware
    before reading it, then physical pixels are converted back to the logical
    units expected by pywebview.
    """
    if os.name != "nt":
        return 0, 0, 1280, 800
    try:
        user32 = ctypes.windll.user32  # type: ignore[attr-defined]
        try:
            user32.SetProcessDPIAware()
        except Exception:
            pass
        rect = wintypes.RECT()
        if not user32.SystemParametersInfoW(0x0030, 0, ctypes.byref(rect), 0):
            return 0, 0, 1280, 800
        if rect.right <= rect.left or rect.bottom <= rect.top:
            return 0, 0, 1280, 800
        scale = _system_dpi_scale()
        return (
            round(rect.left / scale),
            round(rect.top / scale),
            round((rect.right - rect.left) / scale),
            round((rect.bottom - rect.top) / scale),
        )
    except Exception:  # noqa: BLE001 - a sane fallback is better than no window
        return 0, 0, 1280, 800


def _fallback_splash() -> str:
    return (
        "<!doctype html><html><head><meta charset='utf-8'>"
        "<style>html,body{height:100%;margin:0}body{display:grid;place-items:center;"
        "background:#0b1220;color:#eef4ff;font-family:Segoe UI,sans-serif}"
        "h1{font-size:32px;letter-spacing:.05em}</style></head>"
        "<body><h1>NovelHelper</h1></body></html>"
    )


def splash_html() -> str:
    """Load the themed splash page and inline the app icon as a data URI."""
    try:
        template = SPLASH_PATH.read_text(encoding="utf-8")
        icon = base64.b64encode(ICON_PNG_PATH.read_bytes()).decode("ascii")
        return template.replace("{{ICON_DATA_URI}}", f"data:image/png;base64,{icon}")
    except (OSError, UnicodeError):
        return _fallback_splash()


def load_webview() -> Any:
    """Import pywebview lazily so CLI/check/service modes have no GUI dependency."""
    try:
        import webview  # type: ignore[import-not-found]
    except Exception as exc:  # noqa: BLE001 - surface a readable install hint
        raise WindowError(
            "无法加载 pywebview 桌面组件。请重新安装依赖（pip install -r app/requirements.txt），"
            "或使用 --no-window 只启动本地服务。") from exc
    return webview


def open_window(
    url: str,
    *,
    webview_module: Any = None,
    splash_seconds: float | None = None,
) -> None:
    """Show the splash, then load the application and block until closed."""
    webview = webview_module or load_webview()
    minimum = SPLASH_MIN_SECONDS if splash_seconds is None else max(0.0, float(splash_seconds))
    bounds = window_bounds(primary_work_area())
    icon = str(ICON_PATH) if ICON_PATH.is_file() else None

    try:
        window = webview.create_window(
            WINDOW_TITLE,
            html=splash_html(),
            width=bounds.width,
            height=bounds.height,
            x=bounds.x,
            y=bounds.y,
            min_size=bounds.min_size,
            resizable=True,
            maximized=False,
            background_color=SPLASH_BACKGROUND,
        )
        if window is None:
            raise WindowError("窗口创建失败。")

        loaded = threading.Event()
        loaded_at: list[float] = []

        def _mark_loaded() -> None:
            if not loaded.is_set():
                loaded_at.append(time.monotonic())
                loaded.set()

        try:
            window.events.loaded += _mark_loaded
        except Exception:
            loaded.set()

        def _switch_to_app() -> None:
            loaded.wait(SPLASH_LOAD_TIMEOUT)
            shown_at = loaded_at[0] if loaded_at else time.monotonic()
            remaining = minimum - (time.monotonic() - shown_at)
            if remaining > 0:
                time.sleep(remaining)
            if minimum > 0:
                try:
                    window.evaluate_js(
                        "document.documentElement.classList.add('leaving')"
                    )
                except Exception:
                    pass
                time.sleep(SPLASH_FADE_SECONDS)
            try:
                window.load_url(url)
            except Exception:
                # The native error dialog is shown by the caller if the
                # window itself failed; a navigation error leaves WebView2's
                # own error page visible instead of taking down the process.
                pass

        threading.Thread(
            target=_switch_to_app,
            name="novelhelper-splash",
            daemon=True,
        ).start()

        webview.start(icon=icon)
    except Exception as exc:  # noqa: BLE001 - pywebview/WinForms errors vary
        if isinstance(exc, WindowError):
            raise
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


def show_info_dialog(title: str, message: str) -> None:
    """Best-effort native information dialog for double-click launches."""
    if os.name != "nt":
        return
    try:
        ctypes.windll.user32.MessageBoxW(0, message, title, 0x40)  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001 - console/log output remains available
        pass
