# i18n 界面文案盘点清单（迁移完成版）

| 项 | 内容 |
|---|---|
| 采集基线 | `release/v2610.2-dev` @ `8eb8e7d`（2026-10-23） |
| 采集方法 | 全量扫描 `app/novelhelper/` 下 `.py` / `.js` / `.html` / `.css` 中含汉字的行，逐条人工分类 |
| 状态 | 2026-10-24：代码迁移与自测完成；英文已做实现侧审校，负责人终审待完成 |
| 后续 | 2026-10-25：新增「初始化预设本地化」——首次启动所选语言会决定内置默认数据与提供商接口说明的语言，之后切换语言不改写，见第 8 节 |
| 用途 | 任务 3.1 迁移的逐项勾选底表；任务 2 翻译表（`zh-CN.yml` / `en-US.yml`）的 key 与英文初稿来源 |

## 1. 范围与判定规则

- **要翻译（本表明细）**：Python 与前端所有用户可见界面文案——按钮、菜单、标题、说明、提示、弹窗、通知、接口返回消息、面向用户的错误提示。
- **不翻译（第 2 节豁免清单）**：日志、异常堆栈、调试信息、默认提示词、代码注释/docstring、数据默认值、导出/存储数据格式关键字（D8、5.3.2、非目标"不改变存储格式"）。
- **边界项（第 4 节）**：同时属于"用户可见"与"数据/提示词/导出格式"的条目，本次按第 4 节决定实施。
- **key 规范**（[本地化规范](../localization.md) 第 4 节）：小写字母数字下划线，层级用 `.`，按页面/功能分组；同一含义全项目复用同一 key；动态内容整句翻译 + `{placeholder}`，禁止拼接句子片段。
- **行号说明**：行号为采集基线下的一次出现位置；同一文件内相同原文合并行号。任务 2 为 `index.html` 引入 `i18n.js` 后行号会偏移，迁移时以实际代码为准。
- 明细表中 `译` 列取值：`是`=翻译，`待定`=见第 4 节对应编号。

## 2. 豁免清单（不翻译）

| 位置 | 内容 | 理由 |
|---|---|---|
| `app/novelhelper/prompts.py`（工作模式部分） | 默认模式的系统提示词 | 已改为中英双语 key→val（`defaults.mode.*_prompt`），并移除原有 Markdown 标记 |
| `app/novelhelper/tool_prompts.py` | 内置工具的兼容提示词（记忆压缩等） | 已改为翻译表 key→val（`defaults.tool.*_prompt`），按当前语言取词；本文件的常量是中文原文，仅在翻译表缺词时兜底。命令行工具已移除，网页端仍在使用的功能由本模块承接 |
| `app/novelhelper/context.py` 大部分 | 提示词组装区块（`## 人物档案`、`## 当前状态` 等）及渲染进模型文本的标签 | 模型上下文，非界面 |
| `app/novelhelper/ai.py:260` | `你是连通性测试助手，只回复 OK。` | 测试提示词 |
| `server/_generation.py:27` | `（章节：{chapter}）` | 提示词片段 |
| `providers.py:155-157` | `【接口】当前使用 …` 提示词组装文本 | 提示词组装（同文件 `prompt_note` 见第 4 节 Q1） |
| `store/_defaults.py`（全文） | 内置元素模板、默认记录名、分类、schema 栏目（`人物档案`/`外貌`/`新角色`/`短期记忆`…） | 内置默认数据，随数据文件存储；翻译会改变数据内容 |
| `store/_bootstrap.py`、`_directories.py`、`_paths.py`、`_collections.py`、`_backup.py` | docstring / 注释 | 代码注释 |
| `project/_exports.py` 导出键（`行`/`列`/`格`/`简述`/`分类`/`部位`/`背包`/`穿戴`/`已拥有`/`成员`/`备注`/`内容`…） | 导出 JSON 的数据格式键 | 非目标：不改变存储与导出格式 |
| `project/_text.py` 文件头关键字（`# 小说创作输出`/`写作前逻辑推理与剧情梗概`/`写作建议`/`正文`…） | 输出文件解析关键字 | 改动会破坏既有文件解析 |
| `project/_outputs.py` 导出文件头 | 导出文件内容格式 | 见第 4 节 Q4 |
| `project/_parsers.py`（`短期记忆`/`方位`/`世界地图`） | 解析关键字与数据默认 | 解析逻辑/数据 |
| `elements.py`（全文） | docstring / 注释 + 导出默认 key `未命名` | 注释与数据默认 |
| `app.py`（全文） | 控制台输出与 argparse 帮助 | D8：日志与调试信息 |
| `logger.py` | 日志文本 | D8 |
| `server/_state.py`、`server/_records.py` 等注释 | 注释 | 代码注释 |
| `web/*.js`、`style.css` 全部注释（style.css 23 行全为注释） | 代码注释 | 代码注释 |
| 各数据默认写入值（`未命名`/`新角色`/`新道具`/`新记忆`/`短期记忆`/`长期记忆`/`重要伏笔`/`设定备忘`/`道具`/`服饰`/`上衣`/`北`/`中`/`南`/`西`/`东`/`来自{来源}`…） | 写入 `data/*.json` 的默认数据 | 数据默认值，随数据存储 |
| `history.py:257` `未命名` | 历史指针解析的兜底名称 | 数据渲染兜底 |
| `setting_gen.py` 的 `SYSTEM_PROMPT` / `REPAIR_PROMPT` / `BUILTIN_LABELS` / `BUILTIN_HINTS` | AI 设定生成的隐藏系统提示词与内置栏目名/用途 | 需求 6.5：AI 系统提示词不进入翻译表、不通过接口暴露；内置栏目名/用途只进入发往模型的目录，不出现在界面 |

## 3. 盘点明细

### 3.1 `app/novelhelper/web/index.html`

| 行号 | 原文 | key | 英文初稿 | 译 |
|---|---|---|---|---|
| 6 | `NovelHelper · AI 小说工作站` | `common.doc_title` | `NovelHelper · AI Fiction Writing Studio` | [x] 已迁移 |
| 14 | `本地优先的小说创作工具 · v2610.1` | `common.tagline` | `A local-first novel writing tool · {version}` | [x] 已迁移 |
| 15 | `DEBUG 模式` | `common.debug_badge` | `DEBUG mode` | [x] 已迁移 |
| 19 | `就绪` | `common.ready` | `Ready` | [x] 已迁移 |
| 20 | `数据保存在 app/data/；产出与导入导出在 app/workspace/` | `common.side_note` | `Data is stored in app/data/; output and import/export live in app/workspace/` | [x] 已迁移 |

### 3.2 `app/novelhelper/web/core.js`

| 行号 | 原文 | key | 英文初稿 | 译 |
|---|---|---|---|---|
| 61 | `返回内容无法解析` | `errors.parse_failed` | `Unable to parse response` | [x] 已迁移 |
| 177,189,203 | `取消` | `common.cancel` | `Cancel` | [x] 已迁移 |
| 178,190 | `确定` | `common.confirm` | `OK` | [x] 已迁移 |
| 188 | `名称` | `common.name` | `Name` | [x] 已迁移 |
| 270,506 | `条目` | `collections.singular_entry` | `Entry` | [x] 已迁移 |
| 271 | `自定义设定栏目（可在「自定义栏目」页增删改名）` | `sections.default_desc` | `Custom setting section (can be added, removed, or renamed on the Custom Sections page)` | [x] 已迁移 |
| 272,508 | `备注` | `common.note` | `Note` | [x] 已迁移 |
| 272,508 | `字段说明` | `common.field_notes` | `Field description` | [x] 已迁移 |
| 277 | `（缺失）` | `common.missing` | `(Missing)` | [x] 已迁移 |
| 278,354,753,290,300,432 | `未命名` | `common.unnamed` | `Unnamed` | [x] 已迁移 |
| 330 | `保存中…` | `common.saving` | `Saving…` | [x] 已迁移 |
| 335,346 | `已保存 {time}` | `common.saved_at` | `Saved {time}` | [x] 已迁移 |
| 337,86 | `保存失败` | `common.save_failed` | `Save failed` | [x] 已迁移 |
| 338,747,867 | `保存失败：{reason}` | `common.save_failed_reason` | `Save failed: {reason}` | [x] 已迁移 |
| 366 | `已追加到稿件处理工作区。` | `common.appended_to_workspace` | `Appended to the manuscript workspace.` | [x] 已迁移 |
| 392 | `写作` | `nav.group_writing` | `Writing` | [x] 已迁移 |
| 393 | `AI 工作站` | `nav.writer` | `AI Workstation` | [x] 已迁移 |
| 394 | `章节与导出` | `nav.chapters` | `Chapters & Export` | [x] 已迁移 |
| 395 | `稿件处理` | `nav.text` | `Manuscript` | [x] 已迁移 |
| 396 | `基础设定` | `nav.group_core` | `Core Settings` | [x] 已迁移 |
| 397,485 | `人物档案` | `nav.characters` | `Characters` | [x] 已迁移 |
| 398 | `人物背包` | `nav.inventory` | `Inventory` | [x] 已迁移 |
| 399 | `世界地图` | `nav.worldmap` | `World Map` | [x] 已迁移 |
| 400 | `道具设定` | `nav.items` | `Items` | [x] 已迁移 |
| 401 | `服饰与装备` | `nav.equipment` | `Outfits & Equipment` | [x] 已迁移 |
| 402 | `自定义设定` | `nav.group_custom` | `Custom Settings` | [x] 已迁移 |
| 403,491 | `势力设定` | `nav.factions` | `Factions` | [x] 已迁移 |
| 405,506 | `其他设定` | `nav.other` | `Other Settings` | [x] 已迁移 |
| 406 | `记忆` | `nav.group_memory` | `Memory` | [x] 已迁移 |
| 407 | `记忆库` | `nav.memories` | `Memories` | [x] 已迁移 |
| 408 | `系统` | `nav.group_system` | `System` | [x] 已迁移 |
| 409 | `元素模板` | `nav.elements` | `Element Templates` | [x] 已迁移 |
| 410 | `自定义栏目` | `nav.sections` | `Custom Sections` | [x] 已迁移 |
| 411 | `模式管理` | `nav.modes` | `Mode Management` | [x] 已迁移 |
| 412 | `模型设置` | `nav.settings` | `Model Settings` | [x] 已迁移 |
| 460 | `DEBUG 模式 · 当前数据、输出与日志与正式版本隔离` | `common.debug_banner` | `DEBUG mode · data, output, and logs are isolated from the release build` | [x] 已迁移 |
| 469 | `未知页面` | `common.unknown_page` | `Unknown page` | [x] 已迁移 |
| 485 | `人物` | `collections.singular_character` | `Character` | [x] 已迁移 |
| 486 | `多维设定按「元素树」组织：外貌、性格、能力……都能继续往下分子集。背包与穿戴在「人物背包」页编辑。` | `collections.characters.desc` | `Multidimensional settings are organized as an "element tree": appearance, personality, abilities… can each be broken down further. Inventory and worn items are edited on the Inventory page.` | [x] 已迁移 |
| 487 | `身份备注（括号内容）` | `collections.characters.tag_label` | `Identity note (text in parentheses)` | [x] 已迁移 |
| 487,493,498,503,543 | `补充说明` | `collections.notes` | `Additional notes` | [x] 已迁移 |
| 491 | `势力` | `collections.singular_faction` | `Faction` | [x] 已迁移 |
| 492 | `组织 / 家族 / 阵营；成员直接指针到人物档案。` | `collections.factions.desc` | `Organizations / families / camps; members point directly to Characters.` | [x] 已迁移 |
| 493 | `类型备注` | `collections.factions.tag_label` | `Type note` | [x] 已迁移 |
| 496 | `道具` | `collections.singular_item` | `Item` | [x] 已迁移 |
| 497 | `能放进背包的东西；不单独发送，只在人物背包里被引用时作为那条的解释发送。` | `collections.items.desc` | `Things that can go into the inventory; not sent on their own — only included as explanation when referenced in a character's inventory.` | [x] 已迁移 |
| 498,503 | `别称` | `collections.alias` | `Alias` | [x] 已迁移 |
| 501 | `服饰 / 装备` | `collections.singular_equipment` | `Outfit / Equipment` | [x] 已迁移 |
| 502 | `基于道具的穿戴物；不单独发送，只在人物背包里被引用时作为那条的解释发送。` | `collections.equipment.desc` | `Wearables based on items; not sent on their own — only included as explanation when referenced in a character's inventory.` | [x] 已迁移 |
| 507 | `世界观、物种、规则都放这里；没有专门栏目的设定也放这里，随时可以搬到别的类别。` | `collections.other.desc` | `Worldbuilding, species, and rules go here; anything without a dedicated section can live here and be moved elsewhere anytime.` | [x] 已迁移 |
| 533 | `NovelHelper [DEBUG] · AI 小说工作站` | `common.doc_title_debug` | `NovelHelper [DEBUG] · AI Fiction Writing Studio` | [x] 已迁移 |
| 534 | `NovelHelper · AI 小说工作站` | `common.doc_title` | `NovelHelper · AI Fiction Writing Studio` | [x] 已迁移 |

### 3.3 `app/novelhelper/web/config.js`

