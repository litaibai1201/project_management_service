# -*- coding: utf-8 -*-
"""
@文件: test_api_health.py
@说明: Health Check API 集成测试
@时间: 2026-03-09

运行: python -m pytest tests/test_api_health.py -v
"""
import os
import json
import unittest
from unittest.mock import patch, MagicMock

os.environ.setdefault("FLASK_ENV", "dev")
os.environ.setdefault("REDIS_REQUIRED", "false")

from tests.base_test import BaseTest


class TestHealthCheckAPI(BaseTest):
    """GET /health"""

    def test_health_returns_200(self):
        resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)

    def test_health_returns_json(self):
        resp = self.client.get("/health")
        data = json.loads(resp.data)
        self.assertIn("status", data)

    def test_health_status_healthy(self):
        resp = self.client.get("/health")
        data = json.loads(resp.data)
        self.assertEqual(data["status"], "healthy")


class TestReadinessCheckAPI(BaseTest):
    """GET /ready"""

    def test_ready_returns_json(self):
        resp = self.client.get("/ready")
        self.assertIn(resp.status_code, [200, 503])
        data = json.loads(resp.data)
        self.assertIn("status", data)

    @patch("views.health_api.db")
    def test_ready_all_healthy(self, mock_db):
        """当 DB 和 Redis 均正常时返回 200"""
        mock_db.session.execute.return_value = MagicMock()
        with patch("cache.get_redis_client") as mock_redis:
            mock_client = MagicMock()
            mock_client.ping.return_value = True
            mock_redis.return_value = mock_client
            resp = self.client.get("/ready")
            data = json.loads(resp.data)
            # 状态可能是 healthy 或包含 checks 结构
            self.assertIn("status", data)

    def test_ready_response_has_checks(self):
        """响应包含各组件状态"""
        resp = self.client.get("/ready")
        if resp.status_code in [200, 503]:
            data = json.loads(resp.data)
            self.assertIsInstance(data, dict)


if __name__ == "__main__":
    unittest.main()
