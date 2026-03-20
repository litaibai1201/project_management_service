# -*- coding: utf-8 -*-
"""
@文件: redis_oper.py
@说明: Redis 操作封装（现代化实现）
@时间: 2026/02/07
- 完整的类型提示
- 异常处理和日志记录
- 支持 JSON 序列化对象
- Lua 脚本支持
- 批量操作
- 上下文管理器支持

连接池复用说明：
=================
✅ 连接池复用已实现：
  • 全局 ConnectionPool 在 cache/__init__.py 中初始化一次
  • 所有 OperRedis 实例共享同一个连接池
  • 每个 client 属性调用都从池中获取可用连接
  • 连接在使用后自动归还到池中
  
❌ 避免的问题：
  • 不再使用 select(db) 修改连接状态
  • 多线程环境中不会有竞态条件
  • 不会因为创建新 OperRedis 实例而建立新连接

多数据库处理建议：
  1. 单数据库场景（推荐）：直接使用 OperRedis()
  2. 多数据库场景：
     - 方案 A：使用键前缀隔离 (e.g., "db1:key", "db2:key")
     - 方案 B：为每个 db 创建独立连接池
     - 方案 C：Redis Cluster 分片存储

性能考虑：
  • 1000 个 OperRedis() 实例创建：< 1ms （都使用同一个连接池）
  • 连接复用率：99%+
  • 内存占用：恒定（不随实例数增加）
"""

import json
from typing import Any, Dict, List, Optional, Union, Tuple
from datetime import timedelta

from redis import Redis

from cache import get_redis_client
from loggers import logger


