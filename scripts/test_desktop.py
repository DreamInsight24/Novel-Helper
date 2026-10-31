#!/usr/bin/env python3
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

"""Desktop/port tests: config migration, CLI precedence, dynamic bind, lifecycle."""
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))

TEMP = tempfile.TemporaryDirectory(prefix="novelhelper_desktop_")
os.environ["NOVELHELPER_HOME"] = TEMP.name
os.environ["NOVELHELPER_DATA"] = str(Path(TEMP.name) / "data")

from novelhelper import desktop, ports, server, store  # noqa: E402


def expect_error(call, needle: str) -> None:
    try:
        call()
    except ports.PortConfigError as exc:
        assert needle in str(exc), str(exc)
    else:
        raise AssertionError(f"expected PortConfigError containing {needle!r}")


def test_defaults_and_normalization() -> None:
    default = ports.default_server_config()
    assert default == {"host": "127.0.0.1", "port_mode": "auto"}, default
    assert "port" not in default

    normalized, changed = ports.normalize_server_config({})
    assert changed and normalized["port_mode"] == "auto" and "port" not in normalized

    normalized, changed = ports.normalize_server_config({"host": "127.0.0.1", "port": 8765})
    assert changed and normalized["port_mode"] == "auto" and "port" not in normalized

    normalized, changed = ports.normalize_server_config(
        {"host": "127.0.0.1", "port": 8766}, debug_mode=True)
    assert changed and normalized["port_mode"] == "auto" and "port" not in normalized

    normalized, changed = ports.normalize_server_config({"host": "127.0.0.1", "port": 9000})
    assert changed and normalized["port_mode"] == "fixed" and normalized["port"] == 9000

    normalized, changed = ports.normalize_server_config(
        {"host": "127.0.0.1", "port_mode": "auto", "port": 9000})
    assert changed and normalized["port_mode"] == "auto" and "port" not in normalized

    normalized, changed = ports.normalize_server_config(
        {"host": "127.0.0.1", "port_mode": "fixed", "port": "9001"})
    assert changed and normalized["port_mode"] == "fixed" and normalized["port"] == 9001

    expect_error(lambda: ports.normalize_server_config(
        {"port_mode": "fixed"}), "server.port 为空")
    expect_error(lambda: ports.normalize_server_config(
        {"port_mode": "fixed", "port": "abc"}), "必须是 1–65535")


def test_cli_precedence_and_validation() -> None:
    fixed = {"host": "127.0.0.1", "port_mode": "fixed", "port": 9000}
    auto = {"host": "127.0.0.1", "port_mode": "auto"}
    assert ports.resolve_listen_port("9001", fixed) == 9001
    assert ports.resolve_listen_port(None, fixed) == 9000
    assert ports.resolve_listen_port(None, auto) == 0
    assert ports.resolve_listen_port("65535", auto) == 65535
    for bad in ("0", "65536", "-1", "abc", "1.5", ""):
        expect_error(lambda bad=bad: ports.resolve_listen_port(bad, auto), "无效")
    expect_error(lambda: ports.resolve_listen_port("0", auto), "自动端口只能")


def test_dynamic_bind_and_clean_shutdown() -> None:
    httpd = server.serve("127.0.0.1", 0)
    port = int(httpd.server_address[1])
    assert 1 <= port <= 65535
    runtime = desktop.ServerRuntime(httpd).start()
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/i18n", timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        assert payload.get("current") == "zh-CN", payload
    finally:
        assert runtime.stop() is True
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{port}/api/i18n", timeout=1)
    except Exception:
        pass
    else:
        raise AssertionError("server still answers after ServerRuntime.stop()")


def test_fixed_port_conflict_stops() -> None:
    blocker = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    blocker.bind(("127.0.0.1", 0))
    blocker.listen(1)
    port = blocker.getsockname()[1]
    try:
        try:
            server.serve("127.0.0.1", port)
        except OSError:
            pass
        else:
            raise AssertionError("binding an occupied fixed port should fail")
    finally:
        blocker.close()


