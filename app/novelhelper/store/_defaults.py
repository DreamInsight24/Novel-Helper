# Copyright (C) 2026 DreamInsight24 and NovelHelper contributors
#
# SPDX-License-Identifier: GPL-3.0-or-later
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

"""Built-in config and collection defaults."""
from __future__ import annotations

from typing import Any

from .. import prompts as prompts_mod, providers
from ..localization import t
from ..ports import default_server_config
from ._names import is_section, new_id, now_str
from ._paths import DEFAULT_LOG_DIR

NOVEL_MODES = ("simple", "normal", "expert")


def normalize_novel_mode(value: str | None) -> str:
    """Map unknown / missing values to the default setup level."""
    mode = str(value or "normal").strip().lower()
    return mode if mode in NOVEL_MODES else "normal"

def default_config() -> dict:
    return {
        "version": 4,
        "layout_version": 1,
        "initialized": True,
        "active_novel_id": "",
        "api": providers.default_api_config(),
        "server": default_server_config(),
        "onboarding": {"done": False, "version": 1},
        "efforts": list(providers.EFFORTS),
        "writing": {
            "target_chars": 8000,
            "strict_length": True,
        },
        "revision": {
            "sample_first": True,
            "soft_rounds": 3,
            "hard_rounds": 5,
            "global_review": "auto",
            "full_text_limit": 12000,
            "max_targets": 40,
            "max_target_chars": 20000,
            "max_paragraph_chars": 1200,
        },
        "paths": {
            "data_dir": "data",
            "import_dir": "import",
            "export_dir": "export",
            "output_dir": "output",
            "plan_dir": "output/plan",
            "txt_dir": "output/txt",
            "text_dir": "text",
            "log_dir": DEFAULT_LOG_DIR,
        },
    }

def default_workstation() -> dict:
    """AI 工作站：输入草稿、当前会话指针、最近一次输出。"""
    return {
        "mode": "draft",
        "prompt": "",
        "work_prompt": "",
        "current_state": "",
        "extra": "",
        "output": "",
        "last_mode": "draft",
        "current_session": "",
        "viewing_session": "",
        "selection": {
            "include": {
                "characters": True, "memory": True, "world": True,
                "factions": False, "worldmap": False, "state": True,
            },
            "character_ids": [],
            "memory_ids": [],
            "world_ids": [],
            "target_chars": 0,
            "strict_length": True,
            "project_files": [],
        },
    }

def default_state() -> dict:
    state = {
        "version": 4,
        "workstation": default_workstation(),
        "textPanel": {},
        "updated": now_str(),
    }
    # 兼容旧的命令行工具与既有字段；新界面只写 workstation。
    state.update({
        "prompt": "",
        "extra": "",
        "current_state": "",
        "plan": "",
        "draft": "",
        "chapter": "",
        "character_ids": [],
        "memory_ids": [],
        "world_ids": [],
        "project_files": [],
        "include": {
            "world": True, "state": True, "memory": True, "characters": True,
            "factions": False, "items": False, "equipment": False,
        },
    })
    return state

def default_schema(mode: str = "expert") -> dict:
    """Built-in setting templates, trimmed for the selected novel mode."""
    return schema_for_mode(mode)


