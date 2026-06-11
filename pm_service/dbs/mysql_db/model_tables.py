# -*- coding: utf-8 -*-
"""
@文件: model_tables.py
@说明: 兼容层 — 从 tables/ 重新导出所有模型（保证现有 import 路径不变）
"""
from tables import *  # noqa: F401,F403
from tables.base_table import generate_uuid  # noqa: F401
