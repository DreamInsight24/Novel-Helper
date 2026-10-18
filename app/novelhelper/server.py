#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
novelhelper/server.py
本地 HTTP 服务：静态页面 + JSON 接口（只绑定 127.0.0.1）。
"""
from __future__ import annotations

import json
import mimetypes
import re
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from . import ai, context, elements as el, history, project, prompts as prompts_mod, store

MAX_BODY = 128 * 1024 * 1024  # 128 MB，够放整章正文

# 同一时间只允许一个 AI 生成任务。前端会锁定整个工作站，后端再兜一层，
# 避免误触、重复点击或另一个标签页同时写入。
_RUN_LOCK = threading.Lock()
_RUN_STATE = {"busy": False, "started": "", "mode": "", "transport": ""}

WORK_TO_TOOL = {
    "logic": "reason",
    "outline": "reason",
    "draft": "write",
    "polish": "fix",
    "brainstorm": "idea",
}


def _compact_selection(selection: dict) -> dict:
    """历史里只保存指针与输入文本，不重复保存设定内容与项目文件正文。"""
    data = json.loads(json.dumps(selection or {}, ensure_ascii=False))
    data.pop("prompt", None)
    data.pop("work_prompt", None)
    files = []
    for entry in data.get("project_files") or []:
        if isinstance(entry, dict):
            files.append({"path": entry.get("path") or "", "label": entry.get("label") or ""})
        elif isinstance(entry, str):
            files.append({"path": entry})
    data["project_files"] = files
    return data


def _json_default(obj):
    if isinstance(obj, Path):
        return str(obj)
    raise TypeError(f"无法序列化: {type(obj)}")


class Handler(BaseHTTPRequestHandler):
    server_version = "NovelHelper/3.0"
    protocol_version = "HTTP/1.1"

    # ── 基础响应 ─────────────────────────────
    def _send(self, status: int, body: bytes, content_type: str):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, payload, status: int = 200):
        body = json.dumps(payload, ensure_ascii=False, default=_json_default).encode("utf-8")
        self._send(status, body, "application/json; charset=utf-8")

    def _error(self, message: str, status: int = 400, detail: str = ""):
        self._json({"ok": False, "error": message, "detail": detail}, status=status)

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        if length > MAX_BODY:
            raise ValueError("请求体过大")
        raw = self.rfile.read(length)
        if not raw.strip():
            return {}
        return json.loads(raw.decode("utf-8"))

    def log_message(self, fmt, *args):  # noqa: A003
        print(f"[novelhelper] {self.address_string()} {fmt % args}")

    # ── 路由 ─────────────────────────────────
    def do_GET(self):  # noqa: N802
        self._dispatch("GET")

    def do_HEAD(self):  # noqa: N802
        self._dispatch("GET")

    def _dispatch(self, method: str):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        query = parse_qs(parsed.query)
        try:
            if path.startswith("/api/"):
                self._api(method, path, query)
            else:
                self._static(path)
        except PermissionError as exc:
            self._error(str(exc), status=403)
        except FileNotFoundError as exc:
            self._error(f"找不到文件: {exc}", status=404)
        except ai.AIError as exc:
            self._error(str(exc), status=502, detail=str(exc))
        except Exception as exc:  # noqa: BLE001
            self._error(f"{type(exc).__name__}: {exc}", status=500, detail=traceback.format_exc()[-2000:])

    def do_POST(self):  # noqa: N802
        self._dispatch("POST")

    def do_PUT(self):  # noqa: N802
        self._dispatch("POST")

    def do_DELETE(self):  # noqa: N802
        self._dispatch("DELETE")

    # ── 静态资源 ─────────────────────────────
    def _static(self, path: str):
        rel = "index.html" if path in ("/", "") else path.lstrip("/")
        target = (store.WEB_DIR / rel).resolve()
        try:
            target.relative_to(store.WEB_DIR.resolve())
        except ValueError:
            self._error("非法路径", status=403)
            return
        if not target.exists() or target.is_dir():
            self._error(f"资源不存在: {rel}", status=404)
            return
        ctype = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        self._send(200, target.read_bytes(), ctype)

    # ── API ──────────────────────────────────
    def _api(self, method: str, path: str, query: dict):
        if method == "GET" and path == "/api/state":
            self._json({
                "ok": True,
                "collections": store.load_all(),
                "sources": project.import_sources(),
                "chapters": project.list_chapters(),
                "io": project.list_text(),
                "root": str(store.PROJECT_ROOT),
                "data_dir": str(store.DATA_DIR),
                "export_dir": str(store.io_out()),
                "import_dir": str(store.io_in()),
                "text_dir": str(store.text_dir()),
                "work_modes": prompts_mod.WORK_MODES,
                "api_ready": bool(((store.load("config").get("api") or {}).get("api_key"))),
            })
            return

        if path == "/api/workstation/status" and method == "GET":
            self._json({"ok": True, **_RUN_STATE})
            return

        if path == "/api/workstation/modes" and method == "GET":
            self._json({"ok": True, "modes": prompts_mod.WORK_MODES})
            return

        if path == "/api/history" and method == "GET":
            self._json({"ok": True, "items": history.list_sessions(),
                        "current": history.current_session_id()})
            return

        history_match = re.match(r"^/api/history/([A-Za-z0-9_-]+)$", path)
        if history_match and method == "GET":
            session = history.load_session(history_match.group(1))
            if session is None:
                self._error("对话不存在或已被删除", status=404)
                return
            self._json({"ok": True, "session": history.session_for_client(session, store.load_all())})
            return

        match = re.match(r"^/api/collections/([a-z_]+)$", path)
        if match:
            name = match.group(1)
            if method == "GET":
                self._json({"ok": True, "name": name, "data": store.load(name)})
                return
            body = self._body()
            saved = store.save(name, body.get("data"))
            self._json({"ok": True, "saved": str(saved)})
            return

        if path == "/api/file" and method == "GET":
            rel = (query.get("path") or [""])[0]
            self._json({"ok": True, "path": rel, "content": project.read_text(rel)})
            return

        if path == "/api/import" and method == "POST":
            self._import()
            return

        if path == "/api/export" and method == "POST":
            body = self._body()
            coll = body.get("collection") or ""
            if not store.known_collection(coll):
                self._error(f"未知集合: {coll}")
                return
            db = store.load_all()
            fmt = (body.get("format") or "txt").lower()
            if fmt == "json":
                target = project.save_json(coll, db, body.get("filename") or "")
            else:
                target = project.save_txt(coll, db, body.get("filename") or "")
            self._json({"ok": True, "path": str(target), "rel": project.rel_str(target)})
            return

        if path == "/api/backup" and method == "POST":
            target = store.backup_all()
            self._json({"ok": True, "path": str(target)})
            return

        if path == "/api/move" and method == "POST":
            self._move()
            return

        if path == "/api/sections/auto-sort" and method == "POST":
            self._auto_sort()
            return

        if path == "/api/output" and method == "POST":
            body = self._body()
            content = body.get("content") or ""
            if not content.strip():
                self._error("内容为空，未保存")
                return
            target = project.write_output(content, body.get("mode") or "AI 工作站生成", (body.get("name") or "").strip())
            self._json({"ok": True, "path": str(target), "rel": project.rel_str(target),
                        "chapters": project.list_chapters()})
            return

        if path == "/api/plan" and method == "POST":
            body = self._body()
            target = project.write_plan(body.get("content") or "", body.get("chapter") or "")
            self._json({"ok": True, "path": str(target), "rel": project.rel_str(target)})
            return

        if path == "/api/txt" and method == "POST":
            body = self._body()
            target = project.write_txt_from_md(
                body.get("path") or "",
                blank_mode=body.get("blank_mode") or "compact",
                keep_advice=bool(body.get("keep_advice")),
            )
            self._json({"ok": True, "path": str(target), "size": target.stat().st_size})
            return

        if path == "/api/io/save" and method == "POST":
            body = self._body()
            target = project.write_text(
                body.get("path") or "",
                body.get("content") or "",
                encoding=body.get("encoding") or "utf-8",
            )
            self._json({"ok": True, "path": str(target), "io": project.list_io()})
            return

        if path == "/api/io/export" and method == "POST":
            body = self._body()
            target = project.write_external(
                body.get("path") or "",
                body.get("content") or "",
                encoding=body.get("encoding") or "utf-8",
            )
            self._json({"ok": True, "path": str(target), "size": target.stat().st_size})
            return

        if path == "/api/io/browse" and method == "GET":
            self._json({"ok": True, **project.browse((query.get("path") or [""])[0])})
            return

        if path == "/api/prompts/default" and method == "GET":
            tool = (query.get("tool") or [""])[0]
            group = (query.get("group") or ["tool"])[0]
            if group == "work":
                text = prompts_mod.WORK_PROMPTS.get(tool, "")
            else:
                text = prompts_mod.TOOL_PROMPTS.get(tool) or prompts_mod.default_prompts()["tools"].get(tool, "")
            self._json({
                "ok": True,
                "tool": tool,
                "group": group,
                "text": text,
                "sections": prompts_mod.DEFAULT_SECTIONS,
            })
            return

        if path == "/api/ai/preview" and method == "POST":
            body = self._body()
            db = store.load_all()
            assembled = context.assemble(
                db.get("config") or store.default_config(), db,
                db.get("prompts") or prompts_mod.default_prompts(),
                body.get("selection") or {}, plan=body.get("plan") or "",
                mode=body.get("mode") or "write",
                work_prompt=body.get("work_prompt") or "",
                work_mode=body.get("work_mode") or "draft",
            )
            self._json({"ok": True, "system": assembled["system"], "user": assembled["user"]})
            return

        if path == "/api/ai/ping" and method == "POST":
            config = (self._body() or {}).get("config") or store.load("config")
            self._json({"ok": True, "result": ai.ping(config)})
            return

        if path == "/api/ai/run" and method == "POST":
            self._ai_run()
            return

        if path == "/api/workstation/run" and method == "POST":
            self._workstation_run()
            return

        if path == "/api/history/current" and method == "POST":
            body = self._body()
            session = history.set_current(body.get("id") or "")
            self._json({"ok": True, "current": history.current_session_id(),
                        "session": history.session_for_client(session, store.load_all()) if session else None})
            return

        if path == "/api/history/new" and method == "POST":
            body = self._body()
            session = history.create_session(body.get("title") or "",
                                             body.get("mode") or "draft")
            self._json({"ok": True, "session": history.session_for_client(session, store.load_all())})
            return

        if history_match and method == "DELETE":
            ok = history.delete_session(history_match.group(1))
            self._json({"ok": ok, "current": history.current_session_id()})
            return

        self._error(f"未知接口: {path}", status=404)

    # ── 导入 ─────────────────────────────────
    def _import(self):
        body = self._body()
        kind = body.get("kind") or "md"
        source = body.get("source") or ""
        target = body.get("target") or "other"
        if str(source).lower().endswith(".md") and (kind != "md" or target != "other"):
            self._error("Markdown（.md）现在只支持导入到「其他设定」；"
                        "导入后可用「搬运到…」转为自定义设定的条目。")
            return
        text = project.read_text(source)
        blobs = store.load_all()

        if kind == "worldmap":
            world = project.parse_worldmap(text, name=body.get("name") or "")
            if not world:
                self._error("没有找到含「方位」表头的 Markdown 表格")
                return
            store.save("worldmap", world)
            self._json({"ok": True, "message": f"已导入地图：{len(world['regions'])} 个区域",
                        "collections": store.load_all()})
            return

        if kind == "memories":
            incoming = project.import_memories(text, source)
            data = blobs.get("memories") or store.default_for("memories")
            items, added, updated = project.merge_records(
                data.get("items") or [], incoming, key="title", key_fields=["category", "title"])
            data["items"] = items
            store.save("memories", data)
            self._json({"ok": True, "message": f"{source}：新增 {added} 条记忆，更新 {updated} 条",
                        "collections": store.load_all()})
            return

        if kind == "json":
            incoming = project.import_json(text, target)
            data = blobs.get(target) or store.default_for(target)
            key = "title" if target == "memories" else "name"
            items, added, updated = project.merge_records(data.get("items") or [], incoming, key=key)
            data["items"] = items
            store.save(target, data)
            self._json({"ok": True, "message": f"{source} → {target}：新增 {added} 条，更新 {updated} 条",
                        "collections": store.load_all()})
            return

        # 默认：md / txt → other（原文入库，不做猜测性解析）
        incoming = project.records_from_md(text, source)
        data = blobs.get("other") or store.default_for("other")
        items, added, updated = project.merge_records(
            data.get("items") or [], incoming, key="name", key_fields=["source", "category", "name"])
        data["items"] = items
        store.save("other", data)

        meta = store.load("meta")
        meta.setdefault("last_import", {})[source] = store.now_str()
        store.save("meta", meta)
        self._json({"ok": True, "message": f"{source} → 其他设定：新增 {added} 条，更新 {updated} 条",
                    "collections": store.load_all()})

    # ── 跨集合搬运 ───────────────────────────
    def _auto_sort(self):
        """按栏目配置里的 auto_from，把「其他设定」里的旧内容归位。"""
        body = self._body()
        only = body.get("only") or ""
        sections = store.load("sections")
        other = store.load("other")
        pool = other.get("items") or []
        report = []
        moved_total = 0
        for section in sections.get("items") or []:
            key = (section.get("key") or "").strip()
            if not key or (only and key != only):
                continue
            if section.get("on", True) is False:
                continue
            wanted = set(section.get("auto_from") or [])
            if not wanted:
                continue
            target_name = store.section_store_name(key)
            target = store.load(target_name)
            bucket = target.get("items") or []
            moving = [rec for rec in pool if (rec.get("category") or "") in wanted]
            if not moving:
                continue
            bucket.extend(moving)
            target["items"] = bucket
            store.save(target_name, target)
            pool = [rec for rec in pool if (rec.get("category") or "") not in wanted]
            moved_total += len(moving)
            report.append(f"{section.get('label') or key} ← {len(moving)} 条")
        other["items"] = pool
        store.save("other", other)
        message = ("已归类：" + "；".join(report)) if report else "没有匹配到可自动归类的条目"
        self._json({"ok": True, "moved": moved_total, "message": message,
                    "detail": report, "collections": store.load_all()})

    def _move(self):
        body = self._body()
        src_coll = body.get("from") or ""
        dst_coll = body.get("to") or ""
        ids = body.get("ids") or ([body.get("id")] if body.get("id") else [])
        keep = bool(body.get("keep"))
        movable = set(store.RECORD_COLLECTIONS) | set(store.section_names())
        if src_coll not in movable or dst_coll not in movable:
            self._error("不支持的集合")
            return
        src = store.load(src_coll)
        dst = store.load(dst_coll)
        src_items = src.get("items") or []
        dst_items = dst.get("items") or []
        moved = 0
        for rid in ids:
            rec = next((r for r in src_items if r.get("id") == rid), None)
            if not rec:
                continue
            name = rec.get("name") or rec.get("title") or "未命名"
            body_text = (rec.get("content") or "").strip()
            if dst_coll == "memories":
                new_rec = {
                    "id": store.new_id("mm"), "title": name,
                    "category": body.get("category") or "设定备忘",
                    "chapter": "", "content": body_text or rec.get("notes") or "",
                    "source": rec.get("source") or f"来自{src_coll}", "tags": [],
                    "created": store.now_str(), "updated": store.now_str(),
                }
            elif dst_coll in ("characters", "factions", "items", "equipment"):
                prefix = {"characters": "ch", "factions": "fa", "items": "it", "equipment": "eq"}[dst_coll]
                new_rec = {
                    "id": store.new_id(prefix), "name": name, "tag": rec.get("tag") or "",
                    "elements": el.from_preset(store.schema_for(dst_coll)),
                    "notes": body_text, "tags": [],
                    "source": rec.get("source") or f"来自{src_coll}",
                    "created": store.now_str(), "updated": store.now_str(),
                }
                if dst_coll in ("items", "equipment"):
                    new_rec["category"] = rec.get("category") or ("服饰" if dst_coll == "equipment" else "道具")
                if dst_coll == "equipment":
                    new_rec["slot"] = "上衣"
                if dst_coll == "characters":
                    new_rec["inventory"] = []
                    new_rec["equipment"] = []
                if dst_coll == "factions":
                    new_rec["members"] = []
            else:
                # 其他设定 / 自定义栏目：原文保留，元素树留空
                label = "其他设定"
                if store.is_section(dst_coll):
                    wanted_key = store.section_key(dst_coll)
                    for section in (store.load("sections").get("items") or []):
                        if (section.get("key") or "") == wanted_key:
                            label = section.get("label") or wanted_key
                            break
                new_rec = {
                    "id": store.new_id("ot"), "name": name, "tag": rec.get("tag") or "",
                    "category": label, "elements": [], "content": body_text,
                    "tags": [],
                    "source": rec.get("source") or f"来自{src_coll}",
                    "created": store.now_str(), "updated": store.now_str(),
                }
            dst_items.append(new_rec)
            moved += 1
            if not keep:
                src_items.remove(rec)
        src["items"] = src_items
        dst["items"] = dst_items
        store.save(src_coll, src)
        store.save(dst_coll, dst)
        self._json({"ok": True, "moved": moved, "message": f"已搬运 {moved} 条 → {dst_coll}",
                    "collections": store.load_all()})

    # ── 模型调用 ─────────────────────────────
    def _ai_run(self):
        body = self._body()
        tool = body.get("tool") or "write"
        db = store.load_all()
        config = body.get("config") or db.get("config") or store.default_config()
        prm = db.get("prompts") or prompts_mod.default_prompts()
        selection = body.get("selection") or {}
        plan = body.get("plan") or ""
        override = body.get("override") or {}
        text = body.get("text") or ""

        if tool == "summarize":
            content = project.extract_body(text) if body.get("from_output", True) else text
            if not content.strip():
                self._error("没有可总结的正文内容")
                return
            user = content.strip()
            if body.get("chapter"):
                user = f"（章节：{body['chapter']}）\n\n{user}"
            messages = [{"role": "system", "content": prm["tools"].get("summarize", "")},
                        {"role": "user", "content": user}]
        elif tool in ("compress", "restyle", "fix"):
            messages = [{"role": "system", "content": prm["tools"].get(tool, "")},
                        {"role": "user", "content": text}]
        else:
            mode = "reason" if tool == "reason" else ("idea" if tool == "idea" else "write")
            assembled = context.assemble(config, db, prm, selection, plan=plan, mode=mode)
            messages = [{"role": "system", "content": assembled["system"]},
                        {"role": "user", "content": assembled["user"]}]

        result = ai.chat(config, tool if tool in prm["tools"] else "write", messages, override=override)
        result["ok"] = True
        result["tool"] = tool
        self._json(result)

    # ── AI 工作站 ────────────────────────────
    def _workstation_run(self):
        body = self._body()
        work_mode = body.get("work_mode") or body.get("mode") or "draft"
        if work_mode not in prompts_mod.WORK_PROMPTS:
            self._error(f"未知的工作模式: {work_mode}")
            return
        if not _RUN_LOCK.acquire(blocking=False):
            self._error("AI 正在生成中，工作站已锁定。请等待本次生成完成。", status=409)
            return
        _RUN_STATE.update(busy=True, started=store.now_str(), mode=work_mode, transport="")
        try:
            db = store.load_all()
            config = body.get("config") or db.get("config") or store.default_config()
            prm = db.get("prompts") or prompts_mod.default_prompts()
            selection = body.get("selection") or {}
            user_prompt = body.get("prompt") or selection.get("prompt") or ""
            work_prompt = body.get("work_prompt") or ""

            assembled = context.assemble(
                config, db, prm, dict(selection, prompt=user_prompt),
                mode="work", work_prompt=work_prompt, work_mode=work_mode,
            )
            messages = [
                {"role": "system", "content": assembled["system"]},
                {"role": "user", "content": assembled["user"]},
            ]
            tool_key = WORK_TO_TOOL.get(work_mode, "write")
            result = ai.chat(config, tool_key, messages, override=body.get("override") or {})
            _RUN_STATE["transport"] = result.get("transport", "")

            session_id = body.get("session_id") or history.current_session_id()
            session = history.load_session(session_id) if session_id else None
            if session is None:
                session = history.create_session(
                    history._title_from_prompt(user_prompt, work_mode), work_mode)
                session_id = session["id"]

            saved = history.append_turn(
                session_id,
                mode=work_mode,
                user_prompt=user_prompt,
                output=result["text"],
                selection=_compact_selection(selection),
                work_prompt=work_prompt,
                meta={
                    "model": result.get("model", ""),
                    "effort": result.get("effort", ""),
                    "elapsed": result.get("elapsed", 0),
                    "usage": result.get("usage") or {},
                    "transport": result.get("transport", ""),
                    "system_chars": len(assembled["system"]),
                    "input_chars": len(assembled["user"]),
                    "output_chars": len(result.get("text") or ""),
                },
            )

            # 同步一份到 state，刷新页面后仍能看到最近一次输出与当前会话。
            # 历史已经落盘；state 写入失败不应让本次生成结果丢失。
            try:
                state = store.load("state")
                ws = state.setdefault("workstation", store.default_workstation())
                ws.update({
                    "mode": work_mode,
                    "prompt": user_prompt,
                    "work_prompt": work_prompt,
                    "current_state": selection.get("current_state") or "",
                    "extra": selection.get("extra") or "",
                    "output": result.get("text") or "",
                    "last_tool": work_mode,
                    "current_session": session_id,
                    "viewing_session": "",
                    "selection": _compact_selection(selection),
                })
                state["updated"] = store.now_str()
                store.save("state", state)
            except Exception:
                pass

            payload = dict(result)
            payload.update({
                "ok": True,
                "work_mode": work_mode,
                "session_id": session_id,
                "session": history.session_for_client(saved, db),
                "turn": saved.get("last_turn") or {},
                "request": {
                    "system_chars": len(assembled["system"]),
                    "user_chars": len(assembled["user"]),
                },
            })
            self._json(payload)
        finally:
            _RUN_STATE.update(busy=False, started="", mode="", transport="")
            _RUN_LOCK.release()


def serve(host: str = "127.0.0.1", port: int = 8765) -> ThreadingHTTPServer:
    store.ensure_dirs()
    httpd = ThreadingHTTPServer((host, port), Handler)
    httpd.daemon_threads = True
    return httpd
