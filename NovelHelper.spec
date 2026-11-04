# -*- mode: python ; coding: utf-8 -*-
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

"""PyInstaller 构建配置：生成单文件 Windows 可执行程序。"""
import importlib.util
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs, copy_metadata

ROOT = Path(SPECPATH)


def _require_build_dependency(module: str) -> None:
    """缺少窗口模式必需依赖时直接中止构建，避免产出运行时报错的 EXE。

    如果构建机只装了 pyinstaller、没装 app/requirements.txt，PyInstaller 只会
    记录 "missing module named webview" 警告，构建仍然成功，但产物在运行时会
    提示“无法加载 pywebview 桌面组件”。这里显式检查并给出可操作的提示。
    """
    try:
        available = importlib.util.find_spec(module) is not None
    except (ImportError, ValueError):
        available = False
    if not available:
        raise SystemExit(
            f"构建中止：当前 Python 环境缺少 {module}。\n"
            "窗口模式依赖 pywebview/pythonnet，未打包会让 EXE 在运行时提示"
            "“无法加载 pywebview 桌面组件”。\n"
            "请改用安装了运行依赖的解释器（推荐项目 .venv）重新构建：\n"
            "  .venv\\Scripts\\python.exe -m pip install -r requirements-build.txt\n"
            "  .venv\\Scripts\\python.exe -m PyInstaller --clean --noconfirm NovelHelper.spec\n"
            "不要使用只装了 pyinstaller 的全局 Python 直接执行 pyinstaller。"
        )


_require_build_dependency("webview")
_require_build_dependency("pythonnet")

datas = [
    (str(ROOT / "app" / "novelhelper" / "web"), "novelhelper/web"),
    (str(ROOT / "app" / "resources"), "resources"),
]
binaries = []
hiddenimports = [
    "webview",
    "webview.platforms.winforms",
    "webview.platforms.edgechromium",
]

# pywebview ships PyInstaller hooks via entry points; collect its JS/backend
# assets and pythonnet payloads explicitly so one-file builds keep working.
# 上面的 _require_build_dependency 已确保解释器里存在 pywebview/pythonnet；
# 这里再兜底一次，收集失败时给出可操作的提示，而不是静默产出缺依赖的 EXE。
try:
    datas += copy_metadata("pywebview")
    datas += collect_data_files("webview")
    binaries += collect_dynamic_libs("webview")
except Exception as exc:
    raise SystemExit(
        "构建中止：pywebview 依赖收集失败，产物会缺少桌面组件，运行时会提示"
        "“无法加载 pywebview 桌面组件”。\n"
        "请确认当前解释器已安装 app/requirements.txt（推荐使用项目 .venv）。\n"
        f"详细信息：{exc}"
    ) from exc

# openai 是可选依赖；构建机上安装后，把它的元数据一并打包，
# 避免运行时的版本检查失败。未安装时仍会退回 urllib，不影响构建。
try:
    datas += copy_metadata("openai")
    datas += collect_data_files("openai")
except Exception:
    pass

a = Analysis(
    [str(ROOT / "app" / "run.py")],
    pathex=[str(ROOT / "app")],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="NovelHelper",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(ROOT / "app" / "resources" / "NovelHelper.ico"),
)
