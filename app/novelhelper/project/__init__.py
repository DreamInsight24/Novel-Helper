"""Compatibility-facing API for project files, imports, exports, and text."""

from ._browse import browse, import_sources, list_io, list_text, write_external
from ._exports import clean_json, export_text, save_json, save_txt
from ._imports import (
    import_json,
    import_worldmap_json,
    merge_records,
    records_from_md,
    validate_import_records,
)
from ._outputs import list_chapters, write_output, write_plan, write_txt_from_md
from ._parsers import (
    HEADING_RE,
    import_memories,
    parse_name_tag,
    parse_worldmap,
    split_sections,
    strip_code_fence,
)
from ._paths import in_project, read_text, rel_str, safe_rel, write_text
from ._text import (
    apply_text_op,
    clean_blank_lines,
    extract_body,
    md_to_txt,
    merge_intra_paragraph_breaks,
    split_parts,
    strip_output_header,
    text_stats,
)

__all__ = [
    "HEADING_RE",
    "in_project",
    "rel_str",
    "safe_rel",
    "read_text",
    "write_text",
    "split_sections",
    "strip_code_fence",
    "parse_name_tag",
    "records_from_md",
    "import_memories",
    "parse_worldmap",
    "merge_records",
    "import_sources",
    "import_json",
    "validate_import_records",
    "import_worldmap_json",
    "clean_json",
    "export_text",
    "save_json",
    "save_txt",
    "write_output",
    "write_plan",
    "strip_output_header",
    "split_parts",
    "extract_body",
    "md_to_txt",
    "write_txt_from_md",
    "list_chapters",
    "merge_intra_paragraph_breaks",
    "clean_blank_lines",
    "text_stats",
    "apply_text_op",
    "list_io",
    "list_text",
    "browse",
    "write_external",
]
