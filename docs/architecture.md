# 架构说明

本文档描述 Novel-Helper 的代码结构、包边界、行为约束与结构迁移记录。结构变更必须同步更新本文档。

## 1. 设计原则

- **职责单一**：每个软件包只承担一类职责，包名即职责。
- **边界清晰**：包之间原则上只通过对方 `__init__.py` 暴露的公共 API 交互，不直接 import 内部模块；已知例外见本文件第 3 节。
- **对外最小暴露**：包级公共 API 由 `__all__` 显式声明；独立保留模块使用不以下划线开头的名称提供公开符号，内部实现以 `_` 前缀标识私有。
- **行为稳定**：结构重构只搬移与重组，不改变对外行为、数据格式与接口签名。
- **无循环依赖**：包依赖关系为有向无环图，新增依赖需在本文档记录。

## 2. 目标包结构

以下为 v2610.2 任务 1 的目标结构；P0 基线以及 P1 `store`、P2 `project`、P3 `server` 包迁移和 P4 收尾均已实施。历史标题公共别名已按计划落实，最终源码与 EXE 回归结果见验收记录。基线、拆分粒度、迁移映射和最终验收记录见 `docs/restructure/`。

```
app/novelhelper/
  __init__.py          # 版本/模块公开入口（兼容导出）
  _version.py          # 集中定义包版本常量
  store/               # JSON 数据、默认值、迁移、工作区路径与备份
    __init__.py        # 保持 novelhelper.store 公共 API
    _paths.py          # 路径锚点与集合常量
    _names.py          # ID/栏目名称助手
    _defaults.py       # 默认配置与集合
    _localized.py      # 内置预设的首次语言本地化与落盘
    _repository.py     # JSON 读写与记录清理
    _novels.py         # 作品库元数据、小说配置与生命周期
    _directories.py   # 从配置解析工作区/日志目录
    _bootstrap.py      # 初始化与既有配置迁移
    _layout.py         # v2 设定布局迁移与 equipment → items 合并
    _collections.py    # 集合枚举/schema 查询
    _backup.py         # 数据备份
  project/             # 导入导出、文本处理、稿件与文件操作
    __init__.py        # 保持 novelhelper.project 公共 API
    _paths.py          # 项目内路径约束与基础文本读写
    _parsers.py        # Markdown、记忆与地图解析
    _imports.py        # 导入转换、校验与记录合并
    _exports.py        # JSON/文本清理与导出
    _text.py           # 正文处理与纯文本操作
    _outputs.py        # 正文、计划、转换文件与章节列表
    _browse.py         # 导入源、工作区列表与磁盘浏览
  server/              # HTTP 生命周期、API 路由与请求编排
    __init__.py        # 保持 novelhelper.server 公共 API
    _state.py          # 请求体上限、生成锁与共享状态
    _helpers.py        # API 就绪、surface 校验、选择与 JSON 助手
    _base.py           # HTTP 基础响应、分派、异常边界和静态资源
    _api.py            # API 路由 mixin
    _records.py        # 导入、自动归类和集合搬运 mixin
    _generation.py     # AI 与工作站生成 mixin
    _revision.py       # 润色修订 Agent 的流式接口与会话读取
    _language.py       # 语言持久化、首次判定与损坏配置恢复
    _handler.py        # Handler 组合及 serve 生命周期
  agent/               # 可复用 Agent 工具包（与小说业务无关）
    __init__.py        # 公共导出
    segments.py        # 段落切分、稳定 ID/哈希、文档重建
    jsonio.py          # 结构化输出容错解析
    llm.py             # 结构化模型调用（JSON 修复、用量统计）
    diff.py            # 字符级 diff、改动量、字符区间
    rounds.py          # 软/硬轮次、无进展与震荡检测
    sessions.py        # 通用会话 JSON 存储（原子写入）
    events.py          # 进度事件与告警
  revision/            # 小说润色修订业务层
    __init__.py        # RevisionEngine / RevisionError
    engine.py          # 状态机：计划、样例、批量、审核、确认、回滚、增量
    card.py            # 需求卡、最多 1 个带选项的追问、直接接受
    summary.py         # 稳定摘要（只追加）
    plan.py            # 改稿计划校验、预算与样例段选择
    revise.py          # 局部改写、越界丢弃、漏段重试、哈希校验
    merge.py           # 合并与逐段 diff
    review.py          # 局部/一致性/全局审核
    prompts.py         # 三组固定提示词
    store.py           # 会话目录与可配置项
  ai.py                # 模型 API 适配，保持独立模块
  context.py           # 模型上下文组装，保持独立模块
  elements.py          # 设定元素树，保持独立模块
  history.py           # 会话与历史，保持独立模块
  logger.py            # 日志，保持独立模块
  prompts.py           # 默认模式与提示词，保持独立模块
  providers.py         # 提供商目录，保持独立模块
  tool_prompts.py      # 内置工具提示词与调用参数（记忆压缩等），保持独立模块
  setting_gen.py       # AI 设定生成：目标目录、隐藏提示词、分块抽取、校验映射、事务写入与撤销，保持独立模块
  ports.py             # 端口配置迁移、校验、优先级解析与错误消息
  desktop.py           # pywebview 懒加载、窗口参数、ServerRuntime 与原生错误框
  app.py               # 应用入口：参数、服务启动、窗口/服务模式与清理
  web/                 # 前端资源（HTML/CSS/JS）
```

