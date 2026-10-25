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

"""删除 NovelHelper 生成的本地数据、产出与日志目录。

仅命令行使用：python app/reset.py
"""
import shutil
import sys
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
ROOT_DIR = APP_DIR.parent

TARGETS = [
    APP_DIR / "data",
    APP_DIR / "workspace",
    APP_DIR / "log",
    APP_DIR / "debug",
    ROOT_DIR / "log",
    ROOT_DIR / "build",
    ROOT_DIR / "dist",
]


def main() -> int:
    existing = [p for p in TARGETS if p.exists()]

    print("将删除以下目录：")
    for p in TARGETS:
        suffix = "" if p in existing else "（不存在，跳过）"
        print(f"  {p}{suffix}")

    if not existing:
        print("没有需要删除的内容。")
        return 0

    answer = input("确认删除？[y/N] ").strip().lower()
    if answer not in ("y", "yes"):
        print("已取消。")
        return 1

    failed = False
    for p in existing:
        try:
            shutil.rmtree(p)
            print(f"已删除 {p}")
        except OSError as exc:
            failed = True
            print(f"删除失败 {p}: {exc}", file=sys.stderr)

    if failed:
        print("部分目录删除失败，请先关闭 NovelHelper 再重试。", file=sys.stderr)
        return 1

    print("完成。下次启动会重新生成本地数据目录。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())