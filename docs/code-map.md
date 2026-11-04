# 代码映射表（面向 AI Agent）

> 用途：在对话中快速定位「某功能属于哪个文件、哪个函数」，减少盲目全局搜索。
> 用法：先查第 2 节「功能 → 代码位置总表」定位文件，再查第 3–5 节的函数索引定位实现；修改前必须用 `read`/`grep` 确认当前代码，本表只是索引，不替代源码。
> 维护：结构或函数位置变化时同步更新；路径、函数名失效即视为文档缺陷。

## 1. 架构与请求链路

- 形态：本地优先桌面应用。Python 后端（`http.server`）+ pywebview 窗口承载 `web/` 静态前端；前端无框架、无构建步骤。
- 启动链：`app/run.py` → `novelhelper.app.main()` → `novelhelper.server.serve()`（初始化目录、语言、绑定端口）→ `novelhelper.desktop.open_window()`（开屏 → 加载 `http://127.0.0.1:<port>/`）。
- 请求链：浏览器 `api()`（`web/core.js`）→ `server/_base.py` 分派 → `Handler`（`_api` / `_records` / `_generation` mixin）→ `store` / `project` / `ai` / `context` → JSON 文件或外部 AI 接口。
- 数据链：集合 JSON 存于 `data/novels/<novel_id>/`（`config` 为全局）；工作区文件存于 `workspace/novels/<novel_id>/`。
- 前端无路由库：`state.view` + `renderMain()` 的 map 决定页面，`go(view)` 切换。

## 2. 功能 → 代码位置总表

