#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本地文件日志。

每次启动创建一个以时间命名的日志文件，例如：
    log/novelhelper_20261018_174800.log

最多保留 10 个日志文件，超出时删除最早的文件。
记录用户请求、AI 交互元信息与异常；不会写入 API Key。
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

from . import store

MAX_LOGS = 10
_LOGGER: logging.Logger | None = None
_SESSION_FILE: Path | None = None


def _prune(log_dir: Path) -> None:
    files = sorted(
        (path for path in log_dir.glob("novelhelper*.log") if path.is_file()),
        key=lambda path: (path.stat().st_mtime, path.name),
    )
    while len(files) >= MAX_LOGS:
        oldest = files.pop(0)
        try:
            oldest.unlink()
        except OSError:
            pass


def start_session(force: bool = False) -> Path:
    """创建本次启动的日志文件，并清理超出数量上限的旧日志。"""
    global _LOGGER, _SESSION_FILE
    if _LOGGER is not None and _SESSION_FILE is not None and not force:
        return _SESSION_FILE

    log_dir = store.log_dir()
    log_dir.mkdir(parents=True, exist_ok=True)
    _prune(log_dir)

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    target = log_dir / f"novelhelper_{stamp}.log"
    index = 1
    while target.exists():
        target = log_dir / f"novelhelper_{stamp}_{index}.log"
        index += 1

    logger = logging.getLogger("novelhelper")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    for handler in list(logger.handlers):
        try:
            handler.close()
        except Exception:
            pass
        logger.removeHandler(handler)
    handler = logging.FileHandler(target, encoding="utf-8")
    handler.setFormatter(logging.Formatter(
        "%(asctime)s | %(levelname)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    ))
    logger.addHandler(handler)
    _LOGGER = logger
    _SESSION_FILE = target
    return target


def session_file() -> Path:
    return _SESSION_FILE or start_session()


def _get_logger() -> logging.Logger:
    if _LOGGER is None:
        start_session()
    assert _LOGGER is not None
    return _LOGGER


def _value(value) -> str:
    if isinstance(value, (dict, list)):
        text = json.dumps(value, ensure_ascii=False)
    else:
        text = str(value)
    text = text.replace("\r", " ").replace("\n", "\\n")
    return text if len(text) <= 800 else text[:800] + "…"


def _line(category: str, action: str, fields: dict) -> str:
    parts = [f"[{category}] {action}"]
    for key, value in fields.items():
        if value is None or value == "":
            continue
        parts.append(f"{key}={_value(value)}")
    return " | ".join(parts)


def log_event(category: str, action: str, **fields) -> None:
    try:
        _get_logger().info(_line(category, action, fields))
    except Exception:
        pass


def log_warning(category: str, action: str, **fields) -> None:
    try:
        _get_logger().warning(_line(category, action, fields))
    except Exception:
        pass


def log_exception(category: str, action: str, exc: BaseException | None = None, **fields) -> None:
    try:
        text = _line(category, action, fields)
        if exc is not None:
            text += f" | error={type(exc).__name__}: {exc}"
        _get_logger().exception(text)
    except Exception:
        pass
