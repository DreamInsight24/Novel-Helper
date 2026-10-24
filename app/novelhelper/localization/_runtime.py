"""Load immutable catalogs and resolve messages without depending on storage."""
from __future__ import annotations

import json
import logging
import re
import sys
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path
from threading import RLock

import yaml

_LOG = logging.getLogger(__name__)
_PARAM = re.compile(r"\{([a-z][a-z0-9_]*)\}")
_LOCK = RLock()
_config = None
_catalogs = {}
_language = None
_request_language = ContextVar("localization_language", default=None)


def _resource_dir():
    root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[2]))
    return root / "resources" / "localization"


def _flatten(value, prefix=""):
    if not isinstance(value, dict):
        raise ValueError(f"Translation table must be a mapping: {prefix}")
    result = {}
    for key, item in value.items():
        if not isinstance(key, str) or not re.fullmatch(r"[a-z0-9_]+(?:\.[a-z0-9_]+)*", key):
            raise ValueError(f"Invalid translation key: {key!r}")
        name = f"{prefix}.{key}" if prefix else key
        if isinstance(item, dict):
            children = _flatten(item, name)
        elif isinstance(item, str):
            children = {name: item}
        else:
            raise ValueError(f"Translation must be a string: {name}")
        if result.keys() & children.keys():
            raise ValueError(f"Duplicate flattened translation key: {name}")
        result.update(children)
    return result


def initialize(resource_dir: Path | None = None) -> None:
    """Load and validate resources atomically; raise ValueError on invalid files."""
    global _config, _catalogs, _language
    root = Path(resource_dir) if resource_dir is not None else _resource_dir()
    try:
        config = json.loads((root / "languages.json").read_text(encoding="utf-8"))
        entries = config["languages"]
        ids = [entry["id"] for entry in entries]
        if not ids or len(set(ids)) != len(ids):
            raise ValueError("Language list is empty or contains duplicate IDs")
        for entry in entries:
            if not re.fullmatch(r"[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*", entry["id"]):
                raise ValueError(f"Invalid language ID: {entry['id']}")
            if not isinstance(entry["name"], str) or not entry["name"]:
                raise ValueError("Language name must be a nonempty string")
        if config["default"] not in ids or config["fallback"] not in ids:
            raise ValueError("Default and fallback languages must be listed")
        catalogs = {lang: _flatten(yaml.safe_load((root / f"{lang}.yml").read_text(encoding="utf-8"))) for lang in ids}
    except (OSError, ValueError, KeyError, TypeError, yaml.YAMLError) as exc:
        raise ValueError(f"Invalid localization resources in {root}: {exc}") from exc
    with _LOCK:
        _config, _catalogs, _language = config, catalogs, config["default"]


def _ensure():
    if _config is None:
        with _LOCK:
            if _config is None:
                initialize()


def resolve_language(lang_id: str) -> str:
    _ensure()
    if lang_id in _catalogs:
        return lang_id
    _LOG.warning("Unknown language %s; falling back to %s", lang_id, _config["fallback"])
    return _config["fallback"]


def set_language(lang_id: str) -> None:
    """Switch the process language immediately; persistence belongs to the caller."""
    global _language
    with _LOCK:
        _language = resolve_language(lang_id)


def get_language() -> str:
    _ensure()
    return _request_language.get() or _language


@contextmanager
def language_context(lang_id: str):
    """Temporarily select a language for this request without changing other requests."""
    token = _request_language.set(resolve_language(lang_id))
    try:
        yield
    finally:
        _request_language.reset(token)


def get_languages() -> dict:
    """Return a detached JSON-compatible configuration and current language."""
    _ensure()
    return {**json.loads(json.dumps(_config)), "current": get_language()}


def get_translations(lang_id: str) -> dict:
    """Return a flat copy, including fallback values for missing keys."""
    lang = resolve_language(lang_id)
    fallback = _catalogs[_config["fallback"]]
    for key in fallback.keys() - _catalogs[lang].keys():
        _LOG.warning("Missing translation language=%s key=%s", lang, key)
    return {**fallback, **_catalogs[lang]}


def t(key: str, **params) -> str:
    _ensure()
    lang = get_language()
    message = _catalogs[lang].get(key)
    if message is None:
        _LOG.warning("Missing translation language=%s key=%s", lang, key)
        message = _catalogs[_config["fallback"]].get(key, key)
    return _PARAM.sub(lambda m: str(params[m[1]]) if m[1] in params else m[0], message)


def validate_translations() -> None:
    """Raise ValueError for missing/extra keys or inconsistent placeholders."""
    _ensure()
    baseline = _catalogs[_config["default"]]
    for lang, catalog in _catalogs.items():
        if catalog.keys() != baseline.keys():
            raise ValueError(f"Translation keys differ for {lang}: missing={baseline.keys() - catalog.keys()}, extra={catalog.keys() - baseline.keys()}")
        for key, message in catalog.items():
            if set(_PARAM.findall(message)) != set(_PARAM.findall(baseline[key])):
                raise ValueError(f"Translation placeholders differ: {lang}/{key}")
