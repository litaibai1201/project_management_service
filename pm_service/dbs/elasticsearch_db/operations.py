# -*- coding: utf-8 -*-
"""
@文件: operations.py
@说明: Elasticsearch 操作封装
@时间: 2025-09-03

使用示例:
    from dbs.elasticsearch_db import ESOperations

    # 创建操作实例
    ops = ESOperations("my_index")

    # 索引文档
    ops.index_document(
        doc_id="1",
        body={"title": "示例文档", "content": "这是内容", "tags": ["python", "flask"]}
    )

    # 搜索文档
    results = ops.search(
        query={"match": {"content": "内容"}},
        size=10
    )

    # 全文搜索
    results = ops.full_text_search("python flask", fields=["title", "content"])
"""
from typing import Any, Dict, List, Optional, Union

try:
    from elasticsearch import Elasticsearch
    from elasticsearch.helpers import bulk, scan
    ES_AVAILABLE = True
except ImportError:
    ES_AVAILABLE = False
    Elasticsearch = None
    bulk = None
    scan = None

from .client import es_client
from loggers import logger


class ESOperations:
    """Elasticsearch 操作封装类

    提供常用的索引、搜索、聚合操作
    """

    def __init__(self, index: str):
        """初始化

        Args:
            index: 索引名称
        """
        if not ES_AVAILABLE:
            raise ImportError(
                "Elasticsearch 客户端库未安装，请运行: pip install elasticsearch"
            )

        self._index = index

    @property
    def index(self) -> str:
        """获取索引名称"""
        return self._index

    @property
    def client(self) -> Elasticsearch:
        """获取 ES 客户端"""
        return es_client.client

    # ==================== 索引管理 ====================

    def create_index(
        self,
        mappings: Optional[Dict[str, Any]] = None,
        settings: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """创建索引

        Args:
            mappings: 字段映射定义
            settings: 索引设置

        Returns:
            是否创建成功

        示例:
            ops.create_index(
                mappings={
                    "properties": {
                        "title": {"type": "text"},
                        "content": {"type": "text"},
                        "created_at": {"type": "date"},
                        "tags": {"type": "keyword"}
                    }
                },
                settings={
                    "number_of_shards": 1,
                    "number_of_replicas": 1
                }
            )
        """
        try:
            body = {}
            if mappings:
                body["mappings"] = mappings
            if settings:
                body["settings"] = settings

            self.client.indices.create(index=self._index, body=body if body else None)
            logger.info(
                "索引创建成功",
                category="business",
                event="es_index_created",
                custom={"index": self._index}
            )
            return True
        except Exception as e:
            logger.error(
                "索引创建失败",
                category="error",
                event="es_index_create_failed",
                error=e,
                custom={"index": self._index}
            )
            return False

    def delete_index(self) -> bool:
        """删除索引

        Returns:
            是否删除成功
        """
        try:
            self.client.indices.delete(index=self._index)
            logger.info(
                "索引删除成功",
                category="business",
                event="es_index_deleted",
                custom={"index": self._index}
            )
            return True
        except Exception as e:
            logger.error(
                "索引删除失败",
                category="error",
                event="es_index_delete_failed",
                error=e,
                custom={"index": self._index}
            )
            return False

    def index_exists(self) -> bool:
        """检查索引是否存在

        Returns:
            索引是否存在
        """
        try:
            return self.client.indices.exists(index=self._index)
        except Exception as e:
            logger.error("检查索引存在性失败", category="error", event="es_index_exists_failed", error=e)
            return False

    def get_mapping(self) -> Dict[str, Any]:
        """获取索引映射

        Returns:
            映射定义
        """
        try:
            return self.client.indices.get_mapping(index=self._index)
        except Exception as e:
            logger.error("获取索引映射失败", category="error", event="es_mapping_get_failed", error=e)
            return {}

    def put_mapping(self, properties: Dict[str, Any]) -> bool:
        """更新索引映射

        Args:
            properties: 字段属性定义

        Returns:
            是否更新成功
        """
        try:
            self.client.indices.put_mapping(
                index=self._index,
                body={"properties": properties}
            )
            return True
        except Exception as e:
            logger.error("更新索引映射失败", category="error", event="es_mapping_update_failed", error=e)
            return False

    # ==================== 文档操作 ====================

    def index_document(
        self,
        body: Dict[str, Any],
        doc_id: Optional[str] = None,
        refresh: bool = False,
    ) -> Optional[str]:
        """索引文档（创建或更新）

        Args:
            body: 文档内容
            doc_id: 文档 ID（可选，不提供则自动生成）
            refresh: 是否立即刷新（默认 False，批量操作时建议为 False）

        Returns:
            文档 ID

        示例:
            doc_id = ops.index_document(
                doc_id="1",
                body={
                    "title": "Python 教程",
                    "content": "这是一个 Python 教程",
                    "tags": ["python", "tutorial"]
                }
            )
        """
        try:
            result = self.client.index(
                index=self._index,
                id=doc_id,
                body=body,
                refresh=refresh
            )
            return result["_id"]
        except Exception as e:
            logger.error(
                "索引文档失败",
                category="error",
                event="es_index_document_failed",
                error=e,
                custom={"index": self._index, "doc_id": doc_id}
            )
            return None

    def get_document(self, doc_id: str) -> Optional[Dict[str, Any]]:
        """获取文档

        Args:
            doc_id: 文档 ID

        Returns:
            文档内容
        """
        try:
            result = self.client.get(index=self._index, id=doc_id)
            return result["_source"]
        except Exception as e:
            logger.warning("获取文档失败", error=e)
            return None

    def update_document(
        self,
        doc_id: str,
        body: Dict[str, Any],
        partial: bool = True,
    ) -> bool:
        """更新文档

        Args:
            doc_id: 文档 ID
            body: 更新内容
            partial: 是否部分更新（True: 只更新提供的字段，False: 替换整个文档）

        Returns:
            是否更新成功
        """
        try:
            if partial:
                self.client.update(
                    index=self._index,
                    id=doc_id,
                    body={"doc": body}
                )
            else:
                self.client.index(
                    index=self._index,
                    id=doc_id,
                    body=body
                )
            return True
        except Exception as e:
            logger.error("更新文档失败", category="error", event="es_document_update_failed", error=e)
            return False

    def delete_document(self, doc_id: str) -> bool:
        """删除文档

        Args:
            doc_id: 文档 ID

        Returns:
            是否删除成功
        """
        try:
            self.client.delete(index=self._index, id=doc_id)
            return True
        except Exception as e:
            logger.error("删除文档失败", category="error", event="es_document_delete_failed", error=e)
            return False

    def bulk_index(
        self,
        documents: List[Dict[str, Any]],
        id_field: Optional[str] = None,
    ) -> Dict[str, int]:
        """批量索引文档

        Args:
            documents: 文档列表
            id_field: 用作文档 ID 的字段名（可选）

        Returns:
            操作结果统计

        示例:
            results = ops.bulk_index([
                {"id": "1", "title": "文档1", "content": "内容1"},
                {"id": "2", "title": "文档2", "content": "内容2"},
            ], id_field="id")
        """
        try:
            actions = []
            for doc in documents:
                action = {
                    "_index": self._index,
                    "_source": doc,
                }
                if id_field and id_field in doc:
                    action["_id"] = doc[id_field]

                actions.append(action)

            success, failed = bulk(self.client, actions)

            return {
                "success": success,
                "failed": failed,
            }
        except Exception as e:
            logger.error("批量索引失败", category="error", event="es_bulk_index_failed", error=e)
            return {"success": 0, "failed": len(documents)}

    # ==================== 搜索操作 ====================

    def search(
        self,
        query: Optional[Dict[str, Any]] = None,
        size: int = 10,
        from_: int = 0,
        sort: Optional[List[Dict[str, Any]]] = None,
        source: Optional[Union[bool, List[str]]] = None,
    ) -> Dict[str, Any]:
        """搜索文档

        Args:
            query: 查询条件（DSL 格式）
            size: 返回结果数量
            from_: 起始位置（用于分页）
            sort: 排序规则
            source: 返回的字段（True: 全部, False: 不返回, List: 指定字段）

        Returns:
            搜索结果

        示例:
            results = ops.search(
                query={"match": {"content": "python"}},
                size=10,
                sort=[{"created_at": {"order": "desc"}}]
            )
        """
        try:
            body = {}
            if query:
                body["query"] = query
            if sort:
                body["sort"] = sort

            result = self.client.search(
                index=self._index,
                body=body if body else None,
                size=size,
                from_=from_,
                _source=source
            )

            hits = result["hits"]["hits"]
            return {
                "total": result["hits"]["total"]["value"],
                "hits": [
                    {
                        "_id": hit["_id"],
                        "_score": hit.get("_score"),
                        "_source": hit.get("_source", {}),
                    }
                    for hit in hits
                ],
            }
        except Exception as e:
            logger.error("搜索失败", category="error", event="es_search_failed", error=e)
            return {"total": 0, "hits": []}

    def full_text_search(
        self,
        query_string: str,
        fields: Optional[List[str]] = None,
        size: int = 10,
        from_: int = 0,
    ) -> Dict[str, Any]:
        """全文搜索

        Args:
            query_string: 搜索关键词
            fields: 搜索的字段列表（默认搜索所有字段）
            size: 返回结果数量
            from_: 起始位置

        Returns:
            搜索结果

        示例:
            results = ops.full_text_search(
                "python flask",
                fields=["title", "content"],
                size=20
            )
        """
        query = {
            "multi_match": {
                "query": query_string,
                "fields": fields or ["*"],
            }
        }

        return self.search(query=query, size=size, from_=from_)

    def search_by_ids(self, ids: List[str]) -> List[Dict[str, Any]]:
        """根据 ID 列表批量获取文档

        Args:
            ids: 文档 ID 列表

        Returns:
            文档列表
        """
        try:
            result = self.client.mget(index=self._index, body={"ids": ids})
            return [
                doc["_source"]
                for doc in result["docs"]
                if doc.get("found")
            ]
        except Exception as e:
            logger.error("批量获取文档失败", category="error", event="es_documents_get_failed", error=e)
            return []

    def scroll_search(
        self,
        query: Optional[Dict[str, Any]] = None,
        scroll: str = "2m",
        size: int = 1000,
    ):
        """滚动搜索（用于大量数据）

        Args:
            query: 查询条件
            scroll: 滚动窗口时间
            size: 每批返回数量

        Yields:
            文档批次

        示例:
            for batch in ops.scroll_search(query={"match_all": {}}):
                for doc in batch:
                    process(doc)
        """
        try:
            body = {"query": query or {"match_all": {}}}

            for hit in scan(
                self.client,
                index=self._index,
                query=body,
                scroll=scroll,
                size=size,
            ):
                yield hit["_source"]
        except Exception as e:
            logger.error("滚动搜索失败", category="error", event="es_scroll_search_failed", error=e)

    # ==================== 聚合操作 ====================

    def aggregate(
        self,
        aggregations: Dict[str, Any],
        query: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """聚合查询

        Args:
            aggregations: 聚合定义
            query: 查询条件（可选）

        Returns:
            聚合结果

        示例:
            # 按标签统计文档数量
            results = ops.aggregate(
                aggregations={
                    "tags_count": {
                        "terms": {
                            "field": "tags",
                            "size": 10
                        }
                    }
                }
            )
        """
        try:
            body = {"aggs": aggregations}
            if query:
                body["query"] = query

            result = self.client.search(
                index=self._index,
                body=body,
                size=0  # 不返回文档，只返回聚合结果
            )

            return result.get("aggregations", {})
        except Exception as e:
            logger.error("聚合查询失败", category="error", event="es_aggregate_failed", error=e)
            return {}

    def count(self, query: Optional[Dict[str, Any]] = None) -> int:
        """统计文档数量

        Args:
            query: 查询条件

        Returns:
            文档数量
        """
        try:
            body = {"query": query} if query else None
            result = self.client.count(index=self._index, body=body)
            return result["count"]
        except Exception as e:
            logger.error("统计文档数量失败", category="error", event="es_count_failed", error=e)
            return 0

    # ==================== 批量删除 ====================

    def delete_by_query(self, query: Dict[str, Any]) -> int:
        """根据查询条件删除文档

        Args:
            query: 查询条件

        Returns:
            删除的文档数量

        示例:
            deleted = ops.delete_by_query(
                query={"range": {"created_at": {"lt": "2024-01-01"}}}
            )
        """
        try:
            result = self.client.delete_by_query(
                index=self._index,
                body={"query": query}
            )
            return result.get("deleted", 0)
        except Exception as e:
            logger.error("批量删除失败", category="error", event="es_bulk_delete_failed", error=e)
            return 0

    # ==================== 高亮搜索 ====================

    def search_with_highlight(
        self,
        query: Dict[str, Any],
        highlight_fields: List[str],
        size: int = 10,
    ) -> Dict[str, Any]:
        """带高亮的搜索

        Args:
            query: 查询条件
            highlight_fields: 需要高亮的字段列表
            size: 返回结果数量

        Returns:
            搜索结果（包含高亮）

        示例:
            results = ops.search_with_highlight(
                query={"match": {"content": "python"}},
                highlight_fields=["content"]
            )
        """
        try:
            body = {
                "query": query,
                "highlight": {
                    "fields": {field: {} for field in highlight_fields},
                    "pre_tags": ["<em>"],
                    "post_tags": ["</em>"],
                }
            }

            result = self.client.search(
                index=self._index,
                body=body,
                size=size
            )

            hits = result["hits"]["hits"]
            return {
                "total": result["hits"]["total"]["value"],
                "hits": [
                    {
                        "_id": hit["_id"],
                        "_score": hit.get("_score"),
                        "_source": hit.get("_source", {}),
                        "highlight": hit.get("highlight", {}),
                    }
                    for hit in hits
                ],
            }
        except Exception as e:
            logger.error("高亮搜索失败", category="error", event="es_highlight_search_failed", error=e)
            return {"total": 0, "hits": []}


__all__ = ["ESOperations"]
