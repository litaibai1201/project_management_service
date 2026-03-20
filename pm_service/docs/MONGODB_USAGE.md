# MongoDB 使用指南

MongoDB 是文档型数据库，本框架集成了 `MongoOperations`（基础 CRUD）和 `EnhancedMongoOperations`（事务、软删除、审计、批量写）两个操作类。

---

## 1. 核心概念

| 概念 | 说明 |
|------|------|
| **Collection（集合）** | 类似关系型数据库的表，存储文档 |
| **Document（文档）** | 类似一行记录，以 BSON 格式存储 |
| **_id** | 文档唯一标识，框架自动转为字符串返回 |
| **软删除** | 给文档添加 `deleted_at` 字段，不物理删除，查询时自动过滤 |
| **审计字段** | 自动维护 `created_at`、`created_by`、`updated_at`、`updated_by` |

与 MySQL 的主要区别：

| 特性 | MySQL (SQLAlchemy) | MongoDB |
|------|-------------------|---------|
| 字段定义 | 必须预定义 Column | 无需预定义（Schema-less） |
| 事务 | 原生支持 | 4.0+ 支持（需副本集） |
| 软删除 | 需手动实现 | `EnhancedMongoOperations` 内置 |
| 审计字段 | `BaseMixinModel` | `EnhancedMongoOperations` 内置 |
| 分页 | `limit/offset` | `find_page()` |
| 聚合 | SQL 聚合函数 | Aggregation Pipeline |

---

## 2. 快速开始

### 2.1 配置

```bash
MONGO_URI=mongodb://127.0.0.1:27017
MONGO_DATABASE=test
MONGO_MAX_POOL_SIZE=100
MONGO_MIN_POOL_SIZE=10
MONGO_CONNECT_TIMEOUT=5000
MONGO_SERVER_SELECTION_TIMEOUT=5000
```

### 2.2 在 Flask 中初始化

```python
# app.py（按需启用）
from dbs.mongo_db import mongo_client
mongo_client.init_app(app)
```

### 2.3 导入模块

```python
from dbs.mongo_db import MongoOperations           # 基础操作
from dbs.mongo_db import EnhancedMongoOperations   # 增强操作（事务/软删除/审计）
```

---

## 3. 基础操作（MongoOperations）

### 3.1 插入

```python
from dbs.mongo_db import MongoOperations

users = MongoOperations("users")

# 插入单条，返回 _id 字符串
user_id = users.insert_one({"work_no": "E001", "username": "张三", "age": 25})

# 批量插入，返回 _id 列表
ids = users.insert_many([
    {"work_no": "E002", "username": "李四"},
    {"work_no": "E003", "username": "王五"},
])
```

### 3.2 查询

```python
# 查询单条
user = users.find_one({"work_no": "E001"})

# 根据 _id 查询
user = users.find_by_id("64a1b2c3d4e5f6789abcdef0")

# 查询多条（带排序、分页）
result = users.find(
    filter={"age": {"$gte": 18}},
    sort=[("created_at", -1)],
    skip=0,
    limit=20
)

# 分页查询（推荐）
page_result = users.find_page(
    filter={"age": {"$gte": 18}},
    page=1,
    page_size=20,
    sort=[("created_at", -1)]
)
# 返回: {"items": [...], "total": 100, "page": 1, "page_size": 20, "total_pages": 5}

# 统计
count = users.count({"age": {"$gte": 18}})

# 检查是否存在
exists = users.exists({"work_no": "E001"})

# 去重查询
departments = users.distinct("department", {"status": 1})
```

### 3.3 更新

```python
# 更新单条，返回修改条数
count = users.update_one(
    {"work_no": "E001"},
    {"$set": {"age": 26}}
)

# 根据 _id 更新
users.update_by_id("64a1b2c3...", {"$set": {"age": 26}})

# 批量更新
users.update_many({"age": {"$lt": 18}}, {"$set": {"status": 0}})

# upsert（不存在则插入）
users.update_one({"work_no": "E999"}, {"$set": {"username": "新人"}}, upsert=True)
```