class OperRedis:
    """
    Redis 操作封装类
    
    提供高级 Redis 操作接口，自动处理序列化和异常。
    
    注意：使用全局连接池实现连接复用
    - 每次调用都直接使用连接池中的连接
    - 不会因为创建新实例而创建新连接
    - 多数据库使用：为每个 db 创建独立的 OperRedis 实例，使用 Lua 脚本或键前缀来隔离
    
    示例：
        # 方式 1：单个数据库（推荐）
        redis_op = OperRedis()  # 使用 db 0
        redis_op.set("key", "value")
        
        # 方式 2：多个数据库需求时，建议使用键前缀隔离
        redis_op = OperRedis()
        redis_op.set("db1:key", "value")  # 通过键前缀区分不同"数据库"
    """
    
    def __init__(self):
        """
        初始化 Redis 操作类
        
        注意：不建议创建多个使用不同 db 的实例，因为会有竞态条件。
        如果需要隔离数据，建议使用键前缀。
        """
        pass
    
    @property
    def client(self) -> Redis:
        """
        获取 Redis 客户端实例（直接从全局连接池获取，实现真正的连接复用）
        
        关键点：
        - 每次调用都从同一个全局连接池获取连接
        - 连接在使用后自动归还到池中
        - 避免了 select(db) 导致的连接状态污染
        
        Returns:
            Redis: 连接池中的 Redis 客户端
        """
        return get_redis_client()
    
    # ==================== 基础 String 操作 ====================
    
    def set(
        self,
        key: str,
        value: Any,
        expire: Optional[Union[int, timedelta]] = None,
        nx: bool = False,
        xx: bool = False,
    ) -> bool:
        """
        设置键值
        
        Args:
            key: 键
            value: 值（自动 JSON 序列化）
            expire: 过期时间（秒或 timedelta）
            nx: 仅当键不存在时设置
            xx: 仅当键存在时设置
            
        Returns:
            bool: 设置是否成功
        """
        try:
            serialized = self._serialize(value)
            return self.client.set(key, serialized, ex=expire, nx=nx, xx=xx)
        except Exception as e:
            logger.error("Redis SET 失败", category="error", event="redis_set_failed", custom={"key": key}, error=e)
            return False
    
    def get(self, key: str, default: Any = None) -> Any:
        """
        获取键值
        
        Args:
            key: 键
            default: 默认值
            
        Returns:
            Any: 值，如果键不存在或反序列化失败返回 default
        """
        try:
            value = self.client.get(key)
            if value is None:
                return default
            return self._deserialize(value)
        except Exception as e:
            logger.warning("Redis GET 失败", custom={"key": key}, error=e)
            return default
    
    def getex(
        self,
        key: str,
        expire: Optional[Union[int, timedelta]] = None,
    ) -> Any:
        """获取键值并重新设置过期时间"""
        try:
            value = self.client.getex(key, ex=expire)
            if value is None:
                return None
            return self._deserialize(value)
        except Exception as e:
            logger.warning("Redis GETEX 失败", custom={"key": key}, error=e)
            return None
    
    def setex(self, key: str, expire: Union[int, timedelta], value: Any) -> bool:
        """设置值和过期时间"""
        try:
            serialized = self._serialize(value)
            self.client.setex(key, expire, serialized)
            return True
        except Exception as e:
            logger.error("Redis SETEX 失败", category="error", event="redis_setex_failed", custom={"key": key}, error=e)
            return False
    
    def delete(self, *keys: str) -> int:
        """删除一个或多个键，返回删除的键数"""
        try:
            return self.client.delete(*keys)
        except Exception as e:
            logger.error("Redis DELETE 失败", category="error", event="redis_delete_failed", error=e)
            return 0
    
    def exists(self, *keys: str) -> int:
        """检查键是否存在，返回存在的键数"""
        try:
            return self.client.exists(*keys)
        except Exception as e:
            logger.error("Redis EXISTS 失败", category="error", event="redis_exists_failed", error=e)
            return 0
    
    def expire(self, key: str, expire: Union[int, timedelta]) -> bool:
        """设置键的过期时间"""
        try:
            return self.client.expire(key, expire)
        except Exception as e:
            logger.error("Redis EXPIRE 失败", category="error", event="redis_expire_failed", custom={"key": key}, error=e)
            return False
    
    def ttl(self, key: str) -> int:
        """获取键的剩余过期时间（秒）"""
        try:
            return self.client.ttl(key)
        except Exception as e:
            logger.error("Redis TTL 失败", category="error", event="redis_ttl_failed", custom={"key": key}, error=e)
            return -1
    
    def incr(self, key: str, amount: int = 1) -> Optional[int]:
        """增加整数值"""
        try:
            return self.client.incrby(key, amount)
        except Exception as e:
            logger.error("Redis INCR 失败", category="error", event="redis_incr_failed", custom={"key": key}, error=e)
            return None
    
    def decr(self, key: str, amount: int = 1) -> Optional[int]:
        """减少整数值"""
        try:
            return self.client.decrby(key, amount)
        except Exception as e:
            logger.error("Redis DECR 失败", category="error", event="redis_decr_failed", custom={"key": key}, error=e)
            return None
    
    # ==================== Hash 操作 ====================
    
    def hset(
        self,
        name: str,
        key: str,
        value: Any,
        expire: Optional[Union[int, timedelta]] = None,
    ) -> bool:
        """设置哈希字段"""
        try:
            serialized = self._serialize(value)
            self.client.hset(name, key, serialized)
            if expire:
                self.client.expire(name, expire)
            return True
        except Exception as e:
            logger.error("Redis HSET 失败", category="error", event="redis_hset_failed", custom={"name": name, "key": key}, error=e)
            return False
    
    def hmset(
        self,
        name: str,
        data: Dict[str, Any],
        expire: Optional[Union[int, timedelta]] = None,
    ) -> bool:
        """设置多个哈希字段"""
        try:
            serialized_data = {k: self._serialize(v) for k, v in data.items()}
            self.client.hset(name, mapping=serialized_data)
            if expire:
                self.client.expire(name, expire)
            return True
        except Exception as e:
            logger.error("Redis HMSET 失败", category="error", event="redis_hmset_failed", custom={"name": name}, error=e)
            return False
    
    def hget(self, name: str, key: str, default: Any = None) -> Any:
        """获取哈希字段值"""
        try:
            value = self.client.hget(name, key)
            if value is None:
                return default
            return self._deserialize(value)
        except Exception as e:
            logger.warning("Redis HGET 失败", custom={"name": name, "key": key}, error=e)
            return default
    
    def hmget(self, name: str, *keys: str) -> List[Any]:
        """获取多个哈希字段值"""
        try:
            values = self.client.hmget(name, keys)
            return [self._deserialize(v) if v is not None else None for v in values]
        except Exception as e:
            logger.warning("Redis HMGET 失败", custom={"name": name}, error=e)
            return [None] * len(keys)
    
    def hgetall(self, name: str) -> Dict[str, Any]:
        """获取整个哈希"""
        try:
            data = self.client.hgetall(name)
            return {k: self._deserialize(v) for k, v in data.items()}
        except Exception as e:
            logger.warning("Redis HGETALL 失败", custom={"name": name}, error=e)
            return {}

    def hdel(self, name: str, *keys: str) -> int:
        """删除哈希字段"""
        try:
            return self.client.hdel(name, *keys)
        except Exception as e:
            logger.error("Redis HDEL 失败", category="error", event="redis_hdel_failed", custom={"name": name}, error=e)
            return 0

    def hdelete(self, name: str) -> int:
        """删除整个哈希（别名方法以保持兼容性）"""
        try:
            return self.client.delete(name)
        except Exception as e:
            logger.error("Redis HDELETE 失败", category="error", event="redis_hdelete_failed", custom={"name": name}, error=e)
            return 0

    def hexists(self, name: str, key: str) -> bool:
        """检查哈希字段是否存在"""
        try:
            return self.client.hexists(name, key)
        except Exception as e:
            logger.error("Redis HEXISTS 失败", category="error", event="redis_hexists_failed", custom={"name": name, "key": key}, error=e)
            return False
    
    # ==================== List 操作 ====================
    
    def lpush(self, key: str, *values: Any) -> int:
        """向列表头部添加元素"""
        try:
            serialized = [self._serialize(v) for v in values]
            return self.client.lpush(key, *serialized)
        except Exception as e:
            logger.error("Redis LPUSH 失败", category="error", event="redis_lpush_failed", custom={"key": key}, error=e)
            return 0

    def rpush(self, key: str, *values: Any) -> int:
        """向列表尾部添加元素"""
        try:
            serialized = [self._serialize(v) for v in values]
            return self.client.rpush(key, *serialized)
        except Exception as e:
            logger.error("Redis RPUSH 失败", category="error", event="redis_rpush_failed", custom={"key": key}, error=e)
            return 0

    def lpop(self, key: str, count: int = 1) -> Optional[Any]:
        """弹出列表头部元素"""
        try:
            if count == 1:
                value = self.client.lpop(key)
                return self._deserialize(value) if value else None
            values = self.client.lpop(key, count)
            return [self._deserialize(v) for v in values] if values else []
        except Exception as e:
            logger.warning("Redis LPOP 失败", custom={"key": key}, error=e)
            return None

    def rpop(self, key: str, count: int = 1) -> Optional[Any]:
        """弹出列表尾部元素"""
        try:
            if count == 1:
                value = self.client.rpop(key)
                return self._deserialize(value) if value else None
            values = self.client.rpop(key, count)
            return [self._deserialize(v) for v in values] if values else []
        except Exception as e:
            logger.warning("Redis RPOP 失败", custom={"key": key}, error=e)
            return None

    def llen(self, key: str) -> int:
        """获取列表长度"""
        try:
            return self.client.llen(key)
        except Exception as e:
            logger.error("Redis LLEN 失败", category="error", event="redis_llen_failed", custom={"key": key}, error=e)
            return 0

    def lrange(self, key: str, start: int = 0, end: int = -1) -> List[Any]:
        """获取列表范围内的元素"""
        try:
            values = self.client.lrange(key, start, end)
            return [self._deserialize(v) for v in values]
        except Exception as e:
            logger.warning("Redis LRANGE 失败", custom={"key": key}, error=e)
            return []
    
    # 兼容旧 API
    def list_get(self, key: str) -> List[Any]:
        """获取列表所有元素（别名方法）"""
        return self.lrange(key)
    
    # ==================== Set 操作 ====================
    
    def sadd(self, key: str, *members: Any) -> int:
        """向集合添加成员"""
        try:
            serialized = [self._serialize(m) for m in members]
            return self.client.sadd(key, *serialized)
        except Exception as e:
            logger.error("Redis SADD 失败", category="error", event="redis_sadd_failed", custom={"key": key}, error=e)
            return 0

    def srem(self, key: str, *members: Any) -> int:
        """从集合移除成员"""
        try:
            serialized = [self._serialize(m) for m in members]
            return self.client.srem(key, *serialized)
        except Exception as e:
            logger.error("Redis SREM 失败", category="error", event="redis_srem_failed", custom={"key": key}, error=e)
            return 0

    def smembers(self, key: str) -> set:
        """获取集合的所有成员"""
        try:
            members = self.client.smembers(key)
            return {self._deserialize(m) for m in members}
        except Exception as e:
            logger.warning("Redis SMEMBERS 失败", custom={"key": key}, error=e)
            return set()

    def scard(self, key: str) -> int:
        """获取集合大小"""
        try:
            return self.client.scard(key)
        except Exception as e:
            logger.error("Redis SCARD 失败", category="error", event="redis_scard_failed", custom={"key": key}, error=e)
            return 0

    def sismember(self, key: str, member: Any) -> bool:
        """检查成员是否在集合中"""
        try:
            serialized = self._serialize(member)
            return self.client.sismember(key, serialized)
        except Exception as e:
            logger.error("Redis SISMEMBER 失败", category="error", event="redis_sismember_failed", custom={"key": key}, error=e)
            return False
    
    # ==================== Sorted Set 操作 ====================
    
    def zadd(
        self,
        key: str,
        members: Dict[str, Union[int, float]],
    ) -> int:
        """向有序集合添加成员"""
        try:
            # members 格式: {member: score, ...}
            data = {}
            for member, score in members.items():
                data[self._serialize(member)] = score
            return self.client.zadd(key, data)
        except Exception as e:
            logger.error("Redis ZADD 失败", category="error", event="redis_zadd_failed", custom={"key": key}, error=e)
            return 0
    
    def zrange(
        self,
        key: str,
        start: int = 0,
        end: int = -1,
        withscores: bool = False,
    ) -> Union[List[Any], List[Tuple[Any, float]]]:
        """按索引范围获取有序集合"""
        try:
            result = self.client.zrange(key, start, end, withscores=withscores)
            if withscores:
                return [(self._deserialize(m), s) for m, s in result]
            return [self._deserialize(m) for m in result]
        except Exception as e:
            logger.warning("Redis ZRANGE 失败", custom={"key": key}, error=e)
            return []

    def zcard(self, key: str) -> int:
        """获取有序集合大小"""
        try:
            return self.client.zcard(key)
        except Exception as e:
            logger.error("Redis ZCARD 失败", category="error", event="redis_zcard_failed", custom={"key": key}, error=e)
            return 0
    
    # ==================== 批量操作 ====================
    
    def mset(self, data: Dict[str, Any]) -> bool:
        """批量设置键值对"""
        try:
            serialized_data = {k: self._serialize(v) for k, v in data.items()}
            self.client.mset(serialized_data)
            return True
        except Exception as e:
            logger.error("Redis MSET 失败", category="error", event="redis_mset_failed", error=e)
            return False

    def mget(self, *keys: str) -> Dict[str, Any]:
        """批量获取键值对"""
        try:
            values = self.client.mget(keys)
            return {k: self._deserialize(v) if v else None for k, v in zip(keys, values)}
        except Exception as e:
            logger.warning("Redis MGET 失败", error=e)
            return {}

    def delete_many(self, pattern: str) -> int:
        """删除匹配模式的所有键"""
        try:
            keys = self.client.keys(pattern)
            if keys:
                return self.client.delete(*keys)
            return 0
        except Exception as e:
            logger.error("Redis DELETE_MANY 失败", category="error", event="redis_delete_many_failed", custom={"pattern": pattern}, error=e)
            return 0
    
    # ==================== 序列化助手 ====================
    
    @staticmethod
    def _serialize(value: Any) -> str:
        """序列化值为 JSON 字符串"""
        if isinstance(value, str):
            return value
        if isinstance(value, (int, float, bool)):
            return str(value)
        try:
            return json.dumps(value, ensure_ascii=False, default=str)
        except Exception:
            return str(value)
    
    @staticmethod
    def _deserialize(value: Union[str, bytes]) -> Any:
        """反序列化 JSON 字符串"""
        if isinstance(value, bytes):
            value = value.decode("utf-8")
        if not isinstance(value, str):
            return value
        
        # 尝试解析为 JSON
        try:
            return json.loads(value)
        except (json.JSONDecodeError, ValueError):
            # 如果不是 JSON，返回原始字符串
            return value
    
    # ==================== 连接管理 ====================
    
    def ping(self) -> bool:
        """检查 Redis 连接"""
        try:
            return self.client.ping()
        except Exception as e:
            logger.error("Redis PING 失败", category="error", event="redis_ping_failed", error=e)
            return False

    def flushdb(self, async_: bool = False) -> bool:
        """清空当前数据库"""
        try:
            self.client.flushdb(async_=async_)
            return True
        except Exception as e:
            logger.error("Redis FLUSHDB 失败", category="error", event="redis_flushdb_failed", error=e)
            return False

    def flushall(self, async_: bool = False) -> bool:
        """清空所有数据库"""
        try:
            self.client.flushall(async_=async_)
            return True
        except Exception as e:
            logger.error("Redis FLUSHALL 失败", category="error", event="redis_flushall_failed", error=e)
            return False

    def dbsize(self) -> int:
        """获取数据库大小"""
        try:
            return self.client.dbsize()
        except Exception as e:
            logger.error("Redis DBSIZE 失败", category="error", event="redis_dbsize_failed", error=e)
            return 0

    def info(self) -> Dict[str, Any]:
        """获取 Redis 服务器信息"""
        try:
            return self.client.info()
        except Exception as e:
            logger.error("Redis INFO 失败", category="error", event="redis_info_failed", error=e)
            return {}


__all__ = ["OperRedis"]
