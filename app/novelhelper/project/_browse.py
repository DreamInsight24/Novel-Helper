"""Workspace import, export, and file browsing operations."""
from __future__ import annotations

from ..localization import t

from datetime import datetime
from pathlib import Path

from ..store import io_in, io_out, text_dir
from ._paths import rel_str


def import_sources() -> list:
    """可导入的文件：workspace/import/ 下放进去的 md / txt / json。"""
    entries = []
    base = io_in()
    if not base.exists():
        return entries
    for path in sorted(base.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix.lower() not in (".md", ".txt", ".json"):
            continue
        entries.append({
            "path": rel_str(path),
            "name": path.name,
            "group": "import",
            "size": path.stat().st_size,
            "mtime": datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m-%d %H:%M"),
        })
    return entries


def _list_files(base: Path) -> dict:
    if not base.exists():
        base.mkdir(parents=True, exist_ok=True)
    files = []
    for path in sorted(base.rglob("*")):
        if not path.is_file():
            continue
        files.append({
            "path": rel_str(path),
            "name": path.name,
            "size": path.stat().st_size,
            "mtime": datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m-%d %H:%M"),
            "ext": path.suffix.lower(),
        })
    return {"root": str(base), "rel": rel_str(base), "files": files}


def list_io(dir_rel: str = "") -> dict:
    """列出导入 / 导出目录下的文件。"""
    return _list_files(io_in() if dir_rel.startswith("import") else io_out())


def list_text() -> dict:
    """稿件处理工作区的独立文件夹（默认 workspace/text/，可在「模型设置」页改）。"""
    return _list_files(text_dir())


def browse(path: str = "") -> dict:
    """磁盘目录浏览：给"导出到任意位置"用。"""
    if not path:
        drives = []
        for letter in "CDEFGHIJKLMNOPQRSTUVWXYZ":
            root = Path(f"{letter}:/")
            if root.exists():
                drives.append({"name": f"{letter}:\\", "path": str(root)})
        home = Path.home()
        return {"path": "", "parent": "", "dirs": drives, "files": [], "shortcut": {"name": t("browse.user_dir"), "path": str(home)}}
    target = Path(path)
    if not target.exists() or not target.is_dir():
        raise FileNotFoundError(t('errors.dir_missing', path=path))
    dirs, files = [], []
    try:
        for child in sorted(target.iterdir(), key=lambda p: p.name.lower()):
            if child.name.startswith("."):
                continue
            if child.is_dir():
                dirs.append({"name": child.name, "path": str(child)})
            elif child.suffix.lower() in (".txt", ".md", ".json", ".csv"):
                files.append({"name": child.name, "path": str(child), "size": child.stat().st_size})
    except PermissionError:
        pass
    parent = str(target.parent) if target.parent != target else ""
    return {"path": str(target), "parent": parent, "dirs": dirs[:400], "files": files[:400]}


def write_external(path: str, content: str, encoding: str = "utf-8") -> Path:
    """txt 面板的对外导出：允许用户自选位置。"""
    target = Path(path).expanduser()
    if target.is_dir():
        raise IsADirectoryError(str(target))
    if not target.parent.exists():
        raise FileNotFoundError(t("errors.dir_missing", path=target.parent))
    target.write_text(content, encoding=encoding, errors="replace")
    return target