| 行号 | 原文 | key | 英文初稿 | 译 |
|---|---|---|---|---|
| 8,739 | `人物档案` | `nav.characters` | `Characters` | [x] 已迁移 |
| 9,740 | `势力设定` | `nav.factions` | `Factions` | [x] 已迁移 |
| 10,739 | `道具设定` | `nav.items` | `Items` | [x] 已迁移 |
| 11,740 | `服饰与装备` | `nav.equipment` | `Outfits & Equipment` | [x] 已迁移 |
| 12,740 | `其他设定` | `nav.other` | `Other Settings` | [x] 已迁移 |
| 18 | `（已停用）` | `common.disabled_suffix` | ` (disabled)` | [x] 已迁移 |
| 28 | `元素模板` | `nav.elements` | `Element Templates` | [x] 已迁移 |
| 29-30 | `定义每类设定「默认包含哪些元素」。新建条目时会按模板生成；已有条目可以点「套用模板补齐」。取消勾选表示默认不需要这个元素，导出与发送时会忽略。` | `elements.page_desc` | `Define which elements each setting type contains by default. New entries are created from the template; existing entries can be completed with "Apply Template". Unchecking means the element is not needed by default and is ignored on export and send.` | [x] 已迁移 |
| 33 | `应用到全部记录` | `elements.apply_to_all` | `Apply to all records` | [x] 已迁移 |
| 37 | `该集合还没有记录。` | `elements.no_records` | `This collection has no records yet.` | [x] 已迁移 |
| 38 | `给「{collection}」的 {count} 条记录补齐模板元素？（不覆盖已填内容）` | `elements.apply_confirm` | `Complete {count} records in "{collection}" with template elements? (Existing content is not overwritten)` | [x] 已迁移 |
| 42 | `共补充 {count} 个元素` | `elements.applied_count` | `Added {count} elements in total` | [x] 已迁移 |
| 46 | `导出模板 JSON` | `elements.export_json` | `Export template JSON` | [x] 已迁移 |
| 55,702,711 | `已导出：{path}` | `common.exported_to` | `Exported: {path}` | [x] 已迁移 |
| 56,703,712 | `导出失败：{reason}` | `common.export_failed_reason` | `Export failed: {reason}` | [x] 已迁移 |
| 62 | `编辑哪个集合的模板` | `elements.edit_which` | `Edit template for which collection` | [x] 已迁移 |
| 69 | `提示：在名称末尾加 / 可以建立「分组」，分组可以继续往下分（子集的子集）。` | `elements.group_hint` | `Tip: append / to a name to create a "group"; groups can nest further (subsets of subsets).` | [x] 已迁移 |
| 77 | `元素是怎么影响输出与 JSON 的` | `elements.help_title` | `How elements affect output and JSON` | [x] 已迁移 |
| 79 | `勾选的元素 + 有内容的元素 → 才会出现在**发送给模型**的提示词和**导出的 JSON / TXT**里。` | `elements.help_1` | `Checked elements + elements with content → appear in the prompt sent to the model and in the exported JSON / TXT.` | [x] 已迁移 |
| 80 | `取消勾选（或留空）的元素不会出现，导出的 JSON 里不会有这个键，也不会留下空行。` | `elements.help_2` | `Unchecked (or empty) elements do not appear; the exported JSON won't contain the key, and no blank lines are left.` | [x] 已迁移 |
| 81 | `元素名称随便改：改成「外貌」「战斗能力」都行，改动只影响之后导出与发送的标题。` | `elements.help_3` | `Element names can be renamed freely: "Appearance", "Combat ability", whatever — changes only affect future export and send headings.` | [x] 已迁移 |
| 82 | `想让所有人物都自带某组元素：在这里加好，然后点「应用到全部记录」。` | `elements.help_4` | `To give all characters a set of elements: add them here, then click "Apply to all records".` | [x] 已迁移 |
| 98 | `自定义栏目` | `nav.sections` | `Custom Sections` | [x] 已迁移 |
| 99 | `把设定拆成若干栏目（世界观、物种、魔法与技能……）。新增栏目会在侧栏多一个页面，并在 data/ 下生成独立 JSON。` | `sections.page_desc` | `Split settings into sections (worldbuilding, species, magic & skills…). New sections add a page in the sidebar and their own JSON under data/.` | [x] 已迁移 |
| 102 | `＋ 新增栏目` | `sections.add` | `+ New Section` | [x] 已迁移 |
| 104 | `栏目名称（例如：政治格局 / 军事 / 民俗）` | `sections.name_prompt` | `Section name (e.g., politics / military / folklore)` | [x] 已迁移 |
| 106 | `英文 key（用于文件名，字母数字下划线，例如 politics）` | `sections.key_prompt` | `English key (used for the filename; letters, digits, underscores; e.g. politics)` | [x] 已迁移 |
| 109 | `key 不合法，已自动用 {key}` | `sections.key_invalid` | `Invalid key; auto-using {key}` | [x] 已迁移 |
| 111 | `这个 key 已经存在。` | `sections.key_exists` | `This key already exists.` | [x] 已迁移 |
| 117 | `按分类一键归类` | `sections.auto_sort` | `Auto-sort by category` | [x] 已迁移 |
| 118 | `把「其他设定」里的内容按下面的「归类依据」搬进对应栏目` | `sections.auto_sort_title` | `Move content from "Other Settings" into matching sections based on the "Sorting rules" below` | [x] 已迁移 |
| 121 | `归类中…` | `common.sorting` | `Sorting…` | [x] 已迁移 |
| 127 | `归类失败：{reason}` | `sections.sort_failed_reason` | `Sorting failed: {reason}` | [x] 已迁移 |
| 133 | `栏目列表` | `sections.list_title` | `Section list` | [x] 已迁移 |
| 133 | `取消勾选＝暂时隐藏（数据不删）` | `sections.hide_hint` | `Uncheck to hide temporarily (data is not deleted)` | [x] 已迁移 |
| 134 | `（还没有栏目）` | `sections.empty` | `(No sections yet)` | [x] 已迁移 |
| 144 | `启用` | `sections.enable` | `Enable` | [x] 已迁移 |
| 146 | `栏目名称` | `sections.name_placeholder` | `Section name` | [x] 已迁移 |
| 147 | `key: {key} · {count} 条` | `sections.key_count` | `key: {key} · {count} entries` | [x] 已迁移 |
| 149 | `一句话说明（显示在页面标题下）` | `sections.desc_label` | `One-line description (shown under the page title)` | [x] 已迁移 |
| 151 | `归类依据（「其他设定」里出现的「原分类」名，用逗号分隔）` | `sections.auto_from_label` | `Sorting rules (original category names from "Other Settings", comma-separated)` | [x] 已迁移 |
| 157,470 | `上移` | `common.move_up` | `Move up` | [x] 已迁移 |
| 158,477 | `下移` | `common.move_down` | `Move down` | [x] 已迁移 |
| 160 | `打开这一栏` | `sections.open` | `Open this section` | [x] 已迁移 |
| 163 | `删除栏目` | `sections.delete` | `Delete Section` | [x] 已迁移 |
| 165 | `删除栏目「{label}」？\n界面上的入口会消失，data/section_{key}.json 会留在磁盘上（不会删文件）。` | `sections.delete_confirm` | `Delete section "{label}"?\nThe sidebar entry will disappear; data/section_{key}.json stays on disk (the file is not deleted).` | [x] 已迁移 |
| 174 | `说明` | `common.help` | `Help` | [x] 已迁移 |
| 176 | `每个栏目就是一个普通设定集合：和「其他设定」一样可以放条目、写元素树、导出 JSON / TXT。` | `sections.help_1` | `Each section is an ordinary settings collection: like "Other Settings", it can hold entries, element trees, and JSON / TXT export.` | [x] 已迁移 |
| 177 | `想给栏目配一套默认元素模板：到「元素模板」页，在下拉框里选中这个栏目即可。` | `sections.help_2` | `To give a section a default element template: open Element Templates and pick the section in the dropdown.` | [x] 已迁移 |
| 178 | `「按分类一键归类」会把「其他设定」里分类名匹配的条目搬进对应栏目，原文与来源都保留。` | `sections.help_3` | `"Auto-sort by category" moves entries from "Other Settings" whose category matches into the corresponding section; original text and source are preserved.` | [x] 已迁移 |
| 179 | `删除栏目只删入口，不动文件；想彻底清掉可以自己删 data/section_<key>.json。` | `sections.help_4` | `Deleting a section only removes the entry point, never the file; to remove it completely, delete data/section_<key>.json yourself.` | [x] 已迁移 |
| 237 | `跟随默认模型（{name}）` | `modes.follow_default` | `Follow default model ({name})` | [x] 已迁移 |
| 240 | `{model}（不在当前模型列表）` | `modes.not_in_list` | `{model} (not in current model list)` | [x] 已迁移 |
| 246 | `写稿模式` | `modes.kind_write` | `Writing mode` | [x] 已迁移 |
| 246 | `AI 工作站使用` | `modes.kind_write_desc` | `Used by the AI Workstation` | [x] 已迁移 |
| 247 | `稿件处理模式` | `modes.kind_process` | `Manuscript mode` | [x] 已迁移 |
| 247 | `稿件处理页使用` | `modes.kind_process_desc` | `Used by the Manuscript page` | [x] 已迁移 |
| 252 | `写稿模式`（兜底） | `modes.kind_write` | `Writing mode` | [x] 已迁移 |
| 272 | `模式管理` | `nav.modes` | `Mode Management` | [x] 已迁移 |
| 273 | `两类模式分开管理：写稿模式只出现在 AI 工作站，稿件处理模式只出现在稿件处理页。每个模式都是一套独立的系统提示词，并拥有自己的模型与推理强度。` | `modes.page_desc` | `The two kinds are managed separately: writing modes appear only in the AI Workstation, manuscript modes only on the Manuscript page. Each mode is an independent system prompt with its own model and reasoning effort.` | [x] 已迁移 |
| 276 | `同步到当前接口` | `modes.sync_button` | `Sync to current API` | [x] 已迁移 |
| 277 | `把所有模式的模型改为跟随当前接口的默认模型，推理强度改为默认值` | `modes.sync_title` | `Set every mode's model to follow the current API default model and reset reasoning effort to the default` | [x] 已迁移 |
| 285 | `已同步到当前接口的默认模型与推理强度。` | `modes.synced` | `Synced to the current API's default model and reasoning effort.` | [x] 已迁移 |
| 289,335 | `＋ 新增{kind}` | `modes.add_kind` | `+ New {kind}` | [x] 已迁移 |
| 308 | `有 {count} 个模式使用了当前接口不存在的模型，生成时会回退到默认模型。` | `modes.stale_warning` | `{count} modes use models not available on the current API; generation will fall back to the default model.` | [x] 已迁移 |
| 309 | `一键同步` | `modes.sync_one` | `Sync now` | [x] 已迁移 |
| 317 | `当前接口还没有模型列表。请先到「模型设置」获取或手动填写模型，否则模式无法生成。` | `modes.no_models` | `The current API has no model list yet. Go to Model Settings to fetch or enter models manually, or modes cannot generate.` | [x] 已迁移 |
| 330 | `{kind}列表` | `modes.list_title` | `{kind} list` | [x] 已迁移 |
| 330 | `{count} 个` | `modes.count` | `{count} modes` | [x] 已迁移 |
| 333 | `这一组还没有模式。可以新增一个，或把另一组的模式用途改到这里。` | `modes.group_empty` | `This group has no modes yet. Create one, or change another mode's purpose to this group.` | [x] 已迁移 |
| 346 | `默认模型` | `settings.default_model_label` | `Default model` | [x] 已迁移 |
| 346 | `{model} · {effort}` | `modes.meta_line` | `{model} · {effort}` | [x] 已迁移 |
| 357 | `左侧选择一个模式，或新增模式。` | `modes.pick_hint` | `Select a mode on the left, or create one.` | [x] 已迁移 |
| 362 | `自动保存；模型与推理放在最上面` | `modes.autosave_hint` | `Auto-saved; model and reasoning are at the top` | [x] 已迁移 |
| 367 | `模型` | `modes.model_label` | `Model` | [x] 已迁移 |
| 374 | `推理强度` | `modes.effort_label` | `Reasoning effort` | [x] 已迁移 |
| 382 | `模型选项来自当前接口的模型列表；选择「跟随默认模型」时会自动使用上面的默认模型。` | `modes.model_hint` | `Model options come from the current API's model list; choosing "Follow default model" uses the default model above.` | [x] 已迁移 |
| 385 | `模式名称` | `modes.name_label` | `Mode name` | [x] 已迁移 |
| 388 | `用途` | `modes.kind_label` | `Purpose` | [x] 已迁移 |
| 403 | `写稿模式只出现在 AI 工作站；稿件处理模式只出现在稿件处理页。切换用途后，模式会立刻移到对应分组。` | `modes.kind_hint` | `Writing modes appear only in the AI Workstation; manuscript modes only on the Manuscript page. After changing the purpose, the mode moves to the matching group immediately.` | [x] 已迁移 |
| 405 | `一句话说明` | `common.one_line_desc` | `One-line description` | [x] 已迁移 |
| 409 | `高级参数` | `modes.advanced` | `Advanced parameters` | [x] 已迁移 |
| 415 | `temperature（可留空）` | `modes.temp_label` | `temperature (optional)` | [x] 已迁移 |
| 418 | `接口默认` | `modes.api_default` | `API default` | [x] 已迁移 |
| 428 | `发送 thinking 参数（仅部分接口支持）` | `modes.thinking_option` | `Send thinking parameter (supported by some APIs only)` | [x] 已迁移 |
| 434 | `拼装目标字数` | `modes.target_chars_option` | `Include target word count` | [x] 已迁移 |
| 438 | `稿件处理模式不拼装目标字数；如需要长度约束，请写进「处理要求」。` | `modes.target_chars_process_hint` | `Manuscript modes do not include a target word count; write length requirements into "Processing instructions" instead.` | [x] 已迁移 |
| 439 | `字数设置只对写稿模式生效；稿件处理模式不拼装目标字数。` | `modes.target_chars_write_hint` | `Word count settings only apply to writing modes; manuscript modes do not include a target word count.` | [x] 已迁移 |
| 442 | `系统提示词（这个模式的核心内容）` | `modes.system_prompt_label` | `System prompt (the core of this mode)` | [x] 已迁移 |
| 447 | `提示词保存后立即用于该模式；不再有旧版的提示词分组或工具说明。` | `modes.prompt_saved_hint` | `The prompt is used by this mode immediately after saving; the old prompt groups and tool descriptions are gone.` | [x] 已迁移 |
| 451 | `恢复内置提示词` | `modes.restore_builtin` | `Restore built-in prompt` | [x] 已迁移 |
| 454 | `这是自定义模式，没有内置版本。` | `modes.no_builtin` | `This is a custom mode; there is no built-in version.` | [x] 已迁移 |
| 455 | `恢复「{label}」的内置系统提示词与默认参数？` | `modes.restore_confirm` | `Restore the built-in system prompt and default parameters of "{label}"?` | [x] 已迁移 |
| 466 | `已恢复内置设置` | `modes.restored` | `Built-in settings restored` | [x] 已迁移 |
| 485 | `删除模式` | `modes.delete` | `Delete Mode` | [x] 已迁移 |
| 487 | `至少保留一个模式。` | `modes.keep_one` | `Keep at least one mode.` | [x] 已迁移 |
| 488 | `删除模式「{label}」？` | `modes.delete_confirm` | `Delete mode "{label}"?` | [x] 已迁移 |
| 492 | `已删除模式` | `modes.deleted` | `Mode deleted` | [x] 已迁移 |
| 503 | `新稿件处理模式` | `modes.new_process` | `New manuscript mode` | [x] 数据/输出内容豁免（Q3/Q6） |
| 503 | `新写稿模式` | `modes.new_write` | `New writing mode` | [x] 数据/输出内容豁免（Q3/Q6） |
| 505-511 | 新增模式的内置系统提示词正文 | — | — | 否（默认提示词，D8） |
| 512 | `新增{kind}` | `modes.add_kind_title` | `New {kind}` | [x] 已迁移 |
| 526 | `已新增{kind}，可以开始编辑提示词。` | `modes.added` | `Added {kind}; you can start editing the prompt.` | [x] 已迁移 |
| 586,875 | `自定义 / OpenAI 兼容` | `settings.custom_preset` | `Custom / OpenAI-compatible` | [x] 已迁移 |
| 597 | `模型设置` | `nav.settings` | `Model Settings` | [x] 已迁移 |
| 598 | `支持多种 OpenAI 兼容提供商，也可以填写任意自定义 URL。API Key 只保存在本机 data/config.json。` | `settings.page_desc` | `Supports many OpenAI-compatible providers and any custom URL. The API key is stored only in the local data/config.json.` | [x] 已迁移 |
| 601 | `设置向导` | `settings.wizard` | `Setup wizard` | [x] 已迁移 |
| 605 | `备份全部数据` | `settings.backup_all` | `Back up all data` | [x] 已迁移 |
| 607 | `已备份到：{path}` | `settings.backed_up_to` | `Backed up to: {path}` | [x] 已迁移 |
| 608 | `备份失败：{reason}` | `settings.backup_failed_reason` | `Backup failed: {reason}` | [x] 已迁移 |
| 613 | `接口与提供商` | `settings.api_section` | `API & Providers` | [x] 已迁移 |
| 615 | `提供商预设` | `settings.provider_label` | `Provider preset` | [x] 已迁移 |
| 628 | `还没有填写 API Key。可以手动填写，或设置环境变量 {env}。` | `settings.no_key_hint` | `No API key yet. Enter one manually, or set the environment variable {env}.` | [x] 已迁移 |
| 631 | `当前是自定义或本地接口，API Key 可以留空；如果接口要求鉴权，再手动填写即可。` | `settings.key_optional_hint` | `This is a custom or local API; the API key can be left empty. Fill it in only if the API requires authentication.` | [x] 已迁移 |
| 634,899 | `接口 URL（可留空使用预设，也可以自己填）` | `settings.url_label` | `API URL (leave empty to use the preset, or enter your own)` | [x] 已迁移 |
| 643,909 | `{env}（可手动填写）` | `settings.key_placeholder` | `{env} (optional)` | [x] 已迁移 |
| 647 | `超时（秒）` | `settings.timeout_label` | `Timeout (seconds)` | [x] 已迁移 |
| 654 | `自定义 URL：使用通用接口提示词，不强调具体模型或厂商。` | `settings.custom_url_hint` | `Custom URL: uses the generic API prompt without assuming a specific model or vendor.` | [x] 已迁移 |
| 655,972 | `使用「{label}」预设接口提示词。` | `settings.preset_hint` | `Uses the "{label}" preset API prompt.` | [x] 已迁移 |
| 656 | `通用提示词` | `settings.generic_prompt` | `Generic prompt` | [x] 已迁移 |
| 659 | `通用接口提示词：不假定具体模型名称、厂商或特殊能力。` | `settings.generic_prompt_hint` | `Generic API prompt: assumes no specific model name, vendor, or special capability.` | [x] 已迁移 |
| 660 | `当前使用 OpenAI 兼容接口。`（兜底） | `settings.openai_compat_note` | `Currently using an OpenAI-compatible API.` | [x] 已迁移 |
| 662 | `高级请求参数` | `settings.advanced` | `Advanced request parameters` | [x] 已迁移 |
| 665 | `max_tokens 字段名` | `settings.max_tokens_label` | `max_tokens field name` | [x] 已迁移 |
| 675 | `强制发送 reasoning_effort（自定义接口可能需要）` | `settings.force_reasoning` | `Force-send reasoning_effort (may be needed by custom APIs)` | [x] 已迁移 |
| 680 | `强制发送 thinking 参数` | `settings.force_thinking` | `Force-send thinking parameter` | [x] 已迁移 |
| 685 | `模型与默认参数` | `settings.models_section` | `Models & Default Parameters` | [x] 已迁移 |
| 686 | `模型列表可以从接口获取，也可以手动填写` | `settings.models_hint` | `The model list can be fetched from the API or entered manually` | [x] 已迁移 |
| 689,914 | `从接口获取可用模型` | `settings.fetch_models` | `Fetch available models` | [x] 已迁移 |
| 693 | `获取模型中…` | `common.fetching` | `Fetching…` | [x] 已迁移 |
| 699,923 | `已获取 {count} 个模型。` | `settings.fetched_models` | `Fetched {count} models.` | [x] 已迁移 |
| 700 | `模型列表已更新` | `settings.models_updated` | `Model list updated` | [x] 已迁移 |
| 702,925 | `获取模型失败：{reason}` | `settings.fetch_failed_reason` | `Failed to fetch models: {reason}` | [x] 已迁移 |
| 703 | `获取失败` | `settings.fetch_failed` | `Fetch failed` | [x] 已迁移 |
| 707 | `需要接口支持 /models 端点；不支持时请手动填写。` | `settings.models_endpoint_hint` | `Requires the API to support the /models endpoint; if unsupported, enter models manually.` | [x] 已迁移 |
| 709 | `可选模型（每行一个）` | `settings.models_label` | `Available models (one per line)` | [x] 已迁移 |
| 719 | `刷新模型选项` | `settings.refresh_models` | `Refresh model options` | [x] 已迁移 |
| 724,947 | `默认模型` | `settings.default_model_label` | `Default model` | [x] 已迁移 |
| 728 | `（请先填写模型）` | `settings.no_model_option` | `(Enter models first)` | [x] 已迁移 |
| 731,963 | `默认推理强度` | `settings.default_effort_label` | `Default reasoning effort` | [x] 已迁移 |
| 739 | `保存配置` | `settings.save` | `Save configuration` | [x] 已迁移 |
| 746 | `配置已保存` | `settings.saved` | `Configuration saved` | [x] 已迁移 |
| 751,930 | `测试连接` | `settings.test` | `Test connection` | [x] 已迁移 |
| 755 | `测试中…` | `common.testing` | `Testing…` | [x] 已迁移 |
| 761,939 | `连通成功：{model}（{elapsed}s）` | `settings.test_ok` | `Connected: {model} ({elapsed}s)` | [x] 已迁移 |
| 762 | `连通正常` | `settings.test_ok_short` | `Connected` | [x] 已迁移 |
| 764,941 | `测试失败：{reason}` | `settings.test_failed_reason` | `Test failed: {reason}` | [x] 已迁移 |
| 765 | `测试失败` | `settings.test_failed` | `Test failed` | [x] 已迁移 |
| 772 | `默认写作偏好` | `settings.writing_section` | `Default writing preferences` | [x] 已迁移 |
| 774 | `默认目标字数（字符）` | `settings.target_chars_label` | `Default target length (characters)` | [x] 已迁移 |
| 778 | `默认作为硬性要求` | `settings.target_strict` | `Hard requirement by default` | [x] 已迁移 |
| 780 | `默认值会作为工作站目标字数的初始值；每次生成仍可单独修改。` | `settings.target_chars_hint` | `The default is used as the initial target length in the Workstation; it can be changed for each generation.` | [x] 已迁移 |
| 784 | `应用` | `settings.app_section` | `Application` | [x] 已迁移 |
| 785 | `端口修改后需要重新启动` | `settings.port_hint` | `Restart required after changing the port` | [x] 已迁移 |
| v2610.3 | `端口分配方式` | `settings.port_mode` | `Port allocation` | [x] 已迁移 |
| v2610.3 | `自动选择端口` | `settings.port_mode_auto` | `Choose a free port automatically` | [x] 已迁移 |
| v2610.3 | `固定端口` | `settings.port_mode_fixed` | `Fixed port` | [x] 已迁移 |
| v2610.3 | `固定端口 {port}` | `settings.port_mode_fixed_value` | `Fixed port {port}` | [x] 已迁移 |
| v2610.3 | `固定端口（1–65535）` | `settings.port_fixed_label` | `Fixed port (1–65535)` | [x] 已迁移 |
| v2610.3 | `当前全局端口设置：{mode}` | `settings.port_global_current` | `Current global port setting: {mode}` | [x] 已迁移 |
| v2610.3 | `端口是全局设置，请在首页「全局设置」中修改；本小说不保存端口覆盖。` | `settings.port_global_note` | `The port is a global setting. Change it in Global Settings on the home page; novels do not store port overrides.` | [x] 已迁移 |
| v2610.3 | `修改端口不会影响当前正在运行的服务，需重启应用后生效。` | `settings.port_effective_hint` | `Changing the port does not affect the running service; restart the app to apply it.` | [x] 已迁移 |
| v2610.3 | `请输入 1–65535 的整数；无效值不会保存。` | `settings.port_invalid` | `Enter an integer from 1 to 65535; invalid values are not saved.` | [x] 已迁移 |
| 801 | `自动模式由系统选择空闲端口；固定模式使用指定端口。保存后下次启动生效，命令行 --port 可临时覆盖。` | `settings.port_desc` | `Auto lets the system choose a free port; Fixed uses the port you enter. Changes take effect on the next start; --port overrides them temporarily.` | [x] 已迁移 |
| 805 | `目录设置` | `settings.dirs_section` | `Directories` | [x] 已迁移 |
| 806 | `相对于 app/ 目录 {root}` | `settings.dirs_hint` | `Relative to app/ ({root})` | [x] 已迁移 |
| 807 | `导入目录` | `settings.dir_import` | `Import directory` | [x] 已迁移 |
| 807 | `导出目录` | `settings.dir_export` | `Export directory` | [x] 已迁移 |
| 808 | `正文输出目录` | `settings.dir_output` | `Output directory` | [x] 已迁移 |
| 808 | `稿件处理工作区` | `settings.dir_text` | `Manuscript workspace` | [x] 已迁移 |
| 808 | `日志目录` | `settings.dir_log` | `Log directory` | [x] 已迁移 |
| 814 | `数据目录默认是 app/data/，可通过环境变量 NOVELHELPER_DATA 覆盖。改完目录记得重启服务。` | `settings.data_dir_hint` | `The data directory is app/data/ by default and can be overridden with the NOVELHELPER_DATA environment variable. Restart the server after changing directories.` | [x] 已迁移 |
| 818 | `关于 NovelHelper` | `settings.about` | `About NovelHelper` | [x] 已迁移 |
| 820 | `NovelHelper 是免费开源工具。开源地址：` | `settings.about_oss` | `NovelHelper is a free, open-source tool. Source:` | [x] 已迁移 |
| 826 | `；作者 GitHub：` | `settings.about_author` | `; author's GitHub:` | [x] 已迁移 |
| 864 | `配置已保存，可以开始使用。` | `welcome.saved` | `Configuration saved. You're ready to go.` | [x] 已迁移 |
| 865 | `已跳过引导，可随时在「模型设置」中配置。` | `welcome.skipped` | `Wizard skipped; you can configure it anytime in Model Settings.` | [x] 已迁移 |
| 884 | `先选择接口并填写 API Key。可以跳过；不配置也能浏览和编辑设定，但开始生成前需要模型可用。` | `welcome.desc` | `First choose an API and enter your API key. You can skip this; browsing and editing settings works without it, but a model is required before generating.` | [x] 已迁移 |
| 886 | `提供商` | `settings.provider_short` | `Provider` | [x] 已迁移 |
| 955 | `模型名（可手动填写）` | `settings.model_name_label` | `Model name (enter manually)` | [x] 已迁移 |
| 958 | `例如 gpt-4.1-mini / deepseek-flash` | `settings.model_name_placeholder` | `e.g. gpt-4.1-mini / deepseek-flash` | [x] 已迁移 |
| 971 | `当前使用自定义 URL：将使用通用接口提示词。` | `welcome.custom_url_note` | `Using a custom URL: the generic API prompt will be used.` | [x] 已迁移 |
| 974 | `API Key 只保存在本机 app/data/config.json，不会上传到 NovelHelper 自己的服务。` | `welcome.key_note` | `The API key is stored only in your local app/data/config.json and is never uploaded to NovelHelper's own servers.` | [x] 已迁移 |
| 977 | `欢迎使用 NovelHelper v2610.1` | `welcome.title` | `Welcome to NovelHelper {version}` | [x] 已迁移 |
| 979 | `跳过，稍后设置` | `welcome.skip` | `Skip for now` | [x] 已迁移 |
| 983 | `保存并开始` | `welcome.start` | `Save and start` | [x] 已迁移 |