| 功能 | 前端入口 | 后端/逻辑 | 数据/资源 |
|---|---|---|---|
| 首页与作品库 | `web/core.js`: `viewHome`、`showCreateNovel`、`editNovel`、`confirmDeleteNovel`、`switchNovel`、`loadNovelList` | `server/_api.py`: `/api/novels*`；`store/_novels.py`: `create_novel`、`list_novels`、`open_novel`、`delete_novel` | `data/config.json`（`active_novel_id`）、`data/novels/<id>/novel.json` |
| 设定列表与编辑器 | `web/records.js`: `viewRecords`、`recordEditor`、`newRecord`、`elementTree`、`applyPreset` | `server/_api.py`: `/api/collections/<name>`；`store/_repository.py`: `load`/`save`/`_clean_records`；`elements.py` | `data/novels/<id>/<coll>.json`（characters/factions/items/other/section_*） |
| 元素模板 | `web/config.js`: `viewElements`；`web/records.js`: `applyPreset` | `elements.py`: `from_preset`、`apply_preset`、`normalize`；`store/_defaults.py`: `default_schema` | `data/novels/<id>/schema.json` |
| 栏目（分区）管理 | `web/config.js`: `viewSections`、`settingMetadataEditor`、`reorderSettingIds` | `store/_defaults.py`: `default_sections`；`store/_layout.py`: `migrate_active_layout`、`_restore_sections` | `data/novels/<id>/sections.json` |
| 分类与标签 | `web/records.js`: `manageRecordCategories`、`renameRecordCategory`、`recordTags`、`recordCategoryNames` | `store/_repository.py`: `_clean_records`（写入时清理） | 集合 JSON 内 `categories` / `tags` 字段 |
| 关系网与关联 | `web/relations.js`: `relationCatalog`、`relationEdges`、`relationVisibleGraph`、`relationLayout`、`relationGraph`、`relationEditor`、`viewRelations` | `relations.py`: `catalog`、`memberships`、`normalize`、`sync_memberships`；`store/_repository.py`: `save('relations')` | `data/novels/<id>/relations.json` |
| 创建/编辑关联 | `web/relations.js`: `relationDialog`、`relationSave`、`openRelationRecord` | `store/_repository.py`: `save('relations')`（坏边丢弃、快照与事务回滚）；`relations.normalize` | 同上 |
| AI 上下文拼装 | — | `context.py`: `build_user_message`、`assemble_mode`、`render_record_selection`、`render_character/faction/item/other/memory/worldmap`、`render_record_relations` | 内存组装，不落盘 |
| AI 工作站（写稿） | `web/workstation.js`: `viewWorkstation`、`runWorkstation`、`streamWorkstation`、`agentStreaming`、`openModePicker`、`wsModelMenu`、`stopWorkstation`、`openManuscriptChapter` | `server/_generation.py`: `_run_workstation`、`_workstation_stream`（ndjson：start/delta/done/error）；`ai.py`: `chat_stream`、`chat_settings`；`history.py`: `append_turn`、`context_messages` | `data/novels/<id>/history.json`、`conversations/<id>.json` |
| AI 设定生成 | `web/records.js`: `aiSettingGenDialog`、`showAiSettingGenResult`、`aiSettingGenButton` | `setting_gen.py`: `extract_records`、`validate_batch`、`write_batch`、`undo_last_batch`、`map_fields`；`server/_generation.py`: `_ai_setting_gen`、`_ai_setting_gen_undo` | 目标集合 JSON |
| 模式管理 | `web/config.js`: `viewModes`、`addModeDialog`、`modeModelOptions`、`modeKindLabel` | `prompts.py`: `DEFAULT_MODES`、`default_modes`；`ai.py`: `mode_settings` | `data/novels/<id>/modes.json` |
| 模型与提供商 | `web/config.js`: `currentModels`、`providerById`、`apiCfg`、`defaultModelName`、`effortChoices` | `providers.py`: `PROVIDERS`、`provider_models`、`default_model`、`endpoint`；`ai.py`: `list_models`、`ping` | `data/config.json` 的 `api` 段 |
| 稿件处理 | `web/manuscript.js`: `viewManuscript`、`chapterBar`、`loadChapter`、`exportAs`、`browseOpen` | `project/_outputs.py`: `write_output`、`write_plan`、`write_txt_from_md`；`project/_text.py`: `apply_text_op`、`md_to_txt` | `workspace/novels/<id>/output`、`text` |
| 章节 | `web/manuscript.js`: `chapterBar`（可收起章节栏）、`previewFile` | `project/_outputs.py`: `write_chapter`、`write_auto_chapter`、`next_chapter_number`、`list_chapters`；`server/_api.py`: `/api/chapters`、`/api/output` | `workspace/novels/<id>/output`；来源对话记在 `state.json` 的 `workstation.chapters` |
| 记忆 | `web/views.js`: `viewMemories`、`compressMemories` | `project/_parsers.py`: `import_memories`；`tool_prompts.py`: `prompt('compress')`；`server/_generation.py`: `_ai_run` | `data/novels/<id>/memories.json` |
| 世界地图 | `web/views.js`: `viewWorld`、`newBoard`、`boardCells` | `context.py`: `render_worldmap`；`project/_parsers.py`: `parse_worldmap` | `data/novels/<id>/worldmap.json` |
| 人物背包/装备 | `web/views.js`: `viewInventory` | `context.py`: `render_equipment`、`loadout` | `characters.json`、`items.json` |
| 导入 | `web/records.js`: `importPanel`；`web/core.js`: `refreshWorkspaceFiles`；`web/config.js`: `showSettingImport` | `server/_records.py`: `_import`；`project/_imports.py`: `records_from_md`、`import_json`、`merge_records`、`validate_import_records`、`import_worldmap_json`；`project/_parsers.py` | `workspace/novels/<id>/import` |
| 导出 | `web/records.js`: `exportButtons`；`web/manuscript.js`: `exportAs` | `server/_api.py`: `/api/export`；`project/_exports.py`: `clean_json`、`export_text`、`save_json`、`save_txt` | `workspace/novels/<id>/export` |
| 设置（全局/小说） | `web/config.js`: `viewAI`、`refreshConfigMeta`、`restoreNovelConfig`、`novelHasOverrides` | `server/_api.py`: `/api/settings/config`、`/api/settings/language`；`store/_novels.py`: `effective_config`、`save_novel_config` | `data/config.json`、`data/novels/<id>/config.json` |
| 语言与翻译 | `web/i18n/i18n.js`、`web/i18n/bootstrap.js`；`web/config.js`: `showOnboarding` | `localization/_runtime.py`: `initialize`、`t`、`get_translations`、`language_context`；`server/_language.py` | `app/resources/localization/zh-CN.yml`、`en-US.yml` |
| 历史会话 | `web/workstation.js`: `refreshWorkstationHistory`、`switchWorkstationSession`、`newConversation`、`loadCurrentSession` | `history.py`: `create_session`、`list_sessions`、`load_session`、`save_session`、`delete_session`；`server/_api.py`: `/api/history*` | `history.json`、`conversations/<id>.json` |
| 备份 | `web/config.js`: 设置页「备份全部」按钮 | `server/_api.py`: `/api/backup`；`store/_backup.py`: `backup_all` | `workspace/novels/<id>/export/backup_<时间戳>/` |
| 日志 | `web/core.js`: `clientLog`（浏览器异常上报） | `logger.py`: `start_session`、`log_event`、`log_exception` | `log/`（配置 `paths.log_dir`） |
| 角色卡 | `web/cards.js`: `viewCharacterCards`、`openCardEditor`、`cardImage`；`web/core.js`: `HOME_NAV`、`renderMain` | `cards.py`: ensure/list_cards/save_card/delete_card/save_image/image_file；`server/_api.py`: `/api/cards*` | `data/cards.json`、`data/card_images/` |
| 移动端（v2611.1 仅方案，不实现） | 方案：安卓/鸿蒙移植路径、模块映射、工作量 | 方案：Kotlin/ArkTS/跨端框架对比 | 计划：应用私有目录 |

