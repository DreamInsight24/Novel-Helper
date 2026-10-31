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

"""One-time v2 layout migration for the current novel.

The v2610.3 menu/UI work split settings into one collapsible group and made
several sections hidden by default.  This migration restores the complete set of
built-in sections and merges the old ``equipment`` collection into ``items``:

* equipment records keep their IDs, so character ``equipment`` pointers and
  relationships continue to resolve;
* every item gets a category (服饰 / 装备 when the old record had none);
* item templates absorb the old equipment fields instead of losing them;
* all setting sections become visible, and the frontend decides the hierarchy;
* a snapshot is written before any data is changed.
"""
from __future__ import annotations

import copy
import logging
import shutil
from pathlib import Path

from ._defaults import default_sections
from ._names import now_str, stamp
from ._paths import active_novel_id, novel_data_dir
from ._repository import load, save

LAYOUT_VERSION = 2

# Canonical id order used by the sidebar/management page.  Inventory is a child
# of characters, map/factions are children of the world section, and Other is
# always last (new sections are inserted before it by the frontend).
_ORDER_HEAD = ["characters", "inventory", "section_world", "world", "factions", "items"]


def _as_dict(value) -> dict:
    return value if isinstance(value, dict) else {}


def _as_list(value) -> list:
    return value if isinstance(value, list) else []


def _merge_elements(base: list, extra: list) -> list:
    """Recursively merge template groups without duplicating leaf keys."""
    result = copy.deepcopy(base) if isinstance(base, list) else []
    for wanted in extra or []:
        if not isinstance(wanted, dict):
            continue
        key = str(wanted.get("key") or "").strip()
        if not key:
            continue
        found = next((node for node in result
                      if isinstance(node, dict) and str(node.get("key") or "").strip() == key), None)
        wanted_children = wanted.get("children")
        if found is None:
            result.append(copy.deepcopy(wanted))
            continue
        if isinstance(wanted_children, list):
            found.pop("value", None)
            found["children"] = _merge_elements(_as_list(found.get("children")), wanted_children)
    return result


def _merge_equipment(items: dict, equipment: dict) -> tuple[dict, int]:
    """Move equipment records into items, preserving IDs and old categories."""
    merged = copy.deepcopy(items)
    merged["items"] = _as_list(merged.get("items"))
    by_id = {rec.get("id"): rec for rec in merged["items"] if isinstance(rec, dict) and rec.get("id")}
    moved = 0

    default_categories = ["道具", "武器", "材料", "消耗品", "魔物", "服饰", "装备", "其他"]
    categories = []
    for value in _as_list(merged.get("categories")) + default_categories:
        if isinstance(value, str) and value.strip() and value.strip() not in categories:
            categories.append(value.strip())

    for old in _as_list(equipment.get("items")):
        if not isinstance(old, dict):
            continue
        rec = copy.deepcopy(old)
        if not str(rec.get("category") or "").strip():
            rec["category"] = "服饰"
        if rec["category"] not in categories:
            categories.append(rec["category"])
        rid = rec.get("id")
        if rid and rid in by_id:
            current = by_id[rid]
            for key, value in rec.items():
                if key == "elements" and isinstance(value, list):
                    current["elements"] = _merge_elements(_as_list(current.get("elements")), value)
                elif key not in current or current[key] in ("", None, []):
                    current[key] = value
            continue
        merged["items"].append(rec)
        if rid:
            by_id[rid] = rec
        moved += 1

    merged["items"] = [rec for rec in merged["items"] if isinstance(rec, dict)]
    extras = [name for name in categories if name not in default_categories]
    merged["categories"] = default_categories + extras
    merged["slots"] = list(equipment.get("slots") or merged.get("slots") or [])
    merged["layout_version"] = LAYOUT_VERSION
    return merged, moved


def _merge_schema(schema: dict) -> dict:
    updated = copy.deepcopy(_as_dict(schema))
    items = updated.setdefault("items", {})
    if not isinstance(items, dict):
        items = updated["items"] = {}
    items["label"] = "物品"
    items["elements"] = _as_list(items.get("elements"))
    equipment = _as_dict(updated.get("equipment"))
    if equipment.get("elements"):
        items["elements"] = _merge_elements(items["elements"], _as_list(equipment.get("elements")))
    if equipment:
        equipment["label"] = "服饰与装备（已并入物品）"
        updated["equipment"] = equipment
    return updated


