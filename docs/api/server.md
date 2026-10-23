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

本模块还保留 `server.ai`，使其指向同一个 `novelhelper.ai` 模块，以兼容测试中替换 AI 函数的现有调用方。`ai` 不属于 `server.__all__`。