## 3. 后端函数索引

### 3.1 启动、窗口与端口

| 文件 | 关键符号 |
|---|---|
| `app/run.py` | CLI 入口；`--debug` 设置 `NOVELHELPER_DEBUG/HOME/DATA`；`--clean-debug` |
| `app/novelhelper/app.py` | `main()`、`_check_install()`、`_run_service()`、`_stop_server()` |
| `app/novelhelper/desktop.py` | `ServerRuntime`、`open_window()`、`window_bounds()`、`splash_html()`、`load_webview()`、`show_error_dialog()` |
| `app/novelhelper/ports.py` | `normalize_server_config()`、`resolve_listen_port()`、`PortConfigError` |
| `app/novelhelper/server/_handler.py` | `Handler`（mixin 组合）、`serve()`、`_Server` |

### 3.2 HTTP 层（`app/novelhelper/server/`）

| 文件 | 关键符号 |
|---|---|
| `_base.py` | `_BaseHandler.do_GET/do_POST/do_PUT/do_DELETE`、`_dispatch`、`_dispatch_localized`、`_static`、`_json`、`_error`、`_body` |
| `_api.py` | `_ApiMixin._api()`（全部 `/api/*` 路由）、`_preserve_language_fields()` |
| `_records.py` | `_RecordMixin._import()`、`_auto_sort()`、`_move()` |
| `_generation.py` | `_GenerationMixin._ai_run()`、`_workstation_run()`、`_ai_setting_gen()`、`_ai_setting_gen_undo()` |
| `_state.py` | `MAX_BODY`、`_RUN_LOCK`、`_RUN_STATE`（生成锁与状态） |
| `_helpers.py` | `_api_ready()`、`_surface_error()`、`_compact_selection()` |
| `_language.py` | `first_run()`、`load_persisted_language()`、`save_language()` |
| `__init__.py` | `serve`、`Handler`、`MAX_BODY` |

### 3.3 存储（`app/novelhelper/store/`）

