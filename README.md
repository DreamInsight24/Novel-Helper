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

只使用**写稿模式**。左侧配置输入，右侧查看 AI 输出：

1. 选择写稿模式；
2. 勾选人物、记忆、世界观条目等需要带入的设定；
3. 填写当前状态、用户提示词和可选补充要求；
4. 点「开始生成」。生成期间工作站会完全锁定；
5. 在右侧查看结果，可以：
   - 追加到用户提示词（不覆盖原文）；
   - 另存为 TXT 或 MD；
   - 转到稿件处理页；
   - 复制或查看原文。

右侧「当前对话」显示最近几轮；「对话历史」可以查看全部会话并切换当前对话。

### 设定与导入

- 人物档案、势力、道具、装备、记忆、自定义栏目和地图都支持 JSON 导入。
- Markdown（`.md`）只允许导入到「其他设定」，之后再搬运为其他设定条目。
- 地图 JSON 必须包含 `rows`、`cols`、`cells`、`regions`，格式错误会明确提示。
- AI 输出会附加生成声明；稿件处理结果在文本下方显示时可以继续编辑，应用后会去掉声明尾部。

### 稿件处理

「稿件处理」页是一个独立的大文本工作区，用来整理和加工已有稿件：

- 上方工具栏：AI 辅助、文本文件夹、导出至记忆、保存、导入、另存为、查找替换；
- 文本会自动暂存；绑定到 `workspace/text/` 里的文件后，停手 1.5 秒自动写盘；
- 点「AI 辅助」后选择稿件处理模式（默认「润色修订」），填写处理要求并开始处理；
- 处理结果出现在文本下方，可以直接修改，并选择：
  - 删除结果；
  - 覆盖原工作区；
  - 转存至记忆库；
- 「文本文件夹」用弹窗浏览、新建和切换 `workspace/text/` 里的文件；
- 「导出至记忆」把当前工作区全文保存为一条记忆（标题、分类、章节都可改）。

稿件处理不会写进 AI 工作站的对话历史，也不会覆盖 AI 工作站最近一次的写稿输出；最近一次处理结果会保留在稿件处理页，刷新浏览器后仍在。

## 数据与日志

从源码运行时，首次启动后生成：

```text
app/
├── data/                 设定、模式、配置、对话历史
├── workspace/
│   ├── import/           导入文件
│   ├── export/           导出文件
│   ├── output/           正文与计划
│   └── text/             稿件处理工作区
└── ...
log/
└── novelhelper.log       操作、AI 交互与错误日志
```

从 EXE 运行时，目录与 EXE 同级：

```text
NovelHelper.exe
├── data/                 设定、模式、配置、对话历史
├── workspace/            导入、导出、正文与稿件处理工作区
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

[MIT](LICENSE)
