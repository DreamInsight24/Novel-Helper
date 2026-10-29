#!/usr/bin/env python3
# -*- coding: utf-8 -*-
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
novelhelper/history.py
AI 工作站对话历史。

存储策略：
  data/history.json                 会话索引（标题、时间、轮数、预览、当前会话指针）
  data/conversations/<session>.json 每个会话的完整内容

每次生成的一轮只保存：
  · selection：设定指针（人物 / 记忆 / 世界观条目的 id、栏目开关），不复制整份设定；
  · user_prompt：用户提示词；
  · output：AI 输出。

读取历史时再按 id 到当前数据库里解析指针；指针失效（条目已删除）时跳过，
不会让整份历史失效，也不会把旧设定正文重复存一遍。
"""
from __future__ import annotations

from .localization import t

import copy
import json
import os
import re
import threading
from datetime import datetime
from pathlib import Path

from . import store

HISTORY_FILE = "history"
CONVERSATION_DIR = store.DATA_DIR / "conversations"  # compatibility fallback
_LOCK = threading.RLock()
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{4,80}$")


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _atomic_write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def _conversation_path(session_id: str) -> Path:
    if not _ID_RE.match(session_id or ""):
        raise ValueError(t('errors.invalid_session_id'))
    return conversation_dir() / f"{session_id}.json"


def conversation_dir() -> Path:
    """Resolve conversations for the active novel without import-time caching."""
    novel_id = store.active_novel_id()
    if novel_id:
        return store.novel_data_dir(novel_id) / "conversations"
    return CONVERSATION_DIR


def _index() -> dict:
    data = store.load(HISTORY_FILE)
    data.setdefault("items", [])
    data.setdefault("current", "")
    return data


def _save_index(data: dict) -> None:
    store.save(HISTORY_FILE, data)


def _preview(text: str, limit: int = 90) -> str:
    clean = " ".join(str(text or "").split())
    return clean[:limit] + ("…" if len(clean) > limit else "")


def _title_from_prompt(prompt: str, mode: str) -> str:
    clean = " ".join(str(prompt or "").split())
    if clean:
        return clean[:28] + ("…" if len(clean) > 28 else "")
    return f"新对话 · {mode}"


title_from_prompt = _title_from_prompt


def create_session(title: str = "", mode: str = "draft") -> dict:
    session = {
        "id": store.new_id("hs"),
        "title": (title or "").strip() or f"新对话 · {mode}",
        "created": _now(),
        "updated": _now(),
        "mode": mode,
        "turns": [],
    }
    save_session(session, make_current=True)
    return session


def list_sessions() -> list:
    index = _index()
    items = []
    for entry in index.get("items") or []:
        item = dict(entry)
        item["current"] = entry.get("id") == index.get("current")
        items.append(item)
    items.sort(key=lambda x: x.get("updated") or "", reverse=True)
    return items


def current_session_id() -> str:
    return _index().get("current") or ""


def set_current(session_id: str) -> dict | None:
    with _LOCK:
        index = _index()
        if session_id and not any(item.get("id") == session_id for item in index["items"]):
            return None
        index["current"] = session_id
        _save_index(index)
    return load_session(session_id) if session_id else None


def load_session(session_id: str) -> dict | None:
    if not session_id:
        return None
    try:
        path = _conversation_path(session_id)
    except ValueError:
        return None
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    data.setdefault("turns", [])
    return data


def save_session(session: dict, make_current: bool = False) -> dict:
    session = copy.deepcopy(session or {})
    session.setdefault("id", store.new_id("hs"))
    session.setdefault("created", _now())
    session["updated"] = _now()
    session.setdefault("mode", "draft")
    session.setdefault("title", f"新对话 · {session['mode']}")
    session.setdefault("turns", [])

    with _LOCK:
        path = _conversation_path(session["id"])
        _atomic_write(path, session)
        index = _index()
        entry = {
            "id": session["id"],
            "title": session.get("title") or "未命名对话",
            "created": session.get("created") or _now(),
            "updated": session.get("updated") or _now(),
            "mode": session.get("mode") or "draft",
            "turns": len(session.get("turns") or []),
            "preview": _preview((session.get("turns") or [{}])[-1].get("output", "") if session.get("turns") else ""),
        }
        items = [item for item in index["items"] if item.get("id") != session["id"]]
        items.insert(0, entry)
        index["items"] = items
        if make_current or not index.get("current"):
            index["current"] = session["id"]
        _save_index(index)
    return session


def append_turn(
    session_id: str,
    *,
    mode: str,
    user_prompt: str,
    output: str,
    selection: dict | None = None,
    work_prompt: str = "",
    meta: dict | None = None,
) -> dict:
    """把一轮交互写进会话。用户提示词与 AI 输出分别保存。"""
    with _LOCK:
        session = load_session(session_id)
        if session is None:
            session = create_session(_title_from_prompt(user_prompt, mode), mode)
        turn = {
            "id": store.new_id("tn"),
            "created": _now(),
            "mode": mode,
            "work_prompt": str(work_prompt or ""),
            "user_prompt": str(user_prompt or ""),
            "output": str(output or ""),
            "selection": copy.deepcopy(selection or {}),
            "meta": copy.deepcopy(meta or {}),
        }
        session["turns"].append(turn)
        session["mode"] = mode
        if session.get("title", "").startswith("新对话"):
            session["title"] = _title_from_prompt(user_prompt, mode)
        saved = save_session(session, make_current=True)
        saved["last_turn"] = turn
        return saved


def delete_session(session_id: str) -> bool:
    with _LOCK:
        index = _index()
        before = len(index["items"])
        index["items"] = [item for item in index["items"] if item.get("id") != session_id]
        if len(index["items"]) == before:
            return False
        if index.get("current") == session_id:
            candidates = [item for item in index["items"] if int(item.get("turns") or 0) > 0]
            index["current"] = candidates[0]["id"] if candidates else ""
        _save_index(index)
        try:
            _conversation_path(session_id).unlink(missing_ok=True)
        except (OSError, ValueError):
            pass
    return True


def _world_items(db: dict) -> list:
    items = list(((db.get("other") or {}).get("items")) or [])
    for name, coll in (db or {}).items():
        if name.startswith("section_"):
            items.extend((coll or {}).get("items") or [])
    return items


def resolve_selection(db: dict, selection: dict | None) -> dict:
    """
    把指针解析成当前数据库里的条目信息。

    返回：
      selection  清理后的指针（失效 id 被移除）
      resolved   {characters: [{id,name}], memories: [...], world: [...]}
      missing    失效指针数量
    """
    selection = copy.deepcopy(selection or {})
    if isinstance(selection.get("record_selections"), dict):
        resolved = {}
        missing = 0
        mapping = selection["record_selections"]
        categories = selection.get("setting_categories")
        active = set(categories) if isinstance(categories, list) else set(mapping)
        filtered = {}
        for coll, ids in mapping.items():
            if coll not in active:
                continue
            index = {item.get("id"): item for item in (db.get(coll) or {}).get("items") or []}
            rows = []
            kept = []
            for rid in ids or []:
                item = index.get(rid)
                if item is None:
                    missing += 1
                    continue
                kept.append(rid)
                rows.append({"id": rid, "name": item.get("name") or item.get("title") or "未命名", "category": item.get("category") or ""})
            filtered[coll] = kept
            resolved[coll] = rows
        selection["record_selections"] = filtered
        return {"selection": selection, "resolved": resolved, "missing": missing}
    pools = {
        "character_ids": ("characters", list(((db.get("characters") or {}).get("items")) or [])),
        "memory_ids": ("memory", list(((db.get("memories") or {}).get("items")) or [])),
        "world_ids": ("world", _world_items(db)),
    }
    resolved: dict = {}
    missing = 0
    for key, (label, pool) in pools.items():
        index = {item.get("id"): item for item in pool if item.get("id")}
        ids = []
        rows = []
        for rid in selection.get(key) or []:
            item = index.get(rid)
            if item is None:
                missing += 1
                continue
            ids.append(rid)
            rows.append({
                "id": rid,
                "name": item.get("name") or item.get("title") or "未命名",
                "category": item.get("category") or "",
            })
        selection[key] = ids
        resolved[label] = rows
    return {"selection": selection, "resolved": resolved, "missing": missing}


def session_for_client(session: dict, db: dict) -> dict:
    """给前端的历史会话：附带指针解析结果，原文仍然只存一份。"""
    data = copy.deepcopy(session or {})
    data["turns"] = data.get("turns") or []
    for turn in data["turns"]:
        turn["resolved"] = resolve_selection(db, turn.get("selection") or {})
    return data


def context_messages(session_id: str, max_turns: int = 8, max_chars: int = 60000) -> list[dict]:
    """Include a contiguous suffix of complete turns, bounded for long manuscripts."""
    if not session_id:
        return []
    session = load_session(session_id)
    if not session:
        return []
    pairs = []
    used = 0
    for turn in reversed((session.get("turns") or [])[-max_turns:]):
        user = str(turn.get("user_prompt") or "")
        selection = turn.get("selection") or {}
        additions = [turn.get("work_prompt"), selection.get("current_state"), selection.get("extra")]
        user = "\n\n".join([user] + [str(value) for value in additions if value])
        output = str(turn.get("output") or "")
        if used + len(user) + len(output) > max_chars:
            break
        used += len(user) + len(output)
        pairs.append([{"role": "user", "content": user}, {"role": "assistant", "content": output}])
    return [message for pair in reversed(pairs) for message in pair]
