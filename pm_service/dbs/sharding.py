# -*- coding: utf-8 -*-
"""
@文件: sharding.py
@说明: 分库分表核心模块，支持按日期、哈希、范围等策略分表
@时间: 2026/02/09
"""
import datetime
import hashlib
import os
from abc import ABC, abstractmethod
from contextlib import contextmanager
from copy import deepcopy
from functools import lru_cache, wraps
from pathlib import Path
from typing import Any, Callable, Dict, Generator, List, Optional, Tuple, Type

from sqlalchemy import Column, create_engine, event
from sqlalchemy.ext.automap import automap_base
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import scoped_session, sessionmaker
from sqlalchemy.pool import QueuePool

from configs.base import BaseConfig
from loggers import logger


class ShardingStrategy(ABC):
    """分片策略基类"""

    @abstractmethod
    def get_shard_key(self, value: Any) -> str:
        """根据值计算分片键"""
        pass

    @abstractmethod
    def get_table_name(self, base_name: str, shard_key: str) -> str:
        """根据分片键生成表名"""
        pass


class DateShardingStrategy(ShardingStrategy):
    """按日期分片策略"""

    def __init__(self, date_format: str = "%Y%m%d"):
        self.date_format = date_format

    def get_shard_key(self, value: Any) -> str:
        """
        根据日期值计算分片键

        Args:
            value: 日期值，支持 datetime、str（YYYY-MM-DD 或 YYYYMMDD）

        Returns:
            分片键字符串
        """
        if value is None:
            return datetime.datetime.now().strftime(self.date_format)

        if isinstance(value, datetime.datetime):
            return value.strftime(self.date_format)

        if isinstance(value, datetime.date):
            return value.strftime(self.date_format)

        if isinstance(value, str):
            # 尝试解析日期字符串
            date_str = value.replace("-", "").replace("/", "")
            try:
                parsed = datetime.datetime.strptime(date_str[:8], "%Y%m%d")
                return parsed.strftime(self.date_format)
            except ValueError:
                return datetime.datetime.now().strftime(self.date_format)

        return datetime.datetime.now().strftime(self.date_format)

    def get_table_name(self, base_name: str, shard_key: str) -> str:
        """生成带日期后缀的表名"""
        return f"{base_name}_{shard_key}"


class HashShardingStrategy(ShardingStrategy):
    """按哈希分片策略"""

    def __init__(self, shard_count: int = 16):
        self.shard_count = shard_count

    def get_shard_key(self, value: Any) -> str:
        """
        根据值的哈希计算分片键

        Args:
            value: 用于计算哈希的值

        Returns:
            分片键字符串（0 到 shard_count-1）
        """
        if value is None:
            return "0"

        hash_value = hashlib.md5(str(value).encode()).hexdigest()
        shard_index = int(hash_value, 16) % self.shard_count
        return str(shard_index)

    def get_table_name(self, base_name: str, shard_key: str) -> str:
        """生成带哈希后缀的表名"""
        return f"{base_name}_{shard_key}"


class RangeShardingStrategy(ShardingStrategy):
    """按范围分片策略"""

    def __init__(self, ranges: List[tuple]):
        """
        Args:
            ranges: 范围列表，如 [(0, 1000, "0"), (1000, 10000, "1"), ...]
                    每个元组为 (start, end, shard_key)
        """
        self.ranges = sorted(ranges, key=lambda x: x[0])

    def get_shard_key(self, value: Any) -> str:
        """
        根据值的范围计算分片键

        Args:
            value: 数值

        Returns:
            分片键字符串
        """
        if value is None:
            return self.ranges[0][2] if self.ranges else "0"

        try:
            num_value = int(value)
            for start, end, shard_key in self.ranges:
                if start <= num_value < end:
                    return shard_key
            # 超出范围使用最后一个分片
            return self.ranges[-1][2] if self.ranges else "0"
        except (ValueError, TypeError):
            return self.ranges[0][2] if self.ranges else "0"

    def get_table_name(self, base_name: str, shard_key: str) -> str:
        """生成带范围后缀的表名"""
        return f"{base_name}_{shard_key}"


