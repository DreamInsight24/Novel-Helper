# 文档规范

本目录用于存放 Novel-Helper 的项目文档。本文档约定文档的目录结构、命名规则、生命周期与维护要求，新增或修改文档前请先阅读。

## 1. 目录结构

```
docs/
  README.md                    # 本文档：文档规范
  architecture.md              # 包结构、边界、豁免清单、迁移记录
  localization.md              # 本地化规范：key、yml、回退策略、新增语言 SOP
  requirements/
    v2610.2.md                 # 版本需求归档，一个版本一个文件
  api/
    <package>.md               # 各软件包接口文档，与 __all__/docstring 一致
  i18n-inventory.md            # 界面文案盘点清单
  restructure/                 # v2610.2 结构迁移基线与路径映射
CHANGELOG.md                   # 仓库根目录，版本变更日志
scripts/
  smoke_test.py                # 最小冒烟回归脚本
```

目录职责：

| 路径 | 职责 | 是否长期维护 |
|---|---|---|
| `docs/README.md` | 文档规范本身 | 是 |
| `docs/architecture.md` | 代码结构、包边界、行为不变约束、迁移记录 | 是 |
| `docs/localization.md` | 本地化规范与接口用法 | 是 |
| `docs/requirements/` | 各版本需求归档，只增不改 | 否，归档后冻结 |
| `docs/api/` | 各包公共接口说明 | 是，随代码更新 |
| `docs/i18n-inventory.md` | 界面文案盘点 | 是，文案变动时更新 |
| `docs/restructure/` | 结构迁移前的符号基线、粒度复核、迁移映射和历史追踪抽查 | v2610.2 重构期间维护；后续架构以 `architecture.md` 为准 |
| `CHANGELOG.md` | 面向用户与贡献者的版本变更 | 是 |
| `scripts/smoke_test.py` | 冒烟回归，作为合并前基线 | 是 |

## 2. 命名规则

- 文件名一律小写，单词间用连字符：`i18n-inventory.md`、`smoke-test`。
- 需求文档按版本命名：`v<主版本><年份><序号>.md`，与分支/发布版本号一致，例如 `v2610.2.md`。
- 接口文档与软件包同名：`docs/api/store.md` 对应 `app/novelhelper/store/`。
- 项目 API 文档：`docs/api/project.md` 对应 `app/novelhelper/project/`。
- 服务端 API 文档：`docs/api/server.md` 对应 `app/novelhelper/server/`。
- 文档标题与文件名语义一致，避免“杂项”“其他”“temp”这类命名。
- 不使用个人化或团队内部缩写命名（如 `requirements2gm`），文档面向所有贡献者。

## 3. 各类文档的生命周期

**长期文档**（`README.md`、`architecture.md`、`localization.md`、`api/`、`i18n-inventory.md`）
随代码演进持续更新，内容过期即为缺陷。修改相关代码的 PR 必须同步更新对应文档，否则不予合并。

**版本归档文档**（`requirements/v*.md`）
记录某一版本的目标、范围、验收标准与决策。发布后冻结，不再修改；后续变更写入新版本的需求文档，并在 `CHANGELOG.md` 中体现。

**变更日志**（`CHANGELOG.md`）
持续维护，规则见第 6 节。

**过程性内容**（人员分工、内部排期、沟通渠道、一次性提示词）
不入库。放在团队沟通渠道或 Issue 中，避免过期信息污染仓库。

## 4. 内容要求

- 接口文档必须包含：函数/方法签名、参数、返回值、异常与回退行为、最小示例。内容与代码中 `__all__` 及 docstring 保持一致，优先由工具生成而非手写。
- 规范类文档（`architecture.md`、`localization.md`）必须写清“约束”与“禁止事项”，而不只是描述现状，便于 review 与 AI Agent 遵循。
- 涉及决策的文档需保留决策记录，写清结论与理由，避免同一问题被反复讨论。
- 文档中的路径、命令、配置项必须可直接使用，不写伪代码占位。
- 图表优先使用文本形式（目录树、表格），避免依赖外部图片链接。

## 5. 评审与合并

- 文档随代码在同一 PR 中提交，作为交付物的一部分参与 review，不接受“事后补文档”。
- 涉及结构、接口、本地化规范的文档变更，需由项目负责人 review。
- 纯文档 PR 同样走分支与 PR 流程，合并策略与代码一致。
- 文档中引用的代码路径、函数名在 review 时需抽查是否真实存在。

## 6. CHANGELOG 维护规则

- 采用 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，版本号遵循语义化版本。
- 固定分类：`Added`、`Changed`、`Deprecated`、`Removed`、`Fixed`、`Security`，无内容的分类可省略。
- 开发期间条目写入 `Unreleased`，发布时移动到对应版本号下并标注日期。
- 条目面向使用者描述影响，不罗列内部重构细节；纯内部重构可归入 `Changed` 并简述。
- 每个影响用户行为的 PR 都应追加条目，由 PR 作者负责。

## 7. 过期与归档

- 版本需求文档发布后不再修改；如需修正，在新版本文档中说明并引用旧文档。
- 长期文档中失效的内容直接删除或改写，不保留“历史版本”段落；历史由 git 记录。
- 文档中引用的外部链接或工具若已失效，应及时替换或移除。
- 每年或在每个大版本发布时，检查一次 `docs/` 下文档的有效性，清理不再适用的内容。
