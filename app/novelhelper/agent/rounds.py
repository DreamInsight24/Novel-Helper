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
novelhelper/agent/rounds.py
轮次控制：软上限 / 硬上限、无进展检测、震荡（A→B→A）检测。

纯函数，不依赖具体业务：只要提供每一轮的问题清单、改动量与段落哈希，
就能判断「要不要继续改」。停止时返回可选项，由界面交给用户决定。
"""
from __future__ import annotations

import re

SOFT_LIMIT = 3
HARD_LIMIT = 5
STOP_OPTIONS = ("accept_current", "change_strategy", "manual_issues")

_SPACES = re.compile(r"\s+")
_PUNCT = re.compile(r"[，。！？、；：,.!?;:\"'“”‘’()（）\[\]【】—…]")


def normalize_problem(text: str) -> str:
    return _PUNCT.sub("", _SPACES.sub("", str(text or ""))).lower()[:120]


def issue_signature(issues: list) -> frozenset:
    """问题集合指纹：段落、类型与问题描述都相同才算「同一批问题」。"""
    keys = set()
    for issue in issues or []:
        if not isinstance(issue, dict):
            continue
        keys.add((
            str(issue.get("paragraph_id") or ""),
            str(issue.get("type") or ""),
            normalize_problem(issue.get("problem")),
        ))
    return frozenset(keys)


def change_ratio(changes: list, doc_chars: int) -> float:
    total = 0
    for change in changes or []:
        stats = (change or {}).get("stats") or {}
        total += int(stats.get("total") or 0)
    return total / max(1, int(doc_chars or 0))


def _text_hashes(entry: dict) -> dict:
    value = (entry or {}).get("text_hashes")
    return value if isinstance(value, dict) else {}


def detect_oscillation(history: list) -> bool:
    """同一段又被改回两轮前的文字（A→B→A）视为震荡。"""
    if len(history) < 3:
        return False
    current = _text_hashes(history[-1])
    previous = _text_hashes(history[-2])
    for paragraph_id, digest in current.items():
        if not digest or previous.get(paragraph_id) == digest:
            continue
        for older in history[:-2]:
            if _text_hashes(older).get(paragraph_id) == digest:
                return True
    return False


def repeated_paragraph(history: list, threshold: int = 3) -> bool:
    """同一段连续多轮都在问题清单里：说明单点反复改仍不达标。"""
    if len(history) < threshold:
        return False
    recent = history[-threshold:]
    sets = []
    for entry in recent:
        sets.append({str(issue.get("paragraph_id") or "")
                     for issue in entry.get("issues") or []
                     if isinstance(issue, dict)})
    common = set.intersection(*sets) if sets else set()
    common.discard("")
    return bool(common)


def _progressed(history: list) -> bool:
    """软上限之后继续的唯一理由：问题数明确减少。"""
    if len(history) < 2:
        return True
    previous = len(history[-2].get("issues") or [])
    current = len(history[-1].get("issues") or [])
    return current < previous


def evaluate(history: list, *, soft: int = SOFT_LIMIT, hard: int = HARD_LIMIT) -> dict | None:
    """返回停止决定；None 表示可以继续下一轮。"""
    if not history:
        return None
    last = history[-1]
    completed = int(last.get("round") or len(history))
    if completed >= hard:
        return _stop("hard_limit", completed)
    issues = last.get("issues") or []
    if completed >= 2:
        if issues and issue_signature(issues) == issue_signature(
                history[-2].get("issues") or []):
            return _stop("no_progress", completed, detail="same_issues")
    if completed >= 2 and issues and last.get("change_ratio", 0) < 0.002:
        return _stop("no_progress", completed, detail="tiny_diff")
    if detect_oscillation(history):
        return _stop("oscillation", completed)
    if repeated_paragraph(history):
        return _stop("no_progress", completed, detail="repeated_paragraph")
    if completed >= soft and not _progressed(history):
        return _stop("soft_limit", completed)
    return None


def _stop(reason: str, completed: int, detail: str = "") -> dict:
    return {
        "stop": True,
        "reason": reason,
        "round": completed,
        "detail": detail,
        "options": list(STOP_OPTIONS),
    }


def stop_decision(reason: str, completed: int, detail: str = "") -> dict:
    """统一的停止决定（也供引擎在硬上限处直接构造）。"""
    return _stop(reason, completed, detail)


def describe(decision: dict | None) -> str:
    if not decision:
        return ""
    return f"{decision.get('reason')}@{decision.get('round')}"
