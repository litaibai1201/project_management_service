# Flask Web 开发框架 - 配置详解文档

> **定位说明：** 本文档是所有环境变量的完整参考，包含每个变量的含义、默认值和注意事项。快速上手配置请参阅 `README.md`，加密配置请参阅 `README.md#配置加密` 章节。

---

## 1. 配置系统概述

### 1.1 配置层级

```
环境变量（.env 文件或系统环境变量）  ← 最高优先级
    ↓
configs/development.py 或 configs/production.py
    ↓
configs/base.py（BaseConfig 默认值）
```

### 1.2 环境切换

通过 `FLASK_ENV` 环境变量切换配置类：

| FLASK_ENV 值 | 使用的配置类 | 日志环境 | DEBUG |
|---|---|---|---|
| `development` 或 `dev` | `DevelopmentConfig` | dev（美化格式） | True |
| `production` 或 `prd` | `ProductionConfig` | prd（JSON 格式） | False |

### 1.3 敏感字段加密

以下字段支持 `ENC(...)` 加密格式，框架在读取时自动解密：

```bash
SECRET_KEY=ENC(gAAAAABn...)
JWT_SECRET_KEY=ENC(gAAAAABn...)
MYSQL_PASSWORD=ENC(gAAAAABn...)
REDIS_PASSWORD=ENC(gAAAAABn...)
MINIO_PASSWORD=ENC(gAAAAABn...)
S3_PASSWORD=ENC(gAAAAABn...)
FTP_PASSWORD=ENC(gAAAAABn...)
ORACLE_PASSWORD=ENC(gAAAAABn...)
RABBITMQ_PASSWORD=ENC(gAAAAABn...)
```

---

## 2. 服务器配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `SERVER_HOST` | 服务监听地址 | `0.0.0.0` |
| `SERVER_PORT` | 服务监听端口 | `19999` |
| `FLASK_ENV` | 运行环境，影响配置类和日志格式 | `development` |
| `SECRET_KEY` | Flask 应用密钥（支持加密） | `dev-secret-key` |
| `CORS_ORIGINS` | 允许的跨域来源 | `*` |

---

## 3. API 文档配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `API_TITLE` | Swagger UI 页面标题 | `REST API` |
| `API_VERSION` | API 版本标识 | `v1` |

Swagger UI 访问地址：`http://localhost:19999/swagger-ui`（固定路径，不可配置）

---

## 4. JWT 认证配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `JWT_SECRET_KEY` | JWT 签名密钥（支持加密，**生产必须修改**） | `jwt-secret-key` |
| `JWT_ACCESS_TOKEN_EXPIRES` | Access Token 过期时间（秒） | `3600`（1小时） |
| `JWT_REFRESH_TOKEN_EXPIRES` | Refresh Token 过期时间（秒） | `604800`（7天） |

---

## 5. 请求与分页配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `REQUEST_TIMEOUT` | 请求超时（秒） | `30` |
| `REQUEST_MAX_RETRIES` | 最大重试次数 | `3` |
| `PAGE_SIZE_DEFAULT` | 默认分页大小 | `20` |
| `PAGE_SIZE_MAX` | 最大分页大小（防止过大查询） | `100` |
| `CACHE_DEFAULT_TIMEOUT` | 缓存默认过期时间（秒） | `300` |
| `MAX_CONTENT_LENGTH` | 文件上传最大字节数 | `16777216`（16MB） |

---

## 6. MySQL 配置

### 6.1 连接配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `MYSQL_HOST` | 数据库主机地址 | `127.0.0.1` |
| `MYSQL_PORT` | 端口 | `3306` |
| `MYSQL_DATABASE` | 数据库名 | `test` |
| `MYSQL_USERNAME` | 用户名 | `root` |
| `MYSQL_PASSWORD` | 密码（**支持加密**） | 空 |

连接字符串由框架自动拼接：`mysql+pymysql://{username}:{password}@{host}:{port}/{database}?charset=utf8`

