"""Project-relative path resolution and basic text I/O."""
from __future__ import annotations

from pathlib import Path

from ..store import PROJECT_ROOT


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
