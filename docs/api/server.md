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
| `POST` | `/api/novels` | 使用 `title`（必填）、`author`、`description`、`mode`（`simple` / `normal` / `expert`，默认 `normal`）创建隔离小说，并复制全局配置、按模式生成初始设定栏目与字段模板。 |
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
| POST | `/api/chapters/rename` | `{path,name}`。重命名当前小说的章节文件，保留扩展名与显示位置；返回 `{ok,path,old,name,chapters}`。空名称或同名文件返回 400，越界路径返回 403。 |
| POST | `/api/chapters/reorder` | `{paths:[...],novel_id?}`。按给定顺序写入输出目录的 `.chapters.json` 并返回 `{ok,chapters}`；仅接受当前小说输出目录内的章节，其他路径忽略。 |

新文件 filename 不接受斜杠、反斜杠、冒号或 `.`/`..`。novel_id 与当前小说不符、参数无效返回 400，跨小说/越界返回 403，读取不存在文件返回 404，I/O 故障沿用错误响应。客户端显示路径可用绝对目录，但不得拼接该目录构造新文件请求。

示例：先 POST `/api/io/save`，请求体 `{"directory":"import","filename":"notes.TXT","content":"世界背景","novel_id":"nv_example"}`；随后使用响应 path POST `/api/import`，请求体 `{"kind":"md","target":"other","source":"<响应 path>"}`。

`POST /api/workstation/run` 保持原接口：本次模型通过 `override:{model:"..."}` 覆盖，跟随模式则传空对象。限定字数发送 `selection:{length_mode:"limited",target_chars:1234,strict_length:true}`；不限发送 `selection:{length_mode:"unlimited",strict_length:false}`，省略 target_chars，服务端不回填默认目标字数。旧请求不含 length_mode 时仍沿用既有配置回填和 strict_length 语义。

`POST /api/workstation/stream` 是同一套生成逻辑的流式版本，请求体与 `/run` 相同。响应 `Content-Type: application/x-ndjson; charset=utf-8`，用 chunked 逐行推送：

| 帧 | 内容 |
|---|---|
| `{"type":"start"}` | 已受理，开始请求上游 |
| `{"type":"delta","text":"..."}` | 正文增量；上游不支持 SSE 时整段作为一帧发出 |
| `{"type":"done","payload":{...}}` | 与 `/run` 成功响应完全相同的对象，另含 `chapter:{rel,name,title,session_id}`（完整写作自动落成的章节） |
| `{"type":"error","error":"...","status":400}` | 校验失败或调用失败；`status` 仅校验类错误提供 |

完整写作（`kind=write` 且拼装目标字数的模式）在 `surface=workstation` 下会把结果写入 `workspace/novels/<id>/output/NNN-<标题>.txt`，并把来源对话记进 `state.json` 的 `workstation.chapters`，稿件处理据此显示「来自对话」。请求体传 `auto_chapter:false` 可关闭该行为。停止生成仍用 `POST /api/workstation/cancel`：被取消的那次流以 `done` 帧返回 `{ok:false,cancelled:true}`，不写历史、不生成章节。

## 关系网保存与告警

`POST /api/collections/relations` 请求仍为 `{data:{items:[...],initialized:true}}`，可附 novel_id 防止迟到请求写入新小说。无效边（引用缺失、自环、空类型、非对象）丢弃，重复边合并，其余有效边正常保存。响应增加 `{data:<规范化关系>,factions:<成员投影>,discarded:<丢弃数>}`；saved 字段保留。格式不为对象/items 列表时返回 400。

写入前生成该小说 `relation_backups/<唯一标识>/relations.json` 与 factions.json 快照，任一步失败回滚原始文件。`GET /api/state` 增加 relation_discarded，报告读取并清理旧坏关联的数量，前端显示双语告警。关系引用、方向及势力成员投影语义保持兼容。

## 全局角色卡 API

这些接口不要求活动小说。卡片不属于 `/api/collections/*`，不参与 AI 拼装。

| 方法 | 路径 | 请求与响应 |
|---|---|---|
| GET | `/api/cards` | 返回 `{ok:true,items:[card,...]}`，首次缺失时幂等初始化为空。 |
| POST | `/api/cards` | 新建传 `{name,gender?,role?,age?,tags?,summary?,notes?}`；更新另传 id，未传字段保留。返回 `{ok,card,items}`。id/created/updated 由服务端管理，image 不能通过此接口任意指定。 |
| POST | `/api/cards/delete` | `{id}`，返回 `{ok,items}`；只删除全局卡片，不影响小说人物档案。 |
| POST | `/api/cards/image` | `{id,data_url}`，id 必须已存在；只允许 PNG/JPEG/WebP 且解码后不超过 2 MB，校验图片头，随机命名后写入全局图片目录。返回 `{ok,card,items}`。 |
| GET | `/api/cards/images/<文件名>` | 返回对应图片二进制及 image/png、image/jpeg 或 image/webp；只接受服务端生成的文件名，缺失或非法名称返回 404。 |

card 包含 id/name/gender/role/age/tags/summary/notes/image/created/updated；age 为可描述的字符串，tags 为去重字符串列表。name 必填，基本字段最多 200 字符，简介/备注最多 100000 字符，标签最多 100 个。参数无效或 id 不存在返回双语 400；I/O 故障沿用 500 响应。image 只存文件名，无图为 ""，前端使用 `/card-default.svg`，读取失败同样回退。

最小示例：POST `/api/cards` 发送 `{"name":"Mira","role":"Cartographer","tags":["oc"]}`；使用返回 card.id 更新文字或上传图片，再以 GET `/api/cards` 获取全局列表。数据固定为 DATA_DIR/cards.json，图片为 DATA_DIR/card_images/，与小说 ID 无关。

每次修改前在 DATA_DIR/card_backups/ 保存旧 JSON；JSON 原子替换失败时旧文件保持完整，图片上传若后续保存失败则删除新文件。历史图片保留供快照恢复；回滚时关闭应用，把备份 JSON 复制回 cards.json 即可，不能用小说导入接口恢复全局角色卡。
