# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller 构建配置：生成单文件 Windows 可执行程序。"""
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, copy_metadata

ROOT = Path(SPECPATH)

datas = [
    (str(ROOT / "app" / "novelhelper" / "web"), "novelhelper/web"),
    (str(ROOT / "app" / "resources" / "localization"), "resources/localization"),
]

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
    binaries=[],
    datas=datas,
    hiddenimports=[],
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
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
