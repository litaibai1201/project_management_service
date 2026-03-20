# Flask Web Development Framework

基于 Flask 3.0 的轻量级 Web 开发框架，采用 MVC 架构模式，提供完整的 RESTful API 开发支持。

## 特性

- **MVC 架构**: 清晰的 View-Controller-Model 分层设计
- **多数据库支持**: MySQL、Oracle、SQLite、MongoDB、InfluxDB、Elasticsearch
- **分库分表**: 支持按日期、哈希、范围分片策略
- **缓存系统**: Redis 集成，支持连接池复用和丰富的数据结构操作
- **任务队列**: Celery 分布式任务队列，支持异步任务、定时任务、优先级队列
- **消息队列**: RabbitMQ 消息代理，支持多种消息模式
- **API 文档**: 基于 flask-smorest 自动生成 Swagger UI
- **身份认证**: JWT Token 认证机制
- **配置加密**: Fernet 对称加密保护 .env 中的敏感配置
- **日志系统**: 结构化日志（structlog），支持请求追踪、SQL 监控、队列异步写入
- **速率限制**: 基于 Flask-Limiter 的 API 限流
- **文件服务**: S3、MinIO、FTP 客户端支持
- **NoSQL 支持**: MongoDB 文档数据库，支持事务、软删除、审计
- **时序数据库**: InfluxDB 时间序列数据库，用于监控和日志
- **搜索引擎**: Elasticsearch 全文搜索引擎，用于内容搜索和分析
- **统一异常**: 完整的业务异常体系，标准化错误码和响应格式

## 项目结构

```
app_project_small/
├── app.py                 # 应用入口，工厂函数
├── requirements.txt       # 依赖包列表
├── .env.example          # 环境变量示例
│
├── configs/              # 配置模块
│   ├── base.py           # 基础配置类（所有配置项）
│   ├── development.py    # 开发环境配置（DEBUG=True）
│   └── production.py     # 生产环境配置（DEBUG=False）
│
├── views/                # View 层 - 接收请求、参数校验、返回响应
│   ├── auth_api.py       # 认证接口（登录、token）
│   ├── test_api.py       # 测试接口（CRUD、缓存、文件、Redis 高级操作）
│   ├── health_api.py     # 健康检查接口
│   └── async_api.py      # 异步接口示例（Flask 3 async）
│
├── controllers/          # Controller 层 - 业务逻辑处理
│   ├── auth_controller.py     # 认证业务逻辑（登录、JWT 解析）
│   ├── test_controller.py     # 测试业务逻辑（CRUD、分页）
│   ├── cache_controller.py    # 缓存业务逻辑（String/Hash/List/Set/ZSet）
│   ├── file_controller.py     # 文件业务逻辑（MinIO/S3 上传下载）
│   └── config_controller.py   # 配置信息查询
│
├── models/               # Model 层 - 数据库操作
│   └── test_model.py
│
├── dbs/                  # 数据库模块
│   ├── db_manager.py     # 数据库管理器
│   ├── sharding.py       # 分片策略
│   ├── sharding_base.py  # 分片基类
│   ├── mysql_db/         # MySQL 支持（SQLAlchemy ORM）
│   ├── oracle_db/        # Oracle 支持
│   ├── sqlite_db/        # SQLite 支持
│   ├── mongo_db/         # MongoDB 支持
│   │   ├── client.py              # 连接管理
│   │   ├── operations.py          # 基础操作
│   │   └── enhanced_operations.py # 增强操作（事务、软删除、审计）
│   ├── influxdb_db/      # InfluxDB 时序数据库支持
│   │   ├── client.py              # 连接管理
│   │   └── operations.py          # 时序数据操作
│   └── elasticsearch_db/ # Elasticsearch 搜索引擎支持
│       ├── client.py              # 连接管理
│       └── operations.py          # 搜索操作
│
├── cache/                # 缓存模块
│   └── redis_oper.py     # Redis 操作封装（全局连接池复用，支持所有数据结构）
│
├── queues/               # 队列模块
│   ├── celery_queue/     # Celery 任务队列
│   │   ├── client.py         # CeleryClientManager（含 FlaskTask 上下文集成）
│   │   └── config.py         # Beat 定时任务配置
│   └── rabbitmq/         # RabbitMQ 消息队列
│       ├── client.py         # RabbitMQ 客户端管理
│       ├── producer.py       # 消息生产者
│       └── consumer.py       # 消息消费者
│
├── tasks/                # 业务任务定义目录
│   └── example_tasks.py  # 任务示例（基础/重试/进度/定时/链式任务）
│
├── serializes/           # 序列化模块
│   ├── test_serialize.py     # 请求参数 Schema（登录、测试、分页）
│   ├── model_serialize.py    # 模型序列化
│   └── response_serialize.py # 统一响应 Schema
│
├── loggers/              # 日志模块
│   ├── core/             # 日志核心（logger、context、handlers、models）
│   ├── utils/            # Flask 钩子（HTTP/SQL 自动记录）、装饰器
│   └── conf/             # 日志配置（structlog + 队列处理器）
│
├── crypto/               # 配置加密模块
│   ├── fernet.py         # Fernet 对称加密实现
│   ├── cli.py            # 命令行工具
│   └── __main__.py       # CLI 入口
│
├── utils/                # 工具模块
│   ├── auth.py           # JWT 认证工具（create_token、jwt_required、get_identity）
│   ├── error_handler.py  # 全局错误处理器
│   ├── exceptions.py     # 自定义异常体系（8 种业务异常）
│   ├── response.py       # 统一响应格式
│   ├── tools.py          # 通用工具函数
│   ├── cache_decorator.py # @cache_result 缓存装饰器
│   ├── rate_limit.py     # 限流配置（Flask-Limiter）
│   ├── api_docs_enhanced.py # API 文档增强（JWT Bearer 展示）
│   ├── s3_client.py      # S3 客户端
│   ├── minio_client.py   # MinIO 客户端
│   ├── ftp_client.py     # FTP 客户端
│   ├── ini_file.py       # INI 文件处理
│   └── zip_file.py       # ZIP 文件处理
│
├── urls/                 # 路由模块
│   ├── routes.py         # 蓝图注册（集中管理 URL 前缀）
│   └── api_docs.py       # API 文档配置（启动时打印蓝图信息）
│
├── tests/                # 测试模块
│   ├── base_test.py      # 测试基类
│   └── test_redis_modern.py # Redis 功能测试
│
└── docs/                 # 文档
    └── API.md            # API 接口文档
```

