# -*- coding: utf-8 -*-
"""
@文件: test_db_mongo.py
@说明: MongoOperations 单元测试（使用 Mock 替代真实 MongoDB）
@时间: 2026-03-09

运行: python -m pytest tests/test_db_mongo.py -v
"""
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

os.environ.setdefault("FLASK_ENV", "dev")
os.environ.setdefault("REDIS_REQUIRED", "false")

# ===== pymongo / bson 在此环境因 bson 版本冲突不可用，整体 mock =====
_FAKE_OID_STR = "507f1f77bcf86cd799439011"


class _FakeObjectId:
    """轻量 ObjectId stub，使 isinstance(obj, ObjectId) 检查可以工作"""
    def __init__(self, hex_str=None):
        self._hex = hex_str or _FAKE_OID_STR

    def __str__(self):
        return self._hex

    def __repr__(self):
        return f"ObjectId('{self._hex}')"


_mock_pymongo = MagicMock()
_mock_bson = MagicMock()
_mock_bson.ObjectId = _FakeObjectId
_mock_pymongo.ASCENDING = 1
_mock_pymongo.DESCENDING = -1
_mock_pymongo.IndexModel = MagicMock

# Patch sys.modules before any dbs.mongo_db imports
for _mod_name, _mod in {
    "pymongo": _mock_pymongo,
    "pymongo.collection": MagicMock(),
    "pymongo.cursor": MagicMock(),
    "pymongo.results": MagicMock(),
    "pymongo.database": MagicMock(),
    "pymongo.errors": MagicMock(),
    "pymongo.client_session": MagicMock(),
    "bson": _mock_bson,
}.items():
    sys.modules[_mod_name] = _mod


def _make_collection_mock():
    return MagicMock()


class TestMongoOperationsInsert(unittest.TestCase):
    """MongoOperations 插入操作测试"""

    def setUp(self):
        self.col_mock = _make_collection_mock()
        patcher = patch("dbs.mongo_db.operations.mongo_client")
        self.mock_client = patcher.start()
        self.mock_client.get_collection.return_value = self.col_mock
        self.addCleanup(patcher.stop)

        from dbs.mongo_db.operations import MongoOperations
        self.ops = MongoOperations("test_col")

    def test_insert_one_returns_str(self):
        oid = _FakeObjectId(_FAKE_OID_STR)
        result_mock = MagicMock()
        result_mock.inserted_id = oid
        self.col_mock.insert_one.return_value = result_mock

        result = self.ops.insert_one({"name": "test"})
        self.assertEqual(result, _FAKE_OID_STR)
        self.col_mock.insert_one.assert_called_once_with({"name": "test"})

    def test_insert_many_returns_str_list(self):
        oids = [_FakeObjectId("aaa"), _FakeObjectId("bbb")]
        result_mock = MagicMock()
        result_mock.inserted_ids = oids
        self.col_mock.insert_many.return_value = result_mock

        result = self.ops.insert_many([{"a": 1}, {"a": 2}])
        self.assertEqual(result, ["aaa", "bbb"])
        self.assertEqual(len(result), 2)


