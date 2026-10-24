#!/usr/bin/env python3
"""NovelHelper minimal smoke test using an isolated temporary runtime."""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / "app" / "run.py"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _request(
    base_url: str,
    path: str,
    *,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
) -> tuple[int, bytes]:
    data = None
    headers: dict[str, str] = {}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        f"{base_url}{path}", data=data, headers=headers, method=method
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=5) as response:
        return int(response.status), response.read()


def _json_request(
    base_url: str,
    path: str,
    *,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
) -> tuple[int, dict[str, Any]]:
    status, body = _request(base_url, path, method=method, payload=payload)
    return status, json.loads(body.decode("utf-8"))


def _check(name: str, condition: bool, detail: str = "") -> None:
    if not condition:
        raise AssertionError(f"{name}: {detail or 'condition is false'}")
    print(f"[PASS] {name}" + (f" - {detail}" if detail else ""))


def _wait_until_ready(base_url: str, process: subprocess.Popen[Any]) -> None:
    deadline = time.monotonic() + 15
    last_error = ""
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"server exited early with code {process.returncode}")
        try:
            status, _ = _request(base_url, "/")
            if status == 200:
                return
        except (OSError, urllib.error.URLError) as exc:
            last_error = str(exc)
        time.sleep(0.1)
    raise TimeoutError(f"server did not become ready: {last_error}")