| 文件 | 关键符号 |
|---|---|
| `_paths.py` | `DATA_DIR`、`NOVELS_DIR`、`NOVEL_WORKSPACES_DIR`、`COLLECTIONS`、`RECORD_COLLECTIONS`、`active_novel_id()`、`novel_data_dir()`、`novel_workspace_dir()` |
| `_repository.py` | `load()`、`save()`、`_path()`、`_clean_records()`、`relation_snapshot()` |
| `_defaults.py` | `default_config()`、`default_schema()`、`default_sections()`、`default_character/faction/item/other/memory/worldmap()`、`default_for()` |
| `_novels.py` | `create_novel()`、`list_novels()`、`read_novel()`、`open_novel()`、`update_novel()`、`delete_novel()`、`effective_config()`、`current_config()`、`save_novel_config()` |
| `_directories.py` | `io_in()`、`io_out()`、`out_dir()`、`plan_dir()`、`txt_dir()`、`text_dir()`、`log_dir()` |
| `_layout.py` | `migrate_active_layout()`、`_restore_sections()`（v2 迁移，勿改行为） |
| `_localized.py` | `localized_default_for()`、`seed_localized_defaults()` |
| `_bootstrap.py` | `ensure_dirs()`、配置迁移 |
| `_collections.py` | `load_all()`、`load_all_names()`、`schema_for()`、`known_collection()` |
| `_backup.py` | `backup_all()` |
| `_names.py` | `new_id()`、`section_key()`、`is_section()`、`stamp()` |

### 3.4 项目文件（`app/novelhelper/project/`）

| 文件 | 关键符号 |
|---|---|
| `_paths.py` | `safe_rel()`、`in_project()`、`read_text()`、`write_text()`、`rel_str()` |
| `_imports.py` | `records_from_md()`、`import_json()`、`merge_records()`、`validate_import_records()`、`import_worldmap_json()` |
| `_parsers.py` | `split_sections()`、`import_memories()`、`parse_worldmap()`、`parse_name_tag()`、`strip_code_fence()` |
| `_exports.py` | `clean_json()`、`export_text()`、`save_json()`、`save_txt()` |
| `_outputs.py` | `write_output()`、`write_chapter()`、`write_auto_chapter()`、`next_chapter_number()`、`write_plan()`、`write_txt_from_md()`、`list_chapters()` |
| `_text.py` | `md_to_txt()`、`apply_text_op()`、`text_stats()`、`clean_blank_lines()`、`split_parts()` |
| `_browse.py` | `import_sources()`、`list_io()`、`list_text()`、`browse()`、`write_external()` |

### 3.5 根级模块（`app/novelhelper/`）

| 文件 | 关键符号 |
|---|---|
| `ai.py` | `api_settings()`、`mode_settings()`、`chat_settings()`、`ping()`、`list_models()` |
| `context.py` | `build_user_message()`、`assemble_mode()`、`render_record_selection()`、`render_record_relations()`、`render_character/faction/item/other/memory/worldmap()`、`loadout()` |
| `elements.py` | `node()`、`normalize()`、`get()`、`add_child()`、`remove()`、`move()`、`apply_preset()`、`from_preset()`、`render_md()`、`stats()` |
| `relations.py` | `catalog()`、`memberships()`、`normalize()`、`sync_memberships()`、`RECORDS` |
| `setting_gen.py` | `extract_records()`、`validate_batch()`、`write_batch()`、`undo_last_batch()`、`map_fields()`、`target_catalog()` |
| `history.py` | `create_session()`、`list_sessions()`、`load_session()`、`save_session()`、`append_turn()`、`context_messages()`、`resolve_selection()`、`title_from_prompt()` |
| `prompts.py` | `DEFAULT_MODES`、`default_modes()`、`with_notice()`、`without_notice()` |
| `providers.py` | `PROVIDERS`、`public_providers()`、`provider_models()`、`default_model()`、`default_effort()`、`endpoint()` |
| `tool_prompts.py` | `prompt()`、`settings()`、`TOOL_PROMPTS` |
| `logger.py` | `start_session()`、`log_event()`、`log_exception()` |
| `localization/_runtime.py` | `initialize()`、`t()`、`set_language()`、`get_language()`、`get_translations()`、`get_languages()`、`language_context()`、`validate_translations()` |

## 4. 前端函数索引（`app/novelhelper/web/`）

