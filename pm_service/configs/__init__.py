# -*- coding: utf-8 -*-
"""
@文件: __init__.py
@说明: 配置导出
@时间: 2023/10/19
"""
from configs.base import BaseConfig
from configs.development import DevelopmentConfig
from configs.production import ProductionConfig


class TestConfig(DevelopmentConfig):
    """测试环境配置：使用 SQLite 内存库，禁用 Redis/Mongo"""
    TESTING = True
    PROPAGATE_EXCEPTIONS = False
    DEBUG = False
    SQLALCHEMY_ECHO = False
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SQLALCHEMY_ENGINE_OPTIONS = {}
    REDIS_REQUIRED = False
    MONGO_REQUIRED = False
    JWT_SECRET_KEY = "test-jwt-secret-key"
    CELERY_BROKER_URL = "memory://"
    CELERY_RESULT_BACKEND = "cache+memory://"


config = {
    "dev":     DevelopmentConfig,
    "prd":     ProductionConfig,
    "test":    TestConfig,
    "default": DevelopmentConfig,
}

__all__ = ["config", "BaseConfig", "DevelopmentConfig", "ProductionConfig", "TestConfig"]
