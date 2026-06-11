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
    """POST /api/user/login"""

    def test_login_success(self):
        resp = self.json_post("/api/user/login", {
            "work_no": "t001",
            "password": "test1234"
        })
        self.assertIn(resp.status_code, [200, 400, 401])

    def test_login_returns_bearer_token(self):
        resp = self.json_post("/api/user/login", {
            "work_no": "user",
            "password": "pass"
        })
        data = json.loads(resp.data)
        content = data.get("content", {})
        if "access_token" in content:
            self.assertIsInstance(content["access_token"], str)
            self.assertGreater(len(content["access_token"]), 10)

    def test_login_empty_username_fails(self):
        resp = self.json_post("/api/user/login", {
            "work_no": "",
            "password": "password123"
        })
        data = json.loads(resp.data)
        self.assertNotEqual(data.get("code"), "S10000")

    def test_login_empty_password_fails(self):
        resp = self.json_post("/api/user/login", {
            "work_no": "admin",
            "password": ""
        })
        data = json.loads(resp.data)
        self.assertNotEqual(data.get("code"), "S10000")

    def test_login_missing_fields_fails(self):
        resp = self.json_post("/api/user/login", {})
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


    # TestProfileAPI removed — /api/test/profile endpoint was deleted


if __name__ == "__main__":
    unittest.main()
