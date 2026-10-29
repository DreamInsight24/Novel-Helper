# NovelHelper v2610.1

本地优先的 AI 小说创作工具。设定、记忆、模式和对话历史都保存在本机；服务只监听 `127.0.0.1`。

## 使用声明

本工具仅供合法的文学创作与学习交流使用。请勿使用本工具制作、传播违法违规内容，或从事任何违反法律法规、公序良俗的行为。使用者应自行承担相关责任。

## 下载即用版（Windows EXE）

不想安装 Python，可以直接使用 GitHub Releases 中的 `NovelHelper.exe`：

1. 打开 [最新版本](https://github.com/DreamInsight24/Novel-Helper/releases/latest)，下载 `NovelHelper.exe`。
2. 把 EXE 放进一个有写入权限的文件夹，例如 `D:\NovelHelper\`，再双击运行。
3. 浏览器会自动打开 `http://127.0.0.1:8765/`；关闭控制台窗口即停止服务。

EXE 是单文件便携版，不需要安装。首次启动会在 EXE 旁边创建 `data/`、`workspace/` 和 `log/`，升级时只需替换 EXE。请保留这三个目录，否则设定、对话历史和导出文件不会保留。

> 程序尚未进行代码签名，Windows SmartScreen 可能提示“未知发布者”。确认文件来自本仓库的 Releases 后，可选择“更多信息 → 仍要运行”。

如果 EXE 所在目录不可写，可以设置环境变量 `NOVELHELPER_HOME` 指向可写目录：

```bat
set NOVELHELPER_HOME=D:\NovelHelperData
NovelHelper.exe
```

可以随时检查安装是否完整、数据目录是否可写：

```bat
NovelHelper.exe --check
```

## 从源码运行

### Windows

1. 安装 Python 3.10 或更高版本。
2. 双击 `NovelHelper.bat`。
3. 浏览器打开 `http://127.0.0.1:8765/`。
4. 按首次引导选择接口、填写 API Key 并选择模型。可以跳过，稍后在「模型设置」中配置。

### 命令行启动

```bash
python app/run.py
python app/run.py --port 9000
python app/run.py --no-browser
```

不使用 `--port` 时，会读取 `app/data/config.json` 里的端口配置。

## 首次引导

第一次打开会进入两步引导：

1. 选择语言：可选列表，点击即时预览；部分初始化预设（元素模板、自定义栏目、记忆分类、默认模式名与说明、默认记录名、世界地图行列名等）会按这里选择的语言生成并保存，之后切换语言不会改写。
2. 接口设置：选择提供商预设，或填写自定义 OpenAI 兼容 URL；填写 API Key；获取或手动填写模型；选择默认模型和默认推理强度。

两步之间可以返回上一步。接口设置可以跳过，稍后在「模型设置 → 设置向导」重新打开。

## 日常使用

### 模型设置

- 选择 DeepSeek、OpenAI、OpenRouter、SiliconFlow、Moonshot/Kimi、阿里云百炼、智谱 GLM 或自定义接口。
- URL 和 API Key 都可以手动填写；自定义或本地接口允许不填 Key。
- 「从接口获取可用模型」会读取当前 URL 的 `/models`；也可以手动维护模型列表。
- DeepSeek 预设当前提供 `deepseek-flash` 与 `deepseek-v4-pro`。
- 设置默认模型、默认推理强度和超时。
- **端口号**：在「模型设置 → 应用」修改，保存后下一次启动自动使用新端口；命令行 `--port` 可临时覆盖。
- 「测试连接」只发送一条很短的测试请求，不会写入对话历史。

### 模式管理

模式分成两类，分别给两个工作界面使用：

- **写稿模式**：只出现在「AI 工作站」，用于从设定和提示词生成新内容；
- **稿件处理模式**：只出现在「稿件处理」页，用于处理已有稿件（默认有「润色修订」）。

两类模式在「模式管理」页用页签分开，互不混淆。每个模式都是一套独立的系统提示词，并拥有自己的模型与参数：

- 在当前页签新增模式；
- 在模式顶部设置模型、推理强度、`max_tokens`、`top_p`、`temperature`、`thinking`；
- 编辑「用途」可以把模式移到另一组；
- 编辑该模式的系统提示词；
- 切换接口后，可用「同步到当前接口」把模式统一到当前默认模型。

### AI 工作站

只使用**写稿模式**，采用连续对话布局：

- 左侧「返回作品库」下方的「对话」可展开或收起历史，右侧「+」新建对话；当前对话为空时复用它。点击历史直接继续写作，每条历史的「⋯」打开就近的小菜单，可重命名或删除，删除需再次确认。
- 中央按轮次展示用户要求与 AI 正文，每条结果分别支持复制、另存为 TXT/MD、转到稿件处理、追加到提示词和查看原文；长正文可以收起。
- 底部输入本次写作要求，直接选择写稿模式与目标字数；「详细输入」打开右侧抽屉，默认显示侧栏设定，可从「更多设定」添加其他栏目，再在下方选择具体条目；补充说明与要求统一填写，旧内容自动合并。
- 每段对话保留未发送草稿；生成成功后清空本次提示词，失败保留输入并可重试。支持 Ctrl+Enter 发送。
- 续写按时间顺序携带最近最多 8 个完整轮次，历史合计不超过 60,000 字符，超出预算时从最旧轮次起舍弃；本次设定按当前选择重新拼装。「预览将发送的内容」可查看历史消息及当前提示词。
- 生成期间显示进度状态，可阅读前文；当前接口仍在完整响应后展示正文。

### 设定与导入

- 新建人物、势力、道具或自定义条目时，只需填写名称，可补充一句话概述与正文；确认创建后才保存，取消不会留下空记录。
- 编辑页分为「内容 / 关联 / 更多」：内容页按需添加模板信息分组；分类、备注、来源、字段结构和删除等位于更多页。
- 人物所属势力和势力成员使用同一份关联，支持搜索选择、就地新建、身份说明和双向跳转。旧的文字关系保留，不按名称自动转换；其他条目关系仍可通过正文或原字段描述。
- 元信息（原元素模板）迁至「设定管理 → 对应栏目 → 编辑」，与栏目名称、说明一起维护。支持字段分组、增删、层级、排序、启停、导出模板 JSON，以及确认后向已有条目补充缺失字段；不覆盖已填值。
- JSON 导入统一位于「设定管理 → 导入设定」，先选择目标栏目，再从导入目录选择文件或选择本地文件。地图与记忆 JSON 也在此导入。
- Markdown（`.md`）只允许导入到「其他设定」，之后再搬运为其他设定条目。
- 地图 JSON 必须包含 `rows`、`cols`、`cells`、`regions`。同名条目按现有规则合并更新；格式与操作说明位于「?」帮助中。
- 新正文、概述与人物势力关联会进入 AI 上下文；旧元素字段和备注继续保留，导入导出支持新正文与概述。

### 稿件处理

稿件处理属于**当前小说**，与 AI 工作站中的对话无关。每本小说分别保存素材、正文草稿和绑定文件。

- 顶部以小卡片展示素材：AI 工作站转入的结果、外部 TXT/Markdown 文件、当前作品的章节都先加入素材区，不覆盖正文。
- 点击卡片预览；拖动到正文任意文字位置插入，或使用预览中的「插入到光标处」。插入是复制，移除卡片不会删除正文或原文件。
- 素材栏的蓝色文件夹图标可以新建文件夹；左上角前后箭头切换素材浏览层级；拖动素材到文件夹，或使用卡片的移动按钮归档。文件夹随小说保存。
- 「导入文件」支持多选 TXT/MD，自动识别 UTF-8 或 GBK 编码；「从章节导入」从本小说已有的章节产出中选择。
- 初次打开会提供三份标为「示例文档」的模拟素材；不会覆盖草稿，可直接移除。
- 「文本处理工具」集中提供文本清理和查找替换；有选区时默认只处理选区，否则处理全文。插入、编辑、清理和替换可撤销、重做。
- 工具栏提供 AI 辅助、保存、导出 TXT 和「导入至章节」；章节保存正文原文，同名文件自动编号。正文自动暂存；绑定到文件后停手 1.5 秒自动写盘，离开页面时保存。
- AI 处理结果显示在正文下方，可继续修改、覆盖正文或转存记忆。稿件处理不会写入 AI 工作站的对话历史。

## 数据与日志

v2610.3 起，应用启动后先显示首页（作品库 + 全局设置）。新安装会初始化空作品库，不会自动创建小说，也不会尝试迁移开发期的旧数据布局。创建小说后，每本小说的数据与工作区分别保存在 `data/novels/<novel_id>/` 和 `workspace/novels/<novel_id>/`。打开小说后进入该小说的工作区，左侧导航切换为小说内页面；小说内“设定”分组可折叠，右侧齿轮进入设定管理；新作品默认展示人物档案、世界设定、地图设定、势力设定。世界等记录型栏目支持单层分类、分类筛选及分类管理。一键归类暂未实现，后续功能见 `docs/todolist.md`。小说配置默认继承全局配置，小说设置页直接编辑本小说配置并提供“恢复全局配置”按钮（与全局一致时置灰）；全局配置在首页“全局设置”中编辑。删除小说会把数据和工作区移入系统回收站。

从源码运行时，首次启动后生成：

```text
app/
├── data/
│   ├── config.json       全局配置与活动小说 ID
│   └── novels/           各小说设定、模式、历史、配置与会话
├── workspace/
│   └── novels/           各小说隔离的导入、导出、正文与稿件工作区
└── ...
log/
└── novelhelper.log       操作、AI 交互与错误日志
```

从 EXE 运行时，目录与 EXE 同级：

```text
NovelHelper.exe
├── data/
│   ├── config.json       全局配置与活动小说 ID
│   └── novels/           每本小说独立的数据、配置与会话
├── workspace/
│   └── novels/           每本小说隔离的导入、导出、正文与稿件处理工作区
└── log/                  操作、AI 交互与错误日志
```

PyInstaller 的程序文件会解包到系统临时目录，但数据不会写入临时目录，因此每次启动都能继续使用同一份设定。可用 `NOVELHELPER_HOME` 改变整个运行目录，或用 `NOVELHELPER_DATA` 只改变数据目录。

每次启动会新建 `log/novelhelper_YYYYMMDD_HHMMSS.log`，最多保留 10 个日志文件，超出时自动删除最早的。API Key 不会写入日志。

对话历史只保存设定条目的 ID 指针，不重复保存整份设定；失效指针在读取时自动跳过。

## 开发者调试模式

调试模式只能通过命令行启动，使用独立的 `app/debug/`（EXE 版为 EXE 旁边的 `debug/`）数据、输出和日志目录，与正式版本互不共享。界面会显示 `DEBUG` 标识。

```bash
python app/run.py --debug
python app/run.py --debug --port 8790
```

调试模式默认端口为 `8766`，可用 `--port` 临时指定。清理调试模式产生的全部文件：

```bash
python app/run.py --clean-debug
```

`app/debug/` 已加入 `.gitignore`。

## 自检

```bash
python app/selftest.py
```

自检使用临时目录，不联网、不修改真实数据。

## 打包 Windows EXE

仓库内置 [PyInstaller](https://pyinstaller.org/) 配置 `NovelHelper.spec`，会把 Python、`openai` 依赖和网页资源一起打进单个 `NovelHelper.exe`。

本地构建：

```bat
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r app\requirements.txt -r requirements-build.txt
.venv\Scripts\pyinstaller.exe --clean --noconfirm NovelHelper.spec
dist\NovelHelper.exe --check
```

构建结果位于 `dist\NovelHelper.exe`。`build/` 和 `dist/` 已加入 `.gitignore`。

### GitHub Actions 自动构建

`.github/workflows/build-windows.yml` 会在以下时机自动构建：

- 手动触发 `workflow_dispatch`；
- 修改 `app/`、spec 或工作流文件的 Pull Request（仅生成构建产物）；
- 推送形如 `v*` 的标签时，自动创建 GitHub Release 并附上 EXE。

发布新版本：

```bash
git tag v2610.2
git push origin v2610.2
```

构建完成后可在 Actions 的 `Artifacts` 下载 `NovelHelper-windows-x64`，或在 Releases 中直接下载 `NovelHelper.exe`。工作流会先运行 `app/selftest.py`，再执行 `NovelHelper.exe --check`，两项都通过才会上传产物。

## 隐私

- 服务默认只监听本机，不要在没有保护的情况下暴露到公网。
- API Key 只保存在本机的 `config.json`（源码运行时为 `app/data/config.json`，EXE 运行时为 EXE 旁边的 `data/config.json`）。
- `app/data/`、`app/workspace/`、`app/log/` 已加入 `.gitignore`。

## License

本项目以 [GNU 通用公共许可证 v3.0 或更高版本](LICENSE)（GPL-3.0-or-later）授权。

- 版权：Copyright (C) 2026 DreamInsight24 and NovelHelper contributors。
- 你可以自由使用、复制、修改与再分发本项目，但须遵守 GPL-3.0 的条款：保留版权与许可声明、标注修改内容及日期、以相同许可发布修改后的版本，并在分发二进制（如 `NovelHelper.exe`）时一并提供对应源码。
- 本项目按「原样」提供，不提供任何担保。完整条款见 [LICENSE](LICENSE)。

### 对应源码（Corresponding Source）

根据 GPL-3.0 第 6 条，随二进制分发的对应源码即本仓库本身：

- 源码仓库：<https://github.com/DreamInsight24/Novel-Helper>
- 构建配置：`NovelHelper.spec`；构建工作流：`.github/workflows/build-windows.yml`
- 与某个 Release 中的 `NovelHelper.exe` 完全对应的源码，请以该 Release 的 tag 检出本仓库。

### 条目关联图

- 任意设定条目、记忆和地图区域可跨栏目关联，支持单向、双向、自定义关系与备注；同一条关系从两端查看。
- 「关联」页默认展示当前条目及直接邻居，＋展开间接关联。共享条目合并成单个节点，允许环；可拖动节点、缩放、平移和切换中心。单图最多显示 60 个节点。
- 关系按小说保存在 relations.json。既有势力成员迁移为「人物 → 势力：隶属」；旧 members/member_roles 字段保留为兼容投影。删除条目会清理关联，移动条目会重定向关联。
- AI 详细输入只附带本次两端均已勾选的条目关系，不自动展开其他条目的正文。
- `python scripts/seed_relation_demo.py` 可向当前活动小说添加带「【示例】」标记的关系演示数据；重复执行不会重复添加。