## 快速开始

### 环境要求

- Python 3.10+
- MySQL 5.7+ / 8.0+
- Redis 6.0+

### 安装

1. 克隆项目

```bash
git clone <repository-url>
cd app_project_small
```

2. 创建虚拟环境

```bash
python -m venv venv
source venv/bin/activate  # Linux/macOS
# 或
.\venv\Scripts\activate   # Windows
```

3. 安装依赖

```bash
pip install -r requirements.txt
```

4. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，配置数据库、Redis 等连接信息
```

5. 启动服务

```bash
python app.py
```

服务默认运行在 `http://0.0.0.0:19999`

### API 文档

启动服务后访问 Swagger UI：

- Swagger UI: `http://localhost:19999/swagger-ui`
- OpenAPI JSON: `http://localhost:19999/openapi.json`

## 配置说明

### 核心配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| FLASK_ENV | 运行环境（dev/prd） | dev |
| APP_SERVICE_NAME | 服务名称（用于日志标识） | AIML_DATASET_SERVICE |
| SECRET_KEY | Flask 密钥（支持 ENC() 加密格式） | - |
| JWT_SECRET_KEY | JWT 密钥（支持 ENC() 加密格式） | - |
| JWT_ACCESS_TOKEN_EXPIRES | Access Token 过期时间（秒） | 3600 |
| JWT_REFRESH_TOKEN_EXPIRES | Refresh Token 过期时间（秒） | 604800 |
| SERVER_HOST | 服务监听地址 | 0.0.0.0 |
| SERVER_PORT | 服务监听端口 | 19999 |

### 数据库配置

**MySQL:**

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| MYSQL_HOST | 主机地址 | 127.0.0.1 |
| MYSQL_PORT | 端口 | 3306 |
| MYSQL_DATABASE | 数据库名 | test |
| MYSQL_USERNAME | 用户名 | root |
| MYSQL_PASSWORD | 密码（支持 ENC() 加密） | - |

**连接池配置:**

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| SQLPOOL_POOL_SIZE | 连接池大小 | 10 |
| SQLPOOL_MAX_OVERFLOW | 最大溢出连接数 | 20 |
| SQLPOOL_POOL_RECYCLE | 连接回收时间(秒) | 3600 |
| SQLPOOL_PRE_PING | 连接前健康检查 | true |

