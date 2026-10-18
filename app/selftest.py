#!/usr/bin/env python3
# -*- coding: utf-8 -*-
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

from novelhelper import ai, context, history, project, prompts as prompts_mod, server, store  # noqa: E402

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
    check("默认元素模板包含自定义栏目",
          all(key in store.load("schema") for key in
              ("section_world", "section_species", "section_magic", "section_places", "section_religion")))
    section_labels = [s.get("label") for s in store.load("sections")["items"]]
    check("默认栏目设置", "世界观" in section_labels and "宗教与信仰" in section_labels,
          "、".join(section_labels))
    modes = store.load("modes")["items"]
    check("默认五种工作模式",
          {m["id"] for m in modes} == {"logic", "outline", "draft", "polish", "brainstorm"})
    check("每个模式都有模型与推理强度字段",
          all("model" in m and "effort" in m and "system_prompt" in m for m in modes))
    starts = [m["system_prompt"].lstrip()[:6] for m in modes]
    check("默认提示词不再以「你是一位/你是一个」开头",
          not any(s.startswith("你是一位") or s.startswith("你是一个") for s in starts))
    check("默认提供商与模型列表",
          cfg["api"]["provider"] == "deepseek" and "deepseek-chat" in cfg["api"]["models"])

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

    # ── 2. 历史指针 ───────────────────────────
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
        check("GET /api/state 返回提供商与动态模式",
              state.get("ok") and state.get("providers") and state.get("default_modes")
              and state.get("collections", {}).get("modes", {}).get("items")
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
              "控制在 80 字以内" in captured["messages"][1]["content"]
              and "测试提示词：雨夜入城" in captured["messages"][1]["content"])
        check("模式模型与推理强度被传入调用",
              captured["settings"]["model"] == "deepseek-chat"
              and captured["settings"]["effort"] == "low")

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

        log_path = TEMP_WORK / "log" / "novelhelper.log"
        log_text = log_path.read_text(encoding="utf-8") if log_path.exists() else ""
        check("日志文件写入配置目录", log_path.exists() and "[HTTP]" in log_text)
        check("日志记录 AI 交互", "[AI] request" in log_text and "[AI] response" in log_text)

        modes_res = get("/api/workstation/modes")
        check("GET /api/workstation/modes 返回动态模式",
              modes_res.get("ok") and any(m["id"] == "draft" for m in modes_res["modes"]))

        with urllib.request.urlopen(base + "/workstation.js", timeout=20) as resp:
            js = resp.read().decode("utf-8")
        check("前端工作站静态资源可访问", "AI 工作站" in js and "work-lock" in js)

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
