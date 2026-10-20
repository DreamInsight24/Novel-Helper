#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
novelhelper/project.py
导入 / 导出 / 文件读写 / 纯文本处理。

约定：
* 导入：.md 只允许进入「其他设定」；导入后可搬运到人物 / 势力 / 自定义栏目；
* 导出：默认写到 workspace/export/，可以选 .txt（人看）或 .json（机器用）；
* 小说正文写 workspace/output/*.md，计划与转换结果用 .txt。
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

from . import elements as el
from .store import (COLLECTIONS, DATA_DIR, PROJECT_ROOT, io_in, io_out, new_id,
                    now_str, out_dir, plan_dir, stamp, text_dir, txt_dir)

HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")


# ─────────────────────────────────────────────
# 路径
# ─────────────────────────────────────────────
def in_project(path: Path) -> bool:
    try:
        Path(path).resolve().relative_to(PROJECT_ROOT)
        return True
    except ValueError:
        return False


def rel_str(path: Path) -> str:
    """能在项目内就返回相对路径，否则返回绝对路径（目录可以被配置到项目外）。"""
    try:
        return Path(path).relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return str(path)


def safe_rel(rel: str) -> Path:
    """把相对路径解析到项目内，越界直接拒绝。"""
    target = (PROJECT_ROOT / str(rel).replace("\\", "/").lstrip("/")).resolve()
    if not in_project(target):
        raise PermissionError(f"路径越出项目目录: {rel}")
    return target


def read_text(path: str | Path, encoding: str = "utf-8") -> str:
    target = Path(path)
    if not target.is_absolute():
        target = safe_rel(str(path))
    if not target.exists():
        raise FileNotFoundError(str(path))
    return target.read_text(encoding=encoding, errors="replace")


def write_text(path: str | Path, content: str, encoding: str = "utf-8") -> Path:
    target = Path(path)
    if not target.is_absolute():
        target = safe_rel(str(path))
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding=encoding)
    return target


# ─────────────────────────────────────────────
# Markdown 切分
# ─────────────────────────────────────────────
def split_sections(text: str) -> list:
    lines = (text or "").replace("\r\n", "\n").split("\n")
    sections = []
    stack: list = []
    current = {"level": 0, "title": "__root__", "content": [], "parent_title": ""}
    sections.append(current)
    for line in lines:
        match = HEADING_RE.match(line)
        if match:
            level = len(match.group(1))
            title = match.group(2).strip()
            while stack and stack[-1] >= level:
                stack.pop()
            parent = stack[-1] if stack else 0
            current = {
                "level": level,
                "title": title,
                "content": [],
                "parent_title": _parent_title(sections, parent),
            }
            stack.append(level)
            sections.append(current)
        else:
            current["content"].append(line)
    result = []
    for sec in sections:
        body = "\n".join(sec["content"]).strip()
        if sec["level"] == 0 and not body:
            continue
        result.append({
            "level": sec["level"],
            "title": sec["title"],
            "parent_title": sec["parent_title"],
            "content": body,
        })
    return result


def _parent_title(sections: list, parent_level: int) -> str:
    if parent_level <= 0:
        return ""
    for sec in reversed(sections):
        if sec["level"] == parent_level and sec["title"] != "__root__":
            return sec["title"]
    return ""


def strip_code_fence(text: str) -> str:
    lines = text.strip().split("\n")
    if lines and lines[0].strip().startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip().startswith("```"):
        lines = lines[:-1]
    return "\n".join(lines).strip()


def parse_name_tag(title: str) -> tuple:
    match = re.match(r"^(.*?)[（(](.*)[)）]\s*$", title.strip())
    if match:
        return match.group(1).strip(), match.group(2).strip()
    return title.strip(), ""


# ─────────────────────────────────────────────
# 导入：md / txt → other
# ─────────────────────────────────────────────
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


def import_memories(text: str, source: str = "") -> list:
    """
    记忆结构化导入（# 记忆 → ## 分类 → ### 条目）。

    * 有 ### 条目时，每个 ### 一条记忆；
    * ## 分类下直接写的正文（没有 ###）也会被收成一条，标题用分类名 —— 不会丢内容。
    """
    lines = (text or "").replace("\r\n", "\n").split("\n")
    category = "短期记忆"
    title = ""
    buffer: list = []
    records: list = []

    def flush():
        nonlocal buffer, title
        body = strip_code_fence("\n".join(buffer).strip())
        if body:
            records.append({
                "id": new_id("mm"),
                "title": title or category,
                "category": category,
                "chapter": "",
                "content": body,
                "source": source,
                "tags": [],
                "created": now_str(),
                "updated": now_str(),
            })
        buffer = []

    for line in lines:
        heading = HEADING_RE.match(line)
        if heading:
            level = len(heading.group(1))
            head_title = heading.group(2).strip()
            if level == 2:
                flush()
                title = ""
                category = head_title
            elif level == 3:
                flush()
                title = head_title
            elif title:
                buffer.append(line)
            continue
        if title:
            buffer.append(line)
        elif category and line.strip():
            buffer.append(line)
    flush()
    return records


def _split_row(line: str) -> list:
    return [c.strip() for c in line.strip().strip("|").split("|")]


def parse_worldmap(text: str, name: str = "") -> dict | None:
    rows_raw = [l for l in (text or "").replace("\r\n", "\n").split("\n") if l.strip().startswith("|")]
    if len(rows_raw) < 3:
        return None
    header = _split_row(rows_raw[0])
    if "方位" not in header[0]:
        return None
    cols = header[1:]
    cells: dict = {}
    regions: dict = {}
    for line in rows_raw[2:]:
        parts = _split_row(line)
        if not parts:
            continue
        row_label = parts[0]
        if not row_label or set(row_label) <= {"-", ":"}:
            continue
        for col, value in zip(cols, parts[1:]):
            value = value.strip()
            if not value:
                continue
            rid = new_id("rg")
            regions[rid] = {
                "id": rid, "name": value, "summary": "", "details": "", "elements": [],
                "parent": "", "tags": [], "created": now_str(), "updated": now_str(),
            }
            cells[f"{row_label}|{col}"] = rid
    return {
        "name": name or "世界地图",
        "cols": cols,
        "rows": [r for r in (_split_row(l)[0] for l in rows_raw[2:]) if r],
        "cells": cells,
        "regions": regions,
    }


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


# ─────────────────────────────────────────────
# 导入源清单
# ─────────────────────────────────────────────
def import_sources() -> list:
    """可导入的文件：workspace/import/ 下放进去的 md / txt / json。"""
    entries = []
    base = io_in()
    if not base.exists():
        return entries
    for path in sorted(base.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix.lower() not in (".md", ".txt", ".json"):
            continue
        entries.append({
            "path": rel_str(path),
            "name": path.name,
            "group": "import",
            "size": path.stat().st_size,
            "mtime": datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m-%d %H:%M"),
        })
    return entries


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
        raise ValueError("JSON 中没有可导入的记录（需要数组，或 {\"items\": [...]}）")
    prefix = {
        "characters": "ch", "factions": "fa", "items": "it",
        "equipment": "eq", "other": "ot", "memories": "mm",
    }.get(target, "ot")
    normalized = []
    for index, rec in enumerate(records, 1):
        if not isinstance(rec, dict):
            raise ValueError(f"第 {index} 条记录不是 JSON 对象")
        if target == "memories":
            if not (rec.get("title") or rec.get("content")):
                raise ValueError(f"第 {index} 条记忆缺少 title 或 content")
            rec.setdefault("title", rec.get("content", "")[:30] or "未命名记忆")
            rec.setdefault("category", "短期记忆")
            rec.setdefault("chapter", "")
            rec.setdefault("content", "")
        else:
            if not (rec.get("name") or rec.get("title")):
                raise ValueError(f"第 {index} 条设定缺少 name 或 title")
            rec.setdefault("name", rec.get("title") or "未命名")
            rec.setdefault("elements", [])
            rec.setdefault("content", "")
        if not isinstance(rec.get("elements"), list):
            raise ValueError(f"第 {index} 条记录的 elements 必须是数组")
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
        raise ValueError("地图 JSON 必须是一个对象")
    missing = [key for key in ("rows", "cols", "cells", "regions") if key not in data]
    if missing:
        raise ValueError("地图 JSON 缺少字段：" + "、".join(missing) +
                         "（需要 rows、cols、cells、regions）")
    rows, cols = data.get("rows"), data.get("cols")
    cells, regions = data.get("cells"), data.get("regions")
    if not isinstance(rows, list) or not rows or not all(isinstance(x, str) and x.strip() for x in rows):
        raise ValueError("地图的 rows 必须是非空字符串数组")
    if not isinstance(cols, list) or not cols or not all(isinstance(x, str) and x.strip() for x in cols):
        raise ValueError("地图的 cols 必须是非空字符串数组")
    if not isinstance(cells, dict):
        raise ValueError("地图的 cells 必须是对象")
    if not isinstance(regions, dict):
        raise ValueError("地图的 regions 必须是对象")

    normalized_regions = {}
    for raw_id, region in regions.items():
        if not isinstance(region, dict):
            raise ValueError(f"区域 {raw_id} 必须是对象")
        rid = str(region.get("id") or raw_id)
        if not rid:
            raise ValueError("区域缺少 id")
        elements = region.get("elements") or []
        if not isinstance(elements, list):
            raise ValueError(f"区域 {rid} 的 elements 必须是数组")
        board = region.get("board") or {}
        if not isinstance(board, dict):
            raise ValueError(f"区域 {rid} 的 board 必须是对象")
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
            raise ValueError("地图 cells 的键必须是「行|列」字符串")
        if rid in (None, ""):
            continue
        if rid not in normalized_regions:
            raise ValueError(f"cells 引用了不存在的区域 id：{rid}")
        normalized_cells[key] = rid
    return {
        "name": name or data.get("name") or "世界地图",
        "rows": list(rows),
        "cols": list(cols),
        "cells": normalized_cells,
        "regions": normalized_regions,
    }


def _nested_to_elements(body: dict) -> list:
    nodes = []
    for key, value in (body or {}).items():
        if isinstance(value, dict):
            nodes.append({"key": key, "children": _nested_to_elements(value)})
        elif isinstance(value, list):
            nodes.append({"key": key, "value": "\n".join(str(x) for x in value)})
        else:
            nodes.append({"key": key, "value": "" if value is None else str(value)})
    return nodes


# ─────────────────────────────────────────────
# 导出
# ─────────────────────────────────────────────
def clean_json(coll: str, db: dict) -> dict:
    """干净导出：只保留开启且非空的元素。"""
    from . import context as ctx

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
    from . import context as ctx

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


# ─────────────────────────────────────────────
# 产出（小说正文）
# ─────────────────────────────────────────────
def write_output(content: str, mode_label: str = "AI 工作站生成", name: str = "") -> Path:
    target_dir = out_dir()
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = name or f"out_{stamp()}.md"
    if not filename.endswith(".md"):
        filename += ".md"
    header = (
        "# 小说创作输出\n\n"
        f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        f"模式: {mode_label}\n\n"
        "---\n\n"
    )
    target = target_dir / filename
    target.write_text(header + content, encoding="utf-8")
    return target


def write_plan(content: str, chapter: str = "") -> Path:
    """写作计划，按新规矩用 .txt。"""
    target_dir = plan_dir()
    target_dir.mkdir(parents=True, exist_ok=True)
    suffix = f"_{chapter}" if chapter else ""
    target = target_dir / f"plan_{stamp()}{suffix}.txt"
    header = (
        "写作前逻辑推理与剧情梗概\n"
        f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        f"章节: {chapter or '（未命名）'}\n"
        + "-" * 40 + "\n\n"
    )
    target.write_text(header + content, encoding="utf-8")
    return target


def strip_output_header(raw: str) -> str:
    marker = "\n---\n"
    stripped = raw.lstrip()
    headers = ("# 小说创作输出", "# 小说修复输出", "# 小说创作输出（重排版）")
    if any(stripped.startswith(h) for h in headers) and marker in raw:
        return raw.split(marker, 1)[1].lstrip()
    if stripped.startswith("写作前逻辑推理与剧情梗概"):
        parts = raw.split("-" * 40, 1)
        if len(parts) == 2:
            return parts[1].lstrip()
    return raw


def split_parts(raw: str) -> dict:
    body = strip_output_header(raw)
    parts = {"think": "", "body": body, "advice": ""}
    chunks = re.split(r"\n-{3,}\n", body)
    if len(chunks) >= 2:
        for chunk in chunks:
            text = chunk.strip()
            head = text.split("\n", 1)[0].strip("# ").strip()
            if "写作思路" in head:
                parts["think"] = text
            elif "写作建议" in head:
                parts["advice"] = text
            elif "正文" in head:
                parts["body"] = text
        if not parts["think"] and len(chunks) >= 3:
            parts["think"] = chunks[0].strip()
    return parts


def extract_body(raw: str) -> str:
    return split_parts(raw)["body"]


def md_to_txt(raw: str, keep_advice: bool = False, blank_mode: str = "compact") -> str:
    text = strip_output_header(raw)
    if not keep_advice:
        idx = text.find("## 写作建议")
        if idx != -1:
            text = text[:idx].rstrip()
    if blank_mode == "raw":
        return text
    text = merge_intra_paragraph_breaks(text)
    return clean_blank_lines(text, blank_mode)


def write_txt_from_md(rel_md: str, blank_mode: str = "compact", keep_advice: bool = False) -> Path:
    src = Path(rel_md)
    if not src.is_absolute():
        src = safe_rel(rel_md)
    body = md_to_txt(src.read_text(encoding="utf-8", errors="replace"), keep_advice, blank_mode)
    target_dir = txt_dir() if src.parent == out_dir() else (src.parent / "txt")
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / (src.stem + ".txt")
    target.write_text(body + "\n", encoding="utf-8")
    return target


def list_chapters() -> list:
    base = out_dir()
    if not base.exists():
        return []
    found = []
    for pattern in ("*.md", "*.txt", "txt/*.txt", "plan/*.txt", "apart/*/*.md", "apart/*/*.txt"):
        found.extend(base.glob(pattern))
    entries = []
    for path in found:
        stat = path.stat()
        entries.append({
            "path": rel_str(path),
            "name": path.name,
            "dir": rel_str(path.parent),
            "size": stat.st_size,
            "mtime": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
            "ts": stat.st_mtime,
        })
    entries.sort(key=lambda e: e["ts"], reverse=True)
    return entries


# ─────────────────────────────────────────────
# 纯文本处理
# ─────────────────────────────────────────────
def merge_intra_paragraph_breaks(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    out: list = []
    for line in text.split("\n"):
        if line.strip() == "":
            out.append("")
        elif out and out[-1] != "":
            out[-1] = out[-1].rstrip() + line.strip()
        else:
            out.append(line.strip())
    return "\n".join(out)


def clean_blank_lines(text: str, mode: str = "compact") -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    if mode == "compact":
        return "\n".join(line.rstrip() for line in text.split("\n") if line.strip() != "")
    result: list = []
    blank = 0
    for line in text.split("\n"):
        if line.strip() == "":
            blank += 1
            if blank == 1:
                result.append("")
        else:
            blank = 0
            result.append(line.rstrip())
    while result and result[0] == "":
        result.pop(0)
    while result and result[-1] == "":
        result.pop()
    return "\n".join(result)


def text_stats(text: str) -> dict:
    raw = text or ""
    lines = raw.split("\n")
    paragraphs = [p for p in re.split(r"\n\s*\n", raw) if p.strip()]
    cjk = len(re.findall(r"[\u4e00-\u9fff]", raw))
    return {
        "chars": len(raw),
        "chars_no_space": len(re.sub(r"\s", "", raw)),
        "cjk": cjk,
        "lines": len(lines),
        "non_empty_lines": sum(1 for line in lines if line.strip()),
        "paragraphs": len(paragraphs),
    }


def apply_text_op(text: str, op: str, arg: str = "") -> str:
    if op == "clean_blank":
        return clean_blank_lines(text, "normal")
    if op == "compact":
        return clean_blank_lines(text, "compact")
    if op == "merge_breaks":
        return merge_intra_paragraph_breaks(text)
    if op == "strip_indent":
        return "\n".join(line.lstrip("　 \t") for line in text.split("\n"))
    if op == "replace" and arg:
        pair = arg.split("\x1f")
        if len(pair) == 2:
            return text.replace(pair[0], pair[1])
    if op == "trim":
        return text.strip()
    return text


# ─────────────────────────────────────────────
# io 目录与磁盘浏览（给 txt 面板用）
# ─────────────────────────────────────────────
def _list_files(base: Path) -> dict:
    if not base.exists():
        base.mkdir(parents=True, exist_ok=True)
    files = []
    for path in sorted(base.rglob("*")):
        if not path.is_file():
            continue
        files.append({
            "path": rel_str(path),
            "name": path.name,
            "size": path.stat().st_size,
            "mtime": datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m-%d %H:%M"),
            "ext": path.suffix.lower(),
        })
    return {"root": str(base), "rel": rel_str(base), "files": files}


def list_io(dir_rel: str = "") -> dict:
    """列出导入 / 导出目录下的文件。"""
    return _list_files(io_in() if dir_rel.startswith("import") else io_out())


def list_text() -> dict:
    """稿件处理工作区的独立文件夹（默认 workspace/text/，可在「模型设置」页改）。"""
    return _list_files(text_dir())


def browse(path: str = "") -> dict:
    """磁盘目录浏览：给"导出到任意位置"用。"""
    if not path:
        drives = []
        for letter in "CDEFGHIJKLMNOPQRSTUVWXYZ":
            root = Path(f"{letter}:/")
            if root.exists():
                drives.append({"name": f"{letter}:\\", "path": str(root)})
        home = Path.home()
        return {"path": "", "parent": "", "dirs": drives, "files": [], "shortcut": {"name": "用户目录", "path": str(home)}}
    target = Path(path)
    if not target.exists() or not target.is_dir():
        raise FileNotFoundError(f"目录不存在: {path}")
    dirs, files = [], []
    try:
        for child in sorted(target.iterdir(), key=lambda p: p.name.lower()):
            if child.name.startswith("."):
                continue
            if child.is_dir():
                dirs.append({"name": child.name, "path": str(child)})
            elif child.suffix.lower() in (".txt", ".md", ".json", ".csv"):
                files.append({"name": child.name, "path": str(child), "size": child.stat().st_size})
    except PermissionError:
        pass
    parent = str(target.parent) if target.parent != target else ""
    return {"path": str(target), "parent": parent, "dirs": dirs[:400], "files": files[:400]}


def write_external(path: str, content: str, encoding: str = "utf-8") -> Path:
    """txt 面板的对外导出：允许用户自选位置。"""
    target = Path(path).expanduser()
    if target.is_dir():
        raise IsADirectoryError(str(target))
    if not target.parent.exists():
        raise FileNotFoundError(f"目录不存在：{target.parent}")
    target.write_text(content, encoding=encoding, errors="replace")
    return target
