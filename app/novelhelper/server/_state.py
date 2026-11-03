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

from __future__ import annotations

import threading

MAX_BODY = 128 * 1024 * 1024  # 128 MB，够放整章正文
# 同一时间只允许一个 AI 生成任务。前端会锁定整个工作站，后端再兜一层，
# 避免误触、重复点击或另一个标签页同时写入。
_RUN_LOCK = threading.Lock()
_RUN_STATE = {"busy": False, "started": "", "mode": "", "surface": "", "transport": "",
              "cancelled": False}


class RunToken:
    """一次生成的凭据：用来判断结果还要不要保存。"""

    __slots__ = ("id", "cancelled", "lock_released")

    def __init__(self, token_id: int) -> None:
        self.id = token_id
        self.cancelled = False
        self.lock_released = False


_GATE = threading.Lock()          # 只保护下面的短临界区
_CURRENT = {"token": None, "seq": 0}


def begin_run(*, mode: str, surface: str, started: str) -> RunToken | None:
    """抢占生成槽位；已有任务在跑时返回 None。"""
    if not _RUN_LOCK.acquire(blocking=False):
        return None
    with _GATE:
        _CURRENT["seq"] += 1
        token = RunToken(_CURRENT["seq"])
        _CURRENT["token"] = token
    _RUN_STATE.update(busy=True, started=started, mode=mode, surface=surface,
                      transport="", cancelled=False)
    return token


def _release(token: RunToken) -> None:
    with _GATE:
        if token.lock_released:
            return
        token.lock_released = True
    try:
        _RUN_LOCK.release()
    except RuntimeError:
        pass


def finish_run(token: RunToken) -> None:
    """正常结束或被取消都走这里；只有仍是"当前任务"时才清状态。"""
    with _GATE:
        current = _CURRENT["token"] is token
        if current:
            _CURRENT["token"] = None
    if current:
        _RUN_STATE.update(busy=False, started="", mode="", surface="", transport="")
    _release(token)


def cancel_run() -> bool:
    """标记当前任务作废，并立刻放开生成槽位，让用户可以马上重新发起。

    注意：上游的 AI 请求仍会跑完（ai.py 目前是 stream=False），
    但结果会被丢弃、不写历史；用户不必等它。
    """
    with _GATE:
        token = _CURRENT["token"]
        if token is None:
            return False
        _CURRENT["token"] = None
        token.cancelled = True
    _RUN_STATE.update(busy=False, started="", mode="", surface="", transport="",
                      cancelled=True)
    _release(token)
    return True


def run_cancelled(token: RunToken) -> bool:
    return token.cancelled