### 3.4 `app/novelhelper/web/records.js`

| 行号 | 原文 | key | 英文初稿 | 译 |
|---|---|---|---|---|
| 120 | `新元素名称` | `elements.new_element_title` | `New element name` | [x] 已迁移 |
| 120 | `（加到「{group}」下面）` | `elements.under_group` | `(added under "{group}")` | [x] 已迁移 |
| 121 | `名称末尾加 / 表示这是分组，可以继续往下分` | `elements.group_tip` | `Append / to the name to make it a group that can nest further` | [x] 已迁移 |
| 155 | `展开 / 收起这一组` | `elements.toggle_group` | `Expand / collapse this group` | [x] 已迁移 |
| 167,267 | `是否需要这个元素（取消勾选＝导出与发送时忽略它）` | `elements.need_hint` | `Whether this element is needed (unchecked = ignored on export and send)` | [x] 已迁移 |
| 186 | `内容（可多行）` | `elements.value_placeholder` | `Content (multiline)` | [x] 已迁移 |
| 194,287 | `在这个元素下面加子元素` | `elements.add_child` | `Add a child element under this one` | [x] 已迁移 |
| 198 | `上移` | `common.move_up` | `Move up` | [x] 已迁移 |
| 202 | `下移` | `common.move_down` | `Move down` | [x] 已迁移 |
| 206,291 | `删除这个元素` | `elements.delete_title` | `Delete this element` | [x] 已迁移 |
| 208,293 | `删除元素「{key}」？子元素会一起删除。` | `elements.delete_confirm` | `Delete element "{key}"? Its child elements will be deleted too.` | [x] 已迁移 |
| 224,276 | `（空分组）` | `elements.empty_group` | `(empty group)` | [x] 已迁移 |
| 237 | `总览` | `elements.doc_mode` | `Overview` | [x] 已迁移 |
| 238 | `文档式：一次看完所有元素，只改需要改的地方` | `elements.doc_mode_title` | `Document view: see all elements at once and edit only what you need` | [x] 已迁移 |
| 242 | `树状` | `elements.tree_mode` | `Tree` | [x] 已迁移 |
| 243 | `结构化：折叠分组、加子元素、上下移动、改元素名` | `elements.tree_mode_title` | `Structured: collapse groups, add child elements, reorder, rename elements` | [x] 已迁移 |
| 246 | `＋ 顶层元素` | `elements.add_top` | `+ Top-level Element` | [x] 已迁移 |
| 247 | `全部展开` | `elements.expand_all` | `Expand all` | [x] 已迁移 |
| 248 | `全部折叠` | `elements.collapse_all` | `Collapse all` | [x] 已迁移 |
| 250 | `点 ▸ 展开分组；元素名可直接改` | `elements.tree_hint` | `Click ▸ to expand a group; element names can be edited inline` | [x] 已迁移 |
| 250 | `文档总览；加 / 删 / 改名请切到「树状」` | `elements.doc_hint` | `Document overview; switch to Tree to add / delete / rename` | [x] 已迁移 |
| 251 | `（还没有元素，点「＋ 顶层元素」添加）` | `elements.empty` | `(No elements yet — click "+ Top-level Element" to add)` | [x] 已迁移 |
| 274 | `（未命名）` | `common.unnamed_paren` | `(Unnamed)` | [x] 已迁移 |
| 279 | `（空）` | `common.empty_paren` | `(empty)` | [x] 已迁移 |
| 346 | `{total} 项 · 已填 {filled}` | `elements.stat_line` | `{total} entries · {filled} filled` | [x] 已迁移 |
| 357 | `其他`（默认分类） | `common.other` | `Other` | [x] 已迁移 |
| 368 | `未知集合：{key}` | `errors.unknown_collection` | `Unknown collection: {key}` | [x] 已迁移 |
| 381 | `＋ 新建{singular}` | `records.new` | `+ New {singular}` | [x] 已迁移 |
| 386 | `导入 Markdown / JSON 到其他设定` | `records.import_title_other` | `Import Markdown / JSON into Other Settings` | [x] 已迁移 |
| 387 | `导入 JSON 到{label}` | `records.import_title` | `Import JSON into {label}` | [x] 已迁移 |
| 403 | `共 {count} 条` | `records.total` | `{count} entries total` | [x] 已迁移 |
| 404 | `，已选 {count} 条` | `records.selected_suffix` | `, {count} selected` | [x] 已迁移 |
| 412 | `搜索…` | `common.search` | `Search…` | [x] 已迁移 |
| 433 | `{count}项` | `records.filled_suffix` | `{count} filled` | [x] 已迁移 |
| 439 | `没有匹配的条目` | `records.no_match` | `No matching entries` | [x] 已迁移 |
| 452 | `左侧选一条记录，或新建一条。` | `records.pick_hint` | `Select a record on the left, or create one.` | [x] 已迁移 |
| 465 | `编辑后自动保存` | `records.autosave_hint` | `Auto-saved after editing` | [x] 已迁移 |
| 469 | `名称` | `common.name` | `Name` | [x] 已迁移 |
| 480 | `穿戴部位` | `records.slot_label` | `Worn slot` | [x] 已迁移 |
| 488 | `类别` | `common.category` | `Category` | [x] 已迁移 |
| 493,784 | `添加类别` | `records.add_category` | `Add category` | [x] 已迁移 |
| 495 | `新类别名称` | `records.new_category_prompt` | `New category name` | [x] 已迁移 |
| 504 | `共 {total} 个元素，已填 {filled} 项` | `records.elem_stat` | `{total} elements, {filled} filled` | [x] 已迁移 |
| 507 | `元素` | `records.elements_label` | `Elements` | [x] 已迁移 |
| 510 | `套用模板补齐` | `records.apply_template` | `Apply Template` | [x] 已迁移 |
| 511 | `按「元素模板」页的模板补上缺的元素（不覆盖已填内容）` | `records.apply_template_title` | `Add missing elements from the Element Templates page (existing content is not overwritten)` | [x] 已迁移 |
| 515,625 | `补充了 {count} 个元素` | `records.template_added` | `Added {count} elements` | [x] 已迁移 |
| 515 | `模板元素都已存在` | `records.template_exists` | `All template elements already exist` | [x] 已迁移 |
| 519 | `预览输出` | `records.preview` | `Preview output` | [x] 已迁移 |
| 524 | `{name} · 将发送 / 导出的内容` | `records.preview_title` | `{name} · Content to be sent / exported` | [x] 已迁移 |
| 525,704,804,812,901 | `关闭` | `common.close` | `Close` | [x] 已迁移 |
| 534 | `内容（原文 / 长文本）` | `records.content_label` | `Content (original text / long text)` | [x] 已迁移 |
| 549 | `成员（指针 → 人物档案）` | `records.members_label` | `Members (pointers → Characters)` | [x] 已迁移 |
| 556 | `随身物品与穿戴不在这里编辑：请到左侧「人物背包」页，选中人物后入包 / 穿戴（两处共用同一份数据，这里不再重复）。` | `records.inventory_hint` | `Carried items and worn equipment are not edited here: open the Inventory page on the left, select a character, then add to inventory / wear (both places share the same data).` | [x] 已迁移 |
| 561,789 | `来源：{source}` | `common.source_prefix` | `Source: {source}` | [x] 已迁移 |
| 563 | `搬运到…` | `records.move` | `Move to…` | [x] 已迁移 |
| 565,791,770 | `删除` | `common.delete` | `Delete` | [x] 已迁移 |
| 567 | `确定删除「{name}」？` | `common.delete_confirm` | `Delete "{name}"?` | [x] 已迁移 |
| 590,71 | `⚠ 指针失效` | `records.broken_pointer` | `⚠ Broken pointer` | [x] 已迁移 |
| 593,74 | `数量` | `records.qty` | `Qty` | [x] 已迁移 |
| 608 | `＋ 从{list}中添加` | `records.add_from` | `+ Add from {list}` | [x] 已迁移 |
| 611,100 | `目标集合还是空的。` | `records.target_empty` | `The target collection is empty.` | [x] 已迁移 |
| 612 | `选择要添加的条目` | `records.pick_title` | `Choose entries to add` | [x] 已迁移 |
| 632 | `Markdown（.md）→ 当前设定` | `records.md_to_current` | `Markdown (.md) → current settings` | [x] 已迁移 |
| 633 | `JSON → 当前设定` | `records.json_to_current` | `JSON → current settings` | [x] 已迁移 |
| 653 | `（{path} 里没有可导入的文件）` | `records.no_import_files` | `(no importable files in {path})` | [x] 已迁移 |
| 662 | `导入` | `common.import` | `Import` | [x] 已迁移 |
| 664 | `请先选择要导入的文件。` | `records.choose_file_first` | `Choose a file to import first.` | [x] 已迁移 |
| 666 | `导入中…` | `common.importing` | `Importing…` | [x] 已迁移 |
| 674 | `导入完成` | `records.import_done` | `Import complete` | [x] 已迁移 |
| 677,237 | `导入失败：{reason}` | `records.import_failed_reason` | `Import failed: {reason}` | [x] 已迁移 |
| 678 | `导入失败` | `records.import_failed` | `Import failed` | [x] 已迁移 |
| 683 | `{title}　（{path} 里的文件）` | `records.import_panel_title` | `{title}　(files in {path})` | [x] 已迁移 |
| 690 | `地图 JSON 必须包含 rows、cols、cells、regions 四个字段；字段缺失或区域引用错误会给出提示。` | `records.map_json_hint` | `Map JSON must contain the four fields rows, cols, cells, regions; missing fields or invalid region references will be reported.` | [x] 已迁移 |
| 691 | `支持 NovelHelper 导出的 JSON、{"items": [...]}，或 {"名称": {...}} 结构；格式错误会提示。` | `records.json_format_hint` | `Supports NovelHelper-exported JSON, {"items": [...]}, or {"名称": {...}} structures; format errors are reported.` | [x] 已迁移 |
| 697 | `导出 JSON` | `records.export_json` | `Export JSON` | [x] 已迁移 |
| 698 | `只包含开启且已填的元素，没有的元素不会出现` | `records.export_json_title` | `Contains only enabled, filled elements; absent elements are omitted` | [x] 已迁移 |
| 707 | `导出 TXT` | `records.export_txt` | `Export TXT` | [x] 已迁移 |
| 719 | `整理导入的内容` | `records.tidy_title` | `Organize imported content` | [x] 已迁移 |
| 720 | `勾选后一键搬到人物 / 势力 / 道具 / 装备 / 记忆，或转为任意自定义栏目的条目` | `records.tidy_hint` | `Check entries to move them to Characters / Factions / Items / Equipment / Memories in one step, or convert them into entries of any custom section` | [x] 已迁移 |
| 723 | `搬运选中的条目到…` | `records.move_selected` | `Move selected entries to…` | [x] 已迁移 |
| 726 | `先在左侧勾选要搬运的条目。` | `records.select_first` | `Check the entries to move on the left first.` | [x] 已迁移 |
| 731 | `全选（当前列表）` | `records.select_all` | `Select all (current list)` | [x] 已迁移 |
| 734 | `清空选择` | `records.clear_selection` | `Clear selection` | [x] 已迁移 |
| 740 | `记忆库` | `nav.memories` | `Memories` | [x] 已迁移 |
| 742 | `自定义：{label}` | `records.custom_prefix` | `Custom: {label}` | [x] 已迁移 |
| 746 | `共 {count} 条。搬运会按目标集合的模板建立新条目，原文放进「补充说明」；自定义栏目会出现在下方。` | `records.move_desc` | `{count} entries. Moving creates new entries from the target collection's template; the original text goes into "Additional notes"; custom sections appear below.` | [x] 已迁移 |
| 747 | `保留原条目（复制而不是移动）` | `records.keep_original` | `Keep original entries (copy instead of move)` | [x] 已迁移 |
| 758 | `搬运失败：{reason}` | `records.move_failed_reason` | `Move failed: {reason}` | [x] 已迁移 |
| 762 | `搬运到…` | `records.move` | `Move to…` | [x] 已迁移 |

### 3.5 `app/novelhelper/web/views.js`

