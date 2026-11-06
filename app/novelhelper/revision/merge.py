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
novelhelper/revision/merge.py
合并校验：按 ``paragraph_id + original_hash`` 落回正文，拒绝版本冲突。

只有哈希与当前段落一致时才替换；不一致说明段落已被别的操作改过，
本次结果作废并告警，绝不在错位的位置上写新文字。
"""
from __future__ import annotations

from ..agent import diff


def apply_results(doc, results: list[dict]) -> tuple[list[dict], list[dict]]:
    changes: list[dict] = []
    warnings: list[dict] = []
    for result in results or []:
        pid = str(result.get("paragraph_id") or "")
        paragraph = doc.get(pid)
        if paragraph is None:
            warnings.append({"code": "hash_mismatch", "paragraph_id": pid})
            continue
        expected = str(result.get("original_hash") or "")
        if expected and expected != paragraph.hash:
            warnings.append({"code": "hash_mismatch", "paragraph_id": pid})
            continue
        before = paragraph.text
        after = str(result.get("revised") or "").strip()
        if not after or after == before:
            continue
        stats = diff.stats(before, after)
        doc.replace(pid, after)
        changes.append({
            "paragraph_id": pid,
            "before": before,
            "after": after,
            "reason": str(result.get("change_reason") or ""),
            "confidence": result.get("confidence", 0.7),
            "stats": stats,
            "diff": diff.segments(before, after),
            "spans": diff.change_spans(before, after),
        })
    return changes, warnings


def cumulative_changes(doc, original_texts: list[str]) -> list[dict]:
    """当前版本相对原文的逐段差异，用于最终确认界面的完整 diff。"""
    changes: list[dict] = []
    for index, paragraph in enumerate(doc.paragraphs):
        before = original_texts[index] if index < len(original_texts) else paragraph.text
        after = paragraph.text
        if before == after:
            continue
        changes.append({
            "paragraph_id": paragraph.paragraph_id,
            "before": before,
            "after": after,
            "reason": "",
            "stats": diff.stats(before, after),
            "diff": diff.segments(before, after),
            "spans": diff.change_spans(before, after),
        })
    return changes


def conflict_count(warnings: list[dict]) -> int:
    return sum(1 for item in warnings or [] if item.get("code") == "hash_mismatch")


def aggregate_warnings(warnings: list[dict]) -> list[dict]:
    """同类告警合并计数，界面只显示一行「已丢弃 N 段」。"""
    grouped: dict[str, dict] = {}
    for warning in warnings or []:
        code = str(warning.get("code") or "unknown")
        item = grouped.setdefault(code, {"code": code, "count": 0, "paragraph_ids": []})
        item["count"] += int(warning.get("count") or 1)
        pid = warning.get("paragraph_id")
        if pid and pid not in item["paragraph_ids"]:
            item["paragraph_ids"].append(pid)
        for pid in warning.get("paragraph_ids") or []:
            if pid not in item["paragraph_ids"]:
                item["paragraph_ids"].append(pid)
    return list(grouped.values())