class TestMongoOperationsFind(unittest.TestCase):
    """MongoOperations 查询操作测试"""

    def setUp(self):
        self.col_mock = _make_collection_mock()
        patcher = patch("dbs.mongo_db.operations.mongo_client")
        self.mock_client = patcher.start()
        self.mock_client.get_collection.return_value = self.col_mock
        self.addCleanup(patcher.stop)

        from dbs.mongo_db.operations import MongoOperations
        self.ops = MongoOperations("test_col")

    def test_find_one_converts_id_to_str(self):
        oid = _FakeObjectId(_FAKE_OID_STR)
        self.col_mock.find_one.return_value = {"_id": oid, "name": "Alice"}

        result = self.ops.find_one({"name": "Alice"})
        self.assertEqual(result["_id"], _FAKE_OID_STR)
        self.assertEqual(result["name"], "Alice")

    def test_find_one_returns_none_when_not_found(self):
        self.col_mock.find_one.return_value = None
        result = self.ops.find_one({"name": "NoExist"})
        self.assertIsNone(result)

    def test_find_one_no_id_field(self):
        self.col_mock.find_one.return_value = {"name": "Alice"}
        result = self.ops.find_one()
        self.assertNotIn("_id", result)

    def test_find_returns_list_with_str_ids(self):
        oid = _FakeObjectId(_FAKE_OID_STR)
        cursor_mock = MagicMock()
        cursor_mock.__iter__ = MagicMock(return_value=iter([{"_id": oid, "val": 1}]))
        cursor_mock.sort.return_value = cursor_mock
        cursor_mock.skip.return_value = cursor_mock
        cursor_mock.limit.return_value = cursor_mock
        self.col_mock.find.return_value = cursor_mock

        result = self.ops.find({})
        self.assertIsInstance(result, list)
        self.assertEqual(result[0]["_id"], _FAKE_OID_STR)

    def test_find_with_sort_skip_limit(self):
        cursor_mock = MagicMock()
        cursor_mock.__iter__ = MagicMock(return_value=iter([]))
        cursor_mock.sort.return_value = cursor_mock
        cursor_mock.skip.return_value = cursor_mock
        cursor_mock.limit.return_value = cursor_mock
        self.col_mock.find.return_value = cursor_mock

        self.ops.find({}, sort=[("name", 1)], skip=5, limit=10)
        cursor_mock.sort.assert_called_once_with([("name", 1)])
        cursor_mock.skip.assert_called_once_with(5)
        cursor_mock.limit.assert_called_once_with(10)

    def test_find_page_returns_pagination_structure(self):
        self.col_mock.count_documents.return_value = 5
        cursor_mock = MagicMock()
        cursor_mock.__iter__ = MagicMock(return_value=iter([]))
        cursor_mock.sort.return_value = cursor_mock
        cursor_mock.skip.return_value = cursor_mock
        cursor_mock.limit.return_value = cursor_mock
        self.col_mock.find.return_value = cursor_mock

        result = self.ops.find_page(page=1, page_size=3)
        self.assertIn("items", result)
        self.assertIn("total", result)
        self.assertIn("page", result)
        self.assertIn("page_size", result)
        self.assertIn("total_pages", result)
        self.assertEqual(result["total"], 5)
        self.assertEqual(result["page"], 1)
        self.assertEqual(result["page_size"], 3)
        self.assertEqual(result["total_pages"], 2)

    def test_count_returns_int(self):
        self.col_mock.count_documents.return_value = 10
        result = self.ops.count({"status": "active"})
        self.assertEqual(result, 10)

    def test_count_no_filter(self):
        self.col_mock.count_documents.return_value = 100
        result = self.ops.count()
        self.col_mock.count_documents.assert_called_once_with({})

    def test_exists_true(self):
        self.col_mock.count_documents.return_value = 1
        self.assertTrue(self.ops.exists({"name": "Alice"}))
        self.col_mock.count_documents.assert_called_once_with({"name": "Alice"}, limit=1)

    def test_exists_false(self):
        self.col_mock.count_documents.return_value = 0
        self.assertFalse(self.ops.exists({"name": "NoExist"}))


class TestMongoOperationsUpdate(unittest.TestCase):
    """MongoOperations 更新操作测试"""

    def setUp(self):
        self.col_mock = _make_collection_mock()
        patcher = patch("dbs.mongo_db.operations.mongo_client")
        self.mock_client = patcher.start()
        self.mock_client.get_collection.return_value = self.col_mock
        self.addCleanup(patcher.stop)

        from dbs.mongo_db.operations import MongoOperations
        self.ops = MongoOperations("test_col")

    def test_update_one_returns_modified_count(self):
        result_mock = MagicMock()
        result_mock.modified_count = 1
        self.col_mock.update_one.return_value = result_mock

        count = self.ops.update_one({"name": "Alice"}, {"$set": {"age": 30}})
        self.assertEqual(count, 1)

    def test_update_one_with_upsert(self):
        result_mock = MagicMock()
        result_mock.modified_count = 0
        self.col_mock.update_one.return_value = result_mock

        self.ops.update_one({"name": "Bob"}, {"$set": {"age": 25}}, upsert=True)
        self.col_mock.update_one.assert_called_once_with(
            {"name": "Bob"}, {"$set": {"age": 25}}, upsert=True
        )

    def test_update_many_returns_modified_count(self):
        result_mock = MagicMock()
        result_mock.modified_count = 3
        self.col_mock.update_many.return_value = result_mock

        count = self.ops.update_many({"status": "old"}, {"$set": {"status": "new"}})
        self.assertEqual(count, 3)

    def test_replace_one_returns_modified_count(self):
        result_mock = MagicMock()
        result_mock.modified_count = 1
        self.col_mock.replace_one.return_value = result_mock

        count = self.ops.replace_one({"name": "Alice"}, {"name": "Alice", "age": 30})
        self.assertEqual(count, 1)