### Redis 配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| REDIS_HOST | 主机地址 | 127.0.0.1 |
| REDIS_PORT | 端口 | 6379 |
| REDIS_DATABASE | 数据库索引 | 0 |
| REDIS_PASSWORD | 密码（支持 ENC() 加密） | - |
| REDIS_REQUIRED | Redis 不可用时是否终止启动 | true |
| REDIS_POOL_SIZE | 连接池大小 | 10 |
| REDIS_MAX_CONNECTIONS | 最大连接数 | 50 |
| REDIS_SOCKET_KEEPALIVE | 启用 Keep-Alive | true |
| REDIS_SOCKET_CONNECT_TIMEOUT | 连接超时（秒） | 5 |
| REDIS_SOCKET_TIMEOUT | 读写超时（秒） | 5 |
| REDIS_RETRY_ON_TIMEOUT | 超时自动重试 | true |
| REDIS_HEALTH_CHECK_INTERVAL | 连接健康检查间隔（秒） | 30 |

### MongoDB 配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| MONGO_URI | 连接字符串 | mongodb://127.0.0.1:27017 |
| MONGO_DATABASE | 数据库名称 | test |
| MONGO_MAX_POOL_SIZE | 连接池最大连接数 | 100 |
| MONGO_MIN_POOL_SIZE | 连接池最小连接数 | 10 |
| MONGO_CONNECT_TIMEOUT | 连接超时（毫秒） | 5000 |
| MONGO_SERVER_SELECTION_TIMEOUT | 服务器选择超时（毫秒） | 5000 |

### InfluxDB 配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| INFLUXDB_URL | 服务地址 | http://127.0.0.1:8086 |
| INFLUXDB_TOKEN | 访问令牌 | - |
| INFLUXDB_ORG | 组织名称 | - |
| INFLUXDB_BUCKET | 默认 Bucket | - |
| INFLUXDB_TIMEOUT | 请求超时（毫秒） | 10000 |

### Elasticsearch 配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| ES_HOSTS | 节点地址（逗号分隔） | http://127.0.0.1:9200 |
| ES_USERNAME | 用户名 | - |
| ES_PASSWORD | 密码 | - |
| ES_API_KEY | API Key | - |
| ES_VERIFY_CERTS | 验证 SSL 证书 | true |
| ES_TIMEOUT | 请求超时（秒） | 30 |
| ES_MAX_RETRIES | 最大重试次数 | 3 |

### Celery 配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| CELERY_BROKER_URL | 消息代理地址 | redis://127.0.0.1:6379/1 |
| CELERY_RESULT_BACKEND | 结果存储后端 | redis://127.0.0.1:6379/2 |
| CELERY_RESULT_EXPIRES | 结果过期时间(秒) | 3600 |
| CELERY_TASK_SERIALIZER | 任务序列化方式 | json |
| CELERY_TIMEZONE | 时区设置 | Asia/Shanghai |
| CELERY_TASK_TIME_LIMIT | 任务硬超时(秒) | 3600 |
| CELERY_TASK_SOFT_TIME_LIMIT | 任务软超时(秒) | 3000 |
| CELERY_WORKER_PREFETCH_MULTIPLIER | Worker 预取倍数 | 4 |
| CELERY_WORKER_MAX_TASKS_PER_CHILD | 子进程最大任务数 | 1000 |

### RabbitMQ 配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| RABBITMQ_HOST | 服务器地址 | 127.0.0.1 |
| RABBITMQ_PORT | 端口 | 5672 |
| RABBITMQ_USERNAME | 用户名 | guest |
| RABBITMQ_PASSWORD | 密码（支持 ENC() 加密） | guest |
| RABBITMQ_VIRTUAL_HOST | 虚拟主机 | / |
| RABBITMQ_CONNECTION_TIMEOUT | 连接超时(秒) | 10 |
| RABBITMQ_HEARTBEAT | 心跳超时(秒) | 600 |

### 分库分表配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| SHARDING_DB_ENABLED | 启用分库 | false |
| SHARDING_TABLE_ENABLED | 启用分表 | false |
| SHARDING_DB_FORMAT | 分库日期格式 | %Y%m%d |
| SHARDING_TABLE_FORMAT | 分表日期格式 | %Y%m%d |
| SHARDING_STRATEGY | 分片策略 | date |

支持的日期格式：
- `%Y%m%d` - 按天分片
- `%Y%m` - 按月分片
- `%Y` - 按年分片
- `%Y_w%W` - 按周分片

### 限流配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| RATELIMIT_ENABLED | 启用限流 | true |
| RATELIMIT_DEFAULT | 默认限流规则 | 200 per day, 50 per hour |
| RATELIMIT_STORAGE_URI | 限流存储后端 | memory:// |