### 6.2 连接池配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `SQLPOOL_POOL_SIZE` | 连接池大小（常驻连接数） | `10` |
| `SQLPOOL_MAX_OVERFLOW` | 超出 pool_size 后的最大额外连接 | `20` |
| `SQLPOOL_POOL_RECYCLE` | 连接最长复用时间（秒），防 MySQL 8h 断开 | `3600` |
| `SQLPOOL_PRE_PING` | 获取连接前执行 `SELECT 1` 健康检查 | `true` |

---

## 7. Redis 配置

### 7.1 连接配置

框架通过以下独立环境变量构建 Redis URL（**不支持直接设置 `REDIS_URL`**）：

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `REDIS_HOST` | 主机地址 | `127.0.0.1` |
| `REDIS_PORT` | 端口 | `6379` |
| `REDIS_DATABASE` | 数据库索引 | `0` |
| `REDIS_USERNAME` | 用户名（ACL 认证，可选） | 空 |
| `REDIS_PASSWORD` | 密码（**支持加密**） | 空 |
| `REDIS_REQUIRED` | Redis 不可用时是否终止服务启动 | `true` |

> 设置 `REDIS_REQUIRED=false` 可在 Redis 不可用时降级运行，但缓存功能不可用。

### 7.2 连接池配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `REDIS_POOL_SIZE` | 连接池初始大小 | `10` |
| `REDIS_MAX_CONNECTIONS` | 最大连接数上限 | `50` |
| `REDIS_SOCKET_KEEPALIVE` | 启用 TCP Keep-Alive，防止长连接被防火墙断开 | `true` |
| `REDIS_SOCKET_CONNECT_TIMEOUT` | 建立连接超时（秒） | `5` |
| `REDIS_SOCKET_TIMEOUT` | 读写操作超时（秒） | `5` |
| `REDIS_RETRY_ON_TIMEOUT` | 超时后自动重试 | `true` |
| `REDIS_HEALTH_CHECK_INTERVAL` | 空闲连接健康检查间隔（秒） | `30` |

---

## 8. Celery 配置

Celery 用于异步任务和定时任务，需要配置消息代理（Broker）和结果存储（Backend）。

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `CELERY_BROKER_URL` | 消息代理地址（推荐 Redis DB 1） | `redis://127.0.0.1:6379/1` |
| `CELERY_RESULT_BACKEND` | 任务结果存储（推荐 Redis DB 2） | `redis://127.0.0.1:6379/2` |
| `CELERY_RESULT_EXPIRES` | 任务结果保留时间（秒） | `3600` |
| `CELERY_TASK_SERIALIZER` | 任务序列化格式（`json`/`pickle`） | `json` |
| `CELERY_RESULT_SERIALIZER` | 结果序列化格式 | `json` |
| `CELERY_TIMEZONE` | 时区（影响定时任务） | `Asia/Shanghai` |
| `CELERY_ENABLE_UTC` | 是否使用 UTC 时间 | `false` |
| `CELERY_TASK_TIME_LIMIT` | 任务硬超时（秒），超时强制终止 | `3600` |
| `CELERY_TASK_SOFT_TIME_LIMIT` | 任务软超时（秒），超时抛出 SoftTimeLimitExceeded | `3000` |
| `CELERY_WORKER_PREFETCH_MULTIPLIER` | Worker 预取任务倍数 | `4` |
| `CELERY_WORKER_MAX_TASKS_PER_CHILD` | Worker 子进程最大任务数，防内存泄漏 | `1000` |

---

## 9. RabbitMQ 配置

