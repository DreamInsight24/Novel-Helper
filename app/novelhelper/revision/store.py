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
novelhelper/revision/store.py
修订会话的落盘位置与可配置项。

* 会话按当前小说隔离：``data/novels/<id>/revisions/<session>.json``；
  没有打开小说时落到 ``data/revisions``，不会写进任何集合文件；
* 轮次上限等参数从 ``config.revision`` 读取，缺省值与需求一致（软 3 / 硬 5）。
"""
from __future__ import annotations

import uuid
from pathlib import Path

from .. import store as app_store
from ..agent.sessions import SessionStore

DEFAULT_OPTIONS = {
    "sample_first": True,
    "soft_rounds": 3,
    "hard_rounds": 5,
    "global_review": "auto",      # auto | always | off
    "full_text_limit": 12000,     # 中短篇：首次改写可带全文
    "max_targets": 40,
    "max_target_chars": 20000,
    "max_paragraph_chars": 1200,
}


def _clamp_int(value, default: int, lo: int, hi: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default
    return max(lo, min(hi, number))


def options(config: dict | None, overrides: dict | None = None) -> dict:
    raw = dict((config or {}).get("revision") or {})
    raw.update({key: value for key, value in (overrides or {}).items()
                if value not in (None, "")})
    soft = _clamp_int(raw.get("soft_rounds"), DEFAULT_OPTIONS["soft_rounds"], 1, 5)
    hard = _clamp_int(raw.get("hard_rounds"), DEFAULT_OPTIONS["hard_rounds"], soft, 5)
    global_review = str(raw.get("global_review") or "auto").lower()
    if global_review not in ("auto", "always", "off"):
        global_review = "auto"
    return {
        "sample_first": bool(raw.get("sample_first", DEFAULT_OPTIONS["sample_first"])),
        "soft_rounds": soft,
        "hard_rounds": hard,
        "global_review": global_review,
        "full_text_limit": _clamp_int(raw.get("full_text_limit"),
                                      DEFAULT_OPTIONS["full_text_limit"], 1000, 200000),
        "max_targets": _clamp_int(raw.get("max_targets"),
                                  DEFAULT_OPTIONS["max_targets"], 1, 100),
        "max_target_chars": _clamp_int(raw.get("max_target_chars"),
                                       DEFAULT_OPTIONS["max_target_chars"], 2000, 200000),
        "max_paragraph_chars": _clamp_int(raw.get("max_paragraph_chars"),
                                          DEFAULT_OPTIONS["max_paragraph_chars"], 200, 5000),
    }


def root() -> Path:
    novel_id = app_store.active_novel_id()
    base = app_store.novel_data_dir(novel_id) if novel_id else app_store.DATA_DIR
    return base / "revisions"


def session_store() -> SessionStore:
    return SessionStore(root())


def new_session_id() -> str:
    return "rev_" + uuid.uuid4().hex[:10]
