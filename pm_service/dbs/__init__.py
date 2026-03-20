# -*- coding: utf-8 -*-
"""
@文件: __init__.py
@说明: 数据库模块统一导出
@时间: 2026/02/09
"""

# 基础管理器
from .db_manager import BaseDBManager
from .sharding_base import BaseShardingDBManager, BaseDateShardingModelMeta

# MySQL
from .mysql_db import (
    db,
    DBFunction,
    CommonModelDbSchema,
    MySQLDBManager,
    create_mysql_manager,
    # 分库分表
    ShardingMySQLManager,
    DateShardingMySQLModelMeta,
    create_sharding_mysql_manager,
)

# SQLite
from .sqlite_db import (
    SQLiteDBManager,
    ShardingSQLiteManager,
    sqlite_manager,
    sharding_sqlite_manager,
)

# Oracle
from .oracle_db import (
    OracleDBManager,
    ShardingOracleManager,
    create_oracle_manager,
    create_sharding_oracle_manager,
    # 分库分表
    DateShardingOracleManager,
    DateShardingOracleModelMeta,
    create_date_sharding_oracle_manager,
)

# 分库分表
from .sharding import (
    ShardingStrategy,
    DateShardingStrategy,
    HashShardingStrategy,
    RangeShardingStrategy,
    ShardingModelMeta,
    ShardingTableManager,
    get_sharding_strategy,
    sharding_model_decorator,
    # 按日期分库分表（类似 CommonTools）
    DateShardingDBManager,
    DateShardingModelMeta,
    create_date_sharding_manager,
)

__all__ = [
    # 基础
    "BaseDBManager",
    "BaseShardingDBManager",
    "BaseDateShardingModelMeta",
    # MySQL
    "db",
    "DBFunction",
    "CommonModelDbSchema",
    "MySQLDBManager",
    "create_mysql_manager",
    "ShardingMySQLManager",
    "DateShardingMySQLModelMeta",
    "create_sharding_mysql_manager",
    # SQLite
    "SQLiteDBManager",
    "ShardingSQLiteManager",
    "sqlite_manager",
    "sharding_sqlite_manager",
    # Oracle
    "OracleDBManager",
    "ShardingOracleManager",
    "create_oracle_manager",
    "create_sharding_oracle_manager",
    "DateShardingOracleManager",
    "DateShardingOracleModelMeta",
    "create_date_sharding_oracle_manager",
    # 分库分表策略
    "ShardingStrategy",
    "DateShardingStrategy",
    "HashShardingStrategy",
    "RangeShardingStrategy",
    "ShardingModelMeta",
    "ShardingTableManager",
    "get_sharding_strategy",
    "sharding_model_decorator",
    # SQLite 按日期分库分表
    "DateShardingDBManager",
    "DateShardingModelMeta",
    "create_date_sharding_manager",
]
