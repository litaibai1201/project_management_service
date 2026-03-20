# Elasticsearch 使用指南

Elasticsearch 是基于 Lucene 的分布式搜索和分析引擎，本框架集成了 `ESOperations`，提供索引管理、文档 CRUD、全文搜索和聚合分析能力。

---

## 1. 核心概念

| 概念 | 类比关系型数据库 | 说明 |
|------|----------------|------|
| **Index（索引）** | Database | 文档的集合，类似数据库 |
| **Document（文档）** | Row | 一条数据记录，JSON 格式 |
| **Field（字段）** | Column | 文档的属性 |
| **Mapping（映射）** | Schema | 定义字段类型和分析器 |
| **Query DSL** | SQL | JSON 格式的查询语言 |
| **Aggregation** | GROUP BY + 聚合函数 | 统计分析 |

### 适用场景

- 全文搜索：文章、商品、文档内容搜索
- 日志分析：ELK Stack（Elasticsearch + Logstash + Kibana）
- 数据分析：实时统计、聚合分析
- 推荐系统：相似文档推荐
- 地理位置搜索：附近的人、店铺

### 不适用场景

- 事务处理（ACID）→ 用 MySQL
- 频繁更新的结构化数据 → 用 MySQL
- 简单键值存储 → 用 Redis

---

## 2. 快速开始

### 2.1 配置

```bash
ES_HOSTS=http://127.0.0.1:9200
ES_USERNAME=elastic
ES_PASSWORD=changeme
# 或使用 API Key 认证（与用户名密码二选一）
ES_API_KEY=your-api-key-here
ES_VERIFY_CERTS=true
ES_TIMEOUT=30
ES_MAX_RETRIES=3
ES_RETRY_ON_TIMEOUT=true
```

### 2.2 在 Flask 中初始化

```python
# app.py（按需启用）
from dbs.elasticsearch_db import es_client
es_client.init_app(app)
```

### 2.3 导入模块

```python
from dbs.elasticsearch_db import ESOperations
```

---

## 3. 索引管理

### 3.1 创建索引

```python
from dbs.elasticsearch_db import ESOperations

ops = ESOperations("articles")

ops.create_index(
    mappings={
        "properties": {
            "title": {
                "type": "text",
                "fields": {"keyword": {"type": "keyword"}}  # 同时支持全文搜索和精确匹配
            },
            "content": {"type": "text"},
            "category": {"type": "keyword"},   # 精确匹配、聚合
            "tags": {"type": "keyword"},        # 数组、聚合
            "price": {"type": "float"},         # 数值范围查询
            "created_at": {"type": "date"},     # 日期范围查询
            "location": {"type": "geo_point"}   # 地理位置
        }
    },
    settings={
        "number_of_shards": 3,       # 主分片数（创建后不可修改）
        "number_of_replicas": 1,     # 副本数
        "refresh_interval": "1s"
    }
)
```

### 3.2 其他索引操作

```python
# 检查是否存在
if ops.index_exists():
    print("索引已存在")

# 获取映射定义
mapping = ops.get_mapping()

# 新增字段映射（不可修改已有字段类型）
ops.put_mapping({"new_field": {"type": "keyword"}})

# 删除索引（谨慎！数据不可恢复）
ops.delete_index()
```

---

## 4. 文档操作

### 4.1 索引文档（创建/替换）

```python
# 索引单个文档
doc_id = ops.index_document(
    doc_id="1",
    body={
        "title": "iPhone 15 Pro",
        "description": "Apple 最新款手机",
        "price": 7999.0,
        "category": "手机",
        "tags": ["apple", "iphone"],
        "created_at": "2024-01-15T10:30:00"
    }
)

# refresh=True：立即可搜索（有性能开销，测试时使用）
ops.index_document(doc_id="2", body={...}, refresh=True)
```

### 4.2 批量索引

```python
documents = [
    {"id": "1", "name": "产品1", "price": 100},
    {"id": "2", "name": "产品2", "price": 200},
    {"id": "3", "name": "产品3", "price": 300},
]
result = ops.bulk_index(documents, id_field="id")
# result: {"success": 3, "failed": 0}
```

### 4.3 查询、更新、删除文档