## MVC 架构

### View 层 (views/)

负责接收 HTTP 请求、参数校验、调用 Controller、返回响应。使用 `flask-smorest` 的 `Blueprint` 和 `MethodView`，自动生成 Swagger 文档。

```python
@blp.route("/login")
class LoginApi(MethodView):
    @blp.arguments(LoginSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload):
        """用户登录，返回 JWT access_token"""
        result = self.auth_controller.login(
            username=payload.get("username"),
            password=payload.get("password")
        )
        return response_result(content=result)
```

### Controller 层 (controllers/)

负责业务逻辑处理，协调 Model 层完成数据操作。不直接接触 HTTP 请求/响应。

```python
class AuthController:
    def login(self, username: str, password: str) -> dict:
        if not self._verify_user(username, password):
            raise AuthenticationException(msg="用户名或密码错误", code="F20003")
        token = create_token(identity=username, additional_claims={"role": "user"})
        return {"access_token": token, "token_type": "Bearer"}
```

### Model 层 (models/)

负责数据库操作，封装 CRUD 逻辑。

```python
class TestModel:
    def get_by_id(self, item_id: int):
        return DBFunction.get_by_id(TestTable, item_id)

    def create(self, data: dict):
        return DBFunction.insert(TestTable, data)
```

## API 接口

### 认证接口 `/api/auth`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 用户登录，获取 JWT Token |

### 测试接口 `/api/test`

| 方法 | 路径 | 说明 | 需要认证 |
|------|------|------|---------|
| GET | `/api/test` | 查询记录（支持 work_no 过滤） | 否 |
| POST | `/api/test` | 创建记录 | 是 |
| PUT | `/api/test` | 更新记录 | 是 |
| DELETE | `/api/test` | 删除记录 | 是 |
| GET | `/api/test/list` | 分页查询 | 否 |
| GET | `/api/test/cache` | 获取缓存（string/hash/list） | 否 |
| POST | `/api/test/cache` | 设置缓存 | 是 |
| DELETE | `/api/test/cache` | 删除缓存 | 是 |
| GET | `/api/test/file` | 获取文件下载链接 | 是 |
| POST | `/api/test/file` | 上传文件到 MinIO | 是 |
| GET | `/api/test/profile` | 获取当前登录用户信息 | 是 |
| GET | `/api/test/config` | 获取系统配置信息 | 否 |
| GET | `/api/test/redis/counter` | 获取计数器值 | 否 |
| POST | `/api/test/redis/counter` | 操作计数器（incr/decr/set/reset） | 是 |
| GET | `/api/test/redis/set` | 获取集合成员 | 否 |
| POST | `/api/test/redis/set` | 添加集合成员 | 是 |
| DELETE | `/api/test/redis/set` | 删除集合成员 | 是 |
| GET | `/api/test/redis/zset` | 获取有序集合排行榜 | 否 |
| POST | `/api/test/redis/zset` | 添加排行榜数据 | 是 |
| GET | `/api/test/redis/batch` | 批量获取缓存 | 否 |
| POST | `/api/test/redis/batch` | 批量设置缓存 | 是 |
| DELETE | `/api/test/redis/batch` | 按模式批量删除缓存 | 是 |
| GET | `/api/test/cache/decorator` | 测试 @cache_result 装饰器 | 否 |

### 健康检查

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 服务存活检查 |
| GET | `/ready` | 就绪检查（检测 MySQL、Redis 连接） |

### 异步接口 `/api/async`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/async` | 异步接口示例（Flask 3 async view） |

## 异常体系

项目定义了完整的业务异常，全部由全局错误处理器统一捕获并返回标准 JSON：

```json
{"code": "F20003", "msg": "用户名或密码错误", "content": {}}
```

| 异常类 | HTTP 状态码 | 默认业务码 | 使用场景 |
|--------|-------------|-----------|---------|
| `ValidationException` | 400 | F10002 | 参数格式/字段校验失败 |
| `AuthenticationException` | 401 | F20001 | 未登录或 Token 无效 |
| `PermissionException` | 403 | F30001 | 用户权限不足 |
| `ResourceNotFoundException` | 404 | F40001 | 资源不存在 |
| `ResourceExistsException` | 400 | F40002 | 资源重复创建 |
| `BusinessException` | 400 | F50001 | 违反业务规则 |
| `ExternalServiceException` | 502 | F60001 | 外部服务调用失败 |
| `DatabaseException` | 500 | F70001 | 数据库操作失败 |