| 文件 | 关键符号 |
|---|---|
| `core.js` | `api()`、`h()`、`svgIcon()`、`modal()`、`confirmDialog()`、`askDialog()`、`toast()`、`status()`、`state`、`go()`、`renderMain()`、`renderNav()`、`commandEntries()`、`openCommandPalette()`（Ctrl+K）、`settingEntries()`、`defFor()`、`COLLECTIONS`、`touch()`/`saveNow()`（防抖保存）、`refreshFiles()`、`viewHome()`、`showCreateNovel()`、`switchNovel()` |
| `records.js` | `viewRecords()`、`createRecord()`、`recordEditor()`、`newRecord()`、`elementTree()`、`applyPreset()`、`recordStrip()`、`manageRecordCategories()`、`renameRecordCategory()`、`recordTags()`、`importPanel()`、`exportButtons()`、`moveBar()`/`moveDialog()`、`aiSettingGenDialog()`、`showAiSettingGenResult()` |
| `relations.js` | `relationCatalog()`、`relationEdges()`、`relationVisibleGraph()`、`relationLayout()`、`relationGraph()`、`relationEditor()`、`relationDialog()`、`relationSave()`、`openRelationRecord()` |
| `views.js` | `viewInventory()`、`viewWorld()`、`viewMemories()`、`compressMemories()`、`previewFile()` |
| `config.js` | `viewAI()`（设置页）、`viewModes()`、`addModeDialog()`、`viewSections()`、`viewElements()`、`settingMetadataEditor()`、`currentModels()`、`refreshConfigMeta()`、`restoreNovelConfig()`、`showOnboarding()`、`showSettingImport()` |
| `workstation.js` | `viewWorkstation()`、`runWorkstation()`、`streamWorkstation()`、`paintStreaming()`、`openModePicker()`、`wsModelMenu()`、`stopWorkstation()`、`openManuscriptChapter()`、`previewWorkstation()`、`newConversation()`、`loadCurrentSession()`、`pollBusyState()`、`boot()`、`refreshWorkstationHistory()`、`switchWorkstationSession()`、`saveOutputDialog()`、`sendOutputToText()` |
| `manuscript.js` | `viewManuscript()`、`chapterBar()`、`loadChapter()`、`exportAs()`、`browseOpen()`、`processModes()` |
| `i18n/i18n.js` | `i18n.t()`、`i18n.apply()`、`i18n.load()` |
| `i18n/bootstrap.js` | 翻译表加载完成后按顺序加载 `core/records/relations/cards/views/config/workstation/manuscript`，再 `boot()` |
| `index.html` | 外壳：`#sidebar`、`#nav`、`#main`、`#overlay-root`、`#toast-root` |
| `style.css` | 全部样式与响应式断点 |

## 5. API 路由 → 后端处理

