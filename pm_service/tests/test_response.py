# -*- coding: utf-8 -*-
"""
@文件: test_response.py
@说明: response_result / fail_response_result 工具函数测试，以及全局错误处理器测试
@时间: 2026-03-09

运行: python -m pytest tests/test_response.py -v
"""
import json
import os
import unittest

os.environ.setdefault("FLASK_ENV", "dev")
os.environ.setdefault("REDIS_REQUIRED", "false")

from tests.base_test import BaseTest
from utils.response import fail_response_result, response_result


class TestResponseResult(unittest.TestCase):
    """response_result() 函数测试"""

    def test_default_values(self):
        result = response_result()
        self.assertEqual(result["code"], "S10000")
        self.assertEqual(result["msg"], "OK")

    def test_content_list(self):
        result = response_result(content=[1, 2, 3])
        self.assertEqual(result["content"], [1, 2, 3])

    def test_content_dict(self):
        result = response_result(content={"key": "value"})
        self.assertEqual(result["content"]["key"], "value")

    def test_custom_msg(self):
        result = response_result(msg="创建成功")
        self.assertEqual(result["msg"], "创建成功")

    def test_custom_code(self):
        result = response_result(code="S20000")
        self.assertEqual(result["code"], "S20000")

    def test_has_required_keys(self):
        result = response_result()
        self.assertIn("code", result)
        self.assertIn("msg", result)
        self.assertIn("content", result)


class TestFailResponseResult(unittest.TestCase):
    """fail_response_result() 函数测试"""

    def test_default_values(self):
        result = fail_response_result()
        self.assertEqual(result["code"], "F10001")
        self.assertEqual(result["msg"], "Error")

    def test_custom_msg(self):
        result = fail_response_result(msg="操作失败")
        self.assertEqual(result["msg"], "操作失败")

    def test_custom_code(self):
        result = fail_response_result(code="F40001")
        self.assertEqual(result["code"], "F40001")

    def test_content_dict(self):
        result = fail_response_result(content={"field": "work_no"})
        self.assertEqual(result["content"]["field"], "work_no")

    def test_has_required_keys(self):
        result = fail_response_result()
        self.assertIn("code", result)
        self.assertIn("msg", result)
        self.assertIn("content", result)


class TestErrorHandler(BaseTest):
    """全局错误处理器集成测试"""

    def test_404_not_found(self):
        """访问不存在的路由返回 404"""
        resp = self.client.get("/api/test?work_no=WN_ZZZZZ_NO_EXIST")
        # ResourceNotFoundException 应返回 404
        self.assertEqual(resp.status_code, 404)
        data = json.loads(resp.data)
        self.assertEqual(data.get("code"), "F40001")
        self.assertIn("content", data)

    def test_401_unauthorized(self):
        """访问受保护接口不带 token 返回 401"""
        resp = self.client.post(
            "/api/test",
            data=json.dumps({"work_no": "WN001", "username": "A", "password": "p"}),
            headers={"Content-Type": "application/json"}
        )
        self.assertEqual(resp.status_code, 401)

    def test_error_response_format(self):
        """错误响应应包含 code, msg, content"""
        resp = self.client.get("/api/test?work_no=WN_NO_EXIST_FORMAT_TEST")
        data = json.loads(resp.data)
        self.assertIn("code", data)
        self.assertIn("msg", data)
        self.assertIn("content", data)


if __name__ == "__main__":
    unittest.main()
