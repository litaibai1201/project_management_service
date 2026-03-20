# Flask Web 开发框架 - 架构设计文档

> **定位说明：** 本文档聚焦于架构决策、模块交互和请求生命周期。项目目录结构、技术栈列表、配置说明等内容请参阅 `README.md`。

---

## 1. 架构模式与设计决策

### 1.1 MVC 分层架构

选择 MVC 的核心原因是**职责清晰**，各层可独立测试和替换：

| 层 | 职责边界 | 不允许做的事 |
|---|---|---|
| **View** | 接收 HTTP 请求、参数校验、调用 Controller、返回响应 | 不包含业务逻辑、不直接操作数据库 |
| **Controller** | 业务逻辑、缓存策略、多层协调 | 不直接处理 HTTP 请求/响应对象 |
| **Model** | 数据库 CRUD、事务管理 | 不包含业务规则 |

### 1.2 工厂模式 (create_app)

使用工厂函数而非模块级全局实例，原因：
- 支持按环境（dev/prd）创建不同配置的实例
- 方便测试时创建隔离的应用实例
- 避免循环导入问题（扩展通过 `init_app()` 延迟绑定）

```python
# app.py
def create_app(config_name=None):
    app = Flask(__name__)
    app.config.from_object(config[config_name]())  # 配置注入
    db.init_app(app)          # 延迟绑定，避免循环导入
    redis_client.init_app(app)
    auth_manager.init_app(app)
    ...
    return app
```

### 1.3 统一响应格式

所有接口强制返回固定结构，便于客户端统一处理：

```json
{"code": "S10000", "msg": "OK", "content": {...}}
```

错误时由全局 `error_handler` 捕获并转换，业务代码只需抛出异常，无需关心响应格式：

```python
# 业务代码
raise ResourceNotFoundException(resource_type="用户")

# 全局 error_handler 自动转为：
# {"code": "F40001", "msg": "用户不存在", "content": {}}
```

### 1.4 配置加密决策

`.env` 文件中的敏感字段支持 `ENC(...)` 格式，由 `crypto/fernet.py` 在读取时自动解密。设计原则：
- 加密/解密对业务代码完全透明（通过 `_get_secret()` 封装）
- 主密钥不存入代码库（环境变量或 `.master.key` 文件）
- 支持批量加密（`python -m crypto.cli encrypt-env .env`）

---

## 2. 模块交互关系

```
┌─────────────────────────────────────────────────────┐
│                     HTTP 请求                        │
└─────────────────────────────────────────────────────┘
                          │
                    Flask-Limiter
                  (速率限制检查)
                          │
              FlaskHooks.before_request
          (生成 X-Request-ID，记录请求日志)
                          │
                  JWT 验证（可选）
               (@jwt_required 装饰器)
                          │
              ┌───────────────────────┐
              │      View 层          │
              │  Marshmallow 参数校验  │
              │  调用 Controller       │
              └───────────────────────┘
                          │
              ┌───────────────────────┐
              │    Controller 层      │
              │  业务逻辑             │
              │  Redis 缓存策略       │
              │  调用 Model           │
              └───────────────────────┘
                     │        │
           ┌─────────┘        └──────────┐
    ┌──────────────┐       ┌─────────────────┐
    │  Model 层    │       │  Redis (cache/) │
    │  DB 操作     │       │  缓存读写       │
    └──────────────┘       └─────────────────┘
           │
    ┌──────────────────────────────────┐
    │         dbs/ 数据库层            │
    │  MySQL  MongoDB  InfluxDB  ES    │
    └──────────────────────────────────┘
                          │
              FlaskHooks.after_request
          (添加 X-Response-Time，记录响应日志)
                          │
                    HTTP 响应
```

---

## 3. 请求完整生命周期

以 `POST /api/test`（创建记录，需要认证）为例：

### 阶段 1：进入 Flask

