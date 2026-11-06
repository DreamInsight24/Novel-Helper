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
novelhelper/revision/ —— 小说「润色修订」Agent。

模块划分：
* card / summary / plan   第一轮：需求卡、稳定摘要、改稿计划；
* revise / merge           第二轮：局部改写、越界丢弃、哈希校验与合并；
* review                   第三轮：局部 / 一致性 / 全局分层审核；
* engine                   状态机、轮次控制、回滚、增量需求；
* store                    会话落盘位置与可配置项。

通用能力在 ``novelhelper/agent``，这一层只放小说业务语义。
"""
from __future__ import annotations

from .engine import RevisionEngine, RevisionError

__all__ = ["RevisionEngine", "RevisionError"]
