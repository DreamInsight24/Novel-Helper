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
from ._names import is_section, new_id, now_str
from ._paths import DEBUG_MODE, DEFAULT_LOG_DIR

def default_config() -> dict:
    return {
        "version": 4,
        "layout_version": 1,
        "initialized": True,
        "active_novel_id": "",
        "api": providers.default_api_config(),
        "server": {"host": "127.0.0.1", "port": 8766 if DEBUG_MODE else 8765},
        "onboarding": {"done": False, "version": 1},
        "efforts": list(providers.EFFORTS),
        "writing": {
            "target_chars": 8000,
            "strict_length": True,
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

def default_schema() -> dict:
    """设定元素模板：作者可在「元素模板」页自由增删。"""
    schema = {
        "characters": {
            "label": "人物档案",
            "elements": [
                {"key": "身份", "children": [
                    {"key": "本名"}, {"key": "性别"}, {"key": "物种"}, {"key": "年龄"}, {"key": "生日"},
                    {"key": "身份标签"},
                ]},
                {"key": "外貌", "children": [
                    {"key": "整体", "children": [{"key": "身高"}, {"key": "体重"}, {"key": "体型"}]},
                    {"key": "毛发与瞳色", "children": [{"key": "毛色"}, {"key": "瞳色"}, {"key": "角与耳"}]},
                    {"key": "手与足", "children": [{"key": "手部结构"}, {"key": "足部结构"}, {"key": "肉垫"}]},
                    {"key": "尾巴"},
                    {"key": "标记与伤痕"},
                    {"key": "角色锚点"},
                ]},
                {"key": "服装", "children": [
                    {"key": "常服"}, {"key": "配色偏好"}, {"key": "穿鞋习惯"},
                ]},
                {"key": "性格", "children": [
                    {"key": "核心性格"}, {"key": "行为特征"}, {"key": "取向"}, {"key": "特殊癖好"},
                    {"key": "弱点"}, {"key": "心结"}, {"key": "雷点"},
                ]},
                {"key": "能力", "children": [
                    {"key": "职业"}, {"key": "善用武器"}, {"key": "魔法适应性"},
                    {"key": "擅长法术"}, {"key": "本命技能"}, {"key": "战斗风格"},
                ]},
                {"key": "关系", "children": [{"key": "关系列表"}]},
                {"key": "背景", "children": [{"key": "自身故事"}, {"key": "隐藏设定"}]},
            ],
        },
        "factions": {
            "label": "势力设定",
            "elements": [
                {"key": "基本", "children": [{"key": "类型"}, {"key": "首领"}, {"key": "领地"}, {"key": "成立时间"}]},
                {"key": "立场与目标", "children": [{"key": "立场"}, {"key": "目标"}, {"key": "对外关系"}]},
                {"key": "实力", "children": [{"key": "人数规模"}, {"key": "实力评级"}, {"key": "核心战力"}]},
                {"key": "历史与现状", "children": [{"key": "历史"}, {"key": "现状"}]},
            ],
        },
        "items": {
            "label": "道具设定",
            "elements": [
                {"key": "基本", "children": [{"key": "类型"}, {"key": "品级"}, {"key": "价格"}]},
                {"key": "外观", "children": [{"key": "外形"}, {"key": "材质"}, {"key": "大小"}]},
                {"key": "效果", "children": [{"key": "主要效果"}, {"key": "消耗"}, {"key": "限制"}]},
                {"key": "来历", "children": [{"key": "获得方式"}, {"key": "持有者"}]},
            ],
        },
        "equipment": {
            "label": "服饰与装备",
            "elements": [
                {"key": "基本", "children": [{"key": "穿戴部位"}, {"key": "类型"}, {"key": "材质"}]},
                {"key": "外观", "children": [{"key": "外观描述"}, {"key": "配色"}, {"key": "特殊纹样"}]},
                {"key": "效果", "children": [{"key": "穿戴效果"}, {"key": "耐久"}, {"key": "限制"}]},
            ],
        },
        "other": {
            "label": "其他设定",
            "elements": [],
        },
        "memories": {
            "label": "记忆",
            "elements": [],
        },
    }
    # 自定义栏目的默认模板（与 data/schema.json 的既有设置保持一致）。
    section_templates = {
        "section_world": ("世界观", ["概述", "规则", "细则", "备注"]),
        "section_species": ("物种", ["概述", "生理特征", "亚种", "能力倾向", "社会地位", "服装偏好", "备注"]),
        "section_magic": ("魔法与技能", ["概述", "规则", "细则", "备注"]),
        "section_places": ("地点与城市", ["位置", "概况", "特点", "社会", "备注"]),
        "section_history": ("历史与时间线", ["时间", "起因", "经过", "结果", "影响", "备注"]),
        "section_economy": ("经济与物价", ["概述", "细则", "备注"]),
        "section_rules": ("规则与疾病", ["概述", "表现", "治疗", "备注"]),
        "section_religion": ("宗教与信仰", ["信仰对象", "分支", "教义", "组织", "备注"]),
    }
    for key, (label, fields) in section_templates.items():
        schema[key] = {"label": label, "elements": [{"key": field} for field in fields]}
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
        "id": new_id("it"), "name": "新道具", "category": "道具", "tag": "", "elements": [],
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

def default_sections() -> dict:
    """
    设定栏目：把设定分成若干独立栏目。
    用户可以在「自定义栏目」页自由增删改名；每个栏目是独立的 JSON 文件
    （data/section_<key>.json），记录形状和其它设定集合完全一致。
    `auto_from` 用来一键把「其他设定」里的内容按原分类归位。
    """
    return {
        "items": [
            {"key": "world", "label": "世界观", "desc": "世界背景、大陆概况、总体设定",
             "auto_from": ["世界背景", "设定", "关于世界"]},
            {"key": "species", "label": "物种", "desc": "种族、生理特征、社会地位与亚种",
             "auto_from": ["物种"]},
            {"key": "magic", "label": "魔法与技能", "desc": "属性、来源、技能类型、学习方式",
             "auto_from": ["魔法"]},
            {"key": "history", "label": "历史与时间线", "desc": "重大事件、战争、条约、预言",
             "auto_from": ["时间线以及重大事件", "历史事件"]},
            {"key": "economy", "label": "经济与物价", "desc": "货币、物价参考、贸易",
             "auto_from": ["货币"]},
            {"key": "rules", "label": "规则与疾病", "desc": "世界规则、特殊疾病、习俗",
             "auto_from": ["特殊疾病"]},
            {"key": "religion", "label": "宗教与信仰", "desc": "教会、神系、信仰",
             "auto_from": ["宗教"]},
        ]
    }

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
        return {"items": [], "categories": ["道具", "武器", "材料", "消耗品", "魔物", "服饰", "其他"]}
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
    if name == "history":
        return default_history()
    raise KeyError(t("errors.unknown_collection", name=name))
