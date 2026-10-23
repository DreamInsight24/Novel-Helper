# 架构说明

本文档描述 Novel-Helper 的代码结构、包边界、行为约束与结构迁移记录。结构变更必须同步更新本文档。

## 1. 设计原则

- **职责单一**：每个软件包只承担一类职责，包名即职责。
- **边界清晰**：包之间只通过对方 `__init__.py` 暴露的公共 API 交互，不直接 import 内部模块。
- **对外最小暴露**：公共 API 由 `__all__` 显式声明，内部实现以 `_` 前缀标识私有。
- **行为稳定**：结构重构只搬移与重组，不改变对外行为、数据格式与接口签名。
- **无循环依赖**：包依赖关系为有向无环图，新增依赖需在本文档记录。

## 2. 目标包结构

以下为 v2610.2 任务 1 的结构；P0 基线以及 P1 `store`、P2 `project`、P3 `server` 包迁移均已完成并通过本地回归。A 的详细计划暂存于项目外；基线、拆分粒度、迁移映射和历史追踪证据见 `docs/restructure/`。

```
app/novelhelper/
  __init__.py          # 版本/模块公开入口
  store/               # JSON 数据、默认值、迁移、工作区路径与备份
    __init__.py        # 保持 novelhelper.store 公共 API
    _paths.py          # 路径锚点与集合常量
    _names.py          # ID/栏目名称助手
    _defaults.py       # 默认配置与集合
    _repository.py     # JSON 读写与记录清理
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
    _handler.py        # Handler 组合及 serve 生命周期
  ai.py                # 模型 API 适配，保持独立模块
  context.py           # 模型上下文组装，保持独立模块
  elements.py          # 设定元素树，保持独立模块
  history.py           # 会话与历史，保持独立模块
  logger.py            # 日志，保持独立模块
  prompts.py           # 默认模式与提示词，保持独立模块
  providers.py         # 提供商目录，保持独立模块
  app.py               # 应用入口，保持原位置
  web/                 # 前端资源（HTML/CSS/JS），任务 1 不改
```

### 现状与配置交接（P0）

- 当前 `store`、`project` 与 `server` 均已拆成同名包，并保留旧包级导入入口。
- 当前本地用户配置文件为 `store.DATA_DIR / "config.json"`；默认源码路径为 `app/data/config.json`，`app/run.py --debug` 默认路径为 `app/debug/data/config.json`。运行时环境变量可改变数据目录，详见 P0 计划中的路径矩阵。
- 读写入口分别是 `store.load("config")` 和 `store.save("config", config)`；缺失/空白文件返回默认配置。非法 JSON 或非 UTF-8 目前会引发 `RuntimeError`。任务 1 保持该行为；任务 2 按 K2 处理损坏配置的备份和日志，不另建语言配置文件。
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
| `ai`、`context`、`elements`、`history`、`logger`、`prompts`、`providers` | 保留职责相对单一的模块，作为根包公开模块 | 依具体模块而定；依赖方向以迁移计划为准 | 计划保留 |

`store`、`project` 与 `server` 均有接口说明。P1-P3 包内依赖如下；私有实现不反向导入所属包的 `__init__`：

| 模块 | 依赖 |
|---|---|
| `_paths` | 无 |
| `_names` | `_paths` |
| `_defaults` | `_names`、`_paths`、`prompts`、`providers` |
| `_repository` | `_defaults`、`_names`、`_paths`、`elements` |
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
| `_generation` | `_helpers`、`_state`、`ai`、`context`、`history`、`logger`、`project`、`prompts`、`providers`、`store` |
| `_handler` | `_api`、`_base`、`_generation`、`_records`、`store` |
| `__init__` | `_handler`、`_state`；保留 `ai` 模块属性兼容 |

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

P1 将 `app/novelhelper/store.py` 拆分为 `store/` 包，原公共接口由 `store/__init__.py` re-export；P2 将 `app/novelhelper/project.py` 拆分为 `project/` 包，原公共接口由 `project/__init__.py` re-export；P3 将 `app/novelhelper/server.py` 拆分为 `server/` 包，保留 `MAX_BODY`、`Handler`、`serve` 与 `server.ai` 兼容属性。三阶段仅调整代码组织和包内依赖边界，没有修改原业务处理流程；详细映射见 `docs/restructure/migration-map.md`。

## 8. 变更流程

- 结构变更需单独 PR，PR 描述中说明动机、影响范围与迁移方式；
- 涉及包边界调整的变更需负责人 review；
- 变更合入后同步更新本文档第 2、3、7 节；
- 删除或重命名公共 API 需在 `CHANGELOG.md` 中记录。
