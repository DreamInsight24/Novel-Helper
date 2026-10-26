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
| `serve(host: str = "127.0.0.1", port: int = 8765) -> ThreadingHTTPServer` | 确保应用目录存在，创建启用守护请求线程的多线程 HTTP 服务器，并返回该实例；不会启动事件循环。 |

`serve` 默认绑定到本机回环地址。对返回的服务器调用 `serve_forever()` 开始处理请求，调用 `shutdown()` 正常停止服务。显式传入其他 `host` 参数会改变绑定地址。

## 小说与配置接口

所有接口返回现有 `{ "ok": true/false }` 结构。小说 ID 由服务端生成，客户端不得传入路径。

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/novels` | 列出小说元数据与 `active_novel_id`；损坏的单条元数据降级，不影响列表。 |
| `GET` | `/api/novels/current` | 返回当前小说；没有活动小说时 `novel` 为 `null`。 |
| `POST` | `/api/novels` | 使用 `title`（必填）、`author`、`description` 创建隔离小说，并复制全局配置作为初始配置。 |
| `POST` | `/api/novels/open` | 请求体 `{ "id": "..." }`，切换活动小说；生成任务进行时拒绝。 |
| `POST` | `/api/novels/update` | 请求体含 `id`，可更新 `title`、`author`、`description`。 |
| `POST` | `/api/novels/delete` | 请求体含 `id` 和 `title_confirmation`；确认后移入系统回收站，失败时保留数据。 |
| `GET` | `/api/settings/config` | 返回全局配置、当前小说配置和有效配置。 |
| `POST` | `/api/settings/config` | 请求体 `{ "scope": "global"|"novel", "config": {...} }`，分别保存全局或当前小说配置。 |

现有 `/api/state` 和集合接口保持不变，但集合只读写当前活动小说；没有活动小说时 `/api/state` 返回空集合状态而非 `500`。小说配置中的工作区路径必须是当前小说工作区内的相对片段，配置项默认跟随全局，可按小说覆盖。

本模块还保留 `server.ai`，使其指向同一个 `novelhelper.ai` 模块，以兼容测试中替换 AI 函数的现有调用方。`ai` 不属于 `server.__all__`。
