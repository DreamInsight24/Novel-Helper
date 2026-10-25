#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
novelhelper/tool_prompts.py
仍在使用的内置工具提示词与调用参数。

命令行工具（`app/tools/`）已移除；网页端仍在使用的「记忆压缩」等功能改由本模块
提供提示词，由 `novelhelper.server` 的 `/api/ai/run` 直接调用。

提示词按工作模式的同一套办法处理：正式内容放在翻译表
（`defaults.tool.*_prompt`）里，按当前语言取词；本文件的常量是中文原文，仅在
翻译表缺词时兜底。请求语言由 `server/_base.py` 的 `language_context` 提供。

    from novelhelper import tool_prompts

    tool_prompts.prompt("compress")            # 按工具名取提示词（当前语言）
    tool_prompts.settings(config, override)    # 组装调用参数
"""
from __future__ import annotations

from . import ai
from .localization import t

__all__ = [
    "SUMMARIZE_SYSTEM_PROMPT",
    "COMPRESS_SYSTEM_PROMPT",
    "RESTYLE_SYSTEM_PROMPT",
    "FIX_SYSTEM_PROMPT",
    "TOOL_PROMPTS",
    "TOOL_IDS",
    "prompt",
    "settings",
]


SUMMARIZE_SYSTEM_PROMPT = """任务：把一节小说正文压缩成一条体积尽可能小、但足以支撑后续写作的记忆条目。

压缩原则：
1. 只保留以后还用得上的硬信息：时间推进、地点转移、谁做了什么、结果、关系与状态变化、新出现的人名地名物品、新埋或回收的伏笔。
2. 删除氛围、描写、比喻、心理独白、对话原文与重复信息。
3. 不评论、不评价，不写“本节讲述了……”这类包装句。
4. 只用陈述句，可用分号并列，一条一小句。
5. 不杜撰正文中没有的信息。
6. 篇幅上限 400 字，信息密度优先。

输出格式：
### {章节标题}
- 时间地点：
- 关键事件：
- 人物变化：
- 新增信息：
- 伏笔：
- 状态更新：

没有内容的行写“无”。不要输出解释或额外文字，不要用代码块包裹。
"""

COMPRESS_SYSTEM_PROMPT = """任务：把用户给出的若干条记忆压缩为更短、更密的形式。

要求：
1. 保留全部专有名词（人名、地名、物品名、组织名）与事实，只压缩表达。
2. 删除重复、修饰、评价与过渡句。
3. 保持原有条目划分与 `### 标题`，每条控制在原文长度的 1/3 以内。
4. 只输出压缩后的记忆内容，不解释、不加前言、不用代码块包裹。
"""

RESTYLE_SYSTEM_PROMPT = """任务：调整给定文本的排版、节奏与描写密度，并修复明显的剧情矛盾；不改动情节、对话内容、人物、设定与时间线。

具体改动：
1. 合并连续的一句一段，形成 3–8 句的自然段。
2. 在对话前后补充必要的动作、神态、环境与心理描写。
3. 对话不超过全文 40%。
4. 保留所有关键信息：人物名、地名、物品、关键台词与情节转折。
5. 不新增情节、人物或设定，不删减已有内容。
6. 保持原有视角、时态、文风与叙事顺序。
7. 对明显的前后矛盾做最小修正。

禁止：输出解释、前言、后记、总结或点评；改动 `## 正文` 之外的部分。
输出格式：直接输出重排后的正文。
"""

FIX_SYSTEM_PROMPT = """任务：针对用户提出的具体问题，对给定正文进行定点修复。

核心原则：
1. 只修复用户明确指出的问题，不改动其他内容。
2. 未涉及的部分尽可能逐字保留，措辞、句式、对话与叙述顺序都不要擅自改动。
3. 问题在哪一段就改哪一段，问题是什么就修什么。
4. 不删减原有情节、对话、人物与伏笔；需要补充时只做局部增补。
5. 不新增用户没有要求的情节、人物或设定。
6. 保持原文的叙事视角、时态与文风；修复后的文本应与未改动部分无缝衔接。
7. 保留原文的 Markdown 结构。

输出要求：
- 直接输出修复后的完整正文，不只输出改动部分。
- 不输出解释、前言、后记或 diff。
- 最后输出 `## 修复内容`，一句话描述本次修复。

信息优先级：用户修复指令 > 当前状态 > 故事记忆 > 世界观设定 > 原文。
"""

TOOL_PROMPTS = {
    "summarize": SUMMARIZE_SYSTEM_PROMPT,
    "compress": COMPRESS_SYSTEM_PROMPT,
    "restyle": RESTYLE_SYSTEM_PROMPT,
    "fix": FIX_SYSTEM_PROMPT,
}

#: 内置工具名 → 翻译表 key。取词时按当前语言查表，缺词回退中文原文。
TOOL_KEYS = {
    "summarize": "defaults.tool.summarize_prompt",
    "compress": "defaults.tool.compress_prompt",
    "restyle": "defaults.tool.restyle_prompt",
    "fix": "defaults.tool.fix_prompt",
}

#: `/api/ai/run` 支持的内置工具名。
TOOL_IDS = tuple(TOOL_PROMPTS)


def prompt(tool: str) -> str:
    """按工具名返回系统提示词：优先当前语言的翻译表，缺词回退中文原文。"""
    key = TOOL_KEYS.get(tool)
    if not key:
        return COMPRESS_SYSTEM_PROMPT
    text = t(key)
    return TOOL_PROMPTS[tool] if text == key else text


def settings(config: dict, override: dict | None = None) -> dict:
    """组装内置工具的调用参数：默认 low 推理、32K 输出上限。"""
    base = ai.mode_settings(config, {"effort": "low", "max_tokens": 32768,
                                     "thinking": True})
    for key, value in (override or {}).items():
        if value not in (None, ""):
            base[key] = value
    return base
