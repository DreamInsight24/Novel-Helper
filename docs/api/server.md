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
- 窗口默认 1440×900、最小 1024×720。关闭窗口后停止服务并等待线程退出；pywebview/WebView2 不可用时提示安装运行时，不退回浏览器。

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
