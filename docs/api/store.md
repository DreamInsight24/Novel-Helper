# `novelhelper.store` API

`novelhelper.store` 是本地 JSON 集合、默认值、存储路径和工作区目录的兼容 API。实现拆分在私有模块中；调用方应继续导入包级 API，而不要直接依赖这些私有模块。

```python
from novelhelper import store

config = store.default_config()
print(config["server"]["port"])
```

## 公共常量

| 名称 | 说明 |
|---|---|
| `FROZEN` | 进程是否以冻结后的可执行文件形式运行。 |
| `STUDIO_DIR` | `novelhelper` 包目录，也用于定位打包的 Web 静态资源。 |
| `APP_ROOT` | 源码环境中的 `app/` 目录；冻结运行时则为可执行文件所在目录。 |
| `REPO_ROOT` | `APP_ROOT` 的父目录。 |
| `WEB_DIR` | Web 静态资源目录。 |
| `DEBUG_MODE` | 当 `NOVELHELPER_DEBUG=1` 时为真。 |
| `DEFAULT_LOG_DIR` | 当前运行模式下默认的相对日志路径。 |
| `RUNTIME_ROOT` | `NOVELHELPER_HOME` 指定的目录，或当前运行模式对应的运行时根目录。 |
| `PROJECT_ROOT` | `RUNTIME_ROOT` 的别名，为兼容现有调用方而保留。 |
| `DATA_DIR` | `NOVELHELPER_DATA` 指定的目录，或 `RUNTIME_ROOT/data`。`config.paths.data_dir` 不会覆盖此值。 |
| `NOVELS_DIR` | `DATA_DIR/novels`，小说数据目录。 |
| `WORKSPACE_ROOT` / `NOVEL_WORKSPACES_DIR` | 运行根下的工作区及其小说命名空间目录。 |
| `COLLECTIONS` | 内置 JSON 集合名称。 |
| `RECORD_COLLECTIONS` | 值采用 `items` 列表结构的集合。 |
| `SECTION_PREFIX` | 自定义栏目集合文件使用的前缀（`section_`）。 |
| `LAYOUT_VERSION` | 当前设定布局版本（2：内置栏目全显、equipment 并入 items）。 |

这些路径常量会在导入包时解析。请在导入 `novelhelper` 前设置运行模式相关的环境变量。

## 函数

