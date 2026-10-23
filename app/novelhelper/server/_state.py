from __future__ import annotations

import threading

MAX_BODY = 128 * 1024 * 1024  # 128 MB，够放整章正文
# 同一时间只允许一个 AI 生成任务。前端会锁定整个工作站，后端再兜一层，
# 避免误触、重复点击或另一个标签页同时写入。
_RUN_LOCK = threading.Lock()
_RUN_STATE = {"busy": False, "started": "", "mode": "", "surface": "", "transport": ""}
