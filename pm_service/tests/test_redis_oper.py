# -*- coding: utf-8 -*-
"""
@文件: test_redis_oper.py
@说明: OperRedis 单元测试（patch get_redis_client 隔离 Redis）
@时间: 2026-03-09

运行: python -m pytest tests/test_redis_oper.py -v
"""
import json
import unittest
from contextlib import contextmanager
from unittest.mock import MagicMock, patch


@contextmanager
def mock_redis_client():
    """上下文管理器：patch get_redis_client 并返回 mock client"""
    mock_client = MagicMock()
    with patch("cache.redis_oper.get_redis_client", return_value=mock_client):
        yield mock_client


def make_redis():
    """创建一个 OperRedis 实例（每次都 patch get_redis_client）"""
    from cache.redis_oper import OperRedis
    return OperRedis()


class TestOperRedisSerialization(unittest.TestCase):
    """_serialize / _deserialize 内部方法测试"""

    def setUp(self):
        from cache.redis_oper import OperRedis
        self.redis = OperRedis()

    def test_serialize_string_returns_as_is(self):
        """字符串直接返回，不包装 JSON"""
        result = self.redis._serialize("hello")
        self.assertEqual(result, "hello")

    def test_serialize_dict(self):
        result = self.redis._serialize({"a": 1})
        self.assertEqual(json.loads(result), {"a": 1})

    def test_serialize_list(self):
        result = self.redis._serialize([1, 2, 3])
        self.assertEqual(json.loads(result), [1, 2, 3])

    def test_serialize_int(self):
        result = self.redis._serialize(42)
        self.assertEqual(result, "42")

    def test_serialize_float(self):
        result = self.redis._serialize(3.14)
        self.assertEqual(result, "3.14")

    def test_deserialize_json_dict(self):
        raw = json.dumps({"a": 1}).encode()
        result = self.redis._deserialize(raw)
        self.assertEqual(result, {"a": 1})

    def test_deserialize_plain_string(self):
        result = self.redis._deserialize("plain_string")
        self.assertEqual(result, "plain_string")

    def test_deserialize_bytes(self):
        result = self.redis._deserialize(b"hello")
        self.assertEqual(result, "hello")

    def test_deserialize_none_like_behavior(self):
        # 非 str/bytes 直接返回
        result = self.redis._deserialize(42)
        self.assertEqual(result, 42)


class TestOperRedisString(unittest.TestCase):
    """String 操作测试"""

    def test_set_dict_value(self):
        with mock_redis_client() as mock_client:
            mock_client.set.return_value = True
            redis = make_redis()
            redis.set("key1", {"a": 1})
            mock_client.set.assert_called_once_with(
                "key1", json.dumps({"a": 1}, ensure_ascii=False, default=str),
                ex=None, nx=False, xx=False
            )

    def test_set_string_value(self):
        with mock_redis_client() as mock_client:
            mock_client.set.return_value = True
            redis = make_redis()
            redis.set("key1", "hello")
            mock_client.set.assert_called_once_with("key1", "hello", ex=None, nx=False, xx=False)

    def test_set_with_expire(self):
        with mock_redis_client() as mock_client:
            mock_client.set.return_value = True
            redis = make_redis()
            redis.set("key1", "value", expire=300)
            mock_client.set.assert_called_once_with("key1", "value", ex=300, nx=False, xx=False)

    def test_get_deserializes_json(self):
        with mock_redis_client() as mock_client:
            mock_client.get.return_value = json.dumps({"a": 1}).encode()
            redis = make_redis()
            result = redis.get("key1")
            self.assertEqual(result, {"a": 1})

    def test_get_returns_none_when_missing(self):
        with mock_redis_client() as mock_client:
            mock_client.get.return_value = None
            redis = make_redis()
            result = redis.get("missing_key")
            self.assertIsNone(result)

    def test_get_returns_default_when_missing(self):
        with mock_redis_client() as mock_client:
            mock_client.get.return_value = None
            redis = make_redis()
            result = redis.get("missing_key", default="fallback")
            self.assertEqual(result, "fallback")

    def test_delete_single_key(self):
        with mock_redis_client() as mock_client:
            mock_client.delete.return_value = 1
            redis = make_redis()
            redis.delete("key1")
            mock_client.delete.assert_called_once_with("key1")

    def test_delete_multiple_keys(self):
        with mock_redis_client() as mock_client:
            mock_client.delete.return_value = 2
            redis = make_redis()
            redis.delete("key1", "key2")
            mock_client.delete.assert_called_once_with("key1", "key2")

    def test_exists_returns_count(self):
        with mock_redis_client() as mock_client:
            mock_client.exists.return_value = 1
            redis = make_redis()
            result = redis.exists("key1")
            self.assertEqual(result, 1)

    def test_expire(self):
        with mock_redis_client() as mock_client:
            mock_client.expire.return_value = True
            redis = make_redis()
            redis.expire("key1", 600)
            mock_client.expire.assert_called_once_with("key1", 600)

    def test_ttl(self):
        with mock_redis_client() as mock_client:
            mock_client.ttl.return_value = 299
            redis = make_redis()
            result = redis.ttl("key1")
            self.assertEqual(result, 299)

    def test_incr_calls_incrby(self):
        with mock_redis_client() as mock_client:
            mock_client.incrby.return_value = 5
            redis = make_redis()
            result = redis.incr("counter")
            mock_client.incrby.assert_called_once_with("counter", 1)
            self.assertEqual(result, 5)

    def test_incr_with_amount(self):
        with mock_redis_client() as mock_client:
            mock_client.incrby.return_value = 10
            redis = make_redis()
            redis.incr("counter", 5)
            mock_client.incrby.assert_called_once_with("counter", 5)

    def test_decr_calls_decrby(self):
        with mock_redis_client() as mock_client:
            mock_client.decrby.return_value = 3
            redis = make_redis()
            result = redis.decr("counter")
            mock_client.decrby.assert_called_once_with("counter", 1)
            self.assertEqual(result, 3)

    def test_setex(self):
        with mock_redis_client() as mock_client:
            redis = make_redis()
            redis.setex("key1", 300, "value")
            mock_client.setex.assert_called_once_with("key1", 300, "value")


