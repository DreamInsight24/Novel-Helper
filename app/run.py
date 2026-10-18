#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NovelHelper 启动入口。

    python app/run.py
    python app/run.py --debug
    python app/run.py --debug --port 8766
    python app/run.py --clean-debug
"""
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

DEBUG_HOME = APP_DIR / "debug"


def prepare_console() -> None:
    try:
        if os.name == "nt":
            import ctypes

            ctypes.windll.kernel32.SetConsoleOutputCP(65001)  # type: ignore[attr-defined]
            ctypes.windll.kernel32.SetConsoleCP(65001)  # type: ignore[attr-defined]
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:
        pass


def clean_debug() -> int:
    target = DEBUG_HOME.resolve()
    app_root = APP_DIR.resolve()
    if target.parent != app_root:
        print(f"[错误] 拒绝清理非 debug 目录：{target}")
        return 1
    files = sum(1 for path in target.rglob("*") if path.is_file()) if target.exists() else 0
    if target.exists():
        shutil.rmtree(target)
    print(f"[完成] 已清理调试模式文件：{target}（{files} 个文件）")
    return 0


if __name__ == "__main__":
    prepare_console()
    args = sys.argv[1:]
    if "--clean-debug" in args or "--reset-debug" in args:
        raise SystemExit(clean_debug())
    if "--debug" in args:
        os.environ["NOVELHELPER_DEBUG"] = "1"
        os.environ["NOVELHELPER_HOME"] = str(DEBUG_HOME)
        os.environ["NOVELHELPER_DATA"] = str(DEBUG_HOME / "data")

    from novelhelper.app import main  # noqa: E402

    raise SystemExit(main())
