# 本地化验证记录

日期：2026-10-24（Asia/Shanghai）。范围：v2610.2 任务 2、任务 3.1；任务 3.2 的语言选择/设置切换/持久化尚未实现。

## 实现清单

- [x] 独立 localization 包，配置加载、后端取词、插值、回退、warning、语言切换、请求语言隔离。
- [x] 757 个中英对齐 key，JSON 语言清单，safe_load、UTF-8 与开发/冻结资源路径。
- [x] GET /api/i18n 和 GET /api/i18n/<lang>；前端 register/t/apply/load、初始化顺序、最小示例。
- [x] HTML 静态、六个 JS 文件的动态界面以及 Python 用户可见错误迁移。
- [x] 整句占位符、重复 key 冲突修复、初稿多项条目展开；完整盘点与残留豁免复核。
- [x] 默认提示词说明；提供商 UI 翻译与生成提示词隔离；存储数据、导出格式与原 URL 保持。
- [x] 运行依赖和 PyInstaller 资源配置，安装检查、EXE 冒烟扩充。
- [x] 接口文档、本地化 SOP 与变更记录。

## 自动化检查

| 检查 | 结果 | 覆盖 |
|---|---|---|
| `python scripts/test_localization.py` | 15 项通过 | 正常取词、插值、缺参、缺失语言/key、warning、切换、配置错误、缺文件/坏 YAML、key/占位符校验、JSON 花括号、新语言零改码、并发上下文、冻结路径、引用与参数、提供商提示词不变 |
| `node scripts/test_i18n.cjs` | 通过 | 注册/合并、覆盖、缺失 key、插值安全、静态节点、动态容器自身、属性绑定、版本参数 |
| `python scripts/smoke_test.py` | 通过 | 原服务/API/配置往返 + 语言配置、中英/未知语言回退、i18n 脚本和示例页、并发中英错误与默认语言隔离 |
| `python app/selftest.py` | 69 项通过，0 失败 | 原业务流程，包括生成模拟、历史、导入/导出、稿件、日志 |
| `python scripts/check_dependencies.py` | 通过 | 无循环依赖、无跨包私有导入、导入顺序与兼容入口 |
| `node --check`（六个业务 JS 及 i18n 脚本） | 通过 | 语法检查 |
| `git diff --check` | 通过 | 空白检查 |

原自检的一项静态资源断言从查找硬编码中文改为查找相应 i18n key，没有降低业务检查范围。

## 浏览器检查

环境：Windows 11，Playwright + 已安装的 Microsoft Edge，无头模式；Browser plugin not available，因此使用普通 Playwright。URL：`http://127.0.0.1:8878/?lang=en-US` / `?lang=zh-CN`，使用临时 NOVELHELPER_HOME，没有读写真实创作数据。

验证流程：打开应用 → 导航到关键页面 → 打开/取消动态弹窗 → 创建测试记录 → 触发无 API Key 错误 → 检查译文与数据默认值。

| 检查 | 结果 |
|---|---|
| 页面身份、标题、html lang | 中英正确 |
| 非空/错误覆盖层 | 15 个页面 × 2 种语言均有正确页面标题和实际内容，无错误覆盖层 |
| 页面范围 | 工作站、设置、稿件、章节、人物、背包、地图、道具、装备、势力、其他、记忆、元素、栏目、模式 |
| 未替换占位符 | 关键动态参数无泄漏 |
| Console/pageerror | 无意外 JS 异常；人为触发缺 API Key 时的 HTTP 502 为预期错误路径 |
| 实际点击 | 侧栏导航、查找替换弹窗、地图改名/取消、新建人物、获取模型错误提示均正常 |
| 默认数据保护 | 英文界面新建人物的默认名称仍为“未命名” |
| 静态/动态 apply | 示例页静态 Save 和后插入的 Cancel 均正确显示 |
| 桌面排版 1440×1000 | 设置/工作站/稿件/模式关键页面未见译文截断或按钮错位 |
| 窄屏 390×844 | 有限制：原有固定 226px 侧栏使主内容过窄，英文卡片溢出；未在本任务中重做移动布局 |

自定义栏目名、模式名称/描述、示例和用户数据保留中文属于记录的豁免。此前生成的 10 张截图已按用户要求删除，本文件保留文字验证结果。

## 打包检查

干净虚拟环境，Python 3.14.4、PyInstaller 6.22.3、PyYAML 6.0.3，并安装 app/requirements.txt 的依赖。

