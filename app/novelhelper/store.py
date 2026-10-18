#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
novelhelper/store.py
数据层：一切以 JSON 为准。

目录约定（相对 app/）：
    data/                 所有 JSON 数据（唯一真源）
    data/conversations/   AI 工作站的对话正文（按会话分文件）
    workspace/io/in/      导入目录
    workspace/io/out/     导出目录
    workspace/out/        小说正文与计划
    workspace/text/       纯文本工作站
"""
from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from . import prompts as prompts_mod

STUDIO_DIR = Path(__file__).resolve().parent
APP_ROOT = STUDIO_DIR.parent
PROJECT_ROOT = APP_ROOT
REPO_ROOT = APP_ROOT.parent
WEB_DIR = STUDIO_DIR / "web"

DATA_DIR = Path(os.environ.get("NOVELHELPER_DATA") or (APP_ROOT / "data"))

# 集合 = 一份 JSON 文件
COLLECTIONS = (
    "config",
    "prompts",
    "schema",
    "state",
    "sections",
    "characters",
    "factions",
    "items",
    "equipment",
    "other",
    "memories",
    "worldmap",
    "meta",
    "history",
)

# 记录型集合（有 items 列表）
RECORD_COLLECTIONS = ("characters", "factions", "items", "equipment", "other", "memories")

# 自定义设定栏目（世界观 / 物种 / 魔法与技能 …）存成 data/section_<key>.json
SECTION_PREFIX = "section_"

_LOCK = threading.RLock()


# ─────────────────────────────────────────────
# 小工具
# ─────────────────────────────────────────────
def now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def stamp() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def data_dir() -> Path:
    return DATA_DIR


def ensure_dirs() -> None:
    for path in (DATA_DIR, DATA_DIR / "conversations", io_in(), io_out(),
                 out_dir(), plan_dir(), txt_dir(), text_dir()):
        path.mkdir(parents=True, exist_ok=True)
    # 首次启动时把内置默认设置落成可编辑的 JSON 文件。
    for name in COLLECTIONS:
        if not _path(name).exists():
            save(name, default_for(name))


def _root(rel: str | Path) -> Path:
    path = Path(rel)
    return path if path.is_absolute() else (PROJECT_ROOT / path)


def io_in() -> Path:
    return _root(load("config").get("paths", {}).get("import_dir", "workspace/io/in"))


def io_out() -> Path:
    return _root(load("config").get("paths", {}).get("export_dir", "workspace/io/out"))


def out_dir() -> Path:
    return _root(load("config").get("paths", {}).get("output_dir", "workspace/out"))


def plan_dir() -> Path:
    return _root(load("config").get("paths", {}).get("plan_dir", "workspace/out/plan"))


def txt_dir() -> Path:
    return _root(load("config").get("paths", {}).get("txt_dir", "workspace/out/txt"))


def text_dir() -> Path:
    """纯文本工作站的独立文件夹。"""
    return _root(load("config").get("paths", {}).get("text_dir", "workspace/text"))


# ─────────────────────────────────────────────
# 默认值
# ─────────────────────────────────────────────
DEFAULT_MODELS = ["deepseek-flash", "deepseek-chat", "deepseek-reasoner"]


def default_config() -> dict:
    return {
        "version": 3,
        "api": {
            "base_url": "https://api.deepseek.com",
            "api_key": "",
            "models": list(DEFAULT_MODELS),
            "timeout": 899,
        },
        "tools": {
            "reason": {"label": "逻辑推理与梗概", "model": "deepseek-flash", "effort": "high",
                       "max_tokens": 8192, "top_p": 0.95, "thinking": True},
            "write": {"label": "正文写作", "model": "deepseek-flash", "effort": "low",
                      "max_tokens": 100000, "top_p": 0.95, "thinking": True},
            "summarize": {"label": "章节总结", "model": "deepseek-flash", "effort": "low",
                          "max_tokens": 8192, "top_p": 0.95, "thinking": True},
            "compress": {"label": "记忆压缩", "model": "deepseek-flash", "effort": "high",
                         "max_tokens": 8192, "top_p": 0.95, "thinking": True},
            "idea": {"label": "灵感方案", "model": "deepseek-flash", "effort": "high",
                     "max_tokens": 32768, "top_p": 0.95, "thinking": True},
            "fix": {"label": "定点修复", "model": "deepseek-flash", "effort": "low",
                    "max_tokens": 200000, "top_p": 0.95, "thinking": True},
            "restyle": {"label": "格式重排", "model": "deepseek-flash", "effort": "low",
                        "max_tokens": 200000, "top_p": 0.95, "thinking": True},
        },
        "writing": {
            "target_chars": 8000,
            "strict_length": True,
        },
        "paths": {
            "data_dir": "data",
            "import_dir": "workspace/io/in",
            "export_dir": "workspace/io/out",
            "output_dir": "workspace/out",
            "plan_dir": "workspace/out/plan",
            "txt_dir": "workspace/out/txt",
            "text_dir": "workspace/text",
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
        "last_tool": "draft",
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
        "version": 3,
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


def section_store_name(key: str) -> str:
    return f"{SECTION_PREFIX}{key}"


def section_key(name: str) -> str:
    return name[len(SECTION_PREFIX):] if name.startswith(SECTION_PREFIX) else ""


def is_section(name: str) -> bool:
    key = section_key(name)
    return bool(key) and key.replace("_", "").isalnum() and key.isascii()


def section_names() -> list:
    """当前启用的栏目对应的存储名。"""
    out = []
    for item in (load("sections").get("items") or []):
        key = (item.get("key") or "").strip()
        if key and item.get("on", True) is not False:
            out.append(section_store_name(key))
    return out


def default_memory_categories() -> list:
    return ["短期记忆", "长期记忆", "重要伏笔", "设定备忘"]


def default_history() -> dict:
    return {"items": [], "current": ""}


def default_for(name: str) -> Any:
    if name == "config":
        return default_config()
    if name == "prompts":
        return prompts_mod.default_prompts()
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
    raise KeyError(f"未知集合: {name}")


# ─────────────────────────────────────────────
# 读写
# ─────────────────────────────────────────────
def _path(name: str) -> Path:
    if name not in COLLECTIONS and not is_section(name):
        raise KeyError(f"未知集合: {name}")
    return DATA_DIR / f"{name}.json"


def _deep_default(name: str) -> Any:
    return json.loads(json.dumps(default_for(name), ensure_ascii=False))


def load(name: str) -> Any:
    path = _path(name)
    with _LOCK:
        if not path.exists():
            return _deep_default(name)
        try:
            raw = path.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise RuntimeError(f"{path.name} 不是 UTF-8 编码") from exc
    if not raw.strip():
        return _deep_default(name)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{path.name} 解析失败: {exc}") from exc


def save(name: str, data: Any) -> Path:
    """原子写入；空值 / 关闭的元素在写盘前统一裁剪，保证 JSON 干净。"""
    if name in ("characters", "factions", "items", "equipment", "other") or is_section(name):
        data = _clean_records(data)
    path = _path(name)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    tmp = path.with_suffix(".json.tmp")
    with _LOCK:
        tmp.write_text(payload + "\n", encoding="utf-8")
        os.replace(tmp, path)
    return path


def _clean_records(data: dict) -> dict:
    """记录集合：丢掉空字符串 / 空列表字段，保持文件干净。"""
    from . import elements as el

    items = []
    for rec in (data or {}).get("items") or []:
        clean = {}
        for key, value in rec.items():
            if key == "elements":
                normalized = el.normalize(value)
                if normalized:
                    clean["elements"] = normalized
                continue
            if value in ("", None, []):
                continue
            clean[key] = value
        items.append(clean)
    result = {"items": items}
    for key, value in (data or {}).items():
        if key != "items" and value not in ("", None, []):
            result[key] = value
    return result


def load_all() -> dict:
    names = list(COLLECTIONS)
    for name in section_names():
        if name not in names:
            names.append(name)
    return {name: load(name) for name in names}


def load_all_names() -> list:
    names = list(COLLECTIONS)
    for name in section_names():
        if name not in names:
            names.append(name)
    return names


def schema_for(name: str) -> list:
    schema = load("schema")
    entry = schema.get(name) or {}
    return entry.get("elements") or []


def known_collection(name: str) -> bool:
    return name in COLLECTIONS or is_section(name)


def backup_all() -> Path:
    """把 data/ 下的 JSON 快照到 io/out/backup_<ts>/。"""
    target = io_out() / f"backup_{stamp()}"
    target.mkdir(parents=True, exist_ok=True)
    for name in load_all_names():
        path = _path(name)
        if path.exists():
            (target / path.name).write_bytes(path.read_bytes())
    return target
