from __future__ import annotations

from ..localization import t
from .. import localization
from .. import APP_VERSION

import re

from .. import ai, context, history, logger, project, prompts as prompts_mod, providers, store
from ._helpers import _api_ready, _surface_error
from ._state import _RUN_STATE


class _ApiMixin:
    def _api(self, method: str, path: str, query: dict):
        if method == "GET" and path == "/api/i18n":
            self._json({**localization.get_languages(), "version": APP_VERSION})
            return
        if method == "GET" and path.startswith("/api/i18n/"):
            lang = localization.resolve_language(path[len("/api/i18n/"):])
            self._json({"lang": lang, "messages": localization.get_translations(lang)})
            return
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
                "debug": store.DEBUG_MODE,
                "runtime_root": str(store.RUNTIME_ROOT),
                "log_file": str(logger.session_file()),
                "providers": providers.public_providers(),
                "default_modes": prompts_mod.default_modes(),
                "efforts": list(providers.EFFORTS),
                "api_ready": _api_ready(store.load("config")),
            })
            return

        if path == "/api/workstation/status" and method == "GET":
            self._json({"ok": True, **_RUN_STATE})
            return

        if path == "/api/workstation/modes" and method == "GET":
            self._json({"ok": True, "modes": store.load("modes").get("items") or []})
            return

        if path == "/api/history" and method == "GET":
            self._json({"ok": True, "items": history.list_sessions(),
                        "current": history.current_session_id()})
            return

        history_match = re.match(r"^/api/history/([A-Za-z0-9_-]+)$", path)
        if history_match and method == "GET":
            session = history.load_session(history_match.group(1))
            if session is None:
                self._error(t('errors.session_missing'), status=404)
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
            logger.log_event("DATA", "save", collection=name, path=str(saved))
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
                self._error(t('errors.unknown_collection', name=coll))
                return
            db = store.load_all()
            fmt = (body.get("format") or "txt").lower()
            if fmt == "json":
                target = project.save_json(coll, db, body.get("filename") or "")
            else:
                target = project.save_txt(coll, db, body.get("filename") or "")
            logger.log_event("DATA", "export", collection=coll, format=fmt, path=str(target))
            self._json({"ok": True, "path": str(target), "rel": project.rel_str(target)})
            return

        if path == "/api/backup" and method == "POST":
            target = store.backup_all()
            logger.log_event("DATA", "backup", path=str(target))
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
                self._error(t('errors.empty_not_saved'))
                return
            target = project.write_output(content, body.get("mode") or "AI 工作站生成", (body.get("name") or "").strip())
            logger.log_event("DATA", "output", path=str(target), chars=len(content))
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

        if path == "/api/models" and method == "POST":
            body = self._body()
            config = body.get("config") or store.load("config")
            result = ai.list_models(config)
            logger.log_event("MODEL", "list", provider=result.get("provider"),
                             endpoint=result.get("endpoint"), count=len(result.get("models") or []))
            self._json({"ok": True, **result})
            return

        if path == "/api/client-log" and method == "POST":
            body = self._body()
            logger.log_event(
                "CLIENT", body.get("level") or "info",
                message=body.get("message") or "",
                detail=body.get("detail") or "",
            )
            self._json({"ok": True})
            return

        if path == "/api/ai/preview" and method == "POST":
            body = self._body()
            db = store.load_all()
            mode_id = body.get("mode_id") or body.get("work_mode") or "draft"
            mode = context.find_mode(db, mode_id)
            if mode is None:
                self._error(t('errors.mode_missing', id=mode_id))
                return
            surface = (body.get("surface") or "").strip()
            if surface:
                error = _surface_error(mode, surface)
                if error:
                    self._error(error)
                    return
            assembled = context.assemble_mode(
                db.get("config") or store.default_config(), db,
                dict(body.get("selection") or {}, prompt=body.get("prompt") or ""), mode,
                work_prompt=body.get("work_prompt") or "",
                source_text=body.get("source_text") or "",
            )
            self._json({"ok": True, "system": assembled["system"], "user": assembled["user"]})
            return

        if path == "/api/ai/ping" and method == "POST":
            body = self._body()
            config = body.get("config") or store.load("config")
            self._json({"ok": True, "result": ai.ping(config, body.get("model") or "")})
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

        self._error(t('errors.unknown_api', path=path), status=404)
