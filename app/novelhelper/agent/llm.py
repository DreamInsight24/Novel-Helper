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
novelhelper/agent/llm.py
面向「结构化多轮任务」的模型调用封装（可复用）。

与 ``ai.chat_settings`` 的区别：
* 固定低温度、较小输出上限，适合规划与审核这类短输出；
* ``json()`` 在 JSON 解析失败时用一次「只修复格式、不重发原文」的修复调用兜底；
* 记录每次调用的用量，供日志与成本统计。
"""
from __future__ import annotations

from .jsonio import ParseError, parse_json

REPAIR_PROMPT = """你是 JSON 修复助手。下面是一段本应为合法 JSON、但格式有误的输出。
请只修复格式（引号、逗号、括号、Markdown 围栏、前后说明文字），保持原有字段与内容不变。
只输出修复后的 JSON，不要解释。"""


class LLM:
    def __init__(self, config: dict, *, settings: dict | None = None, chat_fn=None):
        if chat_fn is None:
            from .. import ai
            chat_fn = ai.chat_settings
        self.config = config or {}
        self.chat_fn = chat_fn
        self.base_settings = dict(settings or {})
        self.calls: list[dict] = []

    def _settings(self, temperature: float | None = None) -> dict:
        settings = dict(self.base_settings)
        settings.setdefault("effort", "medium")
        settings.setdefault("max_tokens", 8192)
        settings.setdefault("temperature", 0.2)
        settings.setdefault("thinking", False)
        if temperature is not None:
            settings["temperature"] = temperature
        return settings

    def _call(self, system: str, user: str, *, temperature: float | None = None) -> str:
        result = self.chat_fn(self.config, self._settings(temperature), [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ])
        text = str((result or {}).get("text") or "")
        self.calls.append({
            "input_chars": len(user) + len(system),
            "output_chars": len(text),
            "elapsed": (result or {}).get("elapsed", 0),
            "usage": (result or {}).get("usage") or {},
            "model": (result or {}).get("model", ""),
        })
        return text

    def text(self, system: str, user: str, *, temperature: float | None = None) -> str:
        return self._call(system, user, temperature=temperature)

    def json(self, system: str, user: str, *, expect: str = "object",
             repair: bool = True, temperature: float | None = None):
        text = self._call(system, user, temperature=temperature)
        try:
            return parse_json(text, expect=expect)
        except ParseError:
            if not repair:
                raise
            fixed = self._call(REPAIR_PROMPT, text, temperature=0)
            return parse_json(fixed, expect=expect)

    def usage(self) -> dict:
        total = sum(int((call.get("usage") or {}).get("total_tokens") or 0)
                    for call in self.calls)
        return {
            "calls": len(self.calls),
            "total_tokens": total,
            "elapsed": round(sum(call.get("elapsed") or 0 for call in self.calls), 1),
            "input_chars": sum(call.get("input_chars") or 0 for call in self.calls),
            "output_chars": sum(call.get("output_chars") or 0 for call in self.calls),
        }