| 行号 | 原文 | key | 英文初稿 | 译 |
|---|---|---|---|---|
| 18 | `人物背包` | `nav.inventory` | `Inventory` | [x] 已迁移 |
| 19-20 | `背包只在这里编辑（人物档案页不再重复）。选人物 → 入包 / 穿戴，指针直接指向「道具设定」与「服饰与装备」；钱袋是背包的特殊字段，可以填数量或富裕 / 一般 / 紧张，留空＝不体现。` | `inventory.page_desc` | `The inventory is edited only here (no longer on the Characters page). Select a character → add to inventory / wear; pointers point directly to Items and Outfits & Equipment; the purse is a special inventory field — enter an amount or wealthy / average / tight, empty = not shown.` | [x] 已迁移 |
| 23 | `人物背包只编辑已有人物的随身物品与穿戴。还没有人物时，请到「人物档案」新建，或在该页导入人物 JSON。` | `inventory.no_characters` | `The inventory only edits existing characters' carried items and worn equipment. No characters yet — create one on the Characters page or import character JSON there.` | [x] 已迁移 |
| 52 | `{name} · 背包` | `inventory.title` | `{name} · Inventory` | [x] 已迁移 |
| 56 | `钱袋` | `inventory.purse_label` | `Purse` | [x] 已迁移 |
| 59 | `留空＝不体现；也可以填 富裕 / 一般 / 紧张` | `inventory.purse_placeholder` | `Empty = not shown; or enter wealthy / average / tight` | [x] 已迁移 |
| 63 | `富裕` / `一般` / `紧张`（钱袋档位选项值） | — | — | [x] 按 Q5 处理 |
| 79 | `备注（就是这一条发给模型的解释）` | `inventory.note_label` | `Note (the explanation sent to the model for this entry)` | [x] 已迁移 |
| 82 | `带上身（随身 / 穿戴）；取消＝放进「已拥有」` | `inventory.carried_hint` | `Carry (on person / worn); uncheck = put into "Owned"` | [x] 已迁移 |
| 89 | `携带` | `inventory.carried_label` | `Carried` | [x] 已迁移 |
| 91 | `移出背包` | `inventory.remove` | `Remove from inventory` | [x] 已迁移 |
| 101 | `选择要添加的{label}` | `records.pick_title` | `Choose entries to add ({label})` | [x] 已迁移 |
| 119 | `随身物品` | `inventory.carried_title` | `Carried items` | [x] 已迁移 |
| 119 | `携带中` | `inventory.carried_status` | `being carried` | [x] 已迁移 |
| 121 | `从道具中添加` | `inventory.add_item` | `Add from Items` | [x] 已迁移 |
| 122 | `穿戴与装备` | `inventory.worn_title` | `Worn & Equipment` | [x] 已迁移 |
| 122 | `佩戴中` | `inventory.worn_status` | `being worn` | [x] 已迁移 |
| 124 | `从服饰/装备中添加` | `inventory.add_equipment` | `Add from Outfits/Equipment` | [x] 已迁移 |
| 125 | `已拥有（未携带）` | `inventory.owned_title` | `Owned (not carried)` | [x] 已迁移 |
| 125 | `存在、但没带在身上` | `inventory.owned_status` | `owned but not carried` | [x] 已迁移 |
| 128 | `道具` | `collections.singular_item` | `Item` | [x] 已迁移 |
| 129 | `服饰/装备` | `collections.singular_equipment` | `Outfit / Equipment` | [x] 已迁移 |
| 132 | `{name} · 完整外貌拼装` | `inventory.assembly_title` | `{name} · Full appearance assembly` | [x] 数据/输出内容豁免（Q3/Q6） |
| 135,141,142 | `- 穿戴：` / `- 随身：` / `- 钱袋：`（预览输出固定标签） | — | — | [x] 按 Q6 处理 |
| 179 | `北` / `中` / `南` / `西` / `东`（地图行/列默认值） | — | — | [x] 按 Q5 处理 |
| 233 | `未命名区域`（生成的区域名，写入数据） | — | — | [x] 按 Q3 处理 |
| 245,602 | `世界地图` | `nav.worldmap` | `World Map` | [x] 已迁移 |
| 246-247 | `一棵确定的树：根表格每格挂一个区域，区域自己的子表格再挂子区域，最多 {max} 层。行、列都能加；完全没内容的表格不会写进提示词。` | `worldmap.page_desc` | `A deterministic tree: each cell of the root grid holds a region, and a region's own subgrid holds subregions, up to {max} levels deep. Rows and columns can both be added; grids with no content at all are not written into the prompt.` | [x] 已迁移 |
| 251 | `重命名地图` | `worldmap.rename` | `Rename map` | [x] 已迁移 |
| 252 | `地图名称` | `worldmap.name_label` | `Map name` | [x] 已迁移 |
| 258 | `导入地图 JSON` | `worldmap.import_json` | `Import map JSON` | [x] 已迁移 |
| 283 | `不能把区域挪进它自己的子区域里。` | `worldmap.cannot_move_into_self` | `A region cannot be moved into its own subregion.` | [x] 已迁移 |
| 286 | `挪过去会超过地图深度上限（{max} 层）。` | `worldmap.depth_limit` | `Moving there would exceed the map depth limit ({max} levels).` | [x] 已迁移 |
| 300 | `这一格已经有区域了。` | `worldmap.cell_occupied` | `This cell already has a region.` | [x] 已迁移 |
| 307 | `已交换「{a}」与「{b}」` | `worldmap.swapped` | `Swapped "{a}" with "{b}"` | [x] 已迁移 |
| 315 | `已移动「{name}」` | `worldmap.moved` | `Moved "{name}"` | [x] 已迁移 |
| 343 | `区域名称，例如：史莱姆森林` | `worldmap.name_placeholder` | `Region name, e.g. Slime Forest` | [x] 已迁移 |
| 347 | `或者挂接一个还没挂上的区域：{list}` | `worldmap.attach_loose` | `or attach an unplaced region: {list}` | [x] 已迁移 |
| 348 | `这一格放什么` | `worldmap.cell_modal_title` | `What goes in this cell` | [x] 已迁移 |
| 350 | `挂接已有区域` | `worldmap.attach_existing` | `Attach existing region` | [x] 已迁移 |
| 354 | `选择要挂上的区域` | `worldmap.pick_region` | `Choose a region to attach` | [x] 已迁移 |
| 363 | `创建并挂上` | `worldmap.create_attach` | `Create and attach` | [x] 已迁移 |
| 380 | `点一下改这一{axis}的名字` | `worldmap.axis_rename_title` | `Click to rename this {axis}` | [x] 已迁移 |
| 383 | `方位` | `worldmap.corner_label` | `Position` | [x] 已迁移 |
| 394 | `拖动＝换位置（拖到别的格会互换）；点击＝编辑` | `worldmap.cell_drag_title` | `Drag = move (dragging onto another cell swaps them); click = edit` | [x] 已迁移 |
| 395 | `点一下新建 / 挂接区域，也可以把别的区域拖进来` | `worldmap.cell_empty_title` | `Click to create / attach a region, or drag another region here` | [x] 已迁移 |
| 439,563 | `已经有同名的{axis}了：{label}` | `worldmap.axis_duplicate` | `A {axis} named {label} already exists.` | [x] 已迁移 |
| 457 | `改这一{axis}的名字` | `worldmap.rename_axis_title` | `Rename this {axis}` | [x] 已迁移 |
| 466,580 | `行 / 列名称` | `worldmap.axes_title` | `Row / column names` | [x] 已迁移 |
| 467 | `行（一行一个）` | `worldmap.rows_label` | `Rows (one per line)` | [x] 已迁移 |
| 468 | `列（一行一个）` | `worldmap.cols_label` | `Columns (one per line)` | [x] 已迁移 |
| 469 | `改名字直接改；少写几行＝从末尾删掉几行（里面挂的区域会变成未挂接，不会删掉区域）。增加请用 ＋ 按钮。` | `worldmap.axes_hint` | `Rename by editing; writing fewer lines deletes trailing rows/columns (their regions become unplaced, never deleted). Use the + buttons to add.` | [x] 已迁移 |
| 472,626 | `保存` | `common.save` | `Save` | [x] 已迁移 |
| 476 | `行列不能清空。` | `worldmap.axes_empty` | `Rows and columns cannot be emptied.` | [x] 已迁移 |
| 478 | `名字数量不能多于现有行列；增加请用 ＋ 按钮。` | `worldmap.axes_too_many` | `There can't be more names than existing rows/columns; use the + buttons to add.` | [x] 已迁移 |
| 494 | `删掉末尾的行列？` | `worldmap.drop_confirm_title` | `Delete trailing rows/columns?` | [x] 已迁移 |
| 495 | `会删掉末尾 {rows} 行、{cols} 列；挂在上面的区域会变成「未挂接」（区域本身不会删）。` | `worldmap.drop_confirm` | `This deletes the last {rows} rows and {cols} columns; regions on them become "unplaced" (the regions themselves are not deleted).` | [x] 已迁移 |
| 527 | `行` / `列` | `worldmap.row` / `worldmap.col` | `row` / `column` | [x] 已迁移 |
| 529 | `{axis}不能为空。` | `worldmap.axis_empty_msg` | `{axis} cannot be empty.` | [x] 已迁移 |
| 530 | `有空的{axis}名。` | `worldmap.axis_blank_name` | `There is an empty {axis} name.` | [x] 已迁移 |
| 531 | `有重复的{axis}名。` | `worldmap.axis_dup_name` | `There are duplicate {axis} names.` | [x] 已迁移 |
| 534 | `和末尾待删的{axis}名撞了：{list}` | `worldmap.axis_clash` | `Clashes with {axis} names pending deletion: {list}` | [x] 已迁移 |
| 547 | `改名后有两格撞在一起了，换一组名字试试。` | `worldmap.rename_clash` | `Renaming caused two cells to collide; try a different set of names.` | [x] 已迁移 |
| 560 | `在最前面加一{axis}` / `在最后面加一{axis}` | `worldmap.add_axis_front` / `worldmap.add_axis_end` | `Add a {axis} at the front` / `Add a {axis} at the end` | [x] 已迁移 |
| 573 | `世界地图`（兜底名） | `nav.worldmap` | `World Map` | [x] 已迁移 |
| 574 | `根表格（第 1 层）：点空白格新建 / 挂接区域，点已有区域进入编辑` | `worldmap.root_hint` | `Root grid (level 1): click an empty cell to create / attach a region; click a region to edit it` | [x] 已迁移 |
| 576,652 | `＋行·末` | `worldmap.add_row_end` | `+Row·End` | [x] 已迁移 |
| 577,653 | `＋行·首` | `worldmap.add_row_start` | `+Row·Start` | [x] 已迁移 |
| 578,654 | `＋列·末` | `worldmap.add_col_end` | `+Col·End` | [x] 已迁移 |
| 579,655 | `＋列·首` | `worldmap.add_col_start` | `+Col·Start` | [x] 已迁移 |
| 580,656 | `行 / 列名称…` | `worldmap.axes_button` | `Row / column names…` | [x] 已迁移 |
| 581,657 | `{rows} 行 × {cols} 列` | `worldmap.grid_size` | `{rows} rows × {cols} cols` | [x] 已迁移 |
| 586 | `还没挂到地图上的区域：{list}（在任意空白格里可以挂接）` | `worldmap.loose_hint` | `Regions not yet on the map: {list} (attach them in any empty cell)` | [x] 已迁移 |
| 595 | `点左边的格子来查看 / 编辑区域。` | `worldmap.pick_cell` | `Click a cell on the left to view / edit its region.` | [x] 已迁移 |
| 612 | `{name}（第 {depth} 层）` | `worldmap.depth_crumb` | `{name} (level {depth})` | [x] 已迁移 |
| 615 | `区域名称` | `worldmap.region_name_label` | `Region name` | [x] 已迁移 |
| 617 | `一句话简述` | `worldmap.summary_label` | `One-line summary` | [x] 已迁移 |
| 622 | `区域元素（地形、气候、居民、危险度……）` | `worldmap.elements_label` | `Region elements (terrain, climate, inhabitants, danger level…)` | [x] 已迁移 |
| 624 | `套用「其他设定」模板` | `worldmap.apply_other_template` | `Apply "Other Settings" template` | [x] 已迁移 |
| 625 | `没有可补的元素` | `worldmap.nothing_to_add` | `No elements to add` | [x] 已迁移 |
| 629 | `详细描述` | `worldmap.details_label` | `Detailed description` | [x] 已迁移 |
| 634,638 | `子表格` | `worldmap.subgrid` | `Subgrid` | [x] 已迁移 |
| 636 | `这里已经是第 {depth} 层，达到地图深度上限（{max} 层），不能再往下开子表格。` | `worldmap.depth_max` | `This is level {depth}, the map depth limit ({max} levels) — no deeper subgrids can be created.` | [x] 已迁移 |
| 639 | `第 {depth} 层的区域挂在这里` | `worldmap.subgrid_hint` | `Regions of level {depth} attach here` | [x] 已迁移 |
| 642 | `还没有子表格。需要在下一层细分时再建，空表格不会写进提示词。` | `worldmap.no_subgrid` | `No subgrid yet. Create one when you need to subdivide the next level; empty grids are not written into the prompt.` | [x] 已迁移 |
| 644 | `＋ 创建 3×3 子表格` | `worldmap.create_subgrid` | `+ Create 3×3 subgrid` | [x] 已迁移 |
| 645 | `已创建 3×3 子表格` | `worldmap.subgrid_created` | `3×3 subgrid created` | [x] 已迁移 |
| 658 | `子表格 `（表头前缀） | `worldmap.subgrid_label` | `Subgrid ` | [x] 已迁移 |
| 661 | `（表格还是空的——完全没有内容的表格不会出现在提示词里）` | `worldmap.grid_empty_note` | `(grid still empty — grids with no content at all do not appear in the prompt)` | [x] 已迁移 |
| 669 | `解除挂接（放回未挂接）` | `worldmap.detach` | `Detach (return to unplaced)` | [x] 已迁移 |
| 677 | `根表格里的区域` | `worldmap.in_root` | `Region in the root grid` | [x] 已迁移 |
| 680 | `删除区域（含子区域）` | `worldmap.delete_region` | `Delete Region (with subregions)` | [x] 已迁移 |
| 683 | `删除区域` | `worldmap.delete_region_title` | `Delete region` | [x] 已迁移 |
| 683 | `删除「{name}」` | `worldmap.delete_confirm` | `Delete "{name}"` | [x] 已迁移 |
| 684 | `及其下的 {count} 个子区域` | `worldmap.delete_confirm_sub` | ` and its {count} subregions` | [x] 已迁移 |
| 684 | `？删掉的区域不会出现在提示词里。` | `worldmap.delete_confirm_end` | `? Deleted regions no longer appear in the prompt.` | [x] 已迁移 |
| 710 | `记忆库` | `nav.memories` | `Memories` | [x] 已迁移 |
| 711 | `集中管理短期记忆、长期记忆、伏笔与设定备忘。AI 工作站左侧可以按需勾选，只发送本次需要的条目。` | `memories.page_desc` | `Manage short-term memories, long-term memories, foreshadowing, and setting notes in one place. On the left of the AI Workstation you can check exactly the entries to send for the current task.` | [x] 已迁移 |
| 714 | `压缩全部记忆` | `memories.compress_all` | `Compress all memories` | [x] 已迁移 |
| 716 | `＋ 新建记忆` | `memories.new` | `+ New Memory` | [x] 已迁移 |
| 719 | `新记忆`（默认标题，写入数据） | — | — | [x] 按 Q3 处理 |
| 724 | `导入记忆 JSON` | `memories.import_json` | `Import memory JSON` | [x] 已迁移 |
| 741 | `全部分类` | `memories.all_categories` | `All categories` | [x] 已迁移 |
| 754 | `{category} · {count}字` | `memories.meta_line` | `{category} · {count} chars` | [x] 已迁移 |
| 769 | `左侧选一条记忆。` | `memories.pick_hint` | `Select a memory on the left.` | [x] 已迁移 |
| 771 | `编辑记忆` | `memories.edit_title` | `Edit Memory` | [x] 已迁移 |
| 772,337 | `标题` | `common.title` | `Title` | [x] 已迁移 |
| 775,339 | `分类` | `memories.category_label` | `Category` | [x] 已迁移 |
| 778,340 | `章节 / 时间` | `memories.chapter_label` | `Chapter / time` | [x] 已迁移 |
| 780 | `内容` | `common.content` | `Content` | [x] 已迁移 |
| 785 | `新分类` | `records.new_category_prompt` | `New category` | [x] 已迁移 |
| 787 | `压缩本条` | `memories.compress_one` | `Compress this one` | [x] 已迁移 |
| 793 | `删除这条记忆？` | `memories.delete_confirm` | `Delete this memory?` | [x] 已迁移 |
| 805 | `没有可压缩的记忆。` | `memories.nothing_compress` | `No memories to compress.` | [x] 已迁移 |
| 807 | `压缩记忆中…` | `common.compressing` | `Compressing…` | [x] 已迁移 |
| 812 | `原 {before} 字 → 压缩后 {after} 字` | `memories.compress_stat` | `Original {before} chars → compressed {after} chars` | [x] 已迁移 |
| 813 | `压缩结果（可直接改）` | `memories.compress_result` | `Compression result (editable)` | [x] 已迁移 |
| 814 | `记忆压缩结果` | `memories.compress_title` | `Memory compression result` | [x] 已迁移 |
| 817 | `作为新条目保存` | `memories.save_as_new` | `Save as new entry` | [x] 已迁移 |
| 821 | `压缩记忆`（默认标题） | — | — | [x] 按 Q3 处理 |
| 821 | `（压缩）` | `memories.compressed_suffix` | ` (compressed)` | [x] 数据/输出内容豁免（Q3/Q6） |
| 822 | `长期记忆`（默认分类，写入数据） | — | — | [x] 按 Q3 处理 |
| 825 | `已保存为新条目` | `memories.saved_new` | `Saved as new entry` | [x] 已迁移 |
| 829 | `替换原条目内容` | `memories.replace_original` | `Replace original content` | [x] 已迁移 |
| 836 | `已更新记忆` | `memories.updated` | `Memory updated` | [x] 已迁移 |
| 840 | `压缩完成` | `common.compress_done` | `Compression complete` | [x] 已迁移 |
| 842 | `压缩失败：{reason}` | `memories.compress_failed_reason` | `Compression failed: {reason}` | [x] 已迁移 |
| 843 | `压缩失败` | `memories.compress_failed` | `Compression failed` | [x] 已迁移 |
| 862 | `章节与导出` | `nav.chapters` | `Chapters & Export` | [x] 已迁移 |
| 863 | `workspace/output/ 下的正文、计划与转换结果。可预览、转 txt，或直接送到稿件处理页继续整理。` | `chapters.page_desc` | `Manuscripts, plans, and conversion results under workspace/output/. Preview, convert to txt, or send straight to the Manuscript page for further work.` | [x] 已迁移 |
| 866 | `文件` / `目录` / `大小` / `修改时间` / `操作` | `chapters.col_file` / `chapters.col_dir` / `chapters.col_size` / `chapters.col_mtime` / `chapters.col_actions` | `File` / `Directory` / `Size` / `Modified` / `Actions` | [x] 已迁移 |
| 869 | `预览` | `common.preview` | `Preview` | [x] 已迁移 |
| 871 | `转 txt` | `chapters.to_txt` | `Convert to txt` | [x] 已迁移 |
| 873 | `已生成 {path}` | `chapters.generated` | `Generated {path}` | [x] 已迁移 |
| 874 | `转换失败：{reason}` | `chapters.convert_failed_reason` | `Conversion failed: {reason}` | [x] 已迁移 |
| 878 | `送到稿件处理` | `chapters.send_to_manuscript` | `Send to Manuscript` | [x] 已迁移 |
| 884,902,820 | `读取失败：{reason}` | `common.read_failed_reason` | `Failed to read: {reason}` | [x] 已迁移 |
| 901 | `刷新` | `common.refresh` | `Refresh` | [x] 已迁移 |

### 3.6 `app/novelhelper/web/workstation.js`