```python
# 获取单个文档（返回 _source 内容）
doc = ops.get_document("1")

# 批量获取
docs = ops.search_by_ids(["1", "2", "3"])

# 部分更新（只修改提供的字段）
ops.update_document(doc_id="1", body={"price": 7499.0}, partial=True)

# 完整替换
ops.update_document(doc_id="1", body={...}, partial=False)

# 删除单个文档
ops.delete_document("1")

# 按条件批量删除
deleted_count = ops.delete_by_query(
    query={"range": {"created_at": {"lt": "2024-01-01"}}}
)

# 统计文档数量
total = ops.count(query={"term": {"category": "手机"}})
```

---

## 5. 搜索

### 5.1 全文搜索

```python
# 全文搜索（简便方法）
results = ops.full_text_search(
    "苹果手机",
    fields=["title", "description"],
    size=20
)
# results: {"total": 15, "hits": [{"_id": "1", "_score": 2.5, "_source": {...}}, ...]}
```

### 5.2 DSL 查询

```python
# 精确匹配
results = ops.search(query={"term": {"category": "手机"}})

# 范围查询
results = ops.search(query={
    "range": {"price": {"gte": 5000, "lte": 10000}}
})

# 布尔组合查询
results = ops.search(
    query={
        "bool": {
            "must": [
                {"match": {"description": "手机"}},
                {"range": {"price": {"lte": 8000}}}
            ],
            "must_not": [
                {"term": {"category": "二手"}}
            ],
            "filter": [
                # filter 可缓存，不影响评分，性能优于 must
                {"term": {"status": "published"}},
                {"range": {"created_at": {"gte": "2024-01-01"}}}
            ]
        }
    },
    size=20,
    sort=[{"price": {"order": "asc"}}, {"_score": {"order": "desc"}}]
)
```

### 5.3 分页查询

```python
# 第 1 页（每页 20 条）
page_1 = ops.search(query={"match": {"category": "手机"}}, size=20, from_=0)

# 第 2 页
page_2 = ops.search(query={"match": {"category": "手机"}}, size=20, from_=20)
```

### 5.4 高亮搜索

```python
results = ops.search_with_highlight(
    query={"match": {"content": "python"}},
    highlight_fields=["content", "title"],
    size=10
)

for hit in results["hits"]:
    print(f"标题: {hit['_source']['title']}")
    if "highlight" in hit:
        # 高亮内容包含 <em>...</em> 标签
        print(f"高亮片段: {hit['highlight']['content']}")
```

### 5.5 滚动搜索（大数据量导出）

用于处理超过 10000 条的大量数据（深分页性能差，应使用滚动搜索）：

```python
total = 0
for doc in ops.scroll_search(query={"match_all": {}}, size=1000):
    # 每次 yield 一条文档的 _source
    process(doc)
    total += 1

print(f"处理了 {total} 条文档")
```

---

## 6. 聚合统计

### 6.1 基础聚合

```python
# 按分类统计数量
result = ops.aggregate(
    aggregations={
        "category_count": {
            "terms": {"field": "category", "size": 10}
        }
    }
)
for bucket in result["category_count"]["buckets"]:
    print(f"{bucket['key']}: {bucket['doc_count']}")

# 价格统计（平均/最大/最小）
result = ops.aggregate(
    aggregations={"price_stats": {"stats": {"field": "price"}}}
)
```

### 6.2 嵌套聚合

```python
# 按分类聚合，同时计算每类的平均价格
result = ops.aggregate(
    aggregations={
        "by_category": {
            "terms": {"field": "category"},
            "aggs": {
                "avg_price": {"avg": {"field": "price"}},
                "max_price": {"max": {"field": "price"}}
            }
        }
    }
)

# 价格区间分布
result = ops.aggregate(
    aggregations={
        "price_ranges": {
            "range": {
                "field": "price",
                "ranges": [
                    {"to": 1000},
                    {"from": 1000, "to": 5000},
                    {"from": 5000}
                ]
            }
        }
    }
)
```

### 6.3 带查询条件的聚合

```python
# 只统计已发布的文章的热门标签
result = ops.aggregate(
    aggregations={
        "hot_tags": {"terms": {"field": "tags", "size": 20}}
    },
    query={"term": {"status": "published"}}
)
```

---