### v2610.3 作品库存储

- `DATA_DIR/config.json` 始终是全局配置，保存语言、服务端设置、全局 API 配置、首次引导状态和 `active_novel_id`；首次启动初始化空作品库，不实现旧版单本数据迁移。
- 小说数据位于 `DATA_DIR/novels/<novel_id>/`，小说元数据以 `novel.json` 为唯一来源；集合 `load/save` 根据全局活动小说 ID 动态解析，不在模块导入时缓存小说路径。
- 工作区位于 `PROJECT_ROOT/workspace/novels/<novel_id>/`。小说配置中的工作区路径是该小说工作区内的相对路径片段，解析后不得越界。
- 每本小说的 `config.json` 在创建时复制当时的全局配置作为初值，并按顶层配置项记录 `use_global` 与 `values`。`use_global=true` 时有效值取全局配置；否则取小说覆盖值。创建默认所有可继承项跟随全局；日志、语言、首次引导和活动小说选择仍由全局配置管理。
- 历史索引和会话文件位于小说数据目录；全局日志目录仍由全局配置管理。删除小说时数据目录及工作区通过 Windows Shell 移入系统回收站；失败时保留数据并返回可读错误。元数据正常时以标题确认，元数据损坏时以小说 ID 确认。
- `store._layout` 在活动小说启动/打开时执行一次性 v2 布局迁移：补齐内置设定栏目并默认显示，将旧 `equipment` 记录按原 ID 合并进 `items`，同步人物装备指针与关系引用；迁移前在小说目录写入 `migration_backups/v2_<时间戳>/` 快照，迁移幂等。
- `server` 配置属于全局配置，不参与小说级覆盖；`_novels._GLOBAL_ONLY_KEYS` 会从小说配置中移除 `server`。端口解析只在 `ports` 中进行，HTTP 服务按解析结果绑定。

### v2611.1 设定体验与文件 I/O

- 设定条目列表由 `recordStrip()` / `recordStripButton()` 渲染为编辑面板顶部横栏，`viewRecords()` 保留筛选与其他设定批量选择；人物背包与地图区域复用选择器，地图表格仍保留原有层级和拖放行为。
- `recordGroupsEditor()` 操作当前条目的 elements 数组，复用到常规设定和地图区域，支持 HTML 原生拖动及 Alt+方向键排序。拖动使用独立 MIME，避免被地图区域拖放误识别；排序不改字段值或模板定义。
- 快速删除前把完整节点、索引和展开状态保存在 `state.ui.recordEditSession`；恢复采用逐次逆序插入，遇到同名分组则保留恢复记录并提示。会话按活动小说和当前视图隔离，`renderMain()` 在视图/小说变化时清理；同页重绘、切换条目或页签保留会话。恢复记录与 WeakMap 展开状态不写 JSON，实际删除/恢复仍走原集合自动保存。

