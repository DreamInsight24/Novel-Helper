# `novelhelper.server` API

`novelhelper.server` 提供本地 HTTP 服务，并保留实现拆分为私有模块之前已有的包级入口。

```python
from novelhelper import server

httpd = server.serve()
httpd.serve_forever()
```

## 公共导出

| 名称 | 说明 |
|---|---|
| `MAX_BODY` | HTTP 请求体允许的最大尺寸：128 MiB。 |
| `Handler` | 服务使用的 `BaseHTTPRequestHandler` 子类，负责处理现有静态资源和 JSON API 路由。 |
| `serve(host: str = "127.0.0.1", port: int = 0) -> ThreadingHTTPServer` | 确保应用目录存在，创建启用守护请求线程的多线程 HTTP 服务器，并返回该实例；不会启动事件循环。`port=0` 由系统分配空闲端口，实际端口读取 `httpd.server_address[1]`。 |

`serve` 默认绑定到本机回环地址并自动选择端口。对返回的服务器调用 `serve_forever()` 开始处理请求，调用 `shutdown()` 正常停止服务。显式传入其他 `host` 参数会改变绑定地址。Windows 下服务器禁用 `SO_REUSEADDR`，固定端口已被占用时会抛出 `OSError`，不会静默复用。

## 桌面启动与端口

- 默认入口 `python app/run.py` 启动 HTTP 服务后创建 pywebview 窗口，窗口 URL 使用实际端口；不再调用 `webbrowser.open`。
- 新增 `--no-window` 只启动服务；`--no-browser` 为已弃用别名。`--check` 与 `--version` 不依赖 GUI。
- 端口优先级：`--port` > 全局配置的固定端口 > 系统自动分配。`--port 0`、非数字、越界值均直接报错退出；固定端口冲突不回退。
- 全局配置使用 `server.host`、`server.port_mode`（`auto`/`fixed`）与可选的 `server.port`。旧配置在 `store.ensure_dirs()` 中迁移：缺失端口或旧默认端口（普通 8765 / 调试 8766）转为 `auto`，其他合法端口保留为 `fixed`。
- `POST /api/settings/config` 在 `scope=global` 时校验端口配置；`server` 属于全局配置，小说配置不会保存端口覆盖。
- 窗口默认 1280×800、最小 1024×720，并按主屏工作区收缩后居中；位置和尺寸不持久化，最大化关闭后重启仍恢复默认。关闭窗口后停止服务并等待线程退出；pywebview/WebView2 不可用时提示安装运行时，不退回浏览器。
- 窗口先显示至少 1.2 秒的开屏页再加载应用；打包 EXE 使用窗口子系统，双击不出现控制台。EXE、窗口和网页 favicon 共用 `app/resources/NovelHelper.ico`（网页使用 `web/icon.png`）。

## 小说与配置接口

所有接口返回现有 `{ "ok": true/false }` 结构。小说 ID 由服务端生成，客户端不得传入路径。

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/novels` | 列出小说元数据与 `active_novel_id`；损坏的单条元数据降级，不影响列表。 |
| `GET` | `/api/novels/current` | 返回当前小说；没有活动小说时 `novel` 为 `null`。 |
| `POST` | `/api/novels` | 使用 `title`（必填）、`author`、`description` 创建隔离小说，并复制全局配置作为初始配置。 |
| `POST` | `/api/novels/open` | 请求体 `{ "id": "..." }`，切换活动小说；生成任务进行时拒绝。 |
| `POST` | `/api/novels/update` | 请求体含 `id`，可更新 `title`、`author`、`description`。 |
| `POST` | `/api/novels/delete` | 请求体含 `id` 和 `title_confirmation`；元数据正常时确认值必须匹配标题，元数据损坏时必须匹配小说 ID。确认后移入系统回收站，失败时保留数据并返回可读错误。 |
| `GET` | `/api/settings/config` | 返回全局配置、当前小说配置和有效配置。 |
| `POST` | `/api/settings/config` | 请求体 `{ "scope": "global"|"novel", "config": {...} }`，分别保存全局或当前小说配置。 |

现有 `/api/state` 和集合接口保持不变，但集合只读写当前活动小说；没有活动小说时 `/api/state` 返回空集合状态而非 `500`。小说配置中的工作区路径必须是当前小说工作区内的相对片段，配置项默认跟随全局，可按小说覆盖。

## AI 设定生成接口

支持目标：人物、势力、道具、装备、其他设定与所有已启用的自定义栏目；世界地图与记忆不参与自动生成。

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/ai/setting-gen` | 请求体只读取 `text`（素材文本，必填，单任务 ≤ 120,000 字符）。服务端按段落分块（单批 ≤ 12,000 字符）调用模型抽取，确定性校验后**一次性写入**当前小说；`system`/`prompt`/`model`/`config` 等字段一律被忽略，始终使用应用的有效模型配置。响应含 `batch_id` 与 `summary`（`added`/`skipped`/`written`/`dropped`/`overflow`）。AI 生成任务进行中返回 `409`。 |
| `POST` | `/api/ai/setting-gen/undo` | 撤销最近一次生成：只删除本批新增且未被修改的记录，返回 `removed`/`kept`；无可撤销批次（含切换小说后）返回 `400`。撤销状态只保留在内存，刷新或重启后不保证可撤销。 |

