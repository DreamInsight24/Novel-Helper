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
    from novelhelper import server, store  # type: ignore
else:  # pragma: no cover
    from . import server, store


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
    parser.add_argument("--host", default="127.0.0.1", help="监听地址（默认本机）")
    parser.add_argument("--port", type=int, default=8765, help="监听端口（默认 8765）")
    parser.add_argument("--no-browser", action="store_true", help="不自动打开浏览器")
    args = parser.parse_args()

    store.ensure_dirs()
    httpd = server.serve(host=args.host, port=args.port)
    url = f"http://{args.host}:{args.port}/"

    print("=" * 56)
    print("  NovelHelper · AI 小说工作站")
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
        print("\n[studio] 已停止。")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
