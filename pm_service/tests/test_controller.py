# -*- coding: utf-8 -*-
"""
@文件: test_controller.py
@说明: TestController 单元测试（Mock OperTestModel 和 OperRedis）
@时间: 2026-03-09

运行: python -m pytest tests/test_controller.py -v
"""
import os
import unittest
from unittest.mock import MagicMock, patch, PropertyMock

os.environ.setdefault("FLASK_ENV", "dev")
os.environ.setdefault("REDIS_REQUIRED", "false")

from tests.base_test import BaseTest
from utils.exceptions import (
    ResourceExistsException,
    ResourceNotFoundException,
    ValidationException,
)


class TestControllerSearch(BaseTest):
    """TestController.search() 测试"""

    def _make_controller(self, redis_get=None, db_result=None, db_all=None):
        """创建带 Mock 的 Controller"""
        from controllers.test_controller import TestController
        ctrl = TestController.__new__(TestController)
        ctrl.oper_redis = MagicMock()
        ctrl.oper_test = MagicMock()
        ctrl.schema = MagicMock()
        ctrl.cache_timeout = 300

        ctrl.oper_redis.get.return_value = redis_get
        ctrl.oper_test.search_by_work_no.return_value = db_result
        ctrl.oper_test.search_all.return_value = db_all or []
        ctrl.schema.dump.return_value = {"work_no": "WN001"}
        return ctrl

    def test_search_returns_cached_data(self):
        cached = {"work_no": "WN001", "username": "Alice"}
        ctrl = self._make_controller(redis_get=cached)
        result = ctrl.search("WN001")
        self.assertEqual(result, cached)
        ctrl.oper_test.search_by_work_no.assert_not_called()

    def test_search_by_work_no_from_db(self):
        mock_record = MagicMock()
        ctrl = self._make_controller(redis_get=None, db_result=mock_record)
        result = ctrl.search("WN001")
        ctrl.oper_test.search_by_work_no.assert_called_once_with("WN001")
        ctrl.oper_redis.set.assert_called_once()

    def test_search_by_work_no_not_found_raises(self):
        ctrl = self._make_controller(redis_get=None, db_result=None)
        with self.assertRaises(ResourceNotFoundException):
            ctrl.search("WN_NOT_EXIST")

    def test_search_all_from_db(self):
        ctrl = self._make_controller(redis_get=None, db_all=[MagicMock(), MagicMock()])
        ctrl.schema.dump.return_value = [{"work_no": "WN001"}, {"work_no": "WN002"}]
        result = ctrl.search()
        ctrl.oper_test.search_all.assert_called_once()

    def test_search_writes_result_to_cache(self):
        mock_record = MagicMock()
        ctrl = self._make_controller(redis_get=None, db_result=mock_record)
        ctrl.search("WN001")
        ctrl.oper_redis.set.assert_called_once_with(
            "test:WN001", ctrl.schema.dump.return_value, ex=300
        )


class TestControllerAdd(BaseTest):
    """TestController.add() 测试"""

    def _make_controller(self, exists=False):
        from controllers.test_controller import TestController
        ctrl = TestController.__new__(TestController)
        ctrl.oper_redis = MagicMock()
        ctrl.oper_test = MagicMock()
        ctrl.schema = MagicMock()
        ctrl.cache_timeout = 300
        ctrl.oper_test.exists.return_value = exists
        ctrl.oper_redis.get.return_value = None
        return ctrl

    def test_add_success(self):
        ctrl = self._make_controller(exists=False)
        result = ctrl.add({"work_no": "WN001", "username": "Alice"}, "OP001")
        self.assertTrue(result)
        ctrl.oper_test.add_with_log.assert_called_once()
        ctrl.oper_redis.delete.assert_called_with("test:all")

    def test_add_without_work_no_raises_validation(self):
        ctrl = self._make_controller()
        with self.assertRaises(ValidationException):
            ctrl.add({"username": "Alice"})

    def test_add_duplicate_raises_exists(self):
        ctrl = self._make_controller(exists=True)
        with self.assertRaises(ResourceExistsException):
            ctrl.add({"work_no": "WN001"})

    def test_add_clears_all_cache(self):
        ctrl = self._make_controller(exists=False)
        ctrl.add({"work_no": "WN_NEW"})
        ctrl.oper_redis.delete.assert_called_with("test:all")