| 行号 | 原文 | key | 英文初稿 | 译 |
|---|---|---|---|---|
| 5 | `逻辑写作` | `modes.logic_label` | `Logic Writing` | [x] 已迁移 |
| 5 | `核对设定一致性，整理约束、风险与推进节点` | `modes.logic_desc` | `Check setting consistency; organize constraints, risks, and progress points` | [x] 已迁移 |
| 6 | `框架写作` | `modes.outline_label` | `Framework Writing` | [x] 已迁移 |
| 6 | `输出场景框架、节拍与可直接执行的写作提示词` | `modes.outline_desc` | `Output scene framework, beats, and ready-to-execute writing prompts` | [x] 已迁移 |
| 7 | `完整写作` | `modes.draft_label` | `Full Writing` | [x] 已迁移 |
| 7 | `根据设定与提示词生成完整正文` | `modes.draft_desc` | `Generate full text from settings and prompts` | [x] 已迁移 |
| 8 | `灵感方案` | `modes.brainstorm_label` | `Ideas` | [x] 已迁移 |
| 8 | `给出多条有差异的后续方向供选择` | `modes.brainstorm_desc` | `Offer several distinct directions for what comes next` | [x] 已迁移 |
| 21 | `完整写作`（兜底） | `modes.draft_label` | `Full Writing` | [x] 已迁移 |
| 74 | `附加资料读取失败：{path}` | `workstation.extra_read_failed` | `Failed to read attachment: {path}` | [x] 已迁移 |
| 112 | `（暂无可选项）` | `workstation.no_options` | `(no options yet)` | [x] 已迁移 |
| 136 | `其他设定`（世界观分组名） | `nav.other` | `Other Settings` | [x] 已迁移 |
| 156 | `AI 工作站` | `nav.writer` | `AI Workstation` | [x] 已迁移 |
| 157 | `使用写稿模式生成新内容。左侧选择设定、撰写用户提示词；处理已有稿件请到「稿件处理」页。生成期间工作站会完全锁定。` | `workstation.page_desc` | `Generate new content with a writing mode. On the left, pick settings and write your user prompt; to work on existing text, use the Manuscript page. The workstation is fully locked during generation.` | [x] 已迁移 |
| 159,702 | `对话历史` | `history.title` | `Conversation History` | [x] 已迁移 |
| 160,738 | `当前对话` | `history.current` | `Current conversation` | [x] 已迁移 |
| 162 | `＋ 新对话` | `history.new` | `+ New Conversation` | [x] 已迁移 |
| 168 | `正在查看历史对话：{title}。左侧输入仍是当前草稿，不会覆盖历史。` | `history.viewing` | `Viewing history conversation: {title}. The input on the left is still your current draft; history is not overwritten.` | [x] 已迁移 |
| 169,393,703 | `返回当前对话` | `history.return` | `Back to current conversation` | [x] 已迁移 |
| 181 | `写稿模式` | `modes.kind_write` | `Writing mode` | [x] 已迁移 |
| 182 | `AI 工作站只显示写稿模式` | `workstation.mode_hint` | `The AI Workstation only shows writing modes` | [x] 已迁移 |
| 185 | `还没有写稿模式。请到「模式管理」新增，或把某个模式的用途改为写稿。` | `workstation.no_mode` | `No writing modes yet. Create one in Mode Management, or change an existing mode's purpose to writing.` | [x] 已迁移 |
| 187,452 | `前往模式管理` | `workstation.go_modes` | `Go to Mode Management` | [x] 已迁移 |
| 200 | `模型：{model} · 推理强度：{effort}` | `workstation.meta_line` | `Model: {model} · Reasoning effort: {effort}` | [x] 已迁移 |
| 201,478 | `跟随默认` | `workstation.follow_default` | `follow default` | [x] 已迁移 |
| 203 | `本次补充要求（可选，会与写稿模式一起发送）` | `workstation.extra_label` | `Extra requirements for this run (optional; sent together with the writing mode)` | [x] 已迁移 |
| 206 | `例如：先列 3 个方案，再选一个展开；或“只写 1500 字，收在悬念处”。` | `workstation.extra_placeholder` | `e.g. List 3 options first, then expand one; or "write only 1500 characters, ending on a cliffhanger".` | [x] 已迁移 |
| 214 | `输入设定` | `workstation.input_title` | `Input settings` | [x] 已迁移 |
| 215 | `勾选才发送；未勾选的内容不会进入提示词` | `workstation.input_hint` | `Only checked items are sent; unchecked content never enters the prompt` | [x] 已迁移 |
| 220 | `人物 {count}` | `workstation.chip_characters` | `Characters {count}` | [x] 已迁移 |
| 221 | `记忆 {count}` | `workstation.chip_memory` | `Memories {count}` | [x] 已迁移 |
| 222 | `世界观 {count}` | `workstation.chip_world` | `Worldbuilding {count}` | [x] 已迁移 |
| 224 | `世界地图` | `nav.worldmap` | `World Map` | [x] 已迁移 |
| 225 | `势力整栏` | `workstation.chip_factions` | `All factions` | [x] 已迁移 |
| 226 | `目标 {count} 字` | `workstation.chip_target` | `Target {count} chars` | [x] 已迁移 |
| 227 | `本次将发送：{list}` | `workstation.send_summary` | `This run will send: {list}` | [x] 已迁移 |
| 241 | `带入哪些设定` | `workstation.include_label` | `Which settings to include` | [x] 已迁移 |
| 243 | `人物档案` | `nav.characters` | `Characters` | [x] 已迁移 |
| 244 | `故事记忆` | `workstation.chip_memory_label` | `Story memories` | [x] 已迁移 |
| 245 | `世界观与自定义栏目` | `workstation.chip_world_label` | `Worldbuilding & custom sections` | [x] 已迁移 |
| 246 | `势力设定（整栏）` | `workstation.chip_factions_label` | `Factions (whole section)` | [x] 已迁移 |
| 247 | `世界地图` | `nav.worldmap` | `World Map` | [x] 已迁移 |
| 248 | `当前状态` | `workstation.chip_state` | `Current state` | [x] 已迁移 |
| 255,278,297 | `{count} / {total} 已选` | `workstation.selected_of` | `{count} / {total} selected` | [x] 已迁移 |
| 259,281 | `全选` | `common.select_all` | `Select all` | [x] 已迁移 |
| 263,285 | `清空` | `common.clear` | `Clear` | [x] 已迁移 |
| 270 | `还没有人物。请到「人物档案」新建，或在该页导入人物 JSON。` | `workstation.no_characters` | `No characters yet. Create one on the Characters page, or import character JSON there.` | [x] 已迁移 |
| 297 | `世界观条目` | `workstation.world_entries` | `Worldbuilding entries` | [x] 已迁移 |
| 307 | `附加资料` | `workstation.attachments` | `Attachments` | [x] 已迁移 |
| 324 | `把参考资料放进 workspace/import/，刷新后即可勾选。` | `workstation.attach_hint` | `Put reference material into workspace/import/ and refresh to select it.` | [x] 已迁移 |
| 330 | `当前状态（此刻的时间、地点、人物状态…）` | `workstation.state_label` | `Current state (time, place, character status right now…)` | [x] 已迁移 |
| 333 | `例如：当前时间、地点、人物位置与情绪……` | `workstation.state_placeholder` | `e.g. current time, place, character positions and mood…` | [x] 已迁移 |
| 337,803 | `用户提示词` | `workstation.prompt_label` | `User prompt` | [x] 已迁移 |
| 340 | `写下本次想让 AI 做的事：情节、场景、人物动作、风格、必须出现的细节……` | `workstation.prompt_placeholder` | `Write what you want the AI to do this run: plot, scenes, character actions, style, details that must appear…` | [x] 已迁移 |
| 344 | `补充说明（可选）` | `workstation.extra2_label` | `Additional notes (optional)` | [x] 已迁移 |
| 347 | `额外的风格、禁忌或参考信息` | `workstation.extra2_placeholder` | `Extra style, restrictions, or reference information` | [x] 已迁移 |
| 353 | `本次目标字数` | `workstation.target_label` | `Target length this run` | [x] 已迁移 |
| 363 | `硬性要求` | `workstation.strict` | `Hard requirement` | [x] 已迁移 |
| 364 | `默认 {count} 字` | `workstation.target_default` | `Default {count} chars` | [x] 已迁移 |
| 367 | `AI 正在生成…` | `common.generating` | `AI is generating…` | [x] 已迁移 |
| 367 | `开始生成` | `workstation.start` | `Start generating` | [x] 已迁移 |
| 372 | `预览将发送的内容` | `workstation.preview_send` | `Preview what will be sent` | [x] 已迁移 |
| 374 | `清空输入` | `workstation.clear_input` | `Clear input` | [x] 已迁移 |
| 376 | `清空当前输入（提示词、当前状态、补充说明）？设定勾选会保留。` | `workstation.clear_confirm` | `Clear the current input (prompt, current state, additional notes)? Setting selections are kept.` | [x] 已迁移 |
| 385,811 | `AI 输出` | `workstation.output_title` | `AI Output` | [x] 已迁移 |
| 387,442 | `{count} 字` | `workstation.char_count` | `{count} chars` | [x] 已迁移 |
| 392 | `历史对话：{title}` | `history.viewing_short` | `History conversation: {title}` | [x] 已迁移 |
| 401 | `在左侧写好输入，选择写稿模式，然后点「开始生成」。` | `workstation.output_empty` | `Prepare the input on the left, pick a writing mode, then click "Start generating".` | [x] 已迁移 |
| 402 | `生成结果会显示在这里，并自动保存到对话历史。` | `workstation.output_empty_hint` | `Results appear here and are saved to the conversation history automatically.` | [x] 已迁移 |
| 408-410 | `模型 {model} · 推理 {effort} · 耗时 {elapsed}s` | `workstation.result_meta` | `Model {model} · Effort {effort} · Time {elapsed}s` | [x] 已迁移 |
| 415 | `追加到用户提示词` | `workstation.append_prompt` | `Append to user prompt` | [x] 已迁移 |
| 416 | `另存为 TXT` | `workstation.save_txt` | `Save as TXT` | [x] 已迁移 |
| 417 | `另存为 MD` | `workstation.save_md` | `Save as MD` | [x] 已迁移 |
| 418 | `转到稿件处理` | `workstation.to_manuscript` | `Send to Manuscript` | [x] 已迁移 |
| 419,571 | `复制` | `common.copy` | `Copy` | [x] 已迁移 |
| 420 | `查看原文` | `workstation.view_raw` | `View raw` | [x] 已迁移 |
| 427 | `{count} 轮` | `history.turn_count` | `{count} turns` | [x] 已迁移 |
| 427 | `尚未开始` | `history.not_started` | `not started` | [x] 已迁移 |
| 429 | `查看全部历史` | `history.view_all` | `View all history` | [x] 已迁移 |
| 432,737,830 | `未命名对话` | `history.untitled` | `Untitled conversation` | [x] 已迁移 |
| 443 | `输入：{text}` | `history.input_prefix` | `Input: {text}` | [x] 已迁移 |
| 444 | `输出：{text}` | `history.output_prefix` | `Output: {text}` | [x] 已迁移 |
| 447 | `每次生成会自动创建会话；历史按轮次保存，随时可以回来查看。` | `history.autosave_hint` | `Each generation creates a session automatically; history is saved per turn and can be revisited anytime.` | [x] 已迁移 |
| 452 | `运行记录` | `workstation.log_title` | `Run log` | [x] 已迁移 |
| 452 | `错误与调用信息` | `workstation.log_hint` | `Errors and call info` | [x] 已迁移 |
| 453 | `（暂无调用）` | `workstation.log_empty` | `(no calls yet)` | [x] 已迁移 |
| 457 | `使用声明：` | `workstation.disclaimer_label` | `Usage notice: ` | [x] 已迁移 |
| 458 | `本工具仅供合法的文学创作与学习交流使用。请勿使用本工具制作、传播违法违规内容，或从事任何违反法律法规、公序良俗的行为。使用者应自行承担相关责任。` | `workstation.disclaimer` | `This tool is for lawful literary creation and learning exchange only. Do not use it to produce or spread illegal content, or to engage in any conduct violating laws, regulations, or public order and morals. Users bear responsibility for their own actions.` | [x] 已迁移 |
| 466 | `AI 正在生成中` | `workstation.lock_title` | `AI is generating` | [x] 已迁移 |
| 467 | `工作站已完全锁定，完成前无法修改输入或切换操作。` | `workstation.lock_hint` | `The workstation is fully locked; input and actions cannot be changed until completion.` | [x] 已迁移 |
| 477 | `还没有可用的写稿模式，请先到「模式管理」新增。` | `workstation.no_mode_toast` | `No writing mode available yet; create one in Mode Management first.` | [x] 已迁移 |
| 482 | `AI 生成中…` | `common.generating` | `AI generating…` | [x] 已迁移 |
| 509 | ` \| 模型 {model} \| 耗时 {elapsed}s` | `workstation.meta_pipe` | ` | Model {model} | Time {elapsed}s` | [x] 已迁移 |
| 527 | `生成完成` | `workstation.done` | `Generation complete` | [x] 已迁移 |
| 528 | `生成完成，已保存到对话历史。` | `workstation.done_saved` | `Generation complete; saved to conversation history.` | [x] 已迁移 |
| 532 | `生成失败` | `workstation.failed` | `Generation failed` | [x] 已迁移 |
| 533 | `生成失败：{reason}` | `workstation.failed_reason` | `Generation failed: {reason}` | [x] 已迁移 |
| 538 | `组装中…` | `common.assembling` | `Assembling…` | [x] 已迁移 |
| 539 | `实际发送给模型的内容` | `workstation.preview_title` | `What is actually sent to the model` | [x] 已迁移 |
| 555 | `system（{count} 字）` | `workstation.system_label` | `system ({count} chars)` | [x] 已迁移 |
| 558 | `user（{count} 字）` | `workstation.user_label` | `user ({count} chars)` | [x] 已迁移 |
| 562 | `预览失败：{reason}` | `workstation.preview_failed_reason` | `Preview failed: {reason}` | [x] 已迁移 |
| 579 | `已追加到用户提示词（未覆盖原内容）。` | `workstation.appended` | `Appended to the user prompt (original content untouched).` | [x] 已迁移 |
| 587,598,577 | `已复制到剪贴板` | `common.copied` | `Copied to clipboard` | [x] 已迁移 |
| 599 | `复制失败，请手动选择文本。` | `common.copy_failed` | `Copy failed; select the text manually.` | [x] 已迁移 |
| 606 | `AI 输出原文` | `workstation.raw_title` | `Raw AI output` | [x] 已迁移 |
| 617 | `文件名.{fmt}` | `workstation.filename_placeholder` | `filename.{fmt}` | [x] 已迁移 |
| 620 | `保存目录` | `workstation.save_dir` | `Save directory` | [x] 已迁移 |
| 621,686 | `文件名` | `common.filename` | `File name` | [x] 已迁移 |
| 622 | `保存的是当前显示的 AI 输出原文。` | `workstation.save_note` | `Saves the raw AI output currently displayed.` | [x] 已迁移 |
| 623 | `另存为 {fmt}` | `workstation.save_as` | `Save as {fmt}` | [x] 已迁移 |
| 632 | `请填写保存目录。` | `workstation.dir_required` | `Enter a save directory.` | [x] 已迁移 |
| 637,82 | `已保存：{path}` | `common.saved_to` | `Saved: {path}` | [x] 已迁移 |
| 640 | `保存失败：{reason}` | `common.save_failed_reason` | `Save failed: {reason}` | [x] 已迁移 |
| 681 | `开始新对话？当前对话已保存在历史中，可以随时回来查看。` | `history.new_confirm` | `Start a new conversation? The current one is saved in history and can be revisited anytime.` | [x] 已迁移 |
| 693 | `已开始新对话；之前的对话保留在历史中。` | `history.started_new` | `New conversation started; previous ones remain in history.` | [x] 已迁移 |
| 695 | `新建对话失败：{reason}` | `history.new_failed_reason` | `Failed to start new conversation: {reason}` | [x] 已迁移 |
| 701,731 | `加载中…` | `common.loading` | `Loading…` | [x] 已迁移 |
| 711,875 | `加载失败：{reason}` | `common.load_failed_reason` | `Load failed: {reason}` | [x] 已迁移 |
| 718 | `还没有对话记录。每次生成后会自动保存到这里。` | `history.empty` | `No conversations yet. Each generation is saved here automatically.` | [x] 已迁移 |
| 743 | `查看此对话` | `history.view` | `View this conversation` | [x] 已迁移 |
| 752 | `设为当前对话` | `history.set_current` | `Set as current conversation` | [x] 已迁移 |
| 765 | `已切换当前对话。` | `history.switched` | `Current conversation switched.` | [x] 已迁移 |
| 766 | `切换失败：{reason}` | `history.switch_failed_reason` | `Switch failed: {reason}` | [x] 已迁移 |
| 772 | `删除这条对话历史？此操作不可恢复。` | `history.delete_confirm` | `Delete this conversation? This cannot be undone.` | [x] 已迁移 |
| 789 | `已删除。` | `common.deleted` | `Deleted.` | [x] 已迁移 |
| 790 | `删除失败：{reason}` | `common.delete_failed_reason` | `Delete failed: {reason}` | [x] 已迁移 |
| 801 | `{input} → {output} 字` | `history.turn_chars` | `{input} → {output} chars` | [x] 已迁移 |
| 807 | `本次工作要求` | `history.requirements_label` | `Requirements for this run` | [x] 已迁移 |
| 814 | `有 {count} 个设定指针已失效，查看时已自动跳过。` | `history.broken_pointers` | `{count} setting pointers are broken and were skipped when viewing.` | [x] 已迁移 |
| 831 | `{turns} 轮 · {updated} · 当前` | `history.list_meta` | `{turns} turns · {updated} · current` | [x] 已迁移 |
| 865,880 | `就绪` | `common.ready` | `Ready` | [x] 已迁移 |

### 3.7 `app/novelhelper/web/manuscript.js`

