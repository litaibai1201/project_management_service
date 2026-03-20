# -*- coding: utf-8 -*-
"""
@文件: test_redis_modern.py
@说明: 现代化 Redis 实现的测试
@时间: 2026/02/07
"""

import json
import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cache.redis_oper import OperRedis


def test_redis_operations():
    """测试 Redis 操作"""
    
    print("\n" + "="*60)
    print("Redis 现代化实现功能测试")
    print("="*60)
    
    # 初始化 Redis 操作器
    redis_op = OperRedis()
    
    # 1. 测试基础 String 操作
    print("\n[1] 测试 String 操作:")
    print("-" * 40)
    
    # 设置和获取
    print("✓ set('test_key', 'hello')")
    redis_op.set("test_key", "hello")
    
    value = redis_op.get("test_key")
    print(f"✓ get('test_key') = {value}")
    assert value == "hello", "值不匹配"
    
    # 设置复杂对象
    print("✓ set('user', {'name': 'Alice', 'age': 30})")
    redis_op.set("user", {"name": "Alice", "age": 30})
    
    user = redis_op.get("user")
    print(f"✓ get('user') = {user}")
    assert user == {"name": "Alice", "age": 30}, "对象不匹配"
    
    # 设置过期时间
    print("✓ set('expire_key', 'value', expire=60)")
    redis_op.set("expire_key", "value", expire=60)
    
    ttl = redis_op.ttl("expire_key")
    print(f"✓ ttl('expire_key') = {ttl} 秒")
    assert 0 < ttl <= 60, "TTL 不正确"
    
    # 增减操作
    print("✓ set('counter', 1)")
    redis_op.set("counter", 1)
    
    print("✓ incr('counter')")
    count = redis_op.incr("counter")
    print(f"✓ get('counter') = {count}")
    assert count == 2, "增加操作失败"
    
    # 2. 测试 Hash 操作
    print("\n[2] 测试 Hash 操作:")
    print("-" * 40)
    
    print("✓ hset('hash1', 'field1', 'value1')")
    redis_op.hset("hash1", "field1", "value1")
    
    value = redis_op.hget("hash1", "field1")
    print(f"✓ hget('hash1', 'field1') = {value}")
    assert value == "value1", "Hash 值不匹配"
    
    print("✓ hmset('hash2', {'key1': 'val1', 'key2': 'val2'})")
    redis_op.hmset("hash2", {"key1": "val1", "key2": "val2"})
    
    all_data = redis_op.hgetall("hash2")
    print(f"✓ hgetall('hash2') = {all_data}")
    assert all_data == {"key1": "val1", "key2": "val2"}, "Hash 数据不匹配"
    
    # 3. 测试 List 操作
    print("\n[3] 测试 List 操作:")
    print("-" * 40)
    
    print("✓ rpush('list1', 'a', 'b', 'c')")
    redis_op.rpush("list1", "a", "b", "c")
    
    items = redis_op.lrange("list1")
    print(f"✓ lrange('list1') = {items}")
    assert items == ["a", "b", "c"], "List 数据不匹配"
    
    print("✓ lpop('list1') = ", end="")
    first = redis_op.lpop("list1")
    print(first)
    assert first == "a", "LPOP 失败"
    
    print("✓ rpop('list1') = ", end="")
    last = redis_op.rpop("list1")
    print(last)
    assert last == "c", "RPOP 失败"
    
    # 4. 测试 Set 操作
    print("\n[4] 测试 Set 操作:")
    print("-" * 40)
    
    print("✓ sadd('set1', 'member1', 'member2', 'member3')")
    redis_op.sadd("set1", "member1", "member2", "member3")
    
    members = redis_op.smembers("set1")
    print(f"✓ smembers('set1') = {members}")
    assert members == {"member1", "member2", "member3"}, "Set 数据不匹配"
    
    is_member = redis_op.sismember("set1", "member1")
    print(f"✓ sismember('set1', 'member1') = {is_member}")
    assert is_member, "SISMEMBER 失败"
    
    # 5. 测试 Sorted Set 操作
    print("\n[5] 测试 Sorted Set 操作:")
    print("-" * 40)
    
    print("✓ zadd('zset1', {'user1': 10, 'user2': 20, 'user3': 30})")
    redis_op.zadd("zset1", {"user1": 10, "user2": 20, "user3": 30})
    
    items = redis_op.zrange("zset1", withscores=True)
    print(f"✓ zrange('zset1', withscores=True) = {items}")
    assert len(items) == 3, "Sorted Set 数据不匹配"
    
    # 6. 测试批量操作
    print("\n[6] 测试批量操作:")
    print("-" * 40)
    
    print("✓ mset({'key1': 'val1', 'key2': 'val2', 'key3': 'val3'})")
    redis_op.mset({"key1": "val1", "key2": "val2", "key3": "val3"})
    
    data = redis_op.mget("key1", "key2", "key3")
    print(f"✓ mget('key1', 'key2', 'key3') = {data}")
    assert data == {"key1": "val1", "key2": "val2", "key3": "val3"}, "批量获取失败"
    
    # 7. 测试连接检查
    print("\n[7] 测试连接检查:")
    print("-" * 40)
    
    is_connected = redis_op.ping()
    print(f"✓ ping() = {is_connected}")
    assert is_connected, "PING 失败"
    
    db_size = redis_op.dbsize()
    print(f"✓ dbsize() = {db_size}")
    
    # 8. 清理测试数据
    print("\n[8] 清理测试数据:")
    print("-" * 40)
    
    redis_op.delete(
        "test_key", "user", "expire_key", "counter", 
        "hash1", "hash2", "list1", "set1", "zset1",
        "key1", "key2", "key3"
    )
    print("✓ 测试数据已清理")
    
    print("\n" + "="*60)
    print("✅ 所有测试通过！")
    print("="*60 + "\n")


if __name__ == "__main__":
    try:
        test_redis_operations()
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
