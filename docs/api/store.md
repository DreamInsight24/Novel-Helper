# `novelhelper.store` API

`novelhelper.store` is the compatibility-facing API for local JSON collections, their defaults, storage paths, and workspace directories. Implementation is split into private modules; callers should continue importing the package API rather than those modules.

```python
from novelhelper import store

config = store.default_config()
print(config["server"]["port"])
```

## Public Constants

| Name | Meaning |
|---|---|
| `FROZEN` | Whether the process is running as a frozen executable. |
| `STUDIO_DIR` | `novelhelper` package directory; also anchors bundled web assets. |
| `APP_ROOT` | Source `app/` directory, or executable directory when frozen. |
| `REPO_ROOT` | Parent of `APP_ROOT`. |
| `WEB_DIR` | Static web asset directory. |
| `DEBUG_MODE` | True when `NOVELHELPER_DEBUG=1`. |
| `DEFAULT_LOG_DIR` | Default relative log path for the current run mode. |
| `RUNTIME_ROOT` | `NOVELHELPER_HOME`, or the mode-specific runtime root. |
| `PROJECT_ROOT` | Alias of `RUNTIME_ROOT`, retained for callers. |
| `DATA_DIR` | `NOVELHELPER_DATA`, or `RUNTIME_ROOT/data`. `config.paths.data_dir` does not override it. |
| `COLLECTIONS` | Built-in JSON collection names. |
| `RECORD_COLLECTIONS` | Collections whose values use an `items` list. |
| `SECTION_PREFIX` | Prefix used for custom section collection files (`section_`). |

These path constants are resolved when the package is imported. Set run-mode environment variables before importing `novelhelper`.

## Functions

| Signature | Behavior and result |
|---|---|
| `now_str() -> str` | Current local time as `YYYY-MM-DD HH:MM:SS`. |
| `stamp() -> str` | Current local time as `YYYYMMDD_HHMMSS`, used in generated names. |
| `new_id(prefix: str) -> str` | Returns `<prefix>_<8 hex characters>`. |
| `data_dir() -> Path` | Returns the configured `DATA_DIR`. |
| `ensure_dirs() -> None` | Runs existing config/mode migrations, creates data/workspace/log directories, then writes missing built-in collection defaults. |
| `io_in() -> Path` | Configured import directory, resolved under `PROJECT_ROOT` unless absolute. |
| `io_out() -> Path` | Configured export directory, resolved under `PROJECT_ROOT` unless absolute. |
| `out_dir() -> Path` | Configured writing-output directory. |
| `plan_dir() -> Path` | Configured plan-output directory. |
| `txt_dir() -> Path` | Configured text-output directory. |
| `text_dir() -> Path` | Configured manuscript-processing directory. |
| `log_dir() -> Path` | Configured log directory; debug/frozen runs normalize the legacy `../log` value to `log`. |
| `default_config() -> dict` | Fresh config defaults, including version 4, run-mode port, writing defaults, provider defaults, and workspace path settings. |
| `default_workstation() -> dict` | Fresh AI workstation state and selection defaults. |
| `default_state() -> dict` | Fresh app state, including workstation and legacy-compatible state fields. |
| `default_schema() -> dict` | Fresh built-in record and custom-section element templates. |
| `default_character() -> dict` | New character record with generated ID and timestamps. |
| `default_faction() -> dict` | New faction record with generated ID and timestamps. |
| `default_item() -> dict` | New item record with generated ID and timestamps. |
| `default_equipment() -> dict` | New equipment record with generated ID and timestamps. |
| `default_other() -> dict` | New miscellaneous record with generated ID and timestamps. |
| `default_memory() -> dict` | New memory record with generated ID and timestamps. |
| `default_worldmap() -> dict` | Fresh world-map structure. |
| `default_meta() -> dict` | Fresh metadata structure. |
| `default_sections() -> dict` | Fresh built-in custom-section list. |
| `section_store_name(key: str) -> str` | Builds a custom-section collection name using `SECTION_PREFIX`. |
| `section_key(name: str) -> str` | Returns the suffix of a prefixed section name, otherwise an empty string. |
| `is_section(name: str) -> bool` | Checks whether a name is a valid ASCII custom-section collection name. |
| `section_names() -> list` | Reads enabled custom-section names from the `sections` collection. |
| `default_memory_categories() -> list` | Returns fresh built-in memory category labels. |
| `default_history() -> dict` | Returns an empty history index and current-session pointer. |
| `default_for(name: str) -> Any` | Returns a fresh default for a built-in collection or valid custom section. Raises `KeyError` for an unknown name. |
| `load(name: str) -> Any` | Loads a collection. Missing or whitespace-only files return a deep-copied default. Unknown names raise `KeyError`; invalid UTF-8 or JSON raises `RuntimeError`. |
| `save(name: str, data: Any) -> Path` | Saves JSON atomically and returns its path. Record collections/custom sections are cleaned using the existing element rules. Unknown names and filesystem/serialization errors are not swallowed. |
| `load_all() -> dict` | Loads all built-in collections and currently enabled custom sections into a name-to-data mapping. |
| `load_all_names() -> list` | Returns built-in collection names plus enabled custom sections. |
| `schema_for(name: str) -> list` | Returns the element schema for a collection, or an empty list when absent. |
| `known_collection(name: str) -> bool` | Checks built-in and custom-section collection names. |
| `backup_all() -> Path` | Copies existing collection JSON files into a timestamped directory under `io_out()` and returns that directory. |

In debug mode, resolving a configured relative workspace path outside `RUNTIME_ROOT` raises `PermissionError`. Directory creation, migrations, reads, writes, and backups may raise filesystem errors. The package preserves the existing on-disk JSON layout and migration order.

## Compatibility

The public names above are listed in `store.__all__`. Existing imports such as `from novelhelper import store` and `from novelhelper.store import load` remain supported. `store._migrate_mode_kinds` is retained only because `app/selftest.py` uses it; it is private and excluded from `__all__`.