| 行号 | 原文 | key | 英文初稿 | 译 |
|---|---|---|---|---|
| 10 | `AI 处理`（兜底） | `manuscript.mode_fallback` | `AI processing` | [x] 已迁移 |
| 14,122 | `（未命名）` | `common.unnamed_paren` | `(Unnamed)` | [x] 已迁移 |
| 81 | `已自动保存 {name}` | `manuscript.autosaved` | `Auto-saved {name}` | [x] 已迁移 |
| 81 | `已保存 {name}` | `manuscript.saved_status` | `Saved {name}` | [x] 已迁移 |
| 130 | `自动保存中…` | `manuscript.autosaving` | `Auto-saving…` | [x] 已迁移 |
| 130 | `待自动保存…` | `manuscript.pending_save` | `pending auto-save…` | [x] 已迁移 |
| 130 | `已保存` | `common.saved` | `Saved` | [x] 已迁移 |
| 131 | `空（未命名）` | `manuscript.empty_unnamed` | `Empty (unnamed)` | [x] 已迁移 |
| 132 | `草稿已自动暂存（未命名，点「保存」定成文件）` | `manuscript.draft_staged` | `Draft auto-staged (unnamed — click "Save" to make it a file)` | [x] 已迁移 |
| 133 | `内容过大，草稿不暂存（绑定文件后照常自动写盘）` | `manuscript.too_big` | `Content too large; draft not staged (auto-save to file still works once bound)` | [x] 已迁移 |
| 134 | `字符 {chars} · 汉字 {han} · 行 {lines} · 段 {paras} · {save}` | `manuscript.stat_line` | `Chars {chars} · Han {han} · Lines {lines} · Paras {paras} · {save}` | [x] 已迁移 |
| 158 | `当前工作区还有未处理的 AI 结果，继续后会被清除。` | `manuscript.ai_result_warning` | `The workspace still has an unapplied AI result; continuing will clear it.` | [x] 已迁移 |
| 167 | `保存到 {folder}/ 的文件名` | `manuscript.save_prompt` | `File name to save in {folder}/` | [x] 已迁移 |
| 184 | `「（未命名）」里还没落盘的内容会被清掉，继续吗？` | `manuscript.unsaved_clear` | `Content not yet saved in "(Unnamed)" will be cleared. Continue?` | [x] 已迁移 |
| 192 | `已清空，保存时会让你选文件名` | `manuscript.cleared` | `Cleared; you'll pick a file name when saving` | [x] 已迁移 |
| 199,216 | `「（未命名）」里还没落盘的内容会被丢弃，继续吗？` | `manuscript.unsaved_discard` | `Content not yet saved in "(Unnamed)" will be discarded. Continue?` | [x] 已迁移 |
| 209 | `打开失败：{reason}` | `manuscript.open_failed_reason` | `Open failed: {reason}` | [x] 已迁移 |
| 229 | `「{name}」已存在，覆盖吗？` | `manuscript.overwrite_confirm` | `"{name}" already exists. Overwrite?` | [x] 已迁移 |
| 236 | `已导入：{path}` | `manuscript.imported` | `Imported: {path}` | [x] 已迁移 |
| 244 | `workspace/output/ 下还没有产出。` | `manuscript.no_outputs` | `No outputs under workspace/output/ yet.` | [x] 已迁移 |
| 245 | `从产出导入（workspace/output/）` | `manuscript.import_output` | `Import from output (workspace/output/)` | [x] 已迁移 |
| 250 | `删除所有空行` | `manuscript.clean_remove_empty` | `Remove all empty lines` | [x] 已迁移 |
| 251 | `空行合并为一个` | `manuscript.clean_merge_empty` | `Merge empty lines into one` | [x] 已迁移 |
| 252 | `合并段内换行` | `manuscript.clean_merge_breaks` | `Merge line breaks within paragraphs` | [x] 已迁移 |
| 253 | `去掉行首缩进` | `manuscript.clean_trim_indent` | `Remove leading indentation` | [x] 已迁移 |
| 254 | `去首尾空白` | `manuscript.clean_trim` | `Trim whitespace` | [x] 已迁移 |
| 255 | `全角空格→半角` | `manuscript.clean_fullwidth_space` | `Full-width space → half-width` | [x] 已迁移 |
| 256 | `中文引号→英文` | `manuscript.clean_cn_quotes` | `Chinese quotes → straight quotes` | [x] 已迁移 |
| 260,264 | `查找` | `common.find` | `Find` | [x] 已迁移 |
| 261,265 | `替换为` | `common.replace_with` | `Replace with` | [x] 已迁移 |
| 266 | `全部替换` | `manuscript.replace_all` | `Replace all` | [x] 已迁移 |
| 267,611 | `查找替换` | `manuscript.find_replace` | `Find & Replace` | [x] 已迁移 |
| 270 | `替换` | `common.replace` | `Replace` | [x] 已迁移 |
| 288 | `目录：{dir} · 当前：{file}` | `manuscript.dir_status` | `Directory: {dir} · Current: {file}` | [x] 已迁移 |
| 291 | `这个目录里还没有文本文件。` | `manuscript.no_text_files` | `This directory has no text files yet.` | [x] 已迁移 |
| 303 | `新建文本` | `manuscript.new_text` | `New text file` | [x] 已迁移 |
| 315 | `刷新失败：{reason}` | `common.refresh_failed_reason` | `Refresh failed: {reason}` | [x] 已迁移 |
| 320,603 | `文本文件夹` | `manuscript.folder_title` | `Text folder` | [x] 已迁移 |
| 329 | `短期记忆`（默认分类，写入数据） | — | — | [x] 按 Q3 处理 |
| 341 | `内容（可直接改）` | `manuscript.memory_content_label` | `Content (editable)` | [x] 已迁移 |
| 342 | `来源：{source}` | `common.source_prefix` | `Source: {source}` | [x] 已迁移 |
| 343,604 | `导出至记忆` | `manuscript.export_memory` | `Export to Memory` | [x] 已迁移 |
| 346 | `保存到记忆` | `manuscript.save_to_memory` | `Save to Memory` | [x] 已迁移 |
| 349 | `内容为空，未保存。` | `manuscript.empty_not_saved` | `Content is empty; not saved.` | [x] 已迁移 |
| 353 | `稿件处理记忆`（默认标题，写入数据） | — | — | [x] 按 Q3 处理 |
| 357 | `稿件处理`（默认来源） | `nav.text` | `Manuscript` | [x] 数据/输出内容豁免（Q3/Q6） |
| 363 | `已保存到记忆库。` | `manuscript.saved_to_memory` | `Saved to Memories.` | [x] 已迁移 |
| 370 | `工作区没有可导出的文本。` | `manuscript.nothing_export` | `The workspace has no text to export.` | [x] 已迁移 |
| 373 | `{base} · {date}`（导出标题） | `manuscript.export_title` | `{base} · {date}` | [x] 数据/输出内容豁免（Q3/Q6） |
| 375 | `稿件处理 · 工作区` | `manuscript.source_workspace` | `Manuscript · workspace` | [x] 数据/输出内容豁免（Q3/Q6） |
| 383,444 | `工作区还没有可处理的文本。` | `manuscript.nothing_process` | `The workspace has no text to process yet.` | [x] 已迁移 |
| 386 | `AI 处理中…` | `common.processing` | `AI processing…` | [x] 已迁移 |
| 432 | `处理完成` | `manuscript.process_done` | `Processing complete` | [x] 已迁移 |
| 433 | `处理完成，结果在文本下方，可编辑后再应用。` | `manuscript.process_done_hint` | `Processing complete; the result is below the text and can be edited before applying.` | [x] 已迁移 |
| 437 | `处理失败` | `manuscript.process_failed` | `Processing failed` | [x] 已迁移 |
| 438 | `处理失败：{reason}` | `manuscript.process_failed_reason` | `Processing failed: {reason}` | [x] 已迁移 |
| 443 | `AI 正在处理中，请稍候。` | `manuscript.busy` | `AI is processing; please wait.` | [x] 已迁移 |
| 448 | `还没有稿件处理模式。请到「模式管理 → 稿件处理模式」新增，例如「润色修订」。` | `manuscript.no_mode` | `No manuscript modes yet. Create one under Mode Management → Manuscript modes, e.g. "Polish & Revise".` | [x] 已迁移 |
| 449,464 | `AI 辅助 · 稿件处理` | `manuscript.ai_title` | `AI Assist · Manuscript` | [x] 已迁移 |
| 468 | `我们要对文本怎么做？` | `manuscript.ai_question` | `What should we do with the text?` | [x] 已迁移 |
| 470 | `将处理当前工作区全文 {count} 字。结果会显示在文本下方，可编辑后再决定覆盖、删除或转存。` | `manuscript.ai_scope` | `Will process the entire workspace text, {count} chars. The result appears below the text; edit it before deciding to overwrite, delete, or save elsewhere.` | [x] 已迁移 |
| 477 | `模型 {model} · 推理 {effort}` | `manuscript.meta_line` | `Model {model} · Effort {effort}` | [x] 已迁移 |
| 485 | `← 换一种处理` | `manuscript.try_another` | `← Try another action` | [x] 已迁移 |
| 489 | `例如：只调整第 3 段的节奏；统一为第三人称；保留全部对话与情节。` | `manuscript.req_placeholder` | `e.g. Adjust only the pacing of paragraph 3; unify to third person; keep all dialogue and plot.` | [x] 已迁移 |
| 492 | `处理要求（可选）` | `manuscript.req_label` | `Processing instructions (optional)` | [x] 已迁移 |
| 494 | `不填也可以，会按这个模式自己的要求处理。结果会出现在文本下方，可编辑后再应用。` | `manuscript.req_hint` | `Optional; the mode's own instructions will be followed. The result appears below the text and can be edited before applying.` | [x] 已迁移 |
| 497 | `开始处理` | `manuscript.start` | `Start processing` | [x] 已迁移 |
| 512 | `AI 处理结果会显示在这里，可直接修改。` | `manuscript.result_placeholder` | `The AI result appears here and can be edited directly.` | [x] 已迁移 |
| 522-523 | `原文 {before} 字 → 结果 {after} 字 · 可直接修改后再应用。` | `manuscript.result_stat` | `Original {before} chars → result {after} chars · editable before applying.` | [x] 已迁移 |
| 530 | `模型 {model}` | `manuscript.meta_model` | `Model {model}` | [x] 已迁移 |
| 531 | `耗时 {elapsed}s` | `manuscript.meta_elapsed` | `Time {elapsed}s` | [x] 已迁移 |
| 536 | `AI 处理结果` | `manuscript.result_title` | `AI Result` | [x] 已迁移 |
| 538 | `结果由 AI 生成，应用前请自行核对` | `manuscript.result_warning` | `Generated by AI; verify before applying` | [x] 已迁移 |
| 544 | `覆盖原工作区` | `manuscript.overwrite` | `Overwrite workspace` | [x] 已迁移 |
| 547 | `结果为空，无法覆盖。` | `manuscript.result_empty` | `Result is empty; cannot overwrite.` | [x] 已迁移 |
| 548 | `用这个结果覆盖当前工作区？原文本会被替换。` | `manuscript.overwrite_confirm` | `Overwrite the workspace with this result? The original text will be replaced.` | [x] 已迁移 |
| 554 | `已覆盖工作区，文件会自动保存。` | `manuscript.overwritten_file` | `Workspace overwritten; the file will auto-save.` | [x] 已迁移 |
| 554 | `已覆盖工作区（当前是未命名草稿，记得保存）。` | `manuscript.overwritten_draft` | `Workspace overwritten (it's an unnamed draft — remember to save).` | [x] 已迁移 |
| 558 | `转存至记忆` | `manuscript.save_result_memory` | `Save result to Memory` | [x] 已迁移 |
| 561 | `结果为空，无法转存。` | `manuscript.result_empty_save` | `Result is empty; cannot save to Memory.` | [x] 已迁移 |
| 566 | `稿件处理 · AI 结果 · {mode}` | `manuscript.source_ai` | `Manuscript · AI result · {mode}` | [x] 数据/输出内容豁免（Q3/Q6） |
| 584 | `删除结果` | `manuscript.delete_result` | `Delete Result` | [x] 已迁移 |
| 586 | `删除这次 AI 处理结果？工作区原文不会改变。` | `manuscript.delete_result_confirm` | `Delete this AI result? The workspace text is not affected.` | [x] 已迁移 |
| 591 | `已删除处理结果。` | `manuscript.result_deleted` | `AI result deleted.` | [x] 已迁移 |
| 598 | `稿件处理` | `nav.text` | `Manuscript` | [x] 已迁移 |
| 599 | `独立的大文本工作区：上方工具栏可以调用 AI 辅助、打开文本文件夹或导出到记忆库。内容会自动暂存，绑定文件后停手 1.5 秒自动写盘。` | `manuscript.page_desc` | `A standalone large-text workspace: the toolbar above offers AI assist, the text folder, and export to Memory. Content is auto-staged; once bound to a file, it auto-saves 1.5s after you stop typing.` | [x] 已迁移 |
| 602 | `AI 辅助` | `manuscript.ai_assist` | `AI Assist` | [x] 已迁移 |
| 606 | `保存` | `common.save` | `Save` | [x] 已迁移 |
| 607 | `从产出导入…` | `manuscript.import_output_btn` | `Import from output…` | [x] 已迁移 |
| 608 | `从其他导入…` | `manuscript.import_other_btn` | `Import from elsewhere…` | [x] 已迁移 |
| 609 | `另存为 / 导出 txt…` | `manuscript.export_txt_btn` | `Save as / export txt…` | [x] 已迁移 |
| 614 | `文本清理工具` | `manuscript.clean_tools` | `Text cleaning tools` | [x] 已迁移 |
| 622 | `稿件工作区` | `manuscript.workspace_title` | `Manuscript workspace` | [x] 已迁移 |
| 649 | `AI 正在处理中` | `manuscript.lock_title` | `AI is processing` | [x] 已迁移 |
| 650 | `完成前无法修改文本或切换操作。` | `manuscript.lock_hint` | `The text and actions cannot be changed until completion.` | [x] 已迁移 |
| 663 | `文件名.txt` | `manuscript.filename_placeholder` | `filename.txt` | [x] 已迁移 |
| 665 | `UTF-8（推荐）` | `manuscript.enc_utf8` | `UTF-8 (recommended)` | [x] 已迁移 |
| 665 | `UTF-8 带 BOM（部分编辑器）` | `manuscript.enc_utf8_bom` | `UTF-8 with BOM (some editors)` | [x] 已迁移 |
| 665 | `GBK（部分中文站点需要）` | `manuscript.enc_gbk` | `GBK (needed by some Chinese sites)` | [x] 已迁移 |
| 675,719 | `⬆ 上一层` | `manuscript.up_level` | `⬆ Up one level` | [x] 已迁移 |
| 679,726 | `无法访问：{reason}` | `manuscript.access_failed_reason` | `Cannot access: {reason}` | [x] 已迁移 |
| 683 | `目标目录（可以一路点进去，也可以直接改路径）` | `manuscript.dir_label` | `Target directory (click through, or edit the path directly)` | [x] 已迁移 |
| 687 | `编码` | `manuscript.encoding` | `Encoding` | [x] 已迁移 |
| 689 | `导出为 txt` | `manuscript.export_txt` | `Export as txt` | [x] 已迁移 |
| 692 | `导出` | `common.export` | `Export` | [x] 已迁移 |
| 700 | `已导出：{path}（{size}KB）` | `manuscript.exported_size` | `Exported: {path} ({size}KB)` | [x] 已迁移 |
| 728 | `打开文本文件` | `manuscript.open_file` | `Open text file` | [x] 已迁移 |
| 729 | `当前目录` | `manuscript.current_dir` | `Current directory` | [x] 已迁移 |

### 3.8 Python：`server/` 包（接口返回与错误提示）

| 位置 | 原文 | key | 英文初稿 | 译 |
|---|---|---|---|---|
| `server/_api.py:51` | `对话不存在或已被删除` | `errors.session_missing` | `The conversation does not exist or has been deleted` | [x] 已迁移 |
| `server/_api.py:81`、`store/_repository.py:18` | `未知集合: {name}` | `errors.unknown_collection` | `Unknown collection: {name}` | [x] 已迁移 |
| `server/_api.py:111` | `内容为空，未保存` | `errors.empty_not_saved` | `Content is empty; not saved` | [x] 已迁移 |
| `server/_api.py:113` | `AI 工作站生成`（输出文件默认来源名） | — | — | [x] 按 Q4 处理 |
| `server/_api.py:184`、`server/_generation.py:57` | `模式不存在: {id}` | `errors.mode_missing` | `Mode does not exist: {id}` | [x] 已迁移 |
| `server/_api.py:234` | `未知接口: {path}` | `errors.unknown_api` | `Unknown endpoint: {path}` | [x] 已迁移 |
| `server/_base.py:38` | `请求体过大` | `errors.body_too_large` | `Request body too large` | [x] 已迁移 |
| `server/_base.py:68` | `找不到文件: {detail}` | `errors.file_missing` | `File not found: {detail}` | [x] 已迁移 |
| `server/_base.py:96` | `非法路径` | `errors.invalid_path` | `Invalid path` | [x] 已迁移 |
| `server/_base.py:99` | `资源不存在: {path}` | `errors.resource_missing` | `Resource not found: {path}` | [x] 已迁移 |
| `server/_generation.py:23` | `没有可总结的正文内容` | `errors.no_text_summary` | `No text content to summarize` | [x] 已迁移 |
| `server/_generation.py:65` | `工作区没有可处理的文本。` | `errors.workspace_empty` | `The workspace has no text to process.` | [x] 已迁移 |
| `server/_generation.py:68` | `AI 正在生成中，工作站已锁定。请等待本次生成完成。` | `errors.generation_locked` | `AI is generating; the workstation is locked. Please wait for the current generation to finish.` | [x] 已迁移 |
| `server/_helpers.py:26` | `未知的 surface: {name}` | `errors.unknown_surface` | `Unknown surface: {name}` | [x] 已迁移 |
| `server/_helpers.py:31` | `该模式`（兜底名） | `errors.this_mode` | `this mode` | [x] 已迁移 |
| `server/_helpers.py:33` | `「{label}」不是稿件处理模式，不能在稿件处理页使用。` | `errors.not_process_mode` | `"{label}" is not a manuscript mode and cannot be used on the Manuscript page.` | [x] 已迁移 |
| `server/_helpers.py:34` | `「{label}」是稿件处理模式，不能在 AI 工作站使用。` | `errors.is_process_mode` | `"{label}" is a manuscript mode and cannot be used in the AI Workstation.` | [x] 已迁移 |
| `server/_helpers.py:49` | `无法序列化: {type}` | `errors.serialize_failed` | `Cannot serialize: {type}` | [x] 已迁移 |
| `server/_records.py:15-16` | `Markdown（.md）现在只支持导入到「其他设定」；导入后可用「搬运到…」转为自定义设定的条目。` | `errors.md_import_target` | `Markdown (.md) can currently only be imported into "Other Settings"; after import, use "Move to…" to convert entries into a custom section.` | [x] 已迁移 |
| `server/_records.py:24` | `地图表格格式错误：没有找到含「方位」表头的 Markdown 表格` | `errors.map_table_format` | `Map table format error: no Markdown table with a "Position" header found` | [x] 已迁移 |
| `server/_records.py:28,57` | `已导入地图：{count} 个区域` | `messages.map_imported` | `Map imported: {count} regions` | [x] 已迁移 |
| `server/_records.py:40` | `{source}：新增 {added} 条记忆，更新 {updated} 条` | `messages.memory_imported` | `{source}: {added} memories added, {updated} updated` | [x] 已迁移 |
| `server/_records.py:47` | `未知的导入目标: {name}` | `errors.unknown_import_target` | `Unknown import target: {name}` | [x] 已迁移 |
| `server/_records.py:64` | `JSON 格式错误：{detail}` | `errors.json_format` | `JSON format error: {detail}` | [x] 已迁移 |
| `server/_records.py:75` | `{source} → {target}：新增 {added} 条，更新 {updated} 条` | `messages.imported_stats` | `{source} → {target}: {added} added, {updated} updated` | [x] 已迁移 |
| `server/_records.py:91` | `{source} → 其他设定：新增 {added} 条，更新 {updated} 条` | `messages.imported_other` | `{source} → Other Settings: {added} added, {updated} updated` | [x] 已迁移 |
| `server/_records.py:123` | `{section} ← {count} 条` | `messages.auto_sort_line` | `{section} ← {count} entries` | [x] 已迁移 |
| `server/_records.py:126` | `已归类：{report}` | `messages.auto_sorted` | `Sorted: {report}` | [x] 已迁移 |
| `server/_records.py:126` | `没有匹配到可自动归类的条目` | `messages.auto_sort_none` | `No entries matched for auto-sorting` | [x] 已迁移 |
| `server/_records.py:138` | `不支持的集合` | `errors.collection_unsupported` | `Unsupported collection` | [x] 已迁移 |
| `server/_records.py:149` | `未命名`（搬运默认名，写入数据） | — | — | [x] 按 Q3 处理 |
| `server/_records.py:154` | `设定备忘`（默认分类，写入数据） | — | — | [x] 按 Q3 处理 |
| `server/_records.py:156,165,190` | `来自{source}`（默认来源，写入数据） | — | — | [x] 按 Q3 处理 |
| `server/_records.py:169` | `服饰` / `道具`（默认分类，写入数据） | — | — | [x] 按 Q3 处理 |
| `server/_records.py:171` | `上衣`（默认部位，写入数据） | — | — | [x] 按 Q3 处理 |
| `server/_records.py:179` | `其他设定`（数据标签） | — | — | [x] 按 Q3 处理 |
| `server/_records.py:203` | `已搬运 {count} 条 → {target}` | `messages.moved` | `Moved {count} entries → {target}` | [x] 已迁移 |

