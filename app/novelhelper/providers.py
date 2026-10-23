#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
常见 OpenAI 兼容接口预设。

URL 都可以手动修改；当 URL 与预设不一致时，按“自定义接口”处理，
使用通用接口提示词，不假定具体模型或厂商能力。
"""
from __future__ import annotations

from copy import deepcopy

from .localization import t


EFFORTS = ["none", "low", "medium", "high", "max"]


PROVIDERS = [
    {
        "id": "deepseek",
        "label": "DeepSeek",
        "base_url": "https://api.deepseek.com",
        "models": ["deepseek-flash", "deepseek-v4-pro"],
        "default_model": "deepseek-flash",
        "default_effort": "low",
        "key_env": "DEEPSEEK_API_KEY",
        "prompt_note": "当前使用 DeepSeek 的 OpenAI 兼容接口。",
        "supports_effort": True,
        "supports_thinking": True,
    },
    {
        "id": "openai",
        "label": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "models": ["gpt-4.1", "gpt-4.1-mini", "o4-mini"],
        "default_model": "gpt-4.1-mini",
        "default_effort": "medium",
        "key_env": "OPENAI_API_KEY",
        "prompt_note": "当前使用 OpenAI 的 Chat Completions 接口。",
        "supports_effort": True,
        "supports_thinking": False,
        "max_tokens_field": "max_completion_tokens",
    },
    {
        "id": "openrouter",
        "label": "OpenRouter",
        "base_url": "https://openrouter.ai/api/v1",
        "models": ["openai/gpt-4.1-mini", "anthropic/claude-sonnet-4", "google/gemini-2.5-pro"],
        "default_model": "openai/gpt-4.1-mini",
        "default_effort": "medium",
        "key_env": "OPENROUTER_API_KEY",
        "prompt_note": "当前使用 OpenRouter 的 OpenAI 兼容接口。",
        "supports_effort": True,
        "supports_thinking": False,
    },
    {
        "id": "siliconflow",
        "label": "SiliconFlow",
        "base_url": "https://api.siliconflow.cn/v1",
        "models": ["deepseek-ai/DeepSeek-V3", "Qwen/Qwen3-235B-A22B"],
        "default_model": "deepseek-ai/DeepSeek-V3",
        "default_effort": "high",
        "key_env": "SILICONFLOW_API_KEY",
        "prompt_note": "当前使用 SiliconFlow 的 OpenAI 兼容接口。",
        "supports_effort": True,
        "supports_thinking": True,
    },
    {
        "id": "moonshot",
        "label": "Moonshot / Kimi",
        "base_url": "https://api.moonshot.cn/v1",
        "models": ["moonshot-v1-8k", "moonshot-v1-32k", "kimi-k2-0711-preview"],
        "default_model": "moonshot-v1-32k",
        "default_effort": "medium",
        "key_env": "MOONSHOT_API_KEY",
        "prompt_note": "当前使用 Moonshot / Kimi 的 OpenAI 兼容接口。",
        "supports_effort": False,
        "supports_thinking": False,
    },
    {
        "id": "dashscope",
        "label": "阿里云百炼 / DashScope",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "models": ["qwen-plus", "qwen-max", "qwen-turbo"],
        "default_model": "qwen-plus",
        "default_effort": "medium",
        "key_env": "DASHSCOPE_API_KEY",
        "prompt_note": "当前使用阿里云百炼的 OpenAI 兼容接口。",
        "supports_effort": False,
        "supports_thinking": False,
    },
    {
        "id": "zhipu",
        "label": "智谱 GLM",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "models": ["glm-4-plus", "glm-4-air", "glm-4-flash"],
        "default_model": "glm-4-plus",
        "default_effort": "medium",
        "key_env": "ZHIPU_API_KEY",
        "prompt_note": "当前使用智谱 GLM 的 OpenAI 兼容接口。",
        "supports_effort": False,
        "supports_thinking": False,
    },
    {
        "id": "custom",
        "label": "自定义 / OpenAI 兼容",
        "base_url": "",
        "models": [],
        "default_model": "",
        "default_effort": "medium",
        "key_env": "CUSTOM_API_KEY",
        "prompt_note": "当前使用自定义 OpenAI 兼容接口；不要假定具体模型名称、厂商或特殊能力。",
        "supports_effort": False,
        "supports_thinking": False,
        "generic": True,
    },
]


def public_providers() -> list:
    """给前端的预设（不包含任何密钥）。"""
    result = deepcopy(PROVIDERS)
    for provider in result:
        provider["prompt_note"] = t("settings.provider_note_" + provider["id"])
        if provider["id"] in ("custom", "dashscope", "zhipu"):
            provider["label"] = t("settings.custom_preset" if provider["id"] == "custom"
                                  else "settings.provider_label_" + provider["id"])
    return result


def get_provider(provider_id: str) -> dict:
    for provider in PROVIDERS:
        if provider["id"] == provider_id:
            return provider
    return PROVIDERS[-1]


def normalize_base_url(url: str) -> str:
    return (url or "").strip().rstrip("/")


def same_base_url(left: str, right: str) -> bool:
    a = normalize_base_url(left)
    b = normalize_base_url(right)
    return bool(a and b) and (
        a == b or a == b + "/v1" or b == a + "/v1"
    )


def provider_for_config(config: dict) -> dict:
    api = (config or {}).get("api") or {}
    provider = get_provider(api.get("provider") or "custom")
    base_url = normalize_base_url(api.get("base_url") or provider.get("base_url") or "")
    if provider["id"] != "custom" and base_url and not same_base_url(base_url, provider["base_url"]):
        return get_provider("custom")
    return provider


def provider_note(config: dict) -> str:
    provider = provider_for_config(config)
    if provider.get("generic") or provider["id"] == "custom":
        return ("\n\n【接口】当前使用自定义 OpenAI 兼容接口。"
                "不要假定具体模型名称、厂商或特殊能力；以用户提供的设定与提示词为准。")
    return f"\n\n【接口】当前使用 {provider['label']} 的 OpenAI 兼容接口。"


def provider_models(config: dict) -> list:
    api = (config or {}).get("api") or {}
    provider = provider_for_config(config)
    if provider["id"] == "deepseek":
        return list(provider["models"])
    models = list(api.get("models") or [])
    if not models:
        models = list(provider.get("models") or [])
    return models


def default_effort(config: dict) -> str:
    api = (config or {}).get("api") or {}
    return api.get("default_effort") or provider_for_config(config).get("default_effort") or "medium"


def default_model(config: dict) -> str:
    api = (config or {}).get("api") or {}
    provider = provider_for_config(config)
    model = api.get("default_model") or provider.get("default_model") or ""
    models = provider_models(config)
    if model and models and model not in models:
        model = models[0]
    if not model and models:
        model = models[0]
    return model


def default_api_config() -> dict:
    provider = get_provider("deepseek")
    return {
        "provider": provider["id"],
        "base_url": provider["base_url"],
        "api_key": "",
        "models": list(provider["models"]),
        "timeout": 899,
        "default_model": provider["default_model"],
        "default_effort": provider["default_effort"],
        "max_tokens_field": provider.get("max_tokens_field") or "max_tokens",
        "profiles": {},
    }


def endpoint(base_url: str, path: str) -> str:
    base = normalize_base_url(base_url)
    for suffix in ("/chat/completions", "/models"):
        if base.endswith(suffix):
            base = base[: -len(suffix)]
    return f"{base}/{path.lstrip('/')}"
