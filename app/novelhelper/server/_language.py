"""Config language persistence: first-run detection and K2 damaged-config recovery.

The localization runtime itself has no storage dependency; this module is the
task-3.2 glue that reads and writes the ``language`` field of the user config
(`store.load("config")` / `store.save("config", config)`). A config without the
field counts as first run; a missing or damaged config is backed up (K2), logged,
and treated the same way.
"""
from __future__ import annotations

import logging
import time

from .. import store
from ..localization import resolve_language, set_language

_LOG = logging.getLogger(__name__)

LANGUAGE_KEY = "language"


def _backup_damaged_config() -> None:
    """Move an unreadable config aside so callers can rebuild defaults (K2)."""
    path = store.DATA_DIR / "config.json"
    if not path.exists():
        return
    backup = path.with_name(f"config.json.bak-{time.strftime('%Y%m%d-%H%M%S')}")
    try:
        path.replace(backup)
        _LOG.warning("Damaged config moved to %s; starting fresh", backup.name)
    except OSError as exc:
        _LOG.error("Failed to back up damaged config %s: %s", path, exc)


def _load_config() -> dict:
    """Return the config dict; missing/damaged files fall back to defaults (K2)."""
    try:
        config = store.load("config")
        if not isinstance(config, dict):
            raise ValueError(f"config.json is not a JSON object: {type(config).__name__}")
        return config
    except (RuntimeError, ValueError) as exc:
        _LOG.warning("Config unreadable (%s); treating as first run", exc)
        _backup_damaged_config()
        return store.default_config()


def first_run() -> bool:
    """True when the config has no language field (damaged config counts as first run)."""
    return LANGUAGE_KEY not in _load_config()


def load_persisted_language() -> str | None:
    """Resolve the persisted language for startup; None when unset."""
    lang = _load_config().get(LANGUAGE_KEY)
    if not lang:
        return None
    resolved = resolve_language(str(lang))
    if resolved != lang:
        _LOG.warning("Persisted language %r unavailable; using %s", lang, resolved)
    return resolved


def apply_persisted_language() -> None:
    """Startup hook: switch the process default to the persisted language, if any."""
    lang = load_persisted_language()
    if lang is not None:
        set_language(lang)


def save_language(lang_id: str) -> str:
    """Persist the language and switch the process default; returns the resolved ID."""
    resolved = resolve_language(lang_id)
    config = _load_config()
    config[LANGUAGE_KEY] = resolved
    store.save("config", config)
    set_language(resolved)
    return resolved