### 3.4 删除

```python
# 删除单条
users.delete_one({"work_no": "E001"})

# 根据 _id 删除
users.delete_by_id("64a1b2c3...")

# 批量删除
users.delete_many({"status": 0})
```

### 3.5 聚合

```python
pipeline = [
    {"$match": {"status": 1}},
    {"$group": {"_id": "$department", "count": {"$sum": 1}}},
    {"$sort": {"count": -1}}
]
result = users.aggregate(pipeline)
```

### 3.6 索引管理

```python
# 唯一索引
users.create_index("work_no", unique=True)

# 复合索引
users.create_index([("department", 1), ("created_at", -1)])

# TTL 索引（30 天后自动过期）
logs = MongoOperations("logs")
logs.create_index("created_at", expireAfterSeconds=86400 * 30)

# 查看所有索引
users.list_indexes()

# 删除索引
users.drop_index("work_no_1")
```

---

## 4. 增强操作（EnhancedMongoOperations）

`EnhancedMongoOperations` 继承自 `MongoOperations`，新增事务、软删除、审计字段和批量写功能，通过构造参数开关：

```python
from dbs.mongo_db import EnhancedMongoOperations

ops = EnhancedMongoOperations(
    "users",
    enable_soft_delete=True,   # 启用软删除
    enable_audit=True,         # 启用审计字段
    schema=UserSchema          # Pydantic 验证（可选）
)
```

### 4.1 多文档事务

适用于多个集合操作需要保证原子性的场景。

> **注意**：需要 MongoDB 4.0+ 和副本集或分片集群。

```python
users = EnhancedMongoOperations("users")
logs  = EnhancedMongoOperations("operation_logs")

with users.transaction() as session:
    # 插入用户
    user_id = users.insert_one(
        {"work_no": "E001", "username": "张三"},
        operator="admin",
        session=session
    )
    # 插入操作日志
    logs.insert_one(
        {"user_id": user_id, "action": "CREATE", "detail": "创建用户"},
        session=session
    )
    # with 块正常退出 → 自动提交；任意异常 → 自动回滚
```

### 4.2 软删除

```python
users = EnhancedMongoOperations("users", enable_soft_delete=True)

# 软删除（添加 deleted_at 字段，不物理删除）
users.soft_delete_one({"work_no": "E001"}, operator="admin")

# 查询时自动过滤已删除数据
active_users = users.find({})

# 包含已删除数据
all_users = users.find({}, include_deleted=True)

# 恢复已删除数据
users.restore_one({"work_no": "E001"})
```

### 4.3 审计字段自动填充

启用 `enable_audit=True` 后，`insert_one` 和 `update_one` 自动维护时间和操作人字段：

```python
users = EnhancedMongoOperations("users", enable_audit=True)

# 插入后文档自动包含：
# created_at, created_by, updated_at, updated_by
users.insert_one(
    {"work_no": "E001", "username": "张三"},
    operator="admin"
)

# 更新后自动刷新 updated_at、updated_by
users.update_one(
    {"work_no": "E001"},
    {"$set": {"age": 26}},
    operator="manager"
)
```

### 4.4 Pydantic 数据验证

```python
from pydantic import BaseModel, Field

class UserSchema(BaseModel):
    work_no: str = Field(..., min_length=3, max_length=10)
    username: str = Field(..., min_length=2)
    age: int = Field(ge=18, le=100)

users = EnhancedMongoOperations("users", schema=UserSchema)

# 插入时自动验证，验证失败抛出 ValidationError
users.insert_one({"work_no": "E001", "username": "张三", "age": 25})
```

### 4.5 批量写操作

