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

"""Pure text cleanup and output parsing operations."""
from __future__ import annotations

import re


def strip_output_header(raw: str) -> str:
    marker = "\n---\n"
    stripped = raw.lstrip()
    headers = ("# 小说创作输出", "# 小说修复输出", "# 小说创作输出（重排版）")
    if any(stripped.startswith(h) for h in headers) and marker in raw:
        return raw.split(marker, 1)[1].lstrip()
    if stripped.startswith("写作前逻辑推理与剧情梗概"):
        parts = raw.split("-" * 40, 1)
        if len(parts) == 2:
            return parts[1].lstrip()
    return raw


def split_parts(raw: str) -> dict:
    body = strip_output_header(raw)
    parts = {"think": "", "body": body, "advice": ""}
    chunks = re.split(r"\n-{3,}\n", body)
    if len(chunks) >= 2:
        for chunk in chunks:
            text = chunk.strip()
            head = text.split("\n", 1)[0].strip("# ").strip()
            if "写作思路" in head:
                parts["think"] = text
            elif "写作建议" in head:
                parts["advice"] = text
            elif "正文" in head:
                parts["body"] = text
        if not parts["think"] and len(chunks) >= 3:
            parts["think"] = chunks[0].strip()
    return parts


def extract_body(raw: str) -> str:
    return split_parts(raw)["body"]


def md_to_txt(raw: str, keep_advice: bool = False, blank_mode: str = "compact") -> str:
    text = strip_output_header(raw)
    if not keep_advice:
        idx = text.find("## 写作建议")
        if idx != -1:
            text = text[:idx].rstrip()
    if blank_mode == "raw":
        return text
    text = merge_intra_paragraph_breaks(text)
    return clean_blank_lines(text, blank_mode)


def merge_intra_paragraph_breaks(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    out: list = []
    for line in text.split("\n"):
        if line.strip() == "":
            out.append("")
        elif out and out[-1] != "":
            out[-1] = out[-1].rstrip() + line.strip()
        else:
            out.append(line.strip())
    return "\n".join(out)


def clean_blank_lines(text: str, mode: str = "compact") -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    if mode == "compact":
        return "\n".join(line.rstrip() for line in text.split("\n") if line.strip() != "")
    result: list = []
    blank = 0
    for line in text.split("\n"):
        if line.strip() == "":
            blank += 1
            if blank == 1:
                result.append("")
        else:
            blank = 0
            result.append(line.rstrip())
    while result and result[0] == "":
        result.pop(0)
    while result and result[-1] == "":
        result.pop()
    return "\n".join(result)


def text_stats(text: str) -> dict:
    raw = text or ""
    lines = raw.split("\n")
    paragraphs = [p for p in re.split(r"\n\s*\n", raw) if p.strip()]
    cjk = len(re.findall(r"[\u4e00-\u9fff]", raw))
    return {
        "chars": len(raw),
        "chars_no_space": len(re.sub(r"\s", "", raw)),
        "cjk": cjk,
        "lines": len(lines),
        "non_empty_lines": sum(1 for line in lines if line.strip()),
        "paragraphs": len(paragraphs),
    }


def apply_text_op(text: str, op: str, arg: str = "") -> str:
    if op == "clean_blank":
        return clean_blank_lines(text, "normal")
    if op == "compact":
        return clean_blank_lines(text, "compact")
    if op == "merge_breaks":
        return merge_intra_paragraph_breaks(text)
    if op == "strip_indent":
        return "\n".join(line.lstrip("　 \t") for line in text.split("\n"))
    if op == "replace" and arg:
        pair = arg.split("\x1f")
        if len(pair) == 2:
            return text.replace(pair[0], pair[1])
    if op == "trim":
        return text.strip()
    return text
