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

"""Runtime anchors, paths, and storage collection names."""
from __future__ import annotations

import os
import json
import re
import sys
from pathlib import Path

from ..localization import t

FROZEN = bool(getattr(sys, "frozen", False))

STUDIO_DIR = Path(__file__).resolve().parent.parent

APP_ROOT = (
    Path(sys.executable).resolve().parent
    if FROZEN else STUDIO_DIR.parent
)

REPO_ROOT = APP_ROOT.parent

WEB_DIR = STUDIO_DIR / "web"

DEBUG_MODE = os.environ.get("NOVELHELPER_DEBUG") == "1"

DEFAULT_LOG_DIR = "log" if (DEBUG_MODE or FROZEN) else "../log"

_DEFAULT_RUNTIME = (APP_ROOT / "debug") if DEBUG_MODE else APP_ROOT

RUNTIME_ROOT = Path(os.environ.get("NOVELHELPER_HOME") or _DEFAULT_RUNTIME)

PROJECT_ROOT = RUNTIME_ROOT

DATA_DIR = Path(os.environ.get("NOVELHELPER_DATA") or (RUNTIME_ROOT / "data"))
NOVELS_DIR = DATA_DIR / "novels"
WORKSPACE_ROOT = PROJECT_ROOT / "workspace"
NOVEL_WORKSPACES_DIR = WORKSPACE_ROOT / "novels"

_NOVEL_ID_RE = re.compile(r"^[a-z0-9_-]{1,80}$")

COLLECTIONS = (
    "config",
    "modes",
    "schema",
    "state",
    "sections",
    "characters",
    "factions",
    "items",
    "equipment",
    "other",
    "memories",
    "worldmap",
    "meta",
    "history",
)

RECORD_COLLECTIONS = ("characters", "factions", "items", "equipment", "other", "memories")

SECTION_PREFIX = "section_"


def data_dir() -> Path:
    return DATA_DIR


def validate_novel_id(novel_id: str) -> str:
    """Validate a server-generated novel id before it becomes a path segment."""
    value = str(novel_id or "")
    if not _NOVEL_ID_RE.fullmatch(value):
        raise ValueError("invalid novel id")
    return value


def novel_data_dir(novel_id: str) -> Path:
    value = validate_novel_id(novel_id)
    return NOVELS_DIR / value


def novel_workspace_dir(novel_id: str) -> Path:
    value = validate_novel_id(novel_id)
    return NOVEL_WORKSPACES_DIR / value


def active_novel_id() -> str:
    """Read the active id without going through collection loading."""
    path = DATA_DIR / "config.json"
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError, ValueError, UnicodeDecodeError):
        return ""
    value = raw.get("active_novel_id") if isinstance(raw, dict) else ""
    try:
        return validate_novel_id(value) if value else ""
    except ValueError:
        return ""

def _root(rel: str | Path) -> Path:
    path = Path(rel)
    target = path if path.is_absolute() else (PROJECT_ROOT / path)
    if DEBUG_MODE:
        try:
            target.resolve().relative_to(RUNTIME_ROOT.resolve())
        except ValueError as exc:
            raise PermissionError(t("errors.debug_path", root=RUNTIME_ROOT, path=rel)) from exc
    return target

