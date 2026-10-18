#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
命令行工具的共享入口。

用法：
    import common as nh
    nh.setup_console()
    nh.tool("write")         # 读取 data/config.json
    nh.prompt("write")       # 旧版命令行兼容提示词
    nh.path("output_dir")    # 解析为绝对路径
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent
ROOT = APP_DIR
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

from novelhelper import ai, context, elements, project, prompts as prompts_mod, store  # noqa: E402

PROJECT_ROOT = store.PROJECT_ROOT
DATA_DIR = store.DATA_DIR


def setup_console() -> None:
    """让 Windows 终端正常显示中文。"""
    try:
        if os.name == "nt":
            import ctypes

            ctypes.windll.kernel32.SetConsoleOutputCP(65001)  # type: ignore[attr-defined]
            ctypes.windll.kernel32.SetConsoleCP(65001)  # type: ignore[attr-defined]
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:
        pass


def config() -> dict:
    return store.load("config")


def tool(name: str) -> dict:
    return ai.tool_settings(config(), name)


def path(key: str) -> Path:
    value = (config().get("paths") or {}).get(key, "")
    target = Path(value)
    return target if target.is_absolute() else (PROJECT_ROOT / target)


def prompts() -> dict:
    """旧版命令行兼容：返回内置工具提示词。"""
    return prompts_mod.default_prompts()


def prompt(name: str) -> str:
    return prompts_mod.TOOL_PROMPTS.get(name) or prompts_mod.WRITE_SYSTEM_PROMPT


def section(key: str, default: str = "") -> str:
    return default


def state() -> dict:
    return store.load("state")


def save_state(data: dict) -> None:
    data["updated"] = store.now_str()
    store.save("state", data)


def db() -> dict:
    return store.load_all()


def chat(tool_name: str, messages: list, override: dict | None = None) -> str:
    result = ai.chat(config(), tool_name, messages, override=override)
    return prompts_mod.with_notice(result["text"])


__all__ = [
    "ROOT", "DATA_DIR", "PROJECT_ROOT", "ai", "context", "elements", "project",
    "store", "prompts_mod", "setup_console", "config", "tool", "path", "prompts",
    "prompt", "section", "state", "save_state", "db", "chat",
]
