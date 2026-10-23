"""Configurable workspace and log directories."""
from __future__ import annotations

from pathlib import Path

from ._paths import DEBUG_MODE, DEFAULT_LOG_DIR, FROZEN, PROJECT_ROOT, RUNTIME_ROOT, _root
from ._repository import load

def io_in() -> Path:
    return _root(load("config").get("paths", {}).get("import_dir", "workspace/import"))

def io_out() -> Path:
    return _root(load("config").get("paths", {}).get("export_dir", "workspace/export"))

def out_dir() -> Path:
    return _root(load("config").get("paths", {}).get("output_dir", "workspace/output"))

def plan_dir() -> Path:
    return _root(load("config").get("paths", {}).get("plan_dir", "workspace/output/plan"))

def txt_dir() -> Path:
    return _root(load("config").get("paths", {}).get("txt_dir", "workspace/output/txt"))

def text_dir() -> Path:
    """稿件处理工作区的独立文件夹。"""
    return _root(load("config").get("paths", {}).get("text_dir", "workspace/text"))

def log_dir() -> Path:
    """本地日志目录。"""
    value = load("config").get("paths", {}).get("log_dir", DEFAULT_LOG_DIR)
    if (DEBUG_MODE or FROZEN) and value == "../log":
        value = "log"
    return _root(value)
