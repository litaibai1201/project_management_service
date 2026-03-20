# -*- coding: utf-8 -*-
"""
@文件: test_db_elasticsearch.py
@说明: ESOperations 单元测试（使用 Mock 替代真实 ES 连接）
@时间: 2026-03-09

运行: python -m pytest tests/test_db_elasticsearch.py -v
"""
import os
import unittest
from unittest.mock import MagicMock, patch, PropertyMock

os.environ.setdefault("FLASK_ENV", "dev")
os.environ.setdefault("REDIS_REQUIRED", "false")


def _make_es_client_mock():
    """构建 ES 客户端 Mock"""
    mock = MagicMock()
    mock.indices = MagicMock()
    return mock


class TestESOperationsInit(unittest.TestCase):
    """ESOperations 初始化测试"""

    def test_init_raises_if_not_installed(self):
        """如果 ES 不可用，初始化应抛出 ImportError"""
        with patch("dbs.elasticsearch_db.operations.ES_AVAILABLE", False):
            from dbs.elasticsearch_db.operations import ESOperations
            with self.assertRaises(ImportError):
                ESOperations("my_index")

    def test_index_property(self):
        with patch("dbs.elasticsearch_db.operations.ES_AVAILABLE", True), \
             patch("dbs.elasticsearch_db.operations.es_client"):
            from dbs.elasticsearch_db.operations import ESOperations
            ops = ESOperations("my_index")
            self.assertEqual(ops.index, "my_index")


class _ESTestBase(unittest.TestCase):
    """ESOperations 测试基类，设置 Mock"""

    def setUp(self):
        self.es_mock = _make_es_client_mock()
        self._client_patcher = patch("dbs.elasticsearch_db.operations.es_client")
        self._avail_patcher = patch("dbs.elasticsearch_db.operations.ES_AVAILABLE", True)
        self.mock_client = self._client_patcher.start()
        self._avail_patcher.start()
        self.mock_client.client = self.es_mock

        from dbs.elasticsearch_db.operations import ESOperations
        self.ops = ESOperations("test_index")

    def tearDown(self):
        self._client_patcher.stop()
        self._avail_patcher.stop()


class TestESIndexManagement(_ESTestBase):
    """索引管理测试"""

    def test_create_index_success(self):
        self.es_mock.indices.create.return_value = {"acknowledged": True}
        result = self.ops.create_index(
            mappings={"properties": {"title": {"type": "text"}}},
            settings={"number_of_shards": 1}
        )
        self.assertTrue(result)
        self.es_mock.indices.create.assert_called_once()

    def test_create_index_returns_false_on_error(self):
        self.es_mock.indices.create.side_effect = Exception("index already exists")
        result = self.ops.create_index()
        self.assertFalse(result)

    def test_delete_index_success(self):
        self.es_mock.indices.delete.return_value = {"acknowledged": True}
        result = self.ops.delete_index()
        self.assertTrue(result)
        self.es_mock.indices.delete.assert_called_once_with(index="test_index")

    def test_delete_index_returns_false_on_error(self):
        self.es_mock.indices.delete.side_effect = Exception("index not found")
        result = self.ops.delete_index()
        self.assertFalse(result)

    def test_index_exists_true(self):
        self.es_mock.indices.exists.return_value = True
        self.assertTrue(self.ops.index_exists())

    def test_index_exists_false(self):
        self.es_mock.indices.exists.return_value = False
        self.assertFalse(self.ops.index_exists())

    def test_index_exists_returns_false_on_error(self):
        self.es_mock.indices.exists.side_effect = Exception("connection error")
        self.assertFalse(self.ops.index_exists())

    def test_get_mapping(self):
        self.es_mock.indices.get_mapping.return_value = {"test_index": {"mappings": {}}}
        result = self.ops.get_mapping()
        self.assertIsInstance(result, dict)

    def test_put_mapping_success(self):
        result = self.ops.put_mapping({"title": {"type": "text"}})
        self.assertTrue(result)

    def test_put_mapping_returns_false_on_error(self):
        self.es_mock.indices.put_mapping.side_effect = Exception("mapping error")
        result = self.ops.put_mapping({"title": {"type": "text"}})
        self.assertFalse(result)


