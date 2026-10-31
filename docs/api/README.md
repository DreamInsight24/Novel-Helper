# Python 公共 API 索引

本页是 `novelhelper` Python 导入入口的导航。调用方应使用下表列出的包级接口，不直接依赖以下划线开头的私有实现模块。

## 包接口

| 导入入口 | 职责 | 接口说明 |
|---|---|---|
| `novelhelper.store` | 本地 JSON 数据、默认值、运行路径、初始化迁移与备份 | [store API](store.md) |
| `novelhelper.project` | 工作区路径、导入导出、稿件输出、文本处理与文件浏览 | [project API](project.md) |
| `novelhelper.server` | 本地 HTTP 服务、请求处理器与服务生命周期 | [server API](server.md) |
| `novelhelper.localization` | 配置驱动的翻译表、取词、语言上下文与校验 | [localization API](i18n.md) |
| `novelhelper.ports` | 端口配置迁移、校验、优先级解析与错误消息 | [server API · 桌面启动与端口](server.md#桌面启动与端口) |
| `novelhelper.desktop` | pywebview 懒加载、窗口居中/尺寸、开屏、图标、HTTP 服务线程与清理 | [server API · 桌面启动与端口](server.md#桌面启动与端口) |

以上包在 `__init__.py` 中显式声明 `__all__`。`server.ai` 仍作为兼容属性指向 `novelhelper.ai`，但不属于 `server.__all__`。

## 根包入口与保留模块

`novelhelper.__all__` 声明根包可导入模块：`ai`、`app`、`context`、`desktop`、`elements`、`history`、`logger`、`ports`、`project`、`providers`、`prompts`、`server`、`store`、`tool_prompts`，以及 `APP_VERSION`。`__version__` 继续作为兼容属性导出，但不列入 `__all__`。

保留模块仍位于 `app/novelhelper/` 根目录，直接按模块名导入。重构前冻结的公开符号、签名和兼容调用清单见[公共 API 基线](../restructure/public-api-baseline.md)；该基线用于迁移前后核对，不代替具体模块的当前源码契约。

## 保留模块接口

`novelhelper.history.title_from_prompt(prompt, mode)` 是新增的公开模块级接口，用于根据提示词和模式生成会话标题。它是原 `_title_from_prompt` 的别名，签名和标题规则不变；`history` 是保留模块而非包入口，没有模块级 `__all__`，因此该符号以公开名称提供并在此记录。

`novelhelper.tool_prompts` 提供仍在使用的内置工具提示词与调用参数：`prompt(tool)` 按工具名返回系统提示词（`summarize`、`compress`、`restyle`、`fix`），`settings(config, override)` 组装模型调用参数。它由 `server/_generation.py` 的 `/api/ai/run` 使用，取代原先依赖 `prompts.TOOL_PROMPTS` 的路径。

提示词正式内容放在翻译表 `defaults.tool.*_prompt`（`zh-CN.yml` / `en-US.yml`），`prompt()` 按当前语言取词，缺词时回退模块内的中文常量，与 `prompts.default_modes()` 的做法一致；请求语言由 `server/_base.py` 的 `language_context` 提供。旧版命令行工具 `app/tools/` 已移除，仅为它存在的 `ai.tool_settings`、`ai.chat`、`context.assemble`、`prompts.default_prompts` 等兼容符号一并删除。

## 兼容边界

- `history._title_from_prompt` 保留为模块内部实现；`server` 生产代码已改用公开的 `history.title_from_prompt`。
- `store._migrate_mode_kinds` 由既有 `app/selftest.py` 兼容调用；此符号不在 `store.__all__` 中。
- `server.ai` 为兼容属性，不在 `server.__all__` 中。

新增或变更包级公共符号时，应同步更新所属包的 `__all__`；独立保留模块的公开符号应在本索引和对应 API 说明中记录，并解释兼容影响。