## 开发指南

### 添加新接口

1. 在 `views/` 中创建蓝图文件（定义路由和参数校验）
2. 在 `urls/routes.py` 中注册蓝图和 URL 前缀
3. 在 `serializes/` 中定义请求/响应 Schema
4. 在 `controllers/` 中实现业务逻辑
5. 在 `models/` 中实现数据操作

### 数据库事务

使用 `DBFunction.transaction()` 处理多表事务：

```python
with DBFunction.transaction() as session:
    session.add(record1)
    session.add(record2)
    # 自动提交或回滚
```

### 缓存使用

**方式一：使用 `@cache_result` 装饰器**

```python
from utils.cache_decorator import cache_result

@cache_result(ttl=300, key_prefix="user_info")
def get_user_info(user_id: int) -> dict:
    """首次调用执行函数并缓存，后续直接返回缓存结果"""
    return {"user_id": user_id, "name": "张三"}
```

**方式二：直接使用 `OperRedis`**

```python
from cache.redis_oper import OperRedis

redis = OperRedis()

# String 操作
redis.set("key", "value", expire=300)
redis.get("key")

# Hash 操作
redis.hset("user:1", "name", "张三")
redis.hgetall("user:1")

# Set 操作
redis.sadd("tags", "python", "flask")
redis.smembers("tags")

# ZSet 排行榜
redis.zadd("rank", {"user1": 100, "user2": 200})
redis.zrange("rank", 0, 9, withscores=True)

# 计数器
redis.incr("visits")
redis.decr("stock")

# 批量操作
redis.mset({"key1": "v1", "key2": "v2"})
redis.mget("key1", "key2")
```

### JWT 认证

在需要保护的接口上添加 `@jwt_required()` 装饰器：

```python
from utils.auth import jwt_required, get_identity

@blp.response(200, RspMsgDictSchema)
@jwt_required()
def get(self):
    """需要登录才能访问"""
    username = get_identity()  # 从 Token 中获取用户标识
    return response_result(content={"user": username})
```

### 自定义异常

```python
from utils.exceptions import ValidationException, ResourceNotFoundException

# 参数校验失败
raise ValidationException(msg="工号不能为空", content={"field": "work_no"})

# 资源不存在
raise ResourceNotFoundException(resource_type="用户")
```

## 日志系统

### 结构化日志

框架使用 `structlog` 输出结构化日志，支持开发环境美化格式（带颜色）和生产环境 JSON 格式。

```python
from loggers import logger

# 基础用法
logger.info("用户登录", username="zhangsan", role="admin")
logger.warning("SQL 执行慢", db={"duration": 1.5, "statement": "SELECT ..."})
logger.error("外部服务异常", error=e, custom={"service": "payment"})
```

### 自动 HTTP/SQL 日志

通过 `flask_hooks.init_app(app, db, enable_db_logging=True)` 注册后，框架会自动记录：

- **HTTP 请求/响应**：方法、路径、状态码、耗时、请求体、响应体
- **SQL 查询**：语句类型、执行时间（超过 1s 自动 warning）、行数
- **请求追踪**：X-Request-ID、X-Trace-Id、X-Response-Time 响应头

### 队列处理器

高并发场景可启用队列处理器，业务线程将日志放入队列（非阻塞），后台线程异步写入文件：

```python
from loggers import configure_logger

configure_logger(use_queue_handler=True)  # 启用异步日志
```

## 配置加密

使用 Fernet 对称加密保护 `.env` 中的敏感配置：

```bash
# 1. 生成主密钥
python -m crypto.cli generate-key -o .master.key

# 2. 加密配置值
python -m crypto.cli encrypt "your_password"

# 3. 将加密结果填入 .env（支持的字段: MYSQL_PASSWORD, REDIS_PASSWORD 等）
MYSQL_PASSWORD=ENC(gAAAAABn...)

# 4. 批量加密 .env 中的所有密码字段
python -m crypto.cli encrypt-env .env
```

主密钥配置（三选一，优先级从高到低）：
1. 环境变量：`export APP_MASTER_KEY=your-master-key`
2. 密钥文件：`.master.key`（默认路径）
3. 自定义路径：`export APP_MASTER_KEY_FILE=/path/to/key`

## 生产部署

推荐使用 Waitress 或 Gunicorn：

```bash
# Waitress（跨平台，已包含在 requirements.txt）
waitress-serve --port=8080 app:create_app

# Gunicorn（Linux/macOS）
gunicorn -w 4 -b 0.0.0.0:8080 "app:create_app()"
```

