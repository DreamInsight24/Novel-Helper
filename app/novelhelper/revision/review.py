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
novelhelper/revision/review.py
第三轮：分层审核（局部 / 一致性 / 全局）。

审核必须返回结构化问题清单与 next_instruction；系统把这两项拼进下一轮
局部改写的提示词，形成「审核 → 定向重改」的闭环，而不是只给一个通过/不通过。
"""
from __future__ import annotations

from ..agent import jsonio
from . import prompts

TYPES = ("style", "consistency", "requirement", "quality")
LAYERS = ("local", "consistency", "global")


def _normalize_issue(entry, doc) -> dict | None:
    if not isinstance(entry, dict):
        return None
    problem = jsonio.as_str(entry.get("problem") or entry.get("issue"), limit=400)
    if not problem:
        return None
    pid = jsonio.as_str(entry.get("paragraph_id") or entry.get("id"), limit=40)
    if pid and doc is not None and doc.get(pid) is None:
        pid = ""
    issue_type = jsonio.as_str(entry.get("type"), default="quality", limit=24).lower()
    if issue_type not in TYPES:
        issue_type = "quality"
    return {
        "paragraph_id": pid,
        "type": issue_type,
        "problem": problem,
        "suggestion": jsonio.as_str(entry.get("suggestion"), limit=400),
    }


def normalize_review(raw: dict, doc=None) -> dict:
    raw = jsonio.as_dict(raw)
    issues: list[dict] = []
    seen = set()
    for entry in jsonio.as_list(raw.get("issues"))[:40]:
        issue = _normalize_issue(entry, doc)
        if issue is None:
            continue
        key = (issue["paragraph_id"], issue["type"], issue["problem"])
        if key in seen:
            continue
        seen.add(key)
        issues.append(issue)
    passed = jsonio.as_bool(raw.get("pass"), default=not issues) and not issues
    return {
        "pass": passed,
        "issues": issues,
        "next_instruction": jsonio.as_str(raw.get("next_instruction"), limit=800),
        "needs_user_confirm": True,
    }


def _layer_call(llm, system: str, user: str) -> dict:
    try:
        raw = llm.json(system, user, expect="object")
    except jsonio.ParseError:
        raw = llm.json(system, user, expect="object")
    return normalize_review(raw)


def run_layers(llm, *, doc, changes: list[dict], card: dict, plan: dict,
               summary_text: str, wish: str, layers: list[str] | None = None) -> dict:
    layers = [layer for layer in (layers or ["local", "consistency"]) if layer in LAYERS]
    outcome: dict = {
        "pass": True,
        "issues": [],
        "next_instruction": "",
        "needs_user_confirm": True,
        "layers": {},
        "warnings": [],
    }
    if not changes:
        outcome["layers"] = {layer: {"pass": True, "issues": 0} for layer in layers}
        return outcome
    instructions: list[str] = []
    seen = set()
    for layer in layers:
        try:
            if layer == "local":
                system, user = prompts.local_review_messages(
                    card=card, plan=plan, changes=changes, doc=doc, wish=wish)
            elif layer == "consistency":
                system, user = prompts.consistency_review_messages(
                    summary_text=summary_text, changes=changes, doc=doc)
            else:
                system, user = prompts.global_review_messages(
                    summary_text=summary_text, card=card, plan=plan,
                    changes=changes, doc=doc, wish=wish)
            result = _layer_call(llm, system, user)
        except jsonio.ParseError:
            outcome["warnings"].append({"code": "review_failed", "layer": layer})
            outcome["layers"][layer] = {"pass": True, "issues": 0, "error": True}
            continue
        outcome["layers"][layer] = {
            "pass": result["pass"],
            "issues": len(result["issues"]),
        }
        if not result["pass"]:
            outcome["pass"] = False
        for issue in result["issues"]:
            key = (issue["paragraph_id"], issue["type"], issue["problem"])
            if key in seen:
                continue
            seen.add(key)
            outcome["issues"].append(issue)
        instruction = result.get("next_instruction") or ""
        if instruction and instruction not in instructions:
            instructions.append(instruction)
    outcome["next_instruction"] = "；".join(instructions)[:1200]
    if outcome["issues"]:
        outcome["pass"] = False
    return outcome


def targeted_ids(review: dict, fallback: list[str]) -> list[str]:
    """下一轮定向重改的段落：问题清单里的段落，没有则退回本轮目标段。"""
    ids = []
    for issue in (review or {}).get("issues") or []:
        pid = issue.get("paragraph_id")
        if pid and pid not in ids:
            ids.append(pid)
    return ids or list(fallback)


def review_payload(review: dict) -> dict:
    review = review or {}
    return {
        "pass": bool(review.get("pass")),
        "issues": list(review.get("issues") or []),
        "next_instruction": review.get("next_instruction") or "",
        "needs_user_confirm": True,
        "layers": review.get("layers") or {},
    }