class TestOperRedisHash(unittest.TestCase):
    """Hash 操作测试"""

    def test_hset_serializes_value(self):
        with mock_redis_client() as mock_client:
            redis = make_redis()
            redis.hset("hash1", "field1", {"val": 1})
            serialized = json.dumps({"val": 1}, ensure_ascii=False, default=str)
            mock_client.hset.assert_called_once_with("hash1", "field1", serialized)

    def test_hset_with_expire(self):
        with mock_redis_client() as mock_client:
            redis = make_redis()
            redis.hset("hash1", "field1", "v", expire=300)
            mock_client.expire.assert_called_once_with("hash1", 300)

    def test_hget_deserializes(self):
        with mock_redis_client() as mock_client:
            mock_client.hget.return_value = json.dumps(42).encode()
            redis = make_redis()
            result = redis.hget("hash1", "field1")
            self.assertEqual(result, 42)

    def test_hget_none_returns_default(self):
        with mock_redis_client() as mock_client:
            mock_client.hget.return_value = None
            redis = make_redis()
            result = redis.hget("hash1", "missing", default="default_val")
            self.assertEqual(result, "default_val")

    def test_hgetall_deserializes_all(self):
        with mock_redis_client() as mock_client:
            # hgetall 保留原始 key 类型（bytes），值会被反序列化
            raw = {b"f1": b"v1", b"f2": json.dumps(2).encode()}
            mock_client.hgetall.return_value = raw
            redis = make_redis()
            result = redis.hgetall("hash1")
            self.assertEqual(result.get(b"f1"), "v1")
            self.assertEqual(result.get(b"f2"), 2)

    def test_hdel(self):
        with mock_redis_client() as mock_client:
            mock_client.hdel.return_value = 1
            redis = make_redis()
            redis.hdel("hash1", "field1")
            mock_client.hdel.assert_called_once_with("hash1", "field1")

    def test_hexists(self):
        with mock_redis_client() as mock_client:
            mock_client.hexists.return_value = True
            redis = make_redis()
            result = redis.hexists("hash1", "field1")
            self.assertTrue(result)

    def test_hmset(self):
        with mock_redis_client() as mock_client:
            redis = make_redis()
            redis.hmset("hash1", {"k1": "v1", "k2": 42})
            mock_client.hset.assert_called_once()
            args = mock_client.hset.call_args
            self.assertEqual(args[0][0], "hash1")


class TestOperRedisList(unittest.TestCase):
    """List 操作测试"""

    def test_lpush_serializes(self):
        with mock_redis_client() as mock_client:
            mock_client.lpush.return_value = 1
            redis = make_redis()
            redis.lpush("list1", "item1")
            mock_client.lpush.assert_called_once_with("list1", "item1")

    def test_lpush_dict(self):
        with mock_redis_client() as mock_client:
            mock_client.lpush.return_value = 1
            redis = make_redis()
            redis.lpush("list1", {"a": 1})
            serialized = json.dumps({"a": 1}, ensure_ascii=False, default=str)
            mock_client.lpush.assert_called_once_with("list1", serialized)

    def test_rpush(self):
        with mock_redis_client() as mock_client:
            mock_client.rpush.return_value = 1
            redis = make_redis()
            redis.rpush("list1", "item1")
            mock_client.rpush.assert_called_once_with("list1", "item1")

    def test_lpop_deserializes(self):
        with mock_redis_client() as mock_client:
            mock_client.lpop.return_value = b"hello"
            redis = make_redis()
            result = redis.lpop("list1")
            self.assertEqual(result, "hello")

    def test_lpop_none_returns_none(self):
        with mock_redis_client() as mock_client:
            mock_client.lpop.return_value = None
            redis = make_redis()
            result = redis.lpop("list1")
            self.assertIsNone(result)

    def test_rpop_none(self):
        with mock_redis_client() as mock_client:
            mock_client.rpop.return_value = None
            redis = make_redis()
            result = redis.rpop("list1")
            self.assertIsNone(result)

    def test_llen(self):
        with mock_redis_client() as mock_client:
            mock_client.llen.return_value = 5
            redis = make_redis()
            result = redis.llen("list1")
            self.assertEqual(result, 5)

    def test_lrange_deserializes(self):
        with mock_redis_client() as mock_client:
            raw = [b"a", json.dumps({"k": 1}).encode()]
            mock_client.lrange.return_value = raw
            redis = make_redis()
            result = redis.lrange("list1", 0, -1)
            self.assertEqual(result[0], "a")
            self.assertEqual(result[1], {"k": 1})


