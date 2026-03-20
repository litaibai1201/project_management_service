# -*- coding: utf-8 -*-
"""
@文件: __init__.py
@说明: MySQL 数据库管理模块
@时间: 2025-09-03/08/28 10:25:13
"""
from contextlib import contextmanager
from typing import Any, Dict, Generator, List, Optional

from utils.tools import TryExcept
from flask_sqlalchemy import SQLAlchemy
from marshmallow import Schema, fields
from sqlalchemy import Boolean, Integer, create_engine
from sqlalchemy.pool import QueuePool

from configs.base import BaseConfig
from dbs.db_manager import BaseDBManager
from loggers import logger

db = SQLAlchemy()


class MySQLDBManager(BaseDBManager):
    """MySQL 数据库管理器（独立于 Flask-SQLAlchemy）"""

    def __init__(self, config: Optional[Dict] = None):
        self._base_config = BaseConfig()
        if config is None:
            config = {
                "uri": self._base_config.SQLALCHEMY_DATABASE_URI,
                **self._base_config.SQLALCHEMY_ENGINE_OPTIONS,
            }
        super().__init__(config)

    def get_connection_uri(self) -> str:
        """获取 MySQL 连接 URI"""
        return self.config.get("uri", self._base_config.SQLALCHEMY_DATABASE_URI)

    def _create_engine(self):
        """创建 MySQL 引擎"""
        try:
            engine = create_engine(
                self.get_connection_uri(),
                poolclass=QueuePool,
                pool_size=self.config.get("pool_size", 10),
                max_overflow=self.config.get("max_overflow", 20),
                pool_recycle=self.config.get("pool_recycle", 3600),
                pool_pre_ping=self.config.get("pool_pre_ping", True),
                echo=False,
            )
            logger.info(
                "MySQL 引擎创建成功",
                category="business",
                event="mysql_engine_created",
            )
            return engine
        except Exception as e:
            logger.error(
                "MySQL 引擎创建失败",
                category="error",
                event="mysql_engine_create_failed",
                error=e,
            )
            raise


