# `novelhelper.project` API

`novelhelper.project` is the compatibility-facing API for workspace paths, imports, exports, manuscript outputs, text operations, and file browsing. Its implementation is split across private modules; callers should import this package API rather than implementation modules.

```python
from novelhelper import project

sections = project.split_sections("# Story\n\n## Chapter 1\nText")
output = project.write_output("A new scene")
```

## Public Constant

| Name | Meaning |
|---|---|
| `HEADING_RE` | Compiled expression matching Markdown headings from level 1 through 6. |

## Paths and Text Files

| Signature | Behavior and result |
|---|---|
| `in_project(path: Path) -> bool` | Resolves `path` and checks whether it is under `store.PROJECT_ROOT`. |
| `rel_str(path: Path) -> str` | Returns a project-relative POSIX path when possible; otherwise returns `str(path)`. |
| `safe_rel(rel: str) -> Path` | Resolves a project-relative path. Raises `PermissionError` if the resolved target escapes the project root. |
| `read_text(path: str \| Path, encoding: str = "utf-8") -> str` | Reads an absolute path or a path resolved by `safe_rel`; missing files raise `FileNotFoundError`, and undecodable bytes are replaced. |
| `write_text(path: str \| Path, content: str, encoding: str = "utf-8") -> Path` | Creates parent directories, writes the content, and returns the target path. Relative paths use `safe_rel`. |

## Parsing and Import

| Signature | Behavior and result |
|---|---|
| `split_sections(text: str) -> list` | Splits Markdown by headings and returns section dictionaries with level, title, parent title, and content. |
| `strip_code_fence(text: str) -> str` | Removes one surrounding Markdown code fence when present. |
| `parse_name_tag(title: str) -> tuple` | Splits a trailing parenthesized tag from a title; returns `(name, tag)`. |
| `records_from_md(text: str, source: str, category: str = "导入") -> list` | Converts leaf Markdown sections into `other` records; if no sections qualify, the non-empty document becomes one record. |
| `import_memories(text: str, source: str = "") -> list` | Converts the existing `# / ## / ###` memory format into memory records. |
| `parse_worldmap(text: str, name: str = "") -> dict \| None` | Parses the existing Markdown world-map table; returns `None` when the input is not a recognized table. |
| `merge_records(existing: list, incoming: list, key: str = "name", key_fields: list \| None = None) -> tuple` | Merges records into `existing` in place and returns `(records, added_count, updated_count)`. Matching records retain the existing update rules. |
| `import_sources() -> list` | Lists supported `.md`, `.txt`, and `.json` files under the configured import directory. |
| `import_json(text: str, target: str) -> list` | Converts supported JSON import shapes to records. Invalid JSON raises `json.JSONDecodeError`. |
| `validate_import_records(records: list, target: str) -> list` | Validates and fills import records; invalid or empty input raises `ValueError`. |
| `import_worldmap_json(text: str, name: str = "") -> dict` | Parses and normalizes world-map JSON. Invalid JSON raises `json.JSONDecodeError`; invalid map structure raises `ValueError`. |

## Export and Manuscript Outputs

| Signature | Behavior and result |
|---|---|
| `clean_json(coll: str, db: dict) -> dict` | Produces the existing clean JSON export representation without writing a file. |
| `export_text(coll: str, db: dict) -> str` | Renders a collection using the existing context renderers. Unknown collections return an empty string. |
| `save_json(coll: str, db: dict, filename: str = "") -> Path` | Writes clean JSON under the configured export directory and returns the path. |
| `save_txt(coll: str, db: dict, filename: str = "") -> Path` | Writes rendered text under the configured export directory and returns the path. |
| `write_output(content: str, mode_label: str = "AI 工作站生成", name: str = "") -> Path` | Writes a timestamped Markdown manuscript output, unless `name` is supplied. |
| `write_plan(content: str, chapter: str = "") -> Path` | Writes a timestamped plain-text writing plan. |
| `write_txt_from_md(rel_md: str, blank_mode: str = "compact", keep_advice: bool = False) -> Path` | Converts a Markdown output to text and returns the generated path. Relative source paths are constrained by `safe_rel`. |
| `list_chapters() -> list` | Lists recognized manuscript/output files, newest first. |

## Text Operations and Browsing

| Signature | Behavior and result |
|---|---|
| `strip_output_header(raw: str) -> str` | Removes a recognized generated-output header. |
| `split_parts(raw: str) -> dict` | Splits generated content into `think`, `body`, and `advice` fields. |
| `extract_body(raw: str) -> str` | Returns the body field from `split_parts`. |
| `md_to_txt(raw: str, keep_advice: bool = False, blank_mode: str = "compact") -> str` | Converts generated Markdown to text, optionally retaining advice and selecting blank-line handling. |
| `merge_intra_paragraph_breaks(text: str) -> str` | Joins line breaks inside paragraphs while retaining paragraph breaks. |
| `clean_blank_lines(text: str, mode: str = "compact") -> str` | Normalizes blank lines using the existing `compact` or normal behavior. |
| `text_stats(text: str) -> dict` | Returns character, CJK, line, and paragraph counts. |
| `apply_text_op(text: str, op: str, arg: str = "") -> str` | Applies one of the existing trim, blank-line, indentation, merge, or replacement operations; unknown operations leave text unchanged. |
| `list_io(dir_rel: str = "") -> dict` | Lists files in the configured import directory when `dir_rel` starts with `import`, otherwise in the export directory. Creates the selected directory if absent. |
| `list_text() -> dict` | Lists files in the configured manuscript-processing directory, creating it if absent. |
| `browse(path: str = "") -> dict` | Lists drives and the user-directory shortcut for an empty path, or browses a supplied directory. A missing/non-directory path raises `FileNotFoundError`. |
| `write_external(path: str, content: str, encoding: str = "utf-8") -> Path` | Writes text to a user-selected external path. A directory target raises `IsADirectoryError`; a missing parent raises `FileNotFoundError`. |

Filesystem and serialization errors from write operations are not swallowed. The public names above are listed in `project.__all__`; existing imports such as `from novelhelper import project` and `from novelhelper.project import read_text` remain supported.