def get_sharding_strategy(strategy_name: str = "date") -> ShardingStrategy:
    """
    获取分片策略

    Args:
        strategy_name: 策略名称（date, hash, range）

    Returns:
        ShardingStrategy 实例
    """
    config = BaseConfig()

    if strategy_name == "date":
        return DateShardingStrategy(config.SHARDING_DATE_FORMAT)
    elif strategy_name == "hash":
        return HashShardingStrategy()
    elif strategy_name == "range":
        # 默认范围配置
        return RangeShardingStrategy([
            (0, 10000, "0"),
            (10000, 100000, "1"),
            (100000, 1000000, "2"),
            (1000000, float("inf"), "3"),
        ])
    else:
        return DateShardingStrategy()


class ShardingModelMeta(type):
    """
    分表模型元类

    使用方法：
    class MyModel(Base, metaclass=ShardingModelMeta):
        __tablename__ = "my_table"
        __sharding_strategy__ = "date"  # 可选：date, hash, range
        __sharding_key__ = "created_at"  # 分片依据的字段

        id = Column(Integer, primary_key=True)
        name = Column(String(100))
        created_at = Column(DateTime)

    # 使用时
    model_class = MyModel("2024-01-15")  # 返回 my_table_20240115 的模型类
    """

    def __new__(mcs, name, bases, attrs):
        attrs["_model_class_cache"] = {}
        attrs["_table_name_list"] = []
        return super().__new__(mcs, name, bases, attrs)

    def __call__(cls, shard_value: Any = None, operation: str = ""):
        """
        创建分表模型实例

        Args:
            shard_value: 分片值（日期、ID等）
            operation: 操作类型（query, insert 等）

        Returns:
            动态生成的分表模型类
        """
        # 获取分片策略
        strategy_name = getattr(cls, "__sharding_strategy__", "date")
        strategy = get_sharding_strategy(strategy_name)

        # 计算分片键
        shard_key = strategy.get_shard_key(shard_value)

        # 生成表名
        base_table_name = cls.__tablename__
        table_name = strategy.get_table_name(base_table_name, shard_key)

        # 检查缓存
        if table_name in cls._model_class_cache:
            return cls._model_class_cache[table_name]

        # 获取 Base 类（从父类中查找）
        Base = None
        for base in cls.__mro__:
            if hasattr(base, "metadata"):
                Base = base
                break

        if Base is None:
            raise ValueError("无法找到 SQLAlchemy Base 类")

        # 动态创建模型类
        model_class_name = f"{cls.__name__}_{shard_key}"
        attrs = {
            "__tablename__": table_name,
            "__shard_key__": shard_key,
            "__base_table_name__": base_table_name,
            "__source_class__": cls,
            "__operation__": operation,
        }

        # 复制列定义
        title_key_dict = {}
        for key, val in cls.__dict__.items():
            if isinstance(val, Column):
                attrs[key] = deepcopy(val)
                title_key_dict[key] = val.comment or key

        attrs["__title_keys__"] = title_key_dict

        # 创建新的模型类
        model_class = type(model_class_name, (Base,), attrs)

        # 缓存模型类
        cls._model_class_cache[table_name] = model_class

        logger.debug(
            "创建分表模型",
            event="sharding_model_created",
            custom={
                "model_name": model_class_name,
                "table_name": table_name,
                "shard_key": shard_key,
            }
        )

        return model_class