```
客户端发送请求
  → Flask-Limiter 检查速率（超限则直接返回 429）
  → FlaskHooks.before_request 执行：
      - 从 Header 读取或生成 X-Request-ID
      - structlog.contextvars 绑定 request_id、path、method
      - 记录 "HTTP 请求开始" 日志
```

### 阶段 2：路由匹配与认证

```
  → flask-smorest 路由匹配到 TestApi.post
  → @jwt_required() 验证 Authorization: Bearer <token>
      - Token 无效 → 抛出 AuthenticationException(F20001) → 跳到阶段 5
      - Token 有效 → 继续
```

### 阶段 3：View 层

```
  → @blp.arguments(TestSchema) 执行 Marshmallow 校验
      - 校验失败 → 抛出 ValidationException(F10002) → 跳到阶段 5
      - 校验通过 → payload 传入 post(self, payload)
  → 调用 self.controller.add(payload)
```

### 阶段 4：Controller + Model 层

```
  → TestController.add(payload)
      - 查 Redis 缓存，判断记录是否已存在
      - 已存在 → 抛出 ResourceExistsException(F40002) → 跳到阶段 5
      - 不存在 → 调用 OperTestModel().add_with_log(payload)
  → OperTestModel.add_with_log()
      - with DBFunction.transaction() as session:
          session.add(TestModel(...))      # 写 test_form 表
          session.add(OperationLogModel(...))  # 写 operation_log 表
          # 正常结束 → 自动 commit
          # 异常 → 自动 rollback → 抛出 DatabaseException(F70001)
      - FlaskHooks SQL 追踪记录每条 SQL 及耗时
  → Controller 清除相关 Redis 缓存
  → 返回数据给 View 层
```

### 阶段 5：响应构造

```
  → View 层调用 response_result(content=payload, msg="创建成功")
    构造：{"code": "S10000", "msg": "创建成功", "content": {...}}
  → 异常路径：全局 error_handler 捕获 APIException
    构造：{"code": "F40002", "msg": "资源已存在", "content": {}}
  → FlaskHooks.after_request 执行：
      - 在响应头写入 X-Response-Time
      - 记录 "HTTP 响应" 日志（含状态码、耗时）
```

---

## 4. 日志系统设计

### 4.1 处理器链

```
业务代码 logger.info("消息", key=value, ...)
    ↓
structlog 处理器链（按顺序执行）：
  1. merge_contextvars   → 合并 before_request 绑定的 request_id 等上下文
  2. validate_log_structure → Pydantic LogModel 验证结构（不阻断业务）
  3. add_log_level       → 添加 level 字段
  4. TimeStamper         → 添加 ISO 格式时间戳
  5. wrap_for_formatter  → 交给 stdlib ProcessorFormatter
    ↓
ProcessorFormatter（根据环境选择渲染器）：
  - dev:  PrettyRenderer(colors=True)  → 控制台彩色输出
          PrettyRenderer(colors=False) → 文件人类可读格式
  - prd:  JSONRenderer                 → JSON 格式写入文件
    ↓
OrganizedFileHandler（按日期滚动，支持 gzip 归档）
    ↓ （可选，高并发场景）
QueueHandler → 队列 → QueueListener（后台线程异步写文件）
```

### 4.2 队列模式的必要性

Flask 是 WSGI 同步框架，文件 I/O 写日志会阻塞工作线程。在高并发或使用异步视图（Flask 3 async）时，启用 `QueueHandler`：

- 业务线程：`日志对象 → 队列` （微秒级，非阻塞）
- 后台线程：`队列 → 文件写入` （串行，无竞争）

```python
# 启用方式（三选一）
configure_logger(use_queue_handler=True)          # 代码指定
# 或 logging.yaml 中设置 use_queue_handler: true
# 或 export LOG_USE_QUEUE_HANDLER=true
```

### 4.3 请求追踪

`FlaskHooks` 在 `before_request` 阶段将以下字段绑定到 structlog contextvars，之后该请求产生的所有日志自动携带这些字段：

