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

"""润色修订 Agent 的 HTTP 端到端测试：流式帧、会话恢复、回滚与删除。

上游模型用本地假服务代替，不访问网络、不写用户数据。
运行：python -B scripts/test_revision_stream.py
"""
from __future__ import annotations

import json
import os
import re
import sys
import tempfile
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))

TEXT = ("雨落在码头上，林昭把信收进衣袋里。\n\n"
        "“你终于来了。”沈砚站在灯下。\n\n"
        "远处传来汽笛声。\n")


class _Upstream(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):  # noqa: A003 - silence the test server
        pass

    def _reply(self, data) -> None:
        content = json.dumps(data, ensure_ascii=False)
        body = json.dumps({"choices": [{"message": {"content": content}}],
                           "model": "mock-model", "usage": {"total_tokens": 8}}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):  # noqa: N802
        length = int(self.headers.get("Content-Length") or 0)
        payload = json.loads(self.rfile.read(length) or b"{}")
        messages = payload.get("messages") or []
        system = messages[0].get("content", "") if messages else ""
        user = messages[-1].get("content", "") if messages else ""
        ids = re.findall(r'<target paragraph_id="([^"]+)"', user)
        if "策划模块" in system:
            self._reply({
                "need_revision": True,
                "goal": "让开头更紧张",
                "style": "短句为主",
                "style_guide": "短句、动作推进",
                "preserve": ["人物称呼", "剧情事实"],
                "forbidden": ["改变剧情事实", "新增人物"],
                "priority": "high",
                "targets": [{"paragraph_id": pid, "direction": "增强紧张感",
                             "priority": "high"} for pid in ids[:2]],
                "no_change_ids": ids[2:],
                "summary": [{"kind": "style", "text": "短句推进"}],
                "question": None,
            })
            return
        if "局部改写" in system:
            self._reply([
                {"paragraph_id": pid, "revised": self._text_of(user, pid) + "（改）",
                 "change_reason": "短句", "confidence": 0.9}
                for pid in ids
            ] + [{"paragraph_id": "p_999", "revised": "越界段落", "confidence": 0.1}])
            return
        if "修订审核" in system:
            self._reply({"pass": True, "issues": [], "next_instruction": "",
                         "needs_user_confirm": True})
            return
        self._reply({"pass": True, "issues": [], "next_instruction": ""})

    @staticmethod
    def _text_of(user: str, pid: str) -> str:
        match = re.search(rf'<target paragraph_id="{re.escape(pid)}"[^>]*>(.*?)</target>',
                          user, re.S)
        return match.group(1) if match else ""


