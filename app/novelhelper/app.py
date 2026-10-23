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
    from novelhelper import localization, logger, server, store  # type: ignore
else:  # pragma: no cover
    from . import localization, logger, server, store


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
    except OSError as exc:
        print(f"[错误] 数据目录不可写：{store.DATA_DIR}（{exc}）")
        print("       请把程序放到有写入权限的目录，或设置 NOVELHELPER_HOME。")
        return 1
    print("NovelHelper 安装检查通过。")
    print(f"  网页资源：{store.WEB_DIR}")
    print(f"  数据目录：{store.DATA_DIR}")
    return 0


def main() -> int:
    _prepare_console()
    parser = argparse.ArgumentParser(description="NovelHelper 开源小说创作工具")
    parser.add_argument("--host", default=None, help="监听地址（默认读取配置，初始为 127.0.0.1）")
    parser.add_argument("--port", type=int, default=None, help="监听端口（默认读取配置，初始为 8765）")
    parser.add_argument("--debug", action="store_true", help="开发者调试模式（需通过 app/run.py 启动）")
    parser.add_argument("--no-browser", action="store_true", help="不自动打开浏览器")
    parser.add_argument("--check", action="store_true", help="检查网页资源与数据目录后退出")
    args = parser.parse_args()

    if args.check:
        return _check_install()

    if args.debug and not store.DEBUG_MODE:
        print("[错误] 调试模式必须通过 app/run.py --debug 启动，当前未启用隔离目录。")
        return 2
    store.ensure_dirs()
    log_file = logger.start_session()
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
                     data_dir=str(store.DATA_DIR), version="v2610.1",
                     debug=store.DEBUG_MODE, log_file=str(log_file))

    print("=" * 56)
    print("  NovelHelper · AI 小说工作站  v2610.1")
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