class DBFunction:
    """
    Flask-SQLAlchemy 数据库操作辅助类

    提供：
    - 单表 CRUD 操作（自动提交）
    - 多表事务操作（事务上下文管理器）
    - 批量操作

    使用示例：
    ```python
    # 单表操作（自动提交）
    DBFunction.db_add(model)

    # 多表事务操作
    with DBFunction.transaction() as session:
        session.add(model1)
        session.add(model2)
        # 自动提交，异常时自动回滚
    ```
    """

    @staticmethod
    @contextmanager
    def transaction() -> Generator:
        """
        事务上下文管理器 - 用于多表操作

        在 with 块中的所有操作作为一个事务执行：
        - 正常结束时自动提交
        - 发生异常时自动回滚

        使用示例：
        ```python
        with DBFunction.transaction() as session:
            # 插入表1
            session.add(User(name="test"))
            # 插入表2
            session.add(Order(user_id=1, amount=100))
            # 更新表3
            session.query(Product).filter_by(id=1).update({"stock": 99})
            # 所有操作成功后自动提交
        ```

        Returns:
            session: 数据库会话对象
        """
        try:
            yield db.session
            db.session.commit()
            logger.debug(
                "事务提交成功",
                event="transaction_commit_success",
            )
        except Exception as e:
            db.session.rollback()
            logger.error(
                "事务回滚",
                category="error",
                event="transaction_rollback",
                error=e,
            )
            raise

    @staticmethod
    def db_add(model_instance):
        """添加单条记录（自动提交）"""
        try:
            db.session.add(model_instance)
            db.session.commit()
            logger.debug(
                "数据库添加记录成功",
                event="db_add_success",
                custom={"table": model_instance.__tablename__}
            )
            return True
        except Exception as e:
            db.session.rollback()
            logger.error(
                "数据库添加记录失败",
                category="error",
                event="db_add_failed",
                error=e,
            )
            return False

    @staticmethod
    def db_add_all(model_instances: List):
        """添加多条记录（自动提交，可跨表）"""
        try:
            db.session.add_all(model_instances)
            db.session.commit()
            logger.debug(
                "数据库批量添加成功",
                event="db_add_all_success",
                custom={"count": len(model_instances)}
            )
            return True
        except Exception as e:
            db.session.rollback()
            logger.error(
                "数据库批量添加失败",
                category="error",
                event="db_add_all_failed",
                error=e,
            )
            return False

    @staticmethod
    def db_delete(model_instance):
        """删除单条记录（自动提交）"""
        try:
            db.session.delete(model_instance)
            db.session.commit()
            logger.debug(
                "数据库删除记录成功",
                event="db_delete_success",
            )
            return True
        except Exception as e:
            db.session.rollback()
            logger.error(
                "数据库删除记录失败",
                category="error",
                event="db_delete_failed",
                error=e,
            )
            return False

    @staticmethod
    def db_delete_all(model_instances: List):
        """删除多条记录（自动提交，可跨表）"""
        try:
            for instance in model_instances:
                db.session.delete(instance)
            db.session.commit()
            logger.debug(
                "数据库批量删除成功",
                event="db_delete_all_success",
                custom={"count": len(model_instances)}
            )
            return True
        except Exception as e:
            db.session.rollback()
            logger.error(
                "数据库批量删除失败",
                category="error",
                event="db_delete_all_failed",
                error=e,
            )
            return False

    @staticmethod
    def db_bulk_insert(model_instances: List):
        """批量插入记录（同一表，高性能）"""
        try:
            db.session.bulk_save_objects(model_instances)
            db.session.commit()
            logger.debug(
                "数据库批量插入成功",
                event="db_bulk_insert_success",
                custom={"count": len(model_instances)}
            )
            return True
        except Exception as e:
            db.session.rollback()
            logger.error(
                "数据库批量插入失败",
                category="error",
                event="db_bulk_insert_failed",
                error=e,
            )
            return False

    @staticmethod
    def execute_in_transaction(operations: List[callable]) -> bool:
        """
        在事务中执行多个操作

        Args:
            operations: 操作函数列表，每个函数接收 session 参数

        Returns:
            成功返回 True，失败返回 False

        使用示例：
        ```python
        def op1(session):
            session.add(User(name="test"))

        def op2(session):
            session.query(Order).filter_by(id=1).update({"status": 2})

        DBFunction.execute_in_transaction([op1, op2])
        ```
        """
        try:
            for op in operations:
                op(db.session)
            db.session.commit()
            logger.debug(
                "批量事务执行成功",
                event="batch_transaction_success",
                custom={"operation_count": len(operations)}
            )
            return True
        except Exception as e:
            db.session.rollback()
            logger.error(
                "批量事务执行失败",
                category="error",
                event="batch_transaction_failed",
                error=e,
            )
            return False


class CommonModelDbSchema(Schema):
    """通用模型转 Schema 类"""

    def __new__(cls, *args, **kwargs):
        attrs = {}
        model_class: type = cls.__dict__["__modelclass__"]
        if "__table__" in model_class.__dict__:
            tables = model_class.__dict__["__table__"]
            all_column_nm_list = []
            for column in tables.columns:
                column_name = column.name
                column_type = column.type
                if isinstance(column_type, Integer):
                    attrs[column_name] = fields.Int(allow_none=True)
                elif isinstance(column_type, Boolean):
                    attrs[column_name] = fields.Bool(allow_none=True)
                else:
                    attrs[column_name] = fields.Str(allow_none=True)
                all_column_nm_list.append(column_name)
            for key, val in cls.__dict__.items():
                if "post_load" not in attrs and key == "post_load":
                    attrs[key] = val
                elif key in all_column_nm_list:
                    attrs[key] = val
        else:
            for key, val in model_class.__dict__.items():
                if "post_load" not in attrs and "post_load" in cls.__dict__:
                    attrs["post_load"] = cls.__dict__["post_load"]
                    continue
                elif not isinstance(val, db.Column):
                    continue
                if key in dir(cls):
                    attrs[key] = cls.__dict__[key]
                elif isinstance(val.type, Integer):
                    attrs[key] = fields.Int(allow_none=True)
                elif isinstance(val.type, Boolean):
                    attrs[key] = fields.Bool(allow_none=True)
                else:
                    attrs[key] = fields.Str(allow_none=True)

        return type(cls.__name__, (Schema,), attrs)(*args, **kwargs)


