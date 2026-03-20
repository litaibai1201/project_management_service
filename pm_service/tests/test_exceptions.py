# -*- coding: utf-8 -*-
"""
@文件: test_exceptions.py
@说明: 异常类单元测试
@时间: 2026-03-09

运行: python -m pytest tests/test_exceptions.py -v
"""
import unittest

from utils.exceptions import (
    APIException,
    AuthenticationException,
    BusinessException,
    CacheException,
    DatabaseException,
    ExternalServiceException,
    PermissionException,
    ResourceExistsException,
    ResourceNotFoundException,
    ValidationException,
)


class TestAPIException(unittest.TestCase):
    """APIException 基类测试"""

    def test_default_values(self):
        exc = APIException()
        self.assertEqual(exc.code, "F10001")
        self.assertEqual(exc.msg, "请求失败")
        self.assertEqual(exc.status_code, 500)
        self.assertEqual(exc.content, {})

    def test_custom_values(self):
        exc = APIException(code="F99999", msg="自定义错误", status_code=418, content={"key": "val"})
        self.assertEqual(exc.code, "F99999")
        self.assertEqual(exc.msg, "自定义错误")
        self.assertEqual(exc.status_code, 418)
        self.assertEqual(exc.content, {"key": "val"})

    def test_is_exception(self):
        exc = APIException()
        self.assertIsInstance(exc, Exception)

    def test_str_representation(self):
        exc = APIException(msg="测试错误")
        self.assertIn("测试错误", str(exc))


class TestValidationException(unittest.TestCase):
    def test_defaults(self):
        exc = ValidationException()
        self.assertEqual(exc.code, "F10002")
        self.assertEqual(exc.status_code, 400)
        self.assertEqual(exc.msg, "参数验证失败")

    def test_custom_msg(self):
        exc = ValidationException(msg="工号不能为空")
        self.assertEqual(exc.msg, "工号不能为空")
        self.assertEqual(exc.status_code, 400)

    def test_custom_code(self):
        exc = ValidationException(code="F10003")
        self.assertEqual(exc.code, "F10003")

    def test_is_api_exception(self):
        self.assertIsInstance(ValidationException(), APIException)


class TestAuthenticationException(unittest.TestCase):
    def test_defaults(self):
        exc = AuthenticationException()
        self.assertEqual(exc.code, "F20001")
        self.assertEqual(exc.status_code, 401)

    def test_custom_msg(self):
        exc = AuthenticationException(msg="Token 已过期", code="F20002")
        self.assertEqual(exc.msg, "Token 已过期")
        self.assertEqual(exc.code, "F20002")

    def test_is_api_exception(self):
        self.assertIsInstance(AuthenticationException(), APIException)


class TestPermissionException(unittest.TestCase):
    def test_defaults(self):
        exc = PermissionException()
        self.assertEqual(exc.code, "F30001")
        self.assertEqual(exc.status_code, 403)
        self.assertEqual(exc.msg, "权限不足")

    def test_is_api_exception(self):
        self.assertIsInstance(PermissionException(), APIException)


class TestResourceNotFoundException(unittest.TestCase):
    def test_defaults(self):
        exc = ResourceNotFoundException()
        self.assertEqual(exc.code, "F40001")
        self.assertEqual(exc.status_code, 404)
        self.assertIn("资源", exc.msg)

    def test_custom_resource_type(self):
        exc = ResourceNotFoundException(resource_type="用户")
        self.assertEqual(exc.msg, "用户不存在")

    def test_custom_msg_overrides_resource_type(self):
        exc = ResourceNotFoundException(msg="指定记录不存在", resource_type="用户")
        self.assertEqual(exc.msg, "指定记录不存在")

    def test_content(self):
        exc = ResourceNotFoundException(content={"work_no": "WN001"})
        self.assertEqual(exc.content, {"work_no": "WN001"})

    def test_is_api_exception(self):
        self.assertIsInstance(ResourceNotFoundException(), APIException)


class TestResourceExistsException(unittest.TestCase):
    def test_defaults(self):
        exc = ResourceExistsException()
        self.assertEqual(exc.code, "F40002")
        self.assertEqual(exc.status_code, 400)
        self.assertIn("资源", exc.msg)

    def test_custom_resource_type(self):
        exc = ResourceExistsException(resource_type="工号")
        self.assertEqual(exc.msg, "工号已存在")

    def test_is_api_exception(self):
        self.assertIsInstance(ResourceExistsException(), APIException)


class TestBusinessException(unittest.TestCase):
    def test_defaults(self):
        exc = BusinessException()
        self.assertEqual(exc.code, "F50001")
        self.assertEqual(exc.status_code, 400)
        self.assertEqual(exc.msg, "业务处理失败")

    def test_is_api_exception(self):
        self.assertIsInstance(BusinessException(), APIException)


class TestExternalServiceException(unittest.TestCase):
    def test_defaults(self):
        exc = ExternalServiceException()
        self.assertEqual(exc.code, "F60001")
        self.assertEqual(exc.status_code, 502)

    def test_is_api_exception(self):
        self.assertIsInstance(ExternalServiceException(), APIException)


class TestDatabaseException(unittest.TestCase):
    def test_defaults(self):
        exc = DatabaseException()
        self.assertEqual(exc.code, "F70001")
        self.assertEqual(exc.status_code, 500)

    def test_is_api_exception(self):
        self.assertIsInstance(DatabaseException(), APIException)


class TestCacheException(unittest.TestCase):
    def test_defaults(self):
        exc = CacheException()
        self.assertEqual(exc.code, "F70002")
        self.assertEqual(exc.status_code, 500)
        self.assertEqual(exc.msg, "缓存操作失败")

    def test_is_api_exception(self):
        self.assertIsInstance(CacheException(), APIException)


class TestExceptionHierarchy(unittest.TestCase):
    """验证异常继承关系"""

    def test_all_subclass_of_api_exception(self):
        subclasses = [
            ValidationException,
            AuthenticationException,
            PermissionException,
            ResourceNotFoundException,
            ResourceExistsException,
            BusinessException,
            ExternalServiceException,
            DatabaseException,
            CacheException,
        ]
        for cls in subclasses:
            with self.subTest(cls=cls.__name__):
                self.assertTrue(issubclass(cls, APIException))

    def test_catch_by_api_exception(self):
        """所有子异常都能被 APIException 捕获"""
        exceptions = [
            ValidationException("test"),
            AuthenticationException("test"),
            PermissionException("test"),
            ResourceNotFoundException("test"),
            ResourceExistsException("test"),
            BusinessException("test"),
            ExternalServiceException("test"),
            DatabaseException("test"),
            CacheException("test"),
        ]
        for exc in exceptions:
            with self.subTest(exc=type(exc).__name__):
                try:
                    raise exc
                except APIException as e:
                    self.assertEqual(e.msg, "test")


if __name__ == "__main__":
    unittest.main()
