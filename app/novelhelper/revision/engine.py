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
novelhelper/revision/engine.py
润色修订 Agent 的状态机：许愿 → 需求卡 → 样例 → 批量 → 合并校验 → 分层审核
→ 定向重改（受轮次控制）→ 用户确认 → 回滚 / 增量。

引擎只依赖 ``novelhelper.agent`` 提供的通用能力，不直接读写 HTTP；
``chat_fn`` 可注入，因此测试可以完全离线运行。
"""
from __future__ import annotations

import hashlib
import time

from .. import ai, logger, store as app_store
from ..localization import t
from ..agent import Document, EventSink, LLM, jsonio, rounds, sha256_text
from . import card as card_mod
from . import merge, plan as plan_mod, prompts, review as review_mod
from . import revise as revise_mod
from . import store, summary as summary_mod

# 需求里的状态机（对外原样返回，前端负责本地化文案）
STATE_IDLE = "IDLE"
STATE_PARSE_REQ = "PARSE_REQ"
STATE_LOCATE = "LOCATE"
STATE_SAMPLE_REVISE = "SAMPLE_REVISE"
STATE_USER_CONFIRM_SAMPLE = "USER_CONFIRM_SAMPLE"
STATE_BATCH_REVISE = "BATCH_REVISE"
STATE_MERGE_CHECK = "MERGE_CHECK"
STATE_REVIEW = "REVIEW"
STATE_USER_CONFIRM_FINAL = "USER_CONFIRM_FINAL"
STATE_DONE = "DONE"
STATE_ROLLBACK = "ROLLBACK"
STATE_INCREMENT_REQ = "INCREMENT_REQ"

MAX_SOURCE_CHARS = 1_500_000
FEEDBACK_TEXT = {
    "more_oral": "再口语一点：更短句、少形容词、贴近日常说话，但保留剧情事实与人物称呼。",
    "new_direction": "换一个方向：与这一版明显不同，但保留剧情事实与人物称呼。",
    "variant": "换一个与上一版明显不同的改写方向，避免重复同样的措辞与节奏。",
}


class RevisionError(RuntimeError):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def _short_hash(text: str) -> str:
    return hashlib.sha1(str(text or "").encode("utf-8")).hexdigest()[:12]


def _texts_hash(texts: list) -> str:
    return sha256_text("\u0000".join(str(text or "") for text in texts or []))


class RevisionEngine:
    def __init__(self, config: dict, db: dict | None = None, *, chat_fn=None,
                 session_store=None, emit=None, should_stop=None,
                 model: str = "", effort: str = ""):
        self.config = config or {}
        self.db = db or {}
        self.chat_fn = chat_fn
        self.store = session_store or store.session_store()
        self.sink = EventSink(emit, should_stop)
        self.novel_id = app_store.active_novel_id()
        self.model = str(model or "").strip()
        self.effort = str(effort or "").strip()
        self.llm = LLM(self.config, settings=self._settings(), chat_fn=chat_fn)

    # ── 基础设施 ─────────────────────────
    def _settings(self) -> dict:
        base = ai.mode_settings(self.config, {
            "model": self.model,
            "effort": self.effort or "medium",
            "max_tokens": 8192,
        })
        base.update({"max_tokens": 8192, "temperature": 0.2, "thinking": False})
        return base

    def _log(self, action: str, **detail) -> None:
        try:
            logger.log_event("REVISION", action, **detail, **self.llm.usage())
        except Exception:  # noqa: BLE001 - 日志失败不影响修订
            pass

    def _excerpt(self, text: str, limit: int = 160) -> str:
        text = " ".join(str(text or "").split())
        return text[:limit]

    # ── 会话读写 ─────────────────────────
    def create(self, body: dict) -> dict:
        text = str(body.get("source_text") or "")
        if not text.strip():
            raise RevisionError(t("errors.revision_no_text"))
        if len(text) > MAX_SOURCE_CHARS:
            raise RevisionError(t("errors.revision_too_long", max=MAX_SOURCE_CHARS))
        options = store.options(self.config, body.get("options"))
        chapter = str(body.get("chapter") or "").strip()
        path = str(body.get("path") or "").strip()
        chapter_id = "ch_" + _short_hash(path or chapter or "document")
        doc = Document(text, chapter_id=chapter_id,
                       max_chars=options["max_paragraph_chars"])
        scope = self._scope(body, doc)
        now = _now()
        session = {
            "id": store.new_session_id(),
            "version": 1,
            "novel_id": self.novel_id,
            "created": now,
            "updated": now,
            "title": self._title(chapter or path),
            "state": STATE_IDLE,
            "doc": {
                "path": path,
                "chapter": chapter,
                "chapter_id": chapter_id,
                "original_text": doc.current_text(),
                "original_hash": sha256_text(doc.current_text()),
                "text": doc.current_text(),
                "chars": len(doc.current_text()),
                "count": len(doc),
            },
            "separators": list(doc.separators),
            "paragraphs": [paragraph.as_dict() for paragraph in doc.paragraphs],
            "options": options,
            "scope": scope,
            "wish": "",
            "stable_summary": summary_mod.seed(self.db, chapter=chapter or path),
            "card": None,
            "question": None,
            "question_asked": False,
            "question_answered": False,
            "answer": "",
            "plan": None,
            "sample": None,
            "sample_target": "",
            "messages": [],
            "rounds": [],
            "warnings": [],
            "review": None,
            "stop": None,
            "changes": [],
            "versions": [{
                "index": 0, "label": "original", "source": "original",
                "created": now, "texts": doc.snapshot(),
                "chars": len(doc.current_text()),
            }],
            "full_text_sent": False,
            "cycle": 1,
            "round_in_cycle": 0,
            "accepted": False,
            "accepted_at": "",
        }
        self._save(session, doc)
        self._log("session_created", session=session["id"], paragraphs=len(doc),
                  chars=len(doc.current_text()), scope=scope["kind"])
        return session

    def load(self, session_id: str) -> dict:
        session = self.store.load(session_id)
        if session is None:
            raise RevisionError(t("errors.revision_session_missing"), status=404)
        return session

    def _doc(self, session: dict) -> Document:
        options = session.get("options") or store.options(self.config)
        doc = Document(session["doc"]["original_text"],
                       chapter_id=session["doc"].get("chapter_id") or "",
                       max_chars=int(options.get("max_paragraph_chars") or 1200))
        texts = [paragraph.get("text") or "" for paragraph in session.get("paragraphs") or []]
        separators = list(session.get("separators") or [])
        try:
            if len(separators) != len(texts) + 1:
                raise ValueError("separator count mismatch")
            doc.separators = separators
            doc.set_texts(texts)
        except Exception:  # noqa: BLE001 - 数据被外部改坏时退回重新分段
            doc = Document(session["doc"].get("text") or session["doc"]["original_text"],
                           chapter_id=session["doc"].get("chapter_id") or "",
                           max_chars=int(options.get("max_paragraph_chars") or 1200))
        return doc

    def _sync(self, session: dict, doc: Document) -> None:
        text = doc.current_text()
        session["doc"].update({
            "text": text,
            "chars": len(text),
            "count": len(doc),
            "original_hash": session["doc"].get("original_hash")
            or sha256_text(session["doc"].get("original_text") or ""),
        })
        session["paragraphs"] = [paragraph.as_dict() for paragraph in doc.paragraphs]
        session["separators"] = list(doc.separators)
        session["updated"] = _now()

    def _save(self, session: dict, doc: Document) -> None:
        self._sync(session, doc)
        self.store.save(session)

    def _title(self, name: str) -> str:
        base = str(name or "").replace("\\", "/").rstrip("/").split("/")[-1]
        base = base.splitlines()[0] if base else ""
        if not base:
            return t("revision.title_default")
        return t("revision.title_with_name", name=base[:60])

    def _scope(self, body: dict, doc: Document) -> dict:
        selection = body.get("selection") or {}
        try:
            start = max(0, int(selection.get("start") or 0))
            end = max(start, int(selection.get("end") or 0))
        except (TypeError, ValueError):
            start = end = 0
        ids = [str(pid) for pid in body.get("paragraph_ids") or [] if doc.get(pid)]
        kind = "chapter"
        if not ids:
            if end > start:
                ids = doc.ids_in_range(start, end)
                kind = "selection"
            else:
                ids = [paragraph.paragraph_id for paragraph in doc.paragraphs]
        if ids and len(ids) < len(doc.paragraphs):
            kind = "selection"
        return {
            "kind": kind,
            "paragraph_ids": ids,
            "count": len(ids),
            "start": start,
            "end": end,
        }

    def _scope_label(self, session: dict, count: int | None = None) -> str:
        total = (count if count is not None
                 else len(session["scope"].get("paragraph_ids") or []))
        key = ("revision.scope_selection" if session["scope"].get("kind") == "selection"
               else "revision.scope_chapter")
        return t(key, count=total)

    def _scope_note(self, session: dict) -> str:
        return self._scope_label(session)

    # ── 消息 ─────────────────────────────
    def _message(self, session: dict, role: str, text: str, *,
                 kind: str = "text", data: dict | None = None) -> None:
        messages = session.setdefault("messages", [])
        messages.append({
            "id": "msg_" + _short_hash(f"{len(messages)}-{role}-{text}"),
            "role": role,
            "kind": kind,
            "text": str(text or ""),
            "data": data or {},
            "created": _now(),
        })
        if len(messages) > 240:
            del messages[:len(messages) - 240]

    def _agent_message(self, session: dict, text: str, **kwargs) -> None:
        self._message(session, "agent", text, **kwargs)

    # ── 视图 ─────────────────────────────
    def view(self, session: dict) -> dict:
        card = session.get("card") or {}
        question = session.get("question")
        if question and (session.get("question_answered") or session.get("answer")):
            question = None
        card_payload = card_mod.card_payload(card) if card else None
        state = session.get("state") or STATE_IDLE
        auto_step = ""
        if state == STATE_LOCATE and not question:
            auto_step = "batch" if not (card or {}).get("sample_first", True) else "sample"
        elif state == STATE_USER_CONFIRM_SAMPLE and (session.get("sample") or {}).get("status") == "pending":
            auto_step = "sample_choice"
        payload = {
            "id": session["id"],
            "title": session.get("title") or "",
            "state": state,
            "created": session.get("created") or "",
            "updated": session.get("updated") or "",
            "doc": {
                "path": session["doc"].get("path") or "",
                "chapter": session["doc"].get("chapter") or "",
                "chapter_id": session["doc"].get("chapter_id") or "",
                "text": session["doc"].get("text") or "",
                "original_text": session["doc"].get("original_text") or "",
                "chars": session["doc"].get("chars") or 0,
                "count": session["doc"].get("count") or 0,
            },
            "scope": {
                "kind": session["scope"].get("kind") or "chapter",
                "count": len(session["scope"].get("paragraph_ids") or []),
                "paragraph_ids": session["scope"].get("paragraph_ids") or [],
            },
            "options": session.get("options") or {},
            "card": card_payload,
            "preview": card.get("preview") or "",
            "question": question,
            "auto_step": auto_step,
            "plan": plan_mod.plan_payload(session.get("plan") or {}),
            "sample": session.get("sample"),
            "changes": session.get("changes") or [],
            "review": session.get("review"),
            "stop": session.get("stop"),
            "warnings": merge.aggregate_warnings(session.get("warnings") or []),
            "versions": [{
                "index": version.get("index"),
                "label": version.get("label") or "",
                "source": version.get("source") or "",
                "created": version.get("created") or "",
                "chars": version.get("chars") or 0,
                "hash": version.get("hash") or "",
            } for version in session.get("versions") or []],
            "rounds": [{
                "round": entry.get("round"),
                "cycle": entry.get("cycle"),
                "issues": entry.get("issues") or [],
                "stop_reason": entry.get("stop_reason") or "",
                "next_instruction": entry.get("next_instruction") or "",
                "change_ratio": entry.get("change_ratio") or 0,
                "targets": entry.get("targets") or [],
                "changes": [{
                    "paragraph_id": change.get("paragraph_id"),
                    "stats": change.get("stats") or {},
                } for change in entry.get("changes") or []],
                "created": entry.get("created") or "",
            } for entry in session.get("rounds") or []],
            "messages": session.get("messages") or [],
            "accepted": bool(session.get("accepted")),
            "accepted_at": session.get("accepted_at") or "",
            "answer": session.get("answer") or "",
            "stats": {
                "rounds": len(session.get("rounds") or []),
                "changes": len(session.get("changes") or []),
                "chars": session["doc"].get("chars") or 0,
            },
        }
        return payload

    # ── 第一轮：需求解析 + 改稿计划 ────────
    def plan(self, session: dict, prompt: str, *, answer: str = "",
             increment: bool = False) -> dict:
        prompt = str(prompt or "").strip()
        if not prompt and not answer and not session.get("wish"):
            raise RevisionError(t("errors.revision_no_text"))
        doc = self._doc(session)
        self.sink.check_stop()
        session["state"] = STATE_PARSE_REQ
        if prompt:
            session["wish"] = prompt
            self._message(session, "user", prompt, kind="wish")
        wish = session.get("wish") or ""
        scope_ids = [pid for pid in session["scope"].get("paragraph_ids") or []
                     if doc.get(pid)]
        if not scope_ids:
            scope_ids = [paragraph.paragraph_id for paragraph in doc.paragraphs]
        self.sink.stage("plan", "running", count=len(scope_ids))
        try:
            system, user = prompts.plan_messages(
                wish=wish, doc=doc, scope_ids=scope_ids,
                summary_text=summary_mod.render(session.get("stable_summary") or []),
                scope_note=self._scope_note(session), answer=answer,
                increment=increment,
                previous_card=session.get("card") if increment else None,
            )
            raw = self.llm.json(system, user, expect="object")
        except jsonio.ParseError as exc:
            logger.log_exception("REVISION", "plan parse failed", exc)
            session["warnings"].append({"code": "plan_parse_failed"})
            self._save(session, doc)
            raise RevisionError(t("errors.revision_plan_failed"), status=502) from exc
        self.sink.check_stop()

        direct = card_mod.wants_direct_accept(wish)
        card, question = card_mod.normalize_card(
            raw, wish=wish, scope_ids=scope_ids,
            scope_kind=session["scope"].get("kind") or "chapter",
            sample_first=session["options"].get("sample_first", True) and not direct,
            max_rounds=session["options"].get("hard_rounds", 5),
        )
        if direct:
            question = None
        plan, plan_warnings = plan_mod.normalize_plan(
            raw, doc, scope_ids,
            max_targets=session["options"].get("max_targets", 40),
            max_chars=session["options"].get("max_target_chars", 20000),
        )
        session["warnings"].extend(plan_warnings)
        summary_items = raw.get("summary")
        session["stable_summary"], _added = summary_mod.append(
            session.get("stable_summary") or [], summary_items, source="model")
        if increment and session.get("card"):
            card = card_mod.merge_increment(session["card"], card)
        session["card"] = card
        session["plan"] = plan
        if question and not session.get("question_asked"):
            session["question"] = question
            session["question_asked"] = True
        else:
            session["question"] = None
        target_count = len(plan.get("targets") or [])
        card["preview"] = card_mod.preview(
            card, scope_label=self._scope_label(session, target_count),
            scope_count=target_count)
        self._agent_message(session, card["preview"], kind="card",
                            data={"targets": len(plan.get("targets") or [])})
        if not plan.get("need_revision"):
            session["state"] = STATE_DONE
            self._agent_message(session, t("revision.no_change"), kind="notice")
            session["stop"] = None
        else:
            session["state"] = STATE_LOCATE
        self.sink.stage("plan", "done", targets=len(plan.get("targets") or []))
        self._save(session, doc)
        self._log("plan", session=session["id"], targets=len(plan.get("targets") or []),
                  question=bool(session.get("question")),
                  increment=bool(increment))
        self.sink.result("plan", self.view(session))
        return session

    # ── 追问回答 ─────────────────────────
    def answer(self, session: dict, option_id: str = "", feedback: str = "") -> dict:
        question = session.get("question") or {}
        options = question.get("options") or []
        chosen = next((option for option in options
                       if str(option.get("id")) == str(option_id)), None)
        label = str((chosen or {}).get("label") or feedback or "").strip()
        if not label:
            raise RevisionError(t("errors.revision_answer_invalid"))
        session["answer"] = label
        session["question_answered"] = True
        session["question"] = dict(question, answer=str(option_id or "custom"))
        self._message(session, "user", t("revision.answer_message", label=label),
                      kind="answer")
        doc = self._doc(session)
        if (session.get("plan") or {}).get("targets"):
            if session["options"].get("sample_first", True):
                return self.sample(session)
            return self.batch(session)
        return self.plan(session, session.get("wish") or "", answer=label,
                         increment=session.get("cycle", 1) > 1)

    # ── 样例改写 ─────────────────────────
    def sample(self, session: dict, paragraph_id: str = "") -> dict:
        plan = session.get("plan") or {}
        if not plan.get("targets"):
            raise RevisionError(t("errors.revision_no_targets"))
        doc = self._doc(session)
        pid = str(paragraph_id or session.get("sample_target") or "").strip()
        if not pid:
            pid = plan_mod.select_sample(plan, doc)
        if not doc.get(pid):
            raise RevisionError(t("errors.revision_target_missing", id=pid))
        session["sample_target"] = pid
        session["state"] = STATE_SAMPLE_REVISE
        self.sink.check_stop()
        self.sink.stage("sample", "running", paragraph_id=pid)
        feedback = self._feedback_text(session)
        full = self._take_full_document(session, doc)
        outcome = revise_mod.revise_targets(
            self.llm, doc=doc, target_ids=[pid], wish=session.get("wish") or "",
            card=session.get("card") or {}, plan=plan,
            feedback=feedback, full_document=full,
        )
        self.sink.check_stop()
        session["warnings"].extend(merge.aggregate_warnings(outcome["warnings"]))
        result = next((item for item in outcome["results"]
                       if item["paragraph_id"] == pid), None)
        if result is None or result.get("unchanged"):
            session["state"] = STATE_USER_CONFIRM_SAMPLE
            self._agent_message(session, t("revision.sample_failed"), kind="notice")
            self._save(session, doc)
            self.sink.result("sample", self.view(session))
            return session
        session["sample"] = {
            "paragraph_id": pid,
            "status": "pending",
            "feedback": list((session.get("sample") or {}).get("feedback") or []),
            **revise_mod.sample_payload(doc, pid, result["revised"],
                                        result["change_reason"],
                                        result["confidence"]),
        }
        session["state"] = STATE_USER_CONFIRM_SAMPLE
        self._agent_message(session, t("revision.sample_ready", id=pid), kind="sample",
                            data={"paragraph_id": pid})
        self.sink.stage("sample", "done", paragraph_id=pid)
        self._save(session, doc)
        self._log("sample", session=session["id"], paragraph_id=pid)
        self.sink.result("sample", self.view(session))
        return session

    def sample_choice(self, session: dict, choice: str, feedback: str = "") -> dict:
        sample = session.get("sample") or {}
        if sample.get("status") != "pending":
            raise RevisionError(t("errors.revision_sample_missing"))
        choice = str(choice or "").strip()
        if choice == "accept":
            doc = self._doc(session)
            self._apply_sample(session, doc)
            self._save(session, doc)
            return self.batch(session)
        if choice == "skip":
            session["sample"] = None
            doc = self._doc(session)
            self._save(session, doc)
            return self.batch(session)
        text = feedback or FEEDBACK_TEXT.get(choice) or FEEDBACK_TEXT["new_direction"]
        feedbacks = list(sample.get("feedback") or [])
        feedbacks.append(text)
        sample["feedback"] = feedbacks
        session["sample"] = sample
        return self.sample(session, sample.get("paragraph_id") or "")

    def _apply_sample(self, session: dict, doc: Document) -> list[dict]:
        sample = session.get("sample") or {}
        pid = sample.get("paragraph_id")
        paragraph = doc.get(pid) if pid else None
        if paragraph is None:
            session["sample"] = None
            return []
        result = {
            "paragraph_id": pid,
            "original_hash": paragraph.hash,
            "revised": sample.get("revised") or "",
            "change_reason": sample.get("reason") or "",
            "confidence": sample.get("confidence", 0.7),
        }
        changes, warnings = merge.apply_results(doc, [result])
        session["warnings"].extend(merge.aggregate_warnings(warnings))
        sample["status"] = "accepted"
        if changes:
            sample["change"] = changes[0]
        session["sample"] = sample
        session["state"] = STATE_BATCH_REVISE
        return changes

    # ── 第二轮：批量改写 + 合并 + 审核循环 ─
    def batch(self, session: dict, *, variant: bool = False) -> dict:
        plan = session.get("plan") or {}
        if not plan.get("targets"):
            raise RevisionError(t("errors.revision_no_targets"))
        doc = self._doc(session)
        session["state"] = STATE_BATCH_REVISE
        variant_feedback = ""
        if variant:
            self._push_version(session, doc, label="candidate", source="candidate")
            doc.set_texts(session["versions"][0]["texts"])
            session["sample"] = None
            session["changes"] = []
            session["review"] = None
            session["stop"] = None
            session["cycle"] = int(session.get("cycle") or 1) + 1
            session["round_in_cycle"] = 0
            session["full_text_sent"] = False
            variant_feedback = FEEDBACK_TEXT["variant"]
            session["state"] = STATE_BATCH_REVISE
        sample_changes: list[dict] = []
        sample = session.get("sample") or {}
        if sample.get("status") == "pending" and not variant:
            sample_changes = self._apply_sample(session, doc)
        elif sample.get("status") == "accepted" and not variant and sample.get("change"):
            sample_changes = [sample["change"]]
        sample_pid = (sample.get("paragraph_id") if sample.get("status") == "accepted"
                      else "")
        targets = [target["paragraph_id"] for target in plan.get("targets") or []
                   if target["paragraph_id"] != sample_pid and doc.get(target["paragraph_id"])]
        if not targets and not sample_changes:
            session["state"] = STATE_USER_CONFIRM_FINAL
            self._agent_message(session, t("revision.no_change"), kind="notice")
            session["changes"] = merge.cumulative_changes(
                doc, session["versions"][0]["texts"])
            self._save(session, doc)
            self.sink.result("batch", self.view(session))
            return session

        round_no = int(session.get("round_in_cycle") or 0) + 1
        hard = int(session["options"].get("hard_rounds") or 5)
        soft = int(session["options"].get("soft_rounds") or 3)
        current_targets = targets
        feedback = variant_feedback
        issues_text = ""
        while True:
            self.sink.check_stop()
            self.sink.stage("batch", "running", round=round_no,
                            targets=len(current_targets))
            results: list[dict] = []
            warnings: list[dict] = []
            groups = doc.groups(current_targets, max_chars=6000, max_paragraphs=6)
            for group in groups:
                self.sink.check_stop()
                outcome = revise_mod.revise_targets(
                    self.llm, doc=doc, target_ids=group,
                    wish=session.get("wish") or "",
                    card=session.get("card") or {}, plan=plan,
                    feedback=feedback, issues_text=issues_text,
                    full_document=self._take_full_document(session, doc),
                )
                results.extend(outcome["results"])
                warnings.extend(outcome["warnings"])
                self.sink.check_stop()
            self.sink.check_stop()
            changes, merge_warnings = merge.apply_results(doc, results)
            warnings.extend(merge_warnings)
            if round_no == 1 and sample_changes:
                changes = sample_changes + changes
            if not changes:
                warnings.append({"code": "no_changes"})
            session["state"] = STATE_MERGE_CHECK
            session["warnings"].extend(merge.aggregate_warnings(warnings))
            session["state"] = STATE_REVIEW
            self.sink.stage("review", "running", round=round_no)
            review = review_mod.run_layers(
                self.llm, doc=doc, changes=changes,
                card=session.get("card") or {}, plan=plan,
                summary_text=summary_mod.render(session.get("stable_summary") or []),
                wish=session.get("wish") or "", layers=self._layers(session, doc),
            )
            session["warnings"].extend(merge.aggregate_warnings(review.get("warnings") or []))
            session["review"] = review_mod.review_payload(review)
            change_ratio = rounds.change_ratio(changes, len(doc.current_text()))
            entry = {
                "round": round_no,
                "cycle": int(session.get("cycle") or 1),
                "targets": list(current_targets),
                "changes": changes,
                "issues": review.get("issues") or [],
                "review": session["review"],
                "stop_reason": "",
                "next_instruction": review.get("next_instruction") or "",
                "warnings": merge.aggregate_warnings(warnings),
                "change_ratio": change_ratio,
                "text_hashes": doc.hashes(),
                "text_snapshot": doc.snapshot(),
                "created": _now(),
            }
            session["rounds"].append(entry)
            session["round_in_cycle"] = round_no
            session["changes"] = merge.cumulative_changes(
                doc, session["versions"][0]["texts"])
            if review.get("pass"):
                session["stop"] = None
                break
            decision = rounds.evaluate(
                [item for item in session["rounds"]
                 if item.get("cycle") == session.get("cycle")],
                soft=soft, hard=hard)
            if decision:
                entry["stop_reason"] = decision.get("reason") or ""
                session["stop"] = decision
                break
            current_targets = review_mod.targeted_ids(
                review, [pid for pid in current_targets if doc.get(pid)])
            issues_text = prompts.issues_text(review.get("issues") or [])
            feedback = review.get("next_instruction") or ""
            round_no += 1
            if round_no > hard:
                session["stop"] = rounds.stop_decision("hard_limit", round_no - 1)
                break
        session["state"] = STATE_USER_CONFIRM_FINAL
        self._push_version(session, doc, label=t("revision.version_round",
                                                 round=session["round_in_cycle"]),
                           source="round", dedupe=False)
        self._agent_message(
            session,
            t("revision.final_ready", count=len(session["changes"] or [])),
            kind="final",
            data={"rounds": len(session["rounds"] or []),
                  "stop": (session.get("stop") or {}).get("reason") or ""},
        )
        self._save(session, doc)
        self._log("batch", session=session["id"], round=session["round_in_cycle"],
                  changes=len(session["changes"] or []),
                  pass_=bool((session.get("review") or {}).get("pass")),
                  stop=(session.get("stop") or {}).get("reason") or "")
        self.sink.result("batch", self.view(session))
        return session

    def _feedback_text(self, session: dict) -> str:
        parts = []
        if session.get("answer"):
            parts.append(f"用户选择：{session['answer']}")
        sample = session.get("sample") or {}
        parts.extend(sample.get("feedback") or [])
        return "\n".join(parts)

    def _take_full_document(self, session: dict, doc: Document) -> bool:
        if session.get("full_text_sent"):
            return False
        limit = int(session["options"].get("full_text_limit") or 12000)
        if len(doc.current_text()) > limit:
            return False
        session["full_text_sent"] = True
        return True

    def _layers(self, session: dict, doc: Document) -> list[str]:
        layers = ["local", "consistency"]
        mode = session["options"].get("global_review") or "auto"
        if mode == "always":
            layers.append("global")
        elif mode == "auto":
            wish = str(session.get("wish") or "")
            wants = any(word in wish for word in (
                "全局", "整体", "全篇", "全章", "统稿", "whole", "global", "overall"))
            if wants or len(doc.current_text()) <= 20000:
                layers.append("global")
        return layers

    # ── 手动复审 ─────────────────────────
    def manual_review(self, session: dict) -> dict:
        doc = self._doc(session)
        changes = merge.cumulative_changes(doc, session["versions"][0]["texts"])
        if not changes:
            raise RevisionError(t("errors.revision_no_changes"))
        session["state"] = STATE_REVIEW
        self.sink.stage("review", "running", round=session.get("round_in_cycle") or 1)
        review = review_mod.run_layers(
            self.llm, doc=doc, changes=changes,
            card=session.get("card") or {}, plan=session.get("plan") or {},
            summary_text=summary_mod.render(session.get("stable_summary") or []),
            wish=session.get("wish") or "", layers=self._layers(session, doc),
        )
        session["review"] = review_mod.review_payload(review)
        session["warnings"].extend(merge.aggregate_warnings(review.get("warnings") or []))
        if review.get("pass"):
            session["stop"] = None
        session["state"] = STATE_USER_CONFIRM_FINAL
        self._save(session, doc)
        self.sink.result("review", self.view(session))
        return session

    # ── 用户确认 ─────────────────────────
    def accept(self, session: dict) -> dict:
        doc = self._doc(session)
        session["changes"] = merge.cumulative_changes(
            doc, session["versions"][0]["texts"])
        session["accepted"] = True
        session["accepted_at"] = _now()
        session["state"] = STATE_DONE
        session["stop"] = None
        label = t("revision.version_accepted")
        versions = session.get("versions") or []
        if versions and versions[-1].get("texts") == doc.snapshot():
            # 最后一版就是当前版本：只把它标记为「已保留」，不再重复存一份正文。
            versions[-1]["label"] = label
            versions[-1]["source"] = "accept"
        else:
            self._push_version(session, doc, label=label, source="accept", dedupe=False)
        self._agent_message(session, t("revision.accepted_message",
                                       count=len(session["changes"] or [])),
                            kind="notice")
        self._save(session, doc)
        self._log("accept", session=session["id"], changes=len(session["changes"] or []))
        self.sink.result("accept", self.view(session))
        return session

    def rollback(self, session: dict, payload: dict) -> dict:
        doc = self._doc(session)
        session["state"] = STATE_ROLLBACK
        versions = session.get("versions") or []
        paragraph_ids = [str(pid) for pid in payload.get("paragraph_ids") or []
                         if doc.get(pid)]
        label = "rollback"
        if paragraph_ids:
            index = int(payload.get("to_version", 0) or 0)
            if index < 0 or index >= len(versions):
                index = 0
            snapshot = versions[index].get("texts") or []
            for pid in paragraph_ids:
                paragraph = doc.get(pid)
                if paragraph is None or paragraph.index - 1 >= len(snapshot):
                    continue
                doc.replace(pid, snapshot[paragraph.index - 1])
            label = t("revision.rollback_paragraphs", count=len(paragraph_ids))
        else:
            index = int(payload.get("version", 0) or 0)
            if payload.get("previous"):
                current_hash = _texts_hash(doc.snapshot())
                index = 0
                for version in reversed(versions):
                    if version.get("hash") and version["hash"] != current_hash:
                        index = int(version.get("index") or 0)
                        break
            if index < 0 or index >= len(versions):
                raise RevisionError(t("errors.revision_version_missing"))
            doc.set_texts(versions[index].get("texts") or doc.snapshot())
            label = t("revision.rollback_version", n=index)
        session["accepted"] = False
        session["accepted_at"] = ""
        session["stop"] = None
        session["state"] = STATE_USER_CONFIRM_FINAL
        session["changes"] = merge.cumulative_changes(
            doc, session["versions"][0]["texts"])
        self._push_version(session, doc, label=label, source="rollback", dedupe=False)
        self._agent_message(session, label, kind="rollback",
                            data={"paragraph_ids": paragraph_ids})
        self._save(session, doc)
        self._log("rollback", session=session["id"], paragraphs=len(paragraph_ids),
                  version=payload.get("version"))
        self.sink.result("rollback", self.view(session))
        return session

    # ── 增量需求 ─────────────────────────
    def increment(self, session: dict, prompt: str) -> dict:
        prompt = str(prompt or "").strip()
        if not prompt:
            raise RevisionError(t("errors.revision_no_text"))
        session["state"] = STATE_INCREMENT_REQ
        session["cycle"] = int(session.get("cycle") or 1) + 1
        session["round_in_cycle"] = 0
        session["accepted"] = False
        session["accepted_at"] = ""
        session["stop"] = None
        session["warnings"] = []
        self.plan(session, prompt, increment=True)
        if session.get("question") and not session.get("question_answered"):
            return session
        if not (session.get("plan") or {}).get("need_revision"):
            return session
        # 增量需求沿用一个已经确认过的方向，不再要求先看样例。
        return self.batch(session)

    # ── 版本 ─────────────────────────────
    def _push_version(self, session: dict, doc: Document, *, label: str,
                      source: str, dedupe: bool = True) -> None:
        texts = doc.snapshot()
        versions = session.setdefault("versions", [])
        if dedupe and versions and versions[-1].get("texts") == texts:
            return
        versions.append({
            "index": len(versions),
            "label": label,
            "source": source,
            "created": _now(),
            "texts": texts,
            "chars": len(doc.current_text()),
            "hash": _texts_hash(texts),
        })
        # 只保留最近 30 个版本，避免会话文件无限增长。
        if len(versions) > 30:
            original = versions[0]
            session["versions"] = [original] + versions[-29:]
        for index, version in enumerate(session.get("versions") or []):
            version["index"] = index

    # ── 入口 ─────────────────────────────
    def execute(self, step: str, body: dict) -> dict:
        step = str(step or "").strip().lower()
        if step not in ("plan", "answer", "sample", "sample_choice", "batch",
                        "review", "accept", "rollback", "increment", "resume",
                        "rerun"):
            raise RevisionError(t("errors.revision_step_unknown", step=step))
        session_id = str(body.get("session_id") or "").strip()
        if step == "plan" and not session_id:
            session = self.create(body)
            return self.view(self.plan(session, body.get("prompt") or ""))
        session = self.load(session_id)
        if step == "resume":
            return self.view(session)
        if step == "plan":
            if session.get("rounds"):
                return self.view(self.increment(session, body.get("prompt") or ""))
            return self.view(self.plan(session, body.get("prompt") or ""))
        if step == "answer":
            session = self.answer(session, body.get("option_id") or "",
                                  body.get("feedback") or "")
            return self.view(session)
        if step == "sample":
            return self.view(self.sample(session, body.get("paragraph_id") or ""))
        if step == "sample_choice":
            session = self.sample_choice(session, body.get("choice") or "",
                                         body.get("feedback") or "")
            return self.view(session)
        if step in ("batch", "rerun"):
            session = self.batch(session, variant=(step == "rerun"))
            return self.view(session)
        if step == "review":
            return self.view(self.manual_review(session))
        if step == "accept":
            return self.view(self.accept(session))
        if step == "rollback":
            return self.view(self.rollback(session, body))
        return self.view(self.increment(session, body.get("prompt") or ""))
