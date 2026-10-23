"""Configuration-driven localization public API."""
from ._runtime import (
    get_language, get_languages, get_translations, initialize,
    resolve_language, set_language, t, validate_translations, language_context,
)

__all__ = [
    "t", "set_language", "get_language", "get_translations", "get_languages",
    "resolve_language", "initialize", "validate_translations", "language_context",
]
