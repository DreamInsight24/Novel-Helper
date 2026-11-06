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

"""
novelhelper/revision/summary.py
稳定摘要：文风、人物、称呼、时间线、禁忌、用户偏好。

只追加、不重写：每一轮新增的事实都以条目形式追加，避免模型每轮重新总结
导致文风与人设漂移。旧条目永远保留，界面可以按类别筛选。
"""
from __future__ import annotations

import time

from ..agent import jsonio

KINDS = ("style", "character", "naming", "timeline", "taboo", "preference")
MAX_ITEMS = 200
MAX_TEXT = 240


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def normalize_items(raw, *, source: str = "model") -> list[dict]:
    items = []
    for entry in jsonio.as_list(raw)[:40]:
        if isinstance(entry, str):
            kind, text = "preference", entry
        elif isinstance(entry, dict):
            kind = jsonio.as_str(entry.get("kind"), default="preference").lower()
            text = jsonio.as_str(entry.get("text"), limit=MAX_TEXT)
        else:
            continue
        if kind not in KINDS:
            kind = "preference"
        text = text.strip()
        if not text:
            continue
        items.append({"kind": kind, "text": text, "source": source, "created": _now()})
    return items


def append(summary: list, items: list, *, source: str = "model") -> tuple[list, int]:
    """追加条目；完全相同的条目只保留最早一条。"""
    summary = list(summary or [])
    existing = {(item.get("kind"), item.get("text")) for item in summary
                if isinstance(item, dict)}
    added = 0
    for item in normalize_items(items, source=source):
        key = (item["kind"], item["text"])
        if key in existing:
            continue
        existing.add(key)
        summary.append(item)
        added += 1
    return summary[-MAX_ITEMS:], added


def render(summary: list) -> str:
    grouped: dict[str, list[str]] = {}
    for item in summary or []:
        if not isinstance(item, dict):
            continue
        grouped.setdefault(str(item.get("kind") or "preference"), []).append(
            str(item.get("text") or ""))
    labels = {
        "style": "文风", "character": "人物", "naming": "称呼",
        "timeline": "时间线", "taboo": "禁忌", "preference": "用户偏好",
    }
    lines = []
    for kind in KINDS:
        texts = [text for text in grouped.get(kind, []) if text]
        if texts:
            unique = list(dict.fromkeys(texts))
            lines.append(f"- {labels.get(kind, kind)}：" + "；".join(unique[-8:]))
    return "\n".join(lines)


def seed(db: dict | None, *, chapter: str = "") -> list[dict]:
    """从作品现有数据里提炼少量稳定事实（人物、势力、最近记忆）。

    只是种子：识别不出时返回空表，由第一轮的模型补充。
    """
    db = db or {}
    items: list[dict] = []

    def names(collection: str, label: str, kind: str, limit: int = 12):
        records = ((db.get(collection) or {}).get("items")) or []
        values = [str(rec.get("name") or "").strip() for rec in records
                  if isinstance(rec, dict)]
        values = [value for value in values if value][:limit]
        if values:
            items.append({"kind": kind, "text": f"{label}：{'、'.join(values)}"})

    names("characters", "人物", "character")
    names("factions", "势力", "character", limit=8)
    memories = ((db.get("memories") or {}).get("items")) or []
    for record in memories[-3:]:
        if not isinstance(record, dict):
            continue
        title = str(record.get("title") or "").strip()
        content = str(record.get("content") or "").strip().replace("\n", " ")
        if title:
            items.append({"kind": "timeline",
                          "text": f"{title}：{content[:90]}" if content else title})
    if chapter:
        items.append({"kind": "timeline", "text": f"本次修订范围：{chapter}"})
    return normalize_items(items, source="seed")
