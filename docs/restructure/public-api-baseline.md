# v2610.2 重构前公共符号基线

| 项 | 内容 |
|---|---|
| 基线提交 | `42cd65e77b9f7575096138c29195c78a9d8d2755` |
| 基线 tag | `pre-refactor-store` |
| 方法 | AST 盘点模块顶层公开函数、类、全大写常量；保留对外模块名与 Handler HTTP 方法 |
| 用途 | 每包迁移前后逐项比较名称、签名、默认值及行为；本文提供可读索引，配套 JSON 冻结声明与源码/资源哈希 |

这里的“公开”指模块顶层不以下划线开头的业务函数、类和常量；标准库/第三方导入名不计。下划线私有函数和属性不作为公开符号，但生产/测试跨模块引用仍需在迁移时单独盘点。

| 模块 | 基线公开符号 |
|---|---|
| `novelhelper` | `__version__`, `APP_VERSION`, `__all__` 中的 `ai`, `app`, `context`, `elements`, `history`, `logger`, `project`, `providers`, `prompts`, `server`, `store` |
| `ai` | `AIError`, `api_settings`, `mode_settings`, `tool_settings`, `chat_settings`, `chat`, `ping`, `list_models` |
| `app` | `main` |
| `context` | `render_elements`, `render_item`, `item_brief`, `render_equipment`, `render_character`, `loadout`, `pack_lines`, `render_faction`, `render_other`, `render_memory`, `render_worldmap`, `world_pool`, `find_mode`, `mode_kind`, `section_label`, `selected_world_groups`, `build_user_message`, `assemble_mode`, `assemble` |
| `elements` | `node`, `normalize`, `is_on`, `get`, `parent_list`, `add_child`, `remove`, `move`, `set_on`, `apply_preset`, `from_preset`, `prune`, `to_nested`, `render_md`, `count_leaf`, `stats` |
| `history` | `HISTORY_FILE`, `CONVERSATION_DIR`, `create_session`, `list_sessions`, `current_session_id`, `set_current`, `load_session`, `save_session`, `append_turn`, `delete_session`, `resolve_selection`, `session_for_client` |
| `logger` | `MAX_LOGS`, `start_session`, `session_file`, `log_event`, `log_warning`, `log_exception` |
| `project` | `HEADING_RE`, `in_project`, `rel_str`, `safe_rel`, `read_text`, `write_text`, `split_sections`, `strip_code_fence`, `parse_name_tag`, `records_from_md`, `import_memories`, `parse_worldmap`, `merge_records`, `import_sources`, `import_json`, `validate_import_records`, `import_worldmap_json`, `clean_json`, `export_text`, `save_json`, `save_txt`, `write_output`, `write_plan`, `strip_output_header`, `split_parts`, `extract_body`, `md_to_txt`, `write_txt_from_md`, `list_chapters`, `merge_intra_paragraph_breaks`, `clean_blank_lines`, `text_stats`, `apply_text_op`, `list_io`, `list_text`, `browse`, `write_external` |
| `prompts` | `REASON_SYSTEM_PROMPT`, `WRITE_SYSTEM_PROMPT`, `SUMMARIZE_SYSTEM_PROMPT`, `COMPRESS_SYSTEM_PROMPT`, `IDEA_SYSTEM_PROMPT`, `FIX_SYSTEM_PROMPT`, `RESTYLE_SYSTEM_PROMPT`, `LOGIC_WORK_PROMPT`, `OUTLINE_WORK_PROMPT`, `DRAFT_WORK_PROMPT`, `POLISH_WORK_PROMPT`, `BRAINSTORM_WORK_PROMPT`, `DEFAULT_MODES`, `TOOL_PROMPTS`, `AI_NOTICE`, `with_notice`, `without_notice`, `default_modes`, `default_prompts` |
| `providers` | `EFFORTS`, `PROVIDERS`, `public_providers`, `get_provider`, `normalize_base_url`, `same_base_url`, `provider_for_config`, `provider_note`, `provider_models`, `default_effort`, `default_model`, `default_api_config`, `endpoint` |
| `server` | `MAX_BODY`, `Handler`, `Handler.log_message`, `Handler.do_GET`, `Handler.do_HEAD`, `Handler.do_POST`, `Handler.do_PUT`, `Handler.do_DELETE`, `serve` |
| `store` | `FROZEN`, `STUDIO_DIR`, `APP_ROOT`, `REPO_ROOT`, `WEB_DIR`, `DEBUG_MODE`, `DEFAULT_LOG_DIR`, `RUNTIME_ROOT`, `PROJECT_ROOT`, `DATA_DIR`, `COLLECTIONS`, `RECORD_COLLECTIONS`, `SECTION_PREFIX`, `now_str`, `stamp`, `new_id`, `data_dir`, `ensure_dirs`, `io_in`, `io_out`, `out_dir`, `plan_dir`, `txt_dir`, `text_dir`, `log_dir`, `default_config`, `default_workstation`, `default_state`, `default_schema`, `default_character`, `default_faction`, `default_item`, `default_equipment`, `default_other`, `default_memory`, `default_worldmap`, `default_meta`, `default_sections`, `section_store_name`, `section_key`, `is_section`, `section_names`, `default_memory_categories`, `default_history`, `default_for`, `load`, `save`, `load_all`, `load_all_names`, `schema_for`, `known_collection`, `backup_all` |

**兼容边界另记（不是公开 API）**：`history._title_from_prompt` 被 `server` 调用；`store._migrate_mode_kinds` 被 `app/selftest.py` 调用；`server.ai` 用于现有自检替换模拟 AI 调用。这些调用需要在对应迁移批次明确保留或适配，不得因本清单中以下划线规则直接删除。

**机器可读基线**：[`public-api-baseline.json`](public-api-baseline.json) 以 AST 记录 12 个模块的公共函数参数、默认参数表达式、返回注解、类继承/方法/属性及公共常量表达式；包含原有 `__all__`、27 个 API 路径/匹配字面量、8 个前端文件的 SHA-256 和各 Python 源文件 SHA-256。JSON 的文件路径相对 `app/novelhelper/`；哈希针对本次工作区文件的原始字节，跨平台换行不同应结合 tag 与 AST 比较。没有导入应用或读取真实用户数据。路径字面量清单不是完整 HTTP 方法契约，迁移时仍需对照路由分支。

**签名与默认值冻结方式**：JSON 中签名来自源码 AST，不冒充 runtime introspection。完整默认数据构造逻辑、私有助手和错误文案由源码哈希与 `pre-refactor-store` 固定。每包 P1/P2/P3 实施时，对照 JSON 和 tag 核对签名/默认值；运行期类型与继承接口需要时再用 `inspect.signature` 复核。基线不会随迁移自动重生成，否则会掩盖意外变更。
