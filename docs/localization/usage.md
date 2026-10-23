# 本地化接入与预览

本文面向新增/修改界面文案的开发者。运行原理见[运行流程](runtime-flow.md)，接口签名与异常见 [i18n API](../api/i18n.md)。

## 1. 准备依赖与翻译

安装运行依赖：

```powershell
python -m pip install -r app/requirements.txt
```

在所有语言表中添加相同 key 和占位符。例如中文表：

```yaml
common.saved_at: 已保存 {time}
```

英文表：

```yaml
common.saved_at: Saved {time}
```

命名、格式与校验要求见[维护指南](maintenance.md)。

## 2. Python 侧取词

从包的公共入口导入，不直接依赖私有运行时：

```python
from novelhelper.localization import t

message = t("common.saved_at", time="12:00")
```

HTTP 请求中的 t 会自动采用该请求的语言。非 HTTP 调用可使用 `set_language()` 设置进程默认值，或用上下文临时覆盖：

```python
from novelhelper.localization import language_context, t

with language_context("en-US"):
    message = t("common.saved_at", time="12:00")
```

不要将日志、数据默认值和模型提示词无差别替换为 t；先核对[盘点边界](i18n-inventory.md)。

## 3. HTML 静态绑定

```html
<button data-i18n="common.save"></button>
<input data-i18n="common.name" data-i18n-attr="placeholder">
<span data-i18n="common.saved_at" data-i18n-params='{"time":"12:00"}'></span>
```

翻译表注册后调用 `i18n.apply(root)`。它包含 root 本身及其后代；默认填充 textContent，支持的属性为 placeholder、title、aria-label。data-i18n-params 使用 JSON 对象。

## 4. JS 动态文案与新容器

```javascript
const message = i18n.t('common.saved_at', { time: '12:00' });
```

动态部分作为参数传入整句翻译，不把翻译片段拼成句子。使用 `i18n.t` 避免原业务代码中名为 t 的局部变量遮蔽全局函数。

新建带绑定的 DOM 后，对容器应用翻译：

```javascript
const node = document.createElement('span');
node.dataset.i18n = 'common.cancel';
container.appendChild(node);
i18n.apply(container);
```

需要手动注册时：

```javascript
i18n.register(messages);
i18n.apply(document);
```

register 的作用是将 key → 译文字典合并进前端内存。正常页面由 bootstrap 自动拉取、注册；业务页面不应另维护独立翻译表。

## 5. 启动与临时预览

```powershell
python app/run.py --no-browser
```

服务端口取决于配置或 --port；下列链接按默认端口 8765 举例：

- [中文预览](http://127.0.0.1:8765/?lang=zh-CN)
- [英文预览](http://127.0.0.1:8765/?lang=en-US)
- [静态/动态绑定示例](http://127.0.0.1:8765/i18n/example.html?lang=en-US)

lang 查询参数只用于本次预览，不写用户配置。未提供参数时使用后端 current；未知语言按 fallback 处理。实际解析后的语言写入 html lang，业务 API 请求自动使用该语言请求头。

当前完整切换通过改变 URL 并重新加载页面完成。仅调用 i18n.load 不会重建所有业务常量。首次选择、设置项与持久化留给任务 3.2。
