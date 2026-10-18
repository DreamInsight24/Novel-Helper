# NovelHelper

一个本地优先、面向长篇小说创作的开源工具。它把人物、世界观、记忆和工作模式整理成结构化数据，再按需发送给兼容 OpenAI Chat Completions 的模型接口。

项目默认不包含任何小说数据、个人设定或 API Key。首次启动会在 `app/` 下生成本地数据目录。

## 功能

- **多提供商配置**：内置 DeepSeek、OpenAI、OpenRouter、SiliconFlow、Moonshot / Kimi、阿里云百炼、智谱 GLM 预设，也支持任意自定义 OpenAI 兼容 URL。
- **模型自动获取**：通过当前 URL 的 `/models` 端点拉取可用模型，也可以手动填写模型名。
- **动态工作模式**：每个模式就是一套独立的系统提示词，并拥有自己的模型、推理强度和高级参数；模式可以新增、删除、排序。
- **AI 工作站**：左侧配置输入，右侧显示 AI 输出；生成期间整个工作站锁定。
- **按需带入设定**：人物、记忆、世界观、势力、世界地图、当前状态、附加资料都可以逐项勾选。
- **自动拼装**：user 消息按栏目 / 设定名称自动生成标题，不再需要维护“任务说明”“字数说明”等区块标题。
- **AI 生成声明**：所有 AI 输出末尾自动附加生成声明，历史记录与导出文件也会保留。
- **对话历史**：每轮自动保存用户提示词与 AI 输出；设定只保存 ID 指针，指针失效时自动跳过。
- **JSON 导入**：人物、势力、道具、装备、记忆、自定义栏目和地图都可以导入 JSON；地图等特殊格式会做结构校验并给出错误提示。
- **本地优先**：服务默认只监听 `127.0.0.1`，数据以 JSON 保存在本机；没有遥测，没有云端账号。

## 快速开始

### Windows

1. 安装 Python 3.10 或更高版本。
2. 双击根目录的 `NovelHelper.bat`。
3. 浏览器会自动打开 `http://127.0.0.1:8765/`。
4. 进入「模型设置」，选择提供商，填写 API Key；也可以设置对应的环境变量（如 `DEEPSEEK_API_KEY`、`OPENAI_API_KEY`）。
5. 点「从接口获取可用模型」自动填充模型列表，或手动填写模型名。
6. 在「AI 工作站」勾选设定、写用户提示词、选择工作模式，然后开始生成。

### 命令行启动

```bash
python app/run.py
python app/run.py --port 9000
python app/run.py --no-browser
```

项目只依赖 Python 标准库即可运行；如果环境里安装了 `openai`，会自动使用它，否则退回标准库 `urllib`。

可选安装 SDK：

```bash
pip install -r app/requirements.txt
```

## 模型与提供商

「模型设置」支持：

- 提供商预设，切换时会加载对应的 URL、模型列表和默认参数，并保存每个提供商自己的配置。
- 手动填写任意 OpenAI 兼容 URL。
- 手动填写 API Key；自定义或本地接口允许留空。
- 从 `/models` 自动获取模型，或手动维护模型列表。
- 默认模型与默认推理强度。
- 连通性测试。
- 目录设置。

当 URL 与预设不一致时，会按“自定义接口”处理，使用通用接口提示词，不强调具体模型或厂商。

### 模式管理

「模式管理」取代旧版提示词分组。每个模式包含：

- 模式名称与说明；
- 模型（可跟随默认模型，也可以单独选择）；
- 推理强度；
- `max_tokens`、`top_p`、`thinking` 等高级参数；
- 完整的系统提示词。

新增模式时可以选择是否拼装目标字数。模型选项来自当前接口的模型列表；切换提供商后，可用「同步到当前接口」把所有模式统一到默认模型。

## AI 工作站怎么用

1. 在左侧选择工作模式，例如逻辑写作、框架写作、完整写作、润色修订、灵感方案。
2. 勾选本次需要带入的人物、记忆、世界观条目等，填写当前状态与用户提示词。
3. 点「开始生成」。生成期间工作站会完全锁定。
4. 在右侧查看输出：

   - 「追加到用户提示词」把输出接到当前提示词末尾，不会覆盖已有内容。
   - 「另存为 TXT / MD」保存当前输出。
   - 「转到纯文本工作站」把输出追加到纯文本编辑区。
   - 「查看原文」打开不经过 Markdown 渲染的原始文本。

5. 右侧「当前对话」显示最近几轮；「对话历史」可以查看全部会话、切回历史会话，或点「当前对话」返回。

## 数据与存储

首次启动后生成：

```text
app/
├── data/
│   ├── config.json          提供商、接口、模型、目录设置
│   ├── modes.json           工作模式（系统提示词 + 模型参数）
│   ├── schema.json          各类设定的元素模板
│   ├── sections.json        自定义栏目定义
│   ├── state.json           AI 工作站草稿、纯文本草稿、当前会话指针
│   ├── history.json         对话索引（标题、轮数、时间、当前会话）
│   ├── conversations/       每个会话的完整内容（按会话分文件）
│   └── characters.json 等   人物、势力、道具、记忆、地图等数据
└── workspace/
    ├── import/              导入目录
    ├── export/              导出目录
    ├── output/              正文与计划
    └── text/                纯文本工作站
```

### 历史记录的存储方式

`data/conversations/<session>.json` 中，每轮只保存：

- `selection`：人物 / 记忆 / 世界观条目的 **ID 指针**、栏目开关、目标字数等；
- `user_prompt`：用户提示词；
- `output`：AI 输出（含生成声明）；
- `work_prompt`：本次补充要求；
- `meta`：模式、模型、推理强度、耗时、token 用量等运行信息。

设定正文不会随每一轮复制。读取历史时会用当前数据库解析指针；条目已删除或为空时直接跳过。

## 导入规则

- 所有设定页面都保留 JSON 导入入口。
- JSON 可以使用 NovelHelper 导出的结构、`{"items": [...]}`，或 `{"名称": {...}}`。
- **Markdown（.md）只允许导入到「其他设定」**；导入后可搬运为人物、势力、道具、装备、记忆或任意自定义栏目条目。
- 地图 JSON 必须包含 `rows`、`cols`、`cells`、`regions`；字段缺失、类型错误或区域引用错误会明确提示。

## 项目结构

```text
NovelHelper/
├── NovelHelper.bat          唯一的根目录启动脚本
├── README.md
├── LICENSE
└── app/
    ├── run.py               启动入口
    ├── novelhelper/         后端包（HTTP、数据、AI、提供商、模式、历史）
    │   └── web/             前端页面
    ├── tools/               命令行工具
    └── selftest.py          自检脚本
```

所有运行代码都在 `app/` 内；根目录只保留启动脚本与开源文档。本地数据与产出不会提交到 Git。

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

命令行工具保留旧版兼容入口；模型、API Key、目录来自 `app/data/config.json`。界面里的工作模式与模型设置以 `app/data/modes.json` 为准。

## 自检

```bash
python app/selftest.py
```

自检使用临时数据目录，不联网、不修改真实数据。

## 隐私与安全

- API Key 只保存在本机的 `app/data/config.json`，不会上传到 NovelHelper 自己的服务。
- 服务默认只监听 `127.0.0.1`，不要在没有额外保护的情况下把端口暴露到公网。
- 开源发布前请确认 `app/data/`、`app/workspace/` 没有被提交；`.gitignore` 已默认忽略它们。
- 如果你曾经在旧版本中填写过 API Key，请在发布或分享前撤销并重新生成 Key。

## License

[MIT](LICENSE)
