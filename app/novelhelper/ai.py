#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
novelhelper/ai.py
DeepSeek 调用封装。

优先使用项目 .venv 里已装的 openai 库；若不可用则退回标准库 urllib，
保证应用在零依赖的情况下也能跑。
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Any

try:  # 项目 .venv 里已有 openai
    from openai import OpenAI  # type: ignore

    _HAS_OPENAI = True
except Exception:  # pragma: no cover - 环境缺库时的回退
    OpenAI = None  # type: ignore
    _HAS_OPENAI = False


class AIError(RuntimeError):
    pass


def _api_settings(config: dict) -> dict:
    api = (config or {}).get("api") or {}
    base_url = (api.get("base_url") or "https://api.deepseek.com").rstrip("/")
    api_key = os.environ.get("DEEPSEEK_API_KEY") or api.get("api_key") or ""
    timeout = api.get("timeout") or 900
    return {"base_url": base_url, "api_key": api_key, "timeout": timeout}


def tool_settings(config: dict, tool: str, override: dict | None = None) -> dict:
    tools = (config or {}).get("tools") or {}
    base = dict(tools.get(tool) or {})
    if not base:
        base = {
            "model": "deepseek-flash",
            "effort": "low",
            "max_tokens": 32768,
            "top_p": 0.95,
            "thinking": True,
        }
    if override:
        for key, value in override.items():
            if value not in (None, ""):
                base[key] = value
    return base


def _payload(settings: dict, messages: list) -> dict:
    body: dict[str, Any] = {
        "model": settings.get("model") or "deepseek-flash",
        "messages": messages,
        "stream": False,
        "max_tokens": int(settings.get("max_tokens") or 32768),
    }
    if settings.get("top_p") is not None:
        body["top_p"] = float(settings["top_p"])
    if settings.get("effort"):
        body["reasoning_effort"] = settings["effort"]
    if settings.get("thinking"):
        body["thinking"] = {"type": "enabled"}
    if settings.get("temperature") is not None:
        body["temperature"] = float(settings["temperature"])
    return body


def _post_raw(api: dict, body: dict) -> dict:
    url = f"{api['base_url']}/chat/completions"
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api['api_key']}",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=api["timeout"]) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1200]
        raise AIError(f"HTTP {exc.code}: {detail}") from exc
    except Exception as exc:  # noqa: BLE001 - 网络类异常统一转成 AIError
        raise AIError(f"{type(exc).__name__}: {exc}") from exc
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AIError(f"返回内容不是合法 JSON: {raw[:600]}") from exc


def _extract_content(payload: dict) -> str:
    choices = payload.get("choices") or []
    if not choices:
        raise AIError(f"返回中没有 choices: {json.dumps(payload, ensure_ascii=False)[:600]}")
    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, list):  # 少数兼容实现会返回分段数组
        content = "".join(
            part.get("text", "") for part in content if isinstance(part, dict)
        )
    if not content:
        reasoning = message.get("reasoning_content") or ""
        if reasoning:
            return reasoning.strip()
        raise AIError("模型返回内容为空。")
    return str(content).strip()


def chat(
    config: dict,
    tool: str,
    messages: list,
    override: dict | None = None,
) -> dict:
    """
    执行一次调用。

    返回 {"text": 内容, "model": 模型, "effort": 推理档, "elapsed": 秒数,
          "usage": {...}, "transport": "openai|urllib"}
    """
    api = _api_settings(config)
    if not api["api_key"]:
        raise AIError("未配置 API Key。请到「模型设置」里填写，或设置环境变量 DEEPSEEK_API_KEY。")

    settings = tool_settings(config, tool, override)
    body = _payload(settings, messages)
    started = time.time()

    usage: dict = {}
    transport = "urllib"
    model_name = body["model"]

    if _HAS_OPENAI:
        transport = "openai"
        client = OpenAI(api_key=api["api_key"], base_url=api["base_url"], timeout=api["timeout"])
        try:
            # thinking / reasoning_effort 等非标准字段通过 extra_body 透传
            extra = {
                key: body[key]
                for key in ("thinking", "reasoning_effort", "top_p", "temperature")
                if key in body
            }
            resp = client.chat.completions.create(  # type: ignore[call-overload]
                model=body["model"],
                messages=messages,  # type: ignore[arg-type]
                stream=False,
                max_tokens=body["max_tokens"],
                **({"extra_body": extra} if extra else {}),
            )
            raw = resp.model_dump() if hasattr(resp, "model_dump") else json.loads(str(resp))
            text = _extract_content(raw)
            usage = raw.get("usage") or {}
            model_name = raw.get("model") or model_name
        except AIError:
            raise
        except Exception as exc:  # noqa: BLE001 - SDK 异常回退到 urllib 再试一次
            try:
                raw = _post_raw(api, body)
                text = _extract_content(raw)
                usage = raw.get("usage") or {}
                model_name = raw.get("model") or model_name
                transport = "urllib"
            except AIError:
                raise AIError(f"{type(exc).__name__}: {exc}") from exc
    else:
        raw = _post_raw(api, body)
        text = _extract_content(raw)
        usage = raw.get("usage") or {}
        model_name = raw.get("model") or model_name

    return {
        "text": text,
        "model": model_name,
        "effort": settings.get("effort", ""),
        "elapsed": round(time.time() - started, 2),
        "usage": usage,
        "transport": transport,
    }


def ping(config: dict) -> dict:
    """轻量连通性测试。"""
    result = chat(
        config,
        "reason",
        [
            {"role": "system", "content": "你是连通性测试助手，只回复 OK。"},
            {"role": "user", "content": "ping"},
        ],
        override={"max_tokens": 16, "thinking": False},
    )
    return result

