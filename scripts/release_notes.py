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

"""Extract one release section from CHANGELOG.md for GitHub Releases."""
from __future__ import annotations

import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHANGELOG = ROOT / "CHANGELOG.md"
DOWNLOAD = """## 下载

Windows 单文件便携版：下载 `NovelHelper.exe`，并用 `NovelHelper.exe.sha256` 校验文件完整性。首次运行需要 Microsoft Edge WebView2 Runtime。
程序未签名，Windows SmartScreen 可能提示“未知发布者”；确认文件来自本仓库 Releases 后可选择“更多信息 → 仍要运行”。

对应源码：https://github.com/DreamInsight24/Novel-Helper/tree/{tag}

## 变更
"""


def version_number(tag: str) -> str:
    tag = tag.strip()
    return tag[1:] if tag.lower().startswith("v") else tag


def extract(tag: str) -> str:
    number = version_number(tag)
    text = CHANGELOG.read_text(encoding="utf-8")
    pattern = re.compile(
        rf"^## \[{re.escape(number)}\][^\n]*\n(.*?)(?=^## \[|\Z)",
        re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(text)
    if not match:
        raise SystemExit(f"CHANGELOG.md 缺少 [{number}] 版本段，无法生成 Release 说明。")
    return match.group(1).strip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("tag", help="tag 或版本号，例如 v2610.3")
    parser.add_argument("--output", default="", help="写入文件；省略时输出到 stdout")
    args = parser.parse_args()
    content = f"# NovelHelper {args.tag}\n\n{DOWNLOAD.format(tag=args.tag)}\n{extract(args.tag)}"
    if args.output:
        Path(args.output).write_text(content, encoding="utf-8")
    else:
        print(content, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
