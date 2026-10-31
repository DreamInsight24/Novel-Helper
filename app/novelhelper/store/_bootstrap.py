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

"""Startup directory creation and legacy config/mode migrations."""
from __future__ import annotations

import json

from .. import prompts as prompts_mod, providers
from ._defaults import default_for
from ._directories import io_in, io_out, log_dir, out_dir, plan_dir, text_dir, txt_dir
from ._paths import (
    COLLECTIONS, DATA_DIR, DEBUG_MODE, DEFAULT_LOG_DIR, FROZEN, NOVELS_DIR,
    NOVEL_WORKSPACES_DIR, active_novel_id,
)
from ._repository import _path, save

def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not _path("config").exists():
        save("config", default_for("config"))
    _migrate_config()
    legacy_layout = any(
        (DATA_DIR / f"{name}.json").exists() for name in COLLECTIONS if name != "config"
    )
    if legacy_layout and not active_novel_id():
        _migrate_modes()
        _migrate_mode_kinds()
    for path in (DATA_DIR, NOVELS_DIR, NOVEL_WORKSPACES_DIR,
                 io_in(), io_out(),
                 out_dir(), plan_dir(), txt_dir(), text_dir(), log_dir()):
        path.mkdir(parents=True, exist_ok=True)
    novel_id = active_novel_id()
    if novel_id:
        (DATA_DIR / "novels" / novel_id / "conversations").mkdir(parents=True, exist_ok=True)
        for name in COLLECTIONS:
            if name != "config" and not _path(name).exists():
                save(name, default_for(name))
        # Restore the complete settings layout and fold equipment into items.
        from ._layout import migrate_active_layout
        migrate_active_layout()

def _migrate_config() -> None:
    """把旧版 config.json 补齐到当前结构，并迁移旧目录。"""
    path = _path("config")
    if not path.exists():
        return
    try:
        cfg = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return
    changed = False
    if "layout_version" not in cfg:
        cfg["layout_version"] = 1
        changed = True
    if "initialized" not in cfg:
        cfg["initialized"] = True
        changed = True
    if "active_novel_id" not in cfg:
        cfg["active_novel_id"] = ""
        changed = True
    if int(cfg.get("version") or 0) < 4:
        cfg["version"] = 4
        changed = True
    defaults = providers.default_api_config()
    api = cfg.setdefault("api", {})
    for key, value in defaults.items():
        if key not in api:
            api[key] = value
            changed = True
    if not api.get("provider"):
        api["provider"] = "deepseek"
        changed = True
    ds = providers.get_provider("deepseek")
    if providers.provider_for_config({"api": api})["id"] == "deepseek":
        allowed = list(ds["models"])
        if api.get("models") != allowed:
            api["models"] = allowed
            changed = True
        if api.get("default_model") not in allowed:
            api["default_model"] = ds["default_model"]
            changed = True
    if "efforts" not in cfg:
        cfg["efforts"] = list(providers.EFFORTS)
        changed = True
    server = cfg.setdefault("server", {})
    if "host" not in server:
        server["host"] = "127.0.0.1"
        changed = True
    if "port" not in server:
        server["port"] = 8766 if DEBUG_MODE else 8765
        changed = True
    if "onboarding" not in cfg:
        cfg["onboarding"] = {"done": False, "version": 1}
        changed = True
    paths = cfg.setdefault("paths", {})
    mapping = {
        "import_dir": ("workspace/io/in", "import"),
        "export_dir": ("workspace/io/out", "export"),
        "output_dir": ("workspace/out", "output"),
        "plan_dir": ("workspace/out/plan", "output/plan"),
        "txt_dir": ("workspace/out/txt", "output/txt"),
    }
    for key, (old, new) in mapping.items():
        if paths.get(key) == old:
            paths[key] = new
            changed = True
        paths.setdefault(key, new.replace("workspace/", ""))
    if "text_dir" not in paths:
        paths["text_dir"] = "text"
        changed = True
    if "data_dir" not in paths:
        paths["data_dir"] = "data"
        changed = True
    if "log_dir" not in paths:
        paths["log_dir"] = DEFAULT_LOG_DIR
        changed = True
    if (DEBUG_MODE or FROZEN) and paths.get("log_dir") == "../log":
        paths["log_dir"] = "log"
        changed = True
    if DEBUG_MODE:
        debug_paths = {
            "import_dir": "import",
            "export_dir": "export",
            "output_dir": "output",
            "plan_dir": "output/plan",
            "txt_dir": "output/txt",
            "text_dir": "text",
            "log_dir": "log",
        }
        for key, value in debug_paths.items():
            if paths.get(key) != value:
                paths[key] = value
                changed = True
    if changed:
        save("config", cfg)

def _migrate_modes() -> None:
    """没有 modes.json 时，从旧 prompts.json 的 work 段迁移工作提示词。"""
    if _path("modes").exists():
        return
    modes = prompts_mod.default_modes()
    old_prompts = DATA_DIR / "prompts.json"
    if old_prompts.exists():
        try:
            raw = json.loads(old_prompts.read_text(encoding="utf-8"))
            work = raw.get("work") or {}
            for mode in modes:
                value = work.get(mode["id"])
                if isinstance(value, str) and value.strip():
                    mode["system_prompt"] = value
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass
    save("modes", {"items": modes})

def _migrate_mode_kinds() -> None:
    """
    给旧版模式补上用途分组（kind）。

    · write   = 写稿模式，用在 AI 工作站；
    · process = 稿件处理模式，用在稿件处理页。

    旧版没有这个字段：内置「润色修订」归入稿件处理，其余归入写稿。
    只补齐缺失项，用户自己改过的用途不会被覆盖。
    """
    path = _path("modes")
    if not path.exists():
        return
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return
    if not isinstance(data, dict):
        return
    items = data.get("items") or []
    if not isinstance(items, list):
        return
    changed = False
    for mode in items:
        if not isinstance(mode, dict) or mode.get("kind") in ("write", "process"):
            continue
        mode["kind"] = "process" if mode.get("id") == "polish" else "write"
        changed = True
    if changed:
        save("modes", data)
