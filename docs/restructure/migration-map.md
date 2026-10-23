# 任务 1 迁移映射（P1 `store` 已实施）

| 旧路径 | 第一移动落点 | 阶段状态 | 职责映射/最终落点 |
|---|---|---|---|
| `app/novelhelper/store.py` | `app/novelhelper/store/_repository.py` | P1 已实施，回归通过 | 路径/常量→`_paths.py`；ID/栏目助手→`_names.py`；默认值→`_defaults.py`；JSON 读写/锁/记录清理→`_repository.py`；配置化目录→`_directories.py`；初始化与既有迁移→`_bootstrap.py`；集合查询→`_collections.py`；备份→`_backup.py`；公共符号由 `store/__init__.py` 导出 |
| `app/novelhelper/project.py` | `app/novelhelper/project/_exports.py` | P2 已实施，回归通过 | 路径/基础文件操作→`_paths.py`；Markdown/记忆/地图解析→`_parsers.py`；导入与校验→`_imports.py`；JSON/文本导出→`_exports.py`；正文文本操作→`_text.py`；写稿和计划→`_outputs.py`；导入源枚举/工作区浏览→`_browse.py`；公共符号由 `project/__init__.py` 导出 |
| `app/novelhelper/server.py` | `app/novelhelper/server/_handler.py` | P3 已实施，回归通过 | HTTP 基础/静态资源→`_base.py`；路由分支→`_api.py`；记录操作→`_records.py`；AI/工作站生成→`_generation.py`；共享运行状态→`_state.py`；通用请求助手→`_helpers.py`；唯一 `serve` 定义与 Handler 组合→`_handler.py`，包入口导出 `MAX_BODY`/`Handler`/`serve` 并保留 `ai` 模块属性，不单建 `_serve.py` |

旧 `app/novelhelper/__init__.py` 保留根包名称、`__all__` 与版本符号；P4 将版本定义移到 `_version.py`，根入口原名导出。其他根级业务模块依据 P0 粒度复核维持原位置。`app/novelhelper/web/`、启动入口及静态资源不搬动。

P1 完成 store 包化和兼容导出，未修改持久化逻辑；P2 完成 project 包化和兼容导出，未修改导入、导出、文本和文件操作逻辑；P3 完成 server 包化，原 Handler 方法体与 `serve` 实现保持不变，并保留 `server.ai` 模块属性兼容。映射与实测粒度见 [`split-granularity.md`](split-granularity.md)。后续阶段保持每次只迁移一个大模块，记录实际旧路径 → 新路径、符号与验证结果；不要求每个阶段都等待负责人 review 才继续。
