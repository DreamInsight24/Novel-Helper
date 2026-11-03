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

"""Project-relative path resolution and basic text I/O."""
from __future__ import annotations

from ..localization import t

from pathlib import Path
import os
import shutil
import tempfile

from ..store import PROJECT_ROOT


def in_project(path: Path) -> bool:
    try:
        Path(path).resolve().relative_to(PROJECT_ROOT)
        return True
    except ValueError:
        return False


def rel_str(path: Path) -> str:
    """能在项目内就返回相对路径，否则返回绝对路径（目录可以被配置到项目外）。"""
    try:
        return Path(path).relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return str(path)


def safe_rel(rel: str) -> Path:
    """把相对路径解析到项目内，越界直接拒绝。"""
    target = (PROJECT_ROOT / str(rel).replace("\\", "/").lstrip("/")).resolve()
    if not in_project(target):
        raise PermissionError(t('errors.path_outside', path=rel))
    return target


def read_text(path: str | Path, encoding: str = "utf-8") -> str:
    target = Path(path)
    if not target.is_absolute():
        target = safe_rel(str(path))
    if not target.exists():
        raise FileNotFoundError(str(path))
    return target.read_text(encoding=encoding, errors="replace")


def write_text(path: str | Path, content: str, encoding: str = "utf-8") -> Path:
    target = Path(path)
    if not target.is_absolute():
        target = safe_rel(str(path))
    target.parent.mkdir(parents=True, exist_ok=True)
    backup = target.with_name(target.name + ".bak")
    if target.exists():
        shutil.copy2(target, backup)
    descriptor, temporary = tempfile.mkstemp(prefix=".write-", dir=target.parent)
    try:
        with os.fdopen(descriptor, "w", encoding=encoding) as stream:
            stream.write(content)
        os.replace(temporary, target)
    finally:
        Path(temporary).unlink(missing_ok=True)
    return target


def write_numbered(path: str | Path, content: str, encoding: str = "utf-8") -> Path:
    """Write a new file using exclusive creation, numbering existing names."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    index = 0
    while True:
        candidate = target if not index else target.with_name(f"{target.stem}_{index}{target.suffix}")
        try:
            stream = candidate.open("x", encoding=encoding)
        except FileExistsError:
            index += 1
            continue
        try:
            with stream:
                stream.write(content)
        except BaseException:
            candidate.unlink(missing_ok=True)
            raise
        return candidate
