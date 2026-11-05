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

import json
import time
from pathlib import Path

from ..localization import t

from .. import ai, context, history, logger, project, prompts as prompts_mod, providers, setting_gen, store, tool_prompts
from ._helpers import _compact_selection, _surface_error
from ._state import _RUN_LOCK, _RUN_STATE, begin_run, finish_run, run_cancelled

# 流式输出：每帧一行 JSON（ndjson），最后一帧是 done 或 error。
_STREAM_FLUSH_CHARS = 96
_STREAM_FLUSH_SECONDS = 0.06


class _RunError(Exception):
    """生成前的校验失败，需要在请求模型之前报给前端。"""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def _chapter_title(prompt: str, text: str) -> str:
    """新章节的名字：优先用户提示词，其次正文首个标题，最后回退。"""
    for candidate in (prompt, _first_heading(text)):
        clean = " ".join(str(candidate or "").split())
        if clean:
            return clean[:24]
    return t('workstation.untitled_chapter')


def _first_heading(text: str) -> str:
    for line in str(text or "").splitlines():
        strip = line.strip()
        if strip.startswith("#"):
            return strip.lstrip("#").strip()
    return ""


def _wants_chapter(mode: dict) -> bool:
    """完整写作（写稿模式下拼装目标字数的模式）的结果直接成为新章节。"""
    return context.mode_kind(mode) == "write" and bool(mode.get("use_target_chars"))


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
        try:
            payload = self._run_workstation(body)
        except _RunError as exc:
            self._error(exc.message, status=exc.status)
            return
        self._json(payload)

    def _workstation_stream(self):
        """流式生成：先回 start，随后逐段 delta，最后 done（含与 /run 相同的 payload）。"""
        body = self._body()
        try:
            self._stream_start()
        except OSError:
            # 客户端在拿到响应头之前就断开了：这次没有可写的连接，直接结束。
            self._stream_open = False
            return
        try:
            self._stream_write({"type": "start"})
            payload = self._run_workstation(body, on_delta=self._stream_on_delta)
            self._stream_write({"type": "done", "payload": payload})
        except _RunError as exc:
            self._stream_write({"type": "error", "error": exc.message, "status": exc.status})
        except ai.AIError as exc:
            logger.log_exception("AI", "stream failed", exc)
            self._stream_write({"type": "error", "error": str(exc)})
        except Exception as exc:  # noqa: BLE001 - 流已经发出去了，错误只能放进最后一帧
            logger.log_exception("AI", "stream crashed", exc)
            self._stream_write({"type": "error", "error": f"{type(exc).__name__}: {exc}"})
        finally:
            self._stream_end()

    # ── 流式响应 ─────────────────────────────
    def _stream_start(self) -> None:
        self._last_status = 200
        self._stream_open = True
        self._delta_buffer = ""
        self._delta_sent = 0.0
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()

    def _stream_chunk(self, frame: dict) -> bool:
        """写一帧；客户端已经断开时安静收场（停止生成会直接把连接掐掉）。"""
        data = (json.dumps(frame, ensure_ascii=False) + "\n").encode("utf-8")
        try:
            self.wfile.write(b"%x\r\n" % len(data) + data + b"\r\n")
            self.wfile.flush()
            return True
        except OSError:
            self._stream_open = False
            return False

    def _stream_write(self, frame: dict) -> None:
        if not getattr(self, "_stream_open", False):
            return
        self._flush_delta()
        self._stream_chunk(frame)

    def _flush_delta(self) -> None:
        if not getattr(self, "_delta_buffer", ""):
            return
        text, self._delta_buffer = self._delta_buffer, ""
        if self._stream_chunk({"type": "delta", "text": text}):
            self._delta_sent = time.monotonic()

    def _stream_on_delta(self, text: str) -> None:
        if not getattr(self, "_stream_open", False):
            return
        self._delta_buffer += text
        if len(self._delta_buffer) >= _STREAM_FLUSH_CHARS or \
                time.monotonic() - self._delta_sent >= _STREAM_FLUSH_SECONDS:
            self._flush_delta()

    def _stream_end(self) -> None:
        if not getattr(self, "_stream_open", False):
            return
        try:
            self._flush_delta()
            if getattr(self, "_stream_open", False):
                self.wfile.write(b"0\r\n\r\n")
                self.wfile.flush()
        except OSError:
            pass
        finally:
            self._stream_open = False

    def _run_workstation(self, body: dict, on_delta=None) -> dict:
        mode_id = body.get("mode_id") or body.get("work_mode") or body.get("mode") or "draft"
        surface = (body.get("surface") or "workstation").strip()
        db = store.load_all()
        mode = context.find_mode(db, mode_id)
        if mode is None:
            raise _RunError(t('errors.mode_missing', id=mode_id))
        error = _surface_error(mode, surface)
        if error:
            raise _RunError(error)
        source_text = str(body.get("source_text") or "")
        if surface == "manuscript" and not source_text.strip():
            raise _RunError(t('errors.workspace_empty'))
        token = begin_run(mode=mode_id, surface=surface, started=store.now_str())
        if token is None:
            raise _RunError(t('errors.generation_locked'), status=409)
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
                streaming=bool(on_delta),
            )
            if on_delta is None:
                result = ai.chat_settings(config, settings, messages)
            else:
                try:
                    result = ai.chat_stream(config, settings, messages, on_delta,
                                            should_stop=lambda: run_cancelled(token))
                except ai.StreamStopped:
                    logger.log_event("AI", "cancelled", surface=surface, mode=mode_id,
                                     stream=True)
                    return {"ok": False, "cancelled": True,
                            "error": t('errors.generation_cancelled')}
            if run_cancelled(token):
                # 用户已停止等待：结果丢弃，不写历史、不覆盖 state。
                logger.log_event("AI", "cancelled", surface=surface, mode=mode_id,
                                 elapsed=result.get("elapsed"))
                return {"ok": False, "cancelled": True,
                        "error": t('errors.generation_cancelled')}
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
            chapter = None

            if surface == "workstation":
                session_id = body.get("session_id") or history.current_session_id()
                session = history.load_session(session_id) if session_id else None
                if session is None:
                    session = history.create_session(
                        history.title_from_prompt(user_prompt, mode_id), mode_id)
                    session_id = session["id"]

                # 完整写作的结果直接成为稿件处理里的一个新章节，并把来源对话记在
                # 章节索引里，稿件处理就能显示「来自对话」并跳回这次对话。
                if body.get("auto_chapter") is not False and _wants_chapter(mode) and clean_text.strip():
                    target = project.write_auto_chapter(clean_text, _chapter_title(user_prompt, clean_text))
                    chapter = {"rel": project.rel_str(target), "name": target.name,
                               "title": Path(target.name).stem, "session_id": session_id}

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
                        "chapter": chapter or {},
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
                    if chapter:
                        books = ws.setdefault("chapters", {})
                        books[chapter["rel"]] = {
                            "session_id": session_id,
                            "turn_id": turn_payload.get("id") or "",
                            "title": chapter["title"],
                            "created": store.now_str(),
                        }
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
            if chapter is not None:
                payload["chapter"] = chapter
            return payload
        except Exception as exc:
            logger.log_exception("AI", "workstation failed", exc, mode=mode_id, surface=surface)
            raise
        finally:
            finish_run(token)

    def _ai_setting_gen(self):
        """AI 设定生成：只读取 text 字段，忽略一切试图覆盖行为参数的字段。"""
        body = self._body()
        text = str(body.get("text") or "").strip()
        if not text:
            self._error(t('errors.setting_gen_empty'))
            return
        if len(text) > setting_gen.MAX_TASK_CHARS:
            self._error(t('errors.setting_gen_too_long', max=setting_gen.MAX_TASK_CHARS))
            return
        if not _RUN_LOCK.acquire(blocking=False):
            self._error(t('errors.generation_locked'), status=409)
            return
        _RUN_STATE.update(busy=True, started=store.now_str(), mode="setting_gen",
                          surface="setting_gen", transport="")
        try:
            config = store.current_config()
            db = store.load_all()
            records, metrics, overflow_records = setting_gen.extract_records(
                ai.chat_settings, config, db, text)
            total_tokens = sum(int((m.get("usage") or {}).get("total_tokens") or 0)
                               for m in metrics)
            # 日志只记指标：字符数、条数、耗时、token 用量；不记用户文本与密钥。
            logger.log_event(
                "AI", "setting_gen_request", chunks=len(metrics),
                input_chars=len(text), records_raw=len(records),
                total_tokens=total_tokens,
                elapsed=round(sum(m.get("elapsed") or 0 for m in metrics), 2),
                model=(metrics[-1].get("model") if metrics else ""),
            )
            by_target, report = setting_gen.validate_batch(records, db)
            if report["accepted"] == 0:
                self._error(t('errors.setting_gen_nothing'))
                return
            written = setting_gen.write_batch(by_target)
            batch = setting_gen.begin_undo(by_target)
            dropped_items = list(report["dropped_items"])
            dropped_items.extend(
                setting_gen.raw_item(raw, "overflow") for raw in overflow_records)
            # 日志只记计数指标：条目明细含用户文本中的名称，不写入日志。
            log_report = {key: value for key, value in report.items()
                          if not key.endswith("_items")}
            logger.log_event("AI", "setting_gen_written",
                             batch=batch["id"], total_tokens=total_tokens,
                             overflow=len(overflow_records), **log_report)
            self._json({
                "ok": True,
                "batch_id": batch["id"],
                "summary": {
                    "added": report["accepted"],
                    "skipped": report["skipped_duplicate"],
                    "written": written,
                    "dropped": {key: value for key, value in report.items()
                                if key.startswith("dropped")},
                    "overflow": len(overflow_records),
                    "added_items": report["added_items"],
                    "dropped_items": dropped_items,
                },
                "collections": store.load_all(),
            })
        except setting_gen.ParseError:
            logger.log_exception("AI", "setting_gen parse failed", None,
                                 input_chars=len(text))
            self._error(t('errors.setting_gen_parse'))
        except ai.AIError as exc:
            logger.log_exception("AI", "setting_gen request failed", exc,
                                 input_chars=len(text))
            self._error(str(exc), status=502)
        except Exception as exc:
            logger.log_exception("AI", "setting_gen failed", exc, input_chars=len(text))
            raise
        finally:
            _RUN_STATE.update(busy=False, started="", mode="", surface="", transport="")
            _RUN_LOCK.release()

    def _ai_setting_gen_undo(self):
        body = self._body()  # noqa: F841 - 请求体无必填字段，仅保证请求格式合法
        if not _RUN_LOCK.acquire(blocking=False):
            self._error(t('errors.generation_locked'), status=409)
            return
        try:
            result = setting_gen.undo_last_batch()
            if result is None:
                self._error(t('errors.setting_gen_undo_missing'))
                return
            removed, kept = result
            logger.log_event("AI", "setting_gen_undo", removed=removed, kept=kept)
            self._json({"ok": True, "removed": removed, "kept": kept,
                        "collections": store.load_all()})
        except Exception as exc:
            logger.log_exception("AI", "setting_gen undo failed", exc)
            raise
        finally:
            _RUN_LOCK.release()
