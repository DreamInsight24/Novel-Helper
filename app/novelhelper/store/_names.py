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

"""Small storage identifiers that do not read persisted data."""
from __future__ import annotations

import uuid
from datetime import datetime

from ._paths import SECTION_PREFIX

def now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def stamp() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")

def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"

def section_store_name(key: str) -> str:
    return f"{SECTION_PREFIX}{key}"

def section_key(name: str) -> str:
    return name[len(SECTION_PREFIX):] if name.startswith(SECTION_PREFIX) else ""

def is_section(name: str) -> bool:
    key = section_key(name)
    return bool(key) and key.replace("_", "").isalnum() and key.isascii()
