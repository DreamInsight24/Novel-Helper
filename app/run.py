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

# 源码运行时调试目录在 app/debug；打包后必须放在 exe 同目录，
# 因为 PyInstaller 的单文件程序目录是临时解包目录。
RUNTIME_BASE = (
    Path(sys.executable).resolve().parent
    if getattr(sys, "frozen", False) else APP_DIR
)
DEBUG_HOME = RUNTIME_BASE / "debug"


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
    runtime_base = RUNTIME_BASE.resolve()
    if target.parent != runtime_base or target.name != "debug":
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