| 路由 | 方法 | 处理位置 | 说明 |
|---|---|---|---|
| `/api/i18n`、`/api/i18n/<lang>` | GET | `_api.py` | 语言列表 / 翻译表 |
| `/api/settings/language` | POST | `_api.py` → `_language.save_language` | 持久化语言 |
| `/api/novels` | GET/POST | `_api.py` → `store/_novels` | 作品库列表 / 新建 |
| `/api/novels/current` | GET | `_api.py` | 当前小说 |
| `/api/novels/open`、`/update`、`/delete` | POST | `_api.py` → `store/_novels` | 打开 / 更新 / 删除 |
| `/api/settings/config` | GET/POST | `_api.py` → `store` | 全局或小说级配置 |
| `/api/state` | GET | `_api.py` → `store.load_all()`、`project.import_sources()` | 前端全量状态 |
| `/api/collections/<name>` | GET/POST | `_api.py` → `store.load/save` | 集合读写（relations 走坏边过滤与投影事务） |
| `/api/file` | GET | `_api.py` → `project.read_text` | 读取工作区文件 |
| `/api/import` | POST | `_records.py:_import` | 导入 md/txt/json |
| `/api/export` | POST | `_api.py` → `project.save_json/save_txt` | 导出集合 |
| `/api/io/save`、`/api/io/export`、`/api/io/browse` | POST/GET | `_api.py` → `project.write_text/write_external/browse` | 工作区文件读写浏览 |
| `/api/backup` | POST | `_api.py` → `store.backup_all` | 备份到导出目录 |
| `/api/move`、`/api/sections/auto-sort` | POST | `_records.py` | 条目搬运 / 栏目排序 |
| `/api/chapters`、`/api/output`、`/api/plan`、`/api/txt` | POST | `_api.py` → `project/_outputs` | 章节 / 输出 / 计划 / txt |
| `/api/models` | POST | `_api.py` → `ai.list_models` | 模型列表 |
| `/api/ai/preview` | POST | `_api.py` → `context.assemble_mode` | 上下文预览 |
| `/api/ai/ping` | POST | `_api.py` → `ai.ping` | 接口连通性 |
| `/api/ai/run` | POST | `_generation.py:_ai_run` | 内置工具（摘要/压缩/润色/修复） |
| `/api/ai/setting-gen`、`/undo` | POST | `_generation.py` → `setting_gen` | AI 设定生成 / 撤销 |
| `/api/workstation/run` | POST | `_generation.py:_workstation_run` → `_run_workstation` | AI 工作站生成（等整段返回） |
| `/api/workstation/stream` | POST | `_generation.py:_workstation_stream` | 流式生成：`application/x-ndjson`，帧为 `start` / `delta` / `done`（payload 同 `/run`）/ `error` |
| `/api/workstation/cancel` | POST | `_api.py` → `_state.cancel_run` | 停止生成：标记结果作废并放开生成锁 |
| `/api/workstation/status`、`/modes` | GET | `_api.py` | 生成状态 / 模式列表 |
| `/api/history`、`/api/history/<id>` | GET/DELETE | `_api.py` → `history` | 会话列表 / 读取 / 删除 |
| `/api/history/current`、`/rename`、`/new` | POST | `_api.py` → `history` | 切换 / 重命名 / 新建会话 |
| `/api/client-log` | POST | `_api.py` → `logger.log_event` | 浏览器端日志上报 |

## 6. 数据布局

```
data/
  config.json                      # 全局配置（语言、server、api、paths、active_novel_id）
  novels/<novel_id>/
    novel.json                     # 小说元数据
    config.json                    # 小说级配置覆盖（use_global + values）
    characters.json factions.json items.json other.json memories.json
    worldmap.json relations.json sections.json schema.json modes.json
    state.json history.json meta.json
    conversations/<session_id>.json
workspace/novels/<novel_id>/
  import/  export/  output/  text/
log/                               # 日志（配置 paths.log_dir）
```

- `config` 集合固定写 `data/config.json`，不随小说解析；其余集合按 `active_novel_id` 解析到小说目录。
- 集合名清单见 `store/_paths.py: COLLECTIONS`；新增集合需同步 `COLLECTIONS`、`store/_defaults.py: default_for()`、`_repository.py` 清理逻辑与前端 `COLLECTIONS`/`defFor()`（设定类）。
- 工作区路径必须相对且在小说工作区目录内，绝对路径会被 `_directories._workspace()` 拒绝。

## 7. 测试与验证入口

- 基线：`python -X utf8 -B scripts/smoke_test.py`、`python -X utf8 -B app/selftest.py`、`python -X utf8 -B scripts/check_dependencies.py`
- 前端语法：`node --check app/novelhelper/web/<file>.js`
- 国际化：`node scripts/test_i18n.cjs`、`python scripts/test_localization.py`
- 模块测试：`scripts/test_relations.py`、`test_relations_ui.cjs`、`test_settings_ui.cjs`、`test_record_forms.cjs`、`test_setting_gen.py`、`test_setting_gen_ui.cjs`、`test_workstation_ui.cjs`、`test_workstation_details.cjs`、`test_workstation_stream.py`、`test_manuscript_ui.cjs`、`test_memories_ui.cjs`、`test_layout_migration.py`、`test_language_settings.py`、`test_desktop.py`、`test_run_cancel.py`
- 打包：`scripts/exe_smoke_test.py`；Windows 工作流 `.github/workflows/build-windows.yml`

