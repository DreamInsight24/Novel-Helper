#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
novelhelper/app.py
应用入口。

用法:
    python app/run.py                    # 启动并自动打开浏览器
    python app/run.py --port 9000        # 指定端口
    python app/run.py --no-browser       # 不自动打开浏览器
"""
from __future__ import annotations

import argparse
import sys
import threading
import webbrowser
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from novelhelper import logger, server, store  # type: ignore
else:  # pragma: no cover
    from . import logger, server, store


def _prepare_console() -> None:
    try:
        if sys.platform.startswith("win"):
            import ctypes

            ctypes.windll.kernel32.SetConsoleOutputCP(65001)  # type: ignore[attr-defined]
            ctypes.windll.kernel32.SetConsoleCP(65001)  # type: ignore[attr-defined]
    except Exception:
        pass
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        except Exception:
            pass


def main() -> int:
    _prepare_console()
    parser = argparse.ArgumentParser(description="NovelHelper 开源小说创作工具")
    parser.add_argument("--host", default=None, help="监听地址（默认读取配置，初始为 127.0.0.1）")
    parser.add_argument("--port", type=int, default=None, help="监听端口（默认读取配置，初始为 8765）")
    parser.add_argument("--no-browser", action="store_true", help="不自动打开浏览器")
    args = parser.parse_args()

    store.ensure_dirs()
    cfg = store.load("config")
    server_cfg = cfg.get("server") or {}
    host = args.host or server_cfg.get("host") or "127.0.0.1"
    try:
        port = int(args.port if args.port is not None else server_cfg.get("port") or 8765)
    except (TypeError, ValueError):
        port = 8765
    if not 1 <= port <= 65535:
        print(f"[警告] 配置端口 {port} 不合法，已改用 8765。")
        port = 8765
    url = f"http://{host}:{port}/"

    try:
        httpd = server.serve(host=host, port=port)
    except OSError as exc:
        logger.log_warning("APP", "start failed", host=host, port=port, error=str(exc))
        print(f"[错误] 端口 {port} 无法使用：{exc}")
        print("       可以在「模型设置 → 应用」中修改端口，或使用 --port 临时指定。")
        return 1
    logger.log_event("APP", "start", host=host, port=port,
                     data_dir=str(store.DATA_DIR), version="v2610.1")

    print("=" * 56)
    print("  NovelHelper · AI 小说工作站  v2610.1")
    print("=" * 56)
    print(f"  程序目录 : {store.APP_ROOT}")
    print(f"  数据目录 : {store.DATA_DIR}")
    print(f"  导入目录 : {store.io_in()}")
    print(f"  导出目录 : {store.io_out()}")
    print(f"  访问地址 : {url}")
    print("  关闭窗口或按 Ctrl+C 结束服务")
    print("=" * 56)

    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[novelhelper] 已停止。")
    finally:
        httpd.server_close()
        logger.log_event("APP", "stop", host=host, port=port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
