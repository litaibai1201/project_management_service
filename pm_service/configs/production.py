# -*- coding: utf-8 -*-
"""
@文件: production.py
@说明: 生产环境配置
@时间: 2023/10/19
"""
from configs.base import BaseConfig


class ProductionConfig(BaseConfig):
    """生产环境配置"""

    DEBUG = False
    TESTING = False
    SQLALCHEMY_ECHO = False
