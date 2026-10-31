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

import json

from .. import elements as el, logger, project, store


class _RecordMixin:
    def _import(self):
        body = self._body()
        kind = body.get("kind") or "md"
        source = body.get("source") or ""
        target = body.get("target") or "other"
        if str(source).lower().endswith(".md") and (kind != "md" or target != "other"):
            self._error(t('errors.md_import_target'))
            return
        text = project.read_text(source)
        blobs = store.load_all()

        if kind == "worldmap":
            world = project.parse_worldmap(text, name=body.get("name") or "")
            if not world:
                self._error(t('errors.map_table_format'))
                return
            store.save("worldmap", world)
            logger.log_event("IMPORT", "map", source=source, regions=len(world.get("regions") or {}))
            self._json({"ok": True, "message": t('messages.map_imported', count=len(world['regions'])),
                        "collections": store.load_all()})
            return

        if kind == "memories":
            incoming = project.import_memories(text, source)
            data = blobs.get("memories") or store.default_for("memories")
            items, added, updated = project.merge_records(
                data.get("items") or [], incoming, key="title", key_fields=["category", "title"])
            data["items"] = items
            store.save("memories", data)
            logger.log_event("IMPORT", "memories", source=source, added=added, updated=updated)
            self._json({"ok": True, "message": t('messages.memory_imported', source=source, added=added, updated=updated),
                        "collections": store.load_all()})
            return

        if kind == "json":
            allowed = set(store.RECORD_COLLECTIONS) | set(store.section_names()) | {"worldmap"}
            if target not in allowed:
                self._error(t('errors.unknown_import_target', name=target))
                return
            try:
                if target == "worldmap":
                    world = project.import_worldmap_json(text, name=body.get("name") or "")
                    store.save("worldmap", world)
                    logger.log_event("IMPORT", "map_json", source=source,
                                     regions=len(world.get("regions") or {}))
                    self._json({
                        "ok": True,
                        "message": t('messages.map_imported', count=len(world.get('regions') or {})),
                        "collections": store.load_all(),
                    })
                    return
                incoming = project.import_json(text, target)
                incoming = project.validate_import_records(incoming, target)
            except (ValueError, json.JSONDecodeError) as exc:
                self._error(t('errors.json_format', detail=exc))
                return
            data = blobs.get(target) or store.default_for(target)
            key = "title" if target == "memories" else "name"
            key_fields = ["category", "title"] if target == "memories" else [key]
            items, added, updated = project.merge_records(
                data.get("items") or [], incoming, key=key, key_fields=key_fields)
            data["items"] = items
            store.save(target, data)
            logger.log_event("IMPORT", "json", source=source, target=target,
                             added=added, updated=updated)
            self._json({"ok": True, "message": t('messages.imported_stats', source=source, target=target, added=added, updated=updated),
                        "collections": store.load_all()})
            return

        # 默认：md / txt → other（原文入库，不做猜测性解析）
        incoming = project.records_from_md(text, source)
        data = blobs.get("other") or store.default_for("other")
        items, added, updated = project.merge_records(
            data.get("items") or [], incoming, key="name", key_fields=["source", "category", "name"])
        data["items"] = items
        store.save("other", data)
        logger.log_event("IMPORT", "markdown", source=source, added=added, updated=updated)

        meta = store.load("meta")
        meta.setdefault("last_import", {})[source] = store.now_str()
        store.save("meta", meta)
        self._json({"ok": True, "message": t('messages.imported_other', source=source, added=added, updated=updated),
                    "collections": store.load_all()})

    def _auto_sort(self):
        """按栏目配置里的 auto_from，把「其他设定」里的旧内容归位。"""
        body = self._body()
        only = body.get("only") or ""
        sections = store.load("sections")
        other = store.load("other")
        pool = other.get("items") or []
        report = []
        graph = store.load_all().get("relations") or {"items": [], "initialized": True}
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
            moving_ids = {rec.get("id") for rec in moving}
            for edge in graph.get("items", []):
                for end in ("source", "target"):
                    if edge[end]["collection"] == "other" and edge[end]["id"] in moving_ids:
                        edge[end]["collection"] = target_name
            bucket.extend(moving)
            target["items"] = bucket
            store.save(target_name, target)
            pool = [rec for rec in pool if (rec.get("category") or "") not in wanted]
            moved_total += len(moving)
            report.append(t('messages.auto_sort_line', section=section.get('label') or key, count=len(moving)))
        other["items"] = pool
        store.save("other", other)
        store.save("relations", graph)
        message = t("messages.auto_sorted", report="; ".join(report)) if report else t('messages.auto_sort_none')
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
            self._error(t('errors.collection_unsupported'))
            return
        src = store.load(src_coll)
        dst = store.load(dst_coll)
        src_items = src.get("items") or []
        dst_items = dst.get("items") or []
        graph = store.load_all().get("relations") or {"items": [], "initialized": True}
        moved = 0
        for rid in ids:
            rec = next((r for r in src_items if r.get("id") == rid), None)
            if not rec:
                continue
            name = rec.get("name") or rec.get("title") or t("defaults.record.unnamed")
            body_text = (rec.get("content") or "").strip()
            if dst_coll == "memories":
                new_rec = {
                    "id": store.new_id("mm"), "title": name,
                    "category": body.get("category") or t("defaults.memory.note"),
                    "chapter": "", "content": body_text or rec.get("notes") or "",
                    "source": rec.get("source") or t("defaults.source.from", source=src_coll), "tags": [],
                    "created": store.now_str(), "updated": store.now_str(),
                }
            elif dst_coll in ("characters", "factions", "items"):
                prefix = {"characters": "ch", "factions": "fa", "items": "it"}[dst_coll]
                new_rec = {
                    "id": store.new_id(prefix), "name": name, "tag": rec.get("tag") or "",
                    "elements": el.from_preset(store.schema_for(dst_coll)),
                    "notes": body_text, "tags": [],
                    "source": rec.get("source") or t("defaults.source.from", source=src_coll),
                    "created": store.now_str(), "updated": store.now_str(),
                }
                if dst_coll == "items":
                    new_rec["category"] = rec.get("category") or t("defaults.category.item")
                if dst_coll == "characters":
                    new_rec["inventory"] = []
                    new_rec["equipment"] = []
                if dst_coll == "factions":
                    new_rec["members"] = []
            else:
                # 其他设定 / 自定义栏目：原文保留，元素树留空
                label = t("defaults.category.other_setting")
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
                    "source": rec.get("source") or t("defaults.source.from", source=src_coll),
                    "created": store.now_str(), "updated": store.now_str(),
                }
            if not keep:
                for edge in graph.get("items", []):
                    for end in ("source", "target"):
                        if edge[end] == {"collection": src_coll, "id": rid}:
                            edge[end] = {"collection": dst_coll, "id": new_rec["id"]}
            dst_items.append(new_rec)
            moved += 1
            if not keep:
                src_items.remove(rec)
        src["items"] = src_items
        dst["items"] = dst_items
        store.save(src_coll, src)
        store.save(dst_coll, dst)
        store.save("relations", graph)
        logger.log_event("DATA", "move", source=src_coll, target=dst_coll,
                         count=moved, keep=keep)
        self._json({"ok": True, "moved": moved, "message": t('messages.moved', count=moved, target=dst_coll),
                    "collections": store.load_all()})
