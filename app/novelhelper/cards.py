# Copyright (C) 2026 DreamInsight24 and NovelHelper contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Global OC cards and local images, independent from novel collections."""
from __future__ import annotations

import base64
import binascii
import json
import os
from pathlib import Path
import re
import tempfile
import threading
import uuid

from . import store
from .localization import t

_LOCK = threading.RLock()
IMAGE_LIMIT = 2 * 1024 * 1024
_IMAGE_NAME = re.compile(r'^[a-f0-9]{32}\.(png|jpg|webp)$')


def _file() -> Path:
    return store.DATA_DIR / 'cards.json'


def _atomic(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix='.cards-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(content)
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def ensure() -> None:
    with _LOCK:
        if not _file().exists():
            _atomic(_file(), b'{"items":[]}\n')


def list_cards() -> dict:
    with _LOCK:
        ensure()
        data = json.loads(_file().read_text(encoding='utf-8'))
        if not isinstance(data, dict) or not isinstance(data.get('items'), list):
            raise ValueError(t('cards.invalid_data'))
        return data


def _save(data: dict) -> None:
    # Backups retain images as references; deleting a novel/card never removes them.
    backup = store.DATA_DIR / 'card_backups' / uuid.uuid4().hex / 'cards.json'
    _atomic(backup, _file().read_bytes())
    _atomic(_file(), (json.dumps(data, ensure_ascii=False, indent=2) + '\n').encode())


def save_card(body: dict) -> dict:
    if not isinstance(body, dict):
        raise ValueError(t('cards.invalid_data'))
    with _LOCK:
        data = list_cards()
        rid = body.get('id')
        card = next((item for item in data['items'] if item['id'] == rid), None)
        if rid and card is None:
            raise ValueError(t('cards.not_found'))
        if card is None:
            card = {'id': 'card_' + uuid.uuid4().hex, 'created': store.now_str(), 'image': ''}
        else:
            card = dict(card)
        for key in ('name', 'gender', 'role', 'age', 'summary', 'notes'):
            value = body.get(key, card.get(key, ''))
            if not isinstance(value, str) or len(value) > (100000 if key in ('summary', 'notes') else 200):
                raise ValueError(t('cards.invalid_data'))
            card[key] = value.strip()
        if not card['name']:
            raise ValueError(t('cards.name_required'))
        tags = body.get('tags', card.get('tags', []))
        if not isinstance(tags, list) or len(tags) > 100 or any(not isinstance(tag, str) or len(tag) > 200 for tag in tags):
            raise ValueError(t('cards.invalid_data'))
        card['tags'] = list(dict.fromkeys(tag.strip() for tag in tags if tag.strip()))
        card['updated'] = store.now_str()
        data['items'] = [card if item['id'] == rid else item for item in data['items']]
        if not rid:
            data['items'].append(card)
        _save(data)
        return card


def delete_card(rid: str) -> None:
    with _LOCK:
        data = list_cards()
        if not any(item['id'] == rid for item in data['items']):
            raise ValueError(t('cards.not_found'))
        data['items'] = [item for item in data['items'] if item['id'] != rid]
        _save(data)


def save_image(rid: str, data_url: str) -> dict:
    with _LOCK:
        data = list_cards()
        card = next((item for item in data['items'] if item['id'] == rid), None)
        if card is None:
            raise ValueError(t('cards.not_found'))
        if not isinstance(data_url, str) or len(data_url) > IMAGE_LIMIT * 4 // 3 + 100:
            raise ValueError(t('cards.image_invalid'))
        match = re.fullmatch(r'data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)', data_url)
        if not match:
            raise ValueError(t('cards.image_invalid'))
        try:
            content = base64.b64decode(match[2], validate=True)
        except (ValueError, binascii.Error) as exc:
            raise ValueError(t('cards.image_invalid')) from exc
        kind = match[1]
        valid = (kind == 'png' and content.startswith(b'\x89PNG\r\n\x1a\n') and len(content) >= 24
                 or kind == 'jpeg' and content.startswith(b'\xff\xd8\xff') and content.endswith(b'\xff\xd9')
                 or kind == 'webp' and content.startswith(b'RIFF') and content[8:12] == b'WEBP')
        if not valid or len(content) > IMAGE_LIMIT:
            raise ValueError(t('cards.image_invalid'))
        filename = uuid.uuid4().hex + ('.jpg' if kind == 'jpeg' else '.' + kind)
        path = store.DATA_DIR / 'card_images' / filename
        _atomic(path, content)
        card['image'] = filename
        card['updated'] = store.now_str()
        try:
            _save(data)
        except Exception:
            path.unlink(missing_ok=True)
            raise
        return card


def image_file(filename: str) -> tuple[Path, str]:
    if not _IMAGE_NAME.fullmatch(filename):
        raise FileNotFoundError(filename)
    path = store.DATA_DIR / 'card_images' / filename
    if not path.is_file():
        raise FileNotFoundError(filename)
    return path, {'.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp'}[path.suffix]
