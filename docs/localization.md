# 本地化规范

本文档描述 Novel-Helper 的本地化机制、翻译表格式、取词接口、前端注册方式与新增语言流程。本地化相关变更必须同步更新本文档。

## 1. 设计原则

- **配置驱动**：语言清单与默认/回退语言由 JSON 配置决定，不硬编码在代码中。
- **新增语言零改码**：新增一门语言只需增加 JSON 条目与同名翻译表文件。
- **整句翻译**：动态内容使用整句 key 与占位符，禁止拼接句子片段。
- **明确回退**：语言或 key 缺失时有确定的回退行为，并记录日志便于发现遗漏。
- **前后端同源**：后端与前端使用同一份翻译表，前端通过接口注册，不各自维护。

## 2. 目录与文件

```
app/novelhelper/localization/          # 后端实现
app/novelhelper/web/i18n/              # 前端 i18n 运行时
  i18n.js
app/resources/localization/
  languages.json                       # 语言清单与默认/回退配置
  zh-CN.yml
  en-US.yml
```

- 语言 ID 采用 BCP 47（如 `zh-CN`、`en-US`），文件名即语言 ID；
- 每种语言一个 yml 文件，新增语言不改动已有文件；
- 文件编码 UTF-8，无 BOM；读取必须使用 `yaml.safe_load`。

## 3. 语言配置

`app/resources/localization/languages.json`：

```json
{
  "default": "zh-CN",
  "fallback": "zh-CN",
  "languages": [
    { "id": "zh-CN", "name": "简体中文" },
    { "id": "en-US", "name": "English" }
  ]
}
```

| 字段 | 说明 |
|---|---|
| `default` | 默认语言，首次启动且无用户配置时使用 |
| `fallback` | 回退语言，请求语言或 key 缺失时使用 |
| `languages[].id` | 语言 ID，必须与对应 yml 文件名一致 |
| `languages[].name` | 该语言的自称，不随界面语言变化，用于语言选择界面 |

## 4. 翻译表格式

```yaml
common:
  save: "保存"
  cancel: "取消"
settings:
  language: "语言"
  switch_success: "语言已切换为 {name}"
```

**key 命名规范**：

- 使用小写字母、数字与下划线；
- 层级用 `.` 表示，如 `settings.language`；
- 按界面区域或功能分组，组名与包名或页面名对应；
- 同一含义在全项目复用同一 key，不重复定义。

**占位符规范**：

- 动态内容使用 `{placeholder}` 写在整句翻译内；
- 禁止在代码中拼接句子片段；
- 占位符名称使用小写下划线，如 `{file_name}`；
- 中英翻译表必须包含相同的占位符集合。

## 5. 后端接口

<!-- 任务 2 完成后补全实际签名与异常说明。以下为约定接口。 -->

| 接口 | 说明 |
|---|---|
| `t(key, **params) -> str` | 按当前语言取词，支持占位符插值；缺失时按回退策略处理 |
| `set_language(lang_id) -> None` | 切换当前语言，缓存失效，无需重启进程 |
| `get_language() -> str` | 返回当前语言 ID |
| `get_translations(lang_id) -> dict` | 返回指定语言的完整翻译表，供接口层使用 |

`GET /api/i18n/<lang_id>` 返回：

```json
{
  "lang": "en-US",
  "messages": {
    "common.save": "Save",
    "common.cancel": "Cancel"
  }
}
```

## 6. 前端注册与使用

前端 i18n 运行时位于 `app/novelhelper/web/i18n/`，至少提供：

| 方法 | 说明 |
|---|---|
| `register(messages)` | 注册翻译表，合并到当前运行时 |
| `t(key, params)` | 取词并插值，缺失时返回 key |
| `apply(root)` | 扫描 `root` 下 `[data-i18n]` 元素并填充文本 |

**初始化顺序**：

1. 页面加载后请求 `GET /api/i18n/<当前语言>`；
2. 调用 `i18n.register(messages)`；
3. 调用 `i18n.apply(document)` 填充静态文案；
4. 动态插入 DOM 后，对插入的容器调用 `i18n.apply(container)`。

**使用约定**：

- HTML 静态文案使用 `data-i18n="key"`，不直接写文字；
- JS 动态文案统一调用 `t(key, params)`，禁止硬编码界面文案；
- 不使用拼接方式构造句子，动态部分作为占位符参数传入。

## 7. 回退策略

| 场景 | 行为 |
|---|---|
| 请求语言不在配置中 | 使用 `fallback` 语言 |
| 当前语言缺失某 key | 使用 `fallback` 语言中该 key 的值 |
| `fallback` 语言也缺失该 key | 返回 key 本身，并记录 warning 日志（含语言与 key） |
| `languages.json` 缺失或损坏 | 启动失败并给出明确错误，不静默降级 |

## 8. 校验与测试

**启动时校验**：

- `languages.json` 中每个 `id` 必须有同名 yml；
- `default` 与 `fallback` 必须存在于 `languages` 列表中；
- 所有语言 yml 可正常解析。

**测试校验**：

- 各语言 key 集合与默认语言一致，缺失或多余均报错；
- 各语言占位符集合一致；
- 后端单元测试覆盖：正常取词、插值、语言缺失回退、key 缺失回退、warning 记录、切换后生效；
- 前端运行时测试覆盖：注册、取词、`data-i18n` 填充、动态容器 `apply`。

**打包校验**：

- 资源路径统一处理，兼容开发环境与 `sys._MEIPASS`；
- 打包后语言文件与前端运行时均可正常加载。

## 9. 新增语言流程

1. 在 `languages.json` 的 `languages` 数组中增加条目，`id` 使用 BCP 47，`name` 使用该语言自称；
2. 在 `app/resources/localization/` 下新建 `<id>.yml`，key 集合与默认语言一致；
3. 运行校验与测试，确认 key 与占位符一致；
4. 若界面出现文字溢出或截断，调整对应样式，不修改翻译内容；
5. 在 PR 中说明新增语言，并附关键界面截图；
6. 无需修改任何代码，语言选择界面会自动读取新条目。

## 10. 不翻译的内容

- 日志与调试信息；
- 异常堆栈；
- 默认提示词（UI 上以“示例/默认内容”标注）；
- 代码注释与内部标识符。

## 11. 变更流程

- 本地化规范变更需单独 PR，并说明对现有翻译表的影响；
- 新增或修改 key 需同步更新所有语言文件与 `docs/i18n-inventory.md`；
- 变更合入后同步更新本文档第 3 至第 9 节；
- 面向用户的本地化能力变化需在 `CHANGELOG.md` 中记录。