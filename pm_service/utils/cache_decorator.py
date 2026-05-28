# -*- coding: utf-8 -*-
"""
缓存装饰器：`cache_result`

说明：
- 使用项目已有的 `cache.redis_client`（FlaskRedis 实例）作为后端。
- 装饰器对函数结果进行序列化存储（JSON），并通过 `ttl` 过期。
- 默认 key 由 `key_prefix` + 函数名 + 参数构成，可通过 `key_builder` 自定义。

用法示例：
    @cache_result(ttl=600, key_prefix='user_list')
    def get_users(page=1):
        return {'users': [...]}

注意：返回值必须是可 JSON 序列化的类型，或提供自定义 `serializer`。
"""
from functools import wraps
import json
from typing import Callable, Optional

from cache import redis_client
from loggers import logger


def _default_key_builder(func_name: str, args: tuple, kwargs: dict, key_prefix: Optional[str]):
    try:
        parts = [key_prefix or func_name, func_name]
        if kwargs:
            parts.append(json.dumps(kwargs, sort_keys=True, default=str))
        elif args:
            parts.append(json.dumps(args, default=str))
        return ":".join(parts)
    except Exception:
        return f"cache:{func_name}"


def method_key_builder(func_name: str, args: tuple, kwargs: dict, key_prefix: Optional[str]):
    """实例方法专用 key builder：跳过 args[0]（self），避免对象内存地址污染缓存键。"""
    try:
        method_args = args[1:]  # skip self
        parts = [key_prefix or func_name, func_name]
        if kwargs:
            parts.append(json.dumps(kwargs, sort_keys=True, default=str))
        elif method_args:
            parts.append(json.dumps(method_args, default=str))
        return ":".join(parts)
    except Exception:
        return f"cache:{func_name}"


def cache_result(ttl: int = 300, key_prefix: Optional[str] = None, key_builder: Callable = None, serializer: Callable = None, deserializer: Callable = None):
    """缓存结果装饰器

    Args:
        ttl: 过期时间（秒）
        key_prefix: 缓存键前缀
        key_builder: 自定义 key 构建函数，签名 (func_name, args, kwargs, key_prefix) -> str
        serializer: 自定义序列化函数（obj -> str），默认使用 json.dumps
        deserializer: 自定义反序列化函数（str -> obj），默认使用 json.loads
    """
    if key_builder is None:
        key_builder = _default_key_builder
    if serializer is None:
        serializer = lambda obj: json.dumps(obj, ensure_ascii=False, default=str)
    if deserializer is None:
        deserializer = lambda s: json.loads(s)

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            func_name = func.__name__
            cache_key = key_builder(func_name, args, kwargs, key_prefix)

            try:
                cached = redis_client.get(cache_key)
                if cached:
                    try:
                        result = deserializer(cached)
                        logger.debug(f"Cache hit: {cache_key}")
                        return result
                    except Exception:
                        # 反序列化失败，继续执行函数并覆盖缓存
                        logger.warning(f"Cache deserialization failed for key {cache_key}, recalculating")

                # 未命中或反序列化失败，计算并缓存
                result = func(*args, **kwargs)
                try:
                    payload = serializer(result)
                    if ttl and ttl > 0:
                        redis_client.setex(cache_key, ttl, payload)
                    else:
                        redis_client.set(cache_key, payload)
                except Exception:
                    logger.warning(f"Failed to serialize/cache result for key {cache_key}")

                return result
            except Exception as e:
                # 缓存层故障不应影响主流程
                logger.error("Cache decorator error", category="error", event="cache_decorator_failed", custom={"func_name": func_name}, error=e)
                return func(*args, **kwargs)

        return wrapper

    return decorator


__all__ = ["cache_result", "method_key_builder"]
