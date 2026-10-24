# 本地化运行流程

本文解释当前代码如何加载翻译、选择语言并渲染界面。调用示例见[接入与预览](usage.md)，完整接口见 [i18n API](../api/i18n.md)。

## 1. 资源与模块

```text
app/resources/localization/
  languages.json                       # 默认/回退语言及语言清单
  zh-CN.yml
  en-US.yml
app/novelhelper/localization/          # 后端加载、取词、语言上下文与校验
app/novelhelper/web/i18n/
  i18n.js                              # 前端注册、取词与 DOM 绑定
  bootstrap.js                         # 翻译就绪后加载原业务脚本
  example.html                         # 静态与动态绑定示例
```

前后端使用同一份 YAML 翻译表。语言列表由配置提供，不在前端另写一份。

## 2. 服务启动与资源加载

服务启动时，`server.serve()` 调用 `get_languages()`，首次使用触发 `initialize()`。后端读取 languages.json，检查语言清单非空、ID 不重复且格式有效、语言自称有效、default/fallback 均在清单中。

随后以 UTF-8 读取对应 YAML，使用 `yaml.safe_load` 解析，再将嵌套结构转换为 `common.save` 这样的扁平 key。检查映射、key 和译文值类型；只有所有资源加载成功，才原子替换内存中的配置和翻译表，并将进程语言设为 default。无效资源抛出带目录及原因的 `ValueError`，不静默降级。

翻译表加载后保留在内存中，普通取词不会反复读文件。资源变更需显式重新 `initialize()` 或重启服务；新增语言不会由文件监听自动加载。

普通启动允许某语言缺少 key，以支持运行时回退。严格的中英 key/占位符集合校验由 `validate_translations()`、测试及 `--check` 执行。

## 3. 语言选择与取词

后端的语言优先级为：当前请求上下文覆盖 → 进程默认语言。`set_language()` 修改进程默认语言，后续取词立即生效，但不写用户配置。

前端业务请求携带 `X-NovelHelper-Language`。HTTP 处理器用 `language_context()` 暂时设置该请求语言；底层 `ContextVar` 隔离并发请求，结束或异常退出时还原，不把请求语言写回进程默认值。

`t(key, **params)` 查找当前语言，再查 fallback，最后按具名参数插值。格式化结果不缓存，因此切换语言后不需要清理旧的格式化结果。

| 场景 | 行为 |
|---|---|
| 请求语言不存在 | 使用配置的 fallback，warning 包含请求语言 |
| 当前语言缺失 key | 使用 fallback 的值，warning 包含当前语言和 key |
| fallback 也缺失 key | 返回 key，warning 包含当前语言和 key |
| 前端未注册 key | 返回 key |
| 配置或资源损坏 | 明确失败，不使用硬编码默认配置掩盖问题 |

后端 warning 使用 Python logging，启动控制台与测试可捕获；日志文本本身不本地化。

## 4. 翻译表传给前端

`GET /api/i18n` 提供语言配置、当前语言与应用版本；`GET /api/i18n/<lang_id>` 提供实际解析后的语言 ID 和扁平翻译表。返回整表时先合并 fallback，当前语言的值覆盖回退值。

返回的配置和翻译表为副本，调用方修改副本不会破坏缓存。获取某语言的翻译表不会改变进程默认语言。返回结构见 [HTTP 接口](../api/i18n.md#http-接口)。

## 5. 页面启动与渲染

首页按以下顺序执行：

1. 加载 i18n.js 和 bootstrap.js。
2. 请求语言配置与版本，将版本写入 `i18n.defaults.version`。
3. 以 URL 中的 lang 参数或后端 current 确定预览语言。
4. `i18n.load(lang)` 请求翻译表；成功后替换旧表、注册译文并设置 html lang。
5. `i18n.apply(document)` 填充 HTML 静态文案。
6. 顺序加载 core、records、views、config、workstation、manuscript 六个原业务脚本。
7. 全部脚本加载完成后调用 `boot()`，读取业务状态并绘制页面。

导航与集合定义中有脚本顶层取词，因此必须在翻译表注册后加载这些脚本。`workstation.js` 末尾原有自动执行的 boot 改由 bootstrap 在 manuscript 加载后调用，避免初始化竞争；原全局函数与 DOM 构造方式继续使用。

静态文字由 data-i18n 绑定，JS 动态文字直接调用 `i18n.t()`。公共 DOM 构造、页面绘制与弹窗插入均接入 apply。apply 默认通过 textContent 填充，也可写入允许的文字属性；不会把绑定译文当作 HTML 执行。

register 合并表，load 在新表成功返回后替换旧表。仅 load 新表不会重新计算业务脚本顶层常量，所以当前完整预览切换采用页面重载。

## 6. 用户错误与内容边界

用户错误采用“后端取词并返回当前语言译文”的方案。原有 error/detail 结构和状态码保持；外部服务原始详情、异常类名和堆栈保留用于诊断。

提供商 UI 说明在 `public_providers()` 的返回副本中翻译，模型使用的 PROVIDERS 原值及 provider_note 保留。默认提示词编辑区域标注“示例 / 默认内容（保留原文）”，页面说明数据与内置示例保留原文。

栏目名、模式名称/说明、分类、会话标题、地图坐标及导出格式的具体处理见[盘点清单](i18n-inventory.md)。这些内容的存储数据展示豁免属于当前实现边界，不代表不能在显示层进一步本地化。
