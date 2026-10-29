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
    _language.py       # 语言持久化、首次判定与损坏配置恢复
    _handler.py        # Handler 组合及 serve 生命周期
  ai.py                # 模型 API 适配，保持独立模块
  context.py           # 模型上下文组装，保持独立模块
  elements.py          # 设定元素树，保持独立模块
  history.py           # 会话与历史，保持独立模块
  logger.py            # 日志，保持独立模块
  prompts.py           # 默认模式与提示词，保持独立模块
  providers.py         # 提供商目录，保持独立模块
  tool_prompts.py      # 内置工具提示词与调用参数（记忆压缩等），保持独立模块
  app.py               # 应用入口，保持原位置
  web/                 # 前端资源（HTML/CSS/JS），任务 1 不改
```

### v2610.3 作品库存储

- `DATA_DIR/config.json` 始终是全局配置，保存语言、服务端设置、全局 API 配置、首次引导状态和 `active_novel_id`；首次启动初始化空作品库，不实现旧版单本数据迁移。
- 小说数据位于 `DATA_DIR/novels/<novel_id>/`，小说元数据以 `novel.json` 为唯一来源；集合 `load/save` 根据全局活动小说 ID 动态解析，不在模块导入时缓存小说路径。
- 工作区位于 `PROJECT_ROOT/workspace/novels/<novel_id>/`。小说配置中的工作区路径是该小说工作区内的相对路径片段，解析后不得越界。
- 每本小说的 `config.json` 在创建时复制当时的全局配置作为初值，并按顶层配置项记录 `use_global` 与 `values`。`use_global=true` 时有效值取全局配置；否则取小说覆盖值。创建默认所有可继承项跟随全局；日志、语言、首次引导和活动小说选择仍由全局配置管理。
- 历史索引和会话文件位于小说数据目录；全局日志目录仍由全局配置管理。删除小说时数据目录及工作区通过 Windows Shell 移入系统回收站；失败时保留数据并返回可读错误。元数据正常时以标题确认，元数据损坏时以小说 ID 确认。

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

`store`、`project` 与 `server` 均有接口说明。P1-P3 包内依赖如下；私有实现不反向导入所属包的 `__init__`：

| 模块 | 依赖 |
|---|---|
| `_paths` | 无 |
| `_names` | `_paths` |
| `_defaults` | `_names`、`_paths`、`prompts`、`providers` |
| `_repository` | `_defaults`、`_names`、`_paths`、`elements` |
| `_localized` | `_defaults`、`_repository`、`localization` |
| `_directories` | `_paths`、`_repository` |
| `_collections` | `_names`、`_paths`、`_repository` |
| `_bootstrap` | `_defaults`、`_directories`、`_paths`、`_repository`、`prompts`、`providers` |
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
| `_api` | `_helpers`、`_state`、`ai`、`context`、`history`、`logger`、`project`、`prompts`、`providers`、`store` |
| `_records` | `elements`、`logger`、`project`、`store` |
| `_generation` | `_helpers`、`_state`、`ai`、`context`、`history`、`logger`、`project`、`prompts`、`providers`、`store`、`tool_prompts` |
| `_handler` | `_api`、`_base`、`_generation`、`_records`、`store` |
| `__init__` | `_handler`、`_state`；保留 `ai` 模块属性兼容 |

`server/_generation.py` 通过公开的 `history.title_from_prompt` 生成会话标题。该名称是原 `_title_from_prompt` 的公开别名，保留原签名与算法；`history` 内部调用仍可使用私有实现。API 索引记录了此模块级接口。`store._migrate_mode_kinds` 继续作为既有自检的兼容出口，不属于 `store.__all__`。

## 4. 豁免清单

以下内容不参与本次结构重构，明确保持原状：

| 路径 | 说明 |
|---|---|
| `app/run.py` 等启动入口 | 启动方式与端口不变 |
| `app/__init__.py` | 不修改 |
| `app/novelhelper/__init__.py` | 仅允许 re-export 公共 API 与声明 `__all__`，不含业务逻辑 |
| `app/novelhelper/web/` | 前端资源整体不动，任务 3.1、3.2 才修改文案与语言 UI |
| 静态资源、模板、配置文件目录 | 除非为适配 Python import 路径必须调整，且需在 PR 说明 |

## 5. 行为不变约束

结构重构期间，以下内容不得改变：

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
