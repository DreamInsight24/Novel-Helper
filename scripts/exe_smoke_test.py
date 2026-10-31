#!/usr/bin/env python3
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

"""Run a packaged NovelHelper executable in an isolated temporary directory."""
from __future__ import annotations

import json
import os
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))
from novelhelper._version import APP_VERSION  # noqa: E402


def pe_subsystem(path: Path) -> int:
    """Return the PE subsystem: 2 = Windows GUI, 3 = console."""
    with path.open("rb") as handle:
        header = handle.read(4096)
    if header[:2] != b"MZ":
        raise ValueError("not a PE executable")
    pe_offset = struct.unpack_from("<I", header, 0x3C)[0]
    if header[pe_offset:pe_offset + 4] != b"PE\0\0":
        raise ValueError("missing PE signature")
    optional = pe_offset + 24
    return struct.unpack_from("<H", header, optional + 68)[0]


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def request(base: str, path: str, *, method: str = "GET", payload: dict | None = None):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    headers = {"Content-Type": "application/json"} if data is not None else {}
    req = urllib.request.Request(f"{base}{path}", data=data, headers=headers, method=method)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=5) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read()


def json_request(base: str, path: str, *, method: str = "GET", payload: dict | None = None):
    status, body = request(base, path, method=method, payload=payload)
    return status, json.loads(body.decode("utf-8"))


def wait_ready(base: str, process: subprocess.Popen[Any]) -> None:
    deadline = time.monotonic() + 20
    last_error = ""
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"EXE exited early with code {process.returncode}")
        try:
            status, _ = request(base, "/")
            if status == 200:
                return
        except (OSError, urllib.error.URLError) as exc:
            last_error = str(exc)
        time.sleep(0.15)
    raise TimeoutError(f"EXE HTTP service did not become ready: {last_error}")


def stop(process: subprocess.Popen[Any]) -> None:
    if process.poll() is not None:
        return
    if os.name == "nt":
        # A windowed PyInstaller build has no console, so CTRL_BREAK_EVENT is
        # not delivered. Kill the whole one-file process tree; terminating
        # only the bootloader would leave the child holding log files open.
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            capture_output=True,
            timeout=15,
        )
        try:
            process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        return
    process.terminate()
    try:
        process.wait(timeout=8)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


class FakeModelHandler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        self.rfile.read(length)
        body = json.dumps(
            {
                "model": "mock-model",
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": "P4 EXE persisted output"},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {"total_tokens": 1},
            }
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format: str, *_args: object) -> None:
        pass


def check(name: str, condition: bool, detail: str = "") -> None:
    if not condition:
        raise AssertionError(f"{name}: {detail or 'condition is false'}")
    print(f"[PASS] {name}" + (f" - {detail}" if detail else ""))


