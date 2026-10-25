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
_RUN_STATE = {"busy": False, "started": "", "mode": "", "surface": "", "transport": ""}