def schema_for_mode(mode: str) -> dict:
    """Setting field templates for simple / normal / expert novels.

    The previous templates exposed nearly every possible field at once.  These
    presets keep the writing-facing essentials and leave the rest available
    through the existing template editor instead of presenting it up front.
    """
    level = normalize_novel_mode(mode)
    characters = {
        "simple": [
            {"key": "身份", "children": [{"key": "本名"}, {"key": "性别"}, {"key": "年龄"}]},
            {"key": "性格", "children": [{"key": "核心性格"}]},
            {"key": "背景", "children": [{"key": "自身故事"}]},
            {"key": "关系", "children": [{"key": "关系列表"}]},
        ],
        "normal": [
            {"key": "身份", "children": [
                {"key": "本名"}, {"key": "性别"}, {"key": "年龄"}, {"key": "身份标签"},
            ]},
            {"key": "外貌", "children": [{"key": "整体"}]},
            {"key": "性格", "children": [{"key": "核心性格"}, {"key": "弱点"}]},
            {"key": "能力", "children": [{"key": "职业"}]},
            {"key": "背景", "children": [{"key": "自身故事"}]},
            {"key": "关系", "children": [{"key": "关系列表"}]},
        ],
        "expert": [
            {"key": "身份", "children": [
                {"key": "本名"}, {"key": "性别"}, {"key": "物种"}, {"key": "年龄"},
                {"key": "身份标签"},
            ]},
            {"key": "外貌", "children": [
                {"key": "整体", "children": [{"key": "身高"}, {"key": "体型"}]},
                {"key": "标记与伤痕"},
            ]},
            {"key": "服装", "children": [{"key": "常服"}]},
            {"key": "性格", "children": [
                {"key": "核心性格"}, {"key": "行为特征"}, {"key": "弱点"}, {"key": "心结"},
            ]},
            {"key": "能力", "children": [
                {"key": "职业"}, {"key": "善用武器"}, {"key": "战斗风格"},
            ]},
            {"key": "关系", "children": [{"key": "关系列表"}]},
            {"key": "背景", "children": [{"key": "自身故事"}, {"key": "隐藏设定"}]},
        ],
    }[level]
    factions = {
        "simple": [
            {"key": "基本", "children": [{"key": "类型"}, {"key": "首领"}]},
        ],
        "normal": [
            {"key": "基本", "children": [{"key": "类型"}, {"key": "首领"}, {"key": "领地"}]},
            {"key": "立场与目标", "children": [{"key": "立场"}, {"key": "目标"}]},
        ],
        "expert": [
            {"key": "基本", "children": [{"key": "类型"}, {"key": "首领"}, {"key": "领地"}]},
            {"key": "立场与目标", "children": [
                {"key": "立场"}, {"key": "目标"}, {"key": "对外关系"},
            ]},
            {"key": "实力", "children": [{"key": "人数规模"}, {"key": "实力评级"}]},
            {"key": "历史与现状", "children": [{"key": "历史"}, {"key": "现状"}]},
        ],
    }[level]
    items = {
        "simple": [
            {"key": "基本", "children": [{"key": "类型"}, {"key": "品级"}]},
            {"key": "效果", "children": [{"key": "主要效果"}]},
        ],
        "normal": [
            {"key": "基本", "children": [{"key": "类型"}, {"key": "品级"}, {"key": "价格"}]},
            {"key": "外观", "children": [{"key": "外形"}]},
            {"key": "效果", "children": [{"key": "主要效果"}, {"key": "限制"}]},
        ],
        "expert": [
            {"key": "基本", "children": [{"key": "类型"}, {"key": "品级"}, {"key": "价格"}]},
            {"key": "穿戴", "children": [{"key": "穿戴部位"}, {"key": "材质"}]},
            {"key": "外观", "children": [{"key": "外形"}, {"key": "配色"}]},
            {"key": "效果", "children": [{"key": "主要效果"}, {"key": "限制"}]},
            {"key": "来历", "children": [{"key": "获得方式"}, {"key": "持有者"}]},
        ],
    }[level]
    section_templates = {
        "section_world": {
            "simple": ["概述", "规则"],
            "normal": ["概述", "规则", "备注"],
            "expert": ["概述", "规则", "细则", "备注"],
        },
        "section_species": {
            "simple": ["概述", "备注"],
            "normal": ["概述", "生理特征", "备注"],
            "expert": ["概述", "生理特征", "社会地位", "备注"],
        },
        "section_magic": {
            "simple": ["概述", "备注"],
            "normal": ["概述", "规则", "备注"],
            "expert": ["概述", "规则", "细则", "备注"],
        },
        "section_places": {
            "simple": ["位置", "备注"],
            "normal": ["位置", "概况", "备注"],
            "expert": ["位置", "概况", "特点", "备注"],
        },
        "section_history": {
            "simple": ["时间", "备注"],
            "normal": ["时间", "起因", "经过", "备注"],
            "expert": ["时间", "起因", "经过", "结果", "备注"],
        },
        "section_economy": {
            "simple": ["概述", "备注"],
            "normal": ["概述", "细则", "备注"],
            "expert": ["概述", "细则", "备注"],
        },
        "section_rules": {
            "simple": ["概述", "备注"],
            "normal": ["概述", "表现", "备注"],
            "expert": ["概述", "表现", "治疗", "备注"],
        },
        "section_religion": {
            "simple": ["信仰对象", "备注"],
            "normal": ["信仰对象", "教义", "备注"],
            "expert": ["信仰对象", "分支", "教义", "备注"],
        },
    }
    schema = {
        "characters": {"label": "人物档案", "elements": characters},
        "factions": {"label": "势力设定", "elements": factions},
        # 道具、服饰、装备共用一个「物品」栏目；类别由记录字段区分。
        "items": {"label": "物品", "elements": items},
        # 兼容旧数据读取；界面与 AI 目录不再单列服饰/装备栏目。
        "equipment": {"label": "服饰与装备（已并入物品）", "elements": []},
        "other": {"label": "其他设定", "elements": []},
        "memories": {"label": "记忆", "elements": []},
    }
    labels = {
        "section_world": "世界观",
        "section_species": "物种",
        "section_magic": "魔法与技能",
        "section_places": "地点与城市",
        "section_history": "历史与时间线",
        "section_economy": "经济与物价",
        "section_rules": "规则与疾病",
        "section_religion": "宗教与信仰",
    }
    for key, fields in section_templates.items():
        schema[key] = {"label": labels[key],
                       "elements": [{"key": field} for field in fields[level]]}
    return schema


def default_character() -> dict:
    return {
        "id": new_id("ch"),
        "name": "新角色",
        "tag": "",
        "role": "",
        "elements": [],
        "inventory": [],
        "equipment": [],
        "purse": "",
        "notes": "",
        "tags": [],
        "created": now_str(),
        "updated": now_str(),
    }

def default_faction() -> dict:
    return {
        "id": new_id("fa"), "name": "新势力", "tag": "", "elements": [],
        "members": [], "notes": "", "tags": [], "created": now_str(), "updated": now_str(),
    }

