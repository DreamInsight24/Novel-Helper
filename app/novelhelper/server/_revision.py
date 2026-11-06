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
novelhelper/server/_revision.py
润色修订 Agent 的 HTTP 接口：流式执行一步，非流式读取会话。

每次请求只推进状态机的一步（plan / sample / batch / review / accept /
rollback / increment ...）。进度用 ndjson 帧推送，最终一帧带完整会话视图，
前端据此渲染需求卡、样例 diff、审核问题与回滚入口。
"""
from __future__ import annotations

from ..localization import t

from .. import ai, logger, store
from ..agent.events import Cancelled
from ..revision import RevisionEngine, RevisionError
from ..revision import store as revision_store
from ._state import begin_run, cancel_run, finish_run, run_cancelled


class _RevisionMixin:
    def _revision_stream(self):
        body = self._body()
        step = str(body.get("step") or "plan").strip().lower()
        try:
            self._stream_start()
        except OSError:
            self._stream_open = False
            return
        token = begin_run(mode="revision", surface="revision",
                          started=store.now_str())
        if token is None:
            self._stream_write({"type": "error", "error": t("errors.generation_locked"),
                                "status": 409})
            self._stream_end()
            return
        try:
            self._stream_write({"type": "start", "step": step})
            db = store.load_all()
            config = db.get("config") or store.current_config()
            engine = RevisionEngine(
                config, db,
                emit=self._stream_write,
                should_stop=lambda: run_cancelled(token),
                model=str(body.get("model") or ""),
                effort=str(body.get("effort") or ""),
            )
            view = engine.execute(step, body)
            self._stream_write({"type": "done", "session": view})
            logger.log_event("REVISION", "stream_done", step=step,
                             session=view.get("id"), state=view.get("state"),
                             chars=view.get("stats", {}).get("chars"),
                             changes=view.get("stats", {}).get("changes"))
        except RevisionError as exc:
            self._stream_write({"type": "error", "error": exc.message,
                                "status": exc.status})
        except Cancelled:
            logger.log_event("REVISION", "cancelled", step=step)
            self._stream_write({"type": "error",
                                "error": t("errors.generation_cancelled"),
                                "cancelled": True})
        except ai.AIError as exc:
            logger.log_exception("REVISION", "stream ai failed", exc, step=step)
            self._stream_write({"type": "error", "error": str(exc)})
        except Exception as exc:  # noqa: BLE001 - 流已开始，错误只能放进最后一帧
            logger.log_exception("REVISION", "stream crashed", exc, step=step)
            self._stream_write({"type": "error",
                                "error": f"{type(exc).__name__}: {exc}"})
        finally:
            self._stream_end()
            finish_run(token)

    def _revision_sessions(self):
        sessions = revision_store.session_store().list(limit=100)
        self._json({"ok": True, "sessions": sessions,
                    "active_novel_id": store.active_novel_id()})

    def _revision_session(self, query: dict):
        session_id = (query.get("id") or [""])[0]
        store_ = revision_store.session_store()
        session = store_.load(session_id) if session_id else None
        if session is None:
            self._error(t("errors.revision_session_missing"), status=404)
            return
        engine = RevisionEngine(store.current_config(), store.load_all())
        self._json({"ok": True, "session": engine.view(session)})

    def _revision_delete(self):
        body = self._body()
        removed = revision_store.session_store().delete(body.get("id") or "")
        self._json({"ok": True, "removed": bool(removed)})

    def _revision_cancel(self):
        cancelled = cancel_run()
        logger.log_event("REVISION", "cancel", cancelled=cancelled)
        self._json({"ok": True, "cancelled": cancelled})