## 8. 常见改动定位示例

| 想做的事 | 先看这里 |
|---|---|
| 改新建条目流程 | `web/records.js`: `newRecord`/`showRecordCreate`/`viewRecords`；模板字段 `store/_defaults.py: default_schema` + `elements.py: from_preset/apply_preset` |
| 改分类/标签 | `web/records.js`: `manageRecordCategories`/`renameRecordCategory`/`recordTags`；写入清理 `store/_repository.py: _clean_records` |
| 改关联图与创建关联 | `web/relations.js`；后端 `relations.py` + `store/_repository.py: save('relations')` |
| 改 AI 上下文拼装 | `context.py`: `build_user_message`/`render_record_selection`/`render_*` |
| 改导入 | `project/_imports.py` + `project/_parsers.py` + `server/_records.py: _import` + `web/records.js: importPanel` |
| 改导出 | `project/_exports.py` + `server/_api.py: /api/export` |
| 加配置项 | `store/_defaults.py: default_config` + `web/config.js: viewAI` + `server/_api.py: /api/settings/config` |
| 加新设定栏目 | `store/_defaults.py: default_sections` + `store/_layout.py`（仅迁移）+ `web/core.js: SETTING_BASE_KEYS/settingEntries/defFor` |
| 加新集合 | `store/_paths.py: COLLECTIONS` + `store/_defaults.py: default_for` + `store/_repository.py` + `server/_api.py: /api/collections` + `web/core.js: COLLECTIONS` |
| 加界面文案 | `app/resources/localization/zh-CN.yml` + `en-US.yml`（key 一致），HTML 用 `data-i18n`，JS 用 `t()` |
| 改启动/端口/窗口 | `app/run.py`、`app.py`、`desktop.py`、`ports.py`、`server/_handler.py` |

## 9. 给 Agent 的约束

- 包边界：包之间只通过 `__init__.py` 的公共 API 交互；`_` 前缀模块不跨包导入。
- 先读代码再改：本表是索引，函数行为以源码为准；改动前用 `grep` 确认所有调用方。
- 不改对外契约：URL 路由、集合字段语义、导入导出格式、公共函数签名默认不动，除非需求明确要求。
- 数据变更必须可回滚：写集合走 `store.save()`，不要直接改 JSON 文件。
- 前端改动后跑 `node --check`；文案改动跑 i18n 校验。

## v2611.1 设定体验定位

| 功能 | 实现 | 回归 |
|---|---|---|
| 直接新建、完整模板 | `web/records.js`: `viewRecords`, `newRecord`, `applyPreset` | `scripts/test_record_forms.cjs`, `scripts/test_setting_experience_ui.cjs` |
| 分类及标签 | `web/records.js`: `manageRecordCategories`, `renameRecordCategory`, `recordTagEditor`, `manageRecordTags`, `renameRecordTag` | 同上，含分类删除保留条目与标签合并 |
| 新小说默认栏目、独立显示 | `store/_defaults.py`: `default_sections`；`web/core.js`: `settingEntries` | `scripts/test_setting_io.py`, `scripts/test_layout_migration.py`, `scripts/test_settings_ui.cjs` |
| 文件刷新及路径 | `server/_api.py`: `_workspace_file`, `/api/workspace/files`；`web/core.js`: `refreshWorkspaceFiles` | `scripts/test_setting_io.py` |
| 导入事务、原子覆盖与编号导出 | `server/_records.py`: `_import`, `_import_apply`；`project/_paths.py`: `write_text`, `write_numbered`；`project/_exports.py`: `save_json`, `save_txt` | `scripts/test_setting_io.py` |
| 请求模型与限定/不限字数 | `web/workstation.js`: `wsState`, `wsSelection`, `viewWorkstation`, `runWorkstation`；`context.py`: `_target_chars` | `scripts/test_setting_experience_ui.cjs`, `scripts/test_setting_io.py` |

## 全局角色卡与关系网定位