- `web/records.js` 的新建入口直接调用 `newRecord()`，经 `presetsOf(coll)` / `applyPreset()` 深拷贝栏目模板；已有条目不自动补模板。分类、标签、备注与补充正文留在内容页，通用编辑器仍保留元素树结构。
- 新小说 `default_sections()` 只开启 world；七个扩展栏目保留定义并默认隐藏。旧小说 `_restore_sections()` 不变；前端显示只取栏目自己的 on，父子导航仅表示视觉层级。
- `server/_api.py::_workspace_file()` 处理 `{directory, filename, novel_id}` 新文件请求，也兼容原 path 请求；在解析真实路径后拒绝当前小说外的 workspace 路径。任意位置导出继续保留用户选择的外部路径语义。
- `GET /api/workspace/files` 只刷新文件元数据，`refreshWorkspaceFiles()` 不替换未保存集合；返回活动小说 ID，忽略切换小说后的迟到响应。
- 导入前 `backup_all()` 快照集合，失败恢复受影响集合及关系投影。文本覆盖通过同目录临时文件原子替换，旧版保留为 `.bak`；默认导出使用独占创建及编号，避免覆盖。
- 工作站本次模型写入 `override.model`；`selection.length_mode=unlimited` 明确禁用目标字数配置回填，旧客户端的 target_chars / strict_length 仍受支持。

### v2611.1 关系网与全局角色卡

- `relations` 集合保持小说级数据格式；`relations.normalize()` 支持可选 warnings 输出，普通保存丢弃无效边且去重；strict=True 的直接校验接口仍可用于严格检查。读取旧坏数据时 `/api/state` 返回 relation_discarded 提示数量。
- `store/_repository.py::save('relations')` 在锁内保存关系及势力成员投影，写前将原文件快照到该小说 `relation_backups/<唯一标识>/`；任一步失败恢复两份原始文件，不依赖可能失败的集合写入函数。
- `web/relations.js` 共享目录、布局、绘制、选择器和直接关联列表。`viewRelations()` 注册为 relations 页面，与集合名共享标识但分别由路由/集合 API 分派；条目内绘制固定一层，页面绘制所有匹配节点（含孤立节点）。关联保存先 flushPendingSaves，再即时请求，不依赖关系防抖保存。
- `context.render_record_relations(db, collection, rec)` 只渲染对端名称及关联元数据；详细选择、旧选择和地图区域渲染均在各条目块内追加。`render_selected_relations()` 保留兼容入口并返回空文本。
- `cards.py` 使用全局 DATA_DIR，独立于 COLLECTIONS 和小说路径解析；服务启动幂等创建空 cards.json，GET/POST 专用接口提供卡片及图片服务。`store.load_all()`、设定导航和 AI 拼装不会枚举角色卡。
- 全局图片存于 `card_images/<随机文件名>`，JSON 只存引用；限制 2 MB 的 PNG/JPEG/WebP，拒绝 SVG/data URL 持久化和路径文件名。默认图为 web/card-default.svg，现有 web 资源打包规则已覆盖新增 JS/SVG。
- 全局卡片修改前快照到 `card_backups/<唯一标识>/cards.json`；JSON 与图片通过同目录临时文件原子替换，保存失败删除新上传图片。保留旧图片使历史快照可恢复，删除小说只触碰小说命名空间。

### v2610.3 桌面启动与端口

