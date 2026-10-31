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

"""
NovelHelper 自检。

不联网、不修改真实数据：数据目录与产出目录都指向临时目录，结束后清理。

用法：
    python app/selftest.py
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

TEMP_DATA = Path(tempfile.mkdtemp(prefix="novelhelper_data_"))
TEMP_WORK = Path(tempfile.mkdtemp(prefix="novelhelper_work_"))
os.environ["NOVELHELPER_DATA"] = str(TEMP_DATA)

import novelhelper  # noqa: E402
from novelhelper import ai, context, history, logger, project, prompts as prompts_mod, server, store  # noqa: E402
from novelhelper import _version  # noqa: E402
from novelhelper.store import _novels as novels_store  # noqa: E402

PASS: list[str] = []
FAIL: list[str] = []


def check(name: str, ok: bool, extra: str = "") -> None:
    (PASS if ok else FAIL).append(name)
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {extra}" if extra else ""))


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:
        pass

    print("=" * 64)
    print("  NovelHelper 自检")
    print("=" * 64)
    print(f"临时数据: {TEMP_DATA}")
    print(f"临时产出: {TEMP_WORK}")

    check("根包版本入口与版本模块保持兼容",
          novelhelper.__version__ == _version.__version__
          and novelhelper.APP_VERSION == _version.APP_VERSION
          and "__version__" not in novelhelper.__all__)

    # ── 0. 默认值 ─────────────────────────────
    cfg = store.default_config()
    cfg["paths"].update({
        "import_dir": str(TEMP_WORK / "import"),
        "export_dir": str(TEMP_WORK / "export"),
        "output_dir": str(TEMP_WORK / "output"),
        "plan_dir": str(TEMP_WORK / "output" / "plan"),
        "txt_dir": str(TEMP_WORK / "output" / "txt"),
        "text_dir": str(TEMP_WORK / "text"),
        "log_dir": str(TEMP_WORK / "log"),
    })
    store.save("config", cfg)
    for name in ("modes", "schema", "state", "sections", "history"):
        store.save(name, store.default_for(name))
    store.ensure_dirs()

    check("默认配置不包含 API Key", cfg["api"]["api_key"] == "")
    check("默认目标字数为 8000", cfg["writing"]["target_chars"] == 8000)
    check("默认超时为 899 秒", cfg["api"]["timeout"] == 899)
    check("默认端口为 8765 且首次引导未完成",
          cfg["server"]["port"] == 8765 and cfg["onboarding"]["done"] is False)
    debug_home = TEMP_WORK / "debug"
    debug_env = os.environ.copy()
    debug_env.update({
        "NOVELHELPER_DEBUG": "1",
        "NOVELHELPER_HOME": str(debug_home),
        "NOVELHELPER_DATA": str(debug_home / "data"),
    })
    debug_probe = subprocess.run(
        [sys.executable, "-c",
         "import sys; sys.path.insert(0, 'app'); "
         "from novelhelper import store; store.ensure_dirs(); "
         "print(store.DEBUG_MODE, store.PROJECT_ROOT, store.DATA_DIR, "
         "store.load('config')['server']['port'], store.log_dir())"],
        cwd=str(APP_DIR.parent), env=debug_env, capture_output=True,
        text=True, timeout=20,
    )
    debug_text = debug_probe.stdout.strip()
    check("调试模式使用独立目录与默认端口",
          debug_probe.returncode == 0
          and str(debug_home) in debug_text
          and " 8766 " in debug_text
          and str(debug_home / "log") in debug_text,
          debug_text or debug_probe.stderr[-300:])
    # ── 0.1 多小说隔离与删除 ──────────────────
    novel_a = store.create_novel("Selftest A")
    novel_b = store.create_novel("Selftest B")
    store.open_novel(novel_a["id"])
    store.save("characters", {"items": [{"id": "selftest-a-only", "name": "A only"}]})
    store.open_novel(novel_b["id"])
    check("小说 B 不读取小说 A 的集合数据",
          not any(item.get("id") == "selftest-a-only" for item in store.load("characters")["items"]))
    store.save("characters", {"items": [{"id": "selftest-b-only", "name": "B only"}]})
    store.open_novel(novel_a["id"])
    check("切回小说 A 后数据仍保留且不含 B 数据",
          any(item.get("id") == "selftest-a-only" for item in store.load("characters")["items"])
          and not any(item.get("id") == "selftest-b-only" for item in store.load("characters")["items"]))
    store.save_novel_config(novel_a["id"], {
        "version": 1, "use_global": {"writing": False},
        "values": {"writing": {"target_chars": 1234}},
    })
    check("小说配置覆盖可生效", store.current_config()["writing"]["target_chars"] == 1234)
    store.open_novel(novel_b["id"])
    check("小说配置覆盖不串到另一小说",
          store.current_config()["writing"]["target_chars"] != 1234)

    damaged = store.create_novel("Damaged selftest")
    damaged_dir = TEMP_DATA / "novels" / damaged["id"]
    (damaged_dir / "novel.json").write_text("{broken", encoding="utf-8")
    damaged_entry = next((item for item in store.list_novels() if item["id"] == damaged["id"]), {})
    check("损坏小说元数据降级为可管理条目", damaged_entry.get("ok") is False)
    recycled = TEMP_WORK / "recycle"
    original_recycle = novels_store._send_to_recycle_bin

    def fake_recycle(paths):
        recycled.mkdir(parents=True, exist_ok=True)
        for index, source in enumerate(paths):
            if source.exists():
                target = recycled / f"{len(list(recycled.iterdir()))}-{index}-{source.name}"
                shutil.move(str(source), str(target))

    try:
        def failed_recycle(_paths):
            raise OSError("simulated recycle failure")

        novels_store._send_to_recycle_bin = failed_recycle
        try:
            store.delete_novel(novel_b["id"], novel_b["title"])
            recycle_failure_preserved = False
        except ValueError:
            recycle_failure_preserved = (TEMP_DATA / "novels" / novel_b["id"]).exists()
        check("回收站失败时小说数据保留", recycle_failure_preserved)

        novels_store._send_to_recycle_bin = fake_recycle
        try:
            store.delete_novel(damaged["id"], "wrong-confirmation")
            damaged_confirmation_rejected = False
        except ValueError:
            damaged_confirmation_rejected = True
        store.delete_novel(damaged["id"], damaged["id"])
        check("损坏条目使用小说 ID 确认后可删除",
              damaged_confirmation_rejected and not damaged_dir.exists())
        store.open_novel(novel_b["id"])
        store.delete_novel(novel_b["id"], novel_b["title"])
        check("删除活动小说后清除活动 ID", store.active_novel_id() == "")
    finally:
        novels_store._send_to_recycle_bin = original_recycle
        store.set_active_novel(None)

    check("默认元素模板包含自定义栏目",
          all(key in store.load("schema") for key in
              ("section_world", "section_species", "section_magic", "section_places", "section_religion")))
    section_labels = [s.get("label") for s in store.load("sections")["items"]]
    section_keys = [s.get("key") for s in store.load("sections")["items"]]
    check("默认初始化全部基础设定栏目",
          section_keys == ["world", "species", "magic", "places", "history",
                           "economy", "rules", "religion"],
          "、".join(section_labels))
    modes = store.load("modes")["items"]
    check("默认五种工作模式",
          {m["id"] for m in modes} == {"logic", "outline", "draft", "polish", "brainstorm"})
    check("默认模式区分写稿与稿件处理",
          next(m for m in modes if m["id"] == "polish")["kind"] == "process"
          and all(m["kind"] == "write" for m in modes if m["id"] != "polish"))
    check("每个模式都有模型与推理强度字段",
          all("model" in m and "effort" in m and "system_prompt" in m for m in modes))
    # 旧版模式没有 kind：迁移应按 id 补齐，且可重复执行。
    store.save("modes", {"items": [
        {"id": "polish", "label": "润色修订", "system_prompt": "x"},
        {"id": "draft", "label": "完整写作", "system_prompt": "y"},
    ]})
    store._migrate_mode_kinds()
    migrated = {m["id"]: m for m in store.load("modes")["items"]}
    check("旧模式数据自动补齐用途",
          migrated["polish"]["kind"] == "process" and migrated["draft"]["kind"] == "write")
    store.save("modes", store.default_for("modes"))
    modes = store.load("modes")["items"]
    starts = [m["system_prompt"].lstrip()[:6] for m in modes]
    check("默认提示词不再以「你是一位/你是一个」开头",
          not any(s.startswith("你是一位") or s.startswith("你是一个") for s in starts))
    check("默认提供商与模型列表",
          cfg["api"]["provider"] == "deepseek"
          and cfg["api"]["models"] == ["deepseek-flash", "deepseek-v4-pro"]
          and cfg["api"]["default_model"] == "deepseek-flash")

    # ── 1. 造数据并组装 ───────────────────────
    store.save("characters", {"items": [{
        "id": "ch_test", "name": "测试角色", "tag": "主角",
        "elements": [{"key": "身份", "children": [{"key": "本名", "value": "林舟"}]}],
        "inventory": [], "equipment": [], "notes": "", "tags": [],
        "created": store.now_str(), "updated": store.now_str(),
    }], "categories": []})
    store.save("memories", {"items": [{
        "id": "mm_test", "title": "开场记忆", "category": "短期记忆",
        "content": "角色从北门进入城中。", "tags": [],
        "created": store.now_str(), "updated": store.now_str(),
    }], "categories": store.default_memory_categories()})
    store.save("other", {"items": [{
        "id": "ot_test", "name": "世界概述", "category": "世界观",
        "elements": [{"key": "概述", "value": "一座临海城市。"}],
        "content": "", "tags": [], "created": store.now_str(), "updated": store.now_str(),
    }, {
        "id": "ot_unused", "name": "未选条目", "category": "世界观",
        "elements": [], "content": "不应该出现在提示词里。", "tags": [],
        "created": store.now_str(), "updated": store.now_str(),
    }], "categories": []})

    selection = {
        "prompt": "写角色进城的第一幕。",
        "extra": "保持克制的叙述。",
        "current_state": "傍晚，北门外。",
        "include": {"characters": True, "memory": True, "world": True,
                    "factions": False, "worldmap": False, "state": True},
        "character_ids": ["ch_test"],
        "memory_ids": ["mm_test"],
        "world_ids": ["ot_test"],
        "target_chars": 1200,
        "strict_length": True,
        "project_files": [{"path": "参考资料.md", "label": "参考资料.md", "content": "附加资料片段"}],
    }
    db = store.load_all()
    outline_mode = next(m for m in db["modes"]["items"] if m["id"] == "outline")
    draft_mode = next(m for m in db["modes"]["items"] if m["id"] == "draft")
    assembled = context.assemble_mode(db["config"], db, selection, outline_mode,
                                      work_prompt="先给一个场景框架。")
    check("工作站 system 使用工作模式提示词",
          "框架写作" in assembled["system"] and "章节目标" in assembled["system"])
    user = assembled["user"]
    check("工作站 user 包含已选设定与当前状态",
          all(x in user for x in ("林舟", "开场记忆", "临海城市", "傍晚，北门外", "写角色进城的第一幕")))
    check("未勾选的世界观条目不发送", "不应该出现在提示词里" not in user)
    check("工作要求会进入 user 消息", "先给一个场景框架" in user)
    check("完整写作模式会带字数要求",
          "1200" in context.assemble_mode(db["config"], db, selection, draft_mode)["user"])
    check("user 消息按设定名称自动拼装",
          "## 人物档案" in user and "## 故事记忆" in user and "## 其他设定" in user
          and "## 用户提示词" in user)
    check("不再生成任务说明 / 字数说明标题",
          "## 任务" not in user and "## 字数要求" not in user)
    polish_mode = next(m for m in db["modes"]["items"] if m["id"] == "polish")
    proc = context.assemble_mode(
        db["config"], db, {"prompt": "只改标点。", "target_chars": 1200},
        polish_mode, source_text="雨夜入城，灯火摇晃。")
    check("稿件处理把原文放进待处理文本区块",
          "## 待处理文本" in proc["user"] and "雨夜入城，灯火摇晃。" in proc["user"]
          and "只改标点。" in proc["user"])
    check("稿件处理不拼装目标字数",
          "目标字数" not in proc["user"] and context.mode_kind(polish_mode) == "process"
          and context.mode_kind(draft_mode) == "write")
    map_db = store.load_all()
    map_db["worldmap"] = {
        "name": "测试地图", "cols": ["中部"], "rows": ["中部"],
        "cells": {"中部|中部": "rg1"},
        "regions": {"rg1": {"id": "rg1", "name": "测试城", "summary": "", "details": "",
                            "elements": [], "parent": "", "tags": [], "board": {}}},
    }
    map_only = dict(selection, include={
        "characters": False, "memory": False, "world": False,
        "factions": False, "worldmap": True, "state": False,
    })
    map_user = context.assemble_mode(db["config"], map_db, map_only, draft_mode)["user"]
    check("世界地图可独立于世界观条目发送",
          "测试地图" in map_user and "测试城" in map_user and "临海城市" not in map_user)

    # Focused setting prose and canonical / legacy faction memberships.
    linked_char = {"id": "ch_link", "name": "新人物", "summary": "新概述", "content": "新正文", "elements": []}
    linked_faction = {"id": "fa_link", "name": "测试势力", "members": ["ch_link", {"id": "ch_link", "note": "旧身份"}, {"id": "ch_missing"}], "member_roles": {"ch_link": "护卫"}}
    linked_db = {"characters": {"items": [linked_char]}, "factions": {"items": [linked_faction]}}
    linked_text = context.render_character(linked_char, linked_db)
    check("人物自由正文与概述进入 AI 上下文", "新概述" in linked_text and "新正文" in linked_text)
    check("人物反向读取势力及身份，不复制关系", "测试势力（护卫）" in linked_text)
    faction_text = context.render_faction(linked_faction, linked_db)
    check("势力兼容旧对象关联并去重和提示失效条目", faction_text.count("新人物") == 1 and "ch_missing" in faction_text)
    check("其他设定正文只渲染一次", context.render_other(linked_char).count("新正文") == 1)
    exported_prose = project.clean_json("characters", linked_db)
    imported_prose = project.import_json(json.dumps(exported_prose, ensure_ascii=False), "characters")[0]
    check("自由正文与概述支持干净 JSON 往返", imported_prose.get("content") == "新正文" and imported_prose.get("summary") == "新概述" and not imported_prose["elements"])
    check("旧对象成员可导出 JSON", bool(project.clean_json("factions", linked_db)))
    pack_db = {"items": {"items": [{"id": "it_prose", "name": "新道具", "content": "正文效果"}]}}
    pack_text = context.render_character({"name": "携带者", "inventory": [{"item_id": "it_prose"}]}, pack_db)
    check("人物背包中的新道具自由正文进入上下文", "正文效果" in pack_text)


    detailed_db = dict(linked_db,
        sections={"items": [{"key": "hidden", "label": "隐藏设定"}]},
        section_hidden={"items": [{"id": "hidden_1", "name": "隐藏条目", "content": "仅选中时发送"}]},
        items={"items": [{"id": "item_1", "name": "信封", "content": "红印封缄"}]})
    detailed_selection = {"record_selections": {"factions": ["fa_link"], "section_hidden": ["hidden_1"], "items": ["item_1"]},
                          "setting_categories": ["section_hidden", "items"], "extra": "统一补充要求",
                          "current_state": "不应发送的旧状态", "include": {"state": True}}
    detailed_text = context.build_user_message({}, detailed_db, detailed_selection, {})
    check("详细设定选择可发送隐藏栏目和独立道具", "仅选中时发送" in detailed_text and "红印封缄" in detailed_text)
    check("关闭的设定类型不会发送且不再发送当前状态", "测试势力" not in detailed_text and "不应发送的旧状态" not in detailed_text)
    check("合并补充输入仅发送一次", detailed_text.count("统一补充要求") == 1)
    empty_detail = context.build_user_message({}, detailed_db, {"record_selections": {"factions": []}, "setting_categories": ["factions"]}, {})
    check("势力未勾选条目时不再整栏发送", "测试势力" not in empty_detail)
    resolved_detail = history.resolve_selection(detailed_db, {"record_selections": {"section_hidden": ["hidden_1", "deleted_id"]}, "setting_categories": ["section_hidden"]})
    check("新详细选择的历史支持自定义栏目与失效指针", resolved_detail["missing"] == 1 and resolved_detail["selection"]["record_selections"]["section_hidden"] == ["hidden_1"])

    # ── 2. 历史指针 ───────────────────────────
    check("历史标题公共入口保留原生成规则",
          history.title_from_prompt("  测试   标题 ", "outline") == "测试 标题")
    session = history.create_session("测试会话", "outline")
    compact = {
        "include": selection["include"],
        "character_ids": ["ch_test", "ch_missing"],
        "memory_ids": ["mm_test"],
        "world_ids": ["ot_test"],
        "target_chars": 1200,
    }
    saved = history.append_turn(
        session["id"], mode="outline", user_prompt=selection["prompt"],
        output="## 一、章节目标\n测试输出。", selection=compact,
        work_prompt="先给一个场景框架。",
        meta={"model": "test-model", "elapsed": 0})
    turn = saved["turns"][0]
    check("历史分别保存用户提示词与 AI 输出",
          turn["user_prompt"] == selection["prompt"] and turn["output"].startswith("## 一、章节目标"))
    check("历史只保存设定指针，不复制设定正文",
          "elements" not in turn["selection"] and turn["selection"]["character_ids"][0] == "ch_test")
    resolved = history.resolve_selection(store.load_all(), turn["selection"])
    check("失效指针会被跳过",
          resolved["missing"] == 1 and resolved["resolved"]["characters"][0]["name"] == "测试角色")
    listed = history.list_sessions()
    check("历史索引可列出当前会话", bool(listed) and listed[0]["id"] == session["id"] and listed[0]["current"])
    check("会话文件独立存储", (TEMP_DATA / "conversations" / f"{session['id']}.json").exists())

    blank_session = history.create_session("尚未发送的草稿", "draft")
    check("未生成的对话仍出现在侧栏历史，草稿可再次打开",
          any(item["id"] == blank_session["id"] for item in history.list_sessions()))
    history.delete_session(blank_session["id"])
    history.set_current(session["id"])

    # ── 3. 导入规则 ───────────────────────────
    md_dir = TEMP_WORK / "import"
    md_dir.mkdir(parents=True, exist_ok=True)
    sample = md_dir / "sample.md"
    sample.write_text("# 设定\n## 主要角色\n### 测试角色（主角）\n- 本名：林舟\n", encoding="utf-8")
    records = project.records_from_md(sample.read_text(encoding="utf-8"), str(sample))
    check("Markdown 可解析为「其他设定」条目",
          bool(records) and records[0]["name"] == "测试角色" and records[0]["content"])
    char_json = md_dir / "characters.json"
    char_json.write_text(json.dumps({
        "items": [{
            "name": "导入角色", "tag": "配角",
            "elements": [{"key": "身份", "children": [{"key": "本名", "value": "导入名"}]}]
        }]
    }, ensure_ascii=False), encoding="utf-8")
    map_bad = md_dir / "map_bad.json"
    map_bad.write_text(json.dumps({"rows": [], "cols": []}), encoding="utf-8")
    map_good = md_dir / "map_good.json"
    map_good.write_text(json.dumps({
        "name": "导入地图", "rows": ["中部"], "cols": ["中部"],
        "cells": {"中部|中部": "rg_in"},
        "regions": {"rg_in": {"id": "rg_in", "name": "导入城", "elements": [],
                              "board": {}, "tags": [], "parent": ""}}
    }, ensure_ascii=False), encoding="utf-8")

    # ── 4. HTTP 接口 ──────────────────────────
    class ModelsHandler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            payload = json.dumps({"data": [{"id": "alpha"}, {"id": "beta"}]}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *args):
            pass

    models_httpd = ThreadingHTTPServer(("127.0.0.1", 8792), ModelsHandler)
    threading.Thread(target=models_httpd.serve_forever, daemon=True).start()
    httpd = server.serve(host="127.0.0.1", port=8793)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = "http://127.0.0.1:8793"

    def get(path):
        with urllib.request.urlopen(base + path, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def post(path, payload, expect_error=False):
        req = urllib.request.Request(base + path, data=json.dumps(payload).encode("utf-8"),
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8")
            if expect_error:
                return json.loads(raw)
            raise

    def delete(path):
        req = urllib.request.Request(base + path, method="DELETE")
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))

    try:
        state = get("/api/state")
        # 多小说模型下无活动小说时 /api/state 返回空集合状态，但全局静态字段仍应返回。
        check("GET /api/state 返回提供商与动态模式",
              state.get("ok") and state.get("providers") and state.get("default_modes")
              and state.get("api_ready") is False)

        prev = post("/api/ai/preview", {"mode_id": "draft", "selection": selection})
        check("POST /api/ai/preview 工作站预览", prev.get("ok") and "测试角色" in prev["user"])

        hist = get("/api/history")
        check("GET /api/history", hist.get("ok") and hist["items"])
        one = get("/api/history/" + hist["items"][0]["id"])
        check("GET /api/history/<id>", one.get("ok") and one["session"]["turns"])

        no_key = post("/api/workstation/run", {
            "mode_id": "draft", "prompt": "测试", "selection": selection
        }, expect_error=True)
        check("无 API Key 时返回明确错误", no_key.get("ok") is False and "API Key" in (no_key.get("error") or ""))
        status = get("/api/workstation/status")
        check("生成失败后自动释放工作站锁", status.get("busy") is False)
        models_missing = post("/api/models", {}, expect_error=True)
        check("获取模型时缺 API Key 会提示",
              models_missing.get("ok") is False and "API Key" in (models_missing.get("error") or ""))
        custom_cfg = store.load("config")
        custom_cfg["api"].update({
            "provider": "custom",
            "base_url": "http://127.0.0.1:8792/v1",
            "api_key": "",
            "models": [],
            "default_model": "",
        })
        models_ok = post("/api/models", {"config": custom_cfg})
        check("通过 URL 获取模型列表",
              models_ok.get("ok") and models_ok.get("models") == ["alpha", "beta"])

        # 用本地假模型验证成功路径：输出、历史、state 都落盘。
        captured = {}

        def fake_chat(config, settings, messages):
            captured["settings"] = settings
            captured["messages"] = messages
            return {
                "text": "## 测试输出\n\n雨夜入城，灯火在水面上摇晃。",
                "model": "mock-model",
                "effort": "low",
                "elapsed": 0.01,
                "usage": {"total_tokens": 12},
                "transport": "mock",
            }

        server.ai.chat_settings = fake_chat
        run = post("/api/workstation/run", {
            "mode_id": "draft",
            "prompt": "测试提示词：雨夜入城。",
            "work_prompt": "控制在 80 字以内。",
            "selection": selection,
        })
        check("工作站成功生成并返回输出",
              run.get("ok") and run.get("text", "").startswith("## 测试输出") and run.get("session_id"))
        check("AI 输出末尾自动附加生成声明",
              "本内容由 AI 生成" in run.get("text", "") and run.get("text", "").rstrip().endswith("请自行核对与修改后使用。"))
        last_turn = (run.get("session", {}).get("turns") or [{}])[-1]
        check("成功生成保存了用户提示词与输出",
              last_turn.get("user_prompt") == "测试提示词：雨夜入城。"
              and last_turn.get("output", "").startswith("## 测试输出"))
        saved_state = store.load("state")
        check("成功后 state 保存最近输出与当前会话",
              saved_state["workstation"]["output"].startswith("## 测试输出")
              and saved_state["workstation"]["current_session"] == run["session_id"])
        check("假模型收到工作模式补充要求与用户提示词",
              "控制在 80 字以内" in captured["messages"][-1]["content"]
              and "测试提示词：雨夜入城" in captured["messages"][-1]["content"])
        check("模式模型与推理强度被传入调用",
              captured["settings"]["model"] == "deepseek-flash"
              and captured["settings"]["effort"] == "low")

        check("续写按顺序发送历史用户与模型消息",
              len(captured["messages"]) == 4
              and captured["messages"][1]["role"] == "user"
              and captured["messages"][2]["content"] == turn["output"])
        prior = history.context_messages(run["session_id"])
        check("历史上下文预算不截断半轮", history.context_messages(run["session_id"], max_chars=1) == [])
        check("历史上下文轮数上限保留最近轮次",
              history.context_messages(run["session_id"], max_turns=1) == prior[-2:])
        check("空白新对话不带前一会话的上下文", history.context_messages("") == [])
        renamed = post("/api/history/rename", {"id": run["session_id"], "title": "续写测试"})
        check("对话重命名同步索引与内容且保留轮次",
              renamed.get("ok") and get("/api/history/" + run["session_id"])["session"]["title"] == "续写测试"
              and get("/api/history")["items"][0]["title"] == "续写测试"
              and len(history.load_session(run["session_id"])["turns"]) == 2)
        preview = post("/api/ai/preview", {"surface": "workstation", "mode_id": "draft",
                       "session_id": run["session_id"], "prompt": "接着写", "selection": selection})
        check("预览显示与续写相同的历史上下文", preview.get("history") == prior)

        # ── 稿件处理：不进写稿历史、不覆盖工作站输出 ──
        hist_before = get("/api/history")
        current_before = get("/api/history/" + hist_before["current"]) if hist_before.get("current") else {}
        turns_before = len((current_before.get("session") or {}).get("turns") or [])
        ws_before = store.load("state")["workstation"]["output"]

        wrong_surface = post("/api/workstation/run", {
            "surface": "workstation", "mode_id": "polish",
            "prompt": "只改标点。", "source_text": "雨夜入城。"
        }, expect_error=True)
        check("稿件处理模式不能用于 AI 工作站",
              wrong_surface.get("ok") is False and "稿件处理模式" in (wrong_surface.get("error") or ""))
        empty_source = post("/api/workstation/run", {
            "surface": "manuscript", "mode_id": "polish", "prompt": "只改标点。"
        }, expect_error=True)
        check("稿件处理缺少原文时返回明确错误",
              empty_source.get("ok") is False and "没有可处理的文本" in (empty_source.get("error") or ""))

        proc_prev = post("/api/ai/preview", {
            "surface": "manuscript", "mode_id": "polish",
            "prompt": "只改标点。", "source_text": "雨夜入城。"
        })
        check("稿件处理预览包含待处理文本与处理要求",
              proc_prev.get("ok") and "## 待处理文本" in proc_prev.get("user", "")
              and "雨夜入城。" in proc_prev.get("user", "")
              and "只改标点。" in proc_prev.get("user", ""))

        proc = post("/api/workstation/run", {
            "surface": "manuscript", "mode_id": "polish",
            "prompt": "只改标点。", "source_text": "雨夜入城，灯火摇晃。"
        })
        check("稿件处理成功返回干净结果",
              proc.get("ok") and proc.get("clean_text", "").startswith("## 测试输出")
              and "本内容由 AI 生成" not in proc.get("clean_text", "")
              and proc.get("text", "").find("本内容由 AI 生成") >= 0)
        check("稿件处理不创建写稿会话",
              proc.get("session") is None and proc.get("session_id") == "")
        saved_proc = store.load("state")
        check("稿件处理结果写入文本面板",
              saved_proc["textPanel"]["aiResult"]["text"] == proc.get("clean_text")
              and saved_proc["textPanel"]["aiResult"]["mode"] == "polish")
        check("稿件处理不覆盖工作站最近输出",
              saved_proc["workstation"]["output"] == ws_before)
        hist_after = get("/api/history")
        current_after = get("/api/history/" + hist_after["current"]) if hist_after.get("current") else {}
        check("稿件处理不追加写稿历史",
              len((current_after.get("session") or {}).get("turns") or []) == turns_before)
        user_msg = captured["messages"][-1]["content"]
        check("稿件处理请求把原文与要求一起发送",
              "## 待处理文本" in user_msg and "雨夜入城，灯火摇晃。" in user_msg
              and "只改标点。" in user_msg)

        import_ok = post("/api/import", {"kind": "md", "source": str(sample), "target": "other"})
        check("Markdown 可导入其他设定", import_ok.get("ok") and "其他设定" in import_ok.get("message", ""))
        import_bad = post("/api/import", {"kind": "memories", "source": str(sample), "target": "memories"},
                          expect_error=True)
        check("Markdown 不能导入到其他集合",
              import_bad.get("ok") is False and "其他设定" in (import_bad.get("error") or ""))

        json_ok = post("/api/import", {"kind": "json", "source": str(char_json), "target": "characters"})
        check("JSON 可导入任意设定集合", json_ok.get("ok") and "characters" in json_ok.get("message", ""))
        map_bad_res = post("/api/import", {"kind": "json", "source": str(map_bad), "target": "worldmap"},
                           expect_error=True)
        check("地图 JSON 格式错误会提示",
              map_bad_res.get("ok") is False and "地图" in (map_bad_res.get("error") or ""))
        map_ok_res = post("/api/import", {"kind": "json", "source": str(map_good), "target": "worldmap"})
        check("地图 JSON 可导入", map_ok_res.get("ok") and "导入地图" in map_ok_res.get("message", ""))
        check("导入地图写入区域", store.load("worldmap")["regions"]["rg_in"]["name"] == "导入城")

        log_dir = TEMP_WORK / "log"
        log_files = sorted(log_dir.glob("novelhelper_*.log"))
        log_text = log_files[-1].read_text(encoding="utf-8") if log_files else ""
        check("每次启动生成时间命名的日志", bool(log_files) and "novelhelper_" in log_files[-1].name)
        check("日志文件写入配置目录", bool(log_files) and "[HTTP]" in log_text)
        check("日志记录 AI 交互", "[AI] request" in log_text and "[AI] response" in log_text)
        client_log = post("/api/client-log", {"level": "error", "message": "selftest client error"})
        check("浏览器错误可写入日志",
              client_log.get("ok") and "[CLIENT]" in log_files[-1].read_text(encoding="utf-8"))
        for index in range(12):
            dummy = log_dir / f"novelhelper_20000101_0000{index:02d}_{index}.log"
            dummy.write_text("old\n", encoding="utf-8")
            os.utime(dummy, (0, 0))
        logger.start_session(force=True)
        remaining = list(log_dir.glob("novelhelper*.log"))
        check("日志最多保留 10 个并删除最早",
              len(remaining) <= 10 and not (log_dir / "novelhelper_20000101_000000_0.log").exists())

        chapter_content = "第一段。\n\n第二段。"
        chapter = post("/api/chapters", {"name": "测试章节", "content": chapter_content})
        check("稿件导入章节保持原文并出现在章节列表",
              chapter.get("ok") and get("/api/file?path=" + urllib.parse.quote(chapter["rel"]))["content"] == chapter_content
              and any(c["path"] == chapter["rel"] for c in chapter["chapters"]))
        duplicate = post("/api/chapters", {"name": "测试章节", "content": "另一份正文"})
        check("同名章节不覆盖原文件", duplicate["rel"] != chapter["rel"]
              and get("/api/file?path=" + urllib.parse.quote(chapter["rel"]))["content"] == chapter_content)
        sanitized = project.write_chapter("safe", "../../outside")
        check("章节名称不能写出章节目录", sanitized.parent == store.out_dir())
        empty_chapter = post("/api/chapters", {"name": "空章节", "content": " "}, expect_error=True)
        check("空稿件不能导入章节", empty_chapter.get("ok") is False)

        modes_res = get("/api/workstation/modes")
        check("GET /api/workstation/modes 返回动态模式",
              modes_res.get("ok") and any(m["id"] == "draft" for m in modes_res["modes"]))

        with urllib.request.urlopen(base + "/workstation.js", timeout=20) as resp:
            js = resp.read().decode("utf-8")
        check("前端工作站静态资源可访问", "agent-workstation" in js and "renderWorkstationHistory" in js and "work-lock" not in js)
        with urllib.request.urlopen(base + "/manuscript.js", timeout=20) as resp:
            manuscript_js = resp.read().decode("utf-8")
        check("稿件处理前端静态资源可访问",
              "nav.text" in manuscript_js and "manuscript.ai_assist" in manuscript_js
              and "manuscript.overwrite" in manuscript_js)

        deleted = delete("/api/history/" + hist["items"][0]["id"])
        check("DELETE /api/history/<id>", deleted.get("ok") is True)
    finally:
        models_httpd.shutdown()
        models_httpd.server_close()
        httpd.shutdown()
        httpd.server_close()

    print("-" * 64)
    print(f"通过 {len(PASS)} 项，失败 {len(FAIL)} 项")
    if FAIL:
        print("失败项：" + "；".join(FAIL))
    print("=" * 64)
    return 1 if FAIL else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    finally:
        shutil.rmtree(TEMP_DATA, ignore_errors=True)
        shutil.rmtree(TEMP_WORK, ignore_errors=True)
