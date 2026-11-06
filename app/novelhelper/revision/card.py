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
novelhelper/revision/card.py
需求卡：把「许愿式」输入整理成结构化需求，并保证最多只追问 1 个带选项的问题。
"""
from __future__ import annotations

import re

from ..agent import jsonio
from ..localization import t

DEFAULT_STYLE = "保留剧情事实与人物称呼，只优化表达"
DEFAULT_PRESERVE = ("人物称呼", "关键设定", "剧情事实")
DEFAULT_FORBIDDEN = ("改变剧情事实", "新增人物")
DEFAULT_QUESTION_KEY = "direction"

_KEYS = ("goal", "style", "style_guide", "preserve", "forbidden", "priority",
         "targets", "no_change_ids", "summary", "question", "need_revision", "scope")

_DIRECT_ACCEPT = re.compile(
    r"(直接改|直接应用|直接接受|不用确认|无需确认|不要确认|别问我|不用问|"
    r"全部改|一次性改|直接开始|"
    r"\bdirect(?:ly)?\b|\bno confirm\b|\bdon'?t ask\b|\bjust do it\b|"
    r"\bapply (?:it )?(?:all|directly)\b)", re.IGNORECASE)


def wants_direct_accept(wish: str) -> bool:
    """用户明确说「直接改 / 不用确认」时，跳过逐步确认。"""
    return bool(_DIRECT_ACCEPT.search(str(wish or "")))


def _strings(value, *, limit: int = 20) -> list[str]:
    if isinstance(value, str):
        value = [value]
    out = []
    for item in jsonio.as_list(value):
        text = jsonio.as_str(item, limit=120)
        if text and text not in out:
            out.append(text)
        if len(out) >= limit:
            break
    return out


def normalize_question(raw) -> dict | None:
    """只接受「1 个问题 + 至少 2 个选项」；不满足就丢弃，避免开放式追问。"""
    if not isinstance(raw, dict):
        return None
    text = jsonio.as_str(raw.get("text") or raw.get("question"), limit=160)
    if not text:
        return None
    options = []
    for index, item in enumerate(jsonio.as_list(raw.get("options"))[:6]):
        if isinstance(item, str):
            label = jsonio.as_str(item, limit=40)
            option_id = f"opt{index + 1}"
        elif isinstance(item, dict):
            label = jsonio.as_str(item.get("label") or item.get("text"), limit=40)
            option_id = jsonio.as_str(item.get("id"), limit=40) or f"opt{index + 1}"
        else:
            continue
        if label:
            options.append({"id": option_id, "label": label})
    if len(options) < 2:
        return None
    return {
        "key": jsonio.as_str(raw.get("key"), limit=40) or DEFAULT_QUESTION_KEY,
        "text": text,
        "options": options,
    }


def normalize_card(raw: dict, *, wish: str, scope_ids: list[str],
                   scope_kind: str, sample_first: bool = True,
                   max_rounds: int = 5) -> tuple[dict, dict | None]:
    raw = jsonio.as_dict(raw)
    goal = jsonio.as_str(raw.get("goal"), default=wish, limit=160)
    style = jsonio.as_str(raw.get("style"), default=DEFAULT_STYLE, limit=200)
    card = {
        "scope": {
            "paragraph_ids": list(scope_ids[:40]),
            "default": "selection" if scope_kind == "selection" else "current_chapter",
        },
        "goal": goal or DEFAULT_STYLE,
        "style": style,
        "style_guide": jsonio.as_str(raw.get("style_guide"), default=style, limit=400),
        "preserve": _strings(raw.get("preserve")) or list(DEFAULT_PRESERVE),
        "forbidden": _strings(raw.get("forbidden")) or list(DEFAULT_FORBIDDEN),
        "priority": jsonio.as_str(raw.get("priority"), default="medium", limit=16).lower(),
        "sample_first": bool(sample_first),
        "max_rounds": int(max(1, min(5, int(max_rounds or 5)))),
        "targets": [],
        "no_change_ids": [],
        "source": "agent",
    }
    if card["priority"] not in ("high", "medium", "low"):
        card["priority"] = "medium"
    question = normalize_question(raw.get("question"))
    if question and not card["sample_first"]:
        question = None
    return card, question


def merge_increment(card: dict, new_card: dict) -> dict:
    """增量需求：沿用旧卡，追加目标与保留/禁止项，不推翻已确认内容。"""
    merged = dict(card or {})
    for key in ("preserve", "forbidden"):
        values = list(merged.get(key) or [])
        for item in new_card.get(key) or []:
            if item not in values:
                values.append(item)
        merged[key] = values
    goal = jsonio.as_str(new_card.get("goal"))
    if goal and goal != merged.get("goal"):
        merged["goal"] = f"{merged.get('goal') or ''}；{goal}".strip("；")
    if new_card.get("style_guide"):
        merged["style_guide"] = new_card["style_guide"]
        merged["style"] = new_card.get("style") or merged.get("style")
    merged["priority"] = new_card.get("priority") or merged.get("priority") or "medium"
    return merged


def preview(card: dict, *, scope_label: str, scope_count: int) -> str:
    return t(
        "revision.card_preview",
        scope=scope_label,
        count=scope_count,
        goal=card.get("goal") or DEFAULT_STYLE,
        style=card.get("style") or DEFAULT_STYLE,
        preserve="、".join(card.get("preserve") or DEFAULT_PRESERVE),
    )


def card_payload(card: dict) -> dict:
    """返回给前端的卡片：只保留可展示字段。"""
    return {
        "goal": card.get("goal") or "",
        "style": card.get("style") or "",
        "preserve": list(card.get("preserve") or []),
        "forbidden": list(card.get("forbidden") or []),
        "priority": card.get("priority") or "medium",
        "sample_first": bool(card.get("sample_first")),
        "max_rounds": int(card.get("max_rounds") or 5),
        "scope": card.get("scope") or {},
    }
