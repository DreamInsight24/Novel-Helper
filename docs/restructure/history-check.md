# Squash 历史追踪抽查（P0）

| 项 | 内容 |
|---|---|
| 目的 | 按负责人要求抽查一次实际 `git mv` 后，经 squash 后 `git log --follow` 的追踪表现；记录性检查，不是 P0/P1 门禁 |
| 基线 | `pre-refactor-store` / `42cd65e77b9f7575096138c29195c78a9d8d2755` |
| 模拟 squash 提交 | `4c7dd9e398057e0d90c831a92757071f79db0279`（仅临时克隆，已删除；不是项目提交；提交短号：`4c7dd9e`） |
| 实验文件 | `store.py` → `store/_repository.py`；`project.py` → `project/_exports.py` |
| 结果 | 两个模拟移动文件经 `git reset --soft` 合并成单一 squash 提交后，`git log --follow` 均能继续显示旧文件历史 |
| 限制 | 临时克隆实验只证明上述纯移动样例可被本机 Git 识别；不保证后续同时拆分内容、文件名相似度较低、跨平台 Git 版本或正式 squash 的所有情形。实施阶段对少数关键文件再抽查 |
| 决策 | 不改变 squash 策略、不设置 merge commit 例外、不阻塞 P1。若实际关键文件断链，作为已知限制记录并与负责人沟通 |

模拟在项目外的临时克隆中完成，操作仅包括 `git mv` 两个 Python 文件、分别提交，再以 soft reset 合成一个模拟 squash commit 并运行 `git log --follow`。临时克隆已清理；没有在正式项目工作区创建、修改或删除迁移源码。

低成本兜底：重构前已有 `pre-refactor-store` tag；每个重构 PR 附旧路径 → 新路径映射；先做纯移动，再在同包内提取职责，行为/逻辑修改另开 PR；关键文件抽查，不要求全仓库每个拆出文件都能 follow。
