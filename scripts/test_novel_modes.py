"""Novel setup modes: visibility and template trimming at creation time."""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))

with tempfile.TemporaryDirectory(prefix="novelhelper_modes_") as temp:
    os.environ["NOVELHELPER_HOME"] = temp
    os.environ["NOVELHELPER_DATA"] = str(Path(temp) / "data")
    from novelhelper import store

    store.ensure_dirs()
    failures = 0

    def check(name: str, ok: bool, extra: str = "") -> None:
        global failures
        if ok:
            print("PASS", name)
        else:
            failures += 1
            print("FAIL", name, extra)

    def create(mode: str):
        novel = store.create_novel("Modes " + mode, mode=mode)
        store.open_novel(novel["id"])
        meta = store.read_novel(novel["id"]) or {}
        return meta, store.load("sections"), store.load("schema")

    meta, sections, schema = create("simple")
    visible = [item["key"] for item in sections["items"] if item.get("on")]
    builtins = {key: value.get("on", True) for key, value in sections["builtins"].items()}
    character_keys = [item["key"] for item in schema["characters"]["elements"]]
    check("简易模式记录在小说元数据", meta.get("setup_mode") == "simple")
    check("简易模式只开启人物档案", visible == [] and builtins["characters"]
          and not any(builtins[key] for key in ("inventory", "world", "factions", "items", "other")),
          str(builtins))
    check("简易模式人物字段大幅精简",
          character_keys == ["身份", "性格", "背景", "关系"]
          and [leaf["key"] for leaf in schema["characters"]["elements"][0]["children"]]
          == ["本名", "性别", "年龄"], str(character_keys))

    meta, sections, schema = create("normal")
    visible = [item["key"] for item in sections["items"] if item.get("on")]
    builtins = {key: value.get("on", True) for key, value in sections["builtins"].items()}
    character_keys = [item["key"] for item in schema["characters"]["elements"]]
    check("普通模式开启人物档案与世界设定", visible == ["world"] and builtins["characters"]
          and not any(builtins[key] for key in ("inventory", "world", "factions", "items", "other")),
          str(visible) + " " + str(builtins))
    check("普通模式去掉过细的人物字段",
          character_keys == ["身份", "外貌", "性格", "能力", "背景", "关系"]
          and "身高" not in str(schema["characters"]), str(character_keys))

    meta, sections, schema = create("expert")
    builtins = {key: value.get("on", True) for key, value in sections["builtins"].items()}
    visible = [item["key"] for item in sections["items"] if item.get("on")]
    check("专家模式保留完整栏目", all(builtins.values()) and visible == ["world"], str(builtins))
    check("专家模式字段仍做减法",
          len(schema["characters"]["elements"]) < 8
          and [item["key"] for item in schema["characters"]["elements"]][:2] == ["身份", "外貌"])

    meta = store.create_novel("Modes default")
    check("未指定模式时默认普通", meta.get("setup_mode") == "normal")
    meta = store.create_novel("Modes unknown", mode="??")
    check("未知模式回落到普通", meta.get("setup_mode") == "normal")

    print(f"\n{'OK' if not failures else 'FAILED'} ({failures} failures)")
    raise SystemExit(1 if failures else 0)
