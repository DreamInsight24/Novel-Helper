#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本地文件日志。

默认写入项目根目录 log/novelhelper.log，按 5 MB 轮转，保留 5 份。
记录用户请求、AI 交互元信息与异常；不会写入 API Key。
"""
from __future__ import annotations

import json
import logging
from logging.handlers import RotatingFileHandler

from . import store

_LOGGER: logging.Logger | None = None


def _get_logger() -> logging.Logger:
    global _LOGGER
    if _LOGGER is not None:
        return _LOGGER
    log_dir = store.log_dir()
    log_dir.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("novelhelper")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    if not any(isinstance(handler, RotatingFileHandler) for handler in logger.handlers):
        handler = RotatingFileHandler(
            log_dir / "novelhelper.log",
            maxBytes=5 * 1024 * 1024,
            backupCount=5,
            encoding="utf-8",
        )
        handler.setFormatter(logging.Formatter(
            "%(asctime)s | %(levelname)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        ))
        logger.addHandler(handler)
    _LOGGER = logger
    return logger


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
