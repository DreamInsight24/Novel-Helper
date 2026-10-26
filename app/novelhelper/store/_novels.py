"""Novel workspace and per-novel configuration primitives."""
from __future__ import annotations

import copy
import json
import os
import shutil
from pathlib import Path

from ._localized import localized_default_for
from ._names import new_id, now_str
from ._paths import (
    DATA_DIR,
    NOVELS_DIR,
    NOVEL_WORKSPACES_DIR,
    active_novel_id,
    novel_data_dir,
    novel_workspace_dir,
    validate_novel_id,
)

_CONFIG_FILE = "config.json"
_META_FILE = "novel.json"
_GLOBAL_ONLY_KEYS = {"active_novel_id", "initialized", "layout_version"}


def _write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def novel_config_template(global_config: dict) -> dict:
    """Copy global values while making inheritance explicit per top-level key."""
    values = copy.deepcopy(global_config or {})
    paths = values.get("paths")
    if isinstance(paths, dict):
        for key in ("import_dir", "export_dir", "output_dir", "plan_dir", "txt_dir", "text_dir"):
            value = str(paths.get(key) or "")
            if value.replace("\\", "/").startswith("workspace/"):
                paths[key] = value.replace("\\", "/")[len("workspace/"):]
    values = {key: value for key, value in values.items() if key not in _GLOBAL_ONLY_KEYS}
    return {
        "version": 1,
        "use_global": {key: True for key in values},
        "values": values,
    }


def effective_config(global_config: dict, novel_config: dict | None) -> dict:
    """Resolve a novel config without mutating either source."""
    if not isinstance(novel_config, dict):
        return copy.deepcopy(global_config or {})
    values = copy.deepcopy(novel_config.get("values") or {})
    inherited = novel_config.get("use_global") or {}
    result = copy.deepcopy(global_config or {})
    for key, value in values.items():
        if key in _GLOBAL_ONLY_KEYS:
            continue
        if not inherited.get(key, True):
            result[key] = value
    return result


def list_novels() -> list[dict]:
    """List metadata, degrading a malformed entry instead of failing the list."""
    NOVELS_DIR.mkdir(parents=True, exist_ok=True)
    active = active_novel_id()
    result = []
    for path in sorted(NOVELS_DIR.iterdir(), key=lambda item: item.name):
        if not path.is_dir():
            continue
        try:
            novel_id = validate_novel_id(path.name)
        except ValueError:
            continue
        meta_path = path / _META_FILE
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            if not isinstance(meta, dict):
                raise ValueError("metadata must be an object")
            item = dict(meta)
            item["id"] = novel_id
            item["ok"] = True
        except (OSError, ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            item = {"id": novel_id, "title": "", "ok": False, "error": str(exc)}
        item["active"] = novel_id == active
        result.append(item)
    return result


def read_novel(novel_id: str) -> dict | None:
    path = novel_data_dir(novel_id) / _META_FILE
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError, ValueError, UnicodeDecodeError):
        return None
    return data if isinstance(data, dict) else None


def create_novel(title: str, author: str = "", description: str = "", global_config: dict | None = None) -> dict:
    """Create an isolated novel from defaults and a copied config snapshot."""
    title = str(title or "").strip()
    if not title:
        raise ValueError("novel title is required")
    config = copy.deepcopy(global_config) if global_config is not None else _load_global_config()
    novel_id = new_id("nv").lower()
    data_dir = novel_data_dir(novel_id)
    workspace_dir = novel_workspace_dir(novel_id)
    if data_dir.exists() or workspace_dir.exists():
        raise FileExistsError("generated novel id already exists")
    created = now_str()
    meta = {
        "id": novel_id,
        "title": title,
        "author": str(author or "").strip(),
        "description": str(description or "").strip(),
        "created": created,
        "updated": created,
        "last_opened": "",
    }
    try:
        data_dir.mkdir(parents=True)
        (data_dir / "conversations").mkdir()
        workspace_dir.mkdir(parents=True)
        for name in ("import", "export", "output", "text", "output/plan", "output/txt"):
            (workspace_dir / name).mkdir(parents=True, exist_ok=True)
        _write_json(data_dir / _META_FILE, meta)
        _write_json(data_dir / _CONFIG_FILE, novel_config_template(config))
        language = str(config.get("language") or "zh-CN")
        for name in ("schema", "sections", "modes", "state", "history", "meta",
                     "characters", "factions", "items", "equipment", "other",
                     "memories", "worldmap"):
            _write_json(data_dir / f"{name}.json", localized_default_for(name, language))
    except Exception:
        shutil.rmtree(data_dir, ignore_errors=True)
        shutil.rmtree(workspace_dir, ignore_errors=True)
        raise
    return meta


def _load_global_config() -> dict:
    path = DATA_DIR / _CONFIG_FILE
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError, ValueError, UnicodeDecodeError):
        from ._defaults import default_config
        return default_config()
    return value if isinstance(value, dict) else {}


def load_novel_config(novel_id: str) -> dict:
    path = novel_data_dir(novel_id) / _CONFIG_FILE
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError, ValueError, UnicodeDecodeError):
        return novel_config_template(_load_global_config())
    return value if isinstance(value, dict) else novel_config_template(_load_global_config())


def set_active_novel(novel_id: str | None) -> str:
    """Persist the active id in global config; an empty value means no active novel."""
    from ._repository import load, save
    value = ""
    if novel_id:
        value = validate_novel_id(novel_id)
        if not (novel_data_dir(value) / _META_FILE).exists():
            raise FileNotFoundError(value)
    config = load("config")
    config["active_novel_id"] = value
    save("config", config)
    return value

