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
novelhelper/agent/sessions.py
通用会话落盘：一个会话一个 JSON 文件，原子写入、可列举、可删除。

* 目录由调用方决定（小说数据目录 / 临时目录），本模块不关心业务字段；
* 文件名只允许 ``[a-z0-9_-]``，避免路径穿越；
* 列表只返回元数据，读取详情时才加载整份会话，避免一次读入大量正文。
"""
from __future__ import annotations

import json
import os
import re
import tempfile
import threading
import time
from pathlib import Path

_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,79}$")


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


class SessionStore:
    def __init__(self, root: Path):
        self.root = Path(root)
        self._lock = threading.RLock()

    def _path(self, session_id: str) -> Path:
        value = str(session_id or "").strip().lower()
        if not _ID_RE.fullmatch(value):
            raise ValueError("invalid session id")
        return self.root / f"{value}.json"

    def load(self, session_id: str) -> dict | None:
        path = self._path(session_id)
        try:
            raw = path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return None
        except OSError:
            return None
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return None
        return data if isinstance(data, dict) else None

    def save(self, session: dict) -> dict:
        session = dict(session or {})
        session_id = str(session.get("id") or "").lower()
        path = self._path(session_id)
        session["updated"] = _now()
        payload = json.dumps(session, ensure_ascii=False, indent=1)
        with self._lock:
            path.parent.mkdir(parents=True, exist_ok=True)
            descriptor, temporary = tempfile.mkstemp(
                dir=path.parent, prefix=".session-", suffix=".tmp")
            try:
                with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
                    stream.write(payload + "\n")
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(temporary, path)
            finally:
                Path(temporary).unlink(missing_ok=True)
        return session

    def list(self, *, limit: int = 50, novel_id: str = "") -> list[dict]:
        items: list[dict] = []
        if not self.root.exists():
            return items
        for path in self.root.glob("*.json"):
            if not _ID_RE.fullmatch(path.stem):
                continue
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if not isinstance(data, dict):
                continue
            if novel_id and data.get("novel_id") != novel_id:
                continue
            items.append({
                "id": data.get("id") or path.stem,
                "title": data.get("title") or "",
                "state": data.get("state") or "",
                "created": data.get("created") or "",
                "updated": data.get("updated") or "",
                "chapter": (data.get("doc") or {}).get("chapter") or "",
                "path": (data.get("doc") or {}).get("path") or "",
                "chars": (data.get("doc") or {}).get("chars") or 0,
                "rounds": len(data.get("rounds") or []),
                "accepted": bool(data.get("accepted")),
            })
        items.sort(key=lambda item: item.get("updated") or "", reverse=True)
        return items[:max(1, int(limit or 50))]

    def delete(self, session_id: str) -> bool:
        try:
            path = self._path(session_id)
        except ValueError:
            return False
        with self._lock:
            if not path.exists():
                return False
            path.unlink(missing_ok=True)
            return True