class TestMongoOperationsDelete(unittest.TestCase):
    """MongoOperations 删除操作测试"""

    def setUp(self):
        self.col_mock = _make_collection_mock()
        patcher = patch("dbs.mongo_db.operations.mongo_client")
        self.mock_client = patcher.start()
        self.mock_client.get_collection.return_value = self.col_mock
        self.addCleanup(patcher.stop)

        from dbs.mongo_db.operations import MongoOperations
        self.ops = MongoOperations("test_col")

    def test_delete_one_returns_deleted_count(self):
        result_mock = MagicMock()
        result_mock.deleted_count = 1
        self.col_mock.delete_one.return_value = result_mock

        count = self.ops.delete_one({"name": "Alice"})
        self.assertEqual(count, 1)

    def test_delete_many_returns_deleted_count(self):
        result_mock = MagicMock()
        result_mock.deleted_count = 5
        self.col_mock.delete_many.return_value = result_mock

        count = self.ops.delete_many({"status": "inactive"})
        self.assertEqual(count, 5)

    def test_delete_one_calls_collection(self):
        result_mock = MagicMock()
        result_mock.deleted_count = 0
        self.col_mock.delete_one.return_value = result_mock

        self.ops.delete_one({"status": "gone"})
        self.col_mock.delete_one.assert_called_once_with({"status": "gone"})

    def test_delete_many_calls_collection(self):
        result_mock = MagicMock()
        result_mock.deleted_count = 0
        self.col_mock.delete_many.return_value = result_mock

        self.ops.delete_many({"status": "inactive"})
        self.col_mock.delete_many.assert_called_once_with({"status": "inactive"})


class TestMongoOperationsAggregate(unittest.TestCase):
    """MongoOperations 聚合和索引操作测试"""

    def setUp(self):
        self.col_mock = _make_collection_mock()
        patcher = patch("dbs.mongo_db.operations.mongo_client")
        self.mock_client = patcher.start()
        self.mock_client.get_collection.return_value = self.col_mock
        self.addCleanup(patcher.stop)

        from dbs.mongo_db.operations import MongoOperations
        self.ops = MongoOperations("test_col")

    def test_aggregate_converts_objectid_in_results(self):
        oid = _FakeObjectId("aabbcc")
        self.col_mock.aggregate.return_value = [
            {"_id": oid, "count": 5},
        ]
        result = self.ops.aggregate([{"$group": {"_id": "$category"}}])
        self.assertEqual(result[0]["_id"], "aabbcc")

    def test_aggregate_non_objectid_id_unchanged(self):
        self.col_mock.aggregate.return_value = [
            {"_id": "string_id", "count": 3},
        ]
        result = self.ops.aggregate([{"$group": {"_id": "$category"}}])
        self.assertEqual(result[0]["_id"], "string_id")

    def test_distinct_returns_list(self):
        self.col_mock.distinct.return_value = ["cat1", "cat2", "cat3"]
        result = self.ops.distinct("category")
        self.assertEqual(result, ["cat1", "cat2", "cat3"])

    def test_distinct_with_filter(self):
        self.col_mock.distinct.return_value = ["active"]
        self.ops.distinct("status", {"age": {"$gte": 18}})
        self.col_mock.distinct.assert_called_once_with("status", {"age": {"$gte": 18}})

    def test_create_index_with_string_key(self):
        self.col_mock.create_index.return_value = "name_1"
        result = self.ops.create_index("name", unique=True)
        self.assertEqual(result, "name_1")
        # 字符串 key 被转换为 [(key, ASCENDING)]
        call_args = self.col_mock.create_index.call_args
        self.assertIsInstance(call_args[0][0], list)

    def test_create_index_with_tuple_list(self):
        self.col_mock.create_index.return_value = "name_1_age_-1"
        result = self.ops.create_index([("name", 1), ("age", -1)])
        self.assertEqual(result, "name_1_age_-1")

    def test_list_indexes(self):
        self.col_mock.list_indexes.return_value = iter([{"name": "_id_"}, {"name": "name_1"}])
        result = self.ops.list_indexes()
        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 2)

    def test_drop_index(self):
        self.ops.drop_index("name_1")
        self.col_mock.drop_index.assert_called_once_with("name_1")

    def test_drop_indexes(self):
        self.ops.drop_indexes()
        self.col_mock.drop_indexes.assert_called_once()


class TestMongoOperationsInit(unittest.TestCase):
    """MongoOperations 初始化测试"""

    def test_init_with_default_database(self):
        with patch("dbs.mongo_db.operations.mongo_client"):
            from dbs.mongo_db.operations import MongoOperations
            ops = MongoOperations("users")
            self.assertEqual(ops._collection_name, "users")
            self.assertIsNone(ops._database)

    def test_init_with_custom_database(self):
        with patch("dbs.mongo_db.operations.mongo_client"):
            from dbs.mongo_db.operations import MongoOperations
            ops = MongoOperations("orders", database="shop_db")
            self.assertEqual(ops._collection_name, "orders")
            self.assertEqual(ops._database, "shop_db")

    def test_collection_property_calls_get_collection(self):
        mock_client = MagicMock()
        mock_collection = MagicMock()
        mock_client.get_collection.return_value = mock_collection

        with patch("dbs.mongo_db.operations.mongo_client", mock_client):
            from dbs.mongo_db.operations import MongoOperations
            ops = MongoOperations("test_col", database="mydb")
            col = ops.collection
            mock_client.get_collection.assert_called_with("test_col", "mydb")
            self.assertEqual(col, mock_collection)


if __name__ == "__main__":
    unittest.main()
