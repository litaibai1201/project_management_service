# -*- coding: utf-8 -*-
"""
@文件: client.py
@说明: InfluxDB 客户端管理器
@时间: 2025-09-03

InfluxDB 是一个开源的时间序列数据库，专门用于处理时间序列数据。

支持两种初始化方式:
    1. Flask 应用初始化: influx_client.init_app(app)
    2. 独立使用: influx_client.init(url, token, org, bucket)

配置项 (环境变量或 Flask config):
    INFLUXDB_URL: InfluxDB 服务地址 (默认 http://localhost:8086)
    INFLUXDB_TOKEN: 访问令牌
    INFLUXDB_ORG: 组织名称
    INFLUXDB_BUCKET: 默认 Bucket 名称
    INFLUXDB_TIMEOUT: 超时时间（毫秒，默认 10000）
    INFLUXDB_VERIFY_SSL: 是否验证 SSL（默认 True）
"""
import os
from typing import Optional, Dict, Any
from datetime import datetime

try:
    from influxdb_client import InfluxDBClient, Point, WritePrecision
    from influxdb_client.client.write_api import SYNCHRONOUS, ASYNCHRONOUS
    from influxdb_client.client.query_api import QueryApi
    from influxdb_client.client.write_api import WriteApi
    from influxdb_client.client.delete_api import DeleteApi
    INFLUXDB_AVAILABLE = True
except ImportError:
    INFLUXDB_AVAILABLE = False
    InfluxDBClient = None
    Point = None
    WritePrecision = None
    SYNCHRONOUS = None
    ASYNCHRONOUS = None
    QueryApi = None
    WriteApi = None
    DeleteApi = None

from loggers import logger


