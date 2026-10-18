#!/usr/bin/env python3
"""
md2txt.py
小说正文 .md → .txt 手动重排转换工具

用法:
    python md2txt.py                     # 处理 out/ 下所有 out_*.md（默认紧凑）
    python md2txt.py out_xxx.md          # 处理指定文件（相对 out/ 或绝对路径）
    python md2txt.py --all               # 同无参数，显式指定
    python md2txt.py --newest            # 只处理最新修改的 out_*.md
    python md2txt.py -nt                 # 同上（短参数）
    python md2txt.py --keep-advice       # 保留 "## 写作建议" 部分
    python md2txt.py --normal            # 段落之间保留 1 个空行（旧行为）
    python md2txt.py --dry-run           # 只显示会处理哪些文件，不实际写入
"""

import sys
from pathlib import Path

import common as nh

# ─────────────────────────────────────────────
# 路径配置
# ─────────────────────────────────────────────
# 目录来自 data/config.json 的 paths 段，改配置即可，不用改代码
SCRIPT_DIR = nh.PROJECT_ROOT
OUTPUT_DIR = nh.path("output_dir")
TXT_DIR = nh.path("txt_dir")

# 空行模式
#   "compact" 段落紧挨，不留空行（默认）
#   "normal"  段落之间保留 1 个空行
BLANK_MODE = "compact"


# ─────────────────────────────────────────────
# 文本处理
# ─────────────────────────────────────────────
def strip_header(raw: str) -> str:
    """剥离脚本生成的 header（创作输出 / 修复输出 / 重排版）。"""
    marker = "\n---\n"
    stripped = raw.lstrip()
    headers = (
        "# 小说创作输出",
        "# 小说修复输出",
    )
    if any(stripped.startswith(h) for h in headers) and marker in raw:
        return raw.split(marker, 1)[1].lstrip()
    return raw


def strip_advice(text: str) -> str:
    """剥离 `## 写作建议` 及其之后的内容。"""
    marker = "## 写作建议"
    idx = text.find(marker)
    if idx == -1:
        return text
    return text[:idx].rstrip()


def merge_intra_paragraph_breaks(text: str) -> str:
    """
    把段落内部的单换行合并掉。
    规则：
      - 空行视为段落分隔，保留
      - 非空行且上一行也非空 → 合并到上一行（同一段被误拆）
      - 非空行且上一行为空 → 作为新段落的开头
    """
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = text.split("\n")
    out = []
    for ln in lines:
        if ln.strip() == "":
            out.append("")
        elif out and out[-1] != "":
            out[-1] = out[-1].rstrip() + ln.strip()
        else:
            out.append(ln.strip())
    return "\n".join(out)


def clean_blank_lines(text: str, mode: str = "compact") -> str:
    """
    清理多余空行。
    - compact: 删除所有空行，段落紧挨
    - normal:  连续 2+ 空行合并为 1 个；去掉开头/结尾空行
    """
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = text.split("\n")

    if mode == "compact":
        kept = [ln.rstrip() for ln in lines if ln.strip() != ""]
        return "\n".join(kept)

    # normal 模式
    result = []
    blank = 0
    for ln in lines:
        if ln.strip() == "":
            blank += 1
            if blank == 1:
                result.append("")
        else:
            blank = 0
            result.append(ln.rstrip())

    while result and result[0] == "":
        result.pop(0)
    while result and result[-1] == "":
        result.pop()
    return "\n".join(result)


def convert_text(raw: str, keep_advice: bool, blank_mode: str) -> str:
    body = strip_header(raw)
    if not keep_advice:
        body = strip_advice(body)
    body = merge_intra_paragraph_breaks(body)
    return clean_blank_lines(body, blank_mode)


# ─────────────────────────────────────────────
# 文件选择
# ─────────────────────────────────────────────
def list_sources() -> list:
    """按修改时间正序返回 out/ 下所有 out_*.md 和 fixed_*.md。"""
    if not OUTPUT_DIR.exists():
        return []
    files = []
    for pattern in ("out_*.md", "fixed_out_*.md"):
        files.extend(p for p in OUTPUT_DIR.glob(pattern) if p.is_file())
    return sorted(files, key=lambda p: p.stat().st_mtime)


def pick_newest() -> list:
    """只返回最新修改的那一个文件。"""
    sources = list_sources()
    if not sources:
        return []
    return [sources[-1]]


def resolve_target(arg: str) -> Path:
    p = Path(arg)
    if p.is_absolute() and p.exists():
        return p
    candidate = OUTPUT_DIR / p
    if candidate.exists():
        return candidate
    if p.exists():
        return p
    print(f"[错误] 找不到文件: {arg}")
    sys.exit(1)


# ─────────────────────────────────────────────
# 转换单个文件
# ─────────────────────────────────────────────
def process_one(src: Path, keep_advice: bool, blank_mode: str, dry_run: bool):
    print(f"\n[处理] {src.name}")
    try:
        raw = src.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        print(f"[跳过] 编码不是 UTF-8: {src}")
        return None

    body = convert_text(raw, keep_advice, blank_mode)
    if not body.strip():
        print(f"[跳过] 正文为空: {src.name}")
        return None

    dst = TXT_DIR / (src.stem + ".txt")
    print(f"       输入: {len(raw)} 字符  →  输出: {len(body)} 字符")
    print(f"       目标: {dst.relative_to(SCRIPT_DIR)}")

    if dry_run:
        return dst

    TXT_DIR.mkdir(parents=True, exist_ok=True)
    dst.write_text(body + "\n", encoding="utf-8")
    print(f"       [完成]")
    return dst


# ─────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────
def main():
    global BLANK_MODE

    args = sys.argv[1:]
    keep_advice = "--keep-advice" in args
    dry_run = "--dry-run" in args
    newest = ("--newest" in args) or ("-nt" in args)
    explicit_all = "--all" in args

    if "--normal" in args:
        BLANK_MODE = "normal"

    positional = [a for a in args if not a.startswith("--") and a != "-nt"]

    print("=" * 50)
    print("  小说正文 .md → .txt 转换")
    print("=" * 50)

    # 决定处理哪些文件
    # 优先级：显式文件路径 > --newest > --all / 无参数
    if positional:
        sources = [resolve_target(positional[0])]
        scope = f"指定文件: {sources[0].name}"
    elif newest:
        sources = pick_newest()
        scope = "仅最新一个"
    else:
        sources = list_sources()
        scope = "全部"

    print(f"  范围: {scope}"
          f" | {'保留建议' if keep_advice else '仅正文'}"
          f" | 空行: {BLANK_MODE}"
          f" | {'DRY-RUN' if dry_run else '写入'}")

    if not sources:
        print(f"[错误] 没有可处理的 .md 文件（查找目录: {OUTPUT_DIR}）")
        sys.exit(1)

    print(f"[信息] 待处理文件: {len(sources)} 个")
    ok = 0
    for src in sources:
        if process_one(src, keep_advice, BLANK_MODE, dry_run):
            ok += 1

    print(f"\n[完成] 成功处理 {ok} / {len(sources)} 个文件")
    if not dry_run:
        print(f"[位置] {TXT_DIR}")


if __name__ == "__main__":
    main()