def sharding_model_decorator(func):
    """
    分表模型装饰器，自动创建表

    使用方法：
    @sharding_model_decorator
    def get_model(shard_value):
        return MyShardingModel(shard_value)
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        model_class = func(*args, **kwargs)

        # 获取表名
        table_name = model_class.__tablename__
        source_class = getattr(model_class, "__source_class__", None)

        if source_class and table_name not in source_class._table_name_list:
            # 自动创建表
            try:
                Base = None
                for base in model_class.__mro__:
                    if hasattr(base, "metadata"):
                        Base = base
                        break

                if Base and hasattr(Base, "metadata"):
                    # 需要外部传入 engine
                    pass

                source_class._table_name_list.append(table_name)
            except Exception as e:
                logger.warning(
                    "自动创建分表失败",
                    category="validation",
                    event="sharding_table_create_failed",
                    error=e,
                    custom={"table_name": table_name}
                )

        return model_class

    return wrapper


class ShardingTableManager:
    """分表管理器，用于管理多个分表"""

    def __init__(self, engine, strategy: ShardingStrategy = None):
        self.engine = engine
        self.strategy = strategy or DateShardingStrategy()
        self._created_tables: set = set()

    def ensure_table_exists(self, model_class: Type) -> bool:
        """确保表存在"""
        table_name = model_class.__tablename__

        if table_name in self._created_tables:
            return True

        try:
            model_class.__table__.create(self.engine, checkfirst=True)
            self._created_tables.add(table_name)
            logger.info(
                "分表创建成功",
                category="business",
                event="sharding_table_created",
                custom={"table_name": table_name}
            )
            return True
        except Exception as e:
            logger.error(
                "分表创建失败",
                category="error",
                event="sharding_table_create_failed",
                error=e,
                custom={"table_name": table_name}
            )
            return False

    def get_all_shard_tables(self, base_table_name: str) -> List[str]:
        """获取所有分表名称"""
        from sqlalchemy import inspect

        inspector = inspect(self.engine)
        all_tables = inspector.get_table_names()

        shard_tables = [
            t for t in all_tables
            if t.startswith(f"{base_table_name}_")
        ]

        return sorted(shard_tables)

    def query_all_shards(
        self,
        model_class_factory,
        shard_values: List[Any],
        query_func
    ) -> List[Any]:
        """
        查询多个分表

        Args:
            model_class_factory: 模型类工厂函数
            shard_values: 分片值列表
            query_func: 查询函数，接收 model_class 和 session 参数

        Returns:
            合并后的查询结果
        """
        results = []

        for shard_value in shard_values:
            model_class = model_class_factory(shard_value)
            self.ensure_table_exists(model_class)

            try:
                result = query_func(model_class)
                if result:
                    if isinstance(result, list):
                        results.extend(result)
                    else:
                        results.append(result)
            except Exception as e:
                logger.warning(
                    "分表查询失败",
                    category="validation",
                    event="sharding_query_failed",
                    error=e,
                    custom={"shard_value": str(shard_value)}
                )

        return results


# ==================== 按日期分库分表管理器 ====================
# 类似 CommonTools 中的 db_agent_manager.py 和 db_model_meta.py 功能

from dbs.sharding_base import BaseShardingDBManager, BaseDateShardingModelMeta


class DateShardingDBManager(BaseShardingDBManager):
    """
    SQLite 按日期分库分表管理器

    功能：
    - 按日期自动创建不同的数据库文件（分库）
    - 按日期自动创建不同的表名（分表）
    - 支持独立配置分库和分表的日期粒度
    - 使用 LRU 缓存避免重复创建连接
    - 支持会话管理和事务控制

    配置说明：
    所有分库分表配置默认从环境变量/配置文件读取，默认不启用分库分表。
    可通过构造函数参数覆盖配置。

    使用示例：
    ```python
    # 使用配置文件默认值
    manager = DateShardingDBManager()

    # 手动开启按月分库 + 按天分表
    manager = DateShardingDBManager(
        sharding_db_enabled=True,
        sharding_table_enabled=True,
        sharding_db_format="%Y%m",      # 月度数据库: agent_202401.db
        sharding_table_format="%Y%m%d", # 每日分表: orders_20240115
    )
    ```
    """

    def __init__(
        self,
        db_path: Optional[str] = None,
        db_name: Optional[str] = None,
        pool_size: Optional[int] = None,
        max_overflow: Optional[int] = None,
        pool_timeout: Optional[int] = None,
        connect_timeout: Optional[int] = None,
        sharding_db_enabled: Optional[bool] = None,
        sharding_table_enabled: Optional[bool] = None,
        sharding_db_format: Optional[str] = None,
        sharding_table_format: Optional[str] = None,
    ):
        super().__init__(
            pool_size=pool_size,
            max_overflow=max_overflow,
            pool_timeout=pool_timeout,
            sharding_db_enabled=sharding_db_enabled,
            sharding_table_enabled=sharding_table_enabled,
            sharding_db_format=sharding_db_format,
            sharding_table_format=sharding_table_format,
        )

        # 从配置文件获取 SQLite 默认配置
        sqlite_config = BaseConfig().SQLITE_CONFIG

        self.db_path = Path(db_path if db_path is not None else sqlite_config.get("db_path", "./data/sqlite"))
        self.db_name = db_name if db_name is not None else sqlite_config.get("db_name", "app.db")
        self.connect_timeout = connect_timeout if connect_timeout is not None else sqlite_config.get("connect_timeout", 30)
        self._ensure_db_path()

    def _ensure_db_path(self):
        """确保数据库目录存在"""
        if not self.db_path.exists():
            self.db_path.mkdir(parents=True, exist_ok=True)
            logger.info(
                "创建数据库目录",
                category="business",
                event="sharding_db_dir_created",
                custom={"path": str(self.db_path)}
            )

    def _get_db_file_name(self, shard_key: str) -> str:
        """获取分库数据库文件名"""
        name_parts = self.db_name.rsplit(".", 1)
        if len(name_parts) == 2:
            return f"{name_parts[0]}_{shard_key}.{name_parts[1]}"
        return f"{self.db_name}_{shard_key}"

    def _build_connection_uri(self, shard_key: str, use_sharding_db: bool) -> str:
        """构建 SQLite 连接 URI"""
        db_file_name = self._get_db_file_name(shard_key)
        db_file_path = str(self.db_path / db_file_name)
        return f"sqlite:///{db_file_path}"

    def _get_shard_identifier(self, shard_key: str, use_sharding_db: bool) -> str:
        """获取分片标识符"""
        return str(self.db_path / self._get_db_file_name(shard_key))

    def _get_engine_kwargs(self) -> Dict[str, Any]:
        """获取 SQLite 引擎创建参数"""
        return {
            "connect_args": {
                "timeout": self.connect_timeout,
                "check_same_thread": False,
            },
            "poolclass": QueuePool,
            "pool_size": self.pool_size,
            "max_overflow": self.max_overflow,
            "pool_timeout": self.pool_timeout,
            "pool_pre_ping": self.pool_pre_ping,
            "echo": False,
        }

    def get_session(self, shard_date: str = ""):
        """获取指定日期的数据库会话（兼容旧 API）"""
        return super().get_session(shard_date, use_sharding_db=True)

    def session_scope(self, shard_date: str = "", auto_commit: bool = True):
        """提供事务范围的会话管理器（兼容旧 API）"""
        return super().session_scope(shard_date, use_sharding_db=True, auto_commit=auto_commit)

    def get_table_name_list(self, shard_date: str = "") -> List[str]:
        """获取指定分库中的所有表名（兼容旧 API）"""
        return super().get_table_name_list(shard_date, use_sharding_db=True)


class DateShardingModelMeta(BaseDateShardingModelMeta):
    """
    SQLite 按日期分表的模型元类

    使用示例：
    ```python
    class MyModel(metaclass=DateShardingModelMeta):
        __tablename__ = "my_table"
        __db_manager__ = date_sharding_manager

        id = Column(Integer, primary_key=True)
        name = Column(String(100))

    # 使用时传入日期
    Model20240115 = MyModel("2024-01-15")
    ```
    """
    pass


def create_date_sharding_manager(
    db_path: str = "./data/sqlite",
    db_name: str = "agent.db",
    **kwargs
) -> DateShardingDBManager:
    """
    工厂函数：创建按日期分库分表管理器

    Args:
        db_path: 数据库存储路径
        db_name: 基础数据库文件名
        **kwargs: 其他配置参数

    Returns:
        DateShardingDBManager 实例
    """
    return DateShardingDBManager(db_path=db_path, db_name=db_name, **kwargs)
