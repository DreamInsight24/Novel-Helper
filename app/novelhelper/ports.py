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

"""Server port configuration and validation.

The HTTP server is a process-level resource, so ``server`` lives in the global
config.  A port mode of ``auto`` binds to port 0 and lets the operating system
pick a free port; ``fixed`` requires an explicit 1-65535 port.
"""
from __future__ import annotations

from typing import Any

DEFAULT_HOST = "127.0.0.1"
PORT_MODE_AUTO = "auto"
PORT_MODE_FIXED = "fixed"
PORT_MODES = (PORT_MODE_AUTO, PORT_MODE_FIXED)
_ERROR_HINT = "请修改全局 config.json 的 server.port，或使用 --port 临时指定其他端口。"


class PortConfigError(ValueError):
    """Raised when an explicit port or the stored port configuration is invalid."""


def default_server_config() -> dict:
    """New installations use automatic port allocation and never store 8765."""
    return {"host": DEFAULT_HOST, "port_mode": PORT_MODE_AUTO}


def _parse_explicit_port(value: Any, label: str) -> int:
    if isinstance(value, bool):
        raise PortConfigError(f"{label}无效：必须是 1–65535 的整数。")
    if isinstance(value, int):
        number = value
    elif isinstance(value, str):
        text = value.strip()
        if not text:
            raise PortConfigError(f"{label}无效：不能为空。")
        try:
            number = int(text, 10)
        except ValueError as exc:
            raise PortConfigError(f"{label}无效：必须是 1–65535 的整数。") from exc
    else:
        raise PortConfigError(f"{label}无效：必须是 1–65535 的整数。")
    if number == 0:
        raise PortConfigError(
            f"{label} 0 无效：自动端口只能在未指定 --port 时使用，"
            "不能通过 --port 0 触发。")
    if not 1 <= number <= 65535:
        raise PortConfigError(f"{label} {number} 无效：必须是 1–65535 的整数。")
    return number


def normalize_server_config(server: Any, *, debug_mode: bool = False) -> tuple[dict, bool]:
    """Return ``(normalized, changed)`` for a stored ``server`` object.

    Migration rules (v2610.3):
    * missing/empty port and no mode -> auto;
    * legacy default port (8765, or 8766 in debug mode) -> auto;
    * another valid port -> fixed;
    * an existing valid ``port_mode`` wins;
    * invalid explicit values raise instead of silently falling back.
    """
    original = server if isinstance(server, dict) else {}
    result = dict(original)
    changed = not isinstance(server, dict)

    host = str(result.get("host") or DEFAULT_HOST).strip() or DEFAULT_HOST
    if result.get("host") != host:
        result["host"] = host
        changed = True

    raw_mode = str(result.get("port_mode") or "").strip().lower()
    raw_port = result.get("port")
    if raw_mode not in PORT_MODES:
        if raw_port is None or (isinstance(raw_port, str) and not raw_port.strip()):
            mode = PORT_MODE_AUTO
        else:
            try:
                number = _parse_explicit_port(raw_port, "配置中的端口")
            except PortConfigError:
                # Keep the invalid value so startup reports the configuration
                # problem; do not replace it with a different port.
                mode = PORT_MODE_FIXED
            else:
                legacy = 8766 if debug_mode else 8765
                mode = PORT_MODE_AUTO if number == legacy else PORT_MODE_FIXED
    else:
        mode = raw_mode

    if result.get("port_mode") != mode:
        result["port_mode"] = mode
        changed = True

    if mode == PORT_MODE_AUTO:
        if "port" in result:
            result.pop("port", None)
            changed = True
    else:
        if raw_port is None or (isinstance(raw_port, str) and not raw_port.strip()):
            raise PortConfigError(
                "配置为固定端口，但 server.port 为空；" + _ERROR_HINT)
        number = _parse_explicit_port(raw_port, "配置中的固定端口")
        if result.get("port") != number:
            result["port"] = number
            changed = True

    return result, changed


def resolve_listen_port(cli_port: Any, server: Any) -> int:
    """Resolve the bind port: CLI > fixed config > automatic (0)."""
    if cli_port is not None:
        return _parse_explicit_port(cli_port, "--port")
    normalized, _ = normalize_server_config(server)
    if normalized["port_mode"] == PORT_MODE_AUTO:
        return 0
    return _parse_explicit_port(normalized.get("port"), "配置中的固定端口")


def port_mode_label(server: Any) -> str:
    """Human-readable mode for console diagnostics."""
    normalized, _ = normalize_server_config(server)
    if normalized["port_mode"] == PORT_MODE_AUTO:
        return "自动选择端口"
    return f"固定端口 {normalized['port']}"
