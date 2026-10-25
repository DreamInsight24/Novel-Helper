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
novelhelper/elements.py
「元素模板」——多维设定的树形结构。

一个元素节点：
    {"key": "外貌", "on": True, "children": [ ... ]}          # 分组
    {"key": "身高", "on": True, "value": "170cm"}             # 叶子

* `on` 缺省视为 True；设为 False 表示"这次不需要这个元素"，
  导出 / 发送给模型时会被整体丢弃（连同子节点）。
* 值可能本身又是子集 —— 叶子节点也允许继续带 children（子集的子集）。

路径统一用"下标路径"表示，例如 [0, 2, 1]，避免同名 key 的歧义。
"""
from __future__ import annotations

import copy


# ─────────────────────────────────────────────
# 基础
# ─────────────────────────────────────────────
def node(key: str = "", value: str = "", children: list | None = None,
         on: bool = True) -> dict:
    item: dict = {"key": key}
    if children:
        item["children"] = children
    else:
        item["value"] = value or ""
    if not on:
        item["on"] = False
    return item


def normalize(nodes) -> list:
    """保证结构合法（key/on/children/value）。"""
    out = []
    for raw in nodes or []:
        if not isinstance(raw, dict):
            continue
        item = {
            "key": str(raw.get("key", "")),
        }
        if raw.get("on") is False:
            item["on"] = False
        children = raw.get("children")
        if children:
            item["children"] = normalize(children)
        else:
            item["value"] = "" if raw.get("value") is None else str(raw.get("value"))
        out.append(item)
    return out


def is_on(item: dict) -> bool:
    return item.get("on") is not False


def get(nodes: list, path: list) -> dict | None:
    current = nodes
    item = None
    for idx in path:
        if not isinstance(current, list) or idx >= len(current):
            return None
        item = current[idx]
        current = item.get("children") or []
    return item


def parent_list(nodes: list, path: list) -> tuple:
    """返回 (父列表, 下标)。根节点返回 (nodes, path[-1])。"""
    if not path:
        return nodes, -1
    parent = get(nodes, path[:-1]) if len(path) > 1 else None
    if len(path) == 1:
        return nodes, path[0]
    if parent is None:
        return nodes, -1
    parent.setdefault("children", [])
    return parent["children"], path[-1]


# ─────────────────────────────────────────────
# 编辑操作
# ─────────────────────────────────────────────
def add_child(nodes: list, path: list, key: str, as_group: bool = False) -> dict:
    """在 path 指向的节点下加子元素，返回新节点。"""
    target = get(nodes, path) if path else None
    new_item = node(key, "", [] if as_group else None)
    if target is None:
        nodes.append(new_item)
        return new_item
    target.pop("value", None)
    target.setdefault("children", [])
    target["children"].append(new_item)
    return new_item


def remove(nodes: list, path: list) -> bool:
    if not path:
        return False
    container, idx = parent_list(nodes, path)
    if 0 <= idx < len(container):
        container.pop(idx)
        return True
    return False


def move(nodes: list, path: list, delta: int) -> bool:
    if not path:
        return False
    container, idx = parent_list(nodes, path)
    target = idx + delta
    if 0 <= idx < len(container) and 0 <= target < len(container):
        container[idx], container[target] = container[target], container[idx]
        return True
    return False


def set_on(nodes: list, path: list, on: bool) -> None:
    item = get(nodes, path)
    if item is None:
        return
    if on:
        item.pop("on", None)
    else:
        item["on"] = False


# ─────────────────────────────────────────────
# 模板 / 预设
# ─────────────────────────────────────────────
def apply_preset(nodes: list, preset: list) -> int:
    """按模板补齐缺失的元素（已存在的不动，不覆盖已填的值）。返回新增节点数。"""
    added = 0
    for want in preset or []:
        key = (want.get("key") or "").strip()
        if not key:
            continue
        existing = next((n for n in nodes if (n.get("key") or "").strip() == key), None)
        if existing is None:
            new_item = copy.deepcopy(want)
            new_item.pop("on", None)
            nodes.append(new_item)
            added += 1
        else:
            children = want.get("children") or []
            if children:
                existing.pop("value", None)
                existing.setdefault("children", [])
                added += apply_preset(existing["children"], children)
    return added


def from_preset(preset: list) -> list:
    """由模板生成一份空的结构。"""
    def build(items):
        out = []
        for raw in items or []:
            key = (raw.get("key") or "").strip()
            if not key:
                continue
            children = raw.get("children") or []
            if children:
                out.append({"key": key, "children": build(children)})
            else:
                out.append({"key": key, "value": ""})
        return out
    return build(preset)


# ─────────────────────────────────────────────
# 输出
# ─────────────────────────────────────────────
def prune(nodes) -> list:
    """丢弃 on=False、空值且无子节点的元素 —— 导出与发送都用它。"""
    out = []
    for item in nodes or []:
        if not is_on(item):
            continue
        children = item.get("children")
        if children is not None:
            kept = prune(children)
            if kept:
                out.append({"key": item.get("key") or "", "children": kept})
            continue
        value = item.get("value")
        value = "" if value is None else str(value).strip()
        if value:
            out.append({"key": item.get("key") or "", "value": value})
    return out


def to_nested(nodes) -> dict:
    """转成嵌套字典：{"外貌": {"整体": {"身高": "170cm"}}}。"""
    result: dict = {}
    for item in prune(nodes):
        key = item.get("key") or "未命名"
        if "children" in item:
            result[key] = to_nested(item["children"])
        else:
            result[key] = item.get("value") or ""
    return result


def render_md(nodes, indent: int = 0) -> list:
    """渲染成 markdown 列表，供拼提示词 / txt 导出使用。"""
    lines: list = []
    pad = "  " * indent
    for item in prune(nodes):
        key = item.get("key") or ""
        if "children" in item:
            lines.append(f"{pad}- {key}：")
            lines.extend(render_md(item["children"], indent + 1))
        else:
            value = item.get("value") or ""
            if "\n" in value:
                lines.append(f"{pad}- {key}：")
                for sub in value.split("\n"):
                    lines.append(f"{pad}  {sub.strip()}")
            else:
                lines.append(f"{pad}- {key}：{value}")
    return lines


def count_leaf(nodes) -> int:
    total = 0
    for item in prune(nodes):
        if "children" in item:
            total += count_leaf(item["children"])
        else:
            total += 1
    return total


def stats(nodes) -> dict:
    """统计：总节点数 / 已填叶子（只算需要输出的）/ 被关闭的元素。"""
    out = {"total": 0, "filled": 0, "off": 0}

    def walk(items, active=True):
        for item in items or []:
            out["total"] += 1
            enabled = active and is_on(item)
            if not is_on(item):
                out["off"] += 1
            children = item.get("children")
            if children:
                walk(children, enabled)
            elif enabled and str(item.get("value") or "").strip():
                out["filled"] += 1

    walk(nodes, True)
    return out
