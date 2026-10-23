"""Clean JSON and rendered text exports."""
from __future__ import annotations

import json
from pathlib import Path

from .. import elements as el
from ..store import io_out


def clean_json(coll: str, db: dict) -> dict:
    """干净导出：只保留开启且非空的元素。"""
    from .. import context as ctx

    if coll == "worldmap":
        world = db.get("worldmap") or {}
        all_regions = world.get("regions") or {}
        root_cells = world.get("cells") or {}

        def board_out(region: dict):
            board = region.get("board") or {}
            cells = {k: v for k, v in (board.get("cells") or {}).items() if v}
            if not cells:
                return None
            return {
                "行": board.get("rows") or [],
                "列": board.get("cols") or [],
                "格": {k: ((all_regions.get(v) or {}).get("name") or v) for k, v in cells.items()},
            }

        def dump(region: dict, depth: int) -> dict:
            body = el.to_nested(region.get("elements"))
            if region.get("summary"):
                body = {"简述": region["summary"], **body}
            if region.get("details"):
                body["详细"] = region["details"]
            board = board_out(region)
            if board and depth < 4:
                body["子表格"] = board
                children = {}
                for rid in (region.get("board") or {}).get("cells", {}).values():
                    child = all_regions.get(rid)
                    if child:
                        children[child.get("name") or rid] = dump(child, depth + 1)
                if children:
                    body["子区域"] = children
            return body

        out = {"_name": world.get("name"), "_grid": {
            f"{r}|{c}": ((all_regions.get(root_cells.get(f"{r}|{c}")) or {}).get("name", ""))
            for r in world.get("rows") or [] for c in world.get("cols") or []
        }}
        regions = {}
        for r in world.get("rows") or []:
            for c in world.get("cols") or []:
                region = all_regions.get(root_cells.get(f"{r}|{c}"))
                if region:
                    regions[region.get("name") or "未命名"] = dump(region, 1)
        if regions:
            out["regions"] = regions
        return out

    items = (db.get(coll) or {}).get("items") or []
    out: dict = {}
    for rec in items:
        name = rec.get("name") or rec.get("title") or "未命名"
        if coll == "memories":
            out[name] = {"分类": rec.get("category") or "", "内容": rec.get("content") or ""}
            continue
        body = el.to_nested(rec.get("elements"))
        if rec.get("category"):
            body = {"类别": rec["category"], **body}
        if rec.get("slot"):
            body = {"部位": rec["slot"], **body}
        if coll == "characters":
            if (rec.get("purse") or "").strip():
                body["钱袋"] = rec["purse"].strip()
            pack = ctx.loadout(rec, db)
            for key, label in (("items", "背包"), ("equips", "穿戴"), ("owned", "已拥有")):
                if not pack[key]:
                    continue
                body[label] = [
                    {k: v for k, v in (("物品", row["head"]), ("解释", row["detail"] or None),
                                       ("备注", row["note"] or None)) if v}
                    for row in pack[key]
                ]
        if coll == "factions" and rec.get("members"):
            body["成员"] = [
                (ctx.item_brief(_find(db, "characters", mid)) or mid) for mid in rec["members"]
            ]
        if rec.get("notes"):
            body["备注"] = rec["notes"]
        if rec.get("content"):
            body["内容"] = rec["content"]
        out[name] = body
    return out


def _find(db: dict, coll: str, rid: str):
    for rec in (db.get(coll) or {}).get("items") or []:
        if rec.get("id") == rid:
            return rec
    return None


def export_text(coll: str, db: dict) -> str:
    """人看版（.txt）：和拼提示词时用的是同一套渲染。"""
    from .. import context as ctx

    if coll == "worldmap":
        return ctx.render_worldmap(db.get("worldmap") or {})
    if coll == "memories":
        groups: dict = {}
        for rec in (db.get("memories") or {}).get("items") or []:
            groups.setdefault(rec.get("category") or "短期记忆", []).append(rec)
        lines = []
        for category, records in groups.items():
            lines.append(f"# {category}")
            lines.append("")
            for rec in records:
                lines.append(ctx.render_memory(rec))
                lines.append("")
        return "\n".join(lines)
    renderer = {
        "characters": lambda r: ctx.render_character(r, db),
        "factions": lambda r: ctx.render_faction(r, db),
        "items": ctx.render_item,
        "equipment": ctx.render_equipment,
        "other": ctx.render_other,
    }.get(coll)
    if not renderer:
        return ""
    lines = []
    for rec in (db.get(coll) or {}).get("items") or []:
        lines.append(renderer(rec))
        lines.append("")
    return "\n".join(lines)


def save_json(coll: str, db: dict, filename: str = "") -> Path:
    io_out().mkdir(parents=True, exist_ok=True)
    target = io_out() / (filename or f"{coll}.json")
    payload = json.dumps(clean_json(coll, db), ensure_ascii=False, indent=2)
    target.write_text(payload + "\n", encoding="utf-8")
    return target


def save_txt(coll: str, db: dict, filename: str = "") -> Path:
    io_out().mkdir(parents=True, exist_ok=True)
    target = io_out() / (filename or f"{coll}.txt")
    target.write_text(export_text(coll, db).strip() + "\n", encoding="utf-8")
    return target
