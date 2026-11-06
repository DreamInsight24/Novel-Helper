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
novelhelper/agent/jsonio.py
模型结构化输出的容错解析与取值助手（可复用）。
"""
from __future__ import annotations

import json
import re


class ParseError(ValueError):
    """模型输出无法解析为期望的 JSON 结构。"""


def strip_fence(text: str) -> str:
    raw = str(text or "").strip()
    raw = re.sub(r"^```[A-Za-z0-9_-]*\s*", "", raw)
    raw = re.sub(r"\s*```\s*$", "", raw)
    return raw.strip()


def _locate(raw: str, expect: str | None) -> str:
    candidates = []
    if expect == "array":
        candidates = [("[", "]"), ("{", "}")]
    elif expect == "object":
        candidates = [("{", "}"), ("[", "]")]
    else:
        candidates = [("{", "}"), ("[", "]")]
    for opener, closer in candidates:
        start, end = raw.find(opener), raw.rfind(closer)
        if 0 <= start < end:
            return raw[start:end + 1]
    return raw


def parse_json(text: str, *, expect: str | None = None):
    """解析模型输出：允许 Markdown 围栏与前后说明文字。

    expect="object" 时接受 ``[{...}]`` 这种「包了一层数组」的写法；
    expect="array" 时接受 ``{"items": [...]}`` / ``{"revisions": [...]}``。
    """
    raw = strip_fence(text)
    if not raw:
        raise ParseError("empty response")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        located = _locate(raw, expect)
        try:
            data = json.loads(located)
        except json.JSONDecodeError as exc:
            raise ParseError(f"invalid json: {exc}") from exc
    if expect == "object":
        if isinstance(data, list):
            if len(data) == 1 and isinstance(data[0], dict):
                return data[0]
            raise ParseError("expected object, got array")
        if not isinstance(data, dict):
            raise ParseError("expected object")
        return data
    if expect == "array":
        if isinstance(data, dict):
            for key in ("items", "revisions", "results", "paragraphs", "issues", "targets"):
                if isinstance(data.get(key), list):
                    return data[key]
            raise ParseError("expected array, got object")
        if not isinstance(data, list):
            raise ParseError("expected array")
        return data
    return data


def as_dict(value) -> dict:
    return value if isinstance(value, dict) else {}


def as_list(value) -> list:
    return value if isinstance(value, list) else []


def as_str(value, default: str = "", limit: int = 0) -> str:
    text = value.strip() if isinstance(value, str) else ""
    if not text:
        text = str(default or "").strip()
    if limit and len(text) > limit:
        text = text[:limit].rstrip()
    return text


def as_bool(value, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in ("true", "yes", "1", "是"):
            return True
        if lowered in ("false", "no", "0", "否"):
            return False
    return default


def as_float(value, default: float = 0.0, lo: float = 0.0, hi: float = 1.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, number))


def as_int(value, default: int = 0, lo: int | None = None, hi: int | None = None) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default
    if lo is not None:
        number = max(lo, number)
    if hi is not None:
        number = min(hi, number)
    return number


def pick(data: dict, keys: tuple, default=None):
    for key in keys:
        value = (data or {}).get(key)
        if value not in (None, "", [], {}):
            return value
    return default
