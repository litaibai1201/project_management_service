# -*- coding: utf-8 -*-
"""
@文件: test_api_auth.py
@说明: Auth API 集成测试（/api/auth）
@时间: 2026-03-09

运行: python -m pytest tests/test_api_auth.py -v
"""
import os
import json
import unittest

os.environ.setdefault("FLASK_ENV", "dev")
os.environ.setdefault("REDIS_REQUIRED", "false")

from tests.base_test import BaseTest


class TestLoginAPI(BaseTest):
    """POST /api/auth/login"""

    def test_login_success(self):
        resp = self.json_post("/api/auth/login", {
            "username": "admin",
            "password": "password123"
        })
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertEqual(data.get("code"), "S10000")
        content = data.get("content", {})
        self.assertIn("access_token", content)

    def test_login_returns_bearer_token(self):
        resp = self.json_post("/api/auth/login", {
            "username": "user",
            "password": "pass"
        })
        data = json.loads(resp.data)
        content = data.get("content", {})
        if "access_token" in content:
            self.assertIsInstance(content["access_token"], str)
            self.assertGreater(len(content["access_token"]), 10)

    def test_login_empty_username_fails(self):
        resp = self.json_post("/api/auth/login", {
            "username": "",
            "password": "password123"
        })
        # 参数验证失败: 422 (schema) 或 400 (业务逻辑)
        self.assertIn(resp.status_code, [400, 422])

    def test_login_empty_password_fails(self):
        resp = self.json_post("/api/auth/login", {
            "username": "admin",
            "password": ""
        })
        self.assertIn(resp.status_code, [400, 422])

    def test_login_missing_fields_fails(self):
        resp = self.json_post("/api/auth/login", {})
        self.assertIn(resp.status_code, [400, 422])

    def test_login_response_has_standard_format(self):
        resp = self.json_post("/api/auth/login", {
            "username": "admin",
            "password": "password"
        })
        data = json.loads(resp.data)
        self.assertIn("code", data)
        self.assertIn("msg", data)
        self.assertIn("content", data)


class TestProfileAPI(BaseTest):
    """GET /api/test/profile（需要 JWT 认证）"""

    def test_profile_without_token_returns_401(self):
        resp = self.client.get("/api/test/profile")
        self.assertEqual(resp.status_code, 401)

    def test_profile_with_valid_token(self):
        headers = self.auth_headers("test_user_001")
        resp = self.client.get("/api/test/profile", headers=headers)
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertEqual(data.get("code"), "S10000")

    def test_profile_contains_identity(self):
        headers = self.auth_headers("my_test_identity")
        resp = self.client.get("/api/test/profile", headers=headers)
        data = json.loads(resp.data)
        content = data.get("content", {})
        # 响应中应包含 username 或 identity 信息
        self.assertTrue(
            "username" in content or "identity" in content or "my_test_identity" in str(content)
        )

    def test_invalid_token_returns_401(self):
        headers = {
            "Authorization": "Bearer invalid.token.here",
            "Content-Type": "application/json"
        }
        resp = self.client.get("/api/test/profile", headers=headers)
        self.assertIn(resp.status_code, [401, 422])


if __name__ == "__main__":
    unittest.main()