- `ports.normalize_server_config` 在启动时把旧配置迁移为 `server.port_mode`：无端口或旧默认端口（普通 8765 / 调试 8766）转为 `auto`，其他合法端口保留为 `fixed`；无效显式端口抛出 `PortConfigError`，不静默回退。
- 端口优先级为 `--port` > 全局固定端口 > 自动分配。自动模式绑定端口 0，从 `httpd.server_address[1]` 读取实际端口；`--port 0` 被明确拒绝。
- `desktop.ServerRuntime` 在守护线程中运行 HTTP 服务，`desktop.open_window` 在主线程调用 pywebview；窗口关闭后依次 `shutdown()`、`server_close()`、等待服务线程退出。
- 默认创建 `1280×800`、最小 `1024×720` 的可缩放窗口；`desktop.window_bounds` 按主屏工作区收缩并居中，启动位置和尺寸不持久化，最大化关闭后重启仍回到默认状态。
- 窗口先加载 `app/resources/splash.html` 开屏页，至少显示 1.2 秒并淡出后再导航到应用 URL；`desktop.splash_html` 将图标以 data URI 内联，避免依赖本地文件协议。
- 打包 EXE 使用窗口子系统（`console=False`），双击不出现控制台；`--no-window` 只启动服务，`--no-browser` 是兼容别名，`--check`/`--version` 不依赖 GUI，终端或 CI 重定向时仍可输出。统一图标同时用于 EXE、WinForms 窗口和网页 favicon。
- pywebview 在真正创建窗口时才导入。WebView2/pywebview 不可用时给出安装指引与日志提示，不回退浏览器；Windows 下同时尽力显示原生错误框。
- 服务绑定在 Windows 上关闭 `SO_REUSEADDR`，确保显式固定端口被占用时直接失败，而不是静默复用端口。

### 现状与配置交接（P0）

- 当前 `store`、`project` 与 `server` 均已拆成同名包，并保留旧包级导入入口。
- 当前本地用户配置文件为 `store.DATA_DIR / "config.json"`；默认源码路径为 `app/data/config.json`，`app/run.py --debug` 默认路径为 `app/debug/data/config.json`。运行时环境变量可改变数据目录，详见 P0 计划中的路径矩阵。
- 读写入口分别是 `store.load("config")` 和 `store.save("config", config)`；缺失/空白文件返回默认配置。非法 JSON 或非 UTF-8 目前会引发 `RuntimeError`。任务 1 保持该行为；任务 3.2 在 `server/_language.py` 实现语言字段读写与 K2 损坏配置处理（备份为 `config.json.bak-<时间戳>` 并记日志，随后按首次/默认配置继续），不另建语言配置文件。
- `config.language` 为任务 3.2 的用户语言字段；配置中无该字段即视为首次进入。启动时 `server.serve()` 将其应用到进程默认语言，`POST /api/settings/language` 写入并立即生效。损坏配置的备份与日志由 `server/_language.py` 负责，`store` 层的既有 `RuntimeError` 行为不变。
- `config.paths.data_dir` 当前未参与 `DATA_DIR` 路径计算；不应将其误当成用户数据迁移开关。

## 3. 计划职责

<!-- 任务 1 完成后补全：每个包的职责、公共 API 清单、依赖关系。格式示例：

### storage

- 职责：负责 JSON 数据的读写、校验与迁移。
- 公共 API：见 `docs/api/storage.md`。
- 依赖：无。
- 被依赖：services、routes。
-->

| 包/模块 | 计划职责 | 主要依赖 | 状态 |
|---|---|---|---|
| `store` | JSON 读写、默认数据、旧数据迁移、路径和备份 | `prompts`、`providers`、`elements`；包内按私有模块分层 | P1 已实施；接口见 `docs/api/store.md` |
| `project` | 工作区文件、导入/导出与文本处理 | `store`、`elements`、`context`；包内按私有模块分层 | P2 已实施；接口见 `docs/api/project.md` |
| `server` | HTTP 服务、静态资源和 API 编排 | `ai`、`context`、`history`、`logger`、`project`、`store` 等 | P3 已实施；接口见 `docs/api/server.md` |
| `ai`、`context`、`elements`、`history`、`logger`、`prompts`、`providers`、`tool_prompts` | 保留职责相对单一的模块，作为根包公开模块 | 依具体模块而定；依赖方向以迁移计划为准 | 已保留；符号基线见 `docs/restructure/public-api-baseline.md` |
| `setting_gen` | AI 设定生成：目标目录构建、隐藏系统提示词、按段落分块与修复重试、结果校验与确定性映射、事务写入与指纹撤销 | `store`、`logger`、`localization`；`server/_generation` 通过 `extract_records` / `validate_batch` / `write_batch` / `undo_last_batch` 调用 | v2610.3 任务 3 新增；接口见 `docs/api/server.md` 的 AI 设定生成接口 |
| `agent` | 可复用 Agent 工具包：段落索引、结构化 JSON、模型调用、diff、轮次收敛、会话存储与事件 | 仅标准库（默认模型调用入口 `ai` 通过构造函数注入） | 新增；不包含小说业务词，可被其他 Agent 复用 |
| `revision` | 润色修订业务：需求卡、稳定摘要、改稿计划、局部改写与合并校验、分层审核、状态机与回滚 | `agent`、`ai`、`store`、`logger`、`localization`；`server/_revision` 调用 `RevisionEngine.execute` | 新增；接口见 `docs/code-map.md` 与 `README` 的润色修订 Agent |
| `ports` | 端口配置迁移、显式端口校验、优先级解析与错误消息 | 仅标准库 | v2610.3 任务 4 新增；供 `store`、`server` 与 `app` 使用 |
| `desktop` | pywebview 懒加载、窗口参数、HTTP 服务线程与清理、Windows 错误框 | 标准库；仅在打开窗口时导入 pywebview | v2610.3 任务 4 新增 |
| `app` | CLI 参数、启动顺序、服务/窗口模式、失败退出与日志 | `desktop`、`ports`、`server`、`store`、`logger` | v2610.3 任务 4 调整；`--no-window` 为测试入口 |

