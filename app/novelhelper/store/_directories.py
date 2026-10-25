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

from ._paths import DEBUG_MODE, DEFAULT_LOG_DIR, FROZEN, PROJECT_ROOT, RUNTIME_ROOT, _root
from ._repository import load

def io_in() -> Path:
    return _root(load("config").get("paths", {}).get("import_dir", "workspace/import"))

def io_out() -> Path:
    return _root(load("config").get("paths", {}).get("export_dir", "workspace/export"))

def out_dir() -> Path:
    return _root(load("config").get("paths", {}).get("output_dir", "workspace/output"))

def plan_dir() -> Path:
    return _root(load("config").get("paths", {}).get("plan_dir", "workspace/output/plan"))

def txt_dir() -> Path:
    return _root(load("config").get("paths", {}).get("txt_dir", "workspace/output/txt"))

def text_dir() -> Path:
    """稿件处理工作区的独立文件夹。"""
    return _root(load("config").get("paths", {}).get("text_dir", "workspace/text"))

def log_dir() -> Path:
    """本地日志目录。"""
    value = load("config").get("paths", {}).get("log_dir", DEFAULT_LOG_DIR)
    if (DEBUG_MODE or FROZEN) and value == "../log":
        value = "log"
    return _root(value)
