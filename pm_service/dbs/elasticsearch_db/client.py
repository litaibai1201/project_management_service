# -*- coding: utf-8 -*-
"""
@文件: client.py
@说明: Elasticsearch 客户端管理器
@时间: 2025-09-03

Elasticsearch 是一个分布式、RESTful 搜索和分析引擎。

支持两种初始化方式:
    1. Flask 应用初始化: es_client.init_app(app)
    2. 独立使用: es_client.init(hosts, username, password)

配置项 (环境变量或 Flask config):
    ES_HOSTS: Elasticsearch 节点地址列表（逗号分隔，默认 http://localhost:9200）
    ES_USERNAME: 用户名（可选）
    ES_PASSWORD: 密码（可选）
    ES_API_KEY: API Key（可选，与用户名密码二选一）
    ES_VERIFY_CERTS: 是否验证证书（默认 True）
    ES_CA_CERTS: CA 证书路径（可选）
    ES_TIMEOUT: 超时时间（秒，默认 30）
    ES_MAX_RETRIES: 最大重试次数（默认 3）
    ES_RETRY_ON_TIMEOUT: 超时是否重试（默认 True）
"""
import os
from typing import Optional, List, Dict, Any

try:
    from elasticsearch import Elasticsearch
    from elasticsearch.exceptions import ConnectionError as ESConnectionError
    ES_AVAILABLE = True
except ImportError:
    ES_AVAILABLE = False
    Elasticsearch = None
    ESConnectionError = None

from loggers import logger


