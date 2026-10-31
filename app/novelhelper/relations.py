#!/usr/bin/env python3
# -*- coding: utf-8 -*-
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

"""Novel-scoped directed edges, identified by collection and record ID."""
from __future__ import annotations

import hashlib

RECORDS = ('characters', 'factions', 'items', 'other', 'memories')


def catalog(db: dict) -> dict:
    names = list(RECORDS) + ['section_' + s['key'] for s in
                             (db.get('sections') or {}).get('items', []) if s.get('key')]
    found = {(coll, rec['id']): rec for coll in names
             for rec in (db.get(coll) or {}).get('items', []) if rec.get('id')}
    found.update({('worldmap', key): rec for key, rec in
                  (db.get('worldmap') or {}).get('regions', {}).items()})
    return found


def ref_key(ref: dict) -> tuple:
    return ref.get('collection'), ref.get('id')


def memberships(db: dict) -> list:
    edges = []
    for faction in (db.get('factions') or {}).get('items', []):
        for member in faction.get('members') or []:
            rid = member if isinstance(member, str) else member.get('id')
            if not rid or not faction.get('id'):
                continue
            edges.append({'source': {'collection': 'characters', 'id': rid},
                          'target': {'collection': 'factions', 'id': faction['id']},
                          'type': '隶属', 'directed': True,
                          'note': (faction.get('member_roles') or {}).get(rid)
                          or (member.get('note', '') if isinstance(member, dict) else '')})
    return edges


def is_membership(edge: dict) -> bool:
    return (edge.get('type') == '隶属' and edge.get('directed', True)
            and edge.get('source', {}).get('collection') == 'characters'
            and edge.get('target', {}).get('collection') == 'factions')


def normalize(data: dict, db: dict, *, strict: bool = False) -> dict:
    if not isinstance(data, dict) or not isinstance(data.get('items', []), list):
        raise ValueError('关联数据必须包含 items 列表')
    pool = catalog(db)
    result, seen, ids = [], set(), set()
    raw = list(data.get('items') or [])
    if not data.get('initialized'):
        raw += memberships(db)
    for edge in raw:
        if not isinstance(edge, dict):
            if strict:
                raise ValueError('无效的关联')
            continue
        source, target = edge.get('source'), edge.get('target')
        if not isinstance(source, dict) or not isinstance(target, dict):
            if strict:
                raise ValueError('关联需要有效的起点与终点')
            continue
        a, b = ref_key(source), ref_key(target)
        if not all(isinstance(value, str) and value for value in (*a, *b)):
            if strict:
                raise ValueError('关联引用必须包含栏目名和条目 ID')
            continue
        kind = str(edge.get('type') or '').strip()[:80]
        if a not in pool or b not in pool or a == b or not kind:
            if strict:
                raise ValueError('关联条目不存在、指向自身或关系名称为空')
            continue
        directed = edge.get('directed', True) is not False
        if not directed and b < a:
            a, b = b, a
        key = (a, b, kind, directed)
        if key in seen:
            continue
        seen.add(key)
        rid = str(edge.get('id') or 'rel_' + hashlib.sha256(repr(key).encode()).hexdigest()[:20])
        if rid in ids:
            rid = 'rel_' + hashlib.sha256(repr(key).encode()).hexdigest()[:20]
        ids.add(rid)
        result.append({'id': rid, 'source': {'collection': a[0], 'id': a[1]},
                       'target': {'collection': b[0], 'id': b[1]}, 'type': kind,
                       'directed': directed, 'note': str(edge.get('note') or '')[:2000]})
    return {'items': result, 'initialized': True}


def sync_memberships(db: dict, graph: dict) -> dict:
    """Legacy fields are a projection for context renderers and older exports."""
    import copy
    factions = copy.deepcopy(db.get('factions') or {'items': []})
    for faction in factions.get('items', []):
        links = [edge for edge in graph['items'] if is_membership(edge)
                 and edge['target']['id'] == faction.get('id')]
        faction['members'] = [edge['source']['id'] for edge in links]
        faction['member_roles'] = {edge['source']['id']: edge['note'] for edge in links if edge['note']}
    return factions
