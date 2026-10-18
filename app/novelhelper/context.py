#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
novelhelper/context.py
把 JSON 数据渲染成 DeepSeek 容易理解的文本，并组装 messages。

* 只发送"作者需要的"元素：被关掉（on=false）或空值的元素一律不出现；
* 区块标题与任务说明全部来自 data/prompts.json 的 sections；
* 世界地图也会被渲染成文字（表格 + 区域说明），所以设定与地图是同一份数据。
"""
from __future__ import annotations

from typing import Any, Iterable

from . import elements as el


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

    for tag in (pick(["类型", "类别"]), pick(["品级"]), pick(["主要效果", "效果"]), pick(["外观描述", "外形"])):
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


def assemble(
    config: dict,
    db: dict,
    prompts: dict,
    selection: dict,
    plan: str = "",
    mode: str = "reason",
    work_prompt: str = "",
    work_mode: str = "draft",
) -> dict:
    """
    mode:
        "reason" —— 上下文 + 用户原始指令（产出推理与梗概）
        "write"  —— 上下文 + 用户指令 + 已确认的推理与梗概
        "idea"   —— 只给设定 / 当前状态 / 记忆
        "work"   —— AI 工作站：上下文 + 用户提示词 + 工作提示词
    """
    sections = prompts.get("sections") or {}
    selection = selection or {}
    include = selection.get("include") or {}
    parts: list[str] = []

    def head(key: str, default: str = "") -> str:
        return sections.get(key) or default

    def target_chars() -> int:
        """目标字数：优先用「本次」（工作站里每次都能改），再退回 config 的默认值。"""
        value = selection.get("target_chars")
        try:
            value = int(value)
        except (TypeError, ValueError):
            value = 0
        if value > 0:
            return value
        try:
            return int((config.get("writing") or {}).get("target_chars") or 0)
        except (TypeError, ValueError):
            return 0

    def strict_length() -> bool:
        value = selection.get("strict_length")
        if value is None:
            value = (config.get("writing") or {}).get("strict_length", True)
        return bool(value)

    # 项目文件（只读快照）
    for entry in selection.get("project_files") or []:
        content = (entry.get("content") or "").strip()
        if not content:
            continue
        title = head("files", "## 附加资料（来源：{path}）").format(path=entry.get("path", ""))
        parts.append(f"{title}\n\n{content}")

    # 世界观 / 其他设定 / 世界地图：三个开关彼此独立。
    wanted = {i for i in (selection.get("world_ids") or []) if i}
    world = [rec for rec in world_pool(db) if rec.get("id") in wanted] if include.get("world") else []
    world_md = "\n\n".join(render_other(rec) for rec in world if rec)
    map_md = render_worldmap(db.get("worldmap") or {}) if include.get("worldmap") else ""
    body = "\n\n".join(x for x in (world_md, map_md) if x.strip())
    if body:
        parts.append(f"{head('world', '## 世界观设定')}\n\n{body}")

    # 当前状态
    state = (selection.get("current_state") or "").strip()
    if include.get("state") and state:
        parts.append(f"{head('state', '## 当前状态')}\n\n{state}")

    # 记忆
    if include.get("memory"):
        mems = _pick(db, "memories", selection.get("memory_ids"))
        cats = selection.get("memory_categories") or []
        if cats:
            mems = [m for m in mems if (m.get("category") or "") in set(cats)]
        mem_md = "\n\n".join(render_memory(rec) for rec in mems if rec)
        if mem_md.strip():
            parts.append(f"{head('memory', '## 故事记忆')}\n\n{mem_md}")

    # 人物
    if include.get("characters"):
        chars = _pick(db, "characters", selection.get("character_ids"))
        char_md = "\n\n".join(render_character(rec, db) for rec in chars if rec)
        if char_md.strip():
            parts.append(f"{head('characters', '## 人物档案')}\n\n{char_md}")

    # 势力
    if include.get("factions"):
        facs = _pick(db, "factions", selection.get("faction_ids"), default_all=True)
        fac_md = "\n\n".join(render_faction(rec, db) for rec in facs if rec)
        if fac_md.strip():
            parts.append(f"{head('factions', '## 势力设定')}\n\n{fac_md}")

    # 道具 / 服饰与装备不单独发送：它们跟着人物的背包与穿戴走，
    # 由 render_character 把条目定义作为「解释」渲染出来（见 loadout）。

    # 用户补充
    extra = (selection.get("extra") or "").strip()
    if extra:
        parts.append(f"{head('extra', '## 补充说明')}\n\n{extra}")

    # 已确认的计划
    plan_text = (plan or "").strip()
    if mode == "write" and plan_text:
        parts.append(f"{head('plan', '## 已确认的写作方案（必须遵守）')}\n\n{plan_text}")

    # 指令 / 任务
    if mode == "work":
        prompt = (selection.get("prompt") or "").strip()
        if prompt:
            parts.append(f"{head('instruction', '## 用户提示词')}\n\n{prompt}")
        custom = (work_prompt or selection.get("work_prompt") or "").strip()
        if custom:
            parts.append(f"{head('work_prompt', '## 工作提示词')}\n\n{custom}")
        target = target_chars()
        if target and work_mode in ("draft", "polish"):
            template = head("length_strict", "") if strict_length() else head("length_soft", "")
            if template:
                parts.append(f"{head('length', '## 字数要求')}\n\n{template.format(n=target)}")
        task = head("task_write", "").strip() if work_mode == "draft" else ""
        if task:
            parts.append(f"{head('task', '## 任务')}\n\n{task}")
    elif mode == "reason":
        prompt = (selection.get("prompt") or "").strip()
        if not prompt:
            prompt = "（用户未给出指令，请基于以上信息自行判断本节最合理的推进方向。）"
        parts.append(f"{head('instruction', '## 用户提示词')}\n\n{prompt}")
        task = head("task_reason", "").strip()
        target = target_chars()
        if target:
            task += "\n" + head("length_soft", "本次正文建议 {n} 字符左右。").format(n=target)
        if task.strip():
            parts.append(f"{head('task', '## 任务')}\n\n{task.strip()}")
    elif mode == "idea":
        parts.append(f"{head('task', '## 任务')}\n\n{head('task_idea', '')}")
    else:
        prompt = (selection.get("prompt") or "").strip()
        if prompt:
            parts.append(f"{head('instruction_write', '## 用户提示词')}\n\n{prompt}")
        else:
            parts.append(f"{head('task', '## 任务')}\n\n{head('task_default', '')}")
        target = target_chars()
        if target:
            template = head("length_strict", "") if strict_length() else head("length_soft", "")
            parts.append(f"{head('length', '## 字数要求')}\n\n{template.format(n=target)}")
        task = head("task_write", "").strip()
        if task:
            parts.append(f"{head('task', '## 任务')}\n\n{task}")

    user_content = "\n\n---\n\n".join(part for part in parts if part and part.strip())
    tool = "idea" if mode == "idea" else ("reason" if mode == "reason" else "write")
    if mode == "work":
        system = ((prompts.get("work") or {}).get(work_mode)
                  or (prompts.get("work") or {}).get("draft")
                  or "")
        tool = "work"
    else:
        system = (prompts.get("tools") or {}).get(tool) or ""
    return {
        "system": system,
        "user": user_content,
        "tool": tool,
        "work_mode": work_mode if mode == "work" else "",
        "parts": len(parts),
    }