| 签名 | 行为与返回值 |
|---|---|
| `now_str() -> str` | 返回当前本地时间，格式为 `YYYY-MM-DD HH:MM:SS`。 |
| `stamp() -> str` | 返回当前本地时间，格式为 `YYYYMMDD_HHMMSS`，用于生成名称。 |
| `new_id(prefix: str) -> str` | 返回 `<prefix>_<8 位十六进制字符>`。 |
| `data_dir() -> Path` | 返回配置的 `DATA_DIR`。 |
| `ensure_dirs() -> None` | 初始化全局配置、作品库和工作区目录；活动小说存在时补齐其集合默认值并执行 v2 布局迁移。 |
| `active_novel_id() -> str` | 返回全局配置中的已校验活动小说 ID；没有活动小说时返回空字符串。 |
| `validate_novel_id(novel_id: str) -> str` | 校验可作为目录段使用的小说 ID，非法值抛出 `ValueError`。 |
| `novel_data_dir(novel_id: str) -> Path` | 返回已校验小说的数据目录。 |
| `novel_workspace_dir(novel_id: str) -> Path` | 返回已校验小说的工作区目录。 |
| `io_in() -> Path` | 返回配置的导入目录；若路径不是绝对路径，则在 `PROJECT_ROOT` 下解析。 |
| `io_out() -> Path` | 返回配置的导出目录；若路径不是绝对路径，则在 `PROJECT_ROOT` 下解析。 |
| `out_dir() -> Path` | 返回配置的写作输出目录。 |
| `plan_dir() -> Path` | 返回配置的计划输出目录。 |
| `txt_dir() -> Path` | 返回配置的文本输出目录。 |
| `text_dir() -> Path` | 返回配置的稿件处理目录。 |
| `log_dir() -> Path` | 返回配置的日志目录；调试/冻结模式会将旧值 `../log` 规范为 `log`。 |
| `default_config() -> dict` | 返回一份新的默认配置，包括版本 4、运行模式端口、写作默认项、提供商默认项和工作区路径设置。 |
| `default_workstation() -> dict` | 返回一份新的 AI 工作站状态及选择项默认值。 |
| `default_state() -> dict` | 返回一份新的应用状态，包括工作站状态及兼容旧版的状态字段。 |
| `default_schema() -> dict` | 返回一份新的内置记录与自定义栏目元素模板。 |
| `default_character() -> dict` | 返回一条新角色记录，包含生成的 ID 和时间戳。 |
| `default_faction() -> dict` | 返回一条新势力记录，包含生成的 ID 和时间戳。 |
| `default_item() -> dict` | 返回一条新物品记录，包含生成的 ID 和时间戳。 |
| `default_equipment() -> dict` | 返回一条新装备记录，包含生成的 ID 和时间戳。 |
| `default_other() -> dict` | 返回一条新的其他设定记录，包含生成的 ID 和时间戳。 |
| `default_memory() -> dict` | 返回一条新记忆记录，包含生成的 ID 和时间戳。 |
| `default_worldmap() -> dict` | 返回一份新的世界地图结构。 |
| `default_meta() -> dict` | 返回一份新的元数据结构。 |
| `default_sections() -> dict` | 返回一份新的内置自定义栏目列表。 |
| `section_store_name(key: str) -> str` | 使用 `SECTION_PREFIX` 构造自定义栏目集合名称。 |
| `section_key(name: str) -> str` | 若名称带栏目集合前缀，则返回其后缀；否则返回空字符串。 |
| `is_section(name: str) -> bool` | 检查名称是否为有效的 ASCII 自定义栏目集合名。 |
| `section_names() -> list` | 从 `sections` 集合读取已启用的自定义栏目名称。 |
| `default_memory_categories() -> list` | 返回一份新的内置记忆分类标签列表。 |
| `default_history() -> dict` | 返回空的历史索引和当前会话指针。 |
| `default_for(name: str) -> Any` | 返回内置集合或有效自定义栏目的新默认值。名称未知时抛出 `KeyError`。始终返回原始内置数据，不随界面语言变化。 |
| `migrate_active_layout() -> dict` | 迁移当前活动小说：补齐内置栏目并默认显示，将 equipment 记录按 ID 合并进 items，同步人物装备指针与关系引用；迁移前写快照，幂等，返回 `migrated`、`moved_equipment`、`rewired_relations`、`backup` 等字段。 |
| `localized_default_for(name: str, lang_id: str) -> Any` | 返回与 `default_for` 相同结构、但用户可见文案已按 `lang_id` 翻译的副本。 |
| `seed_localized_defaults(lang_id: str) -> None` | 首次语言保存时调用：仅当集合仍是未改动的内置默认值时，用 `lang_id` 生成并落盘；用户数据不会被覆盖。 |
| `load(name: str) -> Any` | 加载集合。文件不存在或仅含空白时返回深拷贝后的默认值。名称未知时抛出 `KeyError`；UTF-8 或 JSON 无效时抛出 `RuntimeError`。 |
| `save(name: str, data: Any) -> Path` | 原子写入 JSON 并返回文件路径。记录集合/自定义栏目会按现有元素规则清理；名称未知及文件系统/序列化错误不会被吞掉。 |
| `load_all() -> dict` | 将所有内置集合和当前已启用的自定义栏目加载为“名称到数据”的映射。 |
| `load_all_names() -> list` | 返回内置集合名称及已启用的自定义栏目名称。 |
| `schema_for(name: str) -> list` | 返回集合的元素 schema；不存在时返回空列表。 |
| `known_collection(name: str) -> bool` | 检查名称是否属于内置集合或自定义栏目集合。 |
| `backup_all() -> Path` | 将现有集合 JSON 文件复制到 `io_out()` 下带时间戳的目录，并返回该目录路径。 |
| `list_novels() -> list[dict]` | 列出小说元数据；损坏的单条 `novel.json` 以 `ok=false` 降级返回。 |
| `create_novel(title, author="", description="", global_config=None) -> dict` | 创建小说数据、配置副本、内置预设和隔离工作区。 |
| `open_novel(novel_id) -> dict` | 设置活动小说并更新最后打开时间。 |
| `update_novel(novel_id, fields) -> dict` | 更新小说标题、作者或简介。 |
| `delete_novel(novel_id, title_confirmation) -> str` | 标题确认后将小说数据和工作区移入系统回收站。 |
| `load_novel_config(novel_id) -> dict` / `save_novel_config(novel_id, value) -> Path` | 读写小说配置副本。 |
| `current_config() -> dict` | 返回当前小说的有效配置；默认逐项跟随全局配置。 |
| `effective_config(global_config, novel_config) -> dict` | 按小说配置的 `use_global` 标记合并全局值和小说覆盖值。 |

在 debug 模式下，若配置的相对工作区路径解析到 `RUNTIME_ROOT` 之外，会抛出 `PermissionError`。创建目录、迁移、读写和备份操作可能抛出文件系统错误。本包保持现有磁盘 JSON 布局和迁移顺序。

## 兼容性

以上公共名称均列在 `store.__all__` 中。仍支持 `from novelhelper import store` 和 `from novelhelper.store import load` 等现有导入方式。保留 `store._migrate_mode_kinds` 仅因为 `app/selftest.py` 使用它；该名称为私有接口，不在 `__all__` 中。
