# Python 模块拆分粒度复核

| 项 | 内容 |
|---|---|
| 基线 | `pre-refactor-store` / `42cd65e77b9f7575096138c29195c78a9d8d2755` |
| 盘点口径 | UTF-8 源码物理行数；顶层函数/类（含私有）及全大写赋值/注解赋值计为符号；根包另计 `__version__`。类内方法单列，不重复计入顶层 |
| 估算口径 | 目标行数按原函数体跨度加必要 import、导出和空行估算，均为区间；不是已经提取出来的实测值。符号数按原定义归组，包入口单列 re-export |
| 结论 | 保留原计划第 6 节的三个同名包及依赖方向，不重写其结构图；下表确定最终文件清单，仅将 `server/_serve.py` 合入 `_handler.py` |

## 1. 现状模块盘点

| 源文件 | 行数 | 顶层符号数 | 主要职责/依赖边界 | 处理决定 |
|---|---:|---:|---|---|
| `__init__.py` | 12 | 2 常量，另有 `__all__` | 根包版本与模块名 | 保留入口；P4 将版本定义提取到 `_version.py`，入口原名导出 |
| `app.py` | 136 | 3 | CLI/启动；依赖 server/store/logger | 原位保留 |
| `ai.py` | 331 | 14 | 模型协议、可选 SDK/urllib；依赖 providers | 原位保留 |
| `context.py` | 512 | 24 | 上下文构建；依赖 elements/prompts/providers | 原位保留 |
| `elements.py` | 255 | 16 | 元素树操作与渲染 | 原位保留 |
| `history.py` | 268 | 22（18 函数、4 常量/状态） | 会话持久化；依赖 store | 原位保留；P3 增加标题公共别名，原函数保留 |
| `logger.py` | 126 | 12（9 函数、3 常量/状态） | 会话日志；依赖 store | 原位保留 |
| `project.py` | 877 | 43（42 函数、1 常量） | 导入/导出、文本、浏览 | 拆同名包 |
| `prompts.py` | 322 | 19（4 函数、15 常量） | 默认模式与提示词 | 原位保留，原文不变 |
| `providers.py` | 208 | 13（11 函数、2 常量） | 提供商目录与默认项 | 原位保留 |
| `server.py` | 822 | 9（5 函数、1 类、3 常量/状态）；类内另有 18 方法 | HTTP/路由/记录/生成 | 拆同名包 |
| `store.py` | 715 | 61（46 函数、15 常量/状态） | 路径、默认值、迁移、JSON、集合、备份 | 拆同名包 |

保留模块的后续行数按现有行数估计；`history.py` 增加公共别名后约 270–280 行、23 个顶层符号。根入口改为导出后约 12–20 行；新增 `_version.py` 约 6–12 行、2 常量。版本是 app/包入口共享的独立叶子依赖，允许小于 30 行，且版本值保持不变。

## 2. `store` 最终文件清单

| 目标文件 | 预估行数 | 定义/导出符号数 | 内容及独立依赖边界 |
|---|---:|---:|---|
| `store/__init__.py` | 80–120 | 原 52 个公共符号导出；另保留私有迁移兼容出口 | 只 re-export 和声明 `__all__`，不放业务实现 |
| `store/_paths.py` | 65–85 | 2 函数 + 14 常量 | 路径锚点、环境变量、集合常量；`data_dir`、`_root`；不调用配置读写 |
| `store/_names.py` | 32–45 | 6 函数 | 时间/ID/section 命名；默认值与仓库共享的无存储依赖叶子 |
| `store/_defaults.py` | 305–330 | 16 函数 | 默认配置/集合与 `default_for`；依赖路径、名称、prompts/providers，不读盘 |
| `store/_repository.py` | 80–100 | 5 函数 + 1 锁 | `_path`、`_deep_default`、load/save、记录裁剪；唯一 JSON 锁与原子写入 |
| `store/_directories.py` | 40–55 | 7 函数 | 读取配置的工作区/日志目录函数；依赖仓库，不能放回底层 `_paths` |
| `store/_bootstrap.py` | 165–185 | 4 函数 | ensure_dirs 与三项现有迁移；依赖仓库、默认值及目录 |
| `store/_collections.py` | 45–60 | 5 函数 | 动态栏目、集合枚举、schema/集合校验；高于仓库的查询边界 |
| `store/_backup.py` | 20–30 | 1 函数 | `backup_all` 编排集合读取与导出目录；独立的上层操作边界，允许小于 30 行 |