```powershell
python -m venv "$env:TEMP/nh-i18n-build"
& "$env:TEMP/nh-i18n-build/Scripts/python.exe" -m pip install -r requirements-build.txt -r app/requirements.txt
& "$env:TEMP/nh-i18n-build/Scripts/python.exe" -m PyInstaller --noconfirm NovelHelper.spec
python scripts/exe_smoke_test.py dist/NovelHelper.exe
```

- [x] 单文件 EXE 构建成功。
- [x] EXE `--check` 校验语言表与前端运行时。
- [x] 两次启动均能访问中英语言表、语言配置、i18n/引导/示例静态资源。
- [x] 本地 mock 模型生成成功，配置与历史写入 EXE 所在临时目录，重启后保留。

首次直接在全局 Python 环境构建，因环境中无关 SciPy 包的 PyInstaller hook 报错失败；独立环境构建和运行已通过，无需改变项目功能来规避。

## 验收边界与待办

任务 2 与 3.1 的开发和桌面自测完成。需求“完成定义”中的 PR review、负责人英文终审、合并仍待人工流程，本次没有创建/合并 PR，不将其标为已完成。验收结果仅在本文记录；需求文件保持原文，不由实现者修改验收勾选。

任务 3.1 的英文排版验收限定上述桌面视口；390px 移动布局限制已如实记录，不能据桌面验证结果声称所有视口通过。

首次语言选择、设置页切换及持久化按原需求留给任务 3.2。本次 `?lang=` 为非持久化预览入口，后端语言列表与取词接口可供下一任务复用。

---

# 任务 3.2 验证记录

日期：2026-10-24。范围：语言持久化、首次语言选择、设置页语言切换与 K2 损坏配置恢复。分支 `dev/v2610.2_language_persistence`。

## 自动化检查

| 检查 | 结果 | 覆盖 |
|---|---|---|
| `python scripts/test_language_settings.py` | 11 项通过 | 首次判定、保存/落盘、未知语言回退、损坏配置备份与恢复、非对象配置、启动应用、请求上下文隔离、HTTP 切换端点与 first_run 标记、空语言 400 |
| `python scripts/smoke_test.py` | 通过 | 原有 15 项 + 首次标记、切换立即生效、空值拒绝、重启后语言保留 |
| `python scripts/test_localization.py` | 15 项通过 | 原有取词/回退/校验基线（新增 6 个 key 后中英集合一致） |
| `node scripts/test_i18n.cjs` | 通过 | 前端运行时基线 |
| `python app/selftest.py` | 69 项通过 | 原有业务基线；注意：环境存在 DEEPSEEK_API_KEY 时 3 项"无 Key 报错"断言失败，属既有环境依赖，与本任务无关 |
| `python -X utf8 -B scripts/check_dependencies.py` | 通过 | 新增 `server/_language.py` 仅依赖 store 与 localization 公共 API，无循环依赖 |
| `git diff --check`、`node --check`（config.js / bootstrap.js / i18n.js） | 通过 | 空白与语法检查 |

## 手工检查清单（截图 / 录屏记录）

以下场景由负责人以浏览器人工验证并附截图/录屏（需求 6.4、6.5）：

1. 清空数据目录后首次进入：弹出语言选择，列表来自 `languages.json`（简体中文 / English）；
2. 点击 English：立即以英文重新渲染并写入 `config.language`，无需二次确认；
3. 重启应用：界面保持英文，不再弹出首次选择；
4. 清空配置后选择简体中文：界面为中文，首次弹层不再出现；
5. 「模型设置 → 应用」语言下拉：切换到另一语言后页面刷新并立即生效；
6. 进行中的生成任务期间切换语言：任务不受影响（请求语言已固定）；
7. 损坏 `config.json`（写入非法 JSON）后启动：日志出现备份记录，目录出现 `config.json.bak-*`，页面按首次进入处理；
8. `?lang=zh-CN` 预览参数：不触发首次弹层、不写配置。

## 验收边界

- 英文终审与 PR review 仍待人工流程；需求文件勾选由负责人执行。
- 录屏/截图由负责人制作并归档，本文档仅保留文字验证记录。
- 已知边界（沿用任务 3.1 判定）：存储数据默认值、栏目名、模式名、地图坐标与导出格式保留原文，见 [i18n-inventory.md](i18n-inventory.md) 豁免清单。