## 7. 高级功能

### 7.1 模糊搜索（拼写容错）

```python
results = ops.search(query={
    "fuzzy": {
        "name": {"value": "iphon", "fuzziness": "AUTO"}  # 容忍拼写错误
    }
})
```

### 7.2 地理位置搜索

```python
# 查找 5km 范围内的商家
results = ops.search(query={
    "geo_distance": {
        "distance": "5km",
        "location": {"lat": 39.9042, "lon": 116.4074}
    }
})
```

### 7.3 多字段权重搜索

```python
results = ops.search(query={
    "multi_match": {
        "query": "Python 教程",
        "fields": ["title^3", "content"],  # title 权重是 content 的 3 倍
        "type": "best_fields"
    }
})
```

---

## 8. 在 MVC 中集成

### Model 层

```python
# models/article_es_model.py
from typing import Dict, List, Optional
from dbs.elasticsearch_db import ESOperations

class ArticleESModel:
    def __init__(self):
        self.ops = ESOperations("articles")

    def index_article(self, article_id: str, data: Dict) -> str:
        return self.ops.index_document(doc_id=article_id, body=data)

    def search_articles(self, keyword: str, category: Optional[str] = None,
                        page: int = 1, page_size: int = 20) -> Dict:
        must = [{"multi_match": {"query": keyword, "fields": ["title^3", "content"]}}]
        if category:
            must.append({"term": {"category": category}})

        return self.ops.search(
            query={"bool": {"must": must}},
            size=page_size,
            from_=(page - 1) * page_size,
            sort=[{"_score": {"order": "desc"}}]
        )

    def get_hot_tags(self, size: int = 20) -> List[Dict]:
        result = self.ops.aggregate(
            aggregations={"hot_tags": {"terms": {"field": "tags", "size": size}}}
        )
        return [
            {"tag": b["key"], "count": b["doc_count"]}
            for b in result.get("hot_tags", {}).get("buckets", [])
        ]
```

### View 层

```python
# views/search_api.py
from flask.views import MethodView
from flask_smorest import Blueprint
from models.article_es_model import ArticleESModel
from utils.response import response_result

blp = Blueprint("search", __name__, description="搜索接口")

@blp.route("/articles")
class ArticleSearchApi(MethodView):
    def __init__(self):
        self.model = ArticleESModel()

    def get(self):
        """搜索文章（Query 参数: q, category, page, page_size）"""
        keyword = request.args.get("q", "")
        category = request.args.get("category")
        page = int(request.args.get("page", 1))
        page_size = int(request.args.get("page_size", 20))

        results = self.model.search_articles(keyword, category, page, page_size)
        return response_result(content=results)

@blp.route("/tags/hot")
class HotTagsApi(MethodView):
    def __init__(self):
        self.model = ArticleESModel()

    def get(self):
        tags = self.model.get_hot_tags()
        return response_result(content={"tags": tags})
```

---

## 9. 最佳实践

1. **字段类型选择**：需要全文搜索用 `text`；需要精确匹配/聚合用 `keyword`；数值用 `float`/`integer`；日期用 `date`；不要把应该用 `keyword` 的字段定义为 `text`（会分词，导致聚合结果错误）

2. **合理设置分片数**：分片数创建后不可修改（需要 reindex），初始估算：
   - 小索引（<50GB）：1 个主分片
   - 中型索引（50-200GB）：3 个主分片
   - 大索引（>200GB）：5 个主分片

3. **用 filter 替代 must（性能优化）**：不影响评分的过滤条件放 `filter` 而非 `must`，`filter` 结果可缓存

4. **批量操作**：批量写入用 `bulk_index()`，避免循环调用 `index_document()`

5. **避免深分页**：`from_` 超过 10000 性能急剧下降，大数据量遍历改用 `scroll_search()`

6. **数据同步策略**：ES 通常作为 MySQL 的搜索副本——写入 MySQL 后同步到 ES（用 Celery 任务异步同步），不直接以 ES 为主存储

7. **与其他数据库配合**：
   ```
   MySQL   → 用户、订单等结构化数据（ACID、事务）
   MongoDB → 半结构化数据（灵活 Schema、高并发写入）
   ES      → 全文搜索、日志分析、聚合统计
   ```
