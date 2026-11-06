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
novelhelper/agent/diff.py
文本差异：界面展示、轮次进展检测与取消改回（抖动）检测共用。

字符级 diff 对中文最直观；输出做压缩，避免把整段长文本塞进会话状态。
"""
from __future__ import annotations

import difflib

MAX_DIFF_INPUT = 20000


def _clamp(text: str) -> str:
    text = str(text or "")
    return text if len(text) <= MAX_DIFF_INPUT else text[:MAX_DIFF_INPUT]


def opcodes(old: str, new: str):
    return difflib.SequenceMatcher(
        None, list(_clamp(old)), list(_clamp(new)), autojunk=False).get_opcodes()


def segments(old: str, new: str, *, limit: int = 800) -> list[dict]:
    """返回压缩后的差异段：``{"op": "equal|insert|delete", "text": ...}``。"""
    out: list[dict] = []
    for tag, i1, i2, j1, j2 in opcodes(old, new):
        piece = ""
        if tag == "equal":
            piece = _clamp(old)[i1:i2]
            if len(piece) > limit:
                piece = piece[:limit // 2] + "…" + piece[-limit // 2:]
        elif tag == "delete":
            piece = _clamp(old)[i1:i2][:limit]
        else:
            piece = _clamp(new)[j1:j2][:limit]
        op = "delete" if tag == "delete" else "insert" if tag == "insert" else "equal"
        if tag == "replace":
            # replace 拆成 delete + insert，前端可以并排显示。
            out.append({"op": "delete", "text": _clamp(old)[i1:i2][:limit]})
            out.append({"op": "insert", "text": _clamp(new)[j1:j2][:limit]})
            continue
        if out and out[-1]["op"] == op == "equal":
            merged = out[-1]["text"] + piece
            if len(merged) > limit * 2:
                merged = merged[:limit] + "…" + merged[-limit:]
            out[-1]["text"] = merged
            continue
        out.append({"op": op, "text": piece})
    return out


def stats(old: str, new: str) -> dict:
    added = removed = 0
    for tag, i1, i2, j1, j2 in opcodes(old, new):
        if tag == "insert":
            added += j2 - j1
        elif tag == "delete":
            removed += i2 - i1
        elif tag == "replace":
            removed += i2 - i1
            added += j2 - j1
    return {"added": added, "removed": removed,
            "changed": bool(added or removed), "total": added + removed}


def change_ratio(old: str, new: str) -> float:
    """改动量占比（0~1），用于「diff 极小」判断。"""
    base = max(1, len(str(old or "")) + len(str(new or "")))
    return stats(old, new)["total"] / base


def change_spans(old: str, new: str, *, max_spans: int = 120) -> list[dict]:
    """新文本中被新增/替换的区间（按字符偏移），用于正文高亮。"""
    spans: list[dict] = []
    for tag, i1, i2, j1, j2 in opcodes(old, new):
        if tag in ("insert", "replace") and j2 > j1:
            spans.append({"start": j1, "end": j2})
            if len(spans) >= max_spans:
                break
    return spans


def preview(old: str, new: str, *, limit: int = 240) -> str:
    """单行摘要：``-删除`` / ``+新增`` 片段，便于日志与卡片。"""
    bits = []
    for item in segments(old, new, limit=limit):
        if item["op"] == "delete":
            bits.append("-" + item["text"][:limit // 2])
        elif item["op"] == "insert":
            bits.append("+" + item["text"][:limit // 2])
    return " ".join(bits) if bits else "（无变化）"
