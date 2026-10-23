"""Collection snapshot export."""
from __future__ import annotations

from pathlib import Path

from ._collections import load_all_names
from ._directories import io_out
from ._names import stamp
from ._repository import _path

def backup_all() -> Path:
    """把 data/ 下的 JSON 快照到导出目录 backup_<ts>/。"""
    target = io_out() / f"backup_{stamp()}"
    target.mkdir(parents=True, exist_ok=True)
    for name in load_all_names():
        path = _path(name)
        if path.exists():
            (target / path.name).write_bytes(path.read_bytes())
    return target
