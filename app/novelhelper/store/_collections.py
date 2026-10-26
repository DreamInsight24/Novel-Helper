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

"""Collection enumeration and schema lookup."""
from __future__ import annotations

from ._names import is_section, section_store_name
from ._paths import COLLECTIONS, active_novel_id
from ._repository import load

def section_names() -> list:
    """当前启用的栏目对应的存储名。"""
    out = []
    for item in (load("sections").get("items") or []):
        key = (item.get("key") or "").strip()
        if key and item.get("on", True) is not False:
            out.append(section_store_name(key))
    return out

def load_all() -> dict:
    names = list(COLLECTIONS)
    for name in section_names():
        if name not in names:
            names.append(name)
    result = {name: load(name) for name in names}
    if "config" in result and active_novel_id():
        from ._novels import current_config
        result["config"] = current_config()
    return result

def load_all_names() -> list:
    names = list(COLLECTIONS)
    for name in section_names():
        if name not in names:
            names.append(name)
    return names

def schema_for(name: str) -> list:
    schema = load("schema")
    entry = schema.get(name) or {}
    return entry.get("elements") or []

def known_collection(name: str) -> bool:
    return name in COLLECTIONS or is_section(name)
