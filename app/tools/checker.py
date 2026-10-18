#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
checker.py
小说格式重排（去网文味）+ 剧情 BUG 修正

用法:
    python checker.py                  # 处理输出目录下最新的 out_*.md
    python checker.py out_xxx.md       # 处理指定文件（相对输出目录或绝对路径）
    python checker.py --all            # 处理输出目录下所有未重排的 out_*.md
    python checker.py --tail           # 只重排「## 正文」部分，写作思路/建议原样保留

模型与 API Key 来自 data/config.json；重排提示词使用内置兼容版本。
"""
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

import common as nh


def strip_header(raw: str) -> str:
    return nh.project.strip_output_header(raw)


def pick_latest() -> Path:
    out = nh.path("output_dir")
    if not out.exists():
        print(f"[错误] 输出目录不存在: {out}")
        sys.exit(1)
    candidates = [p for p in out.glob("out_*.md") if not p.stem.endswith(("_restyled", "_fixed"))]
    if not candidates:
        print(f"[错误] {out} 下没有可重排的 out_*.md")
        sys.exit(1)
    return max(candidates, key=lambda p: p.stat().st_mtime)


def list_candidates() -> list:
    out = nh.path("output_dir")
    if not out.exists():
        return []
    files = [p for p in out.glob("out_*.md") if not p.stem.endswith(("_restyled", "_fixed"))]
    return sorted(files, key=lambda p: p.stat().st_mtime)


def resolve_target(arg: str) -> Path:
    p = Path(arg)
    if p.is_absolute() and p.exists():
        return p
    candidate = nh.path("output_dir") / p
    if candidate.exists():
        return candidate
    if p.exists():
        return p
    print(f"[错误] 找不到文件: {arg}")
    sys.exit(1)


def restyle(text: str) -> str:
    settings = nh.tool("restyle")
    print(f"[信息] 正在调用 {settings['model']}（effort={settings['effort']}，重排）...")
    return nh.chat("restyle", [
        {"role": "system", "content": nh.prompt("restyle")},
        {"role": "user", "content": text},
    ])


def process_one(src: Path, only_body: bool = False) -> Path | None:
    print(f"\n[处理] {src.name}")
    raw = src.read_text(encoding="utf-8", errors="replace")
    parts = nh.project.split_parts(raw)
    target_text = parts["body"].strip() if only_body else strip_header(raw).strip()
    if not target_text:
        print(f"[跳过] {src.name} 正文为空")
        return None

    print(f"[信息] 输入长度: {len(target_text)} 字符")
    result = restyle(target_text)
    print(f"[信息] 输出长度: {len(result)} 字符")

    if only_body:
        merged = "\n\n".join(x for x in (parts["think"], result, parts["advice"]) if x.strip())
    else:
        merged = result

    dst = src.with_name(f"{src.stem}_restyled.md")
    header = (
        "# 小说创作输出（重排版）\n\n"
        f"原文件: {src.name}\n"
        f"重排时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        "---\n\n"
    )
    dst.write_text(header + merged, encoding="utf-8")
    print(f"[完成] 已保存至: {dst}")
    return dst


def main() -> int:
    nh.setup_console()
    args = sys.argv[1:]
    only_body = "--tail" in args
    rest = [a for a in args if not a.startswith("--")]

    print("=" * 50)
    print("  小说格式重排（去网文味）")
    print("=" * 50)

    if "--all" in args:
        sources = list_candidates()
        if not sources:
            print("[错误] out/ 下没有可重排的文件")
            return 1
    elif rest:
        sources = [resolve_target(rest[0])]
    else:
        sources = [pick_latest()]

    for src in sources:
        process_one(src, only_body=only_body)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
