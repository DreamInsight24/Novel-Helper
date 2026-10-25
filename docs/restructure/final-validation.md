# v2610.2 P4 最终验收记录

| 项 | 结果 |
|---|---|
| 验收日期 | 2026-10-23 |
| 阶段 | P4 根入口与验收收尾 |
| 分支 | `dev/v2610.2_version` |
| 验证基线 | `release/v2610.2-dev` |

## 已通过

| 检查 | 命令/范围 | 结果 |
|---|---|---|
| 既有回归自检 | `python -B app/selftest.py` | 69 项通过，0 项失败；新增历史标题公开别名回归断言 |
| HTTP 冒烟 | `python -B scripts/smoke_test.py` | 15 项通过 |
| 静态依赖与隔离导入 | `python -X utf8 -B scripts/check_dependencies.py` | 扫描 35 个 `novelhelper` 模块、117 条项目内依赖边及 4 处函数体内导入；未发现依赖环或跨包私有模块导入。两种关键模块顺序均在独立进程通过；服务端历史标题调用已使用公开别名 |
| 前端未变 | `git diff --name-only release/v2610.2-dev...HEAD -- app/novelhelper/web` | 无输出；前端目录相对基线无提交差异 |
| 公共 API 与文档导航 | `docs/api/README.md` 及 `docs/api/{store,project,server}.md` | 已建立索引；三个包文档均为中文，并注明 `server.ai` 兼容属性；索引记录 `history.title_from_prompt` 公开别名及 `store._migrate_mode_kinds` 兼容出口 |
| PyInstaller 构建 | `python -m PyInstaller --clean --noconfirm --distpath <临时目录>\dist --workpath <临时目录>\work NovelHelper.spec` | PyInstaller 6.22.3 / Python 3.12.14 / Windows 11；成功生成 9,802,105 字节的单文件 `NovelHelper.exe` |
| EXE 隔离运行 | `python -X utf8 -B scripts/exe_smoke_test.py <NovelHelper.exe 路径>` | 17 项通过：安装资源、首页/静态资源/API、本地假模型生成、数据写在 EXE 旁的 `data/`，并在进程重启后保留配置、历史索引和会话正文。全程未连接真实模型服务 |

本轮源码回归和打包使用 Codex 工作区提供的 Python 3.12.14；团队环境可使用 PATH 中的 Python 执行表内命令。

## R3 与兼容决策

| 检查/决策 | 状态 | 说明 |
|---|---|---|
| R3 历史标题边界 | 按计划完成 | `history.title_from_prompt` 是 `_title_from_prompt` 的公开别名；`server/_generation.py` 已改用公开名称，原实现及签名、算法不变。 |
| 自检迁移兼容 | 按计划默认方案保留 | `store._migrate_mode_kinds` 继续由 `store` 兼容导出，仅供 `app/selftest.py` 调用，不列入 `store.__all__`；未改动既有调用方式。 |

依赖脚本检查的是跨包导入私有模块，不会将函数属性调用误报为模块导入；R3 的函数级边界另由源码及 API 记录核对。

## B/C 技术交接

- A 未新增语言配置字段、语言切换端点或前端行为。现有配置仍由 `store.load("config")`、`store.save("config", config)` 读写，HTTP 集合接口保持原行为；文件位置、空白文件和非法 JSON 处理见 `docs/architecture.md` 第 2 节。
- B 在现有配置基础上实现本地化字段与 K2 损坏恢复，不另建独立语言配置文件；不得把当前非法 JSON 的 `RuntimeError` 误认为已具备自动恢复。
- C 在 B 确认并提供语言切换契约后接入界面，不应提前依赖未实现的 `/api/settings/language`。

## 阶段结论

迁移计划共五批：P0、P1、P2、P3、P4。P0–P4 已完成，包含 R3 历史标题公共别名适配、源码回归、EXE 构建与隔离运行、文档索引和交接记录。计划没有 P5。