class InfluxDBClientManager:
    """InfluxDB 客户端管理器

    使用 InfluxDB 2.x Python 客户端库

    支持两种初始化方式:
        1. Flask 应用初始化: influx_client.init_app(app)
        2. 独立使用: influx_client.init(url, token, org, bucket)

    核心概念:
        - Organization: 组织，顶级容器
        - Bucket: 数据桶，类似数据库
        - Measurement: 测量，类似表
        - Field: 字段，存储实际数值
        - Tag: 标签，用于索引和过滤（字符串类型）
        - Timestamp: 时间戳
    """

    def __init__(self):
        if not INFLUXDB_AVAILABLE:
            logger.warning(
                "InfluxDB 客户端库未安装",
                category="warning",
                event="influxdb_import_failed",
                custom={"install": "pip install influxdb-client"}
            )

        self._client: Optional[InfluxDBClient] = None
        self._url: Optional[str] = None
        self._token: Optional[str] = None
        self._org: Optional[str] = None
        self._bucket: Optional[str] = None
        self._timeout: int = 10000
        self._verify_ssl: bool = True

    def init_app(self, app) -> None:
        """Flask 应用初始化

        Args:
            app: Flask 应用实例
        """
        if not INFLUXDB_AVAILABLE:
            raise ImportError(
                "InfluxDB 客户端库未安装，请运行: pip install influxdb-client"
            )

        config = app.config

        url = config.get("INFLUXDB_URL") or os.environ.get("INFLUXDB_URL")
        token = config.get("INFLUXDB_TOKEN") or os.environ.get("INFLUXDB_TOKEN")
        org = config.get("INFLUXDB_ORG") or os.environ.get("INFLUXDB_ORG")
        bucket = config.get("INFLUXDB_BUCKET") or os.environ.get("INFLUXDB_BUCKET")

        if not url:
            raise ValueError("INFLUXDB_URL 未配置")
        if not token:
            raise ValueError("INFLUXDB_TOKEN 未配置")
        if not org:
            raise ValueError("INFLUXDB_ORG 未配置")
        if not bucket:
            raise ValueError("INFLUXDB_BUCKET 未配置")

        timeout = config.get("INFLUXDB_TIMEOUT", 10000)
        verify_ssl = config.get("INFLUXDB_VERIFY_SSL", True)

        self._init_client(
            url=url,
            token=token,
            org=org,
            bucket=bucket,
            timeout=timeout,
            verify_ssl=verify_ssl,
        )

    def init(
        self,
        url: str,
        token: str,
        org: str,
        bucket: str,
        timeout: int = 10000,
        verify_ssl: bool = True,
    ) -> None:
        """独立初始化 (非 Flask 环境)

        Args:
            url: InfluxDB 服务地址
            token: 访问令牌
            org: 组织名称
            bucket: 默认 Bucket 名称
            timeout: 超时时间（毫秒）
            verify_ssl: 是否验证 SSL
        """
        if not INFLUXDB_AVAILABLE:
            raise ImportError(
                "InfluxDB 客户端库未安装，请运行: pip install influxdb-client"
            )

        self._init_client(
            url=url,
            token=token,
            org=org,
            bucket=bucket,
            timeout=timeout,
            verify_ssl=verify_ssl,
        )

    def _init_client(
        self,
        url: str,
        token: str,
        org: str,
        bucket: str,
        timeout: int,
        verify_ssl: bool,
    ) -> None:
        """内部初始化方法"""
        self._url = url
        self._token = token
        self._org = org
        self._bucket = bucket
        self._timeout = timeout
        self._verify_ssl = verify_ssl

        self._client = InfluxDBClient(
            url=url,
            token=token,
            org=org,
            timeout=timeout,
            verify_ssl=verify_ssl,
        )

        logger.info(
            "InfluxDB 客户端初始化成功",
            category="business",
            event="influxdb_client_initialized",
            custom={
                "url": url,
                "org": org,
                "bucket": bucket,
            }
        )

    @property
    def client(self) -> InfluxDBClient:
        """获取 InfluxDB 客户端实例"""
        if self._client is None:
            raise RuntimeError("InfluxDB 客户端未初始化，请先调用 init_app() 或 init()")
        return self._client

    @property
    def org(self) -> str:
        """获取组织名称"""
        if self._org is None:
            raise RuntimeError("InfluxDB 客户端未初始化")
        return self._org

    @property
    def bucket(self) -> str:
        """获取默认 Bucket 名称"""
        if self._bucket is None:
            raise RuntimeError("InfluxDB 客户端未初始化")
        return self._bucket

    def get_write_api(self, write_options=SYNCHRONOUS) -> WriteApi:
        """获取写入 API

        Args:
            write_options: 写入选项
                - SYNCHRONOUS: 同步写入（默认）
                - ASYNCHRONOUS: 异步写入

        Returns:
            WriteApi 实例
        """
        return self.client.write_api(write_options=write_options)

    def get_query_api(self) -> QueryApi:
        """获取查询 API

        Returns:
            QueryApi 实例
        """
        return self.client.query_api()

    def get_delete_api(self) -> DeleteApi:
        """获取删除 API

        Returns:
            DeleteApi 实例
        """
        return self.client.delete_api()

    def is_connected(self) -> bool:
        """检查连接状态

        Returns:
            是否连接成功
        """
        if self._client is None:
            return False

        try:
            # 尝试获取健康检查
            health = self.client.health()
            return health.status == "pass"
        except Exception as e:
            logger.warning(
                "InfluxDB 连接检查失败",
                category="validation",
                event="influxdb_connection_check_failed",
                error=e
            )
            return False

    def get_health(self) -> Dict[str, Any]:
        """获取健康状态

        Returns:
            健康状态信息
        """
        try:
            health = self.client.health()
            return {
                "status": health.status,
                "message": health.message,
                "version": health.version,
            }
        except Exception as e:
            logger.error(
                "获取 InfluxDB 健康状态失败",
                category="error",
                event="influxdb_health_check_failed",
                error=e
            )
            return {
                "status": "fail",
                "message": str(e),
                "version": None,
            }

    def close(self) -> None:
        """关闭连接"""
        if self._client:
            self._client.close()
            self._client = None
            logger.info(
                "InfluxDB 客户端已关闭",
                category="business",
                event="influxdb_client_closed"
            )


# 全局单例
influx_client = InfluxDBClientManager()


__all__ = [
    "InfluxDBClientManager",
    "influx_client",
    "Point",
    "WritePrecision",
]
