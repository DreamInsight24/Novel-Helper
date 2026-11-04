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

"""流式生成：逐段返回、完整写作落成新章节、停止生成丢弃结果。

上游模型用一个本地 SSE 假服务代替，不访问网络、不写用户数据。
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))

PIECES = ["夜雨落在码头上。", "灯影被风吹散。", "她把信收进衣袋。"]


class _Upstream(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    delay = 0.12

    def log_message(self, *args):  # noqa: A003 - silence the test server
        pass

    def do_POST(self):  # noqa: N802
        length = int(self.headers.get("Content-Length") or 0)
        payload = json.loads(self.rfile.read(length) or b"{}")
        assert payload.get("stream") is True, "工作站必须用流式请求上游"
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()
        try:
            for piece in PIECES:
                event = {"choices": [{"delta": {"content": piece}}]}
                data = ("data: " + json.dumps(event, ensure_ascii=False) + "\n\n").encode("utf-8")
                self.wfile.write(b"%x\r\n" % len(data) + data + b"\r\n")
                self.wfile.flush()
                time.sleep(self.delay)
            usage = {"choices": [], "usage": {"prompt_tokens": 10, "completion_tokens": 20,
                                              "total_tokens": 30}}
            data = ("data: " + json.dumps(usage) + "\n\n").encode("utf-8")
            self.wfile.write(b"%x\r\n" % len(data) + data + b"\r\n")
            self.wfile.flush()
            done = b"data: [DONE]\n\n"
            self.wfile.write(b"%x\r\n" % len(done) + done + b"\r\n")
            self.wfile.write(b"0\r\n\r\n")
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="novelhelper_stream_") as temp:
        os.environ["NOVELHELPER_HOME"] = temp
        os.environ["NOVELHELPER_DATA"] = str(Path(temp) / "data")

        from novelhelper import history, project, server as server_mod, store

        upstream = ThreadingHTTPServer(("127.0.0.1", 0), _Upstream)
        upstream.daemon_threads = True
        threading.Thread(target=upstream.serve_forever, daemon=True).start()
        upstream_url = "http://127.0.0.1:" + str(upstream.server_address[1])

        config = store.default_config()
        config["api"]["base_url"] = upstream_url
        config["api"]["models"] = ["mock-model"]
        config["api"]["default_model"] = "mock-model"
        config["api"]["api_key"] = "test-key"
        config["writing"]["target_chars"] = 800
        store.save("config", config)
        novel = store.create_novel("Stream test")
        store.open_novel(novel["id"])

        httpd = server_mod.serve(host="127.0.0.1", port=0)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        base = "http://127.0.0.1:" + str(httpd.server_address[1])

        def stream(body):
            request = urllib.request.Request(
                base + "/api/workstation/stream",
                data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
                headers={"Content-Type": "application/json"})
            return urllib.request.urlopen(request, timeout=30)

        response = stream({"surface": "workstation", "mode_id": "draft",
                           "prompt": "写一段雨夜码头", "session_id": ""})
        assert response.headers.get("Content-Type", "").startswith("application/x-ndjson")
        frames = []
        deltas = ""
        for raw in response:
            line = raw.decode("utf-8").strip()
            if not line:
                continue
            frame = json.loads(line)
            frames.append(frame)
            if frame.get("type") == "delta":
                deltas += frame["text"]
        types = [frame["type"] for frame in frames]
        assert types[0] == "start", types
        assert "delta" in types, types
        assert types[-1] == "done", types
        assert deltas.startswith("夜雨落在码头上。"), deltas[:60]
        assert len(types) > 3, "应该分多帧返回，而不是一次性给出全部内容"
        print("[PASS] 流式返回：start → 多段 delta → done")

        payload = frames[-1]["payload"]
        assert payload["ok"] is True, payload
        assert payload["usage"]["total_tokens"] == 30, payload.get("usage")
        chapter = payload.get("chapter") or {}
        assert chapter.get("rel"), payload
        target = Path(temp) / "workspace" / "novels" / novel["id"] / "output" / chapter["name"]
        assert target.exists(), target
        assert target.read_text(encoding="utf-8") == payload["clean_text"]
        assert target.name.startswith("001-"), target.name
        print("[PASS] 完整写作结果自动成为新章节：" + target.name)

        session = history.load_session(payload["session_id"])
        turn = session["turns"][-1]
        assert turn["meta"]["chapter"]["rel"] == chapter["rel"], turn["meta"]
        ws = store.load("state")["workstation"]
        assert ws["chapters"][chapter["rel"]]["session_id"] == payload["session_id"], ws
        print("[PASS] 章节索引记录来源对话，稿件处理可以跳回这次对话")

        listing = project.list_chapters()
        assert any(entry["name"] == target.name for entry in listing), listing
        print("[PASS] 章节列表包含新章节")

        # 停止生成：上游还没吐完就取消，结果不落盘、不留章节。
        _Upstream.delay = 0.25
        holder = {}

        def run():
            holder["response"] = stream({"surface": "workstation", "mode_id": "draft",
                                         "prompt": "再写一段", "session_id": ""})

        worker = threading.Thread(target=run)
        worker.start()
        for _ in range(60):
            if holder.get("response") is not None:
                break
            time.sleep(0.05)
        first = holder["response"].readline()  # start
        second = holder["response"].readline()  # 第一段 delta 之后
        assert json.loads(first)["type"] == "start"
        assert second, "应该至少收到一段增量"
        request = urllib.request.Request(base + "/api/workstation/cancel", data=b"{}",
                                         headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=10) as resp:
            assert json.loads(resp.read().decode("utf-8"))["cancelled"] is True
        remainder = holder["response"].read().decode("utf-8")
        final = json.loads(remainder.strip().splitlines()[-1]) if remainder.strip() else {}
        assert final.get("type") == "done" and final["payload"].get("cancelled") is True, final
        names = [entry["name"] for entry in project.list_chapters()]
        assert not any(name.startswith("002-") for name in names), names
        print("[PASS] 停止生成后不写章节，流以 cancelled 结束")
        worker.join(10)

        httpd.shutdown()
        upstream.shutdown()
    print("AI 工作站流式生成测试通过。")


if __name__ == "__main__":
    main()