class TestControllerUpdate(BaseTest):
    """TestController.update() 测试"""

    def _make_controller(self, exists=True):
        from controllers.test_controller import TestController
        ctrl = TestController.__new__(TestController)
        ctrl.oper_redis = MagicMock()
        ctrl.oper_test = MagicMock()
        ctrl.schema = MagicMock()
        ctrl.cache_timeout = 300
        ctrl.oper_test.exists.return_value = exists
        return ctrl

    def test_update_success(self):
        ctrl = self._make_controller(exists=True)
        result = ctrl.update("WN001", {"username": "新名字"}, "OP001")
        self.assertTrue(result)
        ctrl.oper_test.update_with_log.assert_called_once()

    def test_update_without_work_no_raises(self):
        ctrl = self._make_controller()
        with self.assertRaises(ValidationException):
            ctrl.update("", {"username": "新名字"})

    def test_update_nonexistent_raises(self):
        ctrl = self._make_controller(exists=False)
        with self.assertRaises(ResourceNotFoundException):
            ctrl.update("WN_NOT_EXIST", {"username": "新名字"})

    def test_update_clears_specific_and_all_cache(self):
        ctrl = self._make_controller(exists=True)
        ctrl.update("WN001", {"username": "新名字"})
        calls = [str(c) for c in ctrl.oper_redis.delete.call_args_list]
        self.assertTrue(any("test:WN001" in c for c in calls))
        self.assertTrue(any("test:all" in c for c in calls))


class TestControllerDelete(BaseTest):
    """TestController.delete() 测试"""

    def _make_controller(self, exists=True):
        from controllers.test_controller import TestController
        ctrl = TestController.__new__(TestController)
        ctrl.oper_redis = MagicMock()
        ctrl.oper_test = MagicMock()
        ctrl.schema = MagicMock()
        ctrl.cache_timeout = 300
        ctrl.oper_test.exists.return_value = exists
        return ctrl

    def test_delete_success(self):
        ctrl = self._make_controller(exists=True)
        result = ctrl.delete("WN001", "OP001")
        self.assertTrue(result)
        ctrl.oper_test.delete_with_log.assert_called_once()

    def test_delete_without_work_no_raises(self):
        ctrl = self._make_controller()
        with self.assertRaises(ValidationException):
            ctrl.delete("")

    def test_delete_nonexistent_raises(self):
        ctrl = self._make_controller(exists=False)
        with self.assertRaises(ResourceNotFoundException):
            ctrl.delete("WN_NOT_EXIST")

    def test_delete_clears_cache(self):
        ctrl = self._make_controller(exists=True)
        ctrl.delete("WN001")
        calls = [str(c) for c in ctrl.oper_redis.delete.call_args_list]
        self.assertTrue(any("test:WN001" in c for c in calls))
        self.assertTrue(any("test:all" in c for c in calls))


class TestControllerList(BaseTest):
    """TestController.list() 测试"""

    def _make_controller(self):
        from controllers.test_controller import TestController
        ctrl = TestController.__new__(TestController)
        ctrl.oper_redis = MagicMock()
        ctrl.oper_test = MagicMock()
        ctrl.schema = MagicMock()
        ctrl.cache_timeout = 300
        ctrl.oper_test.search_with_pagination.return_value = {
            "items": [MagicMock(), MagicMock()],
            "total": 2,
            "page": 1,
            "page_size": 20,
        }
        ctrl.schema.dump.return_value = [{"work_no": "WN001"}, {"work_no": "WN002"}]
        return ctrl

    def test_list_returns_pagination_structure(self):
        ctrl = self._make_controller()
        result = ctrl.list(page=1, page_size=20)
        self.assertIn("list", result)
        self.assertIn("page", result)
        self.assertIn("page_size", result)
        self.assertIn("total", result)

    def test_list_passes_pagination_params(self):
        ctrl = self._make_controller()
        ctrl.list(page=2, page_size=10)
        ctrl.oper_test.search_with_pagination.assert_called_once_with(
            page=2, page_size=10, work_no=None
        )

    def test_list_invalid_page_defaults_to_1(self):
        ctrl = self._make_controller()
        ctrl.list(page="invalid", page_size=10)
        args = ctrl.oper_test.search_with_pagination.call_args
        self.assertEqual(args.kwargs["page"], 1)

    def test_list_with_work_no_filter(self):
        ctrl = self._make_controller()
        ctrl.list(page=1, page_size=20, work_no="WN001")
        ctrl.oper_test.search_with_pagination.assert_called_once_with(
            page=1, page_size=20, work_no="WN001"
        )


if __name__ == "__main__":
    unittest.main()
