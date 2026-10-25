#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
novelhelper/prompts.py
内置提示词与拼装文案。

新版界面的「模式管理」直接编辑 data/modes.json；本文件只提供：
  · DEFAULT_MODES  首次启动时写入 data/modes.json 的默认工作模式
  · AI_NOTICE      所有 AI 输出末尾自动附加的生成声明

工作模式与新增模式的系统提示词提供中英两份，放在翻译表
（defaults.mode.*_prompt）里，按当前语言取词；本文件的常量是中文原文，
仅在翻译表缺词时兜底。旧版命令行工具的兼容提示词已移到 tool_prompts 模块。
"""
from __future__ import annotations

from copy import deepcopy

from .localization import t


# ─────────────────────────────────────────────
# AI 工作站：工作模式
# ─────────────────────────────────────────────
# 系统提示词提供中英两份，正式内容放在翻译表（defaults.mode.*_prompt）里，
# 界面与生成按当前语言取词；下面的常量是中文原文，仅在翻译表缺词时兜底。
LOGIC_WORK_PROMPT = """任务：对用户提供的设定、当前状态、记忆与写作需求做一次「逻辑写作」分析。

请输出三部分：

一、一致性核对
时间、地点、人物位置与状态是否连贯；用户提示词与设定、记忆之间是否存在冲突；缺失但会影响写作的信息。

二、可执行约束
本次写作必须遵守的边界；不得提前暴露或擅自新增的信息。

三、推进建议
3–6 个按顺序排列的关键节点，每个节点由谁触发、产生什么变化，以及建议的情绪曲线与信息释放顺序。

只做分析，不写正文。信息不足时明确写出，不猜测。
"""

OUTLINE_WORK_PROMPT = """任务：根据用户提供的设定、当前状态、记忆与写作需求，输出一份可直接执行的「框架写作」方案。

请输出四部分：

一、章节目标
本节要完成的核心叙事任务；与前后文的衔接点。

二、场景框架
按顺序列出 2–6 个场景，每个场景写明：地点、时间、出场人物；场景目标与冲突；关键动作或信息点；场景结束时的状态变化。

三、节拍与节奏
开场钩子、推进、转折、收束；哪些段落放慢，哪些段落加速。

四、写作提示词
把上述框架整理成一段可直接交给正文写作模型执行的提示词，保留用户的硬性要求，并注明「不得新增未授权设定」。

不写完整正文，不写大段对白，不展示思维链。
"""

DRAFT_WORK_PROMPT = """任务：根据用户提供的设定、当前状态、记忆、用户提示词与本次补充要求，完成本次小说写作。

执行原则：
1. 严格遵循用户选择的设定与本次提示词；不擅自新增设定、人物或情节。
2. 保持视角、时态、文风与叙事节奏统一。
3. 从当前状态出发，不倒退、不跳过关键情境。
4. 按本次补充要求的体裁与结构输出；若补充要求没有特别说明，直接输出完整正文。
5. 输出只包含作品内容。需要分节时使用标题分隔，不加解释性前言、后记或「以下是正文」之类的话。
6. 严格遵守字数要求；用户没有给字数时，以内容完整为先。

内容边界：遵守适用法律法规与平台内容规范；亲密关系点到为止，不生成色情、过度暴力或仇恨内容。
"""

POLISH_WORK_PROMPT = """任务：根据用户提示词与本次补充要求，对「待处理文本」进行润色或修订。

要求：
1. 只修改用户指定的问题与范围，保留原有事实、人物、设定与情节。
2. 改善语言、节奏、描写密度与段落结构，但不改变叙事视角与时态。
3. 不擅自扩写成长篇，不添加未授权的新设定。
4. 输出修订后的完整文本；若用户只要求局部修改，也输出可直接替换的完整版本。
5. 不输出解释、diff 或修改说明，除非用户明确要求。
"""

BRAINSTORM_WORK_PROMPT = """任务：基于用户选择的设定、当前状态、记忆与用户提示词，提供若干条有差异的后续写作方案。

每条方案包含：标题、切入点、大致走向、承接的伏笔、收益、风险、难度。
优先使用已有的人物、地点与伏笔；必须引入新元素时明确标注。
不写正文，不写对白，不展示思维链。信息不足时说明缺什么。
"""

DEFAULT_MODES = [
    {
        "id": "logic", "label": "逻辑写作", "kind": "write",
        "desc": "核对设定一致性，整理约束、风险与推进节点",
        "prompt_key": "defaults.mode.logic_prompt", "fallback_prompt": LOGIC_WORK_PROMPT,
        "model": "", "effort": "high", "max_tokens": 8192,
        "top_p": 0.95, "temperature": None, "thinking": True, "use_target_chars": False,
        "builtin": True,
    },
    {
        "id": "outline", "label": "框架写作", "kind": "write",
        "desc": "输出场景框架、节拍与可直接执行的写作提示词",
        "prompt_key": "defaults.mode.outline_prompt", "fallback_prompt": OUTLINE_WORK_PROMPT,
        "model": "", "effort": "high", "max_tokens": 32768,
        "top_p": 0.95, "temperature": None, "thinking": True, "use_target_chars": False,
        "builtin": True,
    },
    {
        "id": "draft", "label": "完整写作", "kind": "write",
        "desc": "根据设定与提示词生成完整正文",
        "prompt_key": "defaults.mode.draft_prompt", "fallback_prompt": DRAFT_WORK_PROMPT,
        "model": "", "effort": "low", "max_tokens": 100000,
        "top_p": 0.95, "temperature": None, "thinking": True, "use_target_chars": True,
        "builtin": True,
    },
    {
        "id": "polish", "label": "润色修订", "kind": "process",
        "desc": "按指定问题修订文本，保留事实与情节",
        "prompt_key": "defaults.mode.polish_prompt", "fallback_prompt": POLISH_WORK_PROMPT,
        "model": "", "effort": "medium", "max_tokens": 100000,
        "top_p": 0.95, "temperature": None, "thinking": False, "use_target_chars": False,
        "builtin": True,
    },
    {
        "id": "brainstorm", "label": "灵感方案", "kind": "write",
        "desc": "给出多条有差异的后续方向供选择",
        "prompt_key": "defaults.mode.brainstorm_prompt", "fallback_prompt": BRAINSTORM_WORK_PROMPT,
        "model": "", "effort": "high", "max_tokens": 32768,
        "top_p": 0.95, "temperature": None, "thinking": False, "use_target_chars": False,
        "builtin": True,
    },
]


AI_NOTICE = "\n\n---\n\n> 本内容由 AI 生成，仅供创作参考，请自行核对与修改后使用。"


def with_notice(text: str) -> str:
    body = str(text or "").rstrip()
    if body.endswith(AI_NOTICE.strip()):
        return body
    return body + AI_NOTICE


def without_notice(text: str) -> str:
    """去掉末尾的 AI 生成声明，供稿件处理结果直接使用。"""
    body = str(text or "").strip()
    notice = AI_NOTICE.strip()
    if body.endswith(notice):
        return body[: -len(notice)].rstrip()
    return body


def default_modes() -> list:
    """内置工作模式；系统提示词按当前语言从翻译表取词，缺词时回退中文原文。"""
    modes = deepcopy(DEFAULT_MODES)
    for mode in modes:
        key = mode.pop("prompt_key")
        text = t(key)
        mode["system_prompt"] = mode.pop("fallback_prompt") if text == key else text
    return modes