def default_item() -> dict:
    return {
        "id": new_id("it"), "name": "新物品", "category": "道具", "tag": "", "elements": [],
        "notes": "", "tags": [], "created": now_str(), "updated": now_str(),
    }

def default_equipment() -> dict:
    return {
        "id": new_id("eq"), "name": "新服饰/装备", "slot": "上衣", "category": "服饰",
        "tag": "", "elements": [], "notes": "", "tags": [],
        "created": now_str(), "updated": now_str(),
    }

def default_other() -> dict:
    return {
        "id": new_id("ot"), "name": "新条目", "category": "其他设定", "tag": "",
        "elements": [], "content": "", "source": "", "tags": [],
        "created": now_str(), "updated": now_str(),
    }

def default_memory() -> dict:
    return {
        "id": new_id("mm"), "title": "新记忆", "category": "短期记忆", "chapter": "",
        "content": "", "source": "", "tags": [],
        "created": now_str(), "updated": now_str(),
    }

def default_worldmap() -> dict:
    return {
        "name": "世界地图",
        "cols": ["西5", "西4", "西3", "西2", "西1", "中部", "东1", "东2", "东3", "东4", "东5"],
        "rows": ["北5", "北4", "北3", "北2", "北1", "中部", "南1", "南2", "南3", "南4", "南5"],
        "cells": {},
        "regions": {},
    }

def default_meta() -> dict:
    return {"version": 3, "created": now_str(), "last_import": {}, "notes": ""}

def default_sections(mode: str = "expert") -> dict:
    """Built-in setting sections, opened according to the novel setup mode.

    专家模式保留与之前一致的默认栏目；简易 / 普通模式只打开最核心的栏目，
    其余栏目仍可在「设定管理」里随时启用。
    """
    return sections_for_mode(mode)


def sections_for_mode(mode: str) -> dict:
    level = normalize_novel_mode(mode)
    items = [
        {"key": "world", "label": "世界设定", "desc": "世界背景、大陆概况、总体设定",
         "on": level in ("normal", "expert"), "auto_from": ["世界背景", "设定", "关于世界"]},
        {"key": "species", "label": "物种", "desc": "种族、生理特征、社会地位与亚种",
         "on": False, "auto_from": ["物种"]},
        {"key": "magic", "label": "魔法与技能", "desc": "属性、来源、技能类型、学习方式",
         "on": False, "auto_from": ["魔法"]},
        {"key": "places", "label": "地点与城市", "desc": "地理、城市、地点与交通", "on": False},
        {"key": "history", "label": "历史与时间线", "desc": "重大事件、战争、条约、预言",
         "on": False, "auto_from": ["时间线以及重大事件", "历史事件"]},
        {"key": "economy", "label": "经济与物价", "desc": "货币、物价参考、贸易",
         "on": False, "auto_from": ["货币"]},
        {"key": "rules", "label": "规则与疾病", "desc": "世界规则、特殊疾病、习俗",
         "on": False, "auto_from": ["特殊疾病"]},
        {"key": "religion", "label": "宗教与信仰", "desc": "教会、神系、信仰",
         "on": False, "auto_from": ["宗教"]},
    ]
    builtins = {
        "characters": {"on": True},
        "inventory": {"on": level == "expert"},
        "world": {"on": level == "expert"},
        "factions": {"on": level == "expert"},
        "items": {"on": level == "expert"},
        "other": {"on": level == "expert"},
    }
    return {"items": items, "builtins": builtins, "layout_version": 2}


def default_memory_categories() -> list:
    return ["短期记忆", "长期记忆", "重要伏笔", "设定备忘"]

def default_history() -> dict:
    return {"items": [], "current": ""}

def default_for(name: str) -> Any:
    if name == "config":
        return default_config()
    if name == "modes":
        return {"items": prompts_mod.default_modes()}
    if name == "schema":
        return default_schema()
    if name == "state":
        return default_state()
    if name == "sections":
        return default_sections()
    if is_section(name):
        return {"items": [], "categories": []}
    if name == "characters":
        return {"items": [], "categories": []}
    if name == "factions":
        return {"items": [], "categories": []}
    if name == "items":
        return {
            "items": [],
            "categories": ["道具", "武器", "材料", "消耗品", "魔物", "服饰", "装备", "其他"],
            "slots": ["头部", "上衣", "下装", "鞋靴", "披风", "饰品", "武器", "护甲", "其他"],
        }
    if name == "equipment":
        return {"items": [], "slots": ["头部", "上衣", "下装", "鞋靴", "披风", "饰品", "武器", "护甲", "其他"]}
    if name == "other":
        return {"items": [], "categories": ["其他设定", "待整理"]}
    if name == "memories":
        return {"items": [], "categories": default_memory_categories()}
    if name == "worldmap":
        return default_worldmap()
    if name == "meta":
        return default_meta()
    if name == "relations":
        return {"items": [], "initialized": False}
    if name == "history":
        return default_history()
    raise KeyError(t("errors.unknown_collection", name=name))
