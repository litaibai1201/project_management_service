# -*- coding: utf-8 -*-
"""
@文件: db_manager.py
@说明: 数据库管理器基类，支持多种数据库类型和连接池
@时间: 2026/02/09
"""
import queue
import traceback
from abc import ABC, abstractmethod
from contextlib import contextmanager
from functools import lru_cache
from typing import Any, Dict, Optional

from sqlalchemy import create_engine, event, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import scoped_session, sessionmaker
from sqlalchemy.pool import QueuePool

from configs.base import BaseConfig
from loggers import logger


class BaseDBManager(ABC):
    """数据库管理器基类"""

    def __init__(self, config: Optional[Dict] = None):
        self.config = config or {}
        self._engine = None
        self._session_factory = None
        self._scoped_session = None
        self._base = declarative_base()
        self._db_queue = queue.Queue(maxsize=1)

    @property
    def engine(self):
        if self._engine is None:
            self._engine = self._create_engine()
            self._setup_engine_events()
        return self._engine

    @property
    def session_factory(self):
        if self._session_factory is None:
            self._session_factory = sessionmaker(bind=self.engine)
        return self._session_factory

    @property
    def scoped_session(self):
        if self._scoped_session is None:
            self._scoped_session = scoped_session(self.session_factory)
        return self._scoped_session

    @property
    def Base(self):
        return self._base

    @abstractmethod
    def _create_engine(self):
        """创建数据库引擎，由子类实现"""
        pass

    @abstractmethod
    def get_connection_uri(self) -> str:
        """获取数据库连接 URI，由子类实现"""
        pass

    def _setup_engine_events(self):
        """设置引擎事件监听器"""
        @event.listens_for(self._engine, "checkout")
        def on_checkout(dbapi_connection, connection_record, connection_proxy):
            logger.debug(
                "数据库连接从连接池取出",
                event="db_connection_checkout",
                custom={"db_type": self.__class__.__name__}
            )

        @event.listens_for(self._engine, "checkin")
        def on_checkin(dbapi_connection, connection_record):
            logger.debug(
                "数据库连接归还到连接池",
                event="db_connection_checkin",
                custom={"db_type": self.__class__.__name__}
            )

        @event.listens_for(self._engine, "connect")
        def on_connect(dbapi_connection, connection_record):
            logger.debug(
                "新数据库连接创建",
                event="db_connection_new",
                custom={"db_type": self.__class__.__name__}
            )

    @contextmanager
    def session_scope(self, auto_commit: bool = True):
        """提供事务范围的会话管理器"""
        self._db_queue.put(1)
        session = self.session_factory()
        try:
            yield session
            if auto_commit:
                session.commit()
        except Exception as e:
            session.rollback()
            logger.error(
                "数据库事务回滚",
                category="error",
                event="db_session_rollback",
                error=e,
                custom={"db_type": self.__class__.__name__}
            )
            raise
        finally:
            session.close()
            self._db_queue.get()

    def create_all_tables(self):
        """创建所有表"""
        try:
            self._base.metadata.create_all(self.engine)
            logger.info(
                "数据库表创建成功",
                category="business",
                event="db_tables_created",
                custom={"db_type": self.__class__.__name__}
            )
            return True
        except Exception as e:
            logger.error(
                "数据库表创建失败",
                category="error",
                event="db_tables_create_failed",
                error=e,
                custom={"db_type": self.__class__.__name__}
            )
            return False

    def drop_all_tables(self):
        """删除所有表"""
        try:
            self._base.metadata.drop_all(self.engine)
            logger.info(
                "数据库表删除成功",
                category="business",
                event="db_tables_dropped",
                custom={"db_type": self.__class__.__name__}
            )
            return True
        except Exception as e:
            logger.error(
                "数据库表删除失败",
                category="error",
                event="db_tables_drop_failed",
                error=e,
                custom={"db_type": self.__class__.__name__}
            )
            return False

    def is_connection_alive(self) -> bool:
        """检测连接是否存活"""
        try:
            with self.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return True
        except Exception as e:
            logger.warning(
                "数据库连接检测失败",
                category="validation",
                event="db_connection_check_failed",
                error=e,
                custom={"db_type": self.__class__.__name__}
            )
            return False

    def dispose(self):
        """释放连接池资源"""
        if self._engine:
            self._engine.dispose()
            logger.info(
                "数据库连接池已释放",
                category="business",
                event="db_pool_disposed",
                custom={"db_type": self.__class__.__name__}
            )
