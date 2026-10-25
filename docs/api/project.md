# `novelhelper.project` API

`novelhelper.project` 是工作区路径、导入导出、稿件输出、文本处理和文件浏览的兼容 API。实现拆分在私有模块中；调用方应导入此包级 API，而不要直接依赖内部实现模块。

```python
from novelhelper import project

sections = project.split_sections("# 故事\n\n## 第一章\n正文")
output = project.write_output("一个新场景")
```

## 公共常量

| 名称 | 说明 |
|---|---|
| `HEADING_RE` | 匹配 1 到 6 级 Markdown 标题的已编译正则表达式。 |

## 路径与文本文件

| 签名 | 行为与返回值 |
|---|---|
| `in_project(path: Path) -> bool` | 解析 `path`，检查它是否位于 `store.PROJECT_ROOT` 下。 |
| `rel_str(path: Path) -> str` | 可转换时返回相对于项目目录的 POSIX 路径；否则返回 `str(path)`。 |
| `safe_rel(rel: str) -> Path` | 解析项目相对路径。若解析后的目标越出项目根目录，则抛出 `PermissionError`。 |
| `read_text(path: str \| Path, encoding: str = "utf-8") -> str` | 读取绝对路径，或读取经 `safe_rel` 解析的路径；文件不存在时抛出 `FileNotFoundError`，无法解码的字节会被替换。 |
| `write_text(path: str \| Path, content: str, encoding: str = "utf-8") -> Path` | 创建父目录、写入内容并返回目标路径。相对路径通过 `safe_rel` 解析。 |

## 解析与导入

| 签名 | 行为与返回值 |
|---|---|
| `split_sections(text: str) -> list` | 按标题拆分 Markdown，返回包含级别、标题、父标题和内容的章节字典列表。 |
| `strip_code_fence(text: str) -> str` | 存在外围 Markdown 代码围栏时，将其移除一层。 |
| `parse_name_tag(title: str) -> tuple` | 从标题末尾拆出括号标签，返回 `(name, tag)`。 |
| `records_from_md(text: str, source: str, category: str = "") -> list` | 将 Markdown 叶子章节转换为 `other` 记录；若没有符合条件的章节，则将非空文档整体作为一条记录。`category` 留空时使用当前语言的「导入」分类。 |
| `import_memories(text: str, source: str = "") -> list` | 将现有的 `# / ## / ###` 记忆格式转换为记忆记录。 |
| `parse_worldmap(text: str, name: str = "") -> dict \| None` | 解析现有 Markdown 世界地图表格；输入不符合已识别的表格格式时返回 `None`。 |
| `merge_records(existing: list, incoming: list, key: str = "name", key_fields: list \| None = None) -> tuple` | 原地合并记录到 `existing`，返回 `(records, added_count, updated_count)`。匹配记录时沿用现有更新规则。 |
| `import_sources() -> list` | 列出配置的导入目录下受支持的 `.md`、`.txt` 和 `.json` 文件。 |
| `import_json(text: str, target: str) -> list` | 将支持的 JSON 导入结构转换为记录。JSON 无效时抛出 `json.JSONDecodeError`。 |
| `validate_import_records(records: list, target: str) -> list` | 校验并补全导入记录；输入无效或为空时抛出 `ValueError`。 |
| `import_worldmap_json(text: str, name: str = "") -> dict` | 解析并规范化世界地图 JSON。JSON 无效时抛出 `json.JSONDecodeError`；地图结构无效时抛出 `ValueError`。 |

## 导出与稿件输出

| 签名 | 行为与返回值 |
|---|---|
| `clean_json(coll: str, db: dict) -> dict` | 生成现有格式的干净 JSON 导出内容，不写入文件。 |
| `export_text(coll: str, db: dict) -> str` | 使用现有 `context` 模块中的渲染器渲染集合。集合未知时返回空字符串。 |
| `save_json(coll: str, db: dict, filename: str = "") -> Path` | 将干净 JSON 写入配置的导出目录并返回路径。 |
| `save_txt(coll: str, db: dict, filename: str = "") -> Path` | 将渲染后的文本写入配置的导出目录并返回路径。 |
| `write_output(content: str, mode_label: str = "AI 工作站生成", name: str = "") -> Path` | 写入带时间戳的 Markdown 稿件输出；若提供 `name` 则使用指定名称。 |
| `write_plan(content: str, chapter: str = "") -> Path` | 写入带时间戳的纯文本写作计划。 |
| `write_txt_from_md(rel_md: str, blank_mode: str = "compact", keep_advice: bool = False) -> Path` | 将 Markdown 输出转换为文本并返回生成文件的路径。相对源路径受 `safe_rel` 约束。 |
| `list_chapters() -> list` | 列出已识别的稿件/输出文件，按最新优先排序。 |

## 文本处理与浏览

| 签名 | 行为与返回值 |
|---|---|
| `strip_output_header(raw: str) -> str` | 移除可识别的生成输出标题。 |
| `split_parts(raw: str) -> dict` | 将生成内容拆分为 `think`、`body` 和 `advice` 字段。 |
| `extract_body(raw: str) -> str` | 返回 `split_parts` 结果中的正文部分。 |
| `md_to_txt(raw: str, keep_advice: bool = False, blank_mode: str = "compact") -> str` | 将生成的 Markdown 转换为文本，可选择保留建议部分及空行处理方式。 |
| `merge_intra_paragraph_breaks(text: str) -> str` | 合并段落内换行，同时保留段落之间的空行。 |
| `clean_blank_lines(text: str, mode: str = "compact") -> str` | 使用现有的 `compact` 或普通模式规范空行。 |
| `text_stats(text: str) -> dict` | 返回字符数、中文字符数、行数和段落数。 |
| `apply_text_op(text: str, op: str, arg: str = "") -> str` | 执行现有的裁剪、空行、缩进、合并或替换操作；未知操作不会修改文本。 |
| `list_io(dir_rel: str = "") -> dict` | 当 `dir_rel` 以 `import` 开头时列出配置导入目录中的文件，否则列出导出目录中的文件。所选目录不存在时会创建。 |
| `list_text() -> dict` | 列出配置的稿件处理目录中的文件；目录不存在时会创建。 |
| `browse(path: str = "") -> dict` | 路径为空时列出磁盘和用户目录快捷入口，否则浏览指定目录。路径不存在或不是目录时抛出 `FileNotFoundError`。 |
| `write_external(path: str, content: str, encoding: str = "utf-8") -> Path` | 将文本写入用户指定的外部路径。目标为目录时抛出 `IsADirectoryError`；父目录不存在时抛出 `FileNotFoundError`。 |

写入操作不会吞掉文件系统和序列化错误。以上公共名称均列在 `project.__all__` 中；仍支持 `from novelhelper import project` 和 `from novelhelper.project import read_text` 等现有导入方式。
