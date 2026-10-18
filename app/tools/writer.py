#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
writer.py
小说协作创作（命令行版，与 AI 工作站共用 data/ 里的同一份 JSON 与提示词）

用法:
    python writer.py                  # 直接用 data/state.json 里的指令与设定写正文
    python writer.py -r               # 两步：high 推理+梗概 → 人工审核修改 → low 写正文
    python writer.py -r --no-review   # 两步但跳过人工审核
    python writer.py --plan out/plan/plan_xxx.txt   # 用一份已确认的计划直接写
    python writer.py --dry-run        # 只组装并打印将要发送的内容，不调用 API

可选覆盖:
    --prompt <文件>       用文件内容作为本次写作指令
    --state <文件>        用文件内容作为"当前状态"
    --character <名字>    只带入指定人物（可重复）
    --all-characters      带入全部人物档案
    --no-characters       不带人物档案

提示词、模型、推理档、目录全部来自 data/prompts.json 与 data/config.json，
改配置即可，不用动这个文件。

人物 / 记忆 / 世界观条目以 data/state.json 里的勾选为准（没勾选＝不带入）；
命令行可用 --all-characters / --character 临时覆盖人物选择。
"""
from __future__ import annotations

import subprocess
import sys
from datetime import datetime
from pathlib import Path

import common as nh


# ─────────────────────────────────────────────
# 计划文件
# ─────────────────────────────────────────────
def save_plan(text: str, chapter: str = "") -> Path:
    target_dir = nh.path("plan_dir")
    target_dir.mkdir(parents=True, exist_ok=True)
    suffix = f"_{chapter}" if chapter else ""
    target = target_dir / f"plan_{datetime.now().strftime('%Y%m%d_%H%M%S')}{suffix}.txt"
    header = (
        "写作前逻辑推理与剧情梗概\n"
        f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        "用法: 直接改本文件，回终端按回车即生效。\n"
        + "-" * 40 + "\n\n"
    )
    target.write_text(header + text, encoding="utf-8")
    return target


def load_plan(path: Path) -> str:
    raw = path.read_text(encoding="utf-8")
    return nh.project.strip_output_header(raw).strip()


def open_in_editor(path: Path) -> None:
    editor = (nh.config().get("editor") or "").strip()
    try:
        if editor:
            subprocess.Popen([editor, str(path)])
        elif sys.platform.startswith("win"):
            import os

            os.startfile(str(path))  # type: ignore[attr-defined]
        else:
            subprocess.Popen(["xdg-open", str(path)])
    except Exception as exc:  # noqa: BLE001
        print(f"[提示] 无法自动打开编辑器（{exc}），请手动打开：{path}")


def review_plan(plan_path: Path) -> str | None:
    print("=" * 60)
    print("  【第 2 步：人工审核】")
    print(f"  计划文件: {plan_path}")
    print("  已尝试用默认编辑器打开；改完回终端按回车重新读入。")
    print("  直接回车＝沿用原稿；输入 n＝放弃本次写作。")
    print("=" * 60)
    open_in_editor(plan_path)
    try:
        answer = input("审核完成后回车继续 > ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        print("\n[提示] 未收到输入，终止。")
        return None
    if answer == "n":
        print("[终止] 用户放弃本次写作。")
        return None
    edited = load_plan(plan_path)
    if not edited:
        print("[警告] 计划文件为空，终止。")
        return None
    print("\n" + "-" * 60)
    print("【确认后的推理与梗概】")
    print("-" * 60)
    print(edited)
    print("-" * 60)
    try:
        ok = input("依此撰稿？ [y/N] > ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        print("\n[提示] 未收到输入，终止。")
        return None
    if ok not in ("y", "yes", "是"):
        print("[终止] 用户未确认，未生成正文。")
        return None
    return edited


# ─────────────────────────────────────────────
# 组装
# ─────────────────────────────────────────────
def build_selection(args: list) -> dict:
    st = nh.state()
    ws = st.get("workstation") or {}
    ws_sel = ws.get("selection") or {}
    use_ws = bool(ws_sel)
    selection = {
        "prompt": (ws.get("prompt") if use_ws else st.get("prompt")) or "",
        "extra": (ws.get("extra") if use_ws else st.get("extra")) or "",
        "current_state": (ws.get("current_state") if use_ws else st.get("current_state")) or "",
        "include": (ws_sel.get("include") if use_ws else st.get("include")) or {
            "world": True, "state": True, "memory": True, "characters": True,
            "factions": False, "items": False, "equipment": False,
        },
        "character_ids": list((ws_sel.get("character_ids") if use_ws else st.get("character_ids")) or []),
        "memory_ids": list((ws_sel.get("memory_ids") if use_ws else st.get("memory_ids")) or []),
        "world_ids": list((ws_sel.get("world_ids") if use_ws else st.get("world_ids")) or []),
        "target_chars": ws_sel.get("target_chars") if use_ws else st.get("target_chars"),
        "strict_length": ws_sel.get("strict_length") if use_ws else st.get("strict_length"),
        "project_files": [],
    }

    if "--prompt" in args:
        selection["prompt"] = nh.project.read_text(args[args.index("--prompt") + 1])
    if "--state" in args:
        selection["current_state"] = nh.project.read_text(args[args.index("--state") + 1])

    if "--no-characters" in args:
        selection["include"]["characters"] = False
    if "--all-characters" in args:
        selection["include"]["characters"] = True
        selection["character_ids"] = [r["id"] for r in nh.store.load("characters").get("items") or []]
    elif "--character" in args:
        names = []
        for i, arg in enumerate(args):
            if arg == "--character" and i + 1 < len(args):
                names.append(args[i + 1])
        wanted = [r for r in nh.store.load("characters").get("items") or []
                  if (r.get("name") or "") in names]
        selection["include"]["characters"] = True
        selection["character_ids"] = [r["id"] for r in wanted]
        if not wanted:
            print(f"[警告] 没有找到人物: {'、'.join(names)}")

    for rel in (ws_sel.get("project_files") if use_ws else st.get("project_files")) or []:
        if isinstance(rel, dict):
            rel = rel.get("path") or ""
        if not rel:
            continue
        try:
            selection["project_files"].append({
                "path": rel, "label": rel, "content": nh.project.read_text(rel),
            })
        except FileNotFoundError:
            print(f"[提示] 附加文件不存在，已跳过: {rel}")
    return selection


def report(assembled: dict, cfg: dict) -> None:
    print(f"[信息] system prompt: {len(assembled['system'])} 字符")
    print(f"[信息] user message : {len(assembled['user'])} 字符")
    if (cfg.get("writing") or {}).get("target_chars"):
        print(f"[信息] 目标字数    : {cfg['writing']['target_chars']}")


# ─────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────
def main() -> int:
    nh.setup_console()
    args = sys.argv[1:]
    use_reason = ("--reason" in args) or ("-r" in args)
    no_review = "--no-review" in args
    dry_run = "--dry-run" in args

    plan_arg = ""
    if "--plan" in args:
        idx = args.index("--plan")
        if idx + 1 >= len(args):
            print("[错误] --plan 需要跟一个计划文件路径")
            return 1
        plan_arg = args[idx + 1]
        use_reason = False

    cfg = nh.config()
    prm = nh.prompts()
    db = nh.db()
    data_dir = nh.DATA_DIR

    mode_label = "直写（write 工具）"
    if plan_arg:
        mode_label = f"沿用计划文件（{plan_arg}）"
    elif use_reason:
        mode_label = "两步：high 推理+梗概 → 人工审核 → 写作" + ("（已关闭审核）" if no_review else "")

    print("=" * 52)
    print("  DeepSeek 小说协作创作")
    print("=" * 52)
    print(f"  数据目录: {data_dir}")
    print(f"  模式    : {mode_label}")
    print(f"  写作模型: {nh.tool('write')['model']}（effort={nh.tool('write')['effort']}）")
    print(f"  推理模型: {nh.tool('reason')['model']}（effort={nh.tool('reason')['effort']}）")

    selection = build_selection(args)
    if not any((selection["prompt"], selection["current_state"], selection["extra"])):
        print("[提示] data/state.json 里还没有写作指令/当前状态。")
        print("       可以在「AI 工作站」里填，或用 --prompt / --state 指定文件。")
    if selection["include"].get("characters") and not selection["character_ids"]:
        print("[提示] 还没有勾选人物（没勾选＝不带入）。可在 AI 工作站里勾，或用 --all-characters。")
    if not selection["world_ids"]:
        print("[提示] 还没有勾选世界观条目（没勾选＝不带入）。可在 AI 工作站里勾选。")

    state_data = nh.state()
    plan_path: Path | None = None

    # 第 1~2 步：推理 + 审核
    if plan_arg:
        plan_path = Path(plan_arg)
        if not plan_path.is_absolute():
            plan_path = nh.PROJECT_ROOT / plan_arg
        if not plan_path.exists():
            print(f"[错误] 找不到计划文件: {plan_path}")
            return 1
        plan_text = load_plan(plan_path)
        print(f"[信息] 已载入计划文件: {plan_path}")
    elif use_reason:
        print("-" * 52)
        print("[步骤 1/3] 逻辑推理 + 剧情梗概（reason 工具）")
        print("-" * 52)
        assembled = nh.context.assemble(cfg, db, prm, selection, mode="reason")
        if dry_run:
            print("[DRY-RUN] 以下是将要发送的 user message 前 1500 字符：\n")
            print(assembled["user"][:1500])
            print("\n[DRY-RUN] 结束。")
            return 0
        print(f"[信息] 正在调用 {nh.tool('reason')['model']} ...")
        plan_text = nh.chat("reason", [
            {"role": "system", "content": assembled["system"]},
            {"role": "user", "content": assembled["user"]},
        ])
        print(f"[信息] 推理输出: {len(plan_text)} 字符")
        if no_review:
            print("[信息] 已跳过人工审核。")
        else:
            plan_path = save_plan(plan_text, state_data.get("chapter") or "")
            reviewed = review_plan(plan_path)
            if reviewed is None:
                return 0
            plan_text = reviewed
        state_data["plan"] = plan_text
        nh.save_state(state_data)
        print(f"[信息] 计划已写入 data/state.json" + (f"，文件: {plan_path}" if plan_path else ""))
    else:
        plan_text = state_data.get("plan") or ""

    # 第 3 步：写正文
    print("-" * 52)
    print("[步骤 3/3] 写正文" if use_reason else "[步骤] 写正文")
    print("-" * 52)
    assembled = nh.context.assemble(cfg, db, prm, selection, plan=plan_text, mode="write")
    report(assembled, cfg)
    if dry_run:
        print("\n[DRY-RUN] 以下是将要发送的 user message 前 1500 字符：\n")
        print(assembled["user"][:1500])
        print("\n[DRY-RUN] 未调用 API。")
        return 0

    print(f"[信息] 正在调用 {nh.tool('write')['model']} ...")
    content = nh.chat("write", [
        {"role": "system", "content": assembled["system"]},
        {"role": "user", "content": assembled["user"]},
    ])

    out_path = nh.project.write_output(content, mode_label=mode_label)
    state_data["draft"] = content
    nh.save_state(state_data)
    print(f"[完成] 正文已保存至: {out_path}")
    print(f"[信息] 输出长度: {len(content)} 字符")
    print("[提示] 想压缩成记忆：在记忆库或旧版接口中调用 summarize / compress 工具。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
