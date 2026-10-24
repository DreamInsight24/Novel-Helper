"""Runtime anchors, paths, and storage collection names."""
from __future__ import annotations

import os
import sys
from pathlib import Path

from ..localization import t

FROZEN = bool(getattr(sys, "frozen", False))

STUDIO_DIR = Path(__file__).resolve().parent.parent

APP_ROOT = (
    Path(sys.executable).resolve().parent
    if FROZEN else STUDIO_DIR.parent
)

REPO_ROOT = APP_ROOT.parent

WEB_DIR = STUDIO_DIR / "web"

DEBUG_MODE = os.environ.get("NOVELHELPER_DEBUG") == "1"

DEFAULT_LOG_DIR = "log" if (DEBUG_MODE or FROZEN) else "../log"

_DEFAULT_RUNTIME = (APP_ROOT / "debug") if DEBUG_MODE else APP_ROOT

RUNTIME_ROOT = Path(os.environ.get("NOVELHELPER_HOME") or _DEFAULT_RUNTIME)

PROJECT_ROOT = RUNTIME_ROOT

DATA_DIR = Path(os.environ.get("NOVELHELPER_DATA") or (RUNTIME_ROOT / "data"))

COLLECTIONS = (
    "config",
    "modes",
    "schema",
    "state",
    "sections",
    "characters",
    "factions",
    "items",
    "equipment",
    "other",
    "memories",
    "worldmap",
    "meta",
    "history",
)

RECORD_COLLECTIONS = ("characters", "factions", "items", "equipment", "other", "memories")

SECTION_PREFIX = "section_"


def data_dir() -> Path:
    return DATA_DIR

def _root(rel: str | Path) -> Path:
    path = Path(rel)
    target = path if path.is_absolute() else (PROJECT_ROOT / path)
    if DEBUG_MODE:
        try:
            target.resolve().relative_to(RUNTIME_ROOT.resolve())
        except ValueError as exc:
            raise PermissionError(t("errors.debug_path", root=RUNTIME_ROOT, path=rel)) from exc
    return target

