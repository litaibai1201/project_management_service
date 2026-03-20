# -*- coding: utf-8 -*-
"""
@文件: development.py
@说明: 开发环境配置
@时间: 2023/10/19
"""
from configs.base import BaseConfig


class DevelopmentConfig(BaseConfig):
    """开发环境配置"""

    DEBUG = True
    TESTING = False
    SQLALCHEMY_ECHO = True