class TestOperRedisSet(unittest.TestCase):
    """Set 操作测试"""

    def test_sadd_string(self):
        with mock_redis_client() as mock_client:
            mock_client.sadd.return_value = 1
            redis = make_redis()
            redis.sadd("set1", "member1")
            mock_client.sadd.assert_called_once_with("set1", "member1")

    def test_smembers_deserializes(self):
        with mock_redis_client() as mock_client:
            mock_client.smembers.return_value = {b"a", b"b"}
            redis = make_redis()
            result = redis.smembers("set1")
            self.assertIn("a", result)
            self.assertIn("b", result)

    def test_scard(self):
        with mock_redis_client() as mock_client:
            mock_client.scard.return_value = 3
            redis = make_redis()
            result = redis.scard("set1")
            self.assertEqual(result, 3)

    def test_sismember(self):
        with mock_redis_client() as mock_client:
            mock_client.sismember.return_value = True
            redis = make_redis()
            result = redis.sismember("set1", "member1")
            self.assertTrue(result)

    def test_srem(self):
        with mock_redis_client() as mock_client:
            mock_client.srem.return_value = 1
            redis = make_redis()
            redis.srem("set1", "member1")
            mock_client.srem.assert_called_once_with("set1", "member1")


class TestOperRedisZSet(unittest.TestCase):
    """Sorted Set 操作测试"""

    def test_zadd_serializes_members(self):
        with mock_redis_client() as mock_client:
            mock_client.zadd.return_value = 1
            redis = make_redis()
            redis.zadd("zset1", {"member1": 1.0})
            mock_client.zadd.assert_called_once_with("zset1", {"member1": 1.0})

    def test_zrange_deserializes(self):
        with mock_redis_client() as mock_client:
            mock_client.zrange.return_value = [b"m1", b"m2"]
            redis = make_redis()
            result = redis.zrange("zset1", 0, -1)
            self.assertEqual(result, ["m1", "m2"])

    def test_zrange_with_scores(self):
        with mock_redis_client() as mock_client:
            mock_client.zrange.return_value = [(b"m1", 1.0), (b"m2", 2.0)]
            redis = make_redis()
            result = redis.zrange("zset1", 0, -1, withscores=True)
            self.assertEqual(result[0], ("m1", 1.0))

    def test_zcard(self):
        with mock_redis_client() as mock_client:
            mock_client.zcard.return_value = 5
            redis = make_redis()
            result = redis.zcard("zset1")
            self.assertEqual(result, 5)


class TestOperRedisBatch(unittest.TestCase):
    """批量操作测试"""

    def test_mset_serializes_values(self):
        with mock_redis_client() as mock_client:
            mock_client.mset.return_value = True
            redis = make_redis()
            redis.mset({"k1": "v1", "k2": {"a": 1}})
            args = mock_client.mset.call_args[0][0]
            self.assertEqual(args["k1"], "v1")
            self.assertEqual(json.loads(args["k2"]), {"a": 1})

    def test_mget_returns_dict(self):
        with mock_redis_client() as mock_client:
            mock_client.mget.return_value = [b"v1", json.dumps({"a": 1}).encode(), None]
            redis = make_redis()
            result = redis.mget("k1", "k2", "k3")
            self.assertIsInstance(result, dict)
            self.assertEqual(result.get("k1"), "v1")
            self.assertEqual(result.get("k2"), {"a": 1})
            self.assertIsNone(result.get("k3"))

    def test_delete_many_uses_pattern(self):
        with mock_redis_client() as mock_client:
            mock_client.keys.return_value = [b"k1", b"k2"]
            mock_client.delete.return_value = 2
            redis = make_redis()
            result = redis.delete_many("k*")
            mock_client.keys.assert_called_once_with("k*")
            mock_client.delete.assert_called_once_with(b"k1", b"k2")
            self.assertEqual(result, 2)

    def test_delete_many_no_matching_keys(self):
        with mock_redis_client() as mock_client:
            mock_client.keys.return_value = []
            redis = make_redis()
            result = redis.delete_many("no_match*")
            mock_client.delete.assert_not_called()
            self.assertEqual(result, 0)

    def test_ping(self):
        with mock_redis_client() as mock_client:
            mock_client.ping.return_value = True
            redis = make_redis()
            result = redis.ping()
            self.assertTrue(result)

    def test_dbsize(self):
        with mock_redis_client() as mock_client:
            mock_client.dbsize.return_value = 100
            redis = make_redis()
            result = redis.dbsize()
            self.assertEqual(result, 100)


if __name__ == "__main__":
    unittest.main()
