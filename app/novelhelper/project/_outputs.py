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

"""Writing outputs, plans, converted text, and chapter listings."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

from ..store import out_dir, plan_dir, stamp, txt_dir
from ._paths import rel_str, safe_rel
from ._text import clean_blank_lines, md_to_txt, merge_intra_paragraph_breaks


def write_output(content: str, mode_label: str = "AI 工作站生成", name: str = "") -> Path:
    target_dir = out_dir()
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = name or f"out_{stamp()}.md"
    if not filename.endswith(".md"):
        filename += ".md"
    header = (
        "# 小说创作输出\n\n"
        f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        f"模式: {mode_label}\n\n"
        "---\n\n"
    )
    target = target_dir / filename
    target.write_text(header + content, encoding="utf-8")
    return target


def write_plan(content: str, chapter: str = "") -> Path:
    """写作计划，按新规矩用 .txt。"""
    target_dir = plan_dir()
    target_dir.mkdir(parents=True, exist_ok=True)
    suffix = f"_{chapter}" if chapter else ""
    target = target_dir / f"plan_{stamp()}{suffix}.txt"
    header = (
        "写作前逻辑推理与剧情梗概\n"
        f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        f"章节: {chapter or '（未命名）'}\n"
        + "-" * 40 + "\n\n"
    )
    target.write_text(header + content, encoding="utf-8")
    return target


def write_txt_from_md(rel_md: str, blank_mode: str = "compact", keep_advice: bool = False) -> Path:
    src = Path(rel_md)
    if not src.is_absolute():
        src = safe_rel(rel_md)
    body = md_to_txt(src.read_text(encoding="utf-8", errors="replace"), keep_advice, blank_mode)
    target_dir = txt_dir() if src.parent == out_dir() else (src.parent / "txt")
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / (src.stem + ".txt")
    target.write_text(body + "\n", encoding="utf-8")
    return target


def list_chapters() -> list:
    base = out_dir()
    if not base.exists():
        return []
    found = []
    for pattern in ("*.md", "*.txt", "txt/*.txt", "plan/*.txt", "apart/*/*.md", "apart/*/*.txt"):
        found.extend(base.glob(pattern))
    entries = []
    for path in found:
        stat = path.stat()
        entries.append({
            "path": rel_str(path),
            "name": path.name,
            "dir": rel_str(path.parent),
            "size": stat.st_size,
            "mtime": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
            "ts": stat.st_mtime,
        })
    entries.sort(key=lambda e: e["ts"], reverse=True)
    return entries
