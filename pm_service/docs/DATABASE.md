# Flask Web 开发框架 - 数据库设计文档

> **定位说明：** 本文档聚焦于实际表结构 DDL、事务使用模式和分库分表配置。数据库支持列表和配置项请参阅 `README.md`，MongoDB/InfluxDB/Elasticsearch 的使用方法请参阅对应的 `*_USAGE.md` 文档。

---

## 1. ORM 模型设计

### 1.1 BaseMixinModel（公共字段基类）

所有业务表继承此基类，自动拥有以下公共字段：

```python
class BaseMixinModel(db.Model):
    __abstract__ = True

    status           = db.Column(db.Integer, default=1)  # 状态：1=正常, 0=禁用
    created_at       = db.Column(db.String(19), nullable=False)  # 创建时间，格式 "YYYY-MM-DD HH:MM:SS"
    update_at        = db.Column(db.String(19))   # 更新时间
    status_update_at = db.Column(db.String(19))   # 状态变更时间
```

注意事项：
- 时间字段类型为 `String(19)` 而非 `DateTime`，存储格式固定为 `"YYYY-MM-DD HH:MM:SS"`
- `created_at` 默认值由 `CommonTools.get_now` 在 Python 层生成（非数据库 DEFAULT）
- 主键由子类定义（UUID String 32）

### 1.2 TestModel（test_form 表）

```python
class TestModel(BaseMixinModel):
    __tablename__ = "test_form"

    id       = db.Column(db.String(32), primary_key=True, default=generate_uuid)  # UUID，32位十六进制
    work_no  = db.Column(db.String(32), nullable=False, unique=True)  # 工号，唯一约束
    password = db.Column(db.String(32), nullable=False)               # 密码
    username = db.Column(db.String(32), nullable=False)               # 用户名
```

对应 DDL：

```sql
CREATE TABLE test_form (
    id               VARCHAR(32)  NOT NULL PRIMARY KEY COMMENT 'UUID主键',
    work_no          VARCHAR(32)  NOT NULL UNIQUE       COMMENT '工号',
    password         VARCHAR(32)  NOT NULL               COMMENT '密码',
    username         VARCHAR(32)  NOT NULL               COMMENT '用户名',
    status           INT          DEFAULT 1              COMMENT '状态: 1-正常, 0-禁用',
    created_at       VARCHAR(19)  NOT NULL               COMMENT '创建时间',
    update_at        VARCHAR(19)                         COMMENT '更新时间',
    status_update_at VARCHAR(19)                         COMMENT '状态更新时间',
    INDEX idx_work_no (work_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='测试数据表';
```

### 1.3 OperationLogModel（operation_log 表）

用于记录用户操作，演示多表事务：

```python
class OperationLogModel(BaseMixinModel):
    __tablename__ = "operation_log"

    id           = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    work_no      = db.Column(db.String(32), nullable=False, index=True)  # 操作人工号
    operation    = db.Column(db.String(50), nullable=False)              # 操作类型，如 "create"
    target_table = db.Column(db.String(50))                             # 目标表名
    target_id    = db.Column(db.String(32))                             # 目标记录 ID
    detail       = db.Column(db.Text)                                   # 操作详情（JSON 字符串）
```

对应 DDL：

```sql
CREATE TABLE operation_log (
    id           VARCHAR(32)  NOT NULL PRIMARY KEY COMMENT 'UUID主键',
    work_no      VARCHAR(32)  NOT NULL               COMMENT '操作人工号',
    operation    VARCHAR(50)  NOT NULL               COMMENT '操作类型',
    target_table VARCHAR(50)                         COMMENT '目标表名',
    target_id    VARCHAR(32)                         COMMENT '目标记录ID',
    detail       TEXT                                COMMENT '操作详情',
    status           INT      DEFAULT 1              COMMENT '状态',
    created_at       VARCHAR(19) NOT NULL            COMMENT '创建时间',
    update_at        VARCHAR(19)                     COMMENT '更新时间',
    status_update_at VARCHAR(19)                     COMMENT '状态更新时间',
    INDEX idx_work_no (work_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作日志表';
```