约束：未配置 API Key、接口不可用、超时、模型输出无法解析、输入为空或超长、没有可写入的设定条目，均返回本地化错误；任何失败都不产生半批数据。系统提示词固定在服务端（`novelhelper.setting_gen`），不通过任何接口读取或返回。

## v2611.1 文件与工作站请求

| 方法 | 路径 | 请求及响应 |
|---|---|---|
| GET | `/api/workspace/files` | 无请求体。返回 `{ok, active_novel_id, sources, io, exports, import_dir, export_dir, text_dir}`；io 为稿件工作区清单，exports 为导出目录清单，sources 为当前导入源。刷新不会替换集合。 |
| POST | `/api/io/save` | 新文件推荐 `{directory:"import"|"text", filename:"sample.txt", content:"...", novel_id:"nv_..."}`；兼容 `{path,content,encoding}`。返回 `{ok,path,io,sources}`，path 为后续读取/导入应使用的服务端路径。覆盖已有文件保留 `.bak`。 |
| POST | `/api/io/export` | 默认工作区导出使用 `{directory:"export",filename,content,novel_id}`，同名自动编号。外部指定路径使用 `{path,content,encoding}`；已存在时返回 `{ok:true,exists:true,path}` 且不写入，用户确认后用 `overwrite:true` 重试；成功返回 `{ok,path,size}`。 |
| POST | `/api/export` | 原 `{collection,format,filename?}` 不变，同名自动编号，返回 `{ok,path,rel}`。filename 只能是文件名，禁止越界路径。 |
| GET | `/api/file?path=...` | 使用服务端返回的文件路径读取；当前活动小说不能读取另一本小说的工作区文件。外部文件读取保持兼容。 |
| POST | `/api/import` | 原 kind/source/target 不变，可附 novel_id 检测迟到上传；md 格式同时接收 txt。空文本返回新增 0 条；写入前快照、失败回滚。 |

新文件 filename 不接受斜杠、反斜杠、冒号或 `.`/`..`。novel_id 与当前小说不符、参数无效返回 400，跨小说/越界返回 403，读取不存在文件返回 404，I/O 故障沿用错误响应。客户端显示路径可用绝对目录，但不得拼接该目录构造新文件请求。

示例：先 POST `/api/io/save`，请求体 `{"directory":"import","filename":"notes.TXT","content":"世界背景","novel_id":"nv_example"}`；随后使用响应 path POST `/api/import`，请求体 `{"kind":"md","target":"other","source":"<响应 path>"}`。

`POST /api/workstation/run` 保持原接口：本次模型通过 `override:{model:"..."}` 覆盖，跟随模式则传空对象。限定字数发送 `selection:{length_mode:"limited",target_chars:1234,strict_length:true}`；不限发送 `selection:{length_mode:"unlimited",strict_length:false}`，省略 target_chars，服务端不回填默认目标字数。旧请求不含 length_mode 时仍沿用既有配置回填和 strict_length 语义。
