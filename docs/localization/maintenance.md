# 本地化维护指南

本文说明语言配置、文案维护、新增语言、测试和打包。如何调用取词接口见[接入与预览](usage.md)，已有自测结论见[验证记录](validation.md)。原有约束以[本地化规范](../localization.md)为入口。

## 1. 语言配置

配置文件为 app/resources/localization/languages.json：

```json
{
  "default": "zh-CN",
  "fallback": "zh-CN",
  "languages": [
    {"id": "zh-CN", "name": "简体中文"},
    {"id": "en-US", "name": "English"}
  ]
}
```

ID 使用 BCP 47 风格标签，与同名 yml 文件对应；name 使用语言自称。default/fallback 必须出现在语言清单中。新增语言只增加配置与同名文件，不硬编码新的语言分支。

## 2. 翻译格式与占位符

YAML 为 UTF-8 无 BOM，通过 PyYAML safe_load 读取。当前资源使用扁平点号格式，也支持嵌套映射；运行时统一为扁平字典。运行依赖为 PyYAML>=6.0,<7，列在 app/requirements.txt。

key 使用小写字母、数字、下划线与点号，按功能分组；同一含义复用 key。每种语言保持同一 key 集合和每个 key 的占位符集合。

动态文案使用完整句子与 `{name}` 这样的占位符，名称匹配 `[a-z][a-z0-9_]*`。参数转为字符串；缺少参数时保留原占位符以便发现遗漏。示例 JSON `{"items": [...]}` 等普通花括号不作为参数。插值不执行表达式或递归替换。

带条件的完整句子使用不同 key，例如删除单一区域和连同子区域删除，不拼接句子片段。

## 3. 文案变更与新增语言

新增或调整文案时，同步所有语言表和[盘点清单](i18n-inventory.md)。先区分界面文案、存储数据、默认提示词与导出格式内容，不借翻译操作改写用户数据或解析规则。

新增语言的操作顺序：

1. 在 languages.json 中增加 ID 和语言自称，新增对应的 <id>.yml。
2. 对齐默认语言的 key 集合及每个 key 的占位符集合。
3. 重新 initialize 或重启服务，确认 GET /api/i18n 返回新语言。
4. 执行下述校验，并用 ?lang=<id> 检查关键页面与动态弹窗；文字过长时调整对应样式。
5. 验证 EXE 中语言资源，按仓库流程提交翻译审校和文档更新。

任务 3.2 实现语言选择器时，应直接读取语言配置接口，不另写语言列表。资源文件不会被自动监听热更新。

## 4. 校验与回归命令

在仓库根目录执行：

```powershell
python scripts/test_localization.py
node scripts/test_i18n.cjs
python scripts/smoke_test.py
python app/selftest.py
python scripts/check_dependencies.py
```

后端测试检查正常取词、插值、缺失回退、warning、配置错误、key/占位符对齐、新增语言、并发隔离、冻结路径和提示词保护。前端运行时测试检查注册、取词、静态/动态绑定及属性填充。

普通启动负责资源格式与配置有效性；严格的 key 和占位符一致性还需运行测试或安装检查。记录结果与验证范围时使用验证文档，不修改需求文件中的原验收清单。

## 5. 打包与资源路径

建议使用独立虚拟环境，避免构建机无关包触发 PyInstaller hook：

```powershell
python -m venv .venv
& ./.venv/Scripts/python.exe -m pip install -r requirements-build.txt -r app/requirements.txt
& ./.venv/Scripts/python.exe -m PyInstaller --noconfirm NovelHelper.spec
python scripts/exe_smoke_test.py dist/NovelHelper.exe
```

开发资源根目录为 app/resources/localization；冻结时读取 sys._MEIPASS/resources/localization。NovelHelper.spec 包含语言目录，原有 web 目录递归包含 i18n 运行时、bootstrap 和示例页。

对生成的 EXE 执行 --check，可校验 i18n 脚本存在及语言表完整性；EXE 冒烟进一步检查中英接口、实际资源访问和业务回归。已有打包环境与结果见[验证记录](validation.md)。