def test_window_bounds_and_splash_assets() -> None:
    bounds = desktop.window_bounds((0, 0, 1440, 912))
    assert (bounds.width, bounds.height) == (1280, 800), bounds
    assert (bounds.x, bounds.y) == (80, 56), bounds
    assert bounds.min_size == (1024, 720), bounds

    bounds = desktop.window_bounds((0, 0, 1920, 1040))
    assert (bounds.width, bounds.height) == (1280, 800), bounds
    assert (bounds.x, bounds.y) == (320, 120), bounds

    bounds = desktop.window_bounds((0, 0, 1366, 728))
    assert (bounds.width, bounds.height) == (1280, 664), bounds
    assert (bounds.x, bounds.y) == (43, 32), bounds
    assert bounds.min_size == (1024, 664), bounds

    for area in ((0, 0, 800, 600), (120, 40, 1366, 728), (0, 0, 1440, 912)):
        left, top, width, height = area
        bounds = desktop.window_bounds(area)
        assert bounds.x >= left and bounds.y >= top, bounds
        assert bounds.x + bounds.width <= left + width, bounds
        assert bounds.y + bounds.height <= top + height, bounds
        assert bounds.min_width <= bounds.width, bounds
        assert bounds.min_height <= bounds.height, bounds

    assert desktop.SPLASH_MIN_SECONDS >= 1.0
    assert desktop.ICON_PATH.is_file(), desktop.ICON_PATH
    assert desktop.ICON_PNG_PATH.is_file(), desktop.ICON_PNG_PATH
    assert desktop.SPLASH_PATH.is_file(), desktop.SPLASH_PATH
    splash = desktop.splash_html()
    assert "NovelHelper" in splash and "data:image/png;base64," in splash
    assert "正在准备你的创作空间" in splash


def test_window_contract_without_gui() -> None:
    class FakeLoaded:
        def __init__(self):
            self.handlers = []

        def __iadd__(self, handler):
            self.handlers.append(handler)
            return self

        def set(self):
            for handler in self.handlers:
                handler()

    class FakeWindow:
        def __init__(self):
            self.events = type("Events", (), {})()
            self.events.loaded = FakeLoaded()
            self.loaded_url = ""
            self.js: list[str] = []

        def evaluate_js(self, script):
            self.js.append(script)

        def load_url(self, url):
            self.loaded_url = url

    class FakeWebview:
        def __init__(self):
            self.window = None
            self.created = None
            self.started = False
            self.icon = None

        def create_window(self, title, url=None, **kwargs):
            self.created = {"title": title, "url": url, "kwargs": kwargs}
            self.window = FakeWindow()
            return self.window

        def start(self, icon=None):
            self.started = True
            self.icon = icon
            self.window.events.loaded.set()

    original_work_area = desktop.primary_work_area
    desktop.primary_work_area = lambda: (0, 0, 1440, 912)
    try:
        fake = FakeWebview()
        desktop.open_window(
            "http://127.0.0.1:43210/",
            webview_module=fake,
            splash_seconds=0,
        )
        deadline = time.time() + 2
        while not fake.window.loaded_url and time.time() < deadline:
            time.sleep(0.01)
        assert fake.started is True
        assert fake.created["title"] == desktop.WINDOW_TITLE
        assert fake.created["url"] is None
        assert "NovelHelper" in fake.created["kwargs"]["html"]
        assert fake.created["kwargs"]["width"] == 1280
        assert fake.created["kwargs"]["height"] == 800
        assert fake.created["kwargs"]["x"] == 80
        assert fake.created["kwargs"]["y"] == 56
        assert fake.created["kwargs"]["min_size"] == (1024, 720)
        assert fake.created["kwargs"]["resizable"] is True
        assert fake.created["kwargs"]["maximized"] is False
        assert fake.window.loaded_url == "http://127.0.0.1:43210/"
        assert fake.icon and fake.icon.endswith("NovelHelper.ico")
    finally:
        desktop.primary_work_area = original_work_area

    class BrokenWebview:
        def create_window(self, *args, **kwargs):
            raise RuntimeError("WebView2 is missing")

        def start(self, icon=None):
            raise AssertionError("start should not run")

    try:
        desktop.open_window("http://127.0.0.1:1/", webview_module=BrokenWebview())
    except desktop.WindowError as exc:
        assert "WebView2" in str(exc)
    else:
        raise AssertionError("broken webview should raise WindowError")


