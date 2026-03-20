# -*- coding: utf-8 -*-
"""
@文件: sharding_base.py
@说明: 分库分表基类模块，提供通用的分库分表能力
@时间: 2026/02/09
"""
import datetime
from abc import ABC, abstractmethod
from contextlib import contextmanager
from copy import deepcopy
from functools import lru_cache
from typing import Any, Dict, Generator, List, Optional, Tuple, Type

from sqlalchemy import Column, create_engine, event
from sqlalchemy.ext.automap import automap_base
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool

from configs.base import BaseConfig
from loggers import logger

# 全局配置实例
_config = BaseConfig()


def _get_sharding_config() -> Dict[str, Any]:
    """获取分库分表配置"""
    return _config.SHARDING_CONFIG


class BaseShardingDBManager(ABC):
    """
    分库分表管理器基类

    子类需要实现：
    - _build_connection_uri(): 构建数据库连接 URI
    - _get_engine_kwargs(): 获取引擎创建参数
    - _get_shard_identifier(): 获取分片标识符（用于日志）

    配置说明：
    所有配置默认从 configs.base.BaseConfig.SHARDING_CONFIG 读取，
    也可以通过构造函数参数覆盖。

    环境变量配置：
    - SHARDING_DB_ENABLED: 是否启用分库（默认 false）
    - SHARDING_TABLE_ENABLED: 是否启用分表（默认 false）
    - SHARDING_DB_FORMAT: 分库日期格式（默认 %Y%m%d）
    - SHARDING_TABLE_FORMAT: 分表日期格式（默认 %Y%m%d）

    常用格式：
    - "%Y%m%d": 按天（20240115）
    - "%Y%m": 按月（202401）
    - "%Y": 按年（2024）
    - "%Y_w%W": 按周（2024_w03）
    """

    def __init__(
        self,
        pool_size: Optional[int] = None,
        max_overflow: Optional[int] = None,
        pool_recycle: Optional[int] = None,
        pool_timeout: Optional[int] = None,
        pool_pre_ping: Optional[bool] = None,
        sharding_db_enabled: Optional[bool] = None,
        sharding_table_enabled: Optional[bool] = None,
        sharding_db_format: Optional[str] = None,
        sharding_table_format: Optional[str] = None,
    ):
        # 从配置文件获取默认值
        config = _get_sharding_config()

        # 连接池配置（优先使用参数，否则使用配置文件）
        self.pool_size = pool_size if pool_size is not None else config["pool_size"]
        self.max_overflow = max_overflow if max_overflow is not None else config["max_overflow"]
        self.pool_recycle = pool_recycle if pool_recycle is not None else config["pool_recycle"]
        self.pool_timeout = pool_timeout if pool_timeout is not None else config["pool_timeout"]
        self.pool_pre_ping = pool_pre_ping if pool_pre_ping is not None else config["pool_pre_ping"]

        # 分库分表开关（优先使用参数，否则使用配置文件，默认为 False）
        self.sharding_db_enabled = sharding_db_enabled if sharding_db_enabled is not None else config["db_enabled"]
        self.sharding_table_enabled = sharding_table_enabled if sharding_table_enabled is not None else config["table_enabled"]

        # 分片粒度格式（优先使用参数，否则使用配置文件）
        self.sharding_db_format = sharding_db_format if sharding_db_format is not None else config["db_format"]
        self.sharding_table_format = sharding_table_format if sharding_table_format is not None else config["table_format"]

        # 缓存
        self._engine_cache: Dict[str, Any] = {}
        self._session_cache: Dict[str, Any] = {}
        self._base_cache: Dict[str, Any] = {}
        self._table_name_cache: Dict[str, List[str]] = {}

    def _parse_date(self, shard_date: str = "") -> datetime.datetime:
        """解析日期字符串为 datetime 对象"""
        if not shard_date:
            return datetime.datetime.now()

        date_str = str(shard_date).replace("-", "").replace("/", "")
        try:
            return datetime.datetime.strptime(date_str[:8], "%Y%m%d")
        except ValueError:
            return datetime.datetime.now()

    def _get_shard_key(self, shard_date: str = "", format_str: str = "%Y%m%d") -> str:
        """根据日期和格式生成分片键"""
        parsed = self._parse_date(shard_date)
        return parsed.strftime(format_str)

    def _get_db_shard_key(self, shard_date: str = "") -> str:
        """获取分库分片键"""
        return self._get_shard_key(shard_date, self.sharding_db_format)

    def _get_table_shard_key(self, shard_date: str = "") -> str:
        """获取分表分片键"""
        return self._get_shard_key(shard_date, self.sharding_table_format)

    @abstractmethod
    def _build_connection_uri(self, shard_key: str, use_sharding_db: bool) -> str:
        """构建数据库连接 URI，子类实现"""
        pass

    @abstractmethod
    def _get_shard_identifier(self, shard_key: str, use_sharding_db: bool) -> str:
        """获取分片标识符（用于日志和缓存键），子类实现"""
        pass

    def _get_engine_kwargs(self) -> Dict[str, Any]:
        """获取引擎创建参数，子类可覆盖"""
        return {
            "poolclass": QueuePool,
            "pool_size": self.pool_size,
            "max_overflow": self.max_overflow,
            "pool_recycle": self.pool_recycle,
            "pool_pre_ping": self.pool_pre_ping,
            "echo": False,
        }

    def _create_engine(self, uri: str):
        """创建数据库引擎"""
        kwargs = self._get_engine_kwargs()
        engine = create_engine(uri, **kwargs)

        # 添加连接池事件监听（用于调试）
        @event.listens_for(engine, "checkout")
        def _on_checkout(dbapi_conn, conn_record, conn_proxy):
            pass

        @event.listens_for(engine, "checkin")
        def _on_checkin(dbapi_conn, conn_record):
            pass

        return engine

    @lru_cache(maxsize=32)
    def _get_cached_engine(self, uri: str):
        """获取缓存的引擎"""
        return self._create_engine(uri)

    def get_session(
        self, shard_date: str = "", use_sharding_db: bool = None
    ) -> Tuple[Any, Any, Any, str, str]:
        """
        获取分库会话

        Args:
            shard_date: 分片日期
            use_sharding_db: 是否使用分库（None 表示使用 sharding_db_enabled 配置）

        Returns:
            Tuple[Base, engine, Session, identifier, db_shard_key]
        """
        # 如果未指定，使用实例配置
        if use_sharding_db is None:
            use_sharding_db = self.sharding_db_enabled

        # 根据分库开关决定是否使用分片键（使用分库格式）
        db_shard_key = self._get_db_shard_key(shard_date) if use_sharding_db else ""
        uri = self._build_connection_uri(db_shard_key, use_sharding_db)
        identifier = self._get_shard_identifier(db_shard_key, use_sharding_db)

        cache_key = uri

        if cache_key not in self._engine_cache:
            engine = self._get_cached_engine(uri)
            Session = sessionmaker(bind=engine)
            Base = declarative_base()

            self._engine_cache[cache_key] = engine
            self._session_cache[cache_key] = Session
            self._base_cache[cache_key] = Base
            self._table_name_cache[cache_key] = []

            logger.info(
                "创建分库会话",
                category="business",
                event="sharding_session_created",
                custom={
                    "db_type": self.__class__.__name__,
                    "identifier": identifier,
                    "db_shard_key": db_shard_key,
                    "db_format": self.sharding_db_format,
                }
            )

        return (
            self._base_cache[cache_key],
            self._engine_cache[cache_key],
            self._session_cache[cache_key],
            identifier,
            db_shard_key,
        )

    @contextmanager
    def session_scope(
        self, shard_date: str = "", use_sharding_db: bool = None, auto_commit: bool = True
    ) -> Generator:
        """提供事务范围的会话管理器"""
        _, _, Session, identifier, db_shard_key = self.get_session(shard_date, use_sharding_db)
        session = Session()

        try:
            yield session
            if auto_commit:
                session.commit()
        except Exception as e:
            session.rollback()
            logger.error(
                "分库事务回滚",
                category="error",
                event="sharding_rollback",
                error=e,
                custom={
                    "db_type": self.__class__.__name__,
                    "identifier": identifier,
                    "db_shard_key": db_shard_key,
                }
            )
            raise
        finally:
            session.close()

    def get_table_name_list(
        self, shard_date: str = "", use_sharding_db: bool = None
    ) -> List[str]:
        """获取指定分库中的所有表名"""
        if use_sharding_db is None:
            use_sharding_db = self.sharding_db_enabled

        db_shard_key = self._get_db_shard_key(shard_date) if use_sharding_db else ""
        uri = self._build_connection_uri(db_shard_key, use_sharding_db)
        _, engine, _, _, _ = self.get_session(shard_date, use_sharding_db)

        if not self._table_name_cache.get(uri):
            try:
                base = automap_base()
                base.prepare(engine, reflect=True)
                self._table_name_cache[uri] = list(base.classes.keys())
            except Exception:
                self._table_name_cache[uri] = []

        return self._table_name_cache[uri]

    def clear_cache(self):
        """清除所有缓存"""
        for engine in self._engine_cache.values():
            engine.dispose()

        self._engine_cache.clear()
        self._session_cache.clear()
        self._base_cache.clear()
        self._table_name_cache.clear()
        self._get_cached_engine.cache_clear()

        logger.info(
            "分库缓存已清除",
            category="business",
            event="sharding_cache_cleared",
            custom={"db_type": self.__class__.__name__}
        )


