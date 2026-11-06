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
novelhelper/agent/ —— 可复用的 Agent 工具包。

这一层刻意不包含任何「小说」业务词：分段/索引、结构化 JSON 调用、
差异计算、轮次收敛、会话落盘与事件推送都可以被稿件处理、设定生成、
或后续新增的 Agent 复用。业务提示词与状态机放在 ``novelhelper/revision``。
"""
from __future__ import annotations

from .segments import Document, Paragraph, normalize_newlines, sha256_text
from .sessions import SessionStore
from .events import EventSink
from .llm import LLM
from .jsonio import ParseError, parse_json

__all__ = [
    "Document", "Paragraph", "normalize_newlines", "sha256_text",
    "SessionStore", "EventSink", "LLM", "ParseError", "parse_json",
]
