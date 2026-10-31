#!/usr/bin/env python3
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

"""Layout-v2 migration: equipment -> items, full sections, rewired pointers."""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))

with tempfile.TemporaryDirectory(prefix="novelhelper_layout_") as temp:
    os.environ["NOVELHELPER_HOME"] = temp
    os.environ["NOVELHELPER_DATA"] = str(Path(temp) / "data")

    from novelhelper import store
    from novelhelper.store._paths import novel_data_dir

    store.ensure_dirs()
    novel = store.create_novel("Layout migration test")
    store.set_active_novel(novel["id"])
    data_dir = novel_data_dir(novel["id"])

    def write(name, value):
        (data_dir / f"{name}.json").write_text(
            json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    write("sections", {
        "items": [
            {"key": "world", "label": "世界设定", "on": True},
            {"key": "species", "label": "物种", "on": False},
        ],
        "builtins": {"equipment": {"on": True}, "items": {"on": False}},
        "order": ["characters", "world", "equipment", "other"],
    })
    write("items", {"items": [{"id": "it_a", "name": "旧道具", "category": "道具", "tags": ["旧"]}],
                    "categories": ["道具", "其他"]})
    write("equipment", {"items": [{
        "id": "eq_a", "name": "旧斗篷", "category": "服饰", "slot": "上衣",
        "tags": ["旧", "防具"],
        "elements": [{"key": "基本", "children": [{"key": "材质", "value": "棉"}]}],
    }], "slots": ["上衣", "下装"]})
    write("characters", {"items": [{
        "id": "ch_a", "name": "甲", "inventory": [], "equipment": [
            {"equip_id": "eq_a", "carried": True, "note": "旧引用"},
        ],
    }]})
    write("relations", {"initialized": True, "items": [{
        "id": "rel_a", "source": {"collection": "characters", "id": "ch_a"},
        "target": {"collection": "equipment", "id": "eq_a"},
        "type": "持有", "directed": True,
    }]})
    write("schema", {
        "items": {"label": "道具设定", "elements": [{"key": "基本", "children": [{"key": "类型"}]}]},
        "equipment": {"label": "服饰与装备", "elements": [
            {"key": "基本", "children": [{"key": "穿戴部位"}, {"key": "材质"}]},
            {"key": "效果", "children": [{"key": "耐久"}]},
        ]},
    })

    result = store.migrate_active_layout()
    assert result["migrated"] is True, result
    sections = json.loads((data_dir / "sections.json").read_text(encoding="utf-8"))
    items = json.loads((data_dir / "items.json").read_text(encoding="utf-8"))
    equipment = json.loads((data_dir / "equipment.json").read_text(encoding="utf-8"))
    schema = json.loads((data_dir / "schema.json").read_text(encoding="utf-8"))
    relations = json.loads((data_dir / "relations.json").read_text(encoding="utf-8"))

    assert all(sec.get("on") is True for sec in sections["items"]), sections
    assert sections["layout_version"] == 2
    assert sections["order"][-1] == "other"
    assert "equipment" not in sections["order"]
    assert equipment["items"] == []
    by_id = {rec["id"]: rec for rec in items["items"]}
    assert by_id["eq_a"]["category"] == "服饰"
    assert by_id["eq_a"]["slot"] == "上衣"
    assert by_id["eq_a"]["tags"] == ["旧", "防具"]
    assert items["categories"] == ["道具", "武器", "材料", "消耗品", "魔物", "服饰", "装备", "其他"]
    assert schema["items"]["label"] == "物品"

    paths = []

    def leaves(nodes, prefix=""):
        for node in nodes:
            if node.get("children"):
                leaves(node["children"], prefix + node["key"] + "/")
            else:
                paths.append(prefix + node["key"])

    leaves(schema["items"]["elements"])
    assert "基本/穿戴部位" in paths and "效果/耐久" in paths, paths
    assert relations["items"][0]["target"]["collection"] == "items"
    assert Path(result["backup"]).is_dir()
    assert store.migrate_active_layout()["migrated"] is False
    print("PASS: layout v2 migration, equipment merge, section defaults, and pointer rewiring")
