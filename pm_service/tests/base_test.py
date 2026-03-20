# -*- coding: utf-8 -*-
"""
@文件: base_test.py
@说明: 测试基类 - 提供 SQLite 内存库、JWT token 工具和 Redis Mock
@时间: 2026-03-09
"""
import os
import unittest
from unittest.mock import MagicMock, patch, PropertyMock

# 必须在导入 app 模块前设置，防止真实的 MySQL/Redis 连接
os.environ.setdefault("FLASK_ENV", "dev")
os.environ.setdefault("REDIS_REQUIRED", "false")

# ==================== 全局 Patch（在 app 导入前生效）====================

_SQLITE_URI = "sqlite:///:memory:"

# Patch BaseConfig.SQLALCHEMY_DATABASE_URI 使之返回 SQLite
_db_uri_patcher = patch(
    "configs.base.BaseConfig.SQLALCHEMY_DATABASE_URI",
    new_callable=PropertyMock,
    return_value=_SQLITE_URI,
)
_db_uri_patcher.start()

# Patch SQLALCHEMY_ENGINE_OPTIONS：SQLite 不支持 MySQL 连接池参数
_engine_opts_patcher = patch(
    "configs.base.BaseConfig.SQLALCHEMY_ENGINE_OPTIONS",
    new_callable=PropertyMock,
    return_value={},
)
_engine_opts_patcher.start()

# 现在可以安全导入 app
from app import create_app
from dbs.mysql_db import db


def _make_mock_redis():
    """构建一个完整的 Redis Mock 对象"""
    mock = MagicMock()
    mock.ping.return_value = True
    mock.get.return_value = None
    mock.set.return_value = True
    mock.delete.return_value = 1
    mock.exists.return_value = 0
    mock.hgetall.return_value = {}
    mock.smembers.return_value = set()
    mock.lrange.return_value = []
    mock.zrange.return_value = []
    mock.incrby.return_value = 1
    mock.decrby.return_value = 0
    mock.ttl.return_value = -1
    mock.keys.return_value = []
    return mock


# 全局 Redis patch（在 app 模块导入时必须已经生效）
_redis_patcher = patch("cache.get_redis_client", return_value=_make_mock_redis())
_redis_patcher.start()


def create_test_app():
    """创建测试专用 Flask 应用（SQLite 内存库）"""
    app = create_app("dev")
    app.config.update(
        TESTING=True,
        JWT_SECRET_KEY="test-jwt-secret",
        REDIS_REQUIRED=False,
        RATELIMIT_ENABLED=False,
    )
    return app


class BaseTest(unittest.TestCase):
    """所有集成测试用例的基类（需要 Flask app context）"""

    @classmethod
    def setUpClass(cls):
        cls.app = create_test_app()
        cls.app_context = cls.app.app_context()
        cls.app_context.push()
        db.create_all()

    @classmethod
    def tearDownClass(cls):
        db.session.remove()
        db.drop_all()
        cls.app_context.pop()

    def setUp(self):
        # 每个测试前开启 savepoint，测试后回滚，确保测试隔离
        self.client = self.app.test_client()
        db.session.begin_nested()

    def tearDown(self):
        db.session.rollback()

    def get_token(self, identity: str = "test_user") -> str:
        """生成测试用 JWT token"""
        from utils.auth import create_token
        return create_token(identity=identity)

    def auth_headers(self, identity: str = "test_user") -> dict:
        """返回带 JWT 认证头的 dict"""
        token = self.get_token(identity)
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    def json_post(self, url: str, data: dict, headers: dict = None):
        """发送 JSON POST 请求"""
        import json
        h = {"Content-Type": "application/json"}
        if headers:
            h.update(headers)
        return self.client.post(url, data=json.dumps(data), headers=h)

    def json_put(self, url: str, data: dict, headers: dict = None):
        """发送 JSON PUT 请求"""
        import json
        h = {"Content-Type": "application/json"}
        if headers:
            h.update(headers)
        return self.client.put(url, data=json.dumps(data), headers=h)
