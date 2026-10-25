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

"""Config language persistence: first-run detection, initial presets and K2 recovery.

The localization runtime itself has no storage dependency; this module is the
glue that reads and writes the ``language`` field of the user config
(`store.load("config")` / `store.save("config", config)`). A config without the
field counts as first run; a missing or damaged config is backed up (K2), logged,
and treated the same way. While the first-run wizard is still open the saved
language is provisional: the latest choice updates ``initial_language`` and
re-seeds the language-sensitive built-in presets, so a preview of English followed
by 简体中文 ends up with Chinese presets. Once ``onboarding.done`` is true the
initial preset files are never rewritten again.
"""
from __future__ import annotations

import logging
import time

from .. import store
from ..localization import resolve_language, set_language

_LOG = logging.getLogger(__name__)

LANGUAGE_KEY = "language"
INITIAL_LANGUAGE_KEY = "initial_language"


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
    """Persist the language and switch the process default; returns the resolved ID.

    The language chosen at first run is also recorded as ``initial_language`` and
    used to seed the language-sensitive built-in presets once. Later switches leave
    those files untouched, so the initial presets stay in the initial language.
    """
    resolved = resolve_language(lang_id)
    config = _load_config()
    is_first = LANGUAGE_KEY not in config
    # Before the wizard is completed the choice is still provisional. Keep following
    # the latest selection (English -> 简体中文 must not freeze English presets).
    provisional = is_first or not bool((config.get("onboarding") or {}).get("done"))
    config[LANGUAGE_KEY] = resolved
    if provisional or INITIAL_LANGUAGE_KEY not in config:
        config[INITIAL_LANGUAGE_KEY] = resolved
    store.save("config", config)
    set_language(resolved)
    if provisional:
        try:
            store.seed_localized_defaults(resolved)
        except Exception as exc:  # noqa: BLE001 - presets must not block the switch
            _LOG.warning("Failed to seed localized presets in %s: %s", resolved, exc)
    return resolved
