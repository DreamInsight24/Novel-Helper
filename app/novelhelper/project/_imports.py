"""Import conversion and record validation."""
from __future__ import annotations

from ..localization import t

import json

from ..store import new_id, now_str
from ._parsers import _nested_to_elements, parse_name_tag, split_sections


def records_from_md(text: str, source: str, category: str = "导入") -> list:
    """把一份 md 按最细一级小节切分，原文整体收进 other（不做猜测性解析）。"""
    sections = split_sections(text)
    records = []
    for sec in sections:
        if sec["level"] < 2 or not sec["content"]:
            continue
        has_child = any(
            other["level"] > sec["level"] and other["parent_title"] == sec["title"]
            for other in sections
        )
        if has_child:
            continue
        name, tag = parse_name_tag(sec["title"])
        records.append({
            "id": new_id("ot"),
            "name": name,
            "tag": tag,
            "category": sec["parent_title"] or category,
            "elements": [],
            "content": sec["content"].strip(),
            "source": source,
            "tags": [],
            "created": now_str(),
            "updated": now_str(),
        })
    if not records:
        body = (text or "").strip()
        if body:
            records.append({
                "id": new_id("ot"),
                "name": Path(source).stem or "未命名导入",
                "tag": "",
                "category": category,
                "elements": [],
                "content": body,
                "source": source,
                "tags": [],
                "created": now_str(),
                "updated": now_str(),
            })
    return records


def merge_records(existing: list, incoming: list, key: str = "name",
                  key_fields: list | None = None) -> tuple:
    index = {}
    for rec in existing:
        index.setdefault(_key_of(rec, key, key_fields), rec)
    added = updated = 0
    for rec in incoming:
        current = index.get(_key_of(rec, key, key_fields))
        if current is None:
            existing.append(rec)
            index[_key_of(rec, key, key_fields)] = rec
            added += 1
        else:
            for field in ("elements", "notes", "content", "tag", "role", "category", "title", "source"):
                if field in rec and rec[field] not in (None, "", []):
                    current[field] = rec[field]
            current["updated"] = now_str()
            updated += 1
    return existing, added, updated


def _key_of(rec: dict, key: str, key_fields: list | None = None) -> str:
    if key_fields:
        return "\x1f".join(str(rec.get(f) or "").strip() for f in key_fields)
    return str(rec.get(key) or rec.get("title") or "").strip()


def import_json(text: str, target: str) -> list:
    """从 JSON 文件导入到指定集合。"""
    data = json.loads(text)
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get("items"), list):
        return data["items"]
    if isinstance(data, dict):
        # 干净导出的 {名称: {...}} 形式
        out = []
        for name, body in data.items():
            if name.startswith("_") or not isinstance(body, dict):
                continue
            base = {
                "id": new_id({"characters": "ch", "factions": "fa", "items": "it",
                              "equipment": "eq", "other": "ot", "memories": "mm"}.get(target, "ot")),
                "name": name, "title": name, "elements": [],
                "created": now_str(), "updated": now_str(),
            }
            if target == "memories":
                base["title"] = name
                base["content"] = (body.get("content") or body.get("内容")
                                   or json.dumps(body, ensure_ascii=False))
                base["category"] = body.get("category") or body.get("分类") or "短期记忆"
                base.pop("name", None)
            else:
                base["elements"] = _nested_to_elements(body)
                if "content" in body or "内容" in body:
                    base["content"] = body.get("content") or body.get("内容")
                if "notes" in body or "备注" in body:
                    base["notes"] = body.get("notes") or body.get("备注")
            out.append(base)
        return out
    return []