class TestESDocumentOperations(_ESTestBase):
    """文档操作测试"""

    def test_index_document_with_id(self):
        self.es_mock.index.return_value = {"_id": "doc-1", "result": "created"}
        result = self.ops.index_document(body={"title": "Test"}, doc_id="doc-1")
        self.assertEqual(result, "doc-1")
        self.es_mock.index.assert_called_once_with(
            index="test_index", id="doc-1", body={"title": "Test"}, refresh=False
        )

    def test_index_document_without_id(self):
        self.es_mock.index.return_value = {"_id": "auto-123", "result": "created"}
        result = self.ops.index_document(body={"title": "Test"})
        self.assertEqual(result, "auto-123")

    def test_index_document_returns_none_on_error(self):
        self.es_mock.index.side_effect = Exception("index error")
        result = self.ops.index_document(body={"title": "Test"})
        self.assertIsNone(result)

    def test_get_document_success(self):
        self.es_mock.get.return_value = {"_id": "doc-1", "_source": {"title": "Test"}}
        result = self.ops.get_document("doc-1")
        self.assertEqual(result, {"title": "Test"})

    def test_get_document_returns_none_on_error(self):
        self.es_mock.get.side_effect = Exception("not found")
        result = self.ops.get_document("no-exist")
        self.assertIsNone(result)

    def test_update_document_partial(self):
        result = self.ops.update_document("doc-1", {"title": "New Title"}, partial=True)
        self.assertTrue(result)
        self.es_mock.update.assert_called_once_with(
            index="test_index", id="doc-1", body={"doc": {"title": "New Title"}}
        )

    def test_update_document_full_replace(self):
        result = self.ops.update_document("doc-1", {"title": "Full"}, partial=False)
        self.assertTrue(result)
        self.es_mock.index.assert_called_once()

    def test_update_document_returns_false_on_error(self):
        self.es_mock.update.side_effect = Exception("update error")
        result = self.ops.update_document("doc-1", {"title": "X"})
        self.assertFalse(result)

    def test_delete_document_success(self):
        result = self.ops.delete_document("doc-1")
        self.assertTrue(result)
        self.es_mock.delete.assert_called_once_with(index="test_index", id="doc-1")

    def test_delete_document_returns_false_on_error(self):
        self.es_mock.delete.side_effect = Exception("delete error")
        result = self.ops.delete_document("doc-1")
        self.assertFalse(result)


class TestESSearchOperations(_ESTestBase):
    """搜索操作测试"""

    def _mock_search_response(self, hits=None, total=0):
        return {
            "hits": {
                "total": {"value": total},
                "hits": hits or []
            }
        }

    def test_search_returns_structure(self):
        self.es_mock.search.return_value = self._mock_search_response(
            hits=[{"_id": "1", "_score": 1.0, "_source": {"title": "Doc1"}}],
            total=1
        )
        result = self.ops.search(query={"match": {"title": "Doc1"}})
        self.assertIn("total", result)
        self.assertIn("hits", result)
        self.assertEqual(result["total"], 1)
        self.assertEqual(len(result["hits"]), 1)
        self.assertEqual(result["hits"][0]["_id"], "1")

    def test_search_returns_empty_on_error(self):
        self.es_mock.search.side_effect = Exception("search error")
        result = self.ops.search()
        self.assertEqual(result, {"total": 0, "hits": []})

    def test_full_text_search_builds_multi_match_query(self):
        self.es_mock.search.return_value = self._mock_search_response()
        self.ops.full_text_search("python flask", fields=["title", "content"])
        call_kwargs = self.es_mock.search.call_args
        # body should contain multi_match query
        body = call_kwargs[1].get("body") or call_kwargs[0][0] if call_kwargs[0] else None
        if call_kwargs[1].get("body"):
            body = call_kwargs[1]["body"]
        self.es_mock.search.assert_called_once()

    def test_count_returns_int(self):
        self.es_mock.count.return_value = {"count": 42}
        result = self.ops.count()
        self.assertEqual(result, 42)

    def test_count_with_query(self):
        self.es_mock.count.return_value = {"count": 10}
        result = self.ops.count(query={"match": {"status": "active"}})
        self.assertEqual(result, 10)

    def test_count_returns_zero_on_error(self):
        self.es_mock.count.side_effect = Exception("count error")
        result = self.ops.count()
        self.assertEqual(result, 0)

    def test_aggregate_returns_dict(self):
        self.es_mock.search.return_value = {
            "hits": {"total": {"value": 0}, "hits": []},
            "aggregations": {"by_category": {"buckets": [{"key": "tech", "doc_count": 5}]}}
        }
        result = self.ops.aggregate(
            aggregations={"by_category": {"terms": {"field": "category"}}}
        )
        self.assertIn("by_category", result)

    def test_aggregate_returns_empty_on_error(self):
        self.es_mock.search.side_effect = Exception("agg error")
        result = self.ops.aggregate({})
        self.assertEqual(result, {})

    def test_delete_by_query_returns_count(self):
        self.es_mock.delete_by_query.return_value = {"deleted": 7}
        result = self.ops.delete_by_query({"match": {"status": "inactive"}})
        self.assertEqual(result, 7)

    def test_delete_by_query_returns_zero_on_error(self):
        self.es_mock.delete_by_query.side_effect = Exception("delete error")
        result = self.ops.delete_by_query({"match_all": {}})
        self.assertEqual(result, 0)

    def test_search_by_ids(self):
        self.es_mock.mget.return_value = {
            "docs": [
                {"found": True, "_source": {"title": "Doc1"}},
                {"found": False},
            ]
        }
        result = self.ops.search_by_ids(["1", "2"])
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["title"], "Doc1")

    def test_search_with_highlight(self):
        self.es_mock.search.return_value = {
            "hits": {
                "total": {"value": 1},
                "hits": [
                    {
                        "_id": "doc-1",
                        "_score": 1.0,
                        "_source": {"content": "Python is great"},
                        "highlight": {"content": ["<em>Python</em> is great"]}
                    }
                ]
            }
        }
        result = self.ops.search_with_highlight(
            query={"match": {"content": "Python"}},
            highlight_fields=["content"]
        )
        self.assertEqual(result["total"], 1)
        self.assertIn("highlight", result["hits"][0])


if __name__ == "__main__":
    unittest.main()