| 功能 | 代码 | 验证 |
|---|---|---|
| 全局角色卡数据、快照、图片 | `cards.py`: ensure/list_cards/save_card/delete_card/save_image/image_file；`server/_api.py`: /api/cards* | `scripts/test_cards.py` |
| 独立角色卡页与编辑弹窗 | `web/cards.js`: viewCharacterCards/openCardEditor；`web/core.js`: HOME_NAV、renderMain；`web/card-default.svg` | `scripts/test_relations_cards_ui.cjs` |
| 全局网络、条目一层图、共享选择器 | `web/relations.js`: viewRelations/relationGraph/relationDialog/relationDirectList/relationRemove/relationSave | `scripts/test_relations_ui.cjs`、`scripts/test_relations_cards_ui.cjs` |
| 坏边告警、关系投影事务 | `relations.py`: normalize；`store/_repository.py`: save('relations')；`server/_api.py`: /api/state、/api/collections/relations | `scripts/test_relations.py` |
| 按条目渲染关联 | `context.py`: render_record_relations、render_record_selection、render_worldmap、build_user_message | `scripts/test_relations.py`、`app/selftest.py` |

角色卡全局布局：`DATA_DIR/cards.json`、`DATA_DIR/card_images/`、`DATA_DIR/card_backups/`。关系快照位于当前小说数据目录 `relation_backups/`，不改关系集合格式。浏览器验收截图默认生成到系统临时目录，不写 validation 目录。

## 设定横栏与分组排序、恢复

- `web/records.js`: `recordStrip` / `recordStripButton` 是常规设定、背包和地图区域的顶部选择器；`recordGroupsEditor` 提供拖动、键盘排序及右侧删除；`moveRecordGroup`、`removeRecordGroup`、`restoreRecordGroup` 保存完整节点与顺序，`recordEditSession` / `removedRecordGroups` 管理仅本页可用的恢复记录。
- `web/core.js::renderMain` 在小说或视图变化时清理临时恢复；`web/views.js::viewInventory/viewWorld` 保留背包和地图原有数据操作，并复用选择器/地图信息分组编辑。
- 自动测试：`scripts/test_record_forms.cjs` 验证数据与恢复范围，`scripts/test_record_layout_ui.cjs` 用临时作品库验证全部常规栏目、真实拖动、键盘操作、筛选、多选、恢复/退出/刷新以及背包和地图。截图生成在系统临时目录，不写项目 validation 目录。

## 工作站流式生成与章节落盘定位

| 功能 | 实现 | 回归 |
|---|---|---|
| 流式返回（start/delta/done/error） | `server/_generation.py`: `_workstation_stream`、`_stream_*`；`ai.py`: `chat_stream`（SSE，非 SSE 上游退回整包） | `scripts/test_workstation_stream.py` |
| 前端逐字渲染、生成中不锁界面 | `web/workstation.js`: `streamWorkstation`、`paintStreaming`、`agentStreaming`、`state.ui.generating`；`web/core.js::renderNav` 生成指示点 | `scripts/test_workstation_ui.cjs` |
| 完整写作落成新章节 | `server/_generation.py`: `_wants_chapter`、`_chapter_title`；`project/_outputs.py`: `write_auto_chapter`、`next_chapter_number` | `scripts/test_workstation_stream.py` |
| 章节栏与「来自对话」 | `web/manuscript.js`: `chapterBar`、`loadChapter`；来源索引 `state.json` 的 `workstation.chapters` | `scripts/test_manuscript_ui.cjs`、`scripts/test_workstation_stream.py` |
| 基础提示词 + 模式任务提示词 | `prompts.py`: `AGENT_BASE_PROMPT`、`base_prompt`；`context.py::assemble_mode` | `app/selftest.py`、`scripts/test_language_settings.py` |
| 模式选择弹窗、模型在输入栏右侧 | `web/workstation.js`: `openModePicker`、`wsModelMenu`；`web/config.js`: `currentModels`（设置页只维护模型清单） | `scripts/test_settings_ui.cjs` |
