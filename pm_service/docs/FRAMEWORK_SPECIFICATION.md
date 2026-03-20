# Flask 标准化框架规范文档

> **文档用途：** 本文档定义了一套完整的 Flask 项目开发规范，供 AI 辅助工具（如 Claude、GPT 等）阅读，用于理解框架设计理念、代码风格和最佳实践，从而帮助重构和优化现有项目代码。

**版本：** 2.0
**更新日期：** 2026-03

---

## 目录

1. [框架设计理念](#框架设计理念)
2. [项目目录结构规范](#项目目录结构规范)
3. [代码风格规范](#代码风格规范)
4. [模块职责与规范](#模块职责与规范)
5. [设计模式与架构](#设计模式与架构)
6. [完整代码示例](#完整代码示例)
7. [最佳实践指南](#最佳实践指南)

---

## 框架设计理念

### 核心原则

1. **分层清晰** - 严格的 MVC 分层，职责明确
2. **高内聚低耦合** - 模块独立，接口简洁
3. **可扩展性** - 易于添加新功能和模块
4. **标准化** - 统一的代码风格和项目结构
5. **生产就绪** - 包含日志、监控、错误处理等生产级特性

### 设计哲学

- **约定优于配置** - 遵循统一的命名和组织约定
- **依赖注入** - 使用 `init_app()` 模式初始化扩展
- **工厂模式** - 使用 `create_app()` 创建应用实例
- **蓝图架构** - 使用 Flask-Smorest Blueprint 组织路由
- **环境隔离** - 使用 .env 管理环境变量，支持 dev/prd 双环境配置
- **统一响应** - 所有接口返回 `{"code": "S10000", "msg": "OK", "content": ...}` 格式
- **统一异常** - 业务异常通过 `APIException` 子类抛出，全局错误处理器捕获

---

## 项目目录结构规范

### 标准目录结构

```
app_project/
├── app.py                      # 应用入口文件（工厂函数）
├── .env                        # 环境变量（不提交到 Git）
├── .env.example                # 环境变量示例
├── requirements.txt            # Python 依赖
├── README.md                   # 项目说明
│
├── configs/                    # 配置模块
│   ├── __init__.py            # 导出 config 字典（dev/prd）
│   ├── base.py                # 基础配置类（所有配置项定义在此）
│   ├── development.py         # 开发环境配置（DEBUG=True）
│   └── production.py          # 生产环境配置（DEBUG=False）
│
├── models/                     # 数据模型层（ORM 模型）
│   ├── __init__.py            # 导出所有模型
│   └── xxx_model.py           # 业务模型（继承 BaseMixinModel）
│
├── serializes/                 # 序列化模式层（Marshmallow Schema）
│   ├── __init__.py
│   ├── xxx_serialize.py       # 业务请求/响应 Schema
│   ├── model_serialize.py     # ORM 模型序列化 Schema
│   └── response_serialize.py  # 统一响应 Schema（RspMsgDictSchema 等）
│
├── views/                      # 视图层（API 路由定义）
│   ├── __init__.py
│   └── xxx_api.py             # 业务 API（使用 flask-smorest Blueprint）
│
├── controllers/                # 控制器层（业务逻辑）
│   ├── __init__.py
│   └── xxx_controller.py      # 业务控制器（类形式）
│
├── utils/                      # 工具函数模块
│   ├── auth.py                # JWT 认证（create_token/jwt_required/get_identity）
│   ├── error_handler.py       # 全局错误处理器注册
│   ├── exceptions.py          # 业务异常类定义（APIException 子类）
│   ├── response.py            # 统一响应构造（response_result/fail_response_result）
│   ├── tools.py               # 通用工具函数
│   ├── cache_decorator.py     # @cache_result 缓存装饰器
│   ├── rate_limit.py          # 限流配置
│   ├── api_docs_enhanced.py   # API 文档增强
│   ├── s3_client.py           # S3 客户端
│   ├── minio_client.py        # MinIO 客户端
│   ├── ftp_client.py          # FTP 客户端
│   ├── ini_file.py            # INI 文件处理
│   └── zip_file.py            # ZIP 文件处理
│
├── dbs/                        # 数据库模块
│   ├── mysql_db/              # MySQL（SQLAlchemy）
│   │   ├── __init__.py        # 导出 db 对象
│   │   └── model_tables.py    # 数据库表模型（BaseMixinModel + 业务表）
│   ├── mongo_db/              # MongoDB
│   │   ├── client.py          # MongoClientManager
│   │   ├── operations.py      # MongoOperations（CRUD）
│   │   └── enhanced_operations.py  # 增强操作（事务/软删除/审计）
│   ├── influxdb_db/           # InfluxDB 时序数据库
│   ├── elasticsearch_db/      # Elasticsearch 搜索引擎
│   ├── oracle_db/             # Oracle 数据库
│   ├── sqlite_db/             # SQLite 数据库
│   ├── db_manager.py          # 数据库管理器
│   ├── sharding.py            # 分片策略实现
│   └── sharding_base.py       # 分片基类
│
├── cache/                      # 缓存模块
│   ├── __init__.py            # Redis 全局客户端初始化（ConnectionPool）
│   └── redis_oper.py          # OperRedis 操作封装类（所有数据结构）
│
├── queues/                     # 队列模块
│   ├── celery_queue/          # Celery 任务队列
│   │   ├── client.py          # CeleryClientManager（FlaskTask 上下文集成）
│   │   └── config.py          # Beat 定时任务配置
│   └── rabbitmq/              # RabbitMQ 消息队列
│       ├── client.py          # RabbitMQ 客户端
│       ├── producer.py        # 消息生产者
│       └── consumer.py        # 消息消费者
│
├── tasks/                      # 异步任务定义（业务任务放这里）
│   ├── __init__.py
│   └── example_tasks.py       # 示例任务（基础/重试/进度/定时/链式）
│
├── loggers/                    # 日志模块（structlog）
│   ├── __init__.py            # 导出 logger、flask_hooks，并自动 configure_logger()
│   ├── core/                  # 核心（logger.py/context.py/handlers.py/models.py）
│   ├── utils/                 # flask_hooks.py（HTTP/SQL 自动记录）、decorators.py
│   └── conf/                  # 日志配置（Python dict，支持队列处理器）
│
├── crypto/                     # 配置加密模块（Fernet 对称加密）
│   ├── __init__.py            # 导出 decrypt_env
│   ├── fernet.py              # Fernet 加密实现
│   ├── cli.py                 # 命令行工具
│   └── __main__.py            # CLI 入口（python -m crypto.cli）
│
├── urls/                       # 路由注册模块
│   ├── __init__.py            # BLUEPRINTS 列表（集中管理 URL 前缀）
│   └── api_docs.py            # API 文档工具（启动时打印蓝图信息）
│
├── tests/                      # 测试模块
│   ├── __init__.py
│   └── base_test.py           # 测试基类
│
└── docs/                       # 文档目录
    ├── FRAMEWORK_SPECIFICATION.md  # 本文档（框架规范）
    ├── API.md                 # API 接口文档
    ├── ARCHITECTURE.md        # 架构设计文档
    ├── CONFIGURATION.md       # 配置管理文档
    ├── DATABASE.md            # 数据库使用文档
    ├── DEVELOPMENT.md         # 开发指南
    ├── CELERY_USAGE.md        # Celery 使用文档
    ├── RABBITMQ_USAGE.md      # RabbitMQ 使用文档
    ├── MONGODB_USAGE.md       # MongoDB 使用文档
    ├── INFLUXDB_USAGE.md      # InfluxDB 使用文档
    └── ELASTICSEARCH_USAGE.md # Elasticsearch 使用文档
```

### 目录职责说明

| 目录 | 职责 | 允许的操作 | 禁止的操作 |
|-----|------|----------|----------|
| `models/` | 定义数据库模型（ORM 表结构） | 定义表结构、字段、`to_dict()` | 不包含业务逻辑 |
| `serializes/` | 定义序列化 Schema（Marshmallow） | 字段验证、序列化/反序列化 | 不包含数据库操作 |
| `views/` | 定义 API 路由（HTTP 请求/响应） | 路由定义、参数接收、调用 Controller | 不包含业务逻辑 |
| `controllers/` | 业务逻辑层（类形式） | 数据处理、业务规则、调用 Model/Cache | 不直接定义路由 |
| `utils/` | 工具函数和基础设施 | 纯函数、装饰器、认证、异常 | 不包含业务逻辑 |
| `dbs/` | 数据库连接管理 | 连接、配置、客户端 | 不定义业务逻辑 |
| `cache/` | 缓存管理 | Redis 连接池和操作封装 | 不包含业务逻辑 |
| `queues/` | 队列连接管理 | 队列客户端初始化、基础操作 | 不定义业务任务 |
| `tasks/` | 异步任务定义 | Celery @task 任务定义 | 不放在 queues/ 下 |
| `configs/` | 配置管理 | 配置类定义（读取环境变量） | 不包含业务代码 |

---

## 代码风格规范

### 文件命名规范

```python
# 1. Python 文件：小写 + 下划线
user_controller.py          # ✓ 正确
auth_api.py                 # ✓ 正确
userController.py           # ✗ 错误

# 2. 类名：大驼峰（PascalCase）
class UserController:       # ✓ 正确
class AuthController:       # ✓ 正确
class user_controller:      # ✗ 错误

# 3. 函数/变量：小写 + 下划线
def get_user_list():        # ✓ 正确
def getUserList():          # ✗ 错误

# 4. 常量：大写 + 下划线
MAX_PAGE_SIZE = 100         # ✓ 正确
maxPageSize = 100           # ✗ 错误
```

### 导入规范

```python
# 导入顺序：标准库 → 第三方库 → 本地模块（每组空一行）

# 1. 标准库
import os
import json
from typing import List, Dict, Optional

# 2. 第三方库
from flask import Flask, request
from flask.views import MethodView
from flask_smorest import Blueprint

# 3. 本地模块（按层级顺序）
from dbs.mysql_db import db                        # 数据库
from cache.redis_oper import OperRedis             # 缓存
from dbs.mongo_db import MongoOperations           # MongoDB
from dbs.mysql_db.model_tables import TestModel    # 模型
from serializes.test_serialize import TestSchema   # 序列化
from controllers.auth_controller import AuthController  # 控制器
from utils.auth import jwt_required, get_identity  # 认证
from utils.exceptions import ValidationException   # 异常
from utils.response import response_result         # 响应
from loggers import logger                         # 日志
```

### 正确的导入路径

```python
# ✓ 正确
from dbs.mysql_db import db                        # MySQL db 对象
from cache import redis_client                     # Redis 客户端代理
from cache.redis_oper import OperRedis             # Redis 操作封装类
from queues.celery_queue import celery_app         # Celery 应用管理器
from queues.celery_queue.client import celery_app  # 等价写法
from queues.rabbitmq.producer import RabbitMQProducer  # RabbitMQ 生产者
from dbs.mongo_db import MongoOperations           # MongoDB 操作类
from dbs.mongo_db.enhanced_operations import EnhancedMongoOperations  # MongoDB 增强操作
from loggers import logger                         # 结构化日志
from utils.response import response_result, fail_response_result  # 统一响应
from utils.exceptions import ValidationException, AuthenticationException  # 业务异常

# ✗ 错误
from app import db                                 # ✗ 不要使用
from app.models import User                        # ✗ 不要使用
from config import Config                          # ✗ 不要使用
```

### 文件头注释规范

```python
# -*- coding: utf-8 -*-
"""
@文件: user_controller.py
@说明: 用户业务逻辑控制器
@时间: 2025-09-03
"""
```

### 日志规范

```python
from loggers import logger

# ✓ 结构化日志（推荐）
logger.info("用户登录成功", user_id=user_id, username=username)
logger.warning("SQL 执行慢", db={"duration": 1.5, "statement": "SELECT ..."})
logger.error("创建用户失败", error=str(e), custom={"data": data})

# ✗ 不推荐
print("用户登录")                                    # ✗ 不要使用 print
logger.info(f"用户 {user_id} 登录成功")              # ✗ 不推荐字符串插值
```

---

## 模块职责与规范

### 1. Models 层（数据库模型）

**位置：** `dbs/mysql_db/model_tables.py`（或 `models/xxx_model.py`）

**规范：** 继承 `BaseMixinModel`，使用 UUID 主键和字符串时间戳。

```python
# dbs/mysql_db/model_tables.py
import uuid
from utils.tools import CommonTools
from dbs.mysql_db import db


def generate_uuid():
    """生成 32 位 UUID（去除横线）"""
    return uuid.uuid4().hex


class BaseMixinModel(db.Model):
    """基础混入模型 - 提供公共字段"""
    __abstract__ = True

    status = db.Column(db.Integer, default=1, comment="状态（1=正常, 0=禁用）")
    created_at = db.Column(db.String(19), default=CommonTools.get_now, nullable=False, comment="创建时间")
    update_at = db.Column(db.String(19), comment="更新时间")
    status_update_at = db.Column(db.String(19), comment="状态更新时间")


class UserModel(BaseMixinModel):
    """用户模型"""
    __tablename__ = "users"

    id = db.Column(db.String(32), primary_key=True, default=generate_uuid, comment="UUID")
    work_no = db.Column(db.String(32), nullable=False, unique=True, comment="工号")
    username = db.Column(db.String(32), nullable=False, comment="用户名")
    password = db.Column(db.String(255), nullable=False, comment="密码")

    def __repr__(self):
        return f"<UserModel(work_no={self.work_no}, username={self.username})>"

    def to_dict(self):
        """转换为字典（用于 API 响应，不包含密码等敏感信息）"""
        return {
            "id": self.id,
            "work_no": self.work_no,
            "username": self.username,
            "status": self.status,
            "created_at": self.created_at,
            "update_at": self.update_at,
        }
```

**模型层规范：**
- ✓ 继承 `BaseMixinModel`，获得公共字段
- ✓ 主键使用 `db.String(32)` + `generate_uuid`（UUID 主键）
- ✓ 时间字段使用 `db.String(19)` + `CommonTools.get_now`
- ✓ 为每个字段添加 `comment` 注释
- ✓ 提供 `to_dict()` 方法，不包含敏感字段
- ✓ 从 `dbs.mysql_db import db`
- ✗ 不在模型中包含业务逻辑
- ✗ 不在模型中执行查询以外的数据库操作

### 2. Serializes 层（序列化模式）

**位置：** `serializes/`（注意：本框架使用 `serializes` 而非 `schemas`）

**规范：** 使用 Marshmallow Schema，定义请求参数和响应格式。

```python
# serializes/user_serialize.py
from marshmallow import Schema, fields, validate


# 请求参数 Schema
class UserCreateSchema(Schema):
    """创建用户请求参数"""
    work_no = fields.String(required=True, metadata={"description": "工号"})
    username = fields.String(required=True, metadata={"description": "用户名"})
    password = fields.String(required=True, metadata={"description": "密码"})


class UserQuerySchema(Schema):
    """查询参数 Schema（分页）"""
    work_no = fields.String(metadata={"description": "工号（可选）"})
    page = fields.Integer(load_default=1, metadata={"description": "页码"})
    page_size = fields.Integer(load_default=20, metadata={"description": "每页条数"})


# serializes/response_serialize.py（框架已内置，无需修改）
from marshmallow import Schema, fields

class RspBaseSchema(Schema):
    code = fields.Str(required=True)
    msg = fields.Str(required=True)

class RspMsgDictSchema(RspBaseSchema):
    content = fields.Dict()          # content 为字典

class RspMsgListSchema(RspBaseSchema):
    content = fields.List(fields.Dict())  # content 为列表

class RspMsgSchema(RspBaseSchema):
    content = fields.Str()           # content 为字符串
```

**序列化层规范：**
- ✓ 目录名为 `serializes`（不是 `schemas`）
- ✓ 请求 Schema 和响应 Schema 分开定义
- ✓ 添加 `metadata={"description": "..."}` 用于 Swagger 文档
- ✓ 使用 `load_default` 设置默认值（不是 `missing`）
- ✓ 响应 Schema 统一使用 `RspMsgDictSchema`/`RspMsgListSchema`/`RspMsgSchema`
- ✗ 不在 Schema 中执行数据库操作

### 3. Controllers 层（业务逻辑）

**位置：** `controllers/`

**规范：** 使用类形式组织业务逻辑。Controller 负责处理业务规则，不直接接触 HTTP 请求/响应。

```python
# controllers/user_controller.py
# -*- coding: utf-8 -*-
"""
@文件: user_controller.py
@说明: 用户业务逻辑控制器
@时间: 2025-09-03
"""
from typing import Dict, List, Optional

from dbs.mysql_db import db
from dbs.mysql_db.model_tables import UserModel
from cache.redis_oper import OperRedis
from utils.exceptions import ValidationException, ResourceNotFoundException
from loggers import logger


class UserController:
    """用户控制器 - 处理用户相关业务逻辑"""

    def __init__(self):
        self.redis = OperRedis()

    def list(self, page: int = 1, page_size: int = 20, work_no: str = None) -> Dict:
        """获取用户列表（分页）

        Args:
            page: 页码
            page_size: 每页条数
            work_no: 工号过滤（可选）

        Returns:
            包含 items 和分页信息的字典
        """
        query = UserModel.query.filter_by(status=1)
        if work_no:
            query = query.filter(UserModel.work_no.like(f"%{work_no}%"))

        total = query.count()
        items = query.offset((page - 1) * page_size).limit(page_size).all()

        logger.info("查询用户列表", page=page, total=total)
        return {
            "items": [u.to_dict() for u in items],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    def get_by_work_no(self, work_no: str) -> Dict:
        """根据工号获取用户（带缓存）

        Args:
            work_no: 工号

        Returns:
            用户信息字典

        Raises:
            ResourceNotFoundException: 用户不存在
        """
        cache_key = f"user:{work_no}"

        # 尝试从缓存获取
        cached = self.redis.get(cache_key)
        if cached:
            logger.info("缓存命中", cache_key=cache_key)
            return cached

        # 查询数据库
        user = UserModel.query.filter_by(work_no=work_no, status=1).first()
        if not user:
            raise ResourceNotFoundException(resource_type="用户")

        user_dict = user.to_dict()
        self.redis.set(cache_key, user_dict, expire=300)  # 缓存 5 分钟

        logger.info("查询用户成功", work_no=work_no)
        return user_dict

    def create(self, data: Dict) -> Dict:
        """创建用户

        Args:
            data: 用户数据（已通过 Schema 校验）

        Returns:
            创建的用户信息

        Raises:
            ValidationException: 工号已存在
        """
        # 检查重复
        if UserModel.query.filter_by(work_no=data["work_no"]).first():
            raise ValidationException(
                msg="工号已存在",
                content={"field": "work_no", "value": data["work_no"]}
            )

        try:
            user = UserModel(**data)
            db.session.add(user)
            db.session.commit()
            logger.info("用户创建成功", work_no=data["work_no"])
            return user.to_dict()
        except Exception as e:
            db.session.rollback()
            logger.error("创建用户失败", error=str(e), custom={"data": data})
            raise

    def update(self, work_no: str, update_data: Dict) -> None:
        """更新用户信息"""
        user = UserModel.query.filter_by(work_no=work_no, status=1).first()
        if not user:
            raise ResourceNotFoundException(resource_type="用户")

        try:
            for key, value in update_data.items():
                if hasattr(user, key):
                    setattr(user, key, value)
            db.session.commit()

            # 清除缓存
            self.redis.delete(f"user:{work_no}")
            logger.info("用户更新成功", work_no=work_no)
        except Exception as e:
            db.session.rollback()
            logger.error("更新用户失败", error=str(e))
            raise

    def delete(self, work_no: str) -> None:
        """删除用户（软删除：设置 status=0）"""
        user = UserModel.query.filter_by(work_no=work_no, status=1).first()
        if not user:
            raise ResourceNotFoundException(resource_type="用户")

        try:
            user.status = 0
            db.session.commit()
            self.redis.delete(f"user:{work_no}")
            logger.info("用户删除成功", work_no=work_no)
        except Exception as e:
            db.session.rollback()
            logger.error("删除用户失败", error=str(e))
            raise
```

**控制器层规范：**
- ✓ 使用类形式（`class XxxController`）
- ✓ 构造函数中初始化依赖（`self.redis = OperRedis()`）
- ✓ 使用类型注解（Type Hints）
- ✓ 完善的异常处理：业务异常抛 `APIException` 子类，系统异常记录日志后 `raise`
- ✓ 数据库操作必须有 `commit/rollback` 对
- ✓ 更新/删除后清除相关缓存
- ✓ 返回纯数据（dict/list），不返回 ORM 对象
- ✓ 使用结构化日志
- ✗ 不直接处理 HTTP 请求/响应
- ✗ 不定义路由

### 4. Views 层（API 路由）

**位置：** `views/`

**规范：** 使用 `flask-smorest` 的 `Blueprint` + `MethodView`，所有接口返回 `response_result()`。

```python
# views/user_api.py
# -*- coding: utf-8 -*-
"""
@文件: user_api.py
@说明: 用户管理接口
@时间: 2025-09-03
"""
from flask import request
from flask.views import MethodView
from flask_smorest import Blueprint

from utils.response import response_result
from utils.exceptions import ValidationException
from utils.auth import jwt_required, get_identity
from controllers.user_controller import UserController
from serializes.user_serialize import UserCreateSchema, UserQuerySchema
from serializes.response_serialize import RspMsgDictSchema, RspMsgSchema

blp = Blueprint("user_api", __name__, description="用户管理接口")


@blp.route("")
class UserListApi(MethodView):
    """用户列表"""

    def __init__(self):
        self.controller = UserController()

    @blp.arguments(UserQuerySchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, query_params):
        """获取用户列表（支持分页和工号过滤）"""
        result = self.controller.list(
            page=query_params.get("page", 1),
            page_size=query_params.get("page_size", 20),
            work_no=query_params.get("work_no"),
        )
        return response_result(content=result)

    @blp.arguments(UserCreateSchema)
    @blp.response(200, RspMsgDictSchema)
    @jwt_required()
    def post(self, payload):
        """创建用户（需要登录）"""
        result = self.controller.create(payload)
        return response_result(content=result, msg="创建成功")


@blp.route("/<string:work_no>")
class UserDetailApi(MethodView):
    """用户详情"""

    def __init__(self):
        self.controller = UserController()

    @blp.response(200, RspMsgDictSchema)
    def get(self, work_no):
        """获取用户详情"""
        result = self.controller.get_by_work_no(work_no)
        return response_result(content=result)

    @blp.response(200, RspMsgSchema)
    @jwt_required()
    def put(self, work_no):
        """更新用户信息（需要登录）"""
        data = request.get_json() or {}
        update_data = {k: v for k, v in data.items() if v is not None}
        self.controller.update(work_no, update_data)
        return response_result(msg="更新成功")

    @blp.response(200, RspMsgSchema)
    @jwt_required()
    def delete(self, work_no):
        """删除用户（需要登录）"""
        self.controller.delete(work_no)
        return response_result(msg="删除成功")
```

**视图层规范：**
- ✓ 使用 `flask_smorest.Blueprint`（不是 `flask.Blueprint`）
- ✓ 使用 `MethodView` 基于类的视图
- ✓ `@blp.arguments(Schema)` 自动验证请求参数
- ✓ `@blp.response(200, RspMsgDictSchema)` 声明响应 Schema（用于 Swagger）
- ✓ 所有接口返回 `response_result(content=..., msg=...)` 格式
- ✓ `@jwt_required()` 保护需要认证的接口
- ✓ 构造函数中初始化 Controller（`self.controller = XxxController()`）
- ✓ 业务异常无需捕获，由全局错误处理器统一处理
- ✗ 不在视图中包含业务逻辑
- ✗ 不在视图中直接操作数据库或缓存

### 5. 统一响应格式

**所有接口** 必须返回以下格式：

```json
{
    "code": "S10000",
    "msg": "OK",
    "content": {}
}
```

```python
# utils/response.py
from utils.response import response_result, fail_response_result

# ✓ 成功响应
return response_result(content={"user_id": "123"}, msg="创建成功")
# 返回：{"code": "S10000", "msg": "创建成功", "content": {"user_id": "123"}}

# ✓ 失败响应（通常由异常处理器自动生成）
return fail_response_result(content={}, msg="操作失败", code="F10001")
# 返回：{"code": "F10001", "msg": "操作失败", "content": {}}
```

### 6. 异常处理规范

**位置：** `utils/exceptions.py`

**规范：** 使用预定义的异常类，全局错误处理器会自动捕获并返回标准 JSON。

```python
from utils.exceptions import (
    ValidationException,       # 400 - 参数校验失败
    AuthenticationException,   # 401 - 未登录/Token 无效
    PermissionException,       # 403 - 权限不足
    ResourceNotFoundException, # 404 - 资源不存在
    ResourceExistsException,   # 400 - 资源已存在
    BusinessException,         # 400 - 业务逻辑异常
    ExternalServiceException,  # 502 - 外部服务异常
    DatabaseException,         # 500 - 数据库异常
)

# ✓ 正确的异常使用
def create_user(data):
    if not data.get("work_no"):
        raise ValidationException(msg="工号不能为空", content={"field": "work_no"})

    if UserModel.query.filter_by(work_no=data["work_no"]).first():
        raise ResourceExistsException(resource_type="用户")

def get_user(user_id):
    user = UserModel.query.get(user_id)
    if not user:
        raise ResourceNotFoundException(resource_type="用户")

def check_permission(user_role):
    if user_role != "admin":
        raise PermissionException(msg="需要管理员权限")

# ✓ 在 View 层不需要 try/except（全局处理器会捕获 APIException 子类）
@blp.response(200, RspMsgDictSchema)
def post(self, payload):
    result = self.controller.create(payload)  # 如果抛出异常，自动返回错误 JSON
    return response_result(content=result)

# ✗ 不要这样做（破坏统一错误处理）
def post(self, payload):
    try:
        result = self.controller.create(payload)
        return response_result(content=result)
    except Exception as e:
        return {"error": str(e)}, 500  # ✗ 绕过了统一响应格式
```

**业务码规范：**

| 代码 | 含义 |
|------|------|
| `S10000` | 请求成功 |
| `F10001` | 通用失败 |
| `F10002` | 参数验证失败 |
| `F20001` | 用户未登录 |
| `F20002` | Token 无效/过期 |
| `F20003` | 用户名或密码错误 |
| `F30001` | 权限不足 |
| `F40001` | 资源不存在 |
| `F40002` | 资源已存在 |
| `F50001` | 业务处理失败 |
| `F60001` | 外部服务调用失败 |
| `F70001` | 数据库操作失败 |

### 7. 配置管理规范

```python
# configs/base.py
import os
from crypto import decrypt_env

def _get_bool(key: str, default: str = "false") -> bool:
    return os.environ.get(key, default).lower() in ("1", "true", "yes")

def _get_int(key: str, default: int = 0) -> int:
    return int(os.environ.get(key, str(default)))

def _get_secret(key: str, default: str = "") -> str:
    """获取敏感配置，支持 ENC() 加密格式"""
    return decrypt_env(key, default)


class BaseConfig:
    SERVER_HOST = os.environ.get("SERVER_HOST", "0.0.0.0")
    SERVER_PORT = _get_int("SERVER_PORT", 19999)
    SECRET_KEY = _get_secret("SECRET_KEY", "dev-secret-key")
    JWT_SECRET_KEY = _get_secret("JWT_SECRET_KEY", "jwt-secret-key")

    @property
    def SQLALCHEMY_DATABASE_URI(self):
        return "mysql+pymysql://{}:{}@{}:{}/{}?charset=utf8".format(
            os.environ.get("MYSQL_USERNAME"),
            _get_secret("MYSQL_PASSWORD", ""),
            os.environ.get("MYSQL_HOST", "127.0.0.1"),
            os.environ.get("MYSQL_PORT", "3306"),
            os.environ.get("MYSQL_DATABASE"),
        )

    @property
    def REDIS_URL(self):
        password = _get_secret("REDIS_PASSWORD", "")
        auth = f":{password}@" if password else ""
        return f"redis://{auth}{os.environ.get('REDIS_HOST', '127.0.0.1')}:{os.environ.get('REDIS_PORT', '6379')}/{os.environ.get('REDIS_DATABASE', '0')}"


# configs/__init__.py
from configs.development import DevelopmentConfig
from configs.production import ProductionConfig

config = {
    "dev": DevelopmentConfig,    # FLASK_ENV=dev
    "prd": ProductionConfig,     # FLASK_ENV=prd
    "default": DevelopmentConfig,
}
```

**配置管理规范：**
- ✓ `FLASK_ENV` 的值为 `dev` 或 `prd`（不是 `development`/`production`）
- ✓ 敏感信息使用 `_get_secret()` 支持 `ENC(...)` 加密格式
- ✓ 使用 `@property` 动态构建数据库/Redis URL
- ✓ 从 `.env` 文件读取环境变量（不硬编码）
- ✗ 不在代码中硬编码密码等敏感信息
- ✗ 不提交 `.env` 和 `.master.key` 到版本控制

### 8. 缓存使用规范

```python
# ✓ 正确的 Redis 操作方式（使用 OperRedis）
from cache.redis_oper import OperRedis

redis = OperRedis()

# String 操作（自动 JSON 序列化/反序列化）
redis.set("key", {"name": "张三", "age": 25}, expire=300)
value = redis.get("key")            # 自动反序列化为 dict
redis.delete("key")
redis.exists("key")
redis.ttl("key")

# 计数器
redis.incr("visit:count")          # 原子递增
redis.decr("stock:item1")          # 原子递减

# Hash 操作
redis.hset("user:1", "name", "张三")
redis.hmset("user:1", {"name": "张三", "age": 25})
value = redis.hget("user:1", "name")
all_data = redis.hgetall("user:1")

# List 操作
redis.rpush("queue", "task1", "task2")
item = redis.lpop("queue")
items = redis.lrange("queue", 0, -1)

# Set 操作（适合去重、标签）
redis.sadd("tags", "python", "flask")
members = redis.smembers("tags")
redis.sismember("tags", "python")  # 判断是否存在

# Sorted Set（排行榜）
redis.zadd("rank", {"user1": 100, "user2": 200})
top10 = redis.zrange("rank", 0, 9, withscores=True)

# 批量操作
redis.mset({"k1": "v1", "k2": "v2"})
result = redis.mget("k1", "k2")    # 返回 dict

# ✓ 缓存模式（Cache-Aside Pattern）
def get_user(work_no: str) -> dict:
    cache_key = f"user:{work_no}"

    cached = redis.get(cache_key)
    if cached:
        return cached

    user = UserModel.query.filter_by(work_no=work_no).first()
    if not user:
        return None

    user_dict = user.to_dict()
    redis.set(cache_key, user_dict, expire=300)
    return user_dict

# ✓ @cache_result 装饰器（自动缓存函数返回值）
from utils.cache_decorator import cache_result

@cache_result(ttl=300, key_prefix="user_info")
def get_user_profile(user_id: int) -> dict:
    """首次调用约 100ms，后续命中缓存约 1ms"""
    return UserModel.query.get(user_id).to_dict()

# ✗ 不要直接使用 redis_client 原始客户端做业务操作
from cache import redis_client
redis_client.set("key", "value")   # ✗ 不会自动 JSON 序列化
```

### 9. 数据库操作规范

**MySQL（SQLAlchemy）：**

```python
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import UserModel

# ✓ 查询
user = UserModel.query.get(user_id)
user = UserModel.query.filter_by(work_no=work_no, status=1).first()
users = UserModel.query.filter(UserModel.status == 1).all()
count = UserModel.query.filter_by(status=1).count()
# 分页
items = UserModel.query.filter_by(status=1).offset((page-1)*page_size).limit(page_size).all()

# ✓ 创建（必须有 commit/rollback）
try:
    user = UserModel(work_no="001", username="张三", password="xxx")
    db.session.add(user)
    db.session.commit()
except Exception as e:
    db.session.rollback()
    raise

# ✓ 更新
try:
    user.username = "李四"
    db.session.commit()
except Exception as e:
    db.session.rollback()
    raise

# ✓ 软删除
user.status = 0
db.session.commit()

# ✓ 多表事务
try:
    db.session.add(record1)
    db.session.add(record2)
    db.session.commit()
except Exception as e:
    db.session.rollback()
    raise
```

**MongoDB（MongoOperations）：**

```python
from dbs.mongo_db import MongoOperations

# 创建操作实例（指定集合名）
users = MongoOperations("users")
logs = MongoOperations("logs", database="audit_db")  # 指定不同数据库

# 插入
user_id = users.insert_one({"name": "张三", "age": 25, "city": "北京"})
ids = users.insert_many([{"name": "李四"}, {"name": "王五"}])

# 查询
user = users.find_one({"name": "张三"})
user = users.find_by_id("65f1a2b3c4d5e6f7a8b9c0d1")  # 通过 _id 查询
all_users = users.find({"age": {"$gte": 18}}, sort=[("created_at", -1)])
count = users.count({"age": {"$gte": 18}})
is_exists = users.exists({"name": "张三"})

# 分页查询
result = users.find_page(
    filter={"status": "active"},
    page=1,
    page_size=20,
    sort=[("created_at", -1)]
)
# 返回：{"items": [...], "total": 100, "page": 1, "page_size": 20, "total_pages": 5}

# 更新
users.update_one({"name": "张三"}, {"$set": {"age": 26}})
users.update_by_id("65f1a2b3...", {"$set": {"age": 26}})
users.update_many({"status": "inactive"}, {"$set": {"status": "deleted"}})

# 删除
users.delete_one({"name": "张三"})
users.delete_by_id("65f1a2b3...")
users.delete_many({"status": "deleted"})

# 聚合
result = users.aggregate([
    {"$match": {"status": "active"}},
    {"$group": {"_id": "$city", "count": {"$sum": 1}}},
    {"$sort": {"count": -1}}
])

# 索引
users.create_index("name", unique=True)
users.create_index([("city", 1), ("age", -1)])
```

### 10. 异步任务规范

```python
# ✓ 任务定义（在 tasks/ 目录下）
# tasks/user_tasks.py
from queues.celery_queue import celery_app
from loggers import logger


@celery_app.app.task(name="tasks.user.send_welcome_email", bind=True, max_retries=3)
def send_welcome_email(self, user_id: str, email: str):
    """发送欢迎邮件（带自动重试）"""
    try:
        # 实现发送逻辑
        logger.info("欢迎邮件已发送", user_id=user_id, email=email)
        return True
    except Exception as exc:
        logger.error("邮件发送失败", error=str(exc), user_id=user_id)
        raise self.retry(exc=exc, countdown=60)  # 60 秒后重试


@celery_app.app.task(name="tasks.user.export_data", bind=True)
def export_data(self, work_no: str, export_format: str = "csv") -> dict:
    """数据导出任务（带进度更新）"""
    self.update_state(state="PROGRESS", meta={"percent": 0, "status": "开始处理"})
    # 处理逻辑...
    self.update_state(state="PROGRESS", meta={"percent": 50, "status": "处理中"})
    # 完成
    return {"file_url": "https://...", "count": 100}


# ✓ 在 Controller 中调用任务
from tasks.user_tasks import send_welcome_email, export_data
from datetime import datetime, timedelta

class UserController:
    def create(self, data: dict) -> dict:
        user = UserModel(**data)
        db.session.add(user)
        db.session.commit()

        # 异步发送欢迎邮件（立即执行）
        send_welcome_email.delay(user.id, user.email)

        # 延迟执行（30 分钟后）
        # cancel_order.apply_async(args=[order_id], eta=datetime.now() + timedelta(minutes=30))

        return user.to_dict()

    def get_task_status(self, task_id: str) -> dict:
        """查询任务状态"""
        return celery_app.get_task_info(task_id)

# ✗ 不要在 queues/ 目录下定义业务任务
# ✗ 不要在请求中同步执行耗时操作
```

---

## 设计模式与架构

### 1. 应用工厂模式

```python
# app.py
from dotenv import load_dotenv
load_dotenv()

import os
from flask import Flask
from flask_cors import CORS
from flask_marshmallow import Marshmallow
from flask_migrate import Migrate
from flask_smorest import Api

from cache import redis_client
from utils.auth import AuthManager
from utils.error_handler import register_error_handlers
from utils.rate_limit import init_app as init_rate_limit
from configs import config
from dbs.mysql_db import db
from loggers import logger, flask_hooks
from urls import BLUEPRINTS
from urls.api_docs import print_api_info
from utils.api_docs_enhanced import enhance_api_docs


def create_app(config_name=None):
    """应用工厂函数"""
    if config_name is None:
        config_name = os.environ.get("FLASK_ENV", "dev")  # 注意：默认值是 "dev" 不是 "development"

    app = Flask(__name__)
    app.config.from_object(config[config_name]())

    # CORS
    CORS(app, supports_credentials=True)

    # 初始化扩展
    Migrate().init_app(app)
    db.init_app(app)
    with app.app_context():
        db.create_all()

    # 初始化 Redis
    redis_client.init_app(app)

    Marshmallow().init_app(app)
    AuthManager().init_app(app)
    init_rate_limit(app)

    # 注册 Flask 钩子（HTTP/SQL 日志）
    flask_hooks.init_app(app, db, enable_db_logging=True)

    # 注册全局错误处理器
    register_error_handlers(app)

    # 注册蓝图
    api = Api(app)
    enhance_api_docs(app, api)  # JWT Bearer 展示
    for blp, config_dict in BLUEPRINTS:
        api.register_blueprint(blp, **config_dict)

    return app
```

### 2. 蓝图注册模式

```python
# urls/routes.py
from views.user_api import blp as user_blp
from views.auth_api import blp as auth_blp
from views.health_api import blp as health_blp

BLUEPRINTS = [
    (auth_blp,   {"url_prefix": "/api/auth"}),
    (user_blp,   {"url_prefix": "/api/user"}),
    (health_blp, {"url_prefix": ""}),
]

# urls/__init__.py
from urls.routes import BLUEPRINTS  # 对外导出 BLUEPRINTS
```

### 3. MVC 数据流

```
HTTP Request
    ↓
[Views 层]          views/xxx_api.py
    - 路由定义（Blueprint + MethodView）
    - @blp.arguments 参数校验
    - 调用 Controller
    - return response_result(...)
    ↓
[Controllers 层]    controllers/xxx_controller.py
    - 业务逻辑处理
    - 调用 Model / Redis / 外部服务
    - 抛出业务异常（APIException 子类）
    ↓
[Models/DB 层]      dbs/mysql_db/model_tables.py
    - ORM 查询
    - 事务管理
    ↓
Database / Redis / MongoDB / ...
```

### 4. 全局错误处理

所有从 Controller/View 抛出的 `APIException` 子类，由 `utils/error_handler.py` 中注册的全局处理器捕获，自动返回：

```json
{"code": "F20003", "msg": "用户名或密码错误", "content": {}}
```

---

## 完整代码示例

以用户管理为例，展示从 Model 到 View 的完整实现：

### 步骤 1：定义 Model

```python
# dbs/mysql_db/model_tables.py（追加）
class UserModel(BaseMixinModel):
    __tablename__ = "users"
    id = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    work_no = db.Column(db.String(32), nullable=False, unique=True, comment="工号")
    username = db.Column(db.String(32), nullable=False, comment="用户名")
    password = db.Column(db.String(255), nullable=False, comment="密码")

    def to_dict(self):
        return {"id": self.id, "work_no": self.work_no, "username": self.username,
                "status": self.status, "created_at": self.created_at}
```

### 步骤 2：定义 Schema

```python
# serializes/user_serialize.py
from marshmallow import Schema, fields

class UserCreateSchema(Schema):
    work_no = fields.String(required=True, metadata={"description": "工号"})
    username = fields.String(required=True, metadata={"description": "用户名"})
    password = fields.String(required=True, metadata={"description": "密码"})

class UserQuerySchema(Schema):
    work_no = fields.String(metadata={"description": "工号"})
    page = fields.Integer(load_default=1)
    page_size = fields.Integer(load_default=20)
```

### 步骤 3：实现 Controller

```python
# controllers/user_controller.py
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import UserModel
from cache.redis_oper import OperRedis
from utils.exceptions import ValidationException, ResourceNotFoundException
from loggers import logger

class UserController:
    def __init__(self):
        self.redis = OperRedis()

    def list(self, page=1, page_size=20, work_no=None):
        query = UserModel.query.filter_by(status=1)
        if work_no:
            query = query.filter(UserModel.work_no.like(f"%{work_no}%"))
        total = query.count()
        items = query.offset((page-1)*page_size).limit(page_size).all()
        return {"items": [u.to_dict() for u in items], "total": total}

    def create(self, data):
        if UserModel.query.filter_by(work_no=data["work_no"]).first():
            raise ValidationException(msg="工号已存在")
        try:
            user = UserModel(**data)
            db.session.add(user)
            db.session.commit()
            logger.info("用户创建成功", work_no=data["work_no"])
            return user.to_dict()
        except Exception as e:
            db.session.rollback()
            raise

    def delete(self, work_no):
        user = UserModel.query.filter_by(work_no=work_no, status=1).first()
        if not user:
            raise ResourceNotFoundException(resource_type="用户")
        try:
            user.status = 0
            db.session.commit()
            self.redis.delete(f"user:{work_no}")
        except Exception as e:
            db.session.rollback()
            raise
```

### 步骤 4：实现 View

```python
# views/user_api.py
from flask.views import MethodView
from flask_smorest import Blueprint
from utils.response import response_result
from utils.auth import jwt_required
from controllers.user_controller import UserController
from serializes.user_serialize import UserCreateSchema, UserQuerySchema
from serializes.response_serialize import RspMsgDictSchema, RspMsgSchema

blp = Blueprint("user_api", __name__, description="用户管理")

@blp.route("")
class UserListApi(MethodView):
    def __init__(self):
        self.controller = UserController()

    @blp.arguments(UserQuerySchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, query_params):
        """获取用户列表"""
        result = self.controller.list(**query_params)
        return response_result(content=result)

    @blp.arguments(UserCreateSchema)
    @blp.response(200, RspMsgDictSchema)
    @jwt_required()
    def post(self, payload):
        """创建用户（需要登录）"""
        result = self.controller.create(payload)
        return response_result(content=result, msg="创建成功")

@blp.route("/<string:work_no>")
class UserDetailApi(MethodView):
    def __init__(self):
        self.controller = UserController()

    @blp.response(200, RspMsgSchema)
    @jwt_required()
    def delete(self, work_no):
        """删除用户（需要登录）"""
        self.controller.delete(work_no)
        return response_result(msg="删除成功")
```

### 步骤 5：注册蓝图

```python
# urls/routes.py（追加）
from views.user_api import blp as user_blp

BLUEPRINTS = [
    ...
    (user_blp, {"url_prefix": "/api/user"}),
]
```

---

## 最佳实践指南

### 1. 错误处理

```python
# ✓ 在 Controller 中使用业务异常（自动被全局处理器捕获）
from utils.exceptions import ValidationException, ResourceNotFoundException

def get_user(work_no: str):
    if not work_no:
        raise ValidationException(msg="工号不能为空")
    user = UserModel.query.filter_by(work_no=work_no).first()
    if not user:
        raise ResourceNotFoundException(resource_type="用户")
    return user.to_dict()

# ✓ 在 Controller 中处理系统异常（记录日志并重新抛出）
def create_user(data: dict):
    try:
        user = UserModel(**data)
        db.session.add(user)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        logger.error("创建用户失败", error=str(e))
        raise  # 重新抛出，由全局处理器处理

# ✓ View 层不需要 try/except（框架已处理）
def post(self, payload):
    result = self.controller.create(payload)  # 异常自动传播
    return response_result(content=result)
```

### 2. 日志记录

```python
from loggers import logger

# ✓ 业务日志（使用关键字参数）
logger.info("用户登录", username=username, ip=client_ip)
logger.warning("登录失败次数过多", username=username, count=fail_count)
logger.error("支付失败", error=str(e), custom={"order_id": order_id, "amount": amount})

# ✓ 性能相关日志（使用 db 字段）
logger.warning("SQL 执行慢", db={"duration": 2.5, "statement": sql_str})

# 日志自动附加（框架自动记录，无需手动添加）：
# - 所有 HTTP 请求/响应（flask_hooks）
# - 所有 SQL 查询（flask_hooks，enable_db_logging=True）
# - 请求追踪 ID（X-Request-ID/X-Trace-Id）
```

### 3. 数据库查询优化

```python
# ✓ 只查询需要的字段
from sqlalchemy import select
result = db.session.execute(
    select(UserModel.id, UserModel.username).where(UserModel.status == 1)
).all()

# ✓ 使用分页（避免 .all() 大量数据）
items = UserModel.query.filter_by(status=1).offset(offset).limit(page_size).all()

# ✓ 使用索引字段过滤
user = UserModel.query.filter_by(work_no=work_no).first()  # work_no 有 unique 索引

# ✗ 避免全表扫描
users = UserModel.query.all()  # ✗ 数据量大时慎用
```

### 4. 分页规范

```python
# ✓ 统一的分页响应格式
def list(self, page=1, page_size=20):
    from configs.base import BaseConfig
    page_size = min(page_size, BaseConfig.PAGE_SIZE_MAX)  # 不超过最大值

    total = UserModel.query.filter_by(status=1).count()
    items = UserModel.query.filter_by(status=1)\
        .offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": [u.to_dict() for u in items],
        "total": total,
        "page": page,
        "page_size": page_size,
    }
```

### 5. 安全最佳实践

```python
# ✓ 密码加密（不要明文存储）
from werkzeug.security import generate_password_hash, check_password_hash
user.password = generate_password_hash(plain_password)
is_valid = check_password_hash(user.password, plain_password)

# ✓ 敏感配置加密（.env 中使用 ENC() 格式）
MYSQL_PASSWORD=ENC(gAAAAABn...)  # 使用 python -m crypto.cli encrypt 生成

# ✓ JWT 认证
from utils.auth import jwt_required, get_identity, create_token

# 生成 Token
token = create_token(identity=username, additional_claims={"role": "admin"})

# 保护接口
@jwt_required()
def get(self):
    username = get_identity()  # 从 Token 获取用户名

# ✓ 限流（已内置，通过 .env 配置）
RATELIMIT_DEFAULT=200 per day, 50 per hour
```

### 6. 测试规范

```python
# tests/test_user.py
from tests.base_test import BaseTestCase

class TestUser(BaseTestCase):
    """用户模块测试"""

    def test_create_user(self):
        """测试创建用户"""
        response = self.client.post(
            "/api/user",
            json={"work_no": "001", "username": "张三", "password": "123456"},
            headers={"Authorization": f"Bearer {self.get_token()}"}
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["code"], "S10000")
        self.assertEqual(data["content"]["work_no"], "001")

    def test_get_user_not_found(self):
        """测试获取不存在的用户"""
        response = self.client.get("/api/user/nonexistent_work_no")
        data = response.get_json()
        self.assertEqual(data["code"], "F40001")
```

---

## 代码重构指南（AI 专用）

当 AI 阅读本文档后，应按以下步骤重构现有项目：

### 步骤 1：识别旧项目模式

```python
# 旧模式 → 新模式
from app import db              →  from dbs.mysql_db import db
from app.models import User     →  from dbs.mysql_db.model_tables import UserModel
from config import Config       →  from configs.base import BaseConfig
from schemas import UserSchema  →  from serializes.user_serialize import UserSchema
redis.set("k", json.dumps(v))   →  OperRedis().set("k", v)  # 自动序列化
abort(404, message="...")       →  raise ResourceNotFoundException(...)
```

### 步骤 2：调整目录结构

- `app/models/` → `dbs/mysql_db/model_tables.py`
- `app/schemas/` 或 `app/serializers/` → `serializes/`（注意目录名）
- `app/views/` → `views/`（纯路由）+ `controllers/`（业务逻辑）
- `config.py` → `configs/base.py` + `.env`

### 步骤 3：更新 Model 定义

```python
# 旧代码
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# 新代码
class UserModel(BaseMixinModel):  # 继承 BaseMixinModel 获得公共字段
    id = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    # created_at、status 等字段由 BaseMixinModel 提供
```

### 步骤 4：重构视图层

```python
# 旧代码
@app.route("/api/users/", methods=["GET"])
def get_users():
    users = User.query.all()
    return jsonify([u.to_dict() for u in users])

# 新代码
@blp.route("")
class UserListApi(MethodView):
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        result = self.controller.list()
        return response_result(content=result)
```

### 步骤 5：分离业务逻辑

```python
# 旧代码（视图中包含业务逻辑）
@app.route("/users/<work_no>")
def get_user(work_no):
    user = User.query.filter_by(work_no=work_no).first()
    if not user:
        return jsonify({"error": "用户不存在"}), 404
    cached = redis.get(f"user:{work_no}")
    # 复杂业务逻辑...

# 新代码（分离后）
# controllers/user_controller.py
class UserController:
    def get(self, work_no: str) -> dict:
        cached = self.redis.get(f"user:{work_no}")
        if cached:
            return cached
        user = UserModel.query.filter_by(work_no=work_no, status=1).first()
        if not user:
            raise ResourceNotFoundException(resource_type="用户")
        user_dict = user.to_dict()
        self.redis.set(f"user:{work_no}", user_dict, expire=300)
        return user_dict

# views/user_api.py
@blp.route("/<string:work_no>")
class UserDetailApi(MethodView):
    def get(self, work_no):
        result = self.controller.get(work_no)
        return response_result(content=result)
```

### 步骤 6：替换错误处理

```python
# 旧代码
if not user:
    return jsonify({"error": "用户不存在"}), 404
abort(400, message="参数错误")

# 新代码
if not user:
    raise ResourceNotFoundException(resource_type="用户")
raise ValidationException(msg="参数错误", content={"field": "work_no"})
```

---

## 总结

本框架的核心理念是**标准化、模块化、可维护**。通过遵循本规范：

1. **目录结构清晰** - 每个模块职责明确，`serializes/` 而非 `schemas/`
2. **统一响应格式** - 所有接口返回 `{"code", "msg", "content"}` 结构
3. **统一异常体系** - `APIException` 子类 + 全局处理器，无需在 View 层 try/catch
4. **MVC 严格分层** - View 只处理 HTTP，Controller 只处理业务，Model 只处理数据库
5. **Redis 规范操作** - 统一使用 `OperRedis` 类，自动 JSON 序列化
6. **生产就绪** - 结构化日志、自动 HTTP/SQL 追踪、配置加密、限流

AI 在生成或重构代码时，应严格遵循本文档中的所有规范和示例。

---

**文档版本：** 2.0
**最后更新：** 2026-03
**维护者：** Framework Team
