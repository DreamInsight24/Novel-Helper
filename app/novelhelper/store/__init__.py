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

"""Public storage API, retained at ``novelhelper.store``."""
from __future__ import annotations

from ._paths import (
    APP_ROOT, COLLECTIONS, DATA_DIR, DEBUG_MODE, DEFAULT_LOG_DIR, FROZEN,
    PROJECT_ROOT, RECORD_COLLECTIONS, REPO_ROOT, RUNTIME_ROOT, SECTION_PREFIX,
    NOVELS_DIR, WORKSPACE_ROOT, NOVEL_WORKSPACES_DIR, active_novel_id,
    novel_data_dir, novel_workspace_dir, validate_novel_id,
    STUDIO_DIR, WEB_DIR, data_dir,
)
from ._names import (
    is_section,
    new_id,
    now_str,
    section_key,
    section_store_name,
    stamp,
)
from ._defaults import (
    default_character, default_config, default_equipment, default_faction,
    default_for, default_history, default_item, default_memory,
    default_memory_categories, default_meta, default_other, default_schema,
    default_sections, default_state, default_worldmap, default_workstation,
)
from ._repository import load, save
from ._layout import LAYOUT_VERSION, migrate_active_layout
from ._localized import localized_default_for, seed_localized_defaults
from ._directories import (
    io_in,
    io_out,
    log_dir,
    out_dir,
    plan_dir,
    text_dir,
    txt_dir,
)
from ._bootstrap import _migrate_mode_kinds, ensure_dirs
from ._collections import (
    known_collection,
    load_all,
    load_all_names,
    schema_for,
    section_names,
)
from ._backup import backup_all
from ._novels import (
    create_novel, current_config, delete_novel, effective_config, list_novels, load_novel_config,
    novel_config_template, open_novel, read_novel, save_novel_config,
    set_active_novel, update_novel,
)

__all__ = [
    'FROZEN', 'STUDIO_DIR', 'APP_ROOT', 'REPO_ROOT', 'WEB_DIR', 'DEBUG_MODE',
    'DEFAULT_LOG_DIR', 'RUNTIME_ROOT', 'PROJECT_ROOT', 'DATA_DIR', 'COLLECTIONS',
    'NOVELS_DIR', 'WORKSPACE_ROOT', 'NOVEL_WORKSPACES_DIR', 'active_novel_id',
    'novel_data_dir', 'novel_workspace_dir', 'validate_novel_id',
    'RECORD_COLLECTIONS', 'SECTION_PREFIX', 'now_str', 'stamp', 'new_id', 'data_dir',
    'ensure_dirs', 'io_in', 'io_out', 'out_dir', 'plan_dir', 'txt_dir', 'text_dir',
    'log_dir', 'default_config', 'default_workstation', 'default_state', 'default_schema',
    'default_character', 'default_faction', 'default_item', 'default_equipment',
    'default_other', 'default_memory', 'default_worldmap', 'default_meta', 'default_sections',
    'section_store_name', 'section_key', 'is_section', 'section_names',
    'default_memory_categories', 'default_history', 'default_for', 'load', 'save',
    'LAYOUT_VERSION', 'migrate_active_layout',
    'localized_default_for', 'seed_localized_defaults',
    'load_all', 'load_all_names', 'schema_for', 'known_collection', 'backup_all',
    'create_novel', 'current_config', 'delete_novel', 'effective_config', 'list_novels', 'load_novel_config',
    'novel_config_template', 'open_novel', 'read_novel', 'save_novel_config',
    'set_active_novel', 'update_novel',
]
