"""Collection enumeration and schema lookup."""
from __future__ import annotations

from ._names import is_section, section_store_name
from ._paths import COLLECTIONS
from ._repository import load

def section_names() -> list:
    """当前启用的栏目对应的存储名。"""
    out = []
    for item in (load("sections").get("items") or []):
        key = (item.get("key") or "").strip()
        if key and item.get("on", True) is not False:
            out.append(section_store_name(key))
    return out

def load_all() -> dict:
    names = list(COLLECTIONS)
    for name in section_names():
        if name not in names:
            names.append(name)
    return {name: load(name) for name in names}

def load_all_names() -> list:
    names = list(COLLECTIONS)
    for name in section_names():
        if name not in names:
            names.append(name)
    return names

def schema_for(name: str) -> list:
    schema = load("schema")
    entry = schema.get(name) or {}
    return entry.get("elements") or []

def known_collection(name: str) -> bool:
    return name in COLLECTIONS or is_section(name)