---

## 2. DBFunction 使用指南

`DBFunction` 是封装了常见数据库操作的辅助类，位于 `dbs/mysql_db/__init__.py`，自动处理 commit/rollback。

### 2.1 单表操作（自动提交）

```python
from dbs.mysql_db import DBFunction, db
from dbs.mysql_db.model_tables import TestModel

# 插入单条记录
record = TestModel(work_no="1001", username="张三", password="hashed_pwd")
DBFunction.db_add(record)          # 成功返回 True，失败返回 False（并自动 rollback）

# 删除单条记录（需先查出对象）
record = db.session.get(TestModel, record_id)
DBFunction.db_delete(record)

# 跨表批量插入（一次 commit）
records = [TestModel(...), OperationLogModel(...)]
DBFunction.db_add_all(records)

# 同表高性能批量插入（使用 bulk_save_objects，性能更好）
records = [TestModel(...), TestModel(...), TestModel(...)]
DBFunction.db_bulk_insert(records)
```

### 2.2 多表事务（context manager）

```python
from dbs.mysql_db import DBFunction
from dbs.mysql_db.model_tables import TestModel, OperationLogModel
from utils.exceptions import DatabaseException

def add_user_with_log(user_data: dict, operator: str):
    """创建用户并写入操作日志（两表原子操作）"""
    try:
        with DBFunction.transaction() as session:
            # 插入用户记录
            user = TestModel(
                work_no=user_data["work_no"],
                username=user_data["username"],
                password=user_data["password"],
            )
            session.add(user)
            session.flush()  # 立即写入（不提交），可获取 id

            # 插入操作日志
            log = OperationLogModel(
                work_no=operator,
                operation="create",
                target_table="test_form",
                target_id=user.id,
                detail=str(user_data),
            )
            session.add(log)
            # with 块正常结束 → 自动 commit
    except Exception:
        # with 块内任意异常 → 自动 rollback → re-raise
        raise DatabaseException(msg="创建用户失败")
```

### 2.3 execute_in_transaction（函数列表事务）

适合将多个独立操作组合为事务：

```python
def op1(session):
    session.add(TestModel(work_no="1001", username="张三", password="pwd"))

def op2(session):
    session.query(TestModel).filter_by(work_no="1000").update({"status": 0})

# 两个操作作为一个事务执行
DBFunction.execute_in_transaction([op1, op2])
```

---

## 3. 分库分表

### 3.1 配置说明

分库分表功能默认**关闭**，通过环境变量开启：

```bash
# 分库（连接不同的 database）
SHARDING_DB_ENABLED=true
SHARDING_DB_FORMAT=%Y%m        # 按月分库: myapp_202401, myapp_202402

# 分表（表名带日期后缀）
SHARDING_TABLE_ENABLED=true
SHARDING_TABLE_FORMAT=%Y%m%d   # 按天分表: orders_20240115

# 两者独立开关，可只启用其中一个
# 常用格式：%Y%m%d(天), %Y%m(月), %Y(年), %Y_w%W(周)
```

连接池配置：
```bash
SHARDING_POOL_SIZE=10
SHARDING_MAX_OVERFLOW=20
SHARDING_POOL_RECYCLE=3600
SHARDING_POOL_TIMEOUT=30
SHARDING_POOL_PRE_PING=true
```

### 3.2 ShardingMySQLManager 使用

```python
from dbs.mysql_db import create_sharding_mysql_manager

# 方式一：使用环境变量配置（推荐）
manager = create_sharding_mysql_manager()

# 方式二：手动指定参数（覆盖环境变量）
manager = create_sharding_mysql_manager(
    sharding_db_enabled=True,
    sharding_table_enabled=True,
    sharding_db_format="%Y%m",      # 月度分库: myapp_202401
    sharding_table_format="%Y%m%d", # 日级分表: orders_20240115
)
```

### 3.3 按日期分表模型

使用 `DateShardingMySQLModelMeta` 元类定义按日期分表的模型：