RabbitMQ 用于消息队列（独立于 Celery 使用）。

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `RABBITMQ_HOST` | 服务器地址 | `127.0.0.1` |
| `RABBITMQ_PORT` | AMQP 端口 | `5672` |
| `RABBITMQ_USERNAME` | 用户名 | `guest` |
| `RABBITMQ_PASSWORD` | 密码（**支持加密**） | `guest` |
| `RABBITMQ_VIRTUAL_HOST` | 虚拟主机（隔离不同业务） | `/` |
| `RABBITMQ_CONNECTION_TIMEOUT` | 连接超时（秒） | `10` |
| `RABBITMQ_HEARTBEAT` | 心跳超时（秒），防止连接被中断 | `600` |

---

## 10. MinIO 配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `MINIO_HOST` | MinIO 服务地址 | `127.0.0.1` |
| `MINIO_PORT` | MinIO 服务端口 | `9000` |
| `MINIO_USERNAME` | Access Key | `minioadmin` |
| `MINIO_PASSWORD` | Secret Key（**支持加密**） | `minioadmin` |
| `MINIO_SECURE` | 使用 HTTPS | `false` |

---

## 11. AWS S3 配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `S3_ENDPOINT` | S3 服务端点（兼容 MinIO 等 S3 协议存储） | `http://127.0.0.1:8080` |
| `S3_USERNAME` | Access Key ID | 空 |
| `S3_PASSWORD` | Secret Access Key（**支持加密**） | 空 |
| `S3_REGION` | 区域 | `us-east-1` |

---

## 12. Elasticsearch 配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `ES_HOSTS` | 节点地址列表，多节点用逗号分隔 | `http://127.0.0.1:9200` |
| `ES_USERNAME` | 用户名（Basic Auth） | 空 |
| `ES_PASSWORD` | 密码 | 空 |
| `ES_API_KEY` | API Key 认证（与用户名密码二选一） | 空 |
| `ES_VERIFY_CERTS` | 验证 SSL 证书 | `true` |
| `ES_CA_CERTS` | CA 证书路径（自签证书时使用） | 空 |
| `ES_TIMEOUT` | 请求超时（秒） | `30` |
| `ES_MAX_RETRIES` | 最大重试次数 | `3` |
| `ES_RETRY_ON_TIMEOUT` | 超时后自动重试 | `true` |

---

## 13. MongoDB 配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `MONGO_URI` | 连接字符串（支持认证：`mongodb://user:pass@host:port`） | `mongodb://127.0.0.1:27017` |
| `MONGO_DATABASE` | 默认数据库名 | `test` |
| `MONGO_MAX_POOL_SIZE` | 连接池最大连接数 | `100` |
| `MONGO_MIN_POOL_SIZE` | 连接池最小连接数 | `10` |
| `MONGO_CONNECT_TIMEOUT` | 建立连接超时（毫秒） | `5000` |
| `MONGO_SERVER_SELECTION_TIMEOUT` | 服务器选择超时（毫秒） | `5000` |

---

## 14. InfluxDB 配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `INFLUXDB_URL` | 服务地址 | `http://127.0.0.1:8086` |
| `INFLUXDB_TOKEN` | 访问令牌（InfluxDB 2.x 认证方式） | 空 |
| `INFLUXDB_ORG` | 组织名称 | 空 |
| `INFLUXDB_BUCKET` | 默认 Bucket（数据库） | 空 |
| `INFLUXDB_TIMEOUT` | 请求超时（毫秒） | `10000` |
| `INFLUXDB_VERIFY_SSL` | 验证 SSL 证书 | `true` |

---

## 15. Oracle 配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `ORACLE_HOST` | 主机地址 | `127.0.0.1` |
| `ORACLE_PORT` | 端口 | `1521` |
| `ORACLE_USERNAME` | 用户名 | 空 |
| `ORACLE_PASSWORD` | 密码（**支持加密**） | 空 |
| `ORACLE_SERVICE_NAME` | 服务名 | 空 |
| `ORACLE_POOL_SIZE` | 连接池大小 | `10` |
| `ORACLE_MAX_OVERFLOW` | 最大溢出连接 | `20` |
| `ORACLE_POOL_RECYCLE` | 连接回收时间（秒） | `3600` |
| `ORACLE_POOL_PRE_PING` | 连接前健康检查 | `true` |

