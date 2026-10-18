#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""NovelHelper 启动入口：python app/run.py"""
from __future__ import annotations

import sys
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

from novelhelper.app import main  # noqa: E402


if __name__ == "__main__":
    raise SystemExit(main())
