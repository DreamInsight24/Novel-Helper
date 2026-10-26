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

"""Configurable workspace and log directories."""
from __future__ import annotations

from pathlib import Path

from ._paths import (
    DEBUG_MODE, DEFAULT_LOG_DIR, FROZEN, PROJECT_ROOT, RUNTIME_ROOT, _root,
    active_novel_id, novel_workspace_dir,
)
from ._repository import load


def _workspace(rel: str) -> Path:
    """Resolve a configured workspace path inside the active novel namespace."""
    value = Path(str(rel or ""))
    novel_id = active_novel_id()
    if not novel_id:
        # Keep the pre-workshelf behavior for the no-active-novel bootstrap
        # and existing development smoke tests.
        if value.is_absolute() or value.drive or str(rel).startswith(("\\\\", "/")):
            return _root(value)
        if value.parts and value.parts[0].lower() != "workspace":
            value = Path("workspace") / value
        return _root(value)
    if value.is_absolute() or value.drive or str(rel).startswith(("\\\\", "/")):
        raise PermissionError("workspace paths must be relative")
    # Existing defaults used workspace/<name>; inside a novel that prefix is
    # already supplied by novel_workspace_dir().
    parts = value.parts
    if parts and parts[0].lower() == "workspace":
        value = Path(*parts[1:])
    base = novel_workspace_dir(novel_id).resolve()
    target = (base / value).resolve()
    try:
        target.relative_to(base)
    except ValueError as exc:
        raise PermissionError("workspace path escapes novel directory") from exc
    return target

def io_in() -> Path:
    value = load("config").get("paths", {}).get("import_dir", "import")
    return _workspace(value)

def io_out() -> Path:
    value = load("config").get("paths", {}).get("export_dir", "export")
    return _workspace(value)

def out_dir() -> Path:
    value = load("config").get("paths", {}).get("output_dir", "output")
    return _workspace(value)

def plan_dir() -> Path:
    value = load("config").get("paths", {}).get("plan_dir", "output/plan")
    return _workspace(value)

def txt_dir() -> Path:
    value = load("config").get("paths", {}).get("txt_dir", "output/txt")
    return _workspace(value)

def text_dir() -> Path:
    """稿件处理工作区的独立文件夹。"""
    value = load("config").get("paths", {}).get("text_dir", "text")
    return _workspace(value)

def log_dir() -> Path:
    """本地日志目录。"""
    value = load("config").get("paths", {}).get("log_dir", DEFAULT_LOG_DIR)
    if (DEBUG_MODE or FROZEN) and value == "../log":
        value = "log"
    return _root(value)
