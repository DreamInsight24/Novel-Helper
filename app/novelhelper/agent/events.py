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
novelhelper/agent/events.py
进度事件与告警：服务端把「正在做什么」推给前端，同时留下可审计的告警清单。

事件形态与 /api/workstation/stream 一致，都是逐行 JSON（ndjson）：
``stage``（步骤开始/结束）、``warn``（可恢复问题）、``result``（一步完成）、
``done`` / ``error``（整次调用结束）。
"""
from __future__ import annotations

from typing import Callable


class Cancelled(Exception):
    """用户点了停止：不再发起新的模型调用，结果不落盘。"""


class EventSink:
    def __init__(self, emit: Callable[[dict], None] | None = None,
                 should_stop: Callable[[], bool] | None = None):
        self.emit = emit or (lambda frame: None)
        self.should_stop = should_stop or (lambda: False)
        self.history: list[dict] = []

    def _send(self, frame: dict) -> None:
        self.history.append(frame)
        try:
            self.emit(frame)
        except Exception:  # noqa: BLE001 - 客户端断开不应打断生成逻辑
            pass

    def stage(self, stage: str, status: str = "done", **detail) -> None:
        self._send({"type": "stage", "stage": stage, "status": status,
                    "detail": detail or {}})

    def warn(self, code: str, message: str = "", **detail) -> None:
        self._send({"type": "warn", "code": code, "message": message,
                    "detail": detail or {}})

    def result(self, step: str, payload: dict) -> None:
        self._send({"type": "result", "step": step, "session": payload})

    def check_stop(self) -> None:
        if self.should_stop():
            raise Cancelled()
