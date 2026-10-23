"""Small storage identifiers that do not read persisted data."""
from __future__ import annotations

import uuid
from datetime import datetime

from ._paths import SECTION_PREFIX

def now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def stamp() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")

def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"

def section_store_name(key: str) -> str:
    return f"{SECTION_PREFIX}{key}"

def section_key(name: str) -> str:
    return name[len(SECTION_PREFIX):] if name.startswith(SECTION_PREFIX) else ""

def is_section(name: str) -> bool:
    key = section_key(name)
    return bool(key) and key.replace("_", "").isalnum() and key.isascii()
