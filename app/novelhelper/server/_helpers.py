from __future__ import annotations

from ..localization import t

import json
from pathlib import Path
from urllib.parse import urlparse

from .. import ai, context

def _compact_selection(selection: dict) -> dict:
    """历史里只保存指针与输入文本，不重复保存设定内容与项目文件正文。"""
    data = json.loads(json.dumps(selection or {}, ensure_ascii=False))
    data.pop("prompt", None)
    data.pop("work_prompt", None)
    files = []
    for entry in data.get("project_files") or []:
        if isinstance(entry, dict):
            files.append({"path": entry.get("path") or "", "label": entry.get("label") or ""})
        elif isinstance(entry, str):
            files.append({"path": entry})
    data["project_files"] = files
    return data

def _surface_error(mode: dict, surface: str) -> str:
    """校验模式用途与调用界面是否匹配；返回空字符串表示通过。"""
    if surface not in ("workstation", "manuscript"):
        return t('errors.unknown_surface', name=surface)
    expected = "process" if surface == "manuscript" else "write"
    actual = context.mode_kind(mode)
    if actual == expected:
        return ""
    label = mode.get("label") or mode.get("id") or t("errors.this_mode")
    if expected == "process":
        return t('errors.not_process_mode', label=label)
    return t('errors.is_process_mode', label=label)

def _api_ready(config: dict) -> bool:
    try:
        api = ai.api_settings(config)
        if api.get("api_key"):
            return True
        host = (urlparse(api.get("base_url") or "").hostname or "").lower()
        return bool(api.get("provider", {}).get("generic") or host in ("127.0.0.1", "localhost", "::1"))
    except Exception:
        return False

def _json_default(obj):
    if isinstance(obj, Path):
        return str(obj)
    raise TypeError(t('errors.serialize_failed', type=type(obj)))