# ==================== 分库分表支持 ====================

import os
from typing import Any, Dict, Type

from dbs.sharding_base import BaseShardingDBManager, BaseDateShardingModelMeta


class ShardingMySQLManager(BaseShardingDBManager):
    """
    MySQL 分库分表管理器

    支持：
    - 按日期分库（连接不同的 database）
    - 按日期分表（表名带日期后缀）
    - 独立配置分库和分表的日期粒度

    配置说明：
    所有分库分表配置默认从环境变量/配置文件读取，默认不启用分库分表。
    可通过构造函数参数覆盖配置。

    使用示例：
    ```python
    # 使用配置文件默认值
    manager = ShardingMySQLManager()

    # 手动开启按月分库 + 按天分表
    manager = ShardingMySQLManager(
        sharding_db_enabled=True,
        sharding_table_enabled=True,
        sharding_db_format="%Y%m",      # 月度数据库: myapp_202401
        sharding_table_format="%Y%m%d", # 每日分表: orders_20240115
    )
    ```
    """

    def __init__(
        self,
        host: Optional[str] = None,
        port: Optional[int] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        database: Optional[str] = None,
        pool_size: Optional[int] = None,
        max_overflow: Optional[int] = None,
        pool_recycle: Optional[int] = None,
        sharding_db_enabled: Optional[bool] = None,
        sharding_table_enabled: Optional[bool] = None,
        sharding_db_format: Optional[str] = None,
        sharding_table_format: Optional[str] = None,
    ):
        super().__init__(
            pool_size=pool_size,
            max_overflow=max_overflow,
            pool_recycle=pool_recycle,
            sharding_db_enabled=sharding_db_enabled,
            sharding_table_enabled=sharding_table_enabled,
            sharding_db_format=sharding_db_format,
            sharding_table_format=sharding_table_format,
        )

        # 从环境变量获取配置
        self.host = host if host is not None else os.environ.get("MYSQL_HOST", "127.0.0.1")
        self.port = port if port is not None else int(os.environ.get("MYSQL_PORT", "3306"))
        self.username = username if username is not None else os.environ.get("MYSQL_USERNAME", "")
        self.password = password if password is not None else os.environ.get("MYSQL_PASSWORD", "")
        self.database = database if database is not None else os.environ.get("MYSQL_DATABASE", "")

    def _get_database_name(self, shard_key: str, use_sharding_db: bool) -> str:
        """获取分库数据库名"""
        if use_sharding_db:
            return f"{self.database}_{shard_key}"
        return self.database

    def _build_connection_uri(self, shard_key: str, use_sharding_db: bool) -> str:
        """构建连接 URI"""
        database = self._get_database_name(shard_key, use_sharding_db)
        return "mysql+pymysql://{}:{}@{}:{}/{}?charset=utf8".format(
            self.username,
            self.password,
            self.host,
            self.port,
            database,
        )

    def _get_shard_identifier(self, shard_key: str, use_sharding_db: bool) -> str:
        """获取分片标识符"""
        return self._get_database_name(shard_key, use_sharding_db)


class DateShardingMySQLModelMeta(BaseDateShardingModelMeta):
    """
    MySQL 按日期分表的模型元类

    使用示例：
    ```python
    class MyModel(metaclass=DateShardingMySQLModelMeta):
        __tablename__ = "my_table"
        __db_manager__ = sharding_mysql_manager
        __use_sharding_db__ = False  # 是否分库

        id = Column(Integer, primary_key=True)
        name = Column(String(100))

    # 使用时传入日期
    Model20240115 = MyModel("2024-01-15")
    ```
    """
    pass


# 工厂函数
def create_mysql_manager(config: Optional[Dict] = None) -> MySQLDBManager:
    """创建 MySQL 管理器"""
    return MySQLDBManager(config)


def create_sharding_mysql_manager(**kwargs) -> ShardingMySQLManager:
    """创建 MySQL 分库分表管理器"""
    return ShardingMySQLManager(**kwargs)