class ElasticsearchClient:
    """Elasticsearch 客户端管理器

    使用 Elasticsearch 8.x Python 客户端库

    支持两种初始化方式:
        1. Flask 应用初始化: es_client.init_app(app)
        2. 独立使用: es_client.init(hosts, username, password)

    核心概念:
        - Index: 索引，类似关系型数据库的"库"
        - Document: 文档，类似关系型数据库的"行"
        - Field: 字段，类似关系型数据库的"列"
        - Mapping: 映射，定义字段类型和索引方式
        - Shard: 分片，数据分布存储的单元
        - Replica: 副本，数据冗余备份
    """

    def __init__(self):
        if not ES_AVAILABLE:
            logger.warning(
                "Elasticsearch 客户端库未安装",
                category="warning",
                event="elasticsearch_import_failed",
                custom={"install": "pip install elasticsearch"}
            )

        self._client: Optional[Elasticsearch] = None
        self._hosts: Optional[List[str]] = None
        self._username: Optional[str] = None
        self._password: Optional[str] = None
        self._api_key: Optional[str] = None

    def init_app(self, app) -> None:
        """Flask 应用初始化

        Args:
            app: Flask 应用实例
        """
        if not ES_AVAILABLE:
            raise ImportError(
                "Elasticsearch 客户端库未安装，请运行: pip install elasticsearch"
            )

        config = app.config

        # 获取主机列表
        hosts_str = config.get("ES_HOSTS") or os.environ.get("ES_HOSTS", "http://localhost:9200")
        hosts = [h.strip() for h in hosts_str.split(",")]

        # 认证信息
        username = config.get("ES_USERNAME") or os.environ.get("ES_USERNAME")
        password = config.get("ES_PASSWORD") or os.environ.get("ES_PASSWORD")
        api_key = config.get("ES_API_KEY") or os.environ.get("ES_API_KEY")

        # 连接选项
        verify_certs = config.get("ES_VERIFY_CERTS", True)
        ca_certs = config.get("ES_CA_CERTS") or os.environ.get("ES_CA_CERTS")
        timeout = config.get("ES_TIMEOUT", 30)
        max_retries = config.get("ES_MAX_RETRIES", 3)
        retry_on_timeout = config.get("ES_RETRY_ON_TIMEOUT", True)

        self._init_client(
            hosts=hosts,
            username=username,
            password=password,
            api_key=api_key,
            verify_certs=verify_certs,
            ca_certs=ca_certs,
            timeout=timeout,
            max_retries=max_retries,
            retry_on_timeout=retry_on_timeout,
        )

    def init(
        self,
        hosts: List[str],
        username: Optional[str] = None,
        password: Optional[str] = None,
        api_key: Optional[str] = None,
        verify_certs: bool = True,
        ca_certs: Optional[str] = None,
        timeout: int = 30,
        max_retries: int = 3,
        retry_on_timeout: bool = True,
    ) -> None:
        """独立初始化 (非 Flask 环境)

        Args:
            hosts: Elasticsearch 节点地址列表
            username: 用户名
            password: 密码
            api_key: API Key（与用户名密码二选一）
            verify_certs: 是否验证证书
            ca_certs: CA 证书路径
            timeout: 超时时间（秒）
            max_retries: 最大重试次数
            retry_on_timeout: 超时是否重试
        """
        if not ES_AVAILABLE:
            raise ImportError(
                "Elasticsearch 客户端库未安装，请运行: pip install elasticsearch"
            )

        self._init_client(
            hosts=hosts,
            username=username,
            password=password,
            api_key=api_key,
            verify_certs=verify_certs,
            ca_certs=ca_certs,
            timeout=timeout,
            max_retries=max_retries,
            retry_on_timeout=retry_on_timeout,
        )

    def _init_client(
        self,
        hosts: List[str],
        username: Optional[str],
        password: Optional[str],
        api_key: Optional[str],
        verify_certs: bool,
        ca_certs: Optional[str],
        timeout: int,
        max_retries: int,
        retry_on_timeout: bool,
    ) -> None:
        """内部初始化方法"""
        self._hosts = hosts
        self._username = username
        self._password = password
        self._api_key = api_key

        # 构建连接参数
        connect_params = {
            "hosts": hosts,
            "timeout": timeout,
            "max_retries": max_retries,
            "retry_on_timeout": retry_on_timeout,
            "verify_certs": verify_certs,
        }

        # 认证方式
        if api_key:
            # 使用 API Key 认证
            connect_params["api_key"] = api_key
        elif username and password:
            # 使用用户名密码认证
            connect_params["basic_auth"] = (username, password)

        # SSL 证书
        if ca_certs:
            connect_params["ca_certs"] = ca_certs

        self._client = Elasticsearch(**connect_params)

        logger.info(
            "Elasticsearch 客户端初始化成功",
            category="business",
            event="elasticsearch_client_initialized",
            custom={
                "hosts": hosts,
                "auth_method": "api_key" if api_key else "basic_auth" if username else "none",
            }
        )

    @property
    def client(self) -> Elasticsearch:
        """获取 Elasticsearch 客户端实例"""
        if self._client is None:
            raise RuntimeError("Elasticsearch 客户端未初始化，请先调用 init_app() 或 init()")
        return self._client

    def is_connected(self) -> bool:
        """检查连接状态

        Returns:
            是否连接成功
        """
        if self._client is None:
            return False

        try:
            return self._client.ping()
        except Exception as e:
            logger.warning(
                "Elasticsearch 连接检查失败",
                category="validation",
                event="elasticsearch_connection_check_failed",
                error=e
            )
            return False

    def get_cluster_info(self) -> Dict[str, Any]:
        """获取集群信息

        Returns:
            集群信息
        """
        try:
            info = self.client.info()
            return {
                "cluster_name": info.get("cluster_name"),
                "cluster_uuid": info.get("cluster_uuid"),
                "version": info.get("version", {}).get("number"),
                "tagline": info.get("tagline"),
            }
        except Exception as e:
            logger.error(
                "获取 Elasticsearch 集群信息失败",
                category="error",
                event="elasticsearch_info_failed",
                error=e
            )
            return {}

    def get_cluster_health(self) -> Dict[str, Any]:
        """获取集群健康状态

        Returns:
            健康状态信息
        """
        try:
            health = self.client.cluster.health()
            return {
                "status": health.get("status"),  # green/yellow/red
                "cluster_name": health.get("cluster_name"),
                "number_of_nodes": health.get("number_of_nodes"),
                "active_shards": health.get("active_shards"),
                "relocating_shards": health.get("relocating_shards"),
                "initializing_shards": health.get("initializing_shards"),
                "unassigned_shards": health.get("unassigned_shards"),
            }
        except Exception as e:
            logger.error(
                "获取 Elasticsearch 集群健康状态失败",
                category="error",
                event="elasticsearch_health_failed",
                error=e
            )
            return {"status": "unknown"}

    def close(self) -> None:
        """关闭连接"""
        if self._client:
            self._client.close()
            self._client = None
            logger.info(
                "Elasticsearch 客户端已关闭",
                category="business",
                event="elasticsearch_client_closed"
            )


# 全局单例
es_client = ElasticsearchClient()


__all__ = [
    "ElasticsearchClient",
    "es_client",
]
