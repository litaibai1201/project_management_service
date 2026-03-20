# -*- coding: utf-8 -*-
"""
@文件: client.py
@说明: MongoDB 客户端管理器
@时间: 2025-09-03
"""
import os
from typing import Optional

from pymongo import MongoClient
from pymongo.database import Database
from pymongo.errors import ConnectionFailure


class MongoDBClient:
    """MongoDB 客户端管理器

    支持两种初始化方式:
        1. Flask 应用初始化: mongo_client.init_app(app)
        2. 独立使用: mongo_client.init(uri, database)

    配置项 (环境变量或 Flask config):
        MONGO_URI: MongoDB 连接字符串
        MONGO_DATABASE: 数据库名称
        MONGO_MAX_POOL_SIZE: 连接池最大连接数 (默认 100)
        MONGO_MIN_POOL_SIZE: 连接池最小连接数 (默认 10)
        MONGO_CONNECT_TIMEOUT: 连接超时毫秒 (默认 5000)
        MONGO_SERVER_SELECTION_TIMEOUT: 服务器选择超时毫秒 (默认 5000)
    """

    def __init__(self):
        self._client: Optional[MongoClient] = None
        self._db: Optional[Database] = None
        self._database_name: Optional[str] = None

    def init_app(self, app) -> None:
        """Flask 应用初始化

        Args:
            app: Flask 应用实例
        """
        config = app.config

        uri = config.get("MONGO_URI") or os.environ.get("MONGO_URI")
        database = config.get("MONGO_DATABASE") or os.environ.get("MONGO_DATABASE")

        if not uri:
            raise ValueError("MONGO_URI 未配置")
        if not database:
            raise ValueError("MONGO_DATABASE 未配置")

        max_pool_size = config.get("MONGO_MAX_POOL_SIZE", 100)
        min_pool_size = config.get("MONGO_MIN_POOL_SIZE", 10)
        connect_timeout = config.get("MONGO_CONNECT_TIMEOUT", 5000)
        server_selection_timeout = config.get("MONGO_SERVER_SELECTION_TIMEOUT", 5000)

        self._init_client(
            uri=uri,
            database=database,
            max_pool_size=max_pool_size,
            min_pool_size=min_pool_size,
            connect_timeout=connect_timeout,
            server_selection_timeout=server_selection_timeout,
        )

    def init(
        self,
        uri: str,
        database: str,
        max_pool_size: int = 100,
        min_pool_size: int = 10,
        connect_timeout: int = 5000,
        server_selection_timeout: int = 5000,
    ) -> None:
        """独立初始化 (非 Flask 环境)

        Args:
            uri: MongoDB 连接字符串
            database: 数据库名称
            max_pool_size: 最大连接池大小
            min_pool_size: 最小连接池大小
            connect_timeout: 连接超时 (毫秒)
            server_selection_timeout: 服务器选择超时 (毫秒)
        """
        self._init_client(
            uri=uri,
            database=database,
            max_pool_size=max_pool_size,
            min_pool_size=min_pool_size,
            connect_timeout=connect_timeout,
            server_selection_timeout=server_selection_timeout,
        )

    def _init_client(
        self,
        uri: str,
        database: str,
        max_pool_size: int,
        min_pool_size: int,
        connect_timeout: int,
        server_selection_timeout: int,
    ) -> None:
        """内部初始化方法"""
        self._database_name = database
        self._client = MongoClient(
            uri,
            maxPoolSize=max_pool_size,
            minPoolSize=min_pool_size,
            connectTimeoutMS=connect_timeout,
            serverSelectionTimeoutMS=server_selection_timeout,
        )
        self._db = self._client[database]

    @property
    def client(self) -> MongoClient:
        """获取 MongoClient 实例"""
        if self._client is None:
            raise RuntimeError("MongoDB 客户端未初始化，请先调用 init_app() 或 init()")
        return self._client

    @property
    def db(self) -> Database:
        """获取默认数据库实例"""
        if self._db is None:
            raise RuntimeError("MongoDB 客户端未初始化，请先调用 init_app() 或 init()")
        return self._db

    def get_database(self, name: str = None) -> Database:
        """获取指定数据库

        Args:
            name: 数据库名称，为空则返回默认数据库

        Returns:
            Database 实例
        """
        if name is None:
            return self.db
        return self.client[name]

    def get_collection(self, name: str, database: str = None):
        """获取集合

        Args:
            name: 集合名称
            database: 数据库名称，为空则使用默认数据库

        Returns:
            Collection 实例
        """
        db = self.get_database(database)
        return db[name]

    def is_connected(self) -> bool:
        """检查连接状态"""
        if self._client is None:
            return False
        try:
            self._client.admin.command("ping")
            return True
        except ConnectionFailure:
            return False

    def close(self) -> None:
        """关闭连接"""
        if self._client:
            self._client.close()
            self._client = None
            self._db = None


# 全局单例
mongo_client = MongoDBClient()