def validate_import_records(records: list, target: str) -> list:
    """校验并补齐 JSON 导入的记录，错误时给出可读的提示。"""
    if not isinstance(records, list) or not records:
        raise ValueError(t('errors.json_no_records'))
    prefix = {
        "characters": "ch", "factions": "fa", "items": "it",
        "equipment": "eq", "other": "ot", "memories": "mm",
    }.get(target, "ot")
    normalized = []
    for index, rec in enumerate(records, 1):
        if not isinstance(rec, dict):
            raise ValueError(t('errors.record_not_object', index=index))
        if target == "memories":
            if not (rec.get("title") or rec.get("content")):
                raise ValueError(t('errors.memory_missing_fields', index=index))
            rec.setdefault("title", rec.get("content", "")[:30] or "未命名记忆")
            rec.setdefault("category", "短期记忆")
            rec.setdefault("chapter", "")
            rec.setdefault("content", "")
        else:
            if not (rec.get("name") or rec.get("title")):
                raise ValueError(t('errors.record_missing_name', index=index))
            rec.setdefault("name", rec.get("title") or "未命名")
            rec.setdefault("elements", [])
            rec.setdefault("content", "")
        if not isinstance(rec.get("elements"), list):
            raise ValueError(t('errors.elements_not_array', index=index))
        rec.setdefault("id", new_id(prefix))
        rec.setdefault("tags", [])
        rec.setdefault("created", now_str())
        rec.setdefault("updated", now_str())
        normalized.append(rec)
    return normalized


def import_worldmap_json(text: str, name: str = "") -> dict:
    """导入世界地图 JSON，并校验 rows / cols / cells / regions 结构。"""
    data = json.loads(text)
    if isinstance(data, dict) and isinstance(data.get("worldmap"), dict):
        data = data["worldmap"]
    if not isinstance(data, dict):
        raise ValueError(t('errors.map_not_object'))
    missing = [key for key in ("rows", "cols", "cells", "regions") if key not in data]
    if missing:
        raise ValueError(t("errors.map_missing_fields", fields=", ".join(missing)))
    rows, cols = data.get("rows"), data.get("cols")
    cells, regions = data.get("cells"), data.get("regions")
    if not isinstance(rows, list) or not rows or not all(isinstance(x, str) and x.strip() for x in rows):
        raise ValueError(t('errors.map_rows_invalid'))
    if not isinstance(cols, list) or not cols or not all(isinstance(x, str) and x.strip() for x in cols):
        raise ValueError(t('errors.map_cols_invalid'))
    if not isinstance(cells, dict):
        raise ValueError(t('errors.map_cells_invalid'))
    if not isinstance(regions, dict):
        raise ValueError(t('errors.map_regions_invalid'))

    normalized_regions = {}
    for raw_id, region in regions.items():
        if not isinstance(region, dict):
            raise ValueError(t('errors.region_not_object', id=raw_id))
        rid = str(region.get("id") or raw_id)
        if not rid:
            raise ValueError(t('errors.region_missing_id'))
        elements = region.get("elements") or []
        if not isinstance(elements, list):
            raise ValueError(t('errors.region_elements_invalid', id=rid))
        board = region.get("board") or {}
        if not isinstance(board, dict):
            raise ValueError(t('errors.region_board_invalid', id=rid))
        normalized_regions[rid] = {
            "id": rid,
            "name": region.get("name") or rid,
            "summary": region.get("summary") or "",
            "details": region.get("details") or "",
            "elements": elements,
            "parent": region.get("parent") or "",
            "tags": region.get("tags") or [],
            "board": board,
            "created": region.get("created") or now_str(),
            "updated": region.get("updated") or now_str(),
        }
    normalized_cells = {}
    for key, rid in cells.items():
        if not isinstance(key, str):
            raise ValueError(t("errors.cells_key_invalid"))
        if rid in (None, ""):
            continue
        if rid not in normalized_regions:
            raise ValueError(t('errors.cells_bad_ref', id=rid))
        normalized_cells[key] = rid
    return {
        "name": name or data.get("name") or "世界地图",
        "rows": list(rows),
        "cols": list(cols),
        "cells": normalized_cells,
        "regions": normalized_regions,
    }
