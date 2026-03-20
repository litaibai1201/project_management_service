# -*- coding: utf-8 -*-
"""
@文件: __init__.py
@说明: Elasticsearch 搜索引擎模块
@时间: 2025-09-03

Elasticsearch 是一个分布式、RESTful 搜索和分析引擎。

使用示例:
    from dbs.elasticsearch_db import es_client, ESOperations

    # 1. 初始化 (在 app.py 中)
    es_client.init_app(app)

    # 2. 创建索引
    ops = ESOperations("articles")
    ops.create_index(
        mappings={
            "properties": {
                "title": {"type": "text"},
                "content": {"type": "text"},
                "tags": {"type": "keyword"},
                "created_at": {"type": "date"}
            }
        }
    )

    # 3. 索引文档
    ops.index_document(
        doc_id="1",
        body={
            "title": "Python 教程",
            "content": "这是一个 Python 教程",
            "tags": ["python", "tutorial"],
            "created_at": "2024-01-15T10:30:00"
        }
    )

    # 4. 全文搜索
    results = ops.full_text_search(
        "python 教程",
        fields=["title", "content"],
        size=10
    )

    # 5. 聚合统计
    agg_results = ops.aggregate(
        aggregations={
            "tags_count": {
                "terms": {"field": "tags", "size": 10}
            }
        }
    )

核心概念:
    - Index: 索引（类似数据库）
    - Document: 文档（类似表的一行）
    - Field: 字段（类似列）
    - Mapping: 映射（定义字段类型）
    - Query DSL: 查询语言（JSON 格式）
    - Aggregation: 聚合（统计分析）

适用场景:
    - 全文搜索：文章、商品、文档搜索
    - 日志分析：ELK Stack（Elasticsearch + Logstash + Kibana）
    - 数据分析：实时统计、聚合分析
    - 推荐系统：相似文档推荐
    - 监控告警：性能指标分析
"""

from .client import ElasticsearchClient, es_client
from .operations import ESOperations

__all__ = [
    "ElasticsearchClient",
    "es_client",
    "ESOperations",
]
