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

import json
import re
from datetime import datetime
from pathlib import Path

from ..localization import t
from ..store import out_dir, plan_dir, stamp, txt_dir
from ._paths import rel_str, safe_rel
from ._text import clean_blank_lines, md_to_txt, merge_intra_paragraph_breaks

# Sidecar stored beside the chapter files. It only records display order, so
# renaming/reordering never changes chapter text or breaks external editors.
CHAPTER_ORDER_FILE = ".chapters.json"
_CHAPTER_SUFFIXES = {".md", ".txt"}
_WINDOWS_RESERVED = {
    "CON", "PRN", "AUX", "NUL",
    *[f"COM{i}" for i in range(1, 10)],
    *[f"LPT{i}" for i in range(1, 10)],
}


def _chapter_stem(name: str) -> str:
    """Turn a user-supplied chapter name into a safe file stem."""
    title = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", str(name or "")).strip(" .")
    title = re.sub(r"\.(txt|md)$", "", title, flags=re.IGNORECASE)[:120].strip(" .")
    if title.upper() in _WINDOWS_RESERVED:
        title = "_" + title
    return title


def _chapter_order_path(base: Path) -> Path:
    return base / CHAPTER_ORDER_FILE


def _chapter_key(path: Path, base: Path) -> str:
    try:
        return path.resolve().relative_to(base.resolve()).as_posix()
    except ValueError:
        return rel_str(path)


def _load_chapter_order(base: Path) -> list[str]:
    try:
        data = json.loads(_chapter_order_path(base).read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError, ValueError, UnicodeDecodeError):
        return []
    items = data.get("paths") if isinstance(data, dict) else data
    if not isinstance(items, list):
        return []
    return [str(item) for item in items if str(item or "").strip()]


def _write_chapter_order(base: Path, keys: list[str]) -> None:
    base.mkdir(parents=True, exist_ok=True)
    seen: set[str] = set()
    clean = []
    for key in keys:
        value = str(key or "").strip().replace("\\", "/")
        if value and value not in seen:
            seen.add(value)
            clean.append(value)
    target = _chapter_order_path(base)
    temporary = target.with_suffix(target.suffix + ".tmp")
    temporary.write_text(json.dumps({"version": 1, "paths": clean}, ensure_ascii=False, indent=2) + "\n",
                         encoding="utf-8")
    temporary.replace(target)


def _prepend_chapter_order(path: Path, base: Path) -> None:
    """New chapters appear first once the user has established an explicit order."""
    order = _load_chapter_order(base)
    if not order:
        return
    key = _chapter_key(path, base)
    _write_chapter_order(base, [key, *[item for item in order if item != key]])


def _resolve_chapter(path: str | Path, base: Path) -> Path:
    target = Path(path)
    if not target.is_absolute():
        target = safe_rel(str(path))
    target = target.resolve()
    if not target.is_relative_to(base.resolve()):
        raise PermissionError(t("errors.path_outside", path=str(path)))
    if target.suffix.lower() not in _CHAPTER_SUFFIXES:
        raise ValueError(t("errors.chapter_file_type"))
    if not target.is_file():
        raise FileNotFoundError(str(path))
    return target


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


def write_chapter(content: str, name: str) -> Path:
    title = _chapter_stem(name) or "chapter"
    directory = out_dir()
    directory.mkdir(parents=True, exist_ok=True)
    number = 1
    while True:
        target = directory / (title + (f' ({number})' if number > 1 else '') + '.txt')
        try:
            with target.open('x', encoding='utf-8') as output:
                output.write(content)
            _prepend_chapter_order(target, directory)
            return target
        except FileExistsError:
            number += 1


def rename_chapter(path: str | Path, name: str) -> Path:
    """Rename one chapter file in place and preserve its position in the bar."""
    base = out_dir()
    source = _resolve_chapter(path, base)
    stem = _chapter_stem(name)
    if not stem:
        from ..localization import t
        raise ValueError(t("errors.chapter_name_required"))
    target = source.with_name(stem + source.suffix.lower())
    if target == source:
        return source
    if target.exists():
        from ..localization import t
        raise ValueError(t("errors.chapter_exists", name=target.name))
    # Freeze the current visual order before renaming; otherwise the file's
    # fresh mtime would silently move it to the top on the next listing.
    before = _current_chapter_keys(base)
    source_key = _chapter_key(source, base)
    target_key = _chapter_key(target, base)
    source.rename(target)
    keys = [target_key if key == source_key else key for key in before]
    if target_key not in keys:
        keys.insert(0, target_key)
    _write_chapter_order(base, keys)
    return target


def reorder_chapters(paths: list[str | Path]) -> list[dict]:
    """Persist the chapter display order; paths not mentioned keep their old order."""
    base = out_dir()
    wanted: list[str] = []
    for item in paths or []:
        try:
            source = _resolve_chapter(item, base)
        except (FileNotFoundError, PermissionError, ValueError):
            continue
        key = _chapter_key(source, base)
        if key not in wanted:
            wanted.append(key)
    if not wanted:
        return list_chapters()
    existing = _current_chapter_keys(base)
    keys = wanted + [key for key in existing if key not in wanted]
    _write_chapter_order(base, keys)
    return list_chapters()


def _entry_chapter_key(entry: dict, base: Path) -> str:
    path = Path(entry["path"])
    if not path.is_absolute():
        path = safe_rel(entry["path"])
    return _chapter_key(path, base)


def _current_chapter_keys(base: Path) -> list[str]:
    return [_entry_chapter_key(entry, base) for entry in list_chapters()]


def next_chapter_number() -> int:
    """下一个章节序号：读取输出目录里已有章节的编号前缀，从 1 开始。"""
    import re

    highest = 0
    for entry in list_chapters():
        match = re.match(r"^(\d+)", entry.get("name") or "")
        if match:
            highest = max(highest, int(match.group(1)))
    return highest + 1


def write_auto_chapter(content: str, title: str = "") -> Path:
    """把一次完整写作的结果落成新章节：`003-章节名.txt`。"""
    name = " ".join(str(title or "").split())[:40] or f"chapter_{stamp()}"
    return write_chapter(content, f"{next_chapter_number():03d}-{name}")


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
    order = _load_chapter_order(base)
    if order:
        rank = {key: index for index, key in enumerate(order)}
        decorated = [(entry, _entry_chapter_key(entry, base)) for entry in entries]
        decorated.sort(key=lambda pair: (
            (0, rank[pair[1]], 0) if pair[1] in rank else (1, 0, -pair[0]["ts"])
        ))
        entries = [entry for entry, _ in decorated]
    return entries
