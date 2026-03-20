# -*- coding: utf-8 -*-
"""
@文件: __init__.py
@说明: SQLite 数据库管理模块
@时间: 2026/02/09
"""
import os
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Dict, Optional, Tuple

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import scoped_session, sessionmaker
from sqlalchemy.pool import QueuePool

from configs.base import BaseConfig
from dbs.db_manager import BaseDBManager
from loggers import logger


class SQLiteDBManager(BaseDBManager):
    """SQLite 数据库管理器"""

    def __init__(self, config: Optional[Dict] = None):
        self._base_config = BaseConfig()
        super().__init__(config or self._base_config.SQLITE_CONFIG)
        self._ensure_db_path()

    def _ensure_db_path(self):
        """确保数据库目录存在"""
        db_path = self.config.get("db_path", "./data/sqlite")
        path = Path(db_path)
        if not path.exists():
            path.mkdir(parents=True, exist_ok=True)
            logger.info(
                "创建 SQLite 数据库目录",
                category="business",
                event="sqlite_dir_created",
                custom={"path": str(path)}
            )

    def get_connection_uri(self) -> str:
        """获取 SQLite 连接 URI"""
        db_path = self.config.get("db_path", "./data/sqlite")
        db_name = self.config.get("db_name", "app.db")
        full_path = Path(db_path) / db_name
        return f"sqlite:///{full_path}"

    def _create_engine(self):
        """创建 SQLite 引擎"""
        try:
            engine = create_engine(
                self.get_connection_uri(),
                connect_args={
                    "timeout": self.config.get("connect_timeout", 30),
                    "check_same_thread": False,
                },
                poolclass=QueuePool,
                pool_size=self.config.get("pool_size", 5),
                max_overflow=self.config.get("max_overflow", 10),
                pool_timeout=self.config.get("pool_timeout", 30),
                pool_pre_ping=self.config.get("pool_pre_ping", True),
                echo=False,
            )
            logger.info(
                "SQLite 引擎创建成功",
                category="business",
                event="sqlite_engine_created",
                custom={"uri": self.get_connection_uri()}
            )
            return engine
        except Exception as e:
            logger.error(
                "SQLite 引擎创建失败",
                category="error",
                event="sqlite_engine_create_failed",
                error=e,
            )
            raise


class ShardingSQLiteManager:
    """
    支持分库分表的 SQLite 管理器

    注意：此类保留原有 API，用于兼容旧代码。
    新代码建议使用 sharding.py 中的 DateShardingDBManager。
    """

    def __init__(self, config: Optional[Dict] = None):
        self._base_config = BaseConfig()
        self.config = config or self._base_config.SQLITE_CONFIG
        self._db_path = Path(self.config.get("db_path", "./data/sqlite"))
        self._ensure_db_path()
        self._engine_cache: Dict[str, any] = {}
        self._session_cache: Dict[str, any] = {}
        self._base_cache: Dict[str, any] = {}

    def _ensure_db_path(self):
        """确保数据库目录存在"""
        if not self._db_path.exists():
            self._db_path.mkdir(parents=True, exist_ok=True)

    def _get_shard_key(self, shard_date: str = "") -> str:
        """根据日期生成分片键"""
        if not shard_date:
            return datetime.now().strftime("%Y%m%d")
        date_str = str(shard_date).replace("-", "").replace("/", "")
        try:
            parsed = datetime.strptime(date_str[:8], "%Y%m%d")
            return parsed.strftime("%Y%m%d")
        except ValueError:
            return datetime.now().strftime("%Y%m%d")

    def _get_db_name(self, base_name: str, shard_key: str) -> str:
        """获取分片数据库名称"""
        name_parts = base_name.rsplit(".", 1)
        if len(name_parts) == 2:
            return f"{name_parts[0]}_{shard_key}.{name_parts[1]}"
        return f"{base_name}_{shard_key}"

    @lru_cache(maxsize=32)
    def _create_shard_engine(self, db_file_path: str):
        """创建分片引擎（带缓存）"""
        engine = create_engine(
            f"sqlite:///{db_file_path}",
            connect_args={
                "timeout": self.config.get("connect_timeout", 30),
                "check_same_thread": False,
            },
            poolclass=QueuePool,
            pool_size=self.config.get("pool_size", 5),
            max_overflow=self.config.get("max_overflow", 10),
            pool_timeout=self.config.get("pool_timeout", 30),
            pool_pre_ping=self.config.get("pool_pre_ping", True),
            echo=False,
        )
        return engine

    def get_shard_session(
        self, base_name: str = "app.db", shard_date: str = ""
    ) -> Tuple[any, any, any, str, str]:
        """
        获取分片会话

        Args:
            base_name: 基础数据库名称
            shard_date: 分片日期（格式：YYYY-MM-DD 或 YYYYMMDD）

        Returns:
            Tuple[Base, engine, Session, db_path, shard_key]
        """
        shard_key = self._get_shard_key(shard_date)
        db_name = self._get_db_name(base_name, shard_key)
        db_file_path = str(self._db_path / db_name)

        cache_key = db_file_path

        if cache_key not in self._engine_cache:
            engine = self._create_shard_engine(db_file_path)
            Session = sessionmaker(bind=engine)
            Base = declarative_base()

            self._engine_cache[cache_key] = engine
            self._session_cache[cache_key] = Session
            self._base_cache[cache_key] = Base

            logger.info(
                "创建分片数据库会话",
                category="business",
                event="sqlite_shard_session_created",
                custom={"db_name": db_name, "shard_key": shard_key}
            )

        return (
            self._base_cache[cache_key],
            self._engine_cache[cache_key],
            self._session_cache[cache_key],
            db_file_path,
            shard_key,
        )

    def clear_cache(self):
        """清除缓存"""
        for engine in self._engine_cache.values():
            engine.dispose()
        self._engine_cache.clear()
        self._session_cache.clear()
        self._base_cache.clear()
        self._create_shard_engine.cache_clear()
        logger.info(
            "SQLite 分片缓存已清除",
            category="business",
            event="sqlite_shard_cache_cleared"
        )


# 默认实例
sqlite_manager = SQLiteDBManager()
sharding_sqlite_manager = ShardingSQLiteManager()
