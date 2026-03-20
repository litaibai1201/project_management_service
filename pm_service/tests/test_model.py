# -*- coding: utf-8 -*-
"""
@文件: test_model.py
@说明: OperTestModel 单元测试（使用 SQLite 内存库）
@时间: 2026-03-09

运行: python -m pytest tests/test_model.py -v
"""
import os
import unittest
from unittest.mock import patch, MagicMock

os.environ.setdefault("FLASK_ENV", "dev")
os.environ.setdefault("REDIS_REQUIRED", "false")

from tests.base_test import BaseTest, create_test_app
from dbs.mysql_db import db


class TestOperTestModel(BaseTest):
    """OperTestModel CRUD 方法测试"""

    def _get_model(self):
        from models.test_model import OperTestModel
        return OperTestModel()

    def _sample_data(self, work_no="WN_TEST_001"):
        return {
            "work_no": work_no,
            "username": "测试用户",
            "password": "password123",
        }

    # ==================== add ====================

    def test_add_returns_true(self):
        model = self._get_model()
        data = self._sample_data()
        result = model.add(data)
        # add() returns True on success
        self.assertTrue(result)

    def test_add_persists_to_db(self):
        model = self._get_model()
        data = self._sample_data("WN_PERSIST_001")
        model.add(data)
        found = model.search_by_work_no("WN_PERSIST_001")
        self.assertIsNotNone(found)

    # ==================== search_by_work_no ====================

    def test_search_by_work_no_found(self):
        model = self._get_model()
        model.add(self._sample_data("WN_SEARCH_001"))
        result = model.search_by_work_no("WN_SEARCH_001")
        self.assertIsNotNone(result)
        self.assertEqual(result.work_no, "WN_SEARCH_001")

    def test_search_by_work_no_not_found(self):
        model = self._get_model()
        result = model.search_by_work_no("WN_NOT_EXIST_XYZ")
        self.assertIsNone(result)

    # ==================== search_all ====================

    def test_search_all_returns_list(self):
        model = self._get_model()
        model.add(self._sample_data("WN_ALL_001"))
        model.add(self._sample_data("WN_ALL_002"))
        results = model.search_all()
        self.assertIsInstance(results, list)
        work_nos = [r.work_no for r in results]
        self.assertIn("WN_ALL_001", work_nos)
        self.assertIn("WN_ALL_002", work_nos)

    def test_search_all_empty(self):
        model = self._get_model()
        results = model.search_all()
        self.assertIsInstance(results, list)

    # ==================== exists ====================

    def test_exists_true(self):
        model = self._get_model()
        model.add(self._sample_data("WN_EXISTS_001"))
        self.assertTrue(model.exists("WN_EXISTS_001"))

    def test_exists_false(self):
        model = self._get_model()
        self.assertFalse(model.exists("WN_NO_EXIST_XYZ"))

    # ==================== put ====================

    def test_put_updates_record(self):
        model = self._get_model()
        model.add(self._sample_data("WN_PUT_001"))
        model.put("WN_PUT_001", {"username": "新用户名"})
        found = model.search_by_work_no("WN_PUT_001")
        self.assertEqual(found.username, "新用户名")

    def test_put_nonexistent_returns_zero(self):
        model = self._get_model()
        # put() returns number of rows updated; 0 when record not found
        result = model.put("WN_NO_EXIST_XYZ", {"username": "新名"})
        self.assertEqual(result, 0)

    # ==================== delete ====================

    def test_delete_removes_record(self):
        model = self._get_model()
        model.add(self._sample_data("WN_DEL_001"))
        model.delete("WN_DEL_001")
        found = model.search_by_work_no("WN_DEL_001")
        self.assertIsNone(found)

    def test_delete_nonexistent_returns_zero(self):
        model = self._get_model()
        # delete() returns number of rows deleted; 0 when record not found
        result = model.delete("WN_NO_EXIST_XYZ")
        self.assertEqual(result, 0)

    # ==================== search_with_pagination ====================

    def test_pagination_returns_structure(self):
        model = self._get_model()
        for i in range(5):
            model.add(self._sample_data(f"WN_PAGE_{i:03d}"))
        result = model.search_with_pagination(page=1, page_size=3)
        self.assertIn("items", result)
        self.assertIn("total", result)
        self.assertIn("page", result)
        self.assertIn("page_size", result)
        self.assertEqual(result["page"], 1)
        self.assertEqual(result["page_size"], 3)
        self.assertEqual(len(result["items"]), 3)

    def test_pagination_total_count(self):
        model = self._get_model()
        for i in range(4):
            model.add(self._sample_data(f"WN_TOT_{i:03d}"))
        result = model.search_with_pagination(page=1, page_size=10)
        self.assertGreaterEqual(result["total"], 4)

    def test_pagination_page_2(self):
        model = self._get_model()
        for i in range(5):
            model.add(self._sample_data(f"WN_P2_{i:03d}"))
        result = model.search_with_pagination(page=2, page_size=3)
        self.assertEqual(result["page"], 2)
        # 第2页最多 2 条
        self.assertLessEqual(len(result["items"]), 3)

    def test_pagination_filter_by_work_no(self):
        model = self._get_model()
        model.add(self._sample_data("WN_FILTER_001"))
        model.add(self._sample_data("WN_FILTER_002"))
        result = model.search_with_pagination(page=1, page_size=10, work_no="WN_FILTER_001")
        work_nos = [r.work_no for r in result["items"]]
        self.assertIn("WN_FILTER_001", work_nos)
        self.assertNotIn("WN_FILTER_002", work_nos)

    # ==================== 多表事务 ====================

    def test_add_with_log_creates_record_and_log(self):
        from dbs.mysql_db.model_tables import OperationLogModel
        model = self._get_model()
        data = self._sample_data("WN_LOG_001")
        result = model.add_with_log(data, operator_work_no="OPERATOR_001")
        self.assertTrue(result)

        # 主记录存在（通过 search_by_work_no 查询）
        record = model.search_by_work_no("WN_LOG_001")
        self.assertIsNotNone(record)

        # 操作日志存在（通过相同 session 查询）
        log = db.session.query(OperationLogModel).filter_by(
            work_no="OPERATOR_001"
        ).first()
        self.assertIsNotNone(log)

    def test_update_with_log_updates_and_logs(self):
        from dbs.mysql_db.model_tables import OperationLogModel
        model = self._get_model()
        model.add(self._sample_data("WN_ULOG_001"))
        model.update_with_log("WN_ULOG_001", {"username": "更新后名称"}, operator_work_no="OP_001")

        updated = model.search_by_work_no("WN_ULOG_001")
        self.assertEqual(updated.username, "更新后名称")

    def test_delete_with_log_deletes_and_logs(self):
        from dbs.mysql_db.model_tables import OperationLogModel
        model = self._get_model()
        model.add(self._sample_data("WN_DLOG_001"))
        model.delete_with_log("WN_DLOG_001", operator_work_no="OP_001")

        deleted = model.search_by_work_no("WN_DLOG_001")
        self.assertIsNone(deleted)

    # ==================== bulk_add ====================

    def test_bulk_add(self):
        model = self._get_model()
        items = [
            self._sample_data("WN_BULK_001"),
            self._sample_data("WN_BULK_002"),
            self._sample_data("WN_BULK_003"),
        ]
        model.bulk_add(items)
        self.assertTrue(model.exists("WN_BULK_001"))
        self.assertTrue(model.exists("WN_BULK_002"))
        self.assertTrue(model.exists("WN_BULK_003"))


if __name__ == "__main__":
    unittest.main()