---

## 16. SQLite 配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `SQLITE_DB_PATH` | 数据库文件目录 | `./data/sqlite` |
| `SQLITE_DB_NAME` | 数据库文件名 | `app.db` |
| `SQLITE_POOL_SIZE` | 连接池大小 | `5` |
| `SQLITE_MAX_OVERFLOW` | 最大溢出连接 | `10` |
| `SQLITE_POOL_TIMEOUT` | 获取连接超时（秒） | `30` |
| `SQLITE_POOL_PRE_PING` | 连接前健康检查 | `true` |
| `SQLITE_CONNECT_TIMEOUT` | 建立连接超时（秒） | `30` |

---

## 17. 分库分表配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `SHARDING_DB_ENABLED` | 启用分库（按日期连接不同 database） | `false` |
| `SHARDING_TABLE_ENABLED` | 启用分表（表名带日期后缀） | `false` |
| `SHARDING_DB_FORMAT` | 分库日期格式 | `%Y%m%d` |
| `SHARDING_TABLE_FORMAT` | 分表日期格式 | `%Y%m%d` |
| `SHARDING_STRATEGY` | 分片策略（当前支持 `date`） | `date` |
| `SHARDING_POOL_SIZE` | 分片连接池大小 | `10` |
| `SHARDING_MAX_OVERFLOW` | 最大溢出连接 | `20` |
| `SHARDING_POOL_RECYCLE` | 连接回收时间（秒） | `3600` |
| `SHARDING_POOL_TIMEOUT` | 获取连接超时（秒） | `30` |
| `SHARDING_POOL_PRE_PING` | 连接前健康检查 | `true` |

日期格式说明：

| 格式 | 示例 | 说明 |
|------|------|------|
| `%Y%m%d` | `20240115` | 按天分片 |
| `%Y%m` | `202401` | 按月分片 |
| `%Y` | `2024` | 按年分片 |
| `%Y_w%W` | `2024_w03` | 按周分片 |

---

## 18. 限流配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `RATELIMIT_ENABLED` | 是否启用限流 | `true` |
| `RATELIMIT_DEFAULT` | 全局默认限流规则 | `200 per day, 50 per hour` |
| `RATELIMIT_STORAGE_URI` | 限流计数存储后端（`memory://` 或 Redis URL） | `memory://` |

> 生产环境多实例部署时，`RATELIMIT_STORAGE_URI` 应设置为 Redis 地址，确保多实例共享计数：
> ```bash
> RATELIMIT_STORAGE_URI=redis://127.0.0.1:6379/3
> ```

---

## 19. FTP 配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `FTP_ENABLED` | 是否启用 FTP 客户端 | `false` |
| `FTP_HOST` | FTP 服务器地址 | `127.0.0.1` |
| `FTP_PORT` | FTP 端口 | `21` |
| `FTP_USERNAME` | 用户名 | 空 |
| `FTP_PASSWORD` | 密码（**支持加密**） | 空 |
| `FTP_TIMEOUT` | 连接超时（秒） | `30` |

---

## 20. 日志配置

日志系统通过 `loggers/conf/logging.yaml` 配置文件管理，以下环境变量可覆盖配置文件的值：

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `FLASK_ENV` | 运行环境（`dev`=美化格式+控制台，`prd`=JSON 文件） | `development` |
| `APP_SERVICE_NAME` | 服务名称，写入日志的 `service_name` 字段 | `AIML_DATASET_SERVICE` |
| `APP_ENV` | 日志环境（优先级高于 `FLASK_ENV`，可用 `dev`/`prd`） | 跟随 `FLASK_ENV` |
| `LOGGERS_CONFIG_PATH` | 日志配置文件路径 | `loggers/conf/logging.yaml` |

日志文件路径等详细配置请直接修改 `loggers/conf/logging.yaml`。
