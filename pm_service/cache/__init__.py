# -*- coding: utf-8 -*-
"""
@文件: __init__.py
@说明: Redis 客户端初始化和管理
@时间: 2026/02/07

现代化 Redis 实现：
- 使用原生 redis-py 库（版本 >= 4.5）
- 支持连接池和自动重连
- 提供同步客户端和链接管理
- 集成日志记录和错误处理
"""

from redis import Redis, ConnectionPool
from redis.exceptions import RedisError, ConnectionError
import os
from typing import Optional
from flask import Flask
from loggers import logger

# 全局 Redis 客户端实例
_redis_client: Optional[Redis] = None
_connection_pool: Optional[ConnectionPool] = None


def get_redis_client() -> Redis:
    """
    获取全局 Redis 客户端实例
    
    Returns:
        Redis: 初始化后的 Redis 客户端
        
    Raises:
        RuntimeError: 如果客户端未初始化
    """
    global _redis_client
    if _redis_client is None:
        raise RuntimeError(
            "Redis 客户端未初始化。请在应用工厂函数中调用 redis_client.init_app(app)"
        )
    return _redis_client


def init_redis_client(app: Flask) -> Redis:
    """
    使用 Flask 应用配置初始化 Redis 客户端
    
    Args:
        app: Flask 应用实例
        
    Returns:
        Redis: 初始化后的 Redis 客户端
    """
    global _redis_client, _connection_pool
    
    # 从配置获取 Redis 连接信息
    redis_url = app.config.get("REDIS_URL")
    pool_size = app.config.get("REDIS_POOL_SIZE", 10)
    max_connections = app.config.get("REDIS_MAX_CONNECTIONS", 50)
    socket_keepalive = app.config.get("REDIS_SOCKET_KEEPALIVE", True)
    socket_keepalive_options = app.config.get("REDIS_SOCKET_KEEPALIVE_OPTIONS", {})
    socket_connect_timeout = app.config.get("REDIS_SOCKET_CONNECT_TIMEOUT", 5)
    socket_timeout = app.config.get("REDIS_SOCKET_TIMEOUT", 5)
    retry_on_timeout = app.config.get("REDIS_RETRY_ON_TIMEOUT", True)
    health_check_interval = app.config.get("REDIS_HEALTH_CHECK_INTERVAL", 30)
    
    try:
        # 创建连接池
        _connection_pool = ConnectionPool.from_url(
            redis_url,
            max_connections=max_connections,
            socket_keepalive=socket_keepalive,
            socket_keepalive_options=socket_keepalive_options,
            socket_connect_timeout=socket_connect_timeout,
            socket_timeout=socket_timeout,
            retry_on_timeout=retry_on_timeout,
            health_check_interval=health_check_interval,
            decode_responses=True,  # 自动解码响应为字符串
        )
        
        # 创建 Redis 客户端
        _redis_client = Redis(connection_pool=_connection_pool)
        
        # 测试连接
        _redis_client.ping()
        
        logger.info("Redis 客户端初始化成功", category="business", event="redis_init_success")
        return _redis_client

    except ConnectionError as e:
        logger.error("Redis 连接失败", category="error", event="redis_connection_failed", error=e)
        raise
    except Exception as e:
        logger.error("Redis 初始化失败", category="error", event="redis_init_failed", error=e)
        raise


def close_redis_client() -> None:
    """关闭 Redis 连接"""
    global _redis_client, _connection_pool
    
    if _redis_client is not None:
        try:
            _redis_client.close()
            _redis_client = None
        except Exception as e:
            print(f"关闭 Redis 客户端时出错: {e}")
    
    if _connection_pool is not None:
        try:
            _connection_pool.disconnect()
            _connection_pool = None
        except Exception as e:
            print(f"断开 Redis 连接池时出错: {e}")


# 为了与旧代码兼容，导出客户端
redis_client = type('RedisClientProxy', (), {
    'init_app': lambda self, app: init_redis_client(app),
    'get_client': lambda self: get_redis_client(),
    '__getattr__': lambda self, name: getattr(get_redis_client(), name),
})()


__all__ = [
    "redis_client",
    "get_redis_client",
    "init_redis_client",
    "close_redis_client",
]
