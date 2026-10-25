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

"""Markdown, memory, and world-map parsing helpers."""
from __future__ import annotations

import re
from pathlib import Path

from ..localization import t
from ..store import new_id, now_str


HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")


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


def import_memories(text: str, source: str = "") -> list:
    """
    记忆结构化导入（# 记忆 → ## 分类 → ### 条目）。

    * 有 ### 条目时，每个 ### 一条记忆；
    * ## 分类下直接写的正文（没有 ###）也会被收成一条，标题用分类名 —— 不会丢内容。
    """
    lines = (text or "").replace("\r\n", "\n").split("\n")
    category = t("defaults.memory.short")
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
        "name": name or t("defaults.map.name"),
        "cols": cols,
        "rows": [r for r in (_split_row(l)[0] for l in rows_raw[2:]) if r],
        "cells": cells,
        "regions": regions,
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
