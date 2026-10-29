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

"""Language-sensitive built-in defaults for the language chosen at first run.

``default_for`` keeps the original built-in data so existing files stay
byte-compatible. ``localized_default_for`` returns the same structures with the
user-visible strings translated, and ``seed_localized_defaults`` writes them only
when a collection still holds its untouched built-in default. Language switches
after the first run never rewrite these files.
"""
from __future__ import annotations

import json
import re

from ..localization import get_languages, language_context, t
from ._defaults import default_for
from ._repository import _path, load, save

# Collections whose built-in defaults carry user-visible language.
LOCALIZED_COLLECTIONS = (
    "schema", "sections", "modes", "memories", "items", "equipment", "other", "worldmap",
)

_AXIS_KEY = {"北": "defaults.axis.north", "南": "defaults.axis.south",
             "西": "defaults.axis.west", "东": "defaults.axis.east"}
_AXIS_RE = re.compile(r"^([北南东西])(\d+)$")

# Built-in Chinese string -> translation key. The same string always maps to the
# same key so repeated labels (基本 / 类型 / 概述 …) stay consistent.
_KEYS = {
    '世界设定': 'nav.world_setting',
    '【接口】当前使用 {name} 的 OpenAI 兼容接口。': 'providers.note',
    '【接口】当前使用自定义 OpenAI 兼容接口。不要假定具体模型名称、厂商或特殊能力；以用户提供的设定与提示词为准。': 'providers.note_generic',
    '上一步': 'language.back',
    '上衣': 'defaults.slot.top',
    '下一步': 'language.next',
    '下装': 'defaults.slot.bottom',
    '世界地图': 'defaults.map.name',
    '世界背景': 'defaults.sections.world_from',
    '世界背景、大陆概况、总体设定': 'defaults.sections.world_desc',
    '世界观': 'defaults.section.world',
    '世界规则、特殊疾病、习俗': 'defaults.sections.rules_desc',
    '东': 'defaults.axis.east',
    '中部': 'defaults.axis.center',
    '主要效果': 'defaults.element.main_effect',
    '亚种': 'defaults.section.subspecies',
    '人数规模': 'defaults.element.size',
    '人物档案': 'defaults.schema.characters',
    '价格': 'defaults.element.price',
    '位置': 'defaults.section.location',
    '体型': 'defaults.element.build',
    '体重': 'defaults.element.weight',
    '信仰对象': 'defaults.section.deity',
    '关于世界': 'defaults.sections.about_world',
    '关系': 'defaults.element.relationships',
    '关系列表': 'defaults.element.relationship_list',
    '其他': 'defaults.category.other',
    '其他设定': 'defaults.category.other_setting',
    '分支': 'defaults.section.branch',
    '势力设定': 'defaults.schema.factions',
    '北': 'defaults.axis.north',
    '南': 'defaults.axis.south',
    '历史': 'defaults.element.history',
    '历史与时间线': 'defaults.section.history',
    '历史与现状': 'defaults.element.history_status',
    '历史事件': 'defaults.sections.history_from',
    '取向': 'defaults.element.orientation',
    '品级': 'defaults.element.grade',
    '善用武器': 'defaults.element.weapon',
    '地点与城市': 'defaults.section.places',
    '基本': 'defaults.element.basic',
    '备注': 'defaults.section.notes',
    '外形': 'defaults.element.shape',
    '外观描述': 'defaults.element.appearance_desc',
    '外貌': 'defaults.element.appearance',
    '大小': 'defaults.element.size_value',
    '头部': 'defaults.slot.head',
    '完整写作': 'defaults.mode.draft',
    '宗教': 'defaults.sections.religion_from',
    '宗教与信仰': 'defaults.section.religion',
    '实力': 'defaults.element.strength',
    '实力评级': 'defaults.element.power_rating',
    '对外关系': 'defaults.element.external_relations',
    '尾巴': 'defaults.element.tail',
    '属性、来源、技能类型、学习方式': 'defaults.sections.magic_desc',
    '常服': 'defaults.element.casual_wear',
    '年龄': 'defaults.element.age',
    '弱点': 'defaults.element.weakness',
    '影响': 'defaults.section.impact',
    '待整理': 'defaults.category.pending',
    '心结': 'defaults.element.heart_knot',
    '性别': 'defaults.element.gender',
    '性格': 'defaults.element.personality',
    '成立时间': 'defaults.element.founded',
    '战斗风格': 'defaults.element.combat_style',
    '手与足': 'defaults.element.hands_feet',
    '手部结构': 'defaults.element.hand_structure',
    '护甲': 'defaults.slot.armor',
    '披风': 'defaults.slot.cloak',
    '持有者': 'defaults.element.holder',
    '按指定问题修订文本，保留事实与情节': 'defaults.mode.polish_desc',
    '提示：部分初始化预设会随着初始语言的不同而更换语言；之后切换语言不会修改这部分内容。': 'language.initial_presets_hint',
    '擅长法术': 'defaults.element.spells',
    '效果': 'defaults.element.effect',
    '教义': 'defaults.section.doctrine',
    '教会、神系、信仰': 'defaults.sections.religion_desc',
    '整体': 'defaults.element.overall',
    '新写稿模式': 'defaults.mode.new_write',
    '新势力': 'defaults.record.new_faction',
    '新服饰/装备': 'defaults.record.new_equipment',
    '新条目': 'defaults.record.new_other',
    '新稿件处理模式': 'defaults.mode.new_process',
    '新角色': 'defaults.record.new_character',
    '新记忆': 'defaults.memory.new_title',
    '新道具': 'defaults.record.new_item',
    '时间': 'defaults.section.time',
    '时间线以及重大事件': 'defaults.sections.timeline_from',
    '服装': 'defaults.element.clothing',
    '服装偏好': 'defaults.section.dress_preference',
    '服饰': 'defaults.category.apparel',
    '服饰与装备': 'defaults.schema.equipment',
    '未命名': 'defaults.record.unnamed',
    '未命名区域': 'defaults.region.unnamed',
    '本名': 'defaults.element.real_name',
    '本命技能': 'defaults.element.signature_skill',
    '材料': 'defaults.category.material',
    '材质': 'defaults.element.material',
    '来历': 'defaults.element.origin',
    '标记与伤痕': 'defaults.element.marks_scars',
    '核对设定一致性，整理约束、风险与推进节点': 'defaults.mode.logic_desc',
    '核心性格': 'defaults.element.core_personality',
    '核心战力': 'defaults.element.core_power',
    '根据设定与提示词生成完整正文': 'defaults.mode.draft_desc',
    '框架写作': 'defaults.mode.outline',
    '概况': 'defaults.section.summary',
    '概述': 'defaults.section.overview',
    '正文_': 'defaults.text.draft_prefix',
    '武器': 'defaults.category.weapon',
    '毛发与瞳色': 'defaults.element.hair_eyes',
    '毛色': 'defaults.element.hair_color',
    '治疗': 'defaults.section.treatment',
    '消耗': 'defaults.element.cost',
    '消耗品': 'defaults.category.consumable',
    '润色修订': 'defaults.mode.polish',
    '灵感方案': 'defaults.mode.brainstorm',
    '物种': 'defaults.sections.species_from',
    '特殊疾病': 'defaults.sections.disease_from',
    '特殊癖好': 'defaults.element.quirk',
    '特殊纹样': 'defaults.element.pattern',
    '特点': 'defaults.section.features',
    '现状': 'defaults.element.status',
    '生日': 'defaults.element.birthday',
    '生理特征': 'defaults.section.physiology',
    '目标': 'defaults.element.goal',
    '瞳色': 'defaults.element.eye_color',
    '短期记忆': 'defaults.memory.short',
    '社会': 'defaults.section.society',
    '社会地位': 'defaults.section.social_status',
    '种族、生理特征、社会地位与亚种': 'defaults.sections.species_desc',
    '稿件处理': 'defaults.source.manuscript',
    '稿件处理 · 工作区': 'defaults.source.manuscript_workspace',
    '稿件处理记忆': 'defaults.memory.import_title',
    '穿戴效果': 'defaults.element.worn_effect',
    '穿戴部位': 'defaults.element.slot',
    '穿鞋习惯': 'defaults.element.shoe_habit',
    '立场': 'defaults.element.stance',
    '立场与目标': 'defaults.element.stance_goals',
    '第 {step} 步 / 共 {total} 步': 'language.step_of',
    '类型': 'defaults.element.type',
    '组织': 'defaults.section.organization',
    '细则': 'defaults.section.details',
    '经济与物价': 'defaults.section.economy',
    '经过': 'defaults.section.course',
    '结果': 'defaults.section.result',
    '给出多条有差异的后续方向供选择': 'defaults.mode.brainstorm_desc',
    '耐久': 'defaults.element.durability',
    '职业': 'defaults.element.occupation',
    '肉垫': 'defaults.element.paw_pads',
    '背景': 'defaults.element.background',
    '能力': 'defaults.element.ability',
    '能力倾向': 'defaults.section.ability_tendency',
    '自身故事': 'defaults.element.own_story',
    '获得方式': 'defaults.element.acquisition',
    '行为特征': 'defaults.element.behavior',
    '表现': 'defaults.section.symptoms',
    '西': 'defaults.axis.west',
    '规则': 'defaults.section.rules_fields',
    '规则与疾病': 'defaults.section.rules',
    '角与耳': 'defaults.element.horns_ears',
    '角色锚点': 'defaults.element.character_anchor',
    '记忆': 'defaults.schema.memories',
    '设定': 'defaults.sections.setting',
    '设定备忘': 'defaults.memory.note',
    '货币': 'defaults.sections.currency_from',
    '货币、物价参考、贸易': 'defaults.sections.economy_desc',
    '起因': 'defaults.section.cause',
    '足部结构': 'defaults.element.foot_structure',
    '身份': 'defaults.element.identity',
    '身份标签': 'defaults.element.identity_tag',
    '身高': 'defaults.element.height',
    '输出场景框架、节拍与可直接执行的写作提示词': 'defaults.mode.outline_desc',
    '逻辑写作': 'defaults.mode.logic',
    '道具': 'defaults.category.item',
    '道具设定': 'defaults.schema.items',
    '配色': 'defaults.element.color_scheme',
    '配色偏好': 'defaults.element.color_preference',
    '重大事件、战争、条约、预言': 'defaults.sections.history_desc',
    '重要伏笔': 'defaults.memory.foreshadow',
    '长期记忆': 'defaults.memory.long',
    '限制': 'defaults.element.limit',
    '隐藏设定': 'defaults.element.hidden_setting',
    '雷点': 'defaults.element.pet_peeve',
    '鞋靴': 'defaults.slot.shoes',
    '领地': 'defaults.element.territory',
    '饰品': 'defaults.slot.accessory',
    '首领': 'defaults.element.leader',
    '魔法': 'defaults.sections.magic_from',
    '魔法与技能': 'defaults.section.magic',
    '魔法适应性': 'defaults.element.magic_affinity',
    '魔物': 'defaults.category.monster',
}