def test_store_config_migration_and_global_scope() -> None:
    store.ensure_dirs()
    config = store.load("config")
    config["server"] = {"host": "127.0.0.1", "port": 8765}
    store.save("config", config)
    store.ensure_dirs()
    migrated = store.load("config")["server"]
    assert migrated["port_mode"] == "auto" and "port" not in migrated, migrated

    config = store.load("config")
    config["server"] = {"host": "127.0.0.1", "port": 9010}
    store.save("config", config)
    store.ensure_dirs()
    migrated = store.load("config")["server"]
    assert migrated == {"host": "127.0.0.1", "port_mode": "fixed", "port": 9010}, migrated

    novel = store.create_novel("Desktop scope test")
    store.save_novel_config(novel["id"], {
        "version": 1,
        "use_global": {"server": False},
        "values": {"server": {"host": "0.0.0.0", "port_mode": "fixed", "port": 9020}},
    })
    novel_config = store.load_novel_config(novel["id"])
    assert "server" not in novel_config["values"], novel_config
    assert "server" not in novel_config["use_global"], novel_config
    store.open_novel(novel["id"])
    effective = store.current_config()
    assert effective["server"]["port"] == 9010, effective["server"]

    config = store.load("config")
    config["server"] = {"host": "127.0.0.1", "port": 70000}
    store.save("config", config)
    try:
        store.ensure_dirs()
    except ports.PortConfigError:
        pass
    else:
        raise AssertionError("invalid explicit port should fail startup migration")
    config = store.load("config")
    config["server"] = {"host": "127.0.0.1", "port_mode": "auto"}
    store.save("config", config)


def test_cli_failures() -> None:
    env = os.environ.copy()
    env.update({
        "NOVELHELPER_HOME": TEMP.name,
        "NOVELHELPER_DATA": str(Path(TEMP.name) / "data"),
        "PYTHONUTF8": "1",
    })
    base = [sys.executable, "-X", "utf8", "-B", str(ROOT / "app" / "run.py"),
            "--no-window"]
    zero = subprocess.run(base + ["--port", "0"], cwd=str(ROOT), env=env,
                          capture_output=True, text=True, timeout=30)
    assert zero.returncode == 2, zero
    assert "自动端口只能" in (zero.stdout + zero.stderr), zero.stdout + zero.stderr

    blocker = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    blocker.bind(("127.0.0.1", 0))
    blocker.listen(1)
    port = blocker.getsockname()[1]
    try:
        conflict = subprocess.run(
            base + ["--port", str(port)], cwd=str(ROOT), env=env,
            capture_output=True, text=True, timeout=30)
        assert conflict.returncode == 1, conflict
        combined = conflict.stdout + conflict.stderr
        assert "启动失败" in combined and str(port) in combined, combined
    finally:
        blocker.close()


def test_no_window_process() -> None:
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    probe.bind(("127.0.0.1", 0))
    port = probe.getsockname()[1]
    probe.close()
    env = os.environ.copy()
    env.update({
        "NOVELHELPER_HOME": TEMP.name,
        "NOVELHELPER_DATA": str(Path(TEMP.name) / "data"),
        "PYTHONUTF8": "1",
    })
    proc = subprocess.Popen(
        [sys.executable, "-u", "-X", "utf8", "-B", str(ROOT / "app" / "run.py"),
         "--no-window", "--port", str(port)],
        cwd=str(ROOT), env=env, stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, text=True,
    )
    try:
        deadline = time.time() + 20
        url = ""
        while time.time() < deadline:
            line = proc.stdout.readline()
            if not line:
                break
            if "访问地址" in line:
                url = line.split("访问地址 :", 1)[-1].strip()
                break
        assert url, f"no startup URL; exit={proc.poll()}"
        with urllib.request.urlopen(url + "api/i18n", timeout=10) as resp:
            assert resp.status == 200
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except Exception:
            proc.kill()


def main() -> int:
    test_defaults_and_normalization()
    test_cli_precedence_and_validation()
    test_dynamic_bind_and_clean_shutdown()
    test_fixed_port_conflict_stops()
    test_window_bounds_and_splash_assets()
    test_window_contract_without_gui()
    test_store_config_migration_and_global_scope()
    test_cli_failures()
    test_no_window_process()
    print("PASS: port migration, precedence, conflicts, dynamic bind, window contract, and --no-window")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    finally:
        TEMP.cleanup()
