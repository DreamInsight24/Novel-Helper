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
novelhelper/revision/plan.py
改稿计划：校验模型给的目标段、裁剪到预算内，并挑出「样例先行」的那一段。
"""
from __future__ import annotations

from ..agent import jsonio

MAX_TARGETS = 40
MAX_TARGET_CHARS = 20000
_MAX_DIRECTION = 200


def normalize_plan(raw: dict, doc, scope_ids: list[str], *,
                   max_targets: int = MAX_TARGETS,
                   max_chars: int = MAX_TARGET_CHARS) -> tuple[dict, list[dict]]:
    raw = jsonio.as_dict(raw)
    scope = [pid for pid in scope_ids if doc.get(pid)]
    scope_set = set(scope)
    warnings: list[dict] = []

    targets: list[dict] = []
    seen: set = set()
    dropped = 0
    for entry in jsonio.as_list(raw.get("targets"))[:200]:
        if not isinstance(entry, dict):
            dropped += 1
            continue
        pid = jsonio.as_str(entry.get("paragraph_id") or entry.get("id"), limit=40)
        if not pid or pid in seen or pid not in scope_set:
            dropped += 1
            continue
        seen.add(pid)
        priority = jsonio.as_str(entry.get("priority"), default="medium", limit=16).lower()
        if priority not in ("high", "medium", "low"):
            priority = "medium"
        targets.append({
            "paragraph_id": pid,
            "direction": jsonio.as_str(entry.get("direction") or entry.get("goal"),
                                       limit=_MAX_DIRECTION) or "按需求优化表达",
            "priority": priority,
        })
    if dropped:
        warnings.append({"code": "plan_dropped", "count": dropped})

    targets.sort(key=lambda item: doc.get(item["paragraph_id"]).index)
    kept: list[dict] = []
    total = 0
    for target in targets:
        chars = doc.get(target["paragraph_id"]).length
        if len(kept) >= max_targets or (kept and total + chars > max_chars):
            continue
        kept.append(target)
        total += chars
    if len(kept) < len(targets):
        warnings.append({"code": "plan_truncated", "count": len(targets) - len(kept)})

    if not kept and jsonio.as_bool(raw.get("need_revision"), True) and scope:
        fallback = sorted(scope, key=lambda pid: doc.get(pid).index)[:3]
        kept = [{"paragraph_id": pid,
                 "direction": jsonio.as_str(raw.get("goal"), limit=_MAX_DIRECTION)
                 or "按需求优化表达",
                 "priority": "medium"} for pid in fallback]
        warnings.append({"code": "plan_fallback", "count": len(kept)})

    target_ids = {target["paragraph_id"] for target in kept}
    no_change = []
    for pid in jsonio.as_list(raw.get("no_change_ids")):
        value = jsonio.as_str(pid, limit=40)
        if value and value in scope_set and value not in target_ids and value not in no_change:
            no_change.append(value)

    plan = {
        "need_revision": bool(kept),
        "style_guide": jsonio.as_str(raw.get("style_guide") or raw.get("style"),
                                     limit=400),
        "targets": kept,
        "preserve": list(dict.fromkeys(
            jsonio.as_str(item, limit=120) for item in jsonio.as_list(raw.get("preserve"))
            if jsonio.as_str(item, limit=120))),
        "forbidden": list(dict.fromkeys(
            jsonio.as_str(item, limit=120) for item in jsonio.as_list(raw.get("forbidden"))
            if jsonio.as_str(item, limit=120))),
        "no_change_ids": no_change,
        "priority": jsonio.as_str(raw.get("priority"), default="medium", limit=16).lower(),
    }
    if plan["priority"] not in ("high", "medium", "low"):
        plan["priority"] = "medium"
    return plan, warnings


def target_ids(plan: dict) -> list[str]:
    return [target["paragraph_id"] for target in (plan or {}).get("targets") or []]


def select_sample(plan: dict, doc) -> str:
    """样例段：优先高优先级、叙述段、长度适中，便于一眼看出风格变化。"""
    targets = list((plan or {}).get("targets") or [])
    if not targets:
        return ""
    high = [target for target in targets if target.get("priority") == "high"]
    pool = high or targets

    def score(target):
        paragraph = doc.get(target["paragraph_id"])
        if paragraph is None:
            return (9, 0)
        type_rank = {"narration": 0, "dialogue": 1, "scene": 2}.get(paragraph.type, 3)
        length_rank = 0 if 80 <= paragraph.length <= 400 else 1
        return (type_rank, length_rank)

    return min(pool, key=score)["paragraph_id"]


def merge_targets(plan: dict, extra_ids: list[str], direction: str = "") -> dict:
    """定向重改：把新增目标并进计划，保持原有方向。"""
    merged = dict(plan or {})
    current = list(merged.get("targets") or [])
    known = {item["paragraph_id"] for item in current}
    for pid in extra_ids:
        if pid in known:
            continue
        current.append({"paragraph_id": pid,
                        "direction": direction or "按审核意见继续修改",
                        "priority": "high"})
        known.add(pid)
    merged["targets"] = current
    return merged


def plan_payload(plan: dict) -> dict:
    plan = plan or {}
    return {
        "need_revision": bool(plan.get("need_revision")),
        "style_guide": plan.get("style_guide") or "",
        "targets": list(plan.get("targets") or []),
        "preserve": list(plan.get("preserve") or []),
        "forbidden": list(plan.get("forbidden") or []),
        "no_change_ids": list(plan.get("no_change_ids") or []),
        "priority": plan.get("priority") or "medium",
    }