def _tr(text: str) -> str:
    key = _KEYS.get(text)
    return t(key) if key else text


def _localize(value):
    if isinstance(value, str):
        return _tr(value)
    if isinstance(value, list):
        return [_localize(item) for item in value]
    if isinstance(value, dict):
        return {key: _localize(item) for key, item in value.items()}
    return value


def _axis(value: str) -> str:
    match = _AXIS_RE.match(value or "")
    if match:
        return t(_AXIS_KEY[match.group(1)]) + match.group(2)
    return _tr(value)


def localized_default_for(name: str, lang_id: str):
    """Return the built-in default for ``name`` translated into ``lang_id``."""
    with language_context(lang_id):
        if name == "worldmap":
            worldmap = default_for(name)
            worldmap["name"] = _tr(worldmap["name"])
            worldmap["rows"] = [_axis(value) for value in worldmap["rows"]]
            worldmap["cols"] = [_axis(value) for value in worldmap["cols"]]
            return worldmap
        return _localize(default_for(name))


def _canonical(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _language_ids() -> list[str]:
    return [str(entry["id"]) for entry in get_languages().get("languages", [])]


def seed_localized_defaults(lang_id: str) -> None:
    """Rewrite untouched built-in collections in the first-run language.

    A collection is only rewritten when it is missing or still exactly one of the
    built-in localized defaults, so user data is never overwritten. Comparing
    against every configured language (not only the default one) matters while the
    first-run wizard is still provisional: a previous preview may already have
    seeded English presets, and choosing 简体中文 afterwards must replace them
    instead of leaving a mixed-language initial setup.
    """
    for name in LOCALIZED_COLLECTIONS:
        try:
            pristine = {_canonical(localized_default_for(name, lang))
                        for lang in _language_ids()}
            path = _path(name)
            stored = _canonical(load(name)) if path.exists() else None
        except Exception:  # noqa: BLE001 - unreadable data is left untouched
            continue
        if stored is not None and stored not in pristine:
            continue
        save(name, localized_default_for(name, lang_id))
