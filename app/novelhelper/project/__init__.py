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
from ._outputs import list_chapters, write_chapter, write_output, write_plan, write_txt_from_md
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
    "write_chapter",
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
