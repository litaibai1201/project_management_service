# -*- coding: utf-8 -*-
"""
@文件: __init__.py
@说明: 配置导出
@时间: 2023/10/19
"""
from configs.base import BaseConfig
from configs.development import DevelopmentConfig
from configs.production import ProductionConfig


config = {
    "dev": DevelopmentConfig,
    "prd": ProductionConfig,
    "default": DevelopmentConfig,
}

__all__ = ["config", "BaseConfig", "DevelopmentConfig", "ProductionConfig"]
