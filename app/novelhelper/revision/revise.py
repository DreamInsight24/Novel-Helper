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
novelhelper/revision/revise.py
第二轮：局部改写 —— 只收目标段的结构化修订。

后处理是这一层的关键：
* 只保留目标段；模型返回其他段或整篇正文时丢弃并告警；
* 校验原段落哈希，模型回传的哈希对不上时拒绝合并；
* 漏段 / 空返回 / JSON 解析失败重试 1 次，仍失败则标记待人工，不阻塞其他段。
"""
from __future__ import annotations

from ..agent import diff, jsonio
from . import prompts

MAX_REVISED_CHARS = 6000


def _canonical_pid(value) -> str:
    text = jsonio.as_str(value, limit=40)
    if text.startswith("p_") and text[2:].isdigit():
        return f"p_{int(text[2:]):03d}"
    return text


def _looks_like_full_text(revised: str, doc, paragraph_id: str) -> bool:
    """粗判模型是否把整篇/多段塞进了目标段。"""
    text = str(revised or "")
    paragraph = doc.get(paragraph_id)
    original = paragraph.text if paragraph else ""
    if not text:
        return False
    if "<target" in text or "<document" in text or "</target>" in text:
        return True
    if "\n\n" in text.strip() and "\n\n" not in original:
        return True
    if len(text) > max(len(original) * 2.5, 2000):
        return True
    if len(text) > len(doc.current_text()):
        return True
    other_texts = [item.text for item in doc.paragraphs
                   if item.paragraph_id != paragraph_id and len(item.text) >= 10]
    return any(other in text for other in other_texts)


def normalize_results(raw, doc, target_ids: list[str]) -> tuple[list[dict], list[dict], list[str]]:
    """按 paragraph_id + original_hash 过滤模型输出。"""
    target_set = set(target_ids)
    results: list[dict] = []
    warnings: list[dict] = []
    seen: set = set()
    for entry in jsonio.as_list(raw):
        if not isinstance(entry, dict):
            warnings.append({"code": "invalid_item"})
            continue
        pid = _canonical_pid(entry.get("paragraph_id") or entry.get("id"))
        if not pid or pid not in target_set or not doc.get(pid):
            warnings.append({"code": "out_of_scope", "paragraph_id": pid,
                             "count": 1})
            continue
        if pid in seen:
            continue
        seen.add(pid)
        paragraph = doc.get(pid)
        expected = jsonio.as_str(entry.get("original_hash"), limit=90)
        if expected and expected != paragraph.hash:
            warnings.append({"code": "hash_mismatch", "paragraph_id": pid})
            continue
        revised = str(entry.get("revised") or "").strip()
        if not revised:
            warnings.append({"code": "empty_revision", "paragraph_id": pid})
            continue
        if len(revised) > MAX_REVISED_CHARS:
            warnings.append({"code": "too_long", "paragraph_id": pid})
            continue
        if _looks_like_full_text(revised, doc, pid):
            warnings.append({"code": "full_text", "paragraph_id": pid})
            continue
        if revised == paragraph.text:
            results.append({
                "paragraph_id": pid,
                "original_hash": paragraph.hash,
                "revised": revised,
                "change_reason": "保持原文",
                "confidence": 1.0,
                "unchanged": True,
            })
            continue
        results.append({
            "paragraph_id": pid,
            "original_hash": paragraph.hash,
            "revised": revised,
            "change_reason": jsonio.as_str(entry.get("change_reason"), limit=160),
            "confidence": jsonio.as_float(entry.get("confidence"), default=0.7),
            "unchanged": False,
        })
    missing = [pid for pid in target_ids if pid not in seen]
    return results, warnings, missing


def revise_targets(llm, *, doc, target_ids: list[str], wish: str, card: dict,
                   plan: dict, feedback: str = "", issues_text: str = "",
                   full_document: bool = False) -> dict:
    """改写一组目标段；返回 ``{results, warnings, missing, manual_ids}``。"""
    results: list[dict] = []
    warnings: list[dict] = []
    missing = list(target_ids)
    manual: list[str] = []
    attempt = 0
    while attempt < 2 and missing:
        system, user = prompts.revise_messages(
            wish=wish, doc=doc, target_ids=missing, card=card, plan=plan,
            feedback=feedback, issues_text=issues_text,
            full_document=full_document and attempt == 0,
            retry_missing=attempt > 0, missing_ids=missing,
        )
        try:
            raw = llm.json(system, user, expect="array")
        except jsonio.ParseError:
            warnings.append({"code": "parse_failed", "attempt": attempt + 1,
                             "count": len(missing)})
            attempt += 1
            continue
        batch, batch_warnings, still_missing = normalize_results(raw, doc, missing)
        results.extend(batch)
        warnings.extend(batch_warnings)
        missing = still_missing
        attempt += 1
    if missing:
        warnings.append({"code": "manual_needed", "paragraph_ids": missing})
        manual = list(missing)
    return {"results": results, "warnings": warnings,
            "missing": missing, "manual_ids": manual}


def sample_payload(doc, paragraph_id: str, revised: str, reason: str,
                   confidence: float) -> dict:
    paragraph = doc.get(paragraph_id)
    original = paragraph.text if paragraph else ""
    return {
        "paragraph_id": paragraph_id,
        "original": original,
        "revised": revised,
        "reason": reason,
        "confidence": confidence,
        "diff": diff.segments(original, revised),
        "stats": diff.stats(original, revised),
    }
