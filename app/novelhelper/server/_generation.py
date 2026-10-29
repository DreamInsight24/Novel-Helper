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

from ..localization import t

from .. import ai, context, history, logger, project, prompts as prompts_mod, providers, store, tool_prompts
from ._helpers import _compact_selection, _surface_error
from ._state import _RUN_LOCK, _RUN_STATE


class _GenerationMixin:
    def _ai_run(self):
        body = self._body()
        tool = body.get("tool") or "compress"
        db = store.load_all()
        config = db.get("config") or store.current_config()
        override = body.get("override") or {}
        text = body.get("text") or ""

        if tool not in tool_prompts.TOOL_IDS:
            self._error(t('errors.unknown_tool', tool=tool))
            return

        if tool == "summarize":
            content = project.extract_body(text) if body.get("from_output", True) else text
            if not content.strip():
                self._error(t('errors.no_text_summary'))
                return
            user = content.strip()
            if body.get("chapter"):
                user = f"（章节：{body['chapter']}）\n\n{user}"
        else:
            if not text.strip():
                self._error(t('errors.workspace_empty'))
                return
            user = text

        messages = [
            {"role": "system", "content": tool_prompts.prompt(tool)},
            {"role": "user", "content": user},
        ]

        logger.log_event("AI", "tool_request", tool=tool, input_chars=len(text))
        result = ai.chat_settings(config, tool_prompts.settings(config, override), messages)
        result["text"] = prompts_mod.with_notice(result.get("text", ""))
        logger.log_event("AI", "tool_response", tool=tool, model=result.get("model"),
                         elapsed=result.get("elapsed"),
                         tokens=(result.get("usage") or {}).get("total_tokens"),
                         output_chars=len(result.get("text") or ""))
        result["ok"] = True
        result["tool"] = tool
        self._json(result)

    def _workstation_run(self):
        body = self._body()
        mode_id = body.get("mode_id") or body.get("work_mode") or body.get("mode") or "draft"
        surface = (body.get("surface") or "workstation").strip()
        db = store.load_all()
        mode = context.find_mode(db, mode_id)
        if mode is None:
            self._error(t('errors.mode_missing', id=mode_id))
            return
        error = _surface_error(mode, surface)
        if error:
            self._error(error)
            return
        source_text = str(body.get("source_text") or "")
        if surface == "manuscript" and not source_text.strip():
            self._error(t('errors.workspace_empty'))
            return
        if not _RUN_LOCK.acquire(blocking=False):
            self._error(t('errors.generation_locked'), status=409)
            return
        _RUN_STATE.update(busy=True, started=store.now_str(), mode=mode_id,
                          surface=surface, transport="")
        try:
            config = db.get("config") or store.current_config()
            selection = body.get("selection") or {}
            user_prompt = body.get("prompt") or selection.get("prompt") or ""
            work_prompt = body.get("work_prompt") or ""

            assembled = context.assemble_mode(
                config, db, dict(selection, prompt=user_prompt), mode,
                work_prompt=work_prompt,
                source_text=source_text if surface == "manuscript" else "",
            )
            prior = history.context_messages(body.get("session_id") or history.current_session_id()) if surface == "workstation" else []
            messages = [
                {"role": "system", "content": assembled["system"]},
                *prior,
                {"role": "user", "content": assembled["user"]},
            ]
            settings = ai.mode_settings(config, mode)
            for key, value in (body.get("override") or {}).items():
                if value not in (None, ""):
                    settings[key] = value
            logger.log_event(
                "AI", "request", surface=surface, mode=mode_id,
                mode_label=mode.get("label") or mode_id,
                model=settings.get("model"), effort=settings.get("effort"),
                provider=providers.provider_for_config(config).get("id"),
                prompt_chars=len(user_prompt), source_chars=len(source_text),
                user_message_chars=len(assembled["user"]),
                prompt_excerpt=user_prompt[:240],
            )
            result = ai.chat_settings(config, settings, messages)
            result["text"] = prompts_mod.with_notice(result.get("text", ""))
            clean_text = prompts_mod.without_notice(result.get("text"))
            _RUN_STATE["transport"] = result.get("transport", "")
            logger.log_event(
                "AI", "response", surface=surface, mode=mode_id,
                model=result.get("model"), effort=result.get("effort"),
                elapsed=result.get("elapsed"),
                tokens=(result.get("usage") or {}).get("total_tokens"),
                output_chars=len(result.get("text") or ""),
                output_excerpt=(result.get("text") or "")[:320],
            )

            mode_label = mode.get("label") or mode_id
            session_id = ""
            session_payload = None
            turn_payload = {}
            ai_result = None

            if surface == "workstation":
                session_id = body.get("session_id") or history.current_session_id()
                session = history.load_session(session_id) if session_id else None
                if session is None:
                    session = history.create_session(
                        history.title_from_prompt(user_prompt, mode_id), mode_id)
                    session_id = session["id"]

                saved = history.append_turn(
                    session_id,
                    mode=mode_id,
                    user_prompt=user_prompt,
                    output=result["text"],
                    selection=_compact_selection(selection),
                    work_prompt=work_prompt,
                    meta={
                        "model": result.get("model", ""),
                        "effort": result.get("effort", ""),
                        "mode_label": mode_label,
                        "provider": result.get("provider", ""),
                        "elapsed": result.get("elapsed", 0),
                        "usage": result.get("usage") or {},
                        "transport": result.get("transport", ""),
                        "system_chars": len(assembled["system"]),
                        "input_chars": len(assembled["user"]),
                        "output_chars": len(result.get("text") or ""),
                    },
                )
                session_payload = history.session_for_client(saved, db)
                turn_payload = saved.get("last_turn") or {}

                # 同步一份到 state，刷新页面后仍能看到最近一次输出与当前会话。
                # 历史已经落盘；state 写入失败不应让本次生成结果丢失。
                try:
                    state = store.load("state")
                    ws = state.setdefault("workstation", store.default_workstation())
                    ws.update({
                        "mode": mode_id,
                        "prompt": "",
                        "work_prompt": work_prompt,
                        "current_state": selection.get("current_state") or "",
                        "extra": selection.get("extra") or "",
                        "output": result.get("text") or "",
                        "last_mode": mode_id,
                        "current_session": session_id,
                        "viewing_session": "",
                        "selection": _compact_selection(selection),
                    })
                    ws.setdefault("drafts", {})[session_id] = ""
                    state["updated"] = store.now_str()
                    store.save("state", state)
                except Exception:
                    pass
            else:
                # 稿件处理：不进写稿对话历史，也不覆盖工作站的最近输出，
                # 只把结果放进文本面板，刷新页面后仍能在文本下方看到。
                ai_result = {
                    "id": store.new_id("ai"),
                    "text": clean_text,
                    "mode": mode_id,
                    "mode_label": mode_label,
                    "prompt": user_prompt,
                    "source_chars": len(source_text),
                    "created": store.now_str(),
                    "meta": {
                        "model": result.get("model", ""),
                        "effort": result.get("effort", ""),
                        "provider": result.get("provider", ""),
                        "elapsed": result.get("elapsed", 0),
                        "usage": result.get("usage") or {},
                        "transport": result.get("transport", ""),
                        "output_chars": len(clean_text),
                    },
                }
                try:
                    state = store.load("state")
                    panel = state.setdefault("textPanel", {})
                    panel["aiResult"] = ai_result
                    state["updated"] = store.now_str()
                    store.save("state", state)
                except Exception:
                    pass

            payload = dict(result)
            payload.update({
                "ok": True,
                "surface": surface,
                "mode_id": mode_id,
                "mode_label": mode_label,
                "mode_kind": context.mode_kind(mode),
                "work_mode": mode_id,
                "clean_text": clean_text,
                "session_id": session_id,
                "session": session_payload,
                "turn": turn_payload,
                "request": {
                    "system_chars": len(assembled["system"]),
                    "user_chars": len(assembled["user"]),
                },
            })
            if ai_result is not None:
                payload["ai_result"] = ai_result
            self._json(payload)
        except Exception as exc:
            logger.log_exception("AI", "workstation failed", exc, mode=mode_id, surface=surface)
            raise
        finally:
            _RUN_STATE.update(busy=False, started="", mode="", surface="", transport="")
            _RUN_LOCK.release()
