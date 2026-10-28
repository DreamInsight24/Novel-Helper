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

"""JSON collection persistence and record cleanup."""
from __future__ import annotations

from ..localization import t

import json
import os
import threading
from pathlib import Path
from typing import Any

from ._defaults import default_for
from ._names import is_section
from ._paths import COLLECTIONS, DATA_DIR, active_novel_id, novel_data_dir

_LOCK = threading.RLock()

def _path(name: str) -> Path:
    if name not in COLLECTIONS and not is_section(name):
        raise KeyError(t('errors.unknown_collection', name=name))
    if name == "config":
        return DATA_DIR / "config.json"
    novel_id = active_novel_id()
    return (novel_data_dir(novel_id) if novel_id else DATA_DIR) / f"{name}.json"

def _deep_default(name: str) -> Any:
    return json.loads(json.dumps(default_for(name), ensure_ascii=False))

def load(name: str) -> Any:
    path = _path(name)
    with _LOCK:
        if not path.exists():
            return _deep_default(name)
        try:
            raw = path.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise RuntimeError(t('errors.not_utf8', file=path.name)) from exc
    if not raw.strip():
        return _deep_default(name)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(t('errors.parse_failed_reason', file=path.name, detail=exc)) from exc

def save(name: str, data: Any) -> Path:
    """原子写入；空值 / 关闭的元素在写盘前统一裁剪，保证 JSON 干净。"""
    if name in ("characters", "factions", "items", "equipment", "other") or is_section(name):
        data = _clean_records(data)
    path = _path(name)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    tmp = path.with_suffix(".json.tmp")
    with _LOCK:
        tmp.write_text(payload + "\n", encoding="utf-8")
        os.replace(tmp, path)
    return path

def _clean_records(data: dict) -> dict:
    """记录集合：丢掉空字符串 / 空列表字段，保持文件干净。"""
    from .. import elements as el

    items = []
    for rec in (data or {}).get("items") or []:
        clean = {}
        for key, value in rec.items():
            if key == "elements":
                normalized = el.normalize(value)
                if normalized:
                    clean["elements"] = normalized
                continue
            if value in ("", None, []):
                continue
            clean[key] = value
        items.append(clean)
    result = {"items": items}
    for key, value in (data or {}).items():
        if key != "items" and value not in ("", None, []):
            result[key] = value
    return result