def _restore_sections(sections: dict) -> dict:
    updated = copy.deepcopy(_as_dict(sections))
    items = _as_list(updated.get("items"))
    items = [sec for sec in items if isinstance(sec, dict) and str(sec.get("key") or "").strip()]
    by_key = {str(sec.get("key")): sec for sec in items}

    for legacy in default_sections().get("items") or []:
        key = str(legacy.get("key") or "")
        if not key:
            continue
        if key not in by_key:
            items.append(copy.deepcopy(legacy))
            by_key[key] = items[-1]
        else:
            # Old files may carry "世界观"; the current wording is "世界设定".
            if key == "world" and str(by_key[key].get("label") or "") in ("世界观", "Worldview"):
                by_key[key]["label"] = "世界设定"
            if not str(by_key[key].get("desc") or "").strip():
                by_key[key]["desc"] = legacy.get("desc") or ""

    # The product decision is that every built-in/base section is visible from
    # the start; users can still turn individual cards off afterwards.
    for sec in items:
        sec["on"] = True

    builtins = _as_dict(updated.get("builtins"))
    builtins.pop("equipment", None)
    for key in ("characters", "world", "factions", "inventory", "items", "other"):
        value = builtins.get(key)
        if isinstance(value, dict):
            value["on"] = True
        else:
            builtins[key] = {"on": True}
    updated["builtins"] = builtins
    updated["items"] = items

    section_ids = ["section_" + str(sec.get("key")) for sec in items
                   if sec.get("key") and str(sec.get("key")) != "world"]
    updated["order"] = _ORDER_HEAD + section_ids + ["other"]
    updated["layout_version"] = LAYOUT_VERSION
    return updated


def _update_relations(relations: dict) -> tuple[dict, int]:
    updated = copy.deepcopy(_as_dict(relations))
    changed = 0
    for edge in _as_list(updated.get("items")):
        if not isinstance(edge, dict):
            continue
        for end in ("source", "target"):
            ref = edge.get(end)
            if isinstance(ref, dict) and ref.get("collection") == "equipment":
                ref["collection"] = "items"
                changed += 1
    return updated, changed


def _backup(novel_dir: Path, names: tuple[str, ...]) -> Path:
    target = novel_dir / "migration_backups" / ("v2_" + stamp())
    target.mkdir(parents=True, exist_ok=True)
    for name in names:
        path = novel_dir / f"{name}.json"
        if path.exists():
            shutil.copy2(path, target / path.name)
    return target


def migrate_active_layout() -> dict:
    """Migrate the active novel once; safe to call on every startup/open.

    Returns a small result dict used by logging/tests.  Any unreadable collection
    is left untouched so a damaged file cannot make the app fail to start.
    """
    novel_id = active_novel_id()
    if not novel_id:
        return {"migrated": False, "reason": "no-active-novel"}

    try:
        sections = _as_dict(load("sections"))
        equipment = _as_dict(load("equipment"))
    except Exception:
        return {"migrated": False, "reason": "unreadable-layout"}

    try:
        version = int(sections.get("layout_version") or 1)
    except (TypeError, ValueError):
        version = 1
    has_equipment = bool(_as_list(equipment.get("items")))
    if version >= LAYOUT_VERSION and not has_equipment:
        return {"migrated": False, "reason": "already-current"}

    novel_dir = novel_data_dir(novel_id)
    backup = _backup(novel_dir, ("sections", "schema", "items", "equipment", "characters", "relations"))

    try:
        schema = _merge_schema(_as_dict(load("schema")))
        items = _as_dict(load("items"))
        items, moved = _merge_equipment(items, equipment)
        characters = _as_dict(load("characters"))
        relations = _as_dict(load("relations"))

        save("items", items)
        save("schema", schema)
        save("sections", _restore_sections(sections))

        char_changed = False
        for rec in _as_list(characters.get("items")):
            if not isinstance(rec, dict):
                continue
            if not isinstance(rec.get("inventory"), list):
                rec["inventory"] = []
                char_changed = True
            if not isinstance(rec.get("equipment"), list):
                rec["equipment"] = []
                char_changed = True
        if char_changed:
            save("characters", characters)

        relations, rel_changed = _update_relations(relations)
        if rel_changed:
            save("relations", relations)

        # Empty the old collection only after items and relationship references
        # are safely written.  Its record shape is retained for old readers.
        save("equipment", {"items": [], "slots": equipment.get("slots") or []})

        return {
            "migrated": True,
            "moved_equipment": moved,
            "rewired_relations": rel_changed,
            "backup": str(backup),
            "at": now_str(),
        }
    except Exception as exc:  # noqa: BLE001 - startup must not be blocked by migration
        try:
            logging.getLogger("novelhelper").exception(
                "v2 layout migration failed (backup=%s): %s", backup, exc)
        except Exception:
            pass
        return {"migrated": False, "reason": "error", "error": str(exc), "backup": str(backup)}
