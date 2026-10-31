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
novelhelper/ai.py
OpenAI Chat Completions 兼容接口封装。

* 支持多个常见提供商预设，也支持任意自定义 URL；
* API Key 只读取配置，不读取环境变量：未显式配置时不发起请求；
* 模型与推理强度由每个工作模式独立配置，并与当前 URL 的模型列表统一；
* 优先使用 openai SDK，未安装时自动退回标准库 urllib。
"""
from __future__ import annotations

from .localization import t

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from . import providers

try:
    from openai import OpenAI  # type: ignore

    _HAS_OPENAI = True
except Exception:  # pragma: no cover - 环境缺库时的回退
    OpenAI = None  # type: ignore
    _HAS_OPENAI = False


class AIError(RuntimeError):
    pass


def _api_settings(config: dict) -> dict:
    api = (config or {}).get("api") or {}
    provider = providers.provider_for_config(config)
    base_url = providers.normalize_base_url(api.get("base_url") or provider.get("base_url") or "")
    if not base_url:
        raise AIError(t('errors.no_api_url'))
    # API Key 只读取配置：不读取环境变量，避免在用户未显式配置时
    # 静默使用其机器上的其他 key 产生计费。
    api_key = (api.get("api_key") or "").strip()
    timeout = api.get("timeout") or 899
    return {
        "base_url": base_url,
        "api_key": api_key,
        "timeout": timeout,
        "provider": provider,
        "provider_id": provider["id"],
        "provider_label": provider["label"],
        "max_tokens_field": api.get("max_tokens_field") or provider.get("max_tokens_field") or "max_tokens",
        "send_reasoning_effort": bool(api.get("send_reasoning_effort")),
        "send_thinking": bool(api.get("send_thinking")),
    }


def api_settings(config: dict) -> dict:
    """给模型列表 / 设置页使用的公开版本（不含密钥以外的敏感信息）。"""
    return _api_settings(config)


def _ensure_key(api: dict) -> None:
    host = (urllib.parse.urlparse(api["base_url"]).hostname or "").lower()
    local = host in ("127.0.0.1", "localhost", "::1")
    if api["api_key"] or api["provider"].get("generic") or api["provider_id"] == "custom" or local:
        return
    raise AIError(t('errors.no_api_key'))


def mode_settings(config: dict, mode: dict | None) -> dict:
    """把一个工作模式的模型、推理强度与采样参数整理成调用参数。"""
    mode = mode or {}
    models = providers.provider_models(config)
    model = (mode.get("model") or "").strip() or providers.default_model(config)
    if models and model and model not in models:
        model = providers.default_model(config) or models[0]
    if not model and models:
        model = models[0]
    effort = mode.get("effort") or providers.default_effort(config)
    if effort not in providers.EFFORTS:
        effort = "medium"
    return {
        "model": model,
        "effort": effort,
        "max_tokens": int(mode.get("max_tokens") or 32768),
        "top_p": mode.get("top_p", 0.95),
        "temperature": mode.get("temperature"),
        "thinking": bool(mode.get("thinking")),
    }


def _payload(settings: dict, messages: list, api: dict) -> dict:
    provider = api["provider"]
    model_name = settings.get("model") or ""
    model_supports_effort = bool(provider.get("supports_effort"))
    if provider.get("id") == "openai":
        model_supports_effort = model_name.lower().startswith(("o1", "o3", "o4", "gpt-5"))
    body: dict[str, Any] = {
        "model": model_name,
        "messages": messages,
        "stream": False,
        (api.get("max_tokens_field") or provider.get("max_tokens_field") or "max_tokens"):
            int(settings.get("max_tokens") or 32768),
    }
    if settings.get("top_p") is not None:
        body["top_p"] = float(settings["top_p"])
    if settings.get("temperature") is not None:
        body["temperature"] = float(settings["temperature"])
    effort = settings.get("effort")
    if effort and effort != "none" and (model_supports_effort or api.get("send_reasoning_effort")):
        body["reasoning_effort"] = effort
    if settings.get("thinking") and (provider.get("supports_thinking") or api.get("send_thinking")):
        body["thinking"] = {"type": "enabled"}
    return body


def _post_raw(api: dict, body: dict) -> dict:
    url = providers.endpoint(api["base_url"], "chat/completions")
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if api.get("api_key"):
        headers["Authorization"] = f"Bearer {api['api_key']}"
    req = urllib.request.Request(url, data=data, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=api["timeout"]) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1200]
        raise AIError(f"HTTP {exc.code}: {detail}") from exc
    except Exception as exc:  # noqa: BLE001
        raise AIError(f"{type(exc).__name__}: {exc}") from exc
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AIError(t('errors.not_json', detail=raw[:600])) from exc


def _extract_content(payload: dict) -> str:
    choices = payload.get("choices") or []
    if not choices:
        raise AIError(t('errors.no_choices', detail=json.dumps(payload, ensure_ascii=False)[:600]))
    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, list):
        content = "".join(
            part.get("text", "") for part in content if isinstance(part, dict)
        )
    if not content:
        reasoning = message.get("reasoning_content") or ""
        if reasoning:
            return reasoning.strip()
        raise AIError(t('errors.empty_response'))
    return str(content).strip()


def chat_settings(config: dict, settings: dict, messages: list) -> dict:
    """使用显式参数调用模型。工作模式与连通性测试都走这里。"""
    api = _api_settings(config)
    _ensure_key(api)
    settings = dict(settings or {})
    if not settings.get("model"):
        settings["model"] = providers.default_model(config)
    if not settings.get("model"):
        raise AIError(t('errors.no_model'))
    body = _payload(settings, messages, api)
    started = time.time()
    usage: dict = {}
    transport = "urllib"
    model_name = body["model"]

    if _HAS_OPENAI:
        transport = "openai"
        client = OpenAI(api_key=api["api_key"] or "not-needed",
                        base_url=api["base_url"], timeout=api["timeout"])
        try:
            extra = {
                key: body[key]
                for key in ("thinking", "reasoning_effort", "top_p", "temperature")
                if key in body
            }
            max_field = api.get("max_tokens_field") or "max_tokens"
            max_value = int(settings.get("max_tokens") or 32768)
            create_kwargs = {
                "model": body["model"],
                "messages": messages,
                "stream": False,
            }
            if max_field == "max_tokens":
                create_kwargs["max_tokens"] = int(body.get("max_tokens") or max_value)
            else:
                extra[max_field] = int(body.get(max_field) or max_value)
            resp = client.chat.completions.create(  # type: ignore[call-overload]
                **create_kwargs,  # type: ignore[arg-type]
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
        "provider": api["provider_id"],
    }


def ping(config: dict, model: str = "") -> dict:
    """轻量连通性测试，不附带 AI 生成声明。"""
    settings = mode_settings(config, {
        "effort": "none",
        "max_tokens": 16,
        "thinking": False,
    })
    if model:
        settings["model"] = model
    return chat_settings(config, settings, [
        {"role": "system", "content": "你是连通性测试助手，只回复 OK。"},
        {"role": "user", "content": "ping"},
    ])


def list_models(config: dict) -> dict:
    """通过当前 URL 的 /models 获取可用模型；失败时抛 AIError。"""
    api = _api_settings(config)
    _ensure_key(api)
    url = providers.endpoint(api["base_url"], "models")
    headers = {"Accept": "application/json"}
    if api.get("api_key"):
        headers["Authorization"] = f"Bearer {api['api_key']}"
    req = urllib.request.Request(url, method="GET", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=min(int(api["timeout"]), 45)) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:800]
        if exc.code == 401:
            raise AIError(t('errors.fetch_401', detail=detail)) from exc
        if exc.code == 404:
            raise AIError(t('errors.fetch_no_endpoint')) from exc
        raise AIError(t('errors.fetch_http', code=exc.code, detail=detail)) from exc
    except Exception as exc:  # noqa: BLE001
        raise AIError(t('errors.fetch_generic', type=type(exc).__name__, detail=exc)) from exc
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AIError(t('errors.fetch_bad_json')) from exc

    items = data.get("data") if isinstance(data, dict) else data
    if not isinstance(items, list):
        items = data.get("models") if isinstance(data, dict) else []
    ids = []
    for item in items or []:
        if isinstance(item, str):
            ids.append(item)
        elif isinstance(item, dict):
            value = item.get("id") or item.get("name") or item.get("model")
            if value:
                ids.append(str(value))
    models = sorted({value for value in ids if value})
    if not models:
        raise AIError(t('errors.fetch_no_ids'))
    return {
        "models": models,
        "provider": api["provider_id"],
        "provider_label": api["provider_label"],
        "endpoint": url,
    }
