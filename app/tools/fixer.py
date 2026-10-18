#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fixer.py
针对具体问题定点修复正文

用法:
    python fixer.py                       # 最新 out_*.md + workspace/import/fix_prompt.txt
    python fixer.py --file out_xxx.md     # 指定要修复的文件
    python fixer.py --fix my_fix.txt      # 指定修复指令文件
    python fixer.py --text "第3段改成……"   # 直接给修复指令
    python fixer.py -m -s                 # 附带记忆 / 当前状态
    python fixer.py --dry-run             # 只显示会发什么，不调用 API

修复指令默认从 workspace/import/fix_prompt.txt 读。
模型与 API Key 来自 data/config.json；修复提示词使用内置兼容版本。
"""
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

import common as nh


def pick_latest() -> Path:
    out = nh.path("output_dir")
    candidates = [p for p in out.glob("out_*.md") if not p.stem.endswith(("_restyled", "_fixed"))]
    if not candidates:
        print(f"[错误] {out} 下没有 out_*.md")
        sys.exit(1)
    return max(candidates, key=lambda p: p.stat().st_mtime)


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


def read_fix_prompt(explicit: str = "") -> str:
    if explicit:
        return Path(explicit).read_text(encoding="utf-8", errors="replace").strip()
    candidates = [
        nh.path("import_dir") / "fix_prompt.txt",
    ]
    for path in candidates:
        if path.exists():
            return path.read_text(encoding="utf-8", errors="replace").strip()
    return ""


def build_user_message(body: str, fix_prompt: str, story_memory: str = "", current_state: str = "") -> str:
    parts = []
    if story_memory:
        parts.append(f"## 故事记忆（背景参考）\n\n{story_memory}")
    if current_state:
        parts.append(f"## 当前状态（背景参考）\n\n{current_state}")
    parts.append(f"## 待修复正文\n\n{body}")
    parts.append(f"## 修复指令\n\n{fix_prompt}")
    return "\n\n---\n\n".join(parts)


def memories_text(categories: list | None = None) -> str:
    data = nh.store.load("memories")
    lines = []
    for rec in data.get("items") or []:
        if categories and (rec.get("category") or "") not in categories:
            continue
        lines.append(nh.context.render_memory(rec))
    return "\n\n".join(lines)


def main() -> int:
    nh.setup_console()
    args = sys.argv[1:]
    with_memory = "-m" in args
    with_state = "-s" in args
    dry_run = "--dry-run" in args

    explicit_file = ""
    if "--file" in args:
        idx = args.index("--file")
        if idx + 1 >= len(args):
            print("[错误] --file 需要跟一个文件名")
            return 1
        explicit_file = args[idx + 1]

    explicit_fix = ""
    if "--fix" in args:
        idx = args.index("--fix")
        if idx + 1 >= len(args):
            print("[错误] --fix 需要跟一个文件名")
            return 1
        explicit_fix = args[idx + 1]

    inline_text = ""
    if "--text" in args:
        idx = args.index("--text")
        if idx + 1 < len(args):
            inline_text = args[idx + 1]

    print("=" * 50)
    print("  小说针对性修复")
    print("=" * 50)

    src = resolve_target(explicit_file) if explicit_file else pick_latest()
    print(f"[信息] 源文件: {src.name}")

    fix_prompt = inline_text.strip() or read_fix_prompt(explicit_fix)
    if not fix_prompt:
        print("[错误] 没有修复指令。可以 --text \"...\" 直接给，或把指令写进 workspace/import/fix_prompt.txt")
        return 1

    raw = src.read_text(encoding="utf-8", errors="replace")
    body = nh.project.extract_body(raw)
    if not body.strip():
        print(f"[错误] 源文件正文为空: {src.name}")
        return 1

    story_memory = memories_text() if with_memory else ""
    current_state = nh.state().get("current_state", "") if with_state else ""

    print(f"[信息] 修复指令:   {len(fix_prompt)} 字符")
    print(f"[信息] 源文件正文: {len(body)} 字符")
    if with_memory:
        print(f"[信息] 附带记忆:   {len(story_memory)} 字符")
    if with_state:
        print(f"[信息] 附带状态:   {len(current_state)} 字符")

    user_content = build_user_message(body, fix_prompt, story_memory, current_state)
    if dry_run:
        print("\n[DRY-RUN] 未调用 API。前 1200 字符：\n")
        print(user_content[:1200])
        return 0

    settings = nh.tool("fix")
    print(f"[信息] 正在调用 {settings['model']}（effort={settings['effort']}，修复）...")
    fixed = nh.chat("fix", [
        {"role": "system", "content": nh.prompt("fix")},
        {"role": "user", "content": user_content},
    ])
    print(f"[信息] 修复后长度: {len(fixed)} 字符")

    out = nh.path("output_dir")
    out.mkdir(parents=True, exist_ok=True)
    dst = out / f"fixed_{src.stem}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
    header = (
        "# 小说修复输出\n\n"
        f"源文件: {src.name}\n"
        f"修复时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        "---\n\n"
    )
    dst.write_text(header + fixed, encoding="utf-8")
    print(f"[完成] 已保存至: {dst}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