def main() -> int:
    global _TEMP
    with tempfile.TemporaryDirectory(prefix="novelhelper_revision_stream_") as temp:
        os.environ["NOVELHELPER_HOME"] = temp
        os.environ["NOVELHELPER_DATA"] = str(Path(temp) / "data")

        from novelhelper import server as server_mod, store

        upstream = ThreadingHTTPServer(("127.0.0.1", 0), _Upstream)
        upstream.daemon_threads = True
        threading.Thread(target=upstream.serve_forever, daemon=True).start()
        upstream_url = "http://127.0.0.1:" + str(upstream.server_address[1])

        config = store.default_config()
        config["api"]["base_url"] = upstream_url
        config["api"]["models"] = ["mock-model"]
        config["api"]["default_model"] = "mock-model"
        config["api"]["api_key"] = "test-key"
        store.save("config", config)
        novel = store.create_novel("Revision stream test")
        store.open_novel(novel["id"])

        httpd = server_mod.serve(host="127.0.0.1", port=0)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        base = "http://127.0.0.1:" + str(httpd.server_address[1])

        def post(path: str, body: dict, *, expect_error: bool = False):
            request = urllib.request.Request(
                base + path, data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
                headers={"Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    return json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as exc:
                if not expect_error:
                    raise
                return {"status": exc.code,
                        "body": json.loads(exc.read().decode("utf-8"))}

        def get(path: str):
            with urllib.request.urlopen(base + path, timeout=15) as response:
                return json.loads(response.read().decode("utf-8"))

        def get_status(path: str) -> int:
            try:
                with urllib.request.urlopen(base + path, timeout=15) as response:
                    response.read()
                    return response.status
            except urllib.error.HTTPError as exc:
                return exc.code

        def stream(step: str, extra: dict) -> tuple[list, dict]:
            request = urllib.request.Request(
                base + "/api/revision/stream",
                data=json.dumps({"step": step, **extra}, ensure_ascii=False).encode("utf-8"),
                headers={"Content-Type": "application/json"})
            response = urllib.request.urlopen(request, timeout=60)
            assert response.headers.get("Content-Type", "").startswith("application/x-ndjson")
            frames = []
            for raw in response:
                line = raw.decode("utf-8").strip()
                if line:
                    frames.append(json.loads(line))
            done = [frame for frame in frames if frame.get("type") == "done"]
            assert done, [frame.get("type") for frame in frames]
            return frames, done[-1]["session"]

        failures = 0

        def check(name: str, ok: bool, extra: str = "") -> None:
            nonlocal failures
            if ok:
                print("PASS", name)
            else:
                failures += 1
                print("FAIL", name, extra)

        frames, session = stream("plan", {
            "prompt": "把开头改得紧张一点",
            "source_text": TEXT,
            "path": "text/ch003.md",
            "chapter": "第三章",
        })
        kinds = [frame.get("type") for frame in frames]
        check("流式帧包含 start / stage / done", "start" in kinds and "stage" in kinds
              and kinds[-1] == "done", str(kinds))
        check("计划阶段生成需求卡", session["state"] == "LOCATE"
              and session["card"]["goal"] == "让开头更紧张"
              and bool(session["preview"]), json.dumps(session["card"], ensure_ascii=False))
        check("计划只选中范围内的段落", len(session["plan"]["targets"]) == 2)
        session_id = session["id"]
        check("会话落在小说数据目录",
              (Path(temp) / "data" / "novels" / novel["id"] / "revisions"
               / f"{session_id}.json").exists())

        _frames, session = stream("sample", {"session_id": session_id})
        check("样例改写等待确认", session["state"] == "USER_CONFIRM_SAMPLE"
              and session["sample"]["status"] == "pending")
        check("样例展示结构化 diff", bool(session["sample"]["diff"]))

        _frames, session = stream("sample_choice", {
            "session_id": session_id, "choice": "accept"})
        check("确认样例后完成批量与审核", session["state"] == "USER_CONFIRM_FINAL"
              and session["review"]["pass"] is True)
        check("越界返回被丢弃并告警", any(item["code"] == "out_of_scope"
                                            for item in session["warnings"]))
        check("最终差异可展示", len(session["changes"]) == 2
              and "（改）" in session["doc"]["text"], str(len(session["changes"])))

        _frames, session = stream("accept", {"session_id": session_id})
        check("用户确认后会话结束", session["state"] == "DONE" and session["accepted"])
        check("版本记录包含已保留", any(item["source"] == "accept"
                                        for item in session["versions"]))

        loaded = get("/api/revision/session?id=" + session_id)
        check("接口可读取恢复会话", loaded["session"]["state"] == "DONE"
              and loaded["session"]["doc"]["text"] == session["doc"]["text"])
        listing = get("/api/revision/sessions")
        check("会话列表包含本次修订", any(item["id"] == session_id
                                         for item in listing["sessions"]))

        _frames, session = stream("rollback", {"session_id": session_id,
                                               "previous": True})
        check("回滚恢复原文", session["doc"]["text"] == TEXT and not session["accepted"]
              and session["changes"] == [], session["state"])

        removed = post("/api/revision/delete", {"id": session_id})
        missing = get_status("/api/revision/session?id=" + session_id)
        check("删除会话后不可再读取", removed["removed"] is True
              and missing == 404)
        idle = post("/api/revision/cancel", {})
        check("空闲时取消不报错", idle["ok"] is True and idle["cancelled"] is False)

        print(f"\n{'OK' if not failures else 'FAILED'} ({failures} failures)")
        return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
