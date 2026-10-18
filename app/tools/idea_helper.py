#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
idea_helper.py
写作灵感助手 —— 只读设定 / 记忆 / 当前状态，输出后续写作思路

用法:
    python idea_helper.py                 # 生成一份灵感（默认 3 条思路）
    python idea_helper.py -n 5            # 生成 5 条
    python idea_helper.py --focus 感情     # 聚焦某个方向
    python idea_helper.py --save          # 保存到 out/ideas/（.txt）

数据来自 data/*.json，提示词与模型来自 data/prompts.json（idea 工具）与 data/config.json。
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime

import common as nh


def build_input(n_ideas: int, focus: str = "") -> str:
    db = nh.db()
    parts = []
    if db.get("other", {}).get("items"):
        world = "\n\n".join(nh.context.render_other(r) for r in db["other"]["items"])
        parts.append(f"{nh.section('world', '## 世界观设定')}\n\n{world}")
    if db.get("worldmap"):
        parts.append(f"{nh.section('world', '## 世界观设定')} · 地图\n\n{nh.context.render_worldmap(db['worldmap'])}")
    if db.get("memories", {}).get("items"):
        mem = "\n\n".join(nh.context.render_memory(r) for r in db["memories"]["items"])
        parts.append(f"{nh.section('memory', '## 故事记忆')}\n\n{mem}")
    current_state = (nh.state().get("current_state") or "").strip()
    if current_state:
        parts.append(f"{nh.section('state', '## 当前状态')}\n\n{current_state}")

    task = f"请基于以上信息，提供 {n_ideas} 条有差异的后续写作思路。"
    if focus:
        task += f"\n优先聚焦方向：{focus}。但若该方向与当前状态不匹配，可以调整。"
    parts.append(f"{nh.section('task', '## 任务')}\n\n{task}")
    return "\n\n---\n\n".join(p for p in parts if p.strip())


def main() -> int:
    nh.setup_console()
    parser = argparse.ArgumentParser(description="写作灵感助手")
    parser.add_argument("-n", "--num", type=int, default=3, help="思路数量（默认 3）")
    parser.add_argument("--focus", type=str, default="", help="聚焦方向：感情 / 战斗 / 悬疑 / 日常 等")
    parser.add_argument("--save", action="store_true", help="保存到 out/ideas/（默认只打印）")
    parser.add_argument("--dry-run", action="store_true", help="只打印将要发送的内容")
    args = parser.parse_args()

    if not 1 <= args.num <= 10:
        print("[错误] -n 取值范围为 1–10")
        return 1

    print("=" * 50)
    print("  写作灵感助手")
    print("=" * 50)

    user_content = build_input(args.num, args.focus)
    print(f"[信息] 输入总长: {len(user_content)} 字符")
    if args.dry_run:
        print(user_content[:1200])
        return 0

    settings = nh.tool("idea")
    print(f"[信息] 正在调用 {settings['model']}（effort={settings['effort']}）...")
    content = nh.chat("idea", [
        {"role": "system", "content": nh.prompt("idea")},
        {"role": "user", "content": user_content},
    ])

    print("\n" + "=" * 50)
    print("  生成结果")
    print("=" * 50 + "\n")
    print(content)

    if args.save:
        ideas_dir = nh.path("output_dir") / "ideas"
        ideas_dir.mkdir(parents=True, exist_ok=True)
        suffix = f"_{args.focus}" if args.focus else ""
        dst = ideas_dir / f"idea_{datetime.now().strftime('%Y%m%d_%H%M%S')}{suffix}.txt"
        dst.write_text(content.strip() + "\n", encoding="utf-8")
        print(f"\n[完成] 已保存至: {dst}")
    else:
        print("\n[提示] 使用 --save 可保存到 out/ideas/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
