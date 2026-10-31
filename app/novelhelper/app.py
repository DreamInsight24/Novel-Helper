#!/usr/bin/env python3
# -*- coding: utf-8 -*-
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

"""
novelhelper/app.py
应用入口。

用法:
    python app/run.py                    # 启动桌面窗口
    python app/run.py --port 9000        # 指定固定端口
    python app/run.py --no-window        # 只启动本地服务，供测试/高级用户使用
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from novelhelper import desktop, localization, logger, ports, server, store  # type: ignore
    from novelhelper._version import APP_VERSION  # type: ignore
else:  # pragma: no cover
    from . import desktop, localization, logger, ports, server, store
    from ._version import APP_VERSION


class _NullStream:
    """Discard output in windowed builds that have no console or pipe."""

    encoding = "utf-8"

    def write(self, text: str) -> int:
        return len(text)

    def flush(self) -> None:
        pass

    def isatty(self) -> bool:
        return False


def _prepare_console() -> None:
    try:
        if sys.platform.startswith("win"):
            import ctypes

            ctypes.windll.kernel32.SetConsoleOutputCP(65001)  # type: ignore[attr-defined]
            ctypes.windll.kernel32.SetConsoleCP(65001)  # type: ignore[attr-defined]
    except Exception:
        pass
    for name in ("stdout", "stderr"):
        if getattr(sys, name) is None:
            setattr(sys, name, _NullStream())
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        except Exception:
            pass


def _check_install() -> int:
    """检查打包后的网页资源与数据目录是否可读写，供 CI 和故障排查使用。"""
    required = ("index.html", "core.js", "style.css", "workstation.js", "manuscript.js",
                "i18n/i18n.js", "i18n/bootstrap.js")
    missing = [name for name in required if not (store.WEB_DIR / name).is_file()]
    if missing:
        print(f"[错误] 安装不完整，缺少网页资源：{', '.join(missing)}")
        print(f"       资源目录：{store.WEB_DIR}")
        return 1
    try:
        localization.validate_translations()
    except ValueError as exc:
        print(f"[错误] 本地化资源校验失败：{exc}")
        return 1
    try:
        store.ensure_dirs()
        probe = store.DATA_DIR / ".write-test"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
    except ports.PortConfigError as exc:
        print(f"[错误] 端口配置无效：{exc}")
        print(f"       配置文件：{store.DATA_DIR / 'config.json'}")
        return 1
    except OSError as exc:
        print(f"[错误] 数据目录不可写：{store.DATA_DIR}（{exc}）")
        print("       请把程序放到有写入权限的目录，或设置 NOVELHELPER_HOME。")
        return 1
    print("NovelHelper 安装检查通过。")
    print(f"  版本：{APP_VERSION}")
    print(f"  网页资源：{store.WEB_DIR}")
    print(f"  数据目录：{store.DATA_DIR}")
    return 0


def _error(message: str, *, show_dialog: bool) -> None:
    print(f"[错误] {message}")
    if show_dialog and not os.environ.get("NOVELHELPER_NO_DIALOG"):
        desktop.show_error_dialog("NovelHelper 启动失败", message)


def _display_host(host: str) -> str:
    """A wildcard bind address is not a usable browser URL."""
    if host in {"0.0.0.0", "::", "[::]"}:
        return "127.0.0.1"
    return host


def _stop_server(httpd, runtime: desktop.ServerRuntime | None = None) -> None:
    if runtime is not None:
        if not runtime.stop():
            print("[警告] HTTP 服务线程未能在 5 秒内退出。")
        return
    httpd.server_close()


def _run_service(httpd, log_file: Path) -> int:
    print("  按 Ctrl+C 结束服务")
    print("=" * 56)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[novelhelper] 已停止。")
    finally:
        httpd.server_close()
        logger.log_event("APP", "stop", log_file=str(log_file))
    return 0


def main() -> int:
    _prepare_console()
    parser = argparse.ArgumentParser(description="NovelHelper 开源小说创作工具")
    parser.add_argument("--host", default=None, help="监听地址（默认读取全局配置，初始为 127.0.0.1）")
    parser.add_argument("--port", default=None, metavar="N",
                        help="显式端口（1–65535）；覆盖配置，0 不是自动端口的写法")
    parser.add_argument("--no-window", action="store_true",
                        help="只启动本地 HTTP 服务，不创建桌面窗口（供测试/高级用户使用）")
    parser.add_argument("--no-browser", action="store_true",
                        help="兼容旧参数：等同于 --no-window，已弃用")
    parser.add_argument("--debug", action="store_true",
                        help="开发者调试模式（需通过 app/run.py 启动）")
    parser.add_argument("--check", action="store_true", help="检查网页资源与数据目录后退出")
    parser.add_argument("--version", action="version", version=APP_VERSION)
    args = parser.parse_args()

    if args.check:
        return _check_install()

    if args.debug and not store.DEBUG_MODE:
        print("[错误] 调试模式必须通过 app/run.py --debug 启动，当前未启用隔离目录。")
        return 2

    if args.no_browser:
        print("[提示] --no-browser 已弃用，请使用 --no-window；本次按 --no-window 处理。")
    window_mode = not (args.no_window or args.no_browser)

    try:
        store.ensure_dirs()
    except ports.PortConfigError as exc:
        try:
            logger.start_session()
            logger.log_warning("APP", "port config invalid", error=str(exc),
                               data_dir=str(store.DATA_DIR))
        except Exception:
            pass
        message = f"端口配置无效：{exc}\n配置文件：{store.DATA_DIR / 'config.json'}"
        _error(message, show_dialog=window_mode)
        return 2
    except OSError as exc:
        _error(f"无法初始化数据目录：{store.DATA_DIR}（{exc}）", show_dialog=window_mode)
        return 1

    log_file = logger.start_session()
    cfg = store.load("config")
    server_cfg = cfg.get("server") or {}
    host = str(args.host or server_cfg.get("host") or ports.DEFAULT_HOST).strip() or ports.DEFAULT_HOST
    try:
        listen_port = ports.resolve_listen_port(args.port, server_cfg)
    except ports.PortConfigError as exc:
        message = f"{exc}\n配置文件：{store.DATA_DIR / 'config.json'}"
        logger.log_warning("APP", "port config invalid", error=str(exc))
        _error(message, show_dialog=window_mode)
        return 2

    try:
        httpd = server.serve(host=host, port=listen_port)
    except OSError as exc:
        prefix = "自动分配端口失败" if listen_port == 0 else f"端口 {listen_port} 启动失败"
        message = (
            f"{prefix}：{exc}\n"
            f"配置文件：{store.DATA_DIR / 'config.json'}\n"
            "请修改全局 config.json 的 server.port，或删除 server.port 使用自动端口，"
            "也可以使用 --port 指定其他端口。"
        )
        logger.log_warning("APP", "server bind failed", host=host, port=listen_port, error=str(exc))
        _error(message, show_dialog=window_mode)
        return 1

    actual_port = int(httpd.server_address[1])
    url = f"http://{_display_host(host)}:{actual_port}/"
    logger.log_event("APP", "start", host=host, port=actual_port, data_dir=str(store.DATA_DIR),
                     version=APP_VERSION, debug=store.DEBUG_MODE, log_file=str(log_file),
                     no_window=not window_mode)

    print("=" * 56)
    print(f"  NovelHelper · AI 小说工作站  {APP_VERSION}")
    if store.DEBUG_MODE:
        print("  DEBUG 模式 · 数据与正式版本隔离")
    print("=" * 56)
    print(f"  程序目录 : {store.APP_ROOT}")
    print(f"  运行目录 : {store.RUNTIME_ROOT}")
    print(f"  数据目录 : {store.DATA_DIR}")
    print(f"  日志文件 : {log_file}")
    print(f"  导入目录 : {store.io_in()}")
    print(f"  导出目录 : {store.io_out()}")
    print(f"  访问地址 : {url}")
    if window_mode:
        print("  启动桌面窗口；关闭窗口即停止服务")
    else:
        print("  未创建桌面窗口（--no-window）")

    if not window_mode:
        return _run_service(httpd, log_file)

    runtime = desktop.ServerRuntime(httpd).start()
    try:
        desktop.open_window(url)
    except KeyboardInterrupt:
        print("\n[novelhelper] 已停止。")
    except desktop.WindowError as exc:
        logger.log_warning("APP", "window failed", error=str(exc))
        _error(str(exc), show_dialog=True)
        return 1
    finally:
        _stop_server(httpd, runtime)
        logger.log_event("APP", "stop", log_file=str(log_file))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