上述 9 个文件均保留，不把是否存在留到 P1 决定。`_backup` 若并入仓库，会形成“仓库 → 配置目录 → 仓库”的循环；`_directories` 若并入路径也会让默认值与仓库相互依赖。按依赖边界保留，比按行数强行合并更合适。

## 3. `project` 最终文件清单

| 目标文件 | 预估行数 | 定义/导出符号数 | 内容及独立依赖边界 |
|---|---:|---:|---|
| `project/__init__.py` | 50–80 | 36 公共函数 + 1 常量导出 | API 入口，只导出 |
| `project/_paths.py` | 50–65 | 5 函数 | 项目内路径约束、基本文本读写；基础层 |
| `project/_parsers.py` | 210–235 | 8 函数 + 1 常量 | Markdown、记忆和地图解析；解析助手及 HEADING_RE 留在此处 |
| `project/_imports.py` | 185–210 | 6 函数 | JSON 导入、校验、合并；依赖解析与 elements |
| `project/_exports.py` | 155–180 | 5 函数 | 设定清理/渲染、JSON/txt 保存；依赖领域渲染及 store |
| `project/_text.py` | 120–145 | 8 函数 | 清理、统计、转换与正文区段提取；纯文本层 |
| `project/_outputs.py` | 80–100 | 4 函数 | 正文、计划、转换文件及章节列表；依赖路径/文本及 store 目录 |
| `project/_browse.py` | 100–120 | 6 函数 | `import_sources`、工作区/IO 列表、浏览与外部写出；文件枚举操作边界 |

上述 8 个文件均保留。小助手随主要调用者放置，不另设薄 utils 文件。42 个原函数和 HEADING_RE 均有归属；`import_sources` 是文件枚举，放在 `_browse`。

## 4. `server` 最终文件清单

| 目标文件 | 预估行数 | 定义/导出符号数 | 内容及独立依赖边界 |
|---|---:|---:|---|
| `server/__init__.py` | 12–25 | MAX_BODY/Handler/serve 导出；兼容 ai 模块属性 | API 边界，虽小但必须存在；不定义 Handler/serve |
| `server/_state.py` | 8–15 | 3 常量/状态 | 唯一 `_RUN_LOCK`、`_RUN_STATE`、MAX_BODY；状态查询与生成共同依赖，允许小文件 |
| `server/_helpers.py` | 50–70 | 4 函数 | API 就绪、模式用途校验、选择裁剪、JSON 序列化；共享助手 |
| `server/_base.py` | 110–140 | 1 类，类内 12 方法 | HTTP 响应/请求体/分派、异常边界与静态资源；不反向导入 Handler |
| `server/_api.py` | 245–265 | 1 mixin 类，类内 1 方法 | 原 `_api` 路由分支，顺序和行为保持 |
| `server/_records.py` | 215–240 | 1 mixin 类，类内 3 方法 | `_import`、`_auto_sort`、`_move`；记录操作 |
| `server/_generation.py` | 240–270 | 1 mixin 类，类内 2 方法 | `_ai_run`、`_workstation_run`；共享锁/状态与 AI 编排 |
| `server/_handler.py` | 25–40 | Handler 类 + serve 函数，类内 2 原属性 | 组合各 mixin 和基础类，并创建服务；独立组装边界，允许小于 30 行 |

上述 8 个文件均保留。`_serve.py` 不独立建立，唯一 `serve` 定义与 Handler 组合放在 `_handler.py`，不把实现挪到包入口。迁移保留原 Handler 的全部 18 方法及 2 个类属性；增加的私有 mixin 类用于承载原方法，不增加业务逻辑。

## 5. 复核结论与实施约束

最终清单共 3 个同名包（9/8/8 个 Python 文件），加原位保留模块及 P4 的 `_version.py`。与原计划第 6 节相比，唯一文件合并为 `server/_serve.py → _handler.py`；其余边界保持。

小文件例外均有明确边界：包 API 入口、版本叶子、共享运行状态、Handler 组装和备份编排。其余业务文件估算均不低于 30 行。行数区间不作为强行补代码的指标；实际提取后更新实测值，若还需要改变本表的文件归属，先说明依赖原因并 review，不能临时扩大重构。

## 6. P1 `store` 实施后的实测规模