```python
from dbs.mysql_db import DateShardingMySQLModelMeta, sharding_mysql_manager
from sqlalchemy import Column, Integer, String

class OrderModel(metaclass=DateShardingMySQLModelMeta):
    __tablename__ = "orders"
    __db_manager__ = sharding_mysql_manager
    __use_sharding_db__ = False  # 只分表，不分库

    id     = Column(Integer, primary_key=True)
    amount = Column(Integer)

# 获取指定日期对应的表模型
Order20240115 = OrderModel("2024-01-15")  # 对应 orders_20240115 表

# 查询
with manager.get_session("2024-01-15") as session:
    records = session.query(Order20240115).all()
```

---

## 4. 数据库迁移

项目集成了 Flask-Migrate（Alembic）。

```bash
# 初始化迁移目录（仅首次）
flask db init

# 生成迁移脚本（检测模型变更）
flask db migrate -m "add_new_column"

# 执行迁移（升级到最新版本）
flask db upgrade

# 回滚上一个版本
flask db downgrade

# 查看当前版本
flask db current
```

> 注意：`app.py` 中已设置 `db.create_all()`，开发阶段会自动建表。生产环境建议改用 `flask db upgrade` 管理版本。

---

## 5. 连接池配置

### 5.1 MySQL 连接池（Flask-SQLAlchemy）

通过 `BaseConfig.SQLALCHEMY_ENGINE_OPTIONS` 属性动态构建：

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `SQLPOOL_POOL_SIZE` | 连接池大小（常驻连接数） | 10 |
| `SQLPOOL_MAX_OVERFLOW` | 超出 pool_size 后的最大额外连接数 | 20 |
| `SQLPOOL_POOL_RECYCLE` | 连接最长复用时间（秒），防止 MySQL 8h 超时断开 | 3600 |
| `SQLPOOL_PRE_PING` | 每次获取连接前执行 `SELECT 1` 检查连通性 | true |

最大并发连接数 = `SQLPOOL_POOL_SIZE` + `SQLPOOL_MAX_OVERFLOW` = 30（默认）

### 5.2 连接池设计说明

- `pool_recycle=3600`：MySQL 默认 8 小时断开空闲连接，设置 1 小时回收防止连接失效
- `pool_pre_ping=true`：发现连接失效时自动重连，避免 `Lost connection` 报错
- `QueuePool`（默认）：线程安全，适合 WSGI 多线程环境

---

## 6. NoSQL 数据库

### 6.1 MongoDB

详细使用方法请参阅：[MONGODB_USAGE.md](MONGODB_USAGE.md)

连接配置：
```bash
MONGO_URI=mongodb://127.0.0.1:27017   # 支持认证: mongodb://user:pass@host:port
MONGO_DATABASE=test
MONGO_MAX_POOL_SIZE=100
MONGO_MIN_POOL_SIZE=10
MONGO_CONNECT_TIMEOUT=5000            # 毫秒
MONGO_SERVER_SELECTION_TIMEOUT=5000   # 毫秒
```

### 6.2 InfluxDB（时序数据库）

详细使用方法请参阅：[INFLUXDB_USAGE.md](INFLUXDB_USAGE.md)

连接配置：
```bash
INFLUXDB_URL=http://127.0.0.1:8086
INFLUXDB_TOKEN=your-token
INFLUXDB_ORG=my-org
INFLUXDB_BUCKET=my-bucket
INFLUXDB_TIMEOUT=10000   # 毫秒
```

### 6.3 Elasticsearch（搜索引擎）

详细使用方法请参阅：[ELASTICSEARCH_USAGE.md](ELASTICSEARCH_USAGE.md)

连接配置：
```bash
ES_HOSTS=http://127.0.0.1:9200   # 多节点用逗号分隔
ES_USERNAME=
ES_PASSWORD=
ES_API_KEY=
ES_VERIFY_CERTS=true
ES_TIMEOUT=30
ES_MAX_RETRIES=3
ES_RETRY_ON_TIMEOUT=true
```
