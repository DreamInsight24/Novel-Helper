#!/usr/bin/env python3
# -*- coding: utf-8 -*-
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
novelhelper/context.py
把 JSON 数据渲染成模型容易理解的文本，并组装 messages。

* 只发送"作者需要的"元素：被关掉（on=false）或空值的元素一律不出现；
* 区块标题按设定名称自动拼装，不再需要手动配置标题 / 任务说明；
* 世界地图也会被渲染成文字（表格 + 区域说明），所以设定与地图是同一份数据。
"""
from __future__ import annotations

from typing import Any, Iterable

from . import elements as el, localization, providers


# ─────────────────────────────────────────────
# 渲染
# ─────────────────────────────────────────────
def _title(rec: dict) -> str:
    name = (rec.get("name") or "").strip() or "未命名"
    tag = (rec.get("tag") or "").strip()
    return f"{name}（{tag}）" if tag else name


def _index(coll: Any) -> dict:
    return {item.get("id"): item for item in ((coll or {}).get("items") or [])}


def render_elements(nodes, head: int = 0) -> list:
    return el.render_md(nodes, head)


def render_item(rec: dict) -> str:
    if not rec:
        return ""
    lines = [f"### {_title(rec)}"]
    if rec.get("category"):
        lines.append(f"- 类别：{rec['category']}")
    lines += render_elements(rec.get("elements"))
    if (rec.get("notes") or "").strip():
        lines += ["", rec["notes"].strip()]
    return "\n".join(lines)


def _key_names(key: str) -> list:
    """候选元素名：当前语言 + 所有已配置语言，兼容初始化时冻结的键名。"""
    names = {localization.t(key)}
    for entry in localization.get_languages()["languages"]:
        names.add(localization.get_translations(entry["id"]).get(key, ""))
    return [name for name in names if name]


def item_brief(rec: dict) -> str:
    """背包里的一行摘要。"""
    if not rec:
        return "（缺失的指针）"
    flat = el.to_nested(el.prune(rec.get("elements")))
    bits = []

    def pick(keys):
        for key in keys:
            for group, value in flat.items():
                if isinstance(value, dict):
                    if key in value and str(value[key]).strip():
                        return f"{key}：{value[key]}"
                elif key == group and str(value).strip():
                    return f"{key}：{value}"
        return ""

    for tag in (pick(_key_names("defaults.element.type") + _key_names("defaults.element.category")),
                pick(_key_names("defaults.element.grade")),
                pick(_key_names("defaults.element.main_effect") + _key_names("defaults.element.effect")),
                pick(_key_names("defaults.element.appearance_desc") + _key_names("defaults.element.shape"))):
        if tag:
            bits.append(tag)
    head = _title(rec)
    return head + ("，" + "；".join(bits) if bits else "")


def render_equipment(rec: dict) -> str:
    if not rec:
        return ""
    lines = [f"### {_title(rec)}"]
    meta = []
    if rec.get("slot"):
        meta.append(f"部位：{rec['slot']}")
    if rec.get("category"):
        meta.append(f"类别：{rec['category']}")
    if meta:
        lines.append("- " + "；".join(meta))
    lines += render_elements(rec.get("elements"))
    if (rec.get("notes") or "").strip():
        lines += ["", rec["notes"].strip()]
    return "\n".join(lines)


def render_character(rec: dict, db: dict) -> str:
    if not rec:
        return ""
    lines = [f"### {_title(rec)}"]
    lines += render_elements(rec.get("elements"))

    purse = (rec.get("purse") or "").strip()
    if purse:
        lines.append(f"- 钱袋：{purse}")

    pack = loadout(rec, db)
    for key, label in (("items", "背包"), ("equips", "穿戴与装备"), ("owned", "已拥有（未携带）")):
        if pack[key]:
            lines.append(f"- {label}：")
            lines += pack_lines(pack[key])

    if (rec.get("notes") or "").strip():
        lines += ["", rec["notes"].strip()]
    return "\n".join(lines)


def loadout(rec: dict, db: dict) -> dict:
    """
    人物的随身物品 / 穿戴 / 已拥有（未携带）。

    背包条目上的 carried=False 表示"已拥有但没带在身上"；缺省视为携带。
    每条都带 detail＝道具/服饰自身的元素（就是给模型的解释），所以道具与服饰
    不需要单独作为一个区块发送。
    """
    indexes = {"item_id": _index(db.get("items")), "equip_id": _index(db.get("equipment"))}

    def rows(entries, id_key, qty=False):
        out = []
        for entry in entries or []:
            rid = entry.get(id_key)
            if not rid:
                continue
            target = indexes[id_key].get(rid)
            if target:
                head = _title(target)
                detail = el.render_md(target.get("elements"), 0)
            else:
                head = f"（指针失效：{rid}）"
                detail = []
            if qty and entry.get("qty") not in (None, "", 1, "1"):
                head += f"×{entry['qty']}"
            out.append({
                "head": head,
                "detail": detail,
                "note": (entry.get("note") or "").strip(),
                "carried": entry.get("carried") is not False,
            })
        return out

    inv = rows(rec.get("inventory"), "item_id", qty=True)
    equ = rows(rec.get("equipment"), "equip_id")
    return {
        "items": [r for r in inv if r["carried"]],
        "equips": [r for r in equ if r["carried"]],
        "owned": [r for r in inv + equ if not r["carried"]],
    }


def pack_lines(rows: list) -> list:
    out = []
    for row in rows:
        out.append(f"  - {row['head']}" + (f"（{row['note']}）" if row["note"] else ""))
        out.extend(f"    {line}" for line in row["detail"])
    return out


def render_faction(rec: dict, db: dict) -> str:
    if not rec:
        return ""
    lines = [f"### {_title(rec)}"]
    lines += render_elements(rec.get("elements"))
    chars = _index(db.get("characters"))
    members = [(_title(chars[mid]) if chars.get(mid) else f"（指针失效：{mid}）") for mid in (rec.get("members") or [])]
    if members:
        lines.append(f"- 成员：{'、'.join(members)}")
    if (rec.get("notes") or "").strip():
        lines += ["", rec["notes"].strip()]
    return "\n".join(lines)


def render_other(rec: dict) -> str:
    if not rec:
        return ""
    lines = [f"### {_title(rec)}"]
    lines += render_elements(rec.get("elements"))
    if (rec.get("content") or "").strip():
        lines += ["", rec["content"].strip()]
    return "\n".join(lines)


def render_memory(rec: dict) -> str:
    if not rec:
        return ""
    head = (rec.get("title") or "").strip() or "未命名记忆"
    if (rec.get("chapter") or "").strip():
        head = f"{head}（{rec['chapter']}）"
    return f"### {head}\n\n{(rec.get('content') or '').strip()}"


def render_worldmap(world: dict) -> str:
    """
    世界地图 → 文字：根表格 + 逐层子表格。

    地图是一棵确定的树：根表格的每格挂一个区域，区域自己的 board 再挂子区域，
    最多 4 层。完全没有内容的表格不写出来。
    """
    if not world:
        return ""
    regions = world.get("regions") or {}
    lines = [f"### {world.get('name') or '世界地图'}"]
    seen: set = set()

    def grid(cols: list, rows: list, cells: dict) -> list:
        if not cols or not rows:
            return []
        if not any(cells.get(f"{r}|{c}") for r in rows for c in cols):
            return []  # 一个格子都没填，整张表不出现
        out = ["| 方位 | " + " | ".join(cols) + " |",
               "|:----:|" + "|".join([":----:"] * len(cols)) + "|"]
        for row in rows:
            values = [((regions.get(cells.get(f"{row}|{col}")) or {}).get("name") or "") for col in cols]
            out.append(f"| {row} | " + " | ".join(values) + " |")
        return out

    def walk(region: dict, depth: int) -> list:
        rid = region.get("id")
        if not region or rid in seen:
            return []
        seen.add(rid)
        head = "#" * min(3 + depth, 6)
        out = ["", f"{head} {region.get('name') or '未命名区域'}"]
        if (region.get("summary") or "").strip():
            out.append(f"- 简述：{region['summary'].strip()}")
        out += render_elements(region.get("elements"))
        if (region.get("details") or "").strip():
            out += ["", region["details"].strip()]
        board = region.get("board") or {}
        if board and depth < 4:
            rows, cols, cells = board.get("rows") or [], board.get("cols") or [], board.get("cells") or {}
            table = grid(cols, rows, cells)
            if table:
                out += [""] + table
            for row in rows:
                for col in cols:
                    child = regions.get(cells.get(f"{row}|{col}"))
                    if child:
                        out += walk(child, depth + 1)
        return out

    lines += grid(world.get("cols") or [], world.get("rows") or [], world.get("cells") or {})
    for row in world.get("rows") or []:
        for col in world.get("cols") or []:
            region = regions.get((world.get("cells") or {}).get(f"{row}|{col}"))
            if region:
                lines += walk(region, 1)
    loose = [rg for rg in regions.values() if rg.get("id") not in seen]
    if loose:
        lines += ["", "#### （未挂接到地图上的区域）"]
        for region in loose:
            lines += walk(region, 2)
    return "\n".join(lines)


# ─────────────────────────────────────────────
# 组装
# ─────────────────────────────────────────────
def _pick(db: dict, name: str, ids: Iterable[str] | None, default_all: bool = False) -> list:
    """
    挑出这次要发送的记录。

    * default_all=False（人物 / 记忆 / 世界观条目）：勾选才发送，没勾选＝不带入；
    * default_all=True（势力设定）：AI 工作站没有逐条勾选，开了这一栏就整栏带入。
    """
    items = list(((db.get(name) or {}).get("items")) or [])
    wanted = {i for i in (ids or []) if i}
    if wanted:
        return [item for item in items if item.get("id") in wanted]
    return items if default_all else []


def world_pool(db: dict) -> list:
    """世界观内容 = 「其他设定」+ 所有自定义设定栏目。"""
    items = list(((db.get("other") or {}).get("items")) or [])
    for name, coll in (db or {}).items():
        if name.startswith("section_"):
            items.extend((coll or {}).get("items") or [])
    return items


def find_mode(db: dict, mode_id: str) -> dict | None:
    for mode in ((db.get("modes") or {}).get("items") or []):
        if mode.get("id") == mode_id:
            return mode
    return None


def mode_kind(mode: dict | None) -> str:
    """模式用途：write = 写稿，process = 稿件处理。旧数据缺省按写稿处理。"""
    return "process" if (mode or {}).get("kind") == "process" else "write"


def section_label(db: dict, key: str) -> str:
    for section in ((db.get("sections") or {}).get("items") or []):
        if section.get("key") == key:
            return section.get("label") or key
    return key


def selected_world_groups(db: dict, ids: Iterable[str] | None) -> list:
    """按设定栏目分组；标题直接使用栏目 / 设定名称。"""
    wanted = {item for item in (ids or []) if item}
    if not wanted:
        return []
    groups = []
    other = [rec for rec in ((db.get("other") or {}).get("items") or [])
             if rec.get("id") in wanted]
    if other:
        groups.append(("其他设定", other))
    for name, coll in (db or {}).items():
        if not name.startswith("section_"):
            continue
        key = name[len("section_"):]
        records = [rec for rec in ((coll or {}).get("items") or [])
                   if rec.get("id") in wanted]
        if records:
            groups.append((section_label(db, key), records))
    return groups


def _target_chars(config: dict, selection: dict) -> int:
    try:
        value = int(selection.get("target_chars") or 0)
    except (TypeError, ValueError):
        value = 0
    if value > 0:
        return value
    try:
        return int((config.get("writing") or {}).get("target_chars") or 0)
    except (TypeError, ValueError):
        return 0


def _strict_length(config: dict, selection: dict) -> bool:
    value = selection.get("strict_length")
    if value is None:
        value = (config.get("writing") or {}).get("strict_length", True)
    return bool(value)


def build_user_message(
    config: dict,
    db: dict,
    selection: dict,
    mode: dict | None = None,
    plan: str = "",
    work_prompt: str = "",
    include_prompt: bool = True,
    source_text: str = "",
) -> str:
    """
    user 消息只由「设定名称 + 内容」自动拼装。
    稿件处理模式额外把待处理原文放在「待处理文本」区块。
    字数直接作为最后一行，不再生成“字数说明 / 任务说明”区块。
    """
    selection = selection or {}
    mode = mode or {}
    include = selection.get("include") or {}
    parts: list[str] = []

    # 附加资料：标题使用文件路径
    for entry in selection.get("project_files") or []:
        content = (entry.get("content") or "").strip()
        if not content:
            continue
        path = entry.get("path") or "附加资料"
        parts.append(f"## 附加资料 · {path}\n\n{content}")

    # 世界观 / 自定义栏目：按栏目名称分组，条目名由 render_other 自动生成
    if include.get("world"):
        for label, records in selected_world_groups(db, selection.get("world_ids")):
            body = "\n\n".join(render_other(rec) for rec in records if rec)
            if body.strip():
                parts.append(f"## {label}\n\n{body}")

    # 世界地图
    if include.get("worldmap"):
        map_md = render_worldmap(db.get("worldmap") or {})
        if map_md.strip():
            parts.append(f"## 世界地图\n\n{map_md}")

    # 当前状态
    state = (selection.get("current_state") or "").strip()
    if include.get("state") and state:
        parts.append(f"## 当前状态\n\n{state}")

    # 记忆
    if include.get("memory"):
        mems = _pick(db, "memories", selection.get("memory_ids"))
        cats = selection.get("memory_categories") or []
        if cats:
            mems = [m for m in mems if (m.get("category") or "") in set(cats)]
        mem_md = "\n\n".join(render_memory(rec) for rec in mems if rec)
        if mem_md.strip():
            parts.append(f"## 故事记忆\n\n{mem_md}")

    # 人物
    if include.get("characters"):
        chars = _pick(db, "characters", selection.get("character_ids"))
        char_md = "\n\n".join(render_character(rec, db) for rec in chars if rec)
        if char_md.strip():
            parts.append(f"## 人物档案\n\n{char_md}")

    # 势力
    if include.get("factions"):
        facs = _pick(db, "factions", selection.get("faction_ids"), default_all=True)
        fac_md = "\n\n".join(render_faction(rec, db) for rec in facs if rec)
        if fac_md.strip():
            parts.append(f"## 势力设定\n\n{fac_md}")

    # 道具 / 服饰与装备不单独发送：它们跟着人物的背包与穿戴走。

    extra = (selection.get("extra") or "").strip()
    if extra:
        parts.append(f"## 补充说明\n\n{extra}")

    plan_text = (plan or "").strip()
    if plan_text:
        parts.append(f"## 写作方案\n\n{plan_text}")

    source = (source_text or "").strip()
    if source:
        parts.append(f"## 待处理文本\n\n{source}")

    prompt = (selection.get("prompt") or "").strip()
    if include_prompt and prompt:
        parts.append(f"## 用户提示词\n\n{prompt}")

    custom = (work_prompt or selection.get("work_prompt") or "").strip()
    if custom:
        parts.append(f"## 附加要求\n\n{custom}")

    if mode.get("use_target_chars") and mode_kind(mode) != "process":
        target = _target_chars(config, selection)
        if target:
            strict = mode.get("length_strict")
            if strict is None:
                strict = _strict_length(config, selection)
            parts.append(f"目标字数：{'不少于' if strict else '约'} {target} 字。")

    return "\n\n---\n\n".join(part for part in parts if part and part.strip())


def assemble_mode(
    config: dict,
    db: dict,
    selection: dict,
    mode: dict,
    work_prompt: str = "",
    source_text: str = "",
) -> dict:
    system = (mode.get("system_prompt") or "").strip() + providers.provider_note(config)
    user = build_user_message(
        config, db, selection, mode=mode, work_prompt=work_prompt, source_text=source_text,
    )
    return {
        "system": system,
        "user": user,
        "tool": "mode",
        "mode_id": mode.get("id") or "",
        "parts": 1,
    }