| 实际文件 | 实测行数 | 顶层定义/常量 | 对应职责 |
|---|---:|---:|---|
| `store/__init__.py` | 54 | 52 个公共 re-export；私有兼容符号不进 `__all__` | API 入口 |
| `store/_paths.py` | 67 | 2 函数 + 14 常量 | 路径与集合常量 |
| `store/_names.py` | 26 | 6 函数 | ID/栏目名助手；小于 30 行但被默认值与仓库复用 |
| `store/_defaults.py` | 292 | 16 函数 | 默认配置与集合 |
| `store/_repository.py` | 74 | 5 函数 + 1 锁 | JSON 读写与记录清理 |
| `store/_directories.py` | 33 | 7 函数 | 可配置工作区/日志目录 |
| `store/_bootstrap.py` | 157 | 4 函数 | 初始化与既有迁移 |
| `store/_collections.py` | 37 | 5 函数 | 集合查询 |
| `store/_backup.py` | 19 | 1 函数 | 跨仓库/目录/集合的备份编排，小文件有真实依赖边界 |

P1 仅调整 Python 代码组织与导出；默认内容、路径结果、签名和持久化行为通过基线对照/自检核对。P2 仅调整 project 代码组织与导出；P3 仅调整 server 代码组织与导出，三个大模块的包化迁移现已完成。

## 7. P2 `project` 实施后的实测规模

| 实际文件 | 实测行数 | 顶层定义/常量 | 对应职责 |
|---|---:|---:|---|
| `project/__init__.py` | 71 | 36 个公共函数 + `HEADING_RE` re-export | API 入口 |
| `project/_paths.py` | 48 | 5 函数 | 路径约束与基础文本读写 |
| `project/_parsers.py` | 178 | 8 函数 + 1 常量 | Markdown、记忆和地图解析 |
| `project/_imports.py` | 214 | 6 函数 | 导入转换、校验与记录合并 |
| `project/_exports.py` | 152 | 4 个公共函数 + 1 私有函数 | JSON/文本导出 |
| `project/_text.py` | 119 | 8 函数 | 正文解析与纯文本操作 |
| `project/_outputs.py` | 76 | 4 函数 | 正文、计划、转换文件与章节列表 |
| `project/_browse.py` | 95 | 5 个公共函数 + 1 私有函数 | 导入源、工作区列表与磁盘浏览 |

P2 的 43 个顶层定义/常量与 `pre-refactor-store` AST 对照一致；比较时仅忽略为适配包内位置而将两个函数内 `context` 相对导入层级从一级改为二级的差异。运行期 `project.__all__` 与基线 37 个公开名称一致，7 个私有模块无循环依赖；`app/selftest.py` 67 项通过，`scripts/smoke_test.py` 15 项通过。

## 8. P3 `server` 实施后的实测规模

| 实际文件 | 实测行数 | 顶层定义/常量 | 对应职责 |
|---|---:|---|---|
| `server/__init__.py` | 7 | `MAX_BODY`、`Handler`、`serve` re-export；兼容 `ai` 属性 | 公共 API 入口 |
| `server/_state.py` | 9 | 3 个常量/状态 | 请求体上限、生成锁与运行状态 |
| `server/_helpers.py` | 49 | 4 个函数 | 选择裁剪、surface 校验、API 就绪和 JSON 序列化 |
| `server/_base.py` | 104 | 1 个类、12 个方法 | HTTP 基础响应、请求分派、异常边界和静态资源 |
| `server/_api.py` | 234 | 1 个 mixin 类、1 个方法 | API 路由分支 |
| `server/_records.py` | 204 | 1 个 mixin 类、3 个方法 | 导入、自动归类和集合搬运 |
| `server/_generation.py` | 226 | 1 个 mixin 类、2 个方法 | 旧式 AI 请求与工作站/稿件生成 |
| `server/_handler.py` | 22 | `Handler` 组合类 + `serve`；2 个类属性 | 组合 18 个继承方法并创建 HTTP server |

P3 将原 `Handler` 的 18 个方法按 AST 原样移入基础类与三个 mixin，`serve` 函数体保持不变；公开入口仍导出 `MAX_BODY`、`Handler`、`serve`，并将 `server.ai` 指向同一个 `novelhelper.ai` 模块以兼容现有 monkeypatch。`app/selftest.py` 67 项和 `scripts/smoke_test.py` 15 项均通过。

## 9. P4 版本入口迁移后的实测规模

| 实际文件 | 实测行数 | 顶层定义/常量 | 对应职责 |
|---|---:|---|---|
| `novelhelper/__init__.py` | 11 | `__version__`、`APP_VERSION` re-export；原 `__all__` | 根包兼容入口 |
| `novelhelper/_version.py` | 4 | 2 个版本常量 | 集中定义包版本值 |

P4 保持 `__version__ == "2610.1"`、`APP_VERSION == "v2610.1"` 及 `novelhelper.__all__` 原值；新增自检验证根包别名与版本模块一致。
