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
import os
import re
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


def _exe_version() -> tuple[str, tuple[int, int, int, int]]:
    """从 _version.py 读取版本号，保证 exe 版本资源与 --version、CI 校验一致。"""
    text = (ROOT / "app" / "novelhelper" / "_version.py").read_text(encoding="utf-8")
    match = re.search(r'^\s*__version__\s*=\s*"([^"]+)"', text, re.MULTILINE)
    if not match:
        raise SystemExit("无法从 app/novelhelper/_version.py 读取 __version__。")
    raw = match.group(1).strip()
    parts: list[int] = []
    for piece in raw.split("."):
        digits = re.match(r"\d+", piece)
        if not digits:
            break
        parts.append(int(digits.group(0)))
    if not parts or len(parts) > 4:
        raise SystemExit(f"无法解析版本号：{raw}")
    parts += [0] * (4 - len(parts))
    return raw, tuple(parts[:4])


def _windows_version_info():
    """构造 Windows VERSIONINFO 资源，让 exe 属性页显示厂商、版本和说明。

    PyInstaller 的 EXE(version=...) 既接受版本资源文本文件，也接受
    VSVersionInfo 对象；这里直接从 _version.py 生成，避免版本号两处维护。
    """
    if os.name != "nt":
        return None
    from PyInstaller.utils.win32.versioninfo import (
        FixedFileInfo,
        StringFileInfo,
        StringStruct,
        StringTable,
        VarFileInfo,
        VarStruct,
        VSVersionInfo,
    )

    version_text, (major, minor, patch, build) = _exe_version()
    return VSVersionInfo(
        ffi=FixedFileInfo(
            filevers=(major, minor, patch, build),
            prodvers=(major, minor, patch, build),
            mask=0x3F,
            flags=0x0,
            OS=0x40004,
            fileType=0x1,
            subtype=0x0,
            date=(0, 0),
        ),
        kids=[
            StringFileInfo([
                StringTable('040904B0', [
                    StringStruct('CompanyName', 'DreamInsight24'),
                    StringStruct('FileDescription', 'NovelHelper - AI Novel Workstation'),
                    StringStruct('FileVersion', version_text),
                    StringStruct('InternalName', 'NovelHelper'),
                    StringStruct('LegalCopyright', 'Copyright (C) 2026 DreamInsight24 and NovelHelper contributors'),
                    StringStruct('OriginalFilename', 'NovelHelper.exe'),
                    StringStruct('ProductName', 'NovelHelper'),
                    StringStruct('ProductVersion', version_text),
                ]),
            ]),
            VarFileInfo([VarStruct('Translation', [1033, 1200])]),
        ],
    )


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
    version=_windows_version_info(),
)