```python
from pymongo import InsertOne, UpdateOne, DeleteOne

# 原生批量写（混合操作）
operations = [
    InsertOne({"work_no": "E001", "username": "张三"}),
    UpdateOne({"work_no": "E002"}, {"$set": {"age": 26}}),
    DeleteOne({"work_no": "E003"}),
]
result = ops.bulk_write(operations)
# result: {"inserted_count": 1, "modified_count": 1, "deleted_count": 1, "upserted_count": 0}

# 便捷批量插入
ops.bulk_insert([
    {"work_no": "E001", "username": "张三"},
    {"work_no": "E002", "username": "李四"},
])

# 便捷批量更新
ops.bulk_update([
    ({"work_no": "E001"}, {"$set": {"age": 25}}),
    ({"work_no": "E002"}, {"$set": {"age": 30}}),
])

# 便捷批量删除
ops.bulk_delete([
    {"work_no": "E001"},
    {"work_no": "E002"},
])
```

---

## 5. 在 MVC 中集成

### Model 层

```python
# models/user_mongo_model.py
from typing import Dict, Optional
from dbs.mongo_db import EnhancedMongoOperations
from pydantic import BaseModel, Field

class UserSchema(BaseModel):
    work_no: str = Field(..., min_length=3)
    username: str = Field(..., min_length=2)

class UserMongoModel:
    def __init__(self):
        self.ops = EnhancedMongoOperations(
            "users",
            enable_soft_delete=True,
            enable_audit=True,
            schema=UserSchema
        )

    def create(self, data: Dict, operator: str = "system") -> str:
        return self.ops.insert_one(data, operator=operator)

    def get_by_work_no(self, work_no: str) -> Optional[Dict]:
        return self.ops.find_one({"work_no": work_no})

    def list_page(self, page: int = 1, page_size: int = 20) -> Dict:
        return self.ops.find_page(filter={}, page=page, page_size=page_size, sort=[("created_at", -1)])

    def update(self, work_no: str, data: Dict, operator: str = "system") -> int:
        return self.ops.update_one({"work_no": work_no}, {"$set": data}, operator=operator)

    def delete(self, work_no: str, operator: str = "system") -> int:
        return self.ops.soft_delete_one({"work_no": work_no}, operator=operator)
```

### Controller 层

```python
# controllers/user_mongo_controller.py
from models.user_mongo_model import UserMongoModel
from utils.exceptions import ResourceNotFoundException, ResourceExistsException

class UserMongoController:
    def __init__(self):
        self.model = UserMongoModel()

    def create_user(self, data: Dict) -> str:
        if self.model.get_by_work_no(data["work_no"]):
            raise ResourceExistsException(resource_type="用户")
        return self.model.create(data)

    def get_user(self, work_no: str) -> Dict:
        user = self.model.get_by_work_no(work_no)
        if not user:
            raise ResourceNotFoundException(resource_type="用户")
        return user
```

### View 层

```python
# views/user_mongo_api.py
from flask.views import MethodView
from flask_smorest import Blueprint
from controllers.user_mongo_controller import UserMongoController
from utils.response import response_result

blp = Blueprint("mongo_user", __name__, description="用户管理（MongoDB）")

@blp.route("/users")
class UserApi(MethodView):
    def __init__(self):
        self.controller = UserMongoController()

    def get(self):
        page = int(request.args.get("page", 1))
        data = self.controller.model.list_page(page)
        return response_result(content=data)

    @jwt_required()
    def post(self):
        user_id = self.controller.create_user(request.get_json())
        return response_result(content={"id": user_id}, msg="创建成功")
```

---

## 6. 最佳实践

1. **场景选择**：简单 CRUD 用 `MongoOperations`；需要事务/软删除/审计用 `EnhancedMongoOperations`
2. **批量操作**：大量数据用 `insert_many` 或 `bulk_insert`，避免循环单条插入
3. **事务范围**：单文档操作无需事务（MongoDB 原生保证原子性）；跨集合操作才使用事务
4. **合理建索引**：高频查询字段建索引，避免全表扫描；高基数字段（如用户 ID）不要用作 Tag
5. **TTL 索引清理日志**：日志类集合使用 TTL 索引自动过期，避免手动定期删除
6. **MongoDB vs MySQL**：结构化数据、复杂事务用 MySQL；半结构化数据、灵活 Schema、高并发写入用 MongoDB
