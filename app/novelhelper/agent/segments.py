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

"""
novelhelper/agent/segments.py
段落切分与文档模型（可复用）。

* 最小单位是自然段：每个非空行就是一段；空行只作为段落之间的空白保留，
  不会再被当成「两段之间必须有空行」的 Markdown 规则；
* 每段都有稳定 ``paragraph_id``、原文哈希 ``original_hash`` 与前后指针；
* 段落文本之外的空白（分隔符）单独保存，合并改写时原样保留，
  因此可以随时从「段落列表」还原整篇文本，不会吞掉排版；
* 段落顺序固定：改写只替换某一段的文字，不增删段落，ID 跨轮稳定。
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

DEFAULT_MAX_PARAGRAPH_CHARS = 1200

_SENTENCE_END = re.compile(r"[。！？!?…；;]+[”’\"'」』]?")
_SCENE_HEAD = re.compile(r"^(?:\*{3,}|—{3,}|-{3,}|={3,}|场景[：:]|\[场景\])")
_QUOTES = "“”\"「」『』"


def normalize_newlines(text: str) -> str:
    """统一换行符；段落定位与哈希都以归一化后的文本为准。"""
    return str(text or "").replace("\r\n", "\n").replace("\r", "\n")


def sha256_text(text: str) -> str:
    """段落哈希：``sha256:<hex>``。前端与日志都用这个格式。"""
    digest = hashlib.sha256(str(text or "").encode("utf-8")).hexdigest()
    return "sha256:" + digest


@dataclass
class Paragraph:
    paragraph_id: str
    index: int
    text: str
    start: int
    end: int
    hash: str
    type: str = "narration"
    chapter_id: str = ""
    prev_id: str = ""
    next_id: str = ""

    @property
    def length(self) -> int:
        return len(self.text)

    def as_dict(self, include_text: bool = True) -> dict:
        data = {
            "paragraph_id": self.paragraph_id,
            "chapter_id": self.chapter_id,
            "index": self.index,
            "original_hash": self.hash,
            "prev_id": self.prev_id,
            "next_id": self.next_id,
            "type": self.type,
            "start": self.start,
            "end": self.end,
            "chars": self.length,
        }
        if include_text:
            data["text"] = self.text
        return data


def classify_paragraph(text: str) -> str:
    """段落类型：对话 / 场景 / 叙述。只做启发式判断，用于选择样例段。"""
    stripped = str(text or "").strip()
    if not stripped:
        return "narration"
    if _SCENE_HEAD.match(stripped):
        return "scene"
    quoted = sum(1 for ch in stripped if ch in _QUOTES)
    if stripped[0] in _QUOTES or quoted / max(1, len(stripped)) >= 0.3:
        return "dialogue"
    return "narration"


def _trim(text: str, start: int, end: int) -> tuple[int, int]:
    while start < end and text[start].isspace():
        start += 1
    while end > start and text[end - 1].isspace():
        end -= 1
    return start, end


def _block_ranges(text: str) -> list[tuple[int, int]]:
    """按换行切分自然段：每个非空行自成一段，空行只保留为分段空白。

    这样单换行（常见的小说正文）与空行分隔（Markdown 习惯）都能正确识别，
    不会要求用户为了「成段」额外补一个空行。
    """
    ranges: list[tuple[int, int]] = []
    pos = 0
    for line in text.split("\n"):
        line_start = pos
        line_end = pos + len(line)
        pos = line_end + 1
        if not line.strip():
            continue
        start, end = _trim(text, line_start, line_end)
        if end > start:
            ranges.append((start, end))
    return ranges


def _split_long_block(text: str, start: int, end: int, limit: int) -> list[tuple[int, int]]:
    """超长自然段按句末标点继续拆分；找不到句末时才硬切。"""
    pieces: list[tuple[int, int]] = []
    cursor = start
    while end - cursor > limit:
        cut = cursor + limit
        window = text[cursor:cut]
        last = None
        for match in _SENTENCE_END.finditer(window):
            if match.end() >= max(8, limit // 3):
                last = match.end()
        if last:
            cut = cursor + last
        else:
            space = text.rfind(" ", cursor + limit // 2, cut)
            if space > cursor:
                cut = space
        piece_end = cut
        while piece_end > cursor and text[piece_end - 1].isspace():
            piece_end -= 1
        if piece_end > cursor:
            pieces.append((cursor, piece_end))
        cursor = cut
        while cursor < end and text[cursor].isspace():
            cursor += 1
    if end > cursor:
        pieces.append((cursor, end))
    return pieces


def _paragraph_ranges(text: str, max_chars: int) -> list[tuple[int, int]]:
    ranges: list[tuple[int, int]] = []
    for start, end in _block_ranges(text):
        if max_chars > 0 and end - start > max_chars:
            ranges.extend(_split_long_block(text, start, end, max_chars))
        else:
            ranges.append((start, end))
    return ranges


class Document:
    """一篇文本的段落索引；改写与回滚都通过它完成。"""

    def __init__(self, text: str, *, chapter_id: str = "",
                 max_chars: int = DEFAULT_MAX_PARAGRAPH_CHARS, prefix: str = "p_"):
        self.text = normalize_newlines(text)
        self.chapter_id = str(chapter_id or "")
        self.prefix = prefix
        self.max_chars = max_chars
        ranges = _paragraph_ranges(self.text, max_chars)
        self.paragraphs: list[Paragraph] = []
        self.separators: list[str] = []
        previous_end = 0
        for index, (start, end) in enumerate(ranges):
            self.separators.append(self.text[previous_end:start])
            piece = self.text[start:end]
            self.paragraphs.append(Paragraph(
                paragraph_id=f"{prefix}{index + 1:03d}",
                index=index + 1,
                text=piece,
                start=start,
                end=end,
                hash=sha256_text(piece),
                type=classify_paragraph(piece),
                chapter_id=self.chapter_id,
            ))
            previous_end = end
        self.separators.append(self.text[previous_end:])
        self._refresh()

    # ── 基础 ─────────────────────────────
    def _refresh(self) -> None:
        cursor = 0
        total = len(self.paragraphs)
        for index, paragraph in enumerate(self.paragraphs):
            cursor += len(self.separators[index])
            paragraph.index = index + 1
            paragraph.start = cursor
            paragraph.end = cursor + len(paragraph.text)
            paragraph.hash = sha256_text(paragraph.text)
            paragraph.chapter_id = self.chapter_id
            paragraph.prev_id = self.paragraphs[index - 1].paragraph_id if index > 0 else ""
            paragraph.next_id = (self.paragraphs[index + 1].paragraph_id
                                 if index + 1 < total else "")
            cursor = paragraph.end

    @property
    def by_id(self) -> dict:
        return {paragraph.paragraph_id: paragraph for paragraph in self.paragraphs}

    def get(self, paragraph_id: str) -> Paragraph | None:
        return self.by_id.get(str(paragraph_id or "").strip())

    def render(self) -> str:
        parts = [self.separators[0]]
        for index, paragraph in enumerate(self.paragraphs):
            parts.append(paragraph.text)
            parts.append(self.separators[index + 1])
        return "".join(parts)

    def current_text(self) -> str:
        return self.render()

    def __len__(self) -> int:
        return len(self.paragraphs)

    # ── 选择与上下文 ─────────────────────
    def ids_in_range(self, start: int, end: int) -> list[str]:
        """选区覆盖的段落；选区为空时返回全部。"""
        if end <= start:
            return [paragraph.paragraph_id for paragraph in self.paragraphs]
        return [paragraph.paragraph_id for paragraph in self.paragraphs
                if paragraph.end > start and paragraph.start < end]

    def neighbors(self, paragraph_id: str, before: int = 1, after: int = 1) -> list[Paragraph]:
        index = next((i for i, p in enumerate(self.paragraphs)
                      if p.paragraph_id == paragraph_id), -1)
        if index < 0:
            return []
        lo = max(0, index - max(0, before))
        hi = min(len(self.paragraphs), index + max(0, after) + 1)
        return [p for p in self.paragraphs[lo:hi] if p.paragraph_id != paragraph_id]

    def groups(self, paragraph_ids: list[str], *, max_chars: int = 6000,
               max_paragraphs: int = 6) -> list[list[str]]:
        """把目标段按相邻关系与体积分组成「场景组」，避免逐段孤立改写。"""
        wanted = {pid for pid in (paragraph_ids or []) if self.get(pid)}
        ordered = [p for p in self.paragraphs if p.paragraph_id in wanted]
        groups: list[list[str]] = []
        current: list[str] = []
        size = 0
        previous_index = None
        for paragraph in ordered:
            contiguous = previous_index is not None and paragraph.index == previous_index + 1
            too_big = current and (size + paragraph.length > max_chars
                                   or len(current) >= max_paragraphs)
            if current and (not contiguous or too_big):
                groups.append(current)
                current, size = [], 0
            current.append(paragraph.paragraph_id)
            size += paragraph.length
            previous_index = paragraph.index
        if current:
            groups.append(current)
        return groups

    def context_block(self, paragraph_ids: list[str], *, radius: int = 1,
                      max_chars: int = 600) -> str:
        """目标段前后文：去重后按顺序输出，供模型理解衔接。"""
        wanted = {pid for pid in (paragraph_ids or []) if self.get(pid)}
        picked: dict[str, Paragraph] = {}
        for pid in paragraph_ids or []:
            for paragraph in self.neighbors(pid, radius, radius):
                if paragraph.paragraph_id not in wanted:
                    picked[paragraph.paragraph_id] = paragraph
        blocks = []
        for paragraph in sorted(picked.values(), key=lambda item: item.index):
            text = paragraph.text
            if len(text) > max_chars:
                text = text[:max_chars].rstrip() + "…"
            blocks.append(
                f'<context paragraph_id="{paragraph.paragraph_id}" '
                f'type="{paragraph.type}">{text}</context>')
        return "\n".join(blocks)

    # ── 修改 ─────────────────────────────
    def replace(self, paragraph_id: str, text: str) -> Paragraph | None:
        paragraph = self.get(paragraph_id)
        if paragraph is None:
            return None
        paragraph.text = str(text or "").strip()
        self._refresh()
        return paragraph

    def set_texts(self, texts: list[str]) -> None:
        if len(texts) != len(self.paragraphs):
            raise ValueError("paragraph count mismatch")
        for paragraph, text in zip(self.paragraphs, texts):
            paragraph.text = str(text or "").strip()
        self._refresh()

    def snapshot(self) -> list[str]:
        return [paragraph.text for paragraph in self.paragraphs]

    def hashes(self) -> dict:
        return {paragraph.paragraph_id: paragraph.hash for paragraph in self.paragraphs}

    def hash_ok(self, paragraph_id: str, expected: str) -> bool:
        paragraph = self.get(paragraph_id)
        if paragraph is None:
            return False
        return not expected or paragraph.hash == str(expected).strip()

    def as_dict(self, *, include_text: bool = True) -> dict:
        return {
            "chapter_id": self.chapter_id,
            "chars": len(self.current_text()),
            "count": len(self.paragraphs),
            "paragraphs": [p.as_dict(include_text=include_text) for p in self.paragraphs],
        }

    def slice_of(self, paragraph: Paragraph) -> str:
        """当前整篇文本里该段落的文字（用于校验外部改动）。"""
        return self.render()[paragraph.start:paragraph.end]


def parse_document(text: str, **kwargs) -> Document:
    return Document(text, **kwargs)
