# -*- coding: utf-8 -*-
"""
@文件: __init__.py
@说明: Oracle 数据库管理模块
@时间: 2026/02/09
"""
from typing import Any, Dict, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.pool import QueuePool

from configs.base import BaseConfig
from dbs.db_manager import BaseDBManager
from loggers import logger


class OracleDBManager(BaseDBManager):
    """Oracle 数据库管理器"""

    def __init__(self, config: Optional[Dict] = None):
        self._base_config = BaseConfig()
        super().__init__(config or self._base_config.ORACLE_CONFIG)

    def get_connection_uri(self) -> str:
        """获取 Oracle 连接 URI"""
        return "oracle+cx_oracle://{}:{}@{}:{}/{}".format(
            self.config.get("username", ""),
            self.config.get("password", ""),
            self.config.get("host", "127.0.0.1"),
            self.config.get("port", 1521),
            self.config.get("service_name", ""),
        )

    def _create_engine(self):
        """创建 Oracle 引擎"""
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
                "Oracle 引擎创建成功",
                category="business",
                event="oracle_engine_created",
                custom={
                    "host": self.config.get("host"),
                    "port": self.config.get("port"),
                    "service_name": self.config.get("service_name"),
                }
            )
            return engine
        except Exception as e:
            logger.error(
                "Oracle 引擎创建失败",
                category="error",
                event="oracle_engine_create_failed",
                error=e,
            )
            raise

    def is_connection_alive(self) -> bool:
        """检测 Oracle 连接是否存活"""
        try:
            with self.engine.connect() as conn:
                conn.execute(text("SELECT 1 FROM DUAL"))
            return True
        except Exception as e:
            logger.warning(
                "Oracle 连接检测失败",
                category="validation",
                event="oracle_connection_check_failed",
                error=e,
            )
            return False


class ShardingOracleManager:
    """支持分库分表的 Oracle 管理器（基于 schema 分表）"""

    def __init__(self, config: Optional[Dict] = None):
        self._base_config = BaseConfig()
        self.config = config or self._base_config.ORACLE_CONFIG
        self._managers: Dict[str, OracleDBManager] = {}

    def get_shard_manager(
        self, schema_suffix: str = ""
    ) -> OracleDBManager:
        """
        获取分片管理器

        Args:
            schema_suffix: schema 后缀，用于区分不同分片

        Returns:
            OracleDBManager 实例
        """
        cache_key = schema_suffix or "default"

        if cache_key not in self._managers:
            config = self.config.copy()
            if schema_suffix:
                # 可以根据需要修改 service_name 或其他配置
                original_service = config.get("service_name", "")
                config["service_name"] = f"{original_service}_{schema_suffix}"

            self._managers[cache_key] = OracleDBManager(config)
            logger.info(
                "创建 Oracle 分片管理器",
                category="business",
                event="oracle_shard_manager_created",
                custom={"schema_suffix": schema_suffix}
            )

        return self._managers[cache_key]

    def clear_cache(self):
        """清除缓存"""
        for manager in self._managers.values():
            manager.dispose()
        self._managers.clear()
        logger.info(
            "Oracle 分片缓存已清除",
            category="business",
            event="oracle_shard_cache_cleared"
        )


# ==================== 完整分库分表支持 ====================

from dbs.sharding_base import BaseShardingDBManager, BaseDateShardingModelMeta


class DateShardingOracleManager(BaseShardingDBManager):
    """
    Oracle 按日期分库分表管理器

    支持：
    - 按日期分库（连接不同的 service_name）
    - 按日期分表（表名带日期后缀）
    - 独立配置分库和分表的日期粒度

    配置说明：
    所有分库分表配置默认从环境变量/配置文件读取，默认不启用分库分表。
    可通过构造函数参数覆盖配置。

    使用示例：
    ```python
    # 使用配置文件默认值
    manager = DateShardingOracleManager()

    # 手动开启按月分库 + 按天分表
    manager = DateShardingOracleManager(
        sharding_db_enabled=True,
        sharding_table_enabled=True,
        sharding_db_format="%Y%m",      # 月度数据库
        sharding_table_format="%Y%m%d", # 每日分表
    )
    ```
    """

    def __init__(
        self,
        host: Optional[str] = None,
        port: Optional[int] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        service_name: Optional[str] = None,
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

        oracle_config = BaseConfig().ORACLE_CONFIG

        self.host = host if host is not None else oracle_config.get("host", "127.0.0.1")
        self.port = port if port is not None else oracle_config.get("port", 1521)
        self.username = username if username is not None else oracle_config.get("username", "")
        self.password = password if password is not None else oracle_config.get("password", "")
        self.service_name = service_name if service_name is not None else oracle_config.get("service_name", "")

    def _get_service_name_for_shard(self, shard_key: str, use_sharding_db: bool) -> str:
        """获取分库 service_name"""
        if use_sharding_db:
            return f"{self.service_name}_{shard_key}"
        return self.service_name

    def _build_connection_uri(self, shard_key: str, use_sharding_db: bool) -> str:
        """构建连接 URI"""
        service_name = self._get_service_name_for_shard(shard_key, use_sharding_db)
        return "oracle+cx_oracle://{}:{}@{}:{}/{}".format(
            self.username,
            self.password,
            self.host,
            self.port,
            service_name,
        )

    def _get_shard_identifier(self, shard_key: str, use_sharding_db: bool) -> str:
        """获取分片标识符"""
        return self._get_service_name_for_shard(shard_key, use_sharding_db)


class DateShardingOracleModelMeta(BaseDateShardingModelMeta):
    """
    Oracle 按日期分表的模型元类

    使用示例：
    ```python
    class MyModel(metaclass=DateShardingOracleModelMeta):
        __tablename__ = "my_table"
        __db_manager__ = date_sharding_oracle_manager
        __use_sharding_db__ = False
        __table_name_upper__ = True  # Oracle 表名大写

        id = Column(Integer, primary_key=True)
        name = Column(String(100))

    # 使用时传入日期
    Model20240115 = MyModel("2024-01-15")
    ```
    """
    pass


# 注意：Oracle 需要安装 cx_Oracle 驱动
# pip install cx_Oracle
# 并且需要配置 Oracle Instant Client

def create_oracle_manager(config: Optional[Dict] = None) -> OracleDBManager:
    """工厂函数：创建 Oracle 管理器"""
    return OracleDBManager(config)


def create_sharding_oracle_manager(
    config: Optional[Dict] = None
) -> ShardingOracleManager:
    """工厂函数：创建分片 Oracle 管理器（基于 schema）"""
    return ShardingOracleManager(config)


def create_date_sharding_oracle_manager(**kwargs) -> DateShardingOracleManager:
    """工厂函数：创建按日期分库分表的 Oracle 管理器"""
    return DateShardingOracleManager(**kwargs)
