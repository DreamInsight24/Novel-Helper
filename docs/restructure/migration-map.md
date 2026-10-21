# 任务 1 迁移映射（P0 基线版）

| 旧路径 | P1/P2/P3 第一移动落点 | 计划最终包/模块 | 职责映射 |
|---|---|---|---|
| `app/novelhelper/store.py` | `app/novelhelper/store/_repository.py` | `store/` | 底层路径/常量→`_paths.py`；纯名称助手→`_names.py`；默认值→`_defaults.py`；JSON 读写/锁→`_repository.py`；读取配置的目录→`_directories.py`；初始化/现有迁移→`_bootstrap.py`；集合查询→`_collections.py`；备份→`_backup.py` |
| `app/novelhelper/project.py` | `app/novelhelper/project/_exports.py` | `project/` | 路径/基础文件操作→`_paths.py`；Markdown/记忆/地图解析→`_parsers.py`；导入与校验→`_imports.py`；JSON/文本导出→`_exports.py`；正文文本操作→`_text.py`；写稿和计划→`_outputs.py`；导入源枚举/工作区浏览→`_browse.py` |
| `app/novelhelper/server.py` | `app/novelhelper/server/_handler.py` | `server/` | HTTP 基础/静态资源→`_base.py`；路由分支→`_api.py`；记录操作→`_records.py`；AI/工作站生成→`_generation.py`；共享运行状态→`_state.py`；通用请求助手→`_helpers.py`；唯一 `serve` 定义与 Handler 组合→`_handler.py`，不单建 `_serve.py` |

旧 `app/novelhelper/__init__.py` 保留根包名称、`__all__` 与版本符号；P4 将版本定义移到 `_version.py`，根入口原名导出。其他根级业务模块依据 P0 粒度复核维持原位置。`app/novelhelper/web/`、启动入口及静态资源不搬动。

每个实施 PR 附该批实际旧路径 → 新路径映射；同时写清是否仅移动、提取了哪些符号。上述第一落点先承载完整旧实现，随后在同包内按职责提取。最终内部文件清单、逐文件行数/符号数见 [`split-granularity.md`](split-granularity.md)；函数映射见项目外 A 迁移计划第 7 节，其中原 `_serve.py` 目标统一修订为 `_handler.py`。负责人若在 P0 review 调整本表，先同步粒度报告再进入迁移。