`store`、`project` 与 `server` 均有接口说明。P1-P3 包内依赖如下；私有实现不反向导入所属包的 `__init__`：

| 模块 | 依赖 |
|---|---|
| `_paths` | 无 |
| `_names` | `_paths` |
| `_defaults` | `_names`、`_paths`、`ports`、`prompts`、`providers` |
| `_repository` | `_defaults`、`_names`、`_paths`、`elements` |
| `_localized` | `_defaults`、`_repository`、`localization` |
| `_directories` | `_paths`、`_repository` |
| `_collections` | `_names`、`_paths`、`_repository` |
| `_bootstrap` | `_defaults`、`_directories`、`_paths`、`_repository`、`ports`、`prompts`、`providers` |
| `_layout` | `_defaults`、`_names`、`_paths`、`_repository` |
| `_backup` | `_collections`、`_directories`、`_names`、`_repository` |
| `__init__` | 汇总导出，不承载业务实现 |

`project` 内部依赖：

| 模块 | 依赖 |
|---|---|
| `_paths` | `store` |
| `_parsers` | `store` |
| `_imports` | `_parsers`、`store` |
| `_exports` | `context`、`elements`、`store` |
| `_text` | 无 |
| `_outputs` | `_paths`、`_text`、`store` |
| `_browse` | `_paths`、`store` |
| `__init__` | 汇总导出，不承载业务实现 |

`server` 内部依赖：

| 模块 | 依赖 |
|---|---|
| `_state` | `threading` |
| `_helpers` | `ai`、`context` |
| `_base` | `_helpers`、`_state`、`ai`、`logger`、`store` |
| `_api` | `_helpers`、`_state`、`ai`、`context`、`history`、`logger`、`ports`、`project`、`prompts`、`providers`、`store` |
| `_records` | `elements`、`logger`、`project`、`store` |
| `_generation` | `_helpers`、`_state`、`ai`、`context`、`history`、`logger`、`project`、`prompts`、`providers`、`setting_gen`、`store`、`tool_prompts` |
| `_handler` | `_api`、`_base`、`_generation`、`_records`、`store` |
| `__init__` | `_handler`、`_state`；保留 `ai` 模块属性兼容 |

`server/_generation.py` 通过公开的 `history.title_from_prompt` 生成会话标题。该名称是原 `_title_from_prompt` 的公开别名，保留原签名与算法；`history` 内部调用仍可使用私有实现。API 索引记录了此模块级接口。`store._migrate_mode_kinds` 继续作为既有自检的兼容出口，不属于 `store.__all__`。

## 4. 豁免清单

以下内容不参与本次结构重构，明确保持原状：

| 路径 | 说明 |
|---|---|
| `app/run.py` 等启动入口 | v2610.2 重构期间不改；v2610.3 任务 4 已按桌面化与动态端口需求调整，见第 2 节 |
| `app/__init__.py` | 不修改 |
| `app/novelhelper/__init__.py` | 仅允许 re-export 公共 API 与声明 `__all__`，不含业务逻辑 |
| `app/novelhelper/web/` | 前端资源整体不动，任务 3.1、3.2 才修改文案与语言 UI |
| 静态资源、模板、配置文件目录 | 除非为适配 Python import 路径必须调整，且需在 PR 说明 |