### 3.9 Python：`ai.py` / `providers.py` / `history.py`

| 位置 | 原文 | key | 英文初稿 | 译 |
|---|---|---|---|---|
| `ai.py:55` | `未配置接口 URL。请在「模型设置」中填写，或选择一个提供商预设。` | `errors.no_api_url` | `No API URL configured. Enter one in Model Settings, or choose a provider preset.` | [x] 已迁移 |
| `ai.py:83` | `未配置 API Key。请到「模型设置」填写，或设置环境变量 {env}。` | `errors.no_api_key` | `No API key configured. Enter one in Model Settings, or set the environment variable {env}.` | [x] 已迁移 |
| `ai.py:173` | `返回内容不是合法 JSON: {detail}` | `errors.not_json` | `Response is not valid JSON: {detail}` | [x] 已迁移 |
| `ai.py:179` | `返回中没有 choices: {detail}` | `errors.no_choices` | `Response has no choices: {detail}` | [x] 已迁移 |
| `ai.py:190` | `模型返回内容为空。` | `errors.empty_response` | `The model returned empty content.` | [x] 已迁移 |
| `ai.py:202` | `未选择模型。请先在「模型设置」获取模型列表，或手动填写模型名。` | `errors.no_model` | `No model selected. Fetch the model list in Model Settings first, or enter a model name manually.` | [x] 已迁移 |
| `ai.py:301` | `获取模型失败：API Key 无效或无权限（HTTP 401）。{detail}` | `errors.fetch_401` | `Failed to fetch models: invalid or unauthorized API key (HTTP 401). {detail}` | [x] 已迁移 |
| `ai.py:303` | `获取模型失败：该接口没有 /models 端点，请手动填写模型名。` | `errors.fetch_no_endpoint` | `Failed to fetch models: this API has no /models endpoint; enter model names manually.` | [x] 已迁移 |
| `ai.py:304` | `获取模型失败（HTTP {code}）：{detail}` | `errors.fetch_http` | `Failed to fetch models (HTTP {code}): {detail}` | [x] 已迁移 |
| `ai.py:306` | `获取模型失败：{type}: {detail}` | `errors.fetch_generic` | `Failed to fetch models: {type}: {detail}` | [x] 已迁移 |
| `ai.py:310` | `获取模型失败：接口返回的不是合法 JSON。` | `errors.fetch_bad_json` | `Failed to fetch models: the API did not return valid JSON.` | [x] 已迁移 |
| `ai.py:325` | `接口返回了模型列表，但没有识别到模型 id；请手动填写。` | `errors.fetch_no_ids` | `The API returned a model list, but no model ids were recognized; enter them manually.` | [x] 已迁移 |
| `providers.py:26,38,51,63,75,87,99,111` | 各提供商 `prompt_note`（UI 展示 + 进入提示词） | `settings.provider_note_*` | 见第 4 节 Q1 | [x] 按 Q1 处理 |
| `providers.py:105` | `自定义 / OpenAI 兼容` | `settings.custom_preset` | `Custom / OpenAI-compatible` | [x] 已迁移 |
| `history.py:50` | `非法的会话 id` | `errors.invalid_session_id` | `Invalid session id` | [x] 已迁移 |
| `history.py:74,83,143` | `新对话 · {mode}`（会话标题默认，写入数据） | — | — | [x] 按 Q2 处理 |
| `history.py:152` | `未命名对话`（会话标题默认，写入数据） | — | — | [x] 按 Q2 处理 |

### 3.10 Python：`project/` 与 `store/`（面向用户的错误）

| 位置 | 原文 | key | 英文初稿 | 译 |
|---|---|---|---|---|
| `project/_browse.py:68` | `用户目录`（磁盘浏览快捷入口） | `browse.user_dir` | `User directory` | [x] 已迁移 |
| `project/_browse.py:71,93` | `目录不存在: {path}` | `errors.dir_missing` | `Directory does not exist: {path}` | [x] 已迁移 |
| `project/_imports.py:120` | `JSON 中没有可导入的记录（需要数组，或 {"items": [...]}）` | `errors.json_no_records` | `No importable records in the JSON (need an array, or {"items": [...]})` | [x] 已迁移 |
| `project/_imports.py:128` | `第 {index} 条记录不是 JSON 对象` | `errors.record_not_object` | `Record #{index} is not a JSON object` | [x] 已迁移 |
| `project/_imports.py:131` | `第 {index} 条记忆缺少 title 或 content` | `errors.memory_missing_fields` | `Memory #{index} is missing title or content` | [x] 已迁移 |
| `project/_imports.py:132` | `未命名记忆`（默认标题，写入数据） | — | — | [x] 按 Q3 处理 |
| `project/_imports.py:133` | `短期记忆`（默认分类，写入数据） | — | — | [x] 按 Q3 处理 |
| `project/_imports.py:138` | `第 {index} 条设定缺少 name 或 title` | `errors.record_missing_name` | `Record #{index} is missing name or title` | [x] 已迁移 |
| `project/_imports.py:139` | `未命名`（默认名，写入数据） | — | — | [x] 按 Q3 处理 |
| `project/_imports.py:143` | `第 {index} 条记录的 elements 必须是数组` | `errors.elements_not_array` | `The elements of record #{index} must be an array` | [x] 已迁移 |
| `project/_imports.py:158` | `地图 JSON 必须是一个对象` | `errors.map_not_object` | `Map JSON must be an object` | [x] 已迁移 |
| `project/_imports.py:161-162` | `地图 JSON 缺少字段：{fields}（需要 rows、cols、cells、regions）` | `errors.map_missing_fields` | `Map JSON is missing fields: {fields} (rows, cols, cells, regions required)` | [x] 已迁移 |
| `project/_imports.py:166` | `地图的 rows 必须是非空字符串数组` | `errors.map_rows_invalid` | `Map rows must be a non-empty array of strings` | [x] 已迁移 |
| `project/_imports.py:168` | `地图的 cols 必须是非空字符串数组` | `errors.map_cols_invalid` | `Map cols must be a non-empty array of strings` | [x] 已迁移 |
| `project/_imports.py:170` | `地图的 cells 必须是对象` | `errors.map_cells_invalid` | `Map cells must be an object` | [x] 已迁移 |
| `project/_imports.py:172` | `地图的 regions 必须是对象` | `errors.map_regions_invalid` | `Map regions must be an object` | [x] 已迁移 |
| `project/_imports.py:177` | `区域 {id} 必须是对象` | `errors.region_not_object` | `Region {id} must be an object` | [x] 已迁移 |
| `project/_imports.py:180` | `区域缺少 id` | `errors.region_missing_id` | `Region is missing id` | [x] 已迁移 |
| `project/_imports.py:183` | `区域 {id} 的 elements 必须是数组` | `errors.region_elements_invalid` | `The elements of region {id} must be an array` | [x] 已迁移 |
| `project/_imports.py:186` | `区域 {id} 的 board 必须是对象` | `errors.region_board_invalid` | `The board of region {id} must be an object` | [x] 已迁移 |
| `project/_imports.py:202` | `地图 cells 的键必须是「行\|列」字符串` | `errors.cells_key_invalid` | `Map cell keys must be "row|col" strings` | [x] 已迁移 |
| `project/_imports.py:206` | `cells 引用了不存在的区域 id：{id}` | `errors.cells_bad_ref` | `cells references a nonexistent region id: {id}` | [x] 已迁移 |
| `project/_imports.py:209` | `世界地图`（默认地图名，写入数据） | — | — | [x] 按 Q3 处理 |
| `project/_paths.py:29` | `路径越出项目目录: {path}` | `errors.path_outside` | `Path is outside the project directory: {path}` | [x] 已迁移 |
| `store/_repository.py:32` | `{file} 不是 UTF-8 编码` | `errors.not_utf8` | `{file} is not UTF-8 encoded` | [x] 已迁移 |
| `store/_repository.py:38` | `{file} 解析失败: {detail}` | `errors.parse_failed_reason` | `{file} parse failed: {detail}` | [x] 已迁移 |

## 4. 边界处理记录（本次实现）

本次依据需求“不改变数据格式、不翻译默认提示词”采用以下处理。存储数据不迁移、不因语言改变默认值；新增数据仍使用原默认值。界面中的既有数据原样显示。

| 编号 | 决定 | 状态 |
|---|---|---|
| Q1 | `public_providers()` 的副本提供翻译后的 UI 标签/说明；模型提示词和 PROVIDERS 原值不变 | [x] 已测试中英 UI 与提示词隔离 |
| Q2 | 会话默认标题属于存储数据，保持原文及原有 startswith 判断；外围历史界面翻译 | [x] 数据兼容 |
| Q3 | 保持数据默认名称、分类、来源、压缩后缀等原文；面向用户的兜底显示文本翻译 | [x] 已核对新增记录默认值 |
| Q4 | 导出头、默认来源与解析关键字保留 | [x] 导入/导出和原自检通过 |
| Q5 | 地图坐标和钱袋档位仍为数据值 | [x] 保留 |
| Q6 | “将发送/导出内容”中的固定标签、拼装标题属于输出内容 | [x] 保留 |
| Q7 | 页面标语和欢迎标题使用 `{version}`，来自 `_version.APP_VERSION` | [x] 完成 |
| Q8 | 语言清单、语言自称由 languages.json 唯一提供 | [x] 完成 |
| Q9 | 首次启动时用所选语言生成一次内置初始化预设（元素模板、自定义栏目、记忆分类、默认模式名/说明、默认记录名、世界地图行列名）并落盘；之后切换语言不改写。仅在该集合仍是未改动的内置默认值时写入，用户数据不受影响 | [x] 完成 |
| Q10 | 提供商预设的接口说明（`provider_note`）固定使用初始语言 `config.initial_language`，未记录时用当前语言 | [x] 完成 |
| Q11 | 内置工作模式与新增模式的系统提示词改为中英双语 key→val（`defaults.mode.*_prompt`），并移除原有 Markdown 标题标记；中文原文保留在 `prompts.py` 作为缺词兜底 | [x] 完成 |

## 5. 英文审校与迁移说明

- [x] 实现侧复核页面名称、按钮术语、整句占位符与中英 key 对齐。
- [x] 中英各 15 个页面渲染，设置、工作站、稿件及模式页面检查结果见 [验证记录](validation.md)。
- [ ] 需求 5.3.7 指定的负责人英文终审 / PR 确认：尚未进行，不以自动化测试代替。

上表原文、位置保留为采集基线；实际行号以当前源码为准。`已迁移` 表示对应界面语义已覆盖，不代表必须保留每个初稿 key 的独立调用。合并/拆分规则如下：

| 初稿 key / 内容 | 当前实现 |
|---|---|
| errors.unknown_collection 的 `{key}` / `{name}` 冲突 | 统一 `{name}`，前后端调用对齐 |
| records.pick_title 的普通/带 label 两种句子 | 普通用 records.pick_title，动态用 records.pick_label |
| manuscript.overwrite_confirm 的覆盖文件/工作区冲突 | 文件用 manuscript.file_overwrite_confirm，工作区保留原 key |
| elements.help_1…4 / sections.help_1…4 | 按完整帮助块合并 elements.help / sections.help |
| elements.new_element_title / under_group / 分组提示 | 改为 new_prompt / new_group_prompt 两种完整句子 |
| records.total + selected_suffix | 有选择时使用 records.count_selected 完整句子 |
| worldmap.delete_confirm / sub / end | 改为 delete_full / delete_with_children 两种完整句子 |
| common.disabled_suffix | 改为 common.disabled_name，名称作占位符 |
| 未使用的初稿/数据默认文案 key | 保留在对齐翻译表中供后续使用；不据此改写数据 |

## 6. 补充 key 与完整翻译表

完整中英对照以 [zh-CN.yml](../../app/resources/localization/zh-CN.yml) 和 [en-US.yml](../../app/resources/localization/en-US.yml) 为准（757 个 key）。以下补充初稿中遗漏、展开后的多项条目及整句替代 key。位置由当前源码引用自动列出，`资源` 表示版本默认参数或动态 key 调用。

| 当前位置 | key | 中文 | 英文 | 状态 |
|---|---|---|---|---|
| `web/views.js:768` | `common.autosave` | 自动保存 | Auto-save | [x] |
| `web/core.js:472` | `common.data_content` | 用户数据、内置示例与默认提示词保留原文。 | User data, built-in examples, and default prompts keep their original language. | [x] |
| `web/config.js:436` | `common.default_content` | 示例 / 默认内容（保留原文） | Example / default content (original language preserved) | [x] |
| `web/config.js:18` | `common.disabled_name` | {name}（已停用） | {name} (disabled) | [x] |
| `web/workstation.js:306` | `common.file_count` | {count} 个文件 | {count} files | [x] |
| `web/records.js:608` | `common.list` | 列表 | List | [x] |
| `web/config.js:76`, `web/config.js:78` | `elements.help` | - 勾选的元素 + 有内容的元素 → 才会出现在**发送给模型**的提示词和**导出的 JSON / TXT**里。<br>- 取消勾选（或留空）的元素不会出现，导出的 JSON 里不会有这个键，也不会留下空行。<br>- 元素名称随便改：改成「外貌」「战斗能力」都行，改动只影响之后导出与发送的标题。<br>- 想让所有人物都自带某组元素：在这里加好，然后点「应用到全部记录」。 | - Checked elements + elements with content → appear in the prompt sent to the model and in the exported JSON / TXT.<br>- Unchecked (or empty) elements do not appear; the exported JSON won't contain the key, and no blank lines are left.<br>- Element names can be renamed freely: "Appearance", "Combat ability", whatever — changes only affect future export and send headings.<br>- To give all characters a set of elements: add them here, then click "Apply to all records". | [x] |
| `web/records.js:120` | `elements.new_group_prompt` | 新增元素（加到「{group}」下面）<br>名称末尾加 / 表示这是分组，可以继续往下分 | New element (under "{group}")<br>End the name with / to create a group that can contain nested elements | [x] |
| `web/records.js:120` | `elements.new_prompt` | 新增元素<br>名称末尾加 / 表示这是分组，可以继续往下分 | New element<br>End the name with / to create a group that can contain nested elements | [x] |
| `web/records.js:345` | `elements.stat_empty` | {total} 项 | {total} entries | [x] |
| `store/_paths.py:67` | `errors.debug_path` | 调试模式路径必须位于 {root}: {path} | Debug paths must be within {root}: {path} | [x] |
| `web/workstation.js:827` | `history.item_meta` | {turns} 轮 · {updated} | {turns} turns · {updated} | [x] |
| `web/workstation.js:827` | `history.list_meta` | {turns} 轮 · {updated} · 当前 | {turns} turns · {updated} · Current | [x] |
| `web/manuscript.js:10` | `manuscript.mode_fallback` | AI 处理 | AI Processing | [x] |
| `web/manuscript.js:115` | `manuscript.editor_placeholder` | 在这里写 / 贴入要处理的稿件… | Write or paste your manuscript here… | [x] |
| `web/manuscript.js:229` | `manuscript.file_overwrite_confirm` | 「{name}」已存在，覆盖？ | "{name}" already exists. Overwrite? | [x] |
| `web/manuscript.js:609` | `manuscript.find_replace_btn` | 查找替换… | Find and replace… | [x] |
| `web/manuscript.js:122` | `manuscript.unnamed_draft` | （未命名，草稿） | (Unnamed draft) | [x] |
| `web/config.js:230` | `modes.follow_default_empty` | 跟随默认模型 | Follow default model | [x] |
| `web/records.js:403` | `records.count_selected` | 共 {total} 条 · 已选 {selected} 条 | {total} entries · {selected} selected | [x] |
| `web/views.js:100` | `records.pick_label` | 选择要添加的{label} | Choose entries to add ({label}) | [x] |
| `web/config.js:172` | `sections.help` | - 每个栏目就是一个普通设定集合：和「其他设定」一样可以放条目、写元素树、导出 JSON / TXT。<br>- 想给栏目配一套默认元素模板：到「元素模板」页，在下拉框里选中这个栏目即可。<br>- 「按分类一键归类」会把「其他设定」里分类名匹配的条目搬进对应栏目，原文与来源都保留。<br>- 删除栏目只删入口，不动文件；想彻底清掉可以自己删 data/section_<key>.json。 | - Each section is an ordinary settings collection: like "Other Settings", it can hold entries, element trees, and JSON / TXT export.<br>- To give a section a default element template: open Element Templates and pick the section in the dropdown.<br>- "Auto-sort by category" moves entries from "Other Settings" whose category matches into the corresponding section; original text and source are preserved.<br>- Deleting a section only removes the entry point, never the file; to remove it completely, delete data/section_<key>.json yourself. | [x] |
| `web/config.js:654` | `settings.openai_compat_note` | 当前使用 OpenAI 兼容接口。 | Using an OpenAI-compatible API. | [x] |
| 资源 | `settings.custom_preset` | 自定义 / OpenAI 兼容 | Custom / OpenAI-compatible | [x] |
| 资源 | `settings.provider_label_dashscope` | 阿里云百炼 / DashScope | Alibaba Cloud / DashScope | [x] |
| 资源 | `settings.provider_label_zhipu` | 智谱 GLM | Zhipu GLM | [x] |
| 资源 | `settings.provider_note_custom` | 当前使用自定义 OpenAI 兼容接口；不要假定具体模型名称、厂商或特殊能力。 | Using a custom OpenAI-compatible API; do not assume a specific model, vendor, or special capabilities. | [x] |
| 资源 | `settings.provider_note_dashscope` | 当前使用 阿里云百炼 的 OpenAI 兼容接口。 | Using Alibaba Cloud DashScope's OpenAI-compatible API. | [x] |
| 资源 | `settings.provider_note_deepseek` | 当前使用 DeepSeek 的 OpenAI 兼容接口。 | Using DeepSeek's OpenAI-compatible API. | [x] |
| 资源 | `settings.provider_note_moonshot` | 当前使用 Moonshot / Kimi 的 OpenAI 兼容接口。 | Using Moonshot / Kimi's OpenAI-compatible API. | [x] |
| 资源 | `settings.provider_note_openai` | 当前使用 OpenAI 的 Chat Completions接口。 | Using OpenAI Chat Completions API. | [x] |
| 资源 | `settings.provider_note_openrouter` | 当前使用 OpenRouter 的 OpenAI 兼容接口。 | Using OpenRouter's OpenAI-compatible API. | [x] |
| 资源 | `settings.provider_note_siliconflow` | 当前使用 SiliconFlow 的 OpenAI 兼容接口。 | Using SiliconFlow's OpenAI-compatible API. | [x] |
| 资源 | `settings.provider_note_zhipu` | 当前使用 智谱 GLM 的 OpenAI 兼容接口。 | Using Zhipu GLM's OpenAI-compatible API. | [x] |
| `web/config.js:903` | `welcome.key_placeholder` | {env}（可稍后填写） | {env} (can be entered later) | [x] |
| `web/config.js:966` | `welcome.preset_note` | 当前使用「{name}」预设接口提示词。 | Using the API prompt for the "{name}" preset. | [x] |
| `web/workstation.js:407` | `workstation.output_meta` | 模型 {model} · 推理 {effort} · 耗时 {elapsed} · tokens {tokens} | Model {model} · reasoning {effort} · time {elapsed} · tokens {tokens} | [x] |
| `web/views.js:561` | `worldmap.axis_name_exists` | 已经有同名的{axis}了。 | A {axis} with that name already exists. | [x] |
| `web/views.js:578`, `web/views.js:654` | `worldmap.batch_rename` | 整批改名 | Rename all | [x] |
| `web/views.js:681` | `worldmap.delete_full` | 删除区域「{name}」？格子会清空。 | Delete region "{name}"? Its cell will be cleared. | [x] |
| `web/views.js:681` | `worldmap.delete_with_children` | 删除区域「{name}」及其 {count} 个子区域？格子会清空。 | Delete region "{name}" and its {count} subregions? Their cells will be cleared. | [x] |
| `web/views.js:637` | `worldmap.subgrid_hint` | 第 {depth} 层的区域挂在这里 | Level {depth} regions belong here | [x] |
| `web/views.js:656` | `worldmap.subgrid` | 子表格 | Subgrid | [x] |