def _stop(process: subprocess.Popen[Any]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def run() -> None:
    if not RUNNER.is_file():
        raise FileNotFoundError(RUNNER)

    with tempfile.TemporaryDirectory(prefix="novelhelper_smoke_") as temp_name:
        temp_root = Path(temp_name)
        runtime_root = temp_root / "runtime"
        data_root = temp_root / "data"
        output_log = temp_root / "server.log"
        port = _free_port()
        base_url = f"http://127.0.0.1:{port}"

        env = os.environ.copy()
        env.update(
            {
                "NOVELHELPER_HOME": str(runtime_root),
                "NOVELHELPER_DATA": str(data_root),
                "NOVELHELPER_DEBUG": "0",
                "PYTHONDONTWRITEBYTECODE": "1",
            }
        )

        process: subprocess.Popen[Any] | None = None
        failure: BaseException | None = None
        with output_log.open("wb") as log_stream:
            try:
                process = subprocess.Popen(
                    [
                        sys.executable,
                        "-B",
                        str(RUNNER),
                        "--no-browser",
                        "--host",
                        "127.0.0.1",
                        "--port",
                        str(port),
                    ],
                    cwd=ROOT,
                    env=env,
                    stdin=subprocess.DEVNULL,
                    stdout=log_stream,
                    stderr=subprocess.STDOUT,
                )
                _wait_until_ready(base_url, process)

                status, homepage = _request(base_url, "/")
                _check("homepage returns 200", status == 200)
                homepage_lower = homepage.lower()
                _check(
                    "homepage is NovelHelper HTML",
                    b"novelhelper" in homepage_lower
                    and b"<!doctype html>" in homepage_lower,
                )

                for asset in ("/core.js", "/workstation.js", "/style.css", "/i18n/i18n.js",
                              "/i18n/bootstrap.js", "/i18n/example.html"):
                    asset_status, asset_body = _request(base_url, asset)
                    _check(
                        f"static asset {asset}",
                        asset_status == 200 and bool(asset_body),
                    )

                _, languages = _json_request(base_url, "/api/i18n")
                _check("fresh runtime reports first run", languages.get("first_run") is True)
                for entry in languages["languages"]:
                    code, catalog = _json_request(base_url, "/api/i18n/" + entry["id"])
                    _check("language catalog " + entry["id"], code == 200 and catalog["lang"] == entry["id"]
                           and "common.save" in catalog["messages"])
                _, fallback = _json_request(base_url, "/api/i18n/not-configured")
                _check("unknown language fallback", fallback["lang"] == languages["fallback"])

                def localized_error(lang):
                    request = urllib.request.Request(base_url + "/api/i18n-smoke-missing",
                                                     headers={"X-NovelHelper-Language": lang})
                    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
                    try:
                        opener.open(request, timeout=5)
                        raise AssertionError("Expected a missing-endpoint response")
                    except urllib.error.HTTPError as exc:
                        _check("localized error status", exc.code == 404)
                        return json.loads(exc.read().decode("utf-8"))["error"]

                with ThreadPoolExecutor(max_workers=2) as executor:
                    results = list(executor.map(localized_error, ["en-US", "zh-CN"] * 3))
                _check("concurrent request language isolation", results == [
                    "Unknown endpoint: /api/i18n-smoke-missing", "未知接口: /api/i18n-smoke-missing"] * 3)
                _, after = _json_request(base_url, "/api/i18n")
                _check("request language does not mutate default", after["current"] == languages["current"])

                state_status, state = _json_request(base_url, "/api/state")
                _check("GET /api/state", state_status == 200 and state.get("ok") is True)
                _check(
                    "temporary data directory is active",
                    Path(state["data_dir"]).resolve() == data_root.resolve(),
                    str(state.get("data_dir")),
                )
                config = state["collections"]["config"]
                _check(
                    "baseline config defaults",
                    config.get("version") == 4
                    and config.get("server", {}).get("port") == 8765
                    and config.get("writing", {}).get("target_chars") == 8000,
                )

                for path in (
                    "/api/workstation/status",
                    "/api/workstation/modes",
                    "/api/history",
                ):
                    api_status, api_body = _json_request(base_url, path)
                    _check(path, api_status == 200 and api_body.get("ok") is True)

                preview_status, preview = _json_request(
                    base_url,
                    "/api/ai/preview",
                    method="POST",
                    payload={
                        "mode_id": "draft",
                        "surface": "workstation",
                        "selection": {},
                        "prompt": "P0 smoke preview",
                    },
                )
                _check(
                    "read-only AI preview",
                    preview_status == 200
                    and preview.get("ok") is True
                    and "P0 smoke preview" in preview.get("user", ""),
                )

                roundtrip = json.loads(json.dumps(config, ensure_ascii=False))
                roundtrip["p0_smoke"] = {"roundtrip": True}
                save_status, saved = _json_request(
                    base_url,
                    "/api/collections/config",
                    method="POST",
                    payload={"data": roundtrip},
                )
                _check(
                    "config save endpoint",
                    save_status == 200 and saved.get("ok") is True,
                )
                load_status, loaded = _json_request(
                    base_url, "/api/collections/config"
                )
                _check(
                    "config JSON roundtrip",
                    load_status == 200 and loaded.get("data") == roundtrip,
                )
                disk_config = json.loads(
                    (data_root / "config.json").read_text(encoding="utf-8")
                )
                _check("config persisted in temporary runtime", disk_config == roundtrip)

                # Language switch must persist across a restart (task 3.2).
                switch_status, switched = _json_request(
                    base_url,
                    "/api/settings/language",
                    method="POST",
                    payload={"language": "en-US"},
                )
                _check(
                    "switch language endpoint",
                    switch_status == 200
                    and switched.get("ok") is True
                    and switched.get("language") == "en-US",
                )
                _, after_switch = _json_request(base_url, "/api/i18n")
                _check(
                    "language switch takes effect immediately",
                    after_switch["current"] == "en-US"
                    and after_switch.get("first_run") is False,
                )
                try:
                    _json_request(
                        base_url,
                        "/api/settings/language",
                        method="POST",
                        payload={"language": ""},
                    )
                    _check("empty language is rejected", False)
                except urllib.error.HTTPError as exc:
                    _check("empty language is rejected", exc.code == 400)

                _stop(process)
                process = subprocess.Popen(
                    [
                        sys.executable,
                        "-B",
                        str(RUNNER),
                        "--no-browser",
                        "--host",
                        "127.0.0.1",
                        "--port",
                        str(port),
                    ],
                    cwd=ROOT,
                    env=env,
                    stdin=subprocess.DEVNULL,
                    stdout=log_stream,
                    stderr=subprocess.STDOUT,
                )
                _wait_until_ready(base_url, process)
                _, restarted = _json_request(base_url, "/api/i18n")
                _check(
                    "language persists across restart",
                    restarted["current"] == "en-US"
                    and restarted.get("first_run") is False,
                )
            except BaseException as exc:
                failure = exc
            finally:
                if process is not None:
                    _stop(process)

        if failure is not None:
            server_output = output_log.read_text(encoding="utf-8", errors="replace")
            if server_output:
                print("\n--- server output ---", file=sys.stderr)
                print(server_output[-4000:], file=sys.stderr)
            raise failure


def main() -> int:
    try:
        run()
    except BaseException as exc:
        print(f"[FAIL] {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    print("[PASS] smoke test completed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
