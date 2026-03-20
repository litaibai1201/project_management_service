# -*- coding: utf-8 -*-
"""
@文件: cache_controller.py
@说明: 缓存控制器 - 处理 Redis 缓存相关业务逻辑
@时间: 2026/02/09

MVC 模式说明：
    Controller 层：负责业务逻辑处理
    - 封装 Redis 操作
    - 提供统一的缓存操作接口
"""

from typing import Any, Dict, List, Optional, Union

from cache.redis_oper import OperRedis
from configs.base import BaseConfig


class CacheController:
    """缓存控制器"""

    def __init__(self):
        self.redis = OperRedis()
        self.default_timeout = BaseConfig.CACHE_DEFAULT_TIMEOUT

    # =========================================================================
    # 基础缓存操作
    # =========================================================================

    def get_cache(self, key: str, cache_type: str = "string") -> Any:
        """
        获取缓存数据

        Args:
            key: 缓存键名
            cache_type: 缓存类型（string/hash/list）

        Returns:
            缓存数据
        """
        if cache_type == "string":
            return self.redis.get(key)
        elif cache_type == "hash":
            return self.redis.hgetall(key)
        elif cache_type == "list":
            return self.redis.lrange(key, 0, -1)
        else:
            return self.redis.get(key)

    def set_cache(
        self,
        key: str,
        value: Any,
        cache_type: str = "string",
        ttl: Optional[int] = None
    ) -> bool:
        """
        设置缓存数据

        Args:
            key: 缓存键名
            value: 缓存值
            cache_type: 缓存类型（string/hash/list）
            ttl: 过期时间（秒），None 使用默认值

        Returns:
            是否成功
        """
        ttl = ttl if ttl is not None else self.default_timeout

        if cache_type == "string":
            self.redis.set(key, value, ex=ttl)
        elif cache_type == "hash":
            self.redis.hmset(key, value)
            if ttl:
                self.redis.expire(key, ttl)
        elif cache_type == "list":
            self.redis.delete(key)
            if isinstance(value, list):
                for item in value:
                    self.redis.rpush(key, item)
            if ttl:
                self.redis.expire(key, ttl)

        return True

    def delete_cache(self, key: str) -> bool:
        """删除缓存"""
        self.redis.delete(key)
        return True

    # =========================================================================
    # 计数器操作
    # =========================================================================

    def get_counter(self, key: str) -> Dict[str, Any]:
        """
        获取计数器信息

        Args:
            key: 计数器键名

        Returns:
            包含 value 和 ttl 的字典
        """
        value = self.redis.get(key, default=0)
        ttl = self.redis.ttl(key)
        return {"key": key, "value": value, "ttl": ttl}

    def operate_counter(
        self,
        key: str,
        action: str = "incr",
        amount: int = 1,
        ttl: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        操作计数器

        Args:
            key: 计数器键名
            action: 操作类型（incr/decr/set/reset）
            amount: 增减数量
            ttl: 过期时间（秒）

        Returns:
            操作结果
        """
        if action == "incr":
            value = self.redis.incr(key, amount)
        elif action == "decr":
            value = self.redis.decr(key, amount)
        elif action == "set":
            self.redis.set(key, amount, expire=ttl)
            value = amount
        elif action == "reset":
            self.redis.delete(key)
            value = 0
        else:
            raise ValueError(f"不支持的操作: {action}")

        if ttl and action in ("incr", "decr"):
            self.redis.expire(key, ttl)

        return {"key": key, "value": value, "action": action}

    # =========================================================================
    # Set 集合操作
    # =========================================================================

    def get_set_members(self, key: str) -> Dict[str, Any]:
        """
        获取集合数据

        Args:
            key: 集合键名

        Returns:
            集合成员和数量
        """
        members = self.redis.smembers(key)
        count = self.redis.scard(key)
        return {"key": key, "members": list(members), "count": count}

    def add_set_members(self, key: str, members: List[str]) -> int:
        """
        添加集合成员

        Args:
            key: 集合键名
            members: 成员列表

        Returns:
            添加的成员数量
        """
        if members:
            self.redis.sadd(key, *members)
        return len(members)

    def remove_set_members(self, key: str, members: List[str]) -> int:
        """
        删除集合成员

        Args:
            key: 集合键名
            members: 要删除的成员列表

        Returns:
            删除的数量
        """
        if members:
            return self.redis.srem(key, *members)
        else:
            return self.redis.delete(key)

    # =========================================================================
    # Sorted Set 有序集合操作
    # =========================================================================

    def get_zset_range(
        self,
        key: str,
        start: int = 0,
        end: int = 9,
        withscores: bool = True
    ) -> Dict[str, Any]:
        """
        获取有序集合排行榜数据

        Args:
            key: 有序集合键名
            start: 起始位置
            end: 结束位置
            withscores: 是否返回分数

        Returns:
            排行榜数据
        """
        data = self.redis.zrange(key, start, end, withscores=withscores)
        count = self.redis.zcard(key)

        if withscores:
            result = [{"member": m, "score": s} for m, s in data]
        else:
            result = data

        return {"key": key, "data": result, "total": count}

    def add_zset_members(self, key: str, members: Dict[str, float]) -> int:
        """
        添加有序集合成员

        Args:
            key: 有序集合键名
            members: 成员分数字典

        Returns:
            添加/更新的成员数量
        """
        return self.redis.zadd(key, members)

    # =========================================================================
    # 批量操作
    # =========================================================================

    def batch_get(self, keys: List[str]) -> Dict[str, Any]:
        """
        批量获取数据

        Args:
            keys: 键名列表

        Returns:
            键值对数据
        """
        data = self.redis.mget(*keys)
        return {"data": data}

    def batch_set(self, kv_data: Dict[str, Any]) -> int:
        """
        批量设置数据

        Args:
            kv_data: 键值对字典

        Returns:
            设置的键数量
        """
        self.redis.mset(kv_data)
        return len(kv_data)

    def batch_delete(self, pattern: str) -> int:
        """
        批量删除数据

        Args:
            pattern: 键名模式

        Returns:
            删除的键数量
        """
        return self.redis.delete_many(pattern)

    # =========================================================================
    # 缓存装饰器测试
    # =========================================================================

    def test_cache_decorator(self, param: str, test_type: str = "basic") -> Dict[str, Any]:
        """
        测试缓存装饰器功能

        Args:
            param: 测试参数
            test_type: 测试类型（basic/user_info）

        Returns:
            包含结果、耗时等信息的字典
        """
        import time
        from utils.cache_decorator import cache_result

        # 定义被装饰的函数
        @cache_result(ttl=60, key_prefix="demo")
        def get_expensive_data(p: str) -> dict:
            """模拟耗时操作"""
            time.sleep(0.1)
            return {
                "param": p,
                "timestamp": time.time(),
                "message": "这是一个耗时操作的结果，已被缓存"
            }

        @cache_result(ttl=300, key_prefix="user_info")
        def get_user_info(user_id: int) -> dict:
            """获取用户信息（缓存 5 分钟）"""
            return {
                "user_id": user_id,
                "username": f"user_{user_id}",
                "role": "member"
            }

        # 业务逻辑：根据 test_type 调用不同的函数
        start_time = time.time()

        if test_type == "user_info":
            user_id = int(param) if param.isdigit() else 1
            result = get_user_info(user_id)
        else:
            result = get_expensive_data(param)

        elapsed = time.time() - start_time

        return {
            "result": result,
            "elapsed_ms": round(elapsed * 1000, 2),
            "hint": "首次调用约 100ms，后续调用（命中缓存）约 1ms"
        }