## 7. JS 汉字残留复核

已按 JavaScript 语法树检查字符串字面量（不包括注释）。下列为逐项确认保留的内容；没有通过全局文本替换或运行时扫描中文来翻译。

> 2026-10-25 更新：下表中标注「存储数据 / 默认值」的运行时默认值已改为 `i18n.t('defaults.*')` 动态取词（按当前语言），初始化预设则按首次语言落盘（见第 8 节）。背包「完整外貌拼装」预览的标签（`views.js` 的 `inventory.assembly_title` / `worn_line` / `carried_line` / `purse_line`）也已改为 key 取词。仍保留的只有钱袋档位等数据值、诊断日志与默认提示词。

| 当前位置 | 保留内容 | 原因 | 状态 |
|---|---|---|---|
| `web/config.js:497` | 新稿件处理模式 | 存储数据 / 默认值 | [x] |
| `web/config.js:497` | 新写稿模式 | 存储数据 / 默认值 | [x] |
| `web/config.js:499` | 任务：对用户提供的「待处理文本」进行处理。<br><br> | 默认提示词 | [x] |
| `web/config.js:500` | 要求：<br>1. 严格按用户选择的处理方式与处理要求执行。<br> | 默认提示词 | [x] |
| `web/config.js:501` | 2. 保留原文的事实、人物、设定与情节，不擅自新增。<br> | 默认提示词 | [x] |
| `web/config.js:502` | 3. 直接输出处理后的完整文本，不写前言后语。 | 默认提示词 | [x] |
| `web/config.js:503` | 任务：根据用户提供的设定、当前状态、记忆与提示词完成本次工作。<br><br> | 默认提示词 | [x] |
| `web/config.js:504` | 要求：<br>1. 严格遵循用户提供的设定与提示词。<br>2. 不擅自新增未授权的设定、人物或情节。<br> | 默认提示词 | [x] |
| `web/config.js:505` | 3. 直接输出本次工作结果，不写与任务无关的前言后语。 | 默认提示词 | [x] |
| `web/manuscript.js:167` | 正文_ | 存储数据 / 默认值 | [x] |
| `web/manuscript.js:329` | 短期记忆 | 存储数据 / 默认值 | [x] |
| `web/manuscript.js:353` | 稿件处理记忆 | 存储数据 / 默认值 | [x] |
| `web/manuscript.js:357` | 稿件处理 | 存储数据 / 默认值 | [x] |
| `web/manuscript.js:373` | 稿件处理 | 存储数据 / 默认值 | [x] |
| `web/manuscript.js:375` | 稿件处理 · 工作区 | 存储数据 / 默认值 | [x] |
| `web/manuscript.js:564` | 稿件处理 · AI 结果 ·  | 存储数据 / 默认值 | [x] |
| `web/manuscript.js:661` | 正文_ | 存储数据 / 默认值 | [x] |
| `web/records.js:353` | 未命名 | 存储数据 / 默认值 | [x] |
| `web/records.js:356` | 其他 | 存储数据 / 默认值 | [x] |
| `web/records.js:357` | 其他 | 存储数据 / 默认值 | [x] |
| `web/views.js:62` | 富裕 | 存储数据 / 默认值 | [x] |
| `web/views.js:62` | 一般 | 存储数据 / 默认值 | [x] |
| `web/views.js:62` | 紧张 | 存储数据 / 默认值 | [x] |
| `web/views.js:131` |  · 完整外貌拼装 | 输出内容标签 | [x] |
| `web/views.js:134` | - 穿戴： | 输出内容标签 | [x] |
| `web/views.js:140` | - 随身： | 输出内容标签 | [x] |
| `web/views.js:141` | - 钱袋： | 输出内容标签 | [x] |
| `web/views.js:178` | 北 | 存储数据 / 默认值 | [x] |
| `web/views.js:178` | 中 | 存储数据 / 默认值 | [x] |
| `web/views.js:178` | 南 | 存储数据 / 默认值 | [x] |
| `web/views.js:178` | 西 | 存储数据 / 默认值 | [x] |
| `web/views.js:178` | 中 | 存储数据 / 默认值 | [x] |
| `web/views.js:178` | 东 | 存储数据 / 默认值 | [x] |
| `web/views.js:221` | 北 | 存储数据 / 默认值 | [x] |
| `web/views.js:221` | 南 | 存储数据 / 默认值 | [x] |
| `web/views.js:221` | 西 | 存储数据 / 默认值 | [x] |
| `web/views.js:221` | 东 | 存储数据 / 默认值 | [x] |
| `web/views.js:232` | 未命名区域 | 存储数据 / 默认值 | [x] |
| `web/views.js:702` | 短期记忆 | 存储数据 / 默认值 | [x] |
| `web/views.js:716` | 新记忆 | 存储数据 / 默认值 | [x] |
| `web/views.js:716` | 短期记忆 | 存储数据 / 默认值 | [x] |
| `web/views.js:818` | 压缩记忆 | 存储数据 / 默认值 | [x] |
| `web/views.js:818` | （压缩） | 存储数据 / 默认值 | [x] |
| `web/views.js:819` | 长期记忆 | 存储数据 / 默认值 | [x] |
| `web/workstation.js:505` |  \| 模型  | 诊断运行日志 | [x] |
| `web/workstation.js:505` |  \| 耗时  | 诊断运行日志 | [x] |

ASCII 技术标识（API Key、max_tokens、top_p、模型名、URL、编码名）、品牌和符号保持原文。Python `_defaults.py` 的用户可见 unknown_collection 错误已额外翻译；其余默认数据仍豁免。

## 8. 初始化预设本地化（2026-10-25 新增）

首次启动保存语言时，`store/_localized.py` 会把下列内置默认数据按该语言生成一次并落盘；之后切换语言不再改写。对应 key 统一放在 `defaults.*` 命名空间下，完整中英对照以 `zh-CN.yml` / `en-US.yml` 为准。

| 数据 | 位置 | key 前缀 | 说明 |
|---|---|---|---|
| 元素模板标签与元素名 | `store/_defaults.py::default_schema` | `defaults.schema.*` / `defaults.element.*` | 含人物/势力/道具/装备模板与自定义栏目模板字段 |
| 自定义栏目 | `store/_defaults.py::default_sections` | `defaults.section.*` / `defaults.sections.*` | 栏目名、说明、归类依据 |
| 默认模式名与说明 | `prompts.py::DEFAULT_MODES` | `defaults.mode.*` | 不翻译 system_prompt |
| 记忆分类 | `store/_defaults.py::default_memory_categories` | `defaults.memory.*` | 短期/长期/伏笔/备忘 |
| 道具分类与装备部位 | `store/_defaults.py::default_for` | `defaults.category.*` / `defaults.slot.*` | |
| 其他设定分类 | `store/_defaults.py::default_for` | `defaults.category.*` | |
| 世界地图名称与行列名 | `store/_defaults.py::default_worldmap` | `defaults.map.*` / `defaults.axis.*` | 行列为「方位 + 序号」 |
| 运行时默认记录名 | 前端 `records.js` / `views.js` / `manuscript.js` | `defaults.record.*` / `defaults.region.*` / `defaults.text.*` | 按当前语言取词 |
| 内置模式系统提示词 | `prompts.py::DEFAULT_MODES` | `defaults.mode.*_prompt` | 中英双语、无 Markdown；首次语言保存时随 modes 一起冻结 |
| 新增模式默认提示词 | 前端 `config.js::addModeDialog` | `defaults.mode.new_write_prompt` / `new_process_prompt` | 按当前语言取词 |
| 提供商接口说明 | `providers.py::provider_note` | `providers.note*` | 固定使用初始语言 |

约束：

- `store.default_for` 始终返回原始内置数据，保证既有文件字节兼容；本地化只发生在首次语言保存时；
- `seed_localized_defaults` 仅在集合仍是未改动的内置默认值时写入，用户已编辑的数据不会被覆盖；
- 导出格式关键字（`行`/`列`/`格`/`分类`/`内容`…）与解析关键字（`方位`/`世界地图`/`短期记忆`）仍保留原文，不受影响；
- `context.item_brief` 的元素名查找改为按所有已配置语言尝试候选键名，兼容初始化时冻结的键名。

## 9. 许可与免责声明文案（2026-10-25 新增）

设置页「关于」卡片新增 GPL-3.0 许可与免责声明区块（GPL-3.0 §5(d) 要求交互式界面展示版权、免责声明与许可信息）。对应 key 统一放在 `settings.license_*` 命名空间下，中英对齐以 `zh-CN.yml` / `en-US.yml` 为准。

| 当前位置 | key | 中文 | 英文 | 状态 |
|---|---|---|---|---|
| `web/config.js:867` | `settings.license_title` | 许可与免责声明 | License & Disclaimer | [x] |
| `web/config.js:868` | `settings.license_copyright` | Copyright (C) 2026 DreamInsight24 and NovelHelper contributors | Copyright (C) 2026 DreamInsight24 and NovelHelper contributors | [x] |
| `web/config.js:869` | `settings.license_body` | 本程序是自由软件：你可以依据自由软件基金会发布的《GNU 通用公共许可证》（GPL）第 3 版或任何后续版本重新分发和/或修改它。 | This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. | [x] |
| `web/config.js:870` | `settings.license_warranty` | 本程序按「原样」提供，不提供任何担保；详情见 GNU 通用公共许可证。 | This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details. | [x] |
| `web/config.js:872` | `settings.license_view` | 查看许可证全文与对应源码： | View the full license and the corresponding source: | [x] |

约束：

- `settings.license_copyright` 为法律声明，中英保持一致，不随界面语言变化；
- 新增 key 不含 `{placeholder}`，两种语言占位符集合一致；
- `settings.license_body` / `settings.license_warranty` 的措辞须与 `LICENSE` 中的 GPL-3.0 全文一致；许可证变更时需同步更新本区块与设置页文案。

## 10. AI 设定生成文案（2026-10-31 新增）

v2610.3 任务 3 的新增界面文案，统一放在 `setting_gen.*` 与 `errors.setting_gen_*` 命名空间下，中英对齐以 `zh-CN.yml` / `en-US.yml` 为准。入口位于记录型设定页页头与空状态，对话框含免责说明、文本输入、导入目录文件读取；结果摘要含新增/跳过/写入栏目与撤销按钮。

| 当前位置 | key | 中文 | 英文 | 状态 |
|---|---|---|---|---|
| `web/records.js`（AI 设定生成对话框/结果框） | `setting_gen.title` / `setting_gen.button` | AI 生成设定 | Generate Settings with AI / AI Generate | [x] |
| 同上 | `setting_gen.notice` | AI 可能出错，生成后请检查。 | AI can make mistakes; please review the generated entries. | [x] |
| 同上 | `setting_gen.source_label` / `setting_gen.placeholder` | 设定素材文本 / 粘贴一段与设定相关的非结构化文本…… | Source text / Paste unstructured text… | [x] |
| 同上 | `setting_gen.file_label` / `setting_gen.file_read` / `setting_gen.no_text_files` / `setting_gen.loaded` / `setting_gen.load_failed_reason` | 从导入目录读取 / 读取 / {path} 中没有 .txt/.md 文件。 / 已读取 {path} / 读取失败：{reason} | Read from import folder / Read / No .txt/.md files in {path}. / Loaded: {path} / Read failed: {reason} | [x] |
| 同上 | `setting_gen.start` / `setting_gen.busy` / `setting_gen.cancel_wait` / `setting_gen.failed_reason` | 开始生成 / 正在生成…… / 取消等待 / 生成失败：{reason} | Start / Generating… / Cancel wait / Generation failed: {reason} | [x] |
| 同上 | `setting_gen.result_title` / `setting_gen.added` | 生成结果 / 新增 {added} 条，跳过 {skipped} 条同名记录。 | Generation result / Added {added}, skipped {skipped} duplicate(s). | [x] |
| 同上（条目级明细） | `setting_gen.added_section` / `setting_gen.dropped_section` / `setting_gen.unnamed_item` / `setting_gen.field_drops` | 已添加 / 未添加 / （未命名） / 忽略 {n} 个无效字段 | Added / Not added / (unnamed) / {n} invalid field(s) ignored | [x] |
| 同上（未添加原因） | `setting_gen.reason_duplicate` / `setting_gen.reason_unknown` / `setting_gen.reason_disabled` / `setting_gen.reason_invalid` / `setting_gen.reason_empty` / `setting_gen.reason_overflow` | 同名已存在 / 未知栏目 / 栏目未启用 / 名称无效 / 无内容可写入 / 超出单次数量上限 | duplicate name / unknown target / section disabled / invalid name / nothing to write / over the record cap | [x] |
| 同上 | `setting_gen.undo` / `setting_gen.undo_done` / `setting_gen.undo_failed_reason` | 撤销本次生成 / 已撤销 {removed} 条；{kept} 条已修改的记录被保留。 / 撤销失败：{reason} | Undo this generation / Undid {removed} record(s); kept {kept} modified. / Undo failed: {reason} | [x] |
| `server/_generation.py`（后端错误） | `errors.setting_gen_empty` / `errors.setting_gen_too_long` / `errors.setting_gen_parse` / `errors.setting_gen_nothing` / `errors.setting_gen_undo_missing` / `errors.setting_gen_undo_failed` | 请先粘贴或选择要生成的设定文本。 / 文本过长（超过 {max} 字符），请分次处理。 / AI 返回的内容无法解析为设定条目，请重试。 / 没有可写入的设定条目，请检查文本内容。 / 没有可撤销的生成记录。 / 撤销失败：{detail} | Paste or pick the text to generate settings from first. / The text is too long (over {max} characters). Please process it in smaller parts. / The AI response could not be parsed into setting entries. Please try again. / No setting entries could be written. Please check the source text. / There is no generation to undo. / Undo failed: {detail} | [x] |

### 随本次修改的既有 key（移除环境变量提示）

API Key 改为只读取应用配置、不再回退环境变量（见 CHANGELOG Security），以下文案同步去掉 `{env}` 占位符：

| key | 中文 | 英文 | 状态 |
|---|---|---|---|
| `errors.no_api_key` | 未配置 API Key。请到「模型设置」填写。 | No API key configured. Enter one in Model Settings. | [x] |
| `settings.key_placeholder` | 粘贴 API Key | Paste your API key | [x] |
| `settings.no_key_hint` | 还没有填写 API Key，请在下方填写。 | No API key yet. Enter one below. | [x] |
| `welcome.key_placeholder` | API Key（可稍后填写） | API key (can be entered later) | [x] |

约束：隐藏系统提示词（`setting_gen.SYSTEM_PROMPT` / `setting_gen.REPAIR_PROMPT`）不进入翻译表、不出现在界面与日志；目录中的栏目名/用途随当前小说数据（schema/sections）取词，属用户数据不翻译。