class BaseDateShardingModelMeta(type):
    """
    按日期分表的模型元类基类

    子类需要设置：
    - __db_manager__: 分库分表管理器实例

    可选配置：
    - __sharding_db_enabled__: 是否分库（None 表示使用管理器配置）
    - __sharding_table_enabled__: 是否分表（None 表示使用管理器配置）
    - __table_name_upper__: 表名是否大写（默认 False，Oracle 为 True）
    - __sharding_table_format__: 分表日期格式（None 表示使用管理器配置）
    """

    def __new__(mcs, name, bases, attrs):
        attrs["_model_class_cache"] = {}
        attrs["_table_name_list"] = []
        return super().__new__(mcs, name, bases, attrs)

    def __call__(cls, shard_date: str = "", operation: str = "") -> Type:
        """创建分表模型类"""
        db_manager: BaseShardingDBManager = getattr(cls, "__db_manager__", None)
        if db_manager is None:
            raise ValueError("必须设置 __db_manager__ 属性")

        # 获取开关配置（优先使用模型类的配置，否则使用管理器的配置）
        sharding_db_enabled = getattr(cls, "__sharding_db_enabled__", None)
        if sharding_db_enabled is None:
            sharding_db_enabled = db_manager.sharding_db_enabled

        sharding_table_enabled = getattr(cls, "__sharding_table_enabled__", None)
        if sharding_table_enabled is None:
            sharding_table_enabled = db_manager.sharding_table_enabled

        table_name_upper = getattr(cls, "__table_name_upper__", False)

        # 获取分表格式（优先使用模型类的配置，否则使用管理器的配置）
        sharding_table_format = getattr(cls, "__sharding_table_format__", None)
        if sharding_table_format is None:
            sharding_table_format = db_manager.sharding_table_format

        # 获取会话信息（使用分库格式）
        Base, engine, Session, identifier, db_shard_key = db_manager.get_session(
            shard_date, sharding_db_enabled
        )

        # 获取分表分片键（使用分表格式，可能与分库格式不同）
        table_shard_key = db_manager._get_table_shard_key(shard_date) if sharding_table_enabled else ""

        # 生成表名
        base_table_name = cls.__tablename__
        if table_name_upper:
            base_table_name = base_table_name.upper()

        # 根据分表开关决定是否添加日期后缀
        if sharding_table_enabled and table_shard_key:
            table_name = f"{base_table_name}_{table_shard_key}"
        else:
            table_name = base_table_name

        # 获取已有表名列表
        table_name_list = db_manager.get_table_name_list(shard_date, sharding_db_enabled)

        # 如果是查询操作且分表不存在，使用基础表名
        if operation == "query" and table_name_list and table_name not in table_name_list:
            table_name = base_table_name

        # 检查缓存
        cache_key = f"{identifier}:{table_name}"
        if cache_key in cls._model_class_cache:
            return cls._model_class_cache[cache_key]

        # 动态创建模型类
        if sharding_table_enabled and table_shard_key:
            model_class_name = f"{cls.__name__}_{table_shard_key}"
        else:
            model_class_name = cls.__name__
        attrs = {
            "__tablename__": table_name,
            "__identifier__": identifier,
            "__db_shard_key__": db_shard_key,
            "__table_shard_key__": table_shard_key,
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

        # 自动创建表
        if table_name not in table_name_list:
            try:
                Base.metadata.create_all(engine)
                cls._table_name_list.append(table_name)

                # 更新缓存
                db_shard_key_temp = db_manager._get_db_shard_key(shard_date) if sharding_db_enabled else ""
                uri = db_manager._build_connection_uri(db_shard_key_temp, sharding_db_enabled)
                if uri in db_manager._table_name_cache:
                    db_manager._table_name_cache[uri].append(table_name)

                logger.debug(
                    "自动创建分表",
                    event="sharding_table_created",
                    custom={
                        "table_name": table_name,
                        "identifier": identifier,
                        "db_shard_key": db_shard_key,
                        "table_shard_key": table_shard_key,
                    }
                )
            except Exception as e:
                logger.warning(
                    "自动创建分表失败",
                    category="validation",
                    event="sharding_table_create_failed",
                    error=e,
                    custom={"table_name": table_name}
                )

        # 缓存模型类
        cls._model_class_cache[cache_key] = model_class

        return model_class