def run(exe: Path) -> None:
    exe = exe.resolve()
    if not exe.is_file():
        raise FileNotFoundError(exe)
    subsystem = pe_subsystem(exe)
    check("EXE uses the Windows GUI subsystem (no console window)", subsystem == 2, str(subsystem))

    with tempfile.TemporaryDirectory(prefix="novelhelper_exe_smoke_") as temp_name:
        runtime = Path(temp_name) / "runtime"
        runtime.mkdir()
        isolated_exe = runtime / exe.name
        shutil.copy2(exe, isolated_exe)
        data_dir = runtime / "data"

        check_result = subprocess.run(
            [str(isolated_exe), "--check"],
            cwd=runtime,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=30,
        )
        check("packaged resources and writable data directory", check_result.returncode == 0,
              check_result.stdout.strip() or check_result.stderr.strip())
        version_result = subprocess.run(
            [str(isolated_exe), "--version"],
            cwd=runtime,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=30,
        )
        check("packaged version matches source", version_result.returncode == 0
              and version_result.stdout.strip() == APP_VERSION,
              version_result.stdout.strip() or version_result.stderr.strip())

        mock_server = ThreadingHTTPServer(("127.0.0.1", free_port()), FakeModelHandler)
        mock_thread = threading.Thread(target=mock_server.serve_forever, daemon=True)
        mock_thread.start()
        mock_base = f"http://127.0.0.1:{mock_server.server_port}/v1"
        app_port = free_port()
        app_base = f"http://127.0.0.1:{app_port}"
        env = os.environ.copy()
        for key in ("NOVELHELPER_HOME", "NOVELHELPER_DATA", "NOVELHELPER_DEBUG"):
            env.pop(key, None)
        env["PYTHONDONTWRITEBYTECODE"] = "1"

        process: subprocess.Popen[Any] | None = None
        log_stream = None
        try:
            for launch in (1, 2):
                log_stream = (runtime / f"server-{launch}.log").open("wb")
                process = subprocess.Popen(
                    [str(isolated_exe), "--no-window", "--host", "127.0.0.1", "--port", str(app_port)],
                    cwd=runtime,
                    env=env,
                    stdin=subprocess.DEVNULL,
                    stdout=log_stream,
                    stderr=subprocess.STDOUT,
                    creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
                )
                wait_ready(app_base, process)

                status, home = request(app_base, "/")
                check(f"EXE launch {launch} serves homepage", status == 200 and b"<!doctype html>" in home.lower())
                for asset in ("/core.js", "/workstation.js", "/style.css", "/icon.png",
                              "/i18n/i18n.js", "/i18n/bootstrap.js", "/i18n/example.html"):
                    asset_status, asset_body = request(app_base, asset)
                    check(f"EXE launch {launch} serves {asset}", asset_status == 200 and bool(asset_body))

                status, languages = json_request(app_base, "/api/i18n")
                check("EXE language configuration", status == 200 and bool(languages.get("languages")))
                for lang, expected in (("zh-CN", "保存"), ("en-US", "Save")):
                    status, catalog = json_request(app_base, "/api/i18n/" + lang)
                    check("EXE catalog " + lang, status == 200 and catalog["messages"]["common.save"] == expected)

                status, state = json_request(app_base, "/api/state")
                check(f"EXE launch {launch} API reports EXE-local data directory",
                      status == 200 and Path(state.get("data_dir", "")).resolve() == data_dir.resolve(),
                      str(state.get("data_dir")))
                if launch == 1:
                    config = state["collections"]["config"]
                    config["api"].update({
                        "provider": "custom",
                        "base_url": mock_base,
                        "api_key": "",
                        "models": [],
                        "default_model": "mock-model",
                        "timeout": 10,
                    })
                    config["p4_exe_smoke_marker"] = "config-persisted"
                    save_status, _ = json_request(
                        app_base, "/api/collections/config", method="POST", payload={"data": config}
                    )
                    check("EXE saves test configuration", save_status == 200)

                    run_status, result = json_request(
                        app_base,
                        "/api/workstation/run",
                        method="POST",
                        payload={"mode_id": "draft", "prompt": "P4 EXE persistence probe", "selection": {}},
                    )
                    check("EXE completes a request through local mock model",
                          run_status == 200 and result.get("ok") is True and bool(result.get("session_id")))
                    session_id = result["session_id"]
                    check("EXE writes configuration and history beside executable",
                          (data_dir / "config.json").is_file()
                          and (data_dir / "history.json").is_file()
                          and (data_dir / "conversations" / f"{session_id}.json").is_file())
                    stop(process)
                    process = None
                    log_stream.close()
                    log_stream = None
                else:
                    config_status, saved = json_request(app_base, "/api/collections/config")
                    check("EXE config survives process restart",
                          config_status == 200
                          and saved.get("data", {}).get("p4_exe_smoke_marker") == "config-persisted")
                    history_status, history = json_request(app_base, "/api/history")
                    entry = next((item for item in history.get("items", []) if item.get("id") == session_id), None)
                    check("EXE history survives process restart",
                          history_status == 200 and entry is not None)
                    session_status, session = json_request(app_base, f"/api/history/{session_id}")
                    turns = (session.get("session") or {}).get("turns") or []
                    check("EXE conversation content survives process restart",
                          session_status == 200 and bool(turns)
                          and "P4 EXE persisted output" in turns[-1].get("output", ""))
                    stop(process)
                    process = None
                    log_stream.close()
                    log_stream = None
        finally:
            if process is not None:
                stop(process)
            if log_stream is not None:
                log_stream.close()
            mock_server.shutdown()
            mock_server.server_close()
            mock_thread.join(timeout=5)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/exe_smoke_test.py PATH_TO_NOVELHELPER_EXE")
    run(Path(sys.argv[1]))
