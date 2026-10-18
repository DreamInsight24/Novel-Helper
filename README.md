# NovelHelper v2610.1

本地优先的 AI 小说创作工具。设定、记忆、模式和对话历史都保存在本机；服务只监听 `127.0.0.1`。

当前版本定义为基础版本 `v2610.1`。

## 快速开始

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

第一次打开会显示模型配置向导：

- 选择提供商预设，或填写自定义 OpenAI 兼容 URL；
- 填写 API Key；
- 从接口获取模型，或手动填写模型名；
- 选择默认模型和默认推理强度；
- 可以测试连接，也可以直接跳过。

跳过不会影响编辑设定和使用界面，只会提示你尚未完成模型配置。之后可以在「模型设置 → 设置向导」重新打开。

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

每个模式就是一套独立的系统提示词，并拥有自己的模型与参数。

- 新增、删除、排序模式；
- 在模式顶部设置模型、推理强度、`max_tokens`、`top_p`、`temperature`、`thinking`；
- 编辑该模式的系统提示词；
- 切换接口后，可用「同步到当前接口」把模式统一到当前默认模型。

### AI 工作站

左侧配置输入，右侧查看 AI 输出：

1. 选择工作模式；
2. 勾选人物、记忆、世界观条目等需要带入的设定；
3. 填写当前状态、用户提示词和可选补充要求；
4. 点「开始生成」。生成期间工作站会完全锁定；
5. 在右侧查看结果，可以：
   - 追加到用户提示词（不覆盖原文）；
   - 另存为 TXT 或 MD；
   - 转到纯文本工作站；
   - 复制或查看原文。

右侧「当前对话」显示最近几轮；「对话历史」可以查看全部会话并切换当前对话。

### 设定与导入

- 人物档案、势力、道具、装备、记忆、自定义栏目和地图都支持 JSON 导入。
- Markdown（`.md`）只允许导入到「其他设定」，之后再搬运为其他设定条目。
- 地图 JSON 必须包含 `rows`、`cols`、`cells`、`regions`，格式错误会明确提示。
- 所有 AI 输出末尾都会自动附加 AI 生成声明。

### 纯文本工作站

用于整理最终文本：自动暂存、绑定文件后自动保存、清理空行、合并段内换行、查找替换、导出 TXT。

## 数据与日志

首次启动后生成：

```text
app/
├── data/                 设定、模式、配置、对话历史
├── workspace/
│   ├── import/           导入文件
│   ├── export/           导出文件
│   ├── output/           正文与计划
│   └── text/             纯文本工作站
└── ...
log/
└── novelhelper.log       操作、AI 交互与错误日志
```

每次启动会新建 `log/novelhelper_YYYYMMDD_HHMMSS.log`，最多保留 10 个日志文件，超出时自动删除最早的。API Key 不会写入日志。

对话历史只保存设定条目的 ID 指针，不重复保存整份设定；失效指针在读取时自动跳过。

## 开发者调试模式

调试模式只能通过命令行启动，使用独立的 `app/debug/` 数据、输出和日志目录，与正式版本互不共享。界面会显示 `DEBUG` 标识。

```bash
python app/run.py --debug
python app/run.py --debug --port 8790
```

调试模式默认端口为 `8766`，可用 `--port` 临时指定。清理调试模式产生的全部文件：

```bash
python app/run.py --clean-debug
```

`app/debug/` 已加入 `.gitignore`。

## 命令行工具

在 `app/` 目录下运行：

```bash
python tools/writer.py --dry-run
python tools/writer.py -r
python tools/checker.py --all
python tools/fixer.py --text "第3段改成……"
python tools/idea_helper.py -n 5 --save
python tools/md2txt.py --newest
```

模型、API Key 和目录来自 `app/data/config.json`；界面里的工作模式以 `app/data/modes.json` 为准。

## 自检

```bash
python app/selftest.py
```

自检使用临时目录，不联网、不修改真实数据。

## 隐私

- 服务默认只监听本机，不要在没有保护的情况下暴露到公网。
- API Key 只保存在本机 `app/data/config.json`。
- `app/data/`、`app/workspace/`、`app/log/` 已加入 `.gitignore`。

## License

[MIT](LICENSE)