异步接口需使用 ASGI 服务器：

```bash
# Hypercorn
hypercorn app:create_app -b 0.0.0.0:8080

# Uvicorn
uvicorn app:create_app --host 0.0.0.0 --port 8080
```

## 任务队列

### Celery 分布式任务队列

| 功能 | 说明 |
|------|------|
| **异步任务** | 邮件发送、文件处理、数据导入导出 |
| **定时任务** | 报表生成、数据清理、定时备份 |
| **长时间任务** | 文件处理（带进度更新） |
| **链式任务** | 下载→处理→上传等流水线任务 |
| **优先级队列** | default / priority_high / priority_low |

**启动命令:**

```bash
# 启动 Worker
celery -A queues.celery_queue.client.celery_app.app worker --loglevel=info

# 启动 Beat 调度器
celery -A queues.celery_queue.client.celery_app.app beat --loglevel=info

# 同时启动 Worker 和 Beat（开发环境）
celery -A queues.celery_queue.client.celery_app.app worker --beat --loglevel=info
```

**定义任务示例：**

```python
from queues.celery_queue import celery_app

# 基础异步任务
@celery_app.app.task(name="tasks.email.send")
def send_email(to: str, subject: str, body: str) -> bool:
    # 实现发送逻辑
    return True

# 带重试的任务
@celery_app.app.task(name="tasks.order.cancel", bind=True, max_retries=3)
def cancel_order(self, order_id: int) -> bool:
    try:
        # 实现取消逻辑
        return True
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)

# 调用任务
send_email.delay("user@example.com", "主题", "正文")

# 定时调用（30 分钟后执行）
from datetime import datetime, timedelta
cancel_order.apply_async(args=[order_id], eta=datetime.now() + timedelta(minutes=30))

# 查询任务状态
info = celery_app.get_task_info(task_id)
print(info['status'])  # PENDING/STARTED/SUCCESS/FAILURE
```

## 消息队列

### RabbitMQ 消息代理

| 功能 | 说明 |
|------|------|
| **简单模式** | 一对一消息传递 |
| **工作队列** | 多消费者竞争消费，负载均衡 |
| **发布订阅** | 广播消息到所有订阅者 |
| **路由模式** | 根据路由键精确匹配 |
| **主题模式** | 支持通配符路由（* 和 #） |
| **RPC 模式** | 远程过程调用 |

**启动 RabbitMQ（Docker）:**

```bash
docker run -d --name rabbitmq \
    -p 5672:5672 \
    -p 15672:15672 \
    rabbitmq:3-management

# 访问管理界面: http://localhost:15672
# 默认用户名/密码: guest/guest
```

## 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| **Web 框架** | Flask | 3.0.3 |
| **ORM** | SQLAlchemy | 2.0.34 |
| **API 文档** | flask-smorest | 0.44.0 |
| **认证** | flask-jwt-extended | 4.5.3 |
| **缓存** | redis | 5.0.8 |
| **任务队列** | Celery | >=5.3.0 |
| **消息队列** | Pika (RabbitMQ) | >=1.3.0 |
| **NoSQL** | PyMongo | >=4.6.0 |
| **时序数据库** | influxdb-client | >=1.36.0 |
| **搜索引擎** | elasticsearch | >=8.0.0 |
| **日志** | structlog | >=23.1.0 |
| **数据验证** | marshmallow / pydantic | 3.22.0 / >=2.0.0 |
| **限流** | Flask-Limiter | >=2.0.0 |
| **配置加密** | cryptography (Fernet) | >=41.0.0 |
| **Web 服务器** | waitress | 3.0.0 |

## 数据库支持

| 数据库 | 类型 | 适用场景 | 文档 |
|--------|------|---------|------|
| **MySQL** | 关系型 | 结构化数据、事务处理 | - |
| **Oracle** | 关系型 | 企业级应用 | - |
| **SQLite** | 关系型 | 轻量级应用、本地存储 | - |
| **MongoDB** | 文档型 | 半结构化数据、灵活 Schema | [MONGODB_USAGE.md](docs/MONGODB_USAGE.md) |
| **InfluxDB** | 时序型 | 监控数据、日志、IoT | [INFLUXDB_USAGE.md](docs/INFLUXDB_USAGE.md) |
| **Elasticsearch** | 搜索引擎 | 全文搜索、日志分析 | [ELASTICSEARCH_USAGE.md](docs/ELASTICSEARCH_USAGE.md) |

## License

MIT License
