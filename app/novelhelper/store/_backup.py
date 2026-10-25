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

"""Collection snapshot export."""
from __future__ import annotations

from pathlib import Path

from ._collections import load_all_names
from ._directories import io_out
from ._names import stamp
from ._repository import _path

def backup_all() -> Path:
    """把 data/ 下的 JSON 快照到导出目录 backup_<ts>/。"""
    target = io_out() / f"backup_{stamp()}"
    target.mkdir(parents=True, exist_ok=True)
    for name in load_all_names():
        path = _path(name)
        if path.exists():
            (target / path.name).write_bytes(path.read_bytes())
    return target