## 5. 行为不变约束

以下为 v2610.2 结构重构期间的约束；v2610.3 的功能/启动改动按对应需求文档执行，并在此记录差异。

- 对外 URL 与路由；
- JSON 存储路径与格式；
- 配置项名称与默认值；
- 前端资源引用路径；
- 公共函数签名、返回结构与异常类型；
- 界面文案与默认提示词；
- 依赖版本。

## 6. 公共 API 约定

- 每个包的 `__init__.py` 使用 `__all__` 声明公共 API，并 re-export 对应实现；
- 内部模块与函数以 `_` 前缀标识，不写入 `__all__`；
- `docs/api/<package>.md` 只记录 `__all__` 中的内容，与 docstring 保持一致；
- 优先使用 `pdoc` 或 `mkdocstrings` 由 docstring 生成接口文档，PR 中附生成命令；
- 新增或删除公共 API 需在本文档“包职责”章节与对应 `docs/api/` 文件中同步更新。

## 7. 迁移记录

<!-- 任务 1 执行时逐批补充：旧路径 → 新路径、职责说明、对应 PR。格式示例：

| 旧路径 | 新路径 | 说明 | PR |
|---|---|---|---|
| `app/novelhelper/storage.py` | `app/novelhelper/storage/__init__.py` | JSON 存储拆分为包 | #12 |
-->

P1 将 `app/novelhelper/store.py` 拆分为 `store/` 包，原公共接口由 `store/__init__.py` re-export；P2 将 `app/novelhelper/project.py` 拆分为 `project/` 包，原公共接口由 `project/__init__.py` re-export；P3 将 `app/novelhelper/server.py` 拆分为 `server/` 包，保留 `MAX_BODY`、`Handler`、`serve` 与 `server.ai` 兼容属性；P4 将版本常量集中到 `_version.py`，由根 `__init__.py` 兼容导出。以上阶段仅调整代码组织和包内依赖边界，没有修改原业务处理流程；详细映射见 `docs/restructure/migration-map.md`。

旧版命令行工具（`app/tools/`）已移除。其中仍在使用的功能由根包模块承接，不改变对外行为：

| 旧路径 | 新落点 | 说明 |
|---|---|---|
| `app/tools/`（`writer.py`、`checker.py`、`fixer.py`、`idea_helper.py`、`md2txt.py`、`common.py`） | 已删除 | 命令行入口不再提供；`md2txt.py` 的文本处理已由 `project.md_to_txt` / `project.apply_text_op` 覆盖，写稿与处理类操作由「AI 工作站」与「稿件处理」页承接 |
| `app/tools/common.py` → `prompts.default_prompts()` / `prompts.TOOL_PROMPTS` | `tool_prompts` | 网页端仍在使用的内置工具提示词与调用参数改由该模块提供，`server/_generation.py` 的 `/api/ai/run` 直接调用 |
| `ai.tool_settings()`、`ai.chat()`、`context.assemble()` | 已删除 | 仅为旧命令行工具存在的兼容符号，删除后没有调用方；显式参数调用统一走 `ai.chat_settings()`，上下文组装统一走 `context.assemble_mode()` |
| `prompts.TOOL_PROMPTS`、`prompts.default_prompts()` 及 7 个旧工具提示词常量 | `tool_prompts` + 翻译表 | 提示词正式内容放在 `defaults.tool.*_prompt`（`zh-CN.yml` / `en-US.yml`），按当前语言取词；`tool_prompts` 内的常量只作缺词回退，与 `prompts.DEFAULT_MODES` 的做法一致 |

## 8. 变更流程

- 结构变更需单独 PR，PR 描述中说明动机、影响范围与迁移方式；
- 涉及包边界调整的变更需负责人 review；
- 变更合入后同步更新本文档第 2、3、7 节；
- 删除或重命名公共 API 需在 `CHANGELOG.md` 中记录。