| 字段 | 来源 | 说明 |
|------|------|------|
| `request_id` | `X-Request-ID` Header 或自动生成 | 单次请求唯一标识 |
| `trace_id` | `X-Trace-Id` Header | 跨服务链路追踪 |
| `path` | `request.path` | 请求路径 |
| `method` | `request.method` | HTTP 方法 |

响应头中会自动添加：
- `X-Request-ID` — 请求标识（回传给客户端）
- `X-Response-Time` — 服务端处理耗时（毫秒）

---

## 5. 数据库设计决策

### 5.1 双轨并行：Flask-SQLAlchemy + 独立引擎

框架维护两套数据库连接：

| 实例 | 用途 |
|------|------|
| `dbs/mysql_db/db`（Flask-SQLAlchemy） | ORM 模型定义、常规 CRUD、和 Flask 应用上下文绑定 |
| `MySQLDBManager`（独立 SQLAlchemy 引擎） | 需要独立连接池、跨 Flask 上下文使用（如 Celery 任务） |

### 5.2 DBFunction 封装决策

直接使用 `db.session` 容易遗漏 `commit`/`rollback`，`DBFunction` 封装了固定模式：

```python
# 单表操作：自动 commit/rollback
DBFunction.db_add(model_instance)
DBFunction.db_delete(model_instance)
DBFunction.db_bulk_insert([m1, m2, m3])  # 同表高性能批量插入

# 多表事务：context manager 保证原子性
with DBFunction.transaction() as session:
    session.add(record1)
    session.add(record2)
    # with 块正常退出 → commit
    # 任意异常 → rollback → re-raise
```

### 5.3 分库分表设计

`ShardingMySQLManager` 基于日期实现分库（连接不同 database）和分表（表名带日期后缀），两者可独立开关：

```
SHARDING_DB_ENABLED=true, SHARDING_DB_FORMAT=%Y%m
  → 每月一个库: myapp_202401, myapp_202402 ...

SHARDING_TABLE_ENABLED=true, SHARDING_TABLE_FORMAT=%Y%m%d
  → 每天一张表: orders_20240115, orders_20240116 ...
```

引擎按分片标识缓存，相同分片复用连接池，避免频繁建立连接。

---

## 6. 缓存策略

### 6.1 Cache-Aside 模式

Controller 层负责缓存策略，Model 层不感知缓存：

```
读：先查 Redis → 命中则返回；未命中则查 DB → 写入 Redis → 返回
写：写 DB → 删除（或更新）对应 Redis 缓存
```

### 6.2 @cache_result 装饰器

适用于"计算/查询成本高、变化不频繁"的函数：

```python
@cache_result(ttl=300, key_prefix="user_info")
def get_user_info(user_id: int) -> dict:
    # 首次调用：执行函数体，结果写入 Redis，key = "user_info:{user_id}"
    # 后续调用：直接从 Redis 读取，不执行函数体
    # TTL 到期后：自动重新执行
    return db_query(user_id)
```

### 6.3 Redis 连接池复用

`redis_client` 是全局单例，所有 `OperRedis` 实例共享同一个连接池（`ConnectionPool`），避免每次请求创建新连接：

```python
# cache/__init__.py
redis_client = RedisClient()  # 全局单例，连接池在 init_app 时初始化

# 所有 OperRedis 实例共用同一个 pool
redis = OperRedis()  # 内部使用 redis_client 的连接池
```

---

## 7. 安全设计

### 7.1 分层防御

```
网络层: Flask-Limiter（速率限制，防爆破）
    ↓
认证层: JWT（防未授权访问）
    ↓
输入层: Marshmallow Schema（防注入、防格式错误）
    ↓
数据层: SQLAlchemy ORM（参数化查询，防 SQL 注入）
    ↓
配置层: Fernet 加密（防密码泄露）
```

### 7.2 错误信息安全

`error_handler` 对外只暴露业务码和友好消息，不暴露：
- 异常堆栈（stack trace）
- SQL 语句
- 内部服务地址
- 数据库字段名

详细错误信息仅写入日志文件，不进入响应体。
